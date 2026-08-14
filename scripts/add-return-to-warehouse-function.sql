-- Return to Main Store - Atomic stock-return function
-- Moves ONLY the user-selected color/size quantities from store_inventory back to
-- main inventory (warehouse batch). Runs in ONE transaction with row-level locks.
--
-- Params:
--   p_store_inventory_id : store_inventory allotment row id
--   p_variant_quantities : {color:{size:qty}} (authoritative when present)
--   p_size_quantities    : {size:qty} rollup
--   p_color_quantities   : {color:qty} rollup
--   p_return_qty         : total quantity to return (sum of selection)
--
-- Raises exceptions that the API maps to HTTP errors:
--   ALLOTMENT_NOT_FOUND, INVENTORY_NOT_FOUND, ZERO_RETURN,
--   EXCEEDS_TOTAL, EXCEEDS ... , MISMATCH
--
-- Also decrements quantity_assigned and the size/color/variant *_quantities_assigned
-- breakdowns so those columns always hold the CURRENT allocation (returned units are
-- netted out). returned_to_warehouse_qty keeps the cumulative counter.

-- Ensure the cumulative audit column exists (idempotent; the API/UI reads it back).
alter table public.store_inventory
  add column if not exists returned_to_warehouse_qty integer default 0;

create or replace function public.return_to_warehouse(
  p_store_inventory_id uuid,
  p_variant_quantities jsonb default null,
  p_size_quantities jsonb default null,
  p_color_quantities jsonb default null,
  p_return_qty int default 0
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_si public.store_inventory%rowtype;
  v_inv public.inventory%rowtype;
  v_total int := 0;
  v_has_variant boolean;
  v_vrem jsonb;
  v_srem jsonb;
  v_crem jsonb;
  v_pv jsonb;
  v_ps jsonb;
  v_pc jsonb;
  v_vinv jsonb;
  v_sinv jsonb;
  v_cinv jsonb;
  v_sizes jsonb := '{}'::jsonb;   -- derived (variant mode) or supplied (size mode) rollup
  v_colors jsonb := '{}'::jsonb;  -- derived (variant mode) or supplied (color mode) rollup
  v_vasgn jsonb;  -- CURRENT (net of returns) variant_quantities_assigned
  v_sasgn jsonb;  -- CURRENT size_quantities_assigned
  v_casgn jsonb;  -- CURRENT color_quantities_assigned
  r record;
  s2 record;
  c text;
  sz text;
  cur int;
  avail int;
begin
  -- Lock the store allotment first (serializes concurrent returns/edits on this row)
  select * into v_si from public.store_inventory where id = p_store_inventory_id for update;
  if not found then
    raise exception 'ALLOTMENT_NOT_FOUND';
  end if;

  -- Lock the linked main inventory row BEFORE reading its JSONB (lock ordering)
  if v_si.inventory_id is not null then
    select * into v_inv from public.inventory where id = v_si.inventory_id for update;
    if not found then
      raise exception 'INVENTORY_NOT_FOUND';
    end if;
  end if;

  -- Working copies built ONLY from the locked rows (no stale reads)
  v_vrem := coalesce(v_si.variant_quantities_remaining, '{}'::jsonb);
  v_srem := coalesce(v_si.size_quantities_remaining, '{}'::jsonb);
  v_crem := coalesce(v_si.color_quantities_remaining, '{}'::jsonb);
  v_pv   := coalesce(v_si.pending_return_variant_quantities, '{}'::jsonb);
  v_ps   := coalesce(v_si.pending_return_size_quantities, '{}'::jsonb);
  v_pc   := coalesce(v_si.pending_return_color_quantities, '{}'::jsonb);
  v_vinv := coalesce(v_inv.variant_quantities, '{}'::jsonb);
  v_sinv := coalesce(v_inv.size_quantities, '{}'::jsonb);
  v_cinv := coalesce(v_inv.color_quantities, '{}'::jsonb);
  v_vasgn := coalesce(v_si.variant_quantities_assigned, '{}'::jsonb);
  v_sasgn := coalesce(v_si.size_quantities_assigned, '{}'::jsonb);
  v_casgn := coalesce(v_si.color_quantities_assigned, '{}'::jsonb);

  v_has_variant := p_variant_quantities is not null and p_variant_quantities <> 'null'::jsonb;

  if v_has_variant then
    -- Variant mode: authoritative per color+size. Validate + modify variant cells, then
    -- DERIVE size/color rollups + total from THIS selection (not from supplied rollups).
    for r in select * from jsonb_each(p_variant_quantities) loop
      c := r.key;
      for s2 in select * from jsonb_each(r.value) loop
        sz := s2.key;
        cur := (s2.value #>> '{}')::int;
        if cur is null or cur <= 0 then continue; end if;
        avail := coalesce((v_vrem #>> array[c, sz])::int, 0);
        if cur > avail then
          raise exception 'EXCEEDS %,%: requested %, available %', c, sz, cur, avail;
        end if;
        v_vrem := jsonb_set(v_vrem, array[c, sz], to_jsonb(avail - cur), true);
        v_vinv := jsonb_set(v_vinv, array[c, sz], to_jsonb(coalesce((v_vinv #>> array[c, sz])::int, 0) + cur), true);
        if (v_pv ? c) and (v_pv -> c ? sz) then
          v_pv := jsonb_set(v_pv, array[c, sz], to_jsonb(greatest(0, coalesce((v_pv #>> array[c, sz])::int, 0) - cur)), true);
        end if;
        v_sizes := jsonb_set(v_sizes, array[sz], to_jsonb(coalesce((v_sizes #>> array[sz])::int, 0) + cur), true);
        v_colors := jsonb_set(v_colors, array[c], to_jsonb(coalesce((v_colors #>> array[c])::int, 0) + cur), true);
        -- Net the CURRENT assigned cell so *_assigned stays the active allocation
        v_vasgn := jsonb_set(v_vasgn, array[c, sz], to_jsonb(greatest(0, coalesce((v_vasgn #>> array[c, sz])::int, 0) - cur)), true);
        v_total := v_total + cur;
      end loop;
    end loop;

    -- Keep store + main size/color rollups synchronized with the DERIVED totals (already validated)
    for r in select * from jsonb_each(v_sizes) loop
      sz := r.key; cur := (r.value #>> '{}')::int;
      if cur is null or cur <= 0 then continue; end if;
      v_srem := jsonb_set(v_srem, array[sz], to_jsonb(greatest(0, coalesce((v_srem #>> array[sz])::int, 0) - cur)), true);
      v_sinv := jsonb_set(v_sinv, array[sz], to_jsonb(coalesce((v_sinv #>> array[sz])::int, 0) + cur), true);
      v_sasgn := jsonb_set(v_sasgn, array[sz], to_jsonb(greatest(0, coalesce((v_sasgn #>> array[sz])::int, 0) - cur)), true);
      if v_ps ? sz then
        v_ps := jsonb_set(v_ps, array[sz], to_jsonb(greatest(0, coalesce((v_ps #>> array[sz])::int, 0) - cur)), true);
      end if;
    end loop;
    for r in select * from jsonb_each(v_colors) loop
      c := r.key; cur := (r.value #>> '{}')::int;
      if cur is null or cur <= 0 then continue; end if;
      v_crem := jsonb_set(v_crem, array[c], to_jsonb(greatest(0, coalesce((v_crem #>> array[c])::int, 0) - cur)), true);
      v_cinv := jsonb_set(v_cinv, array[c], to_jsonb(coalesce((v_cinv #>> array[c])::int, 0) + cur), true);
      v_casgn := jsonb_set(v_casgn, array[c], to_jsonb(greatest(0, coalesce((v_casgn #>> array[c])::int, 0) - cur)), true);
      if v_pc ? c then
        v_pc := jsonb_set(v_pc, array[c], to_jsonb(greatest(0, coalesce((v_pc #>> array[c])::int, 0) - cur)), true);
      end if;
    end loop;

  elsif p_size_quantities is not null and p_size_quantities <> 'null'::jsonb then
    -- Size-only mode: supplied rollup is authoritative per size; validate + apply
    v_sizes := p_size_quantities;
    for r in select * from jsonb_each(v_sizes) loop
      sz := r.key; cur := (r.value #>> '{}')::int;
      if cur is null or cur <= 0 then continue; end if;
      avail := coalesce((v_srem #>> array[sz])::int, 0);
      if cur > avail then raise exception 'EXCEEDS %: requested %, available %', sz, cur, avail; end if;
      v_srem := jsonb_set(v_srem, array[sz], to_jsonb(avail - cur), true);
      v_sinv := jsonb_set(v_sinv, array[sz], to_jsonb(coalesce((v_sinv #>> array[sz])::int, 0) + cur), true);
      v_sasgn := jsonb_set(v_sasgn, array[sz], to_jsonb(greatest(0, coalesce((v_sasgn #>> array[sz])::int, 0) - cur)), true);
      if v_ps ? sz then
        v_ps := jsonb_set(v_ps, array[sz], to_jsonb(greatest(0, coalesce((v_ps #>> array[sz])::int, 0) - cur)), true);
      end if;
      v_total := v_total + cur;
    end loop;

  elsif p_color_quantities is not null and p_color_quantities <> 'null'::jsonb then
    -- Color-only mode: supplied rollup is authoritative per color; validate + apply
    v_colors := p_color_quantities;
    for r in select * from jsonb_each(v_colors) loop
      c := r.key; cur := (r.value #>> '{}')::int;
      if cur is null or cur <= 0 then continue; end if;
      avail := coalesce((v_crem #>> array[c])::int, 0);
      if cur > avail then raise exception 'EXCEEDS %: requested %, available %', c, cur, avail; end if;
      v_crem := jsonb_set(v_crem, array[c], to_jsonb(avail - cur), true);
      v_cinv := jsonb_set(v_cinv, array[c], to_jsonb(coalesce((v_cinv #>> array[c])::int, 0) + cur), true);
      v_casgn := jsonb_set(v_casgn, array[c], to_jsonb(greatest(0, coalesce((v_casgn #>> array[c])::int, 0) - cur)), true);
      if v_pc ? c then
        v_pc := jsonb_set(v_pc, array[c], to_jsonb(greatest(0, coalesce((v_pc #>> array[c])::int, 0) - cur)), true);
      end if;
      v_total := v_total + cur;
    end loop;

  else
    raise exception 'ZERO_RETURN';
  end if;

  -- Authoritative total validation (Postgres is the final authority, not the caller)
  if v_total <= 0 then raise exception 'ZERO_RETURN'; end if;
  if v_total > coalesce(v_si.quantity_remaining, 0) then
    raise exception 'EXCEEDS_TOTAL requested % available %', v_total, v_si.quantity_remaining;
  end if;
  if p_return_qty is not null and p_return_qty <> v_total then
    raise exception 'MISMATCH supplied % calculated %', p_return_qty, v_total;
  end if;

  -- Persist store allotment (decrease) - variant + size + color + pending + returned counter in sync
  update public.store_inventory set
    quantity_remaining = greatest(0, coalesce(v_si.quantity_remaining, 0) - v_total),
    quantity_assigned = greatest(0, coalesce(v_si.quantity_assigned, 0) - v_total),
    returned_to_warehouse_qty = coalesce(v_si.returned_to_warehouse_qty, 0) + v_total,
    variant_quantities_remaining = case when v_has_variant then v_vrem else v_si.variant_quantities_remaining end,
    size_quantities_remaining = case when v_sizes <> '{}'::jsonb then v_srem else v_si.size_quantities_remaining end,
    color_quantities_remaining = case when v_colors <> '{}'::jsonb then v_crem else v_si.color_quantities_remaining end,
    pending_return_qty = greatest(0, coalesce(v_si.pending_return_qty, 0) - v_total),
    pending_return_variant_quantities = case when v_has_variant then v_pv else v_si.pending_return_variant_quantities end,
    pending_return_size_quantities = case when v_sizes <> '{}'::jsonb then v_ps else v_si.pending_return_size_quantities end,
    pending_return_color_quantities = case when v_colors <> '{}'::jsonb then v_pc else v_si.pending_return_color_quantities end,
    variant_quantities_assigned = case when v_has_variant then v_vasgn else v_si.variant_quantities_assigned end,
    size_quantities_assigned = case when v_sizes <> '{}'::jsonb then v_sasgn else v_si.size_quantities_assigned end,
    color_quantities_assigned = case when v_colors <> '{}'::jsonb then v_casgn else v_si.color_quantities_assigned end
  where id = v_si.id;

  -- Persist main inventory (already locked) - increase
  if v_si.inventory_id is not null then
    update public.inventory set
      quantity_available = coalesce(v_inv.quantity_available, 0) + v_total,
      variant_quantities = case when v_has_variant then v_vinv else v_inv.variant_quantities end,
      size_quantities = case when v_sizes <> '{}'::jsonb then v_sinv else v_inv.size_quantities end,
      color_quantities = case when v_colors <> '{}'::jsonb then v_cinv else v_inv.color_quantities end
    where id = v_inv.id;
  end if;

  return jsonb_build_object('returned', v_total);
end;
$$;
-- =============================================================
-- One-time backfill (run once AFTER creating the function above; SAFE to re-run).
-- Rows created before this fix kept quantity_assigned as the CUMULATIVE ever-assigned
-- total (returns were recorded only in quantity_remaining and returned_to_warehouse_qty).
-- The updated function treats the *_assigned columns as the CURRENT allocation, so we
-- normalize existing rows to the same invariant.
--
-- The CURRENT allocation is reconstructed from ground truth that survives any return:
--     current allocation = quantity_remaining  +  kept_sold
-- where kept_sold = sum(orders.quantity - orders.return_quantity) per store_inventory row
-- (units customers actually kept). This does NOT rely on returned_to_warehouse_qty, which
-- predates the old returns and is not trustworthy for every environment.
--
-- We only touch rows whose quantity_assigned still disagrees with that reconstruction
-- (i.e. rows still in legacy cumulative state). Already-correct rows are left untouched.
-- =============================================================
begin;

update public.store_inventory si
set quantity_assigned = greatest(0, si.quantity_remaining + coalesce(ks.kept_sold, 0))
from (
  select store_inventory_id,
         sum(greatest(0, quantity - coalesce(return_quantity, 0))) as kept_sold
  from public.orders
  where store_inventory_id is not null
  group by store_inventory_id
) ks
where si.id = ks.store_inventory_id
  and si.quantity_assigned <> greatest(0, si.quantity_remaining + ks.kept_sold);

-- Any legacy row with NO orders had kept_sold = 0; its current allocation is exactly its
-- remaining stock. Reconcile those too (covers fully-returned rows where remaining = 0).
update public.store_inventory
set quantity_assigned = greatest(0, quantity_remaining)
where quantity_assigned <> greatest(0, quantity_remaining)
  and quantity_assigned > 0
  and not exists (select 1 from public.orders o where o.store_inventory_id = public.store_inventory.id);

-- A fully returned allotment has zero current allocation: clear stale breakdowns so
-- Details/Edit no longer show the pre-return color/size/variant grid.
-- (Partially-returned historical rows are NOT auto-netted per-key here; total was
-- reconciled above and their per-color/size/variant breakdowns should be rebuilt from
-- each order's variant/size/color_quantities -= return_* quantities if tracking matters.)
update public.store_inventory
set variant_quantities_assigned = null,
    size_quantities_assigned = null,
    color_quantities_assigned = null
where coalesce(quantity_assigned, 0) <= 0
  and coalesce(quantity_remaining, 0) <= 0
  and (variant_quantities_assigned is not null or size_quantities_assigned is not null or color_quantities_assigned is not null);

commit;
-- =============================================================
-- POST-CHECK (report; not auto-fixed): rows whose *_assigned breakdown totals still do
-- not equal quantity_assigned (legacy partially-returned rows). Review manually:
--   select id, quantity_assigned, size_quantities_assigned
--   from public.store_inventory
--   where ... breakdown-sum <> quantity_assigned ...;
-- =============================================================