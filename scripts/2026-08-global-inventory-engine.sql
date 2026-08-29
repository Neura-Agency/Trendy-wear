-- Global shared inventory migration / transaction engine
-- Apply this script to the target Supabase database before enabling the new sale API.

create table if not exists public.order_inventory_allocations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  inventory_id uuid not null references public.inventory(id) on delete restrict,
  quantity integer not null default 0 check (quantity >= 0),
  bonus_quantity integer not null default 0 check (bonus_quantity >= 0),
  returned_quantity integer not null default 0 check (returned_quantity >= 0),
  unit_cost numeric(12,2) not null default 0,
  variant_quantities jsonb,
  allocation_type text not null default 'sale' check (allocation_type in ('sale','replacement')),
  created_at timestamptz not null default now(),
  constraint order_inventory_allocations_positive_units check (quantity + bonus_quantity > 0)
);
create index if not exists idx_order_inventory_allocations_order on public.order_inventory_allocations(order_id);
create index if not exists idx_order_inventory_allocations_inventory on public.order_inventory_allocations(inventory_id);

alter table public.orders
  add column if not exists extra_qty integer not null default 0;

alter table public.order_inventory_allocations
  add column if not exists returned_quantity integer not null default 0;

alter table public.order_inventory_allocations
  add column if not exists allocation_type text not null default 'sale';

create table if not exists public.order_replacement_restock_allocations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  inventory_id uuid not null references public.inventory(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now()
);
create index if not exists idx_order_replacement_restock_order on public.order_replacement_restock_allocations(order_id);

create table if not exists public.inventory_sale_idempotency (
  request_key text primary key,
  order_id uuid not null references public.orders(id) on delete restrict,
  created_at timestamptz not null default now()
);

insert into public.settings(key, value)
values ('inventoryEngineVersion', to_jsonb(2))
on conflict (key) do nothing;

create or replace function public.sell_from_inventory(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_key text := nullif(trim(p_payload->>'request_key'), '');
  v_engine_version integer := coalesce((p_payload->>'engine_version')::integer, 0);
  v_deployed_version integer;
  v_store_id uuid := nullif(p_payload->>'store_id','')::uuid;
  v_product_id uuid := nullif(p_payload->>'product_id','')::uuid;
  v_product_name text := trim(coalesce(p_payload->>'product_name',''));
  v_quantity integer := greatest(0, coalesce((p_payload->>'quantity')::integer,0));
  v_bonus integer := greatest(0, coalesce((p_payload->>'extra_qty')::integer,0));
  v_total integer := v_quantity + v_bonus;
  v_price numeric := coalesce((p_payload->>'selling_price')::numeric,0);
  v_deductions numeric := greatest(0, coalesce((p_payload->>'shipment_cost')::numeric,0) + coalesce((p_payload->>'extra_charges')::numeric,0));
  v_client text := nullif(p_payload->>'client_name','');
  v_order_type text := coalesce(nullif(p_payload->>'order_type',''),'Sale');
  v_occurred_at timestamptz := coalesce((p_payload->>'occurred_at')::timestamptz, now());
  v_order_code text := nullif(trim(p_payload->>'order_code'),'');
  v_store_name text;
  v_commission numeric(5,2);
  v_commission_amount numeric;
  v_gross numeric;
  v_admin_take numeric;
  v_cost_sold numeric := 0;
  v_cost_physical numeric := 0;
  v_available integer := 0;
  v_remaining integer;
  v_remaining_sold integer;
  v_remaining_bonus integer;
  v_order_id uuid;
  v_created_by uuid := nullif(p_payload->>'created_by','')::uuid;
  v_existing_order uuid;
  v_primary_inventory_id uuid;
  v_row record;
  v_take integer;
  v_bonus_take integer;
  v_sold_take integer;
  v_code text;
begin
  if v_engine_version = 0 then
    raise exception using errcode='P0001', message='INVENTORY_ENGINE_VERSION_REQUIRED';
  end if;

  select case
    when jsonb_typeof(value) = 'number' then (value #>> '{}')::integer
    when jsonb_typeof(value) = 'string' then trim(both '"' from value::text)::integer
    else null
  end into v_deployed_version
  from public.settings where key='inventoryEngineVersion';

  if v_deployed_version is null or v_deployed_version <> v_engine_version then
    raise exception using errcode='P0001', message=format('INVENTORY_ENGINE_VERSION_MISMATCH: app=%s db=%s',v_engine_version,coalesce(v_deployed_version,-1));
  end if;
  if v_request_key is null then raise exception using errcode='P0001', message='SALE_REQUEST_KEY_REQUIRED'; end if;
  if v_store_id is null then raise exception using errcode='P0001', message='STORE_ID_REQUIRED'; end if;
  if v_quantity < 1 then raise exception using errcode='P0001', message='QUANTITY_MUST_BE_AT_LEAST_ONE'; end if;
  if v_price <= 0 then raise exception using errcode='P0001', message='SELLING_PRICE_MUST_BE_POSITIVE'; end if;

  select order_id into v_existing_order
  from public.inventory_sale_idempotency
  where request_key=v_request_key;
  if v_existing_order is not null then
    select order_code into v_code from public.orders where id=v_existing_order;
    return jsonb_build_object('success',true,'duplicate',true,'order_id',v_existing_order,'order_code',v_code);
  end if;

  select name, commission into v_store_name, v_commission
  from public.stores where id=v_store_id for share;
  if v_store_name is null then raise exception using errcode='P0001', message='STORE_NOT_FOUND'; end if;

  if v_product_id is null then
    select id into v_product_id from public.products where product_name=v_product_name order by id limit 1;
  end if;
  if v_product_id is null then raise exception using errcode='P0001', message='PRODUCT_NOT_FOUND'; end if;

  -- Phase 1: deterministic FIFO locks and an all-or-nothing stock check.
  for v_row in
    select id, quantity_available, cost_price
    from public.inventory
    where product_id=v_product_id and quantity_available > 0
    order by created_at asc, id asc
    for update
  loop
    exit when v_available >= v_total;
    v_take := least(v_row.quantity_available, v_total-v_available);
    if v_available < v_quantity then
      v_cost_sold := v_cost_sold + (v_row.cost_price * least(v_take, v_quantity-v_available));
    end if;
    v_cost_physical := v_cost_physical + (v_row.cost_price * v_take);
    if v_primary_inventory_id is null then
      v_primary_inventory_id := v_row.id;
    end if;
    v_available := v_available + v_take;
  end loop;

  if v_available < v_total then
    raise exception using errcode='P0001', message=format('INSUFFICIENT_GLOBAL_STOCK: available=%s requested=%s',v_available,v_total);
  end if;

  v_gross := v_price * v_quantity;
  v_commission_amount := round((v_gross-v_deductions) * v_commission / 100, 2);
  v_admin_take := (v_gross-v_deductions) - v_commission_amount;
  if v_order_code is null then
    v_order_code := 'ORD-' || upper(substr(md5(gen_random_uuid()::text),1,12));
  end if;

  insert into public.orders(
    order_code,store_id,product_id,inventory_id,store_inventory_id,product_name,quantity,size_quantities,color_quantities,variant_quantities,
    selling_price,shipment_cost,client_name,order_type,occurred_at,included_in_payout,
    commission_percent,cost_price,commission_amount,admin_take,profit,extra_qty,created_by
  ) values (
    v_order_code,v_store_id,v_product_id,v_primary_inventory_id,null,v_product_name,v_quantity,
    p_payload->'size_quantities',p_payload->'color_quantities',p_payload->'variant_quantities',
    v_price,v_deductions,v_client,v_order_type,v_occurred_at,false,v_commission,
    case when v_quantity > 0 then round(v_cost_sold/v_quantity,2) else 0 end,
    v_commission_amount,v_admin_take-v_cost_physical,v_bonus,v_created_by
  ) returning id into v_order_id;

  -- Phase 2: consume the same locked FIFO set and record exact sold/bonus quantities.
  -- Every physically consumed unit contributes to COGS. Bonus units are still free
  -- revenue-wise, but they are real stock movements and therefore remain in COGS.
  v_remaining := v_total;
  v_remaining_sold := v_quantity;
  v_remaining_bonus := v_bonus;
  for v_row in
    select id, quantity_available, cost_price
    from public.inventory
    where product_id=v_product_id and quantity_available > 0
    order by created_at asc, id asc
    for update
  loop
    exit when v_remaining <= 0;
    v_take := least(v_row.quantity_available, v_remaining);
    v_sold_take := least(v_remaining_sold, v_take);
    v_bonus_take := v_take - v_sold_take;

    update public.inventory
    set quantity_available = quantity_available - v_take,
        updated_at = now()
    where id=v_row.id and quantity_available >= v_take;
    if not found then
      raise exception using errcode='P0001', message='INVENTORY_CONCURRENT_UPDATE';
    end if;

    insert into public.order_inventory_allocations(
      order_id, inventory_id, quantity, bonus_quantity, unit_cost, variant_quantities
    ) values (
      v_order_id, v_row.id, v_sold_take, v_bonus_take, v_row.cost_price,
      case when v_row.id = v_primary_inventory_id then p_payload->'variant_quantities' else null end
    );

    v_remaining := v_remaining - v_take;
    v_remaining_sold := v_remaining_sold - v_sold_take;
    v_remaining_bonus := v_remaining_bonus - v_bonus_take;
  end loop;

  if v_remaining > 0 or v_remaining_sold > 0 or v_remaining_bonus > 0 then
    raise exception using errcode='P0001', message='INVENTORY_DEDUCTION_INCOMPLETE';
  end if;

  insert into public.inventory_sale_idempotency(request_key, order_id)
  values(v_request_key, v_order_id);

  return jsonb_build_object(
    'success',true,'duplicate',false,'order_id',v_order_id,'order_code',v_order_code,
    'store_name',v_store_name,'commission_percent',v_commission
  );
exception when unique_violation then
  select order_id into v_existing_order from public.inventory_sale_idempotency where request_key=v_request_key;
  if v_existing_order is not null then
    select order_code into v_code from public.orders where id=v_existing_order;
    return jsonb_build_object('success',true,'duplicate',true,'order_id',v_existing_order,'order_code',v_code);
  end if;
  raise;
end;
$$;

revoke all on function public.sell_from_inventory(jsonb) from public;
grant execute on function public.sell_from_inventory(jsonb) to service_role;

-- Atomically return physical units to the exact batches previously consumed by an order.
-- Partial returns consume allocation quantities oldest-first; undoing a return reverses
-- that movement from the same allocations. This keeps COGS/batch traceability intact.
create or replace function public.return_order_to_global_inventory(
  p_order_id uuid,
  p_return_qty integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $
declare
  v_remaining integer := greatest(0, coalesce(p_return_qty,0));
  v_returned integer := 0;
  v_row record;
  v_take integer;
begin
  if v_remaining < 1 then
    raise exception using errcode='P0001', message='RETURN_QUANTITY_MUST_BE_POSITIVE';
  end if;

  for v_row in
    select id, inventory_id, quantity, bonus_quantity, returned_quantity
    from public.order_inventory_allocations
    where order_id = p_order_id
      and (quantity + bonus_quantity - returned_quantity) > 0
    order by created_at asc, id asc
    for update
  loop
    exit when v_remaining <= 0;
    v_take := least(
      v_row.quantity + v_row.bonus_quantity - v_row.returned_quantity,
      v_remaining
    );

    update public.inventory
    set quantity_available = quantity_available + v_take,
        updated_at = now()
    where id = v_row.inventory_id;

    if not found then
      raise exception using errcode='P0001', message='INVENTORY_BATCH_NOT_FOUND';
    end if;

    update public.order_inventory_allocations
    set returned_quantity = returned_quantity + v_take
    where id = v_row.id;

    v_remaining := v_remaining - v_take;
    v_returned := v_returned + v_take;
  end loop;

  if v_remaining > 0 then
    raise exception using errcode='P0001', message=format('RETURN_EXCEEDS_SOLD_ALLOCATION: remaining=%s',v_remaining);
  end if;

  return jsonb_build_object('returned', v_returned);
end;
$;

revoke all on function public.return_order_to_global_inventory(uuid, integer) from public;
grant execute on function public.return_order_to_global_inventory(uuid, integer) to service_role;




-- Full order-return transaction: inventory movement and order financial state commit together.
create or replace function public.process_global_order_return(p_payload jsonb, p_engine_version integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_qty integer;
  v_already integer;
  v_remaining integer;
  v_new_return integer;
  v_gross numeric;
  v_commission numeric;
  v_admin numeric;
  v_profit numeric;
  v_result jsonb;
  v_deployed_version integer;
begin
  select case when jsonb_typeof(value)='number' then (value #>> '{}')::integer when jsonb_typeof(value)='string' then trim(both '"' from value::text)::integer else null end into v_deployed_version
  from public.settings where key='inventoryEngineVersion';
  if p_engine_version=0 or v_deployed_version is null or v_deployed_version<>p_engine_version then raise exception using errcode='P0001', message=format('INVENTORY_ENGINE_VERSION_MISMATCH: app=%s db=%s',p_engine_version,coalesce(v_deployed_version,-1)); end if;

  select * into v_order
  from public.orders
  where id = nullif(p_payload->>'order_id','')::uuid
  for update;

  if not found then raise exception using errcode='P0001', message='ORDER_NOT_FOUND'; end if;

  v_already := greatest(0, coalesce(v_order.return_quantity,0));
  v_remaining := greatest(0, v_order.quantity - v_already);
  v_qty := least(greatest(0, coalesce((p_payload->>'return_quantity')::integer, v_remaining)), v_remaining);
  if v_qty < 1 then raise exception using errcode='P0001', message='RETURN_QUANTITY_MUST_BE_POSITIVE'; end if;

  v_result := public.return_order_to_global_inventory(v_order.id, v_qty);
  v_new_return := v_already + v_qty;
  v_gross := v_order.selling_price * greatest(0, v_order.quantity - v_new_return) - v_order.shipment_cost;
  v_commission := round(greatest(0,v_gross) * coalesce(v_order.commission_percent,0) / 100, 2);
  v_admin := greatest(0,v_gross) - v_commission;
  v_profit := v_admin - coalesce(v_order.cost_price,0) * greatest(0,v_order.quantity - v_new_return);

  update public.orders
  set order_returned = (v_new_return >= v_order.quantity),
      profit = greatest(0,v_profit),
      admin_take = greatest(0,v_admin),
      commission_amount = greatest(0,v_commission),
      return_quantity = v_new_return,
      return_reason = nullif(p_payload->>'return_reason',''),
      return_size_quantities = p_payload->'return_size_quantities',
      return_color_quantities = p_payload->'return_color_quantities',
      return_variant_quantities = p_payload->'return_variant_quantities',
      returned_at = now(),
      return_proof_url = nullif(p_payload->>'return_proof_url','')
  where id = v_order.id;

  return jsonb_build_object('success',true,'returned',v_qty,'order_id',v_order.id);
end;
$$;

revoke all on function public.process_global_order_return(jsonb, integer) from public;
grant execute on function public.process_global_order_return(jsonb, integer) to service_role;

-- Undo the most recent physical return, reversing the exact allocation batches.
create or replace function public.undo_global_order_return(p_order_id uuid, p_engine_version integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_deployed_version integer;
  v_remaining integer;
  v_row record;
  v_take integer;
  v_undone integer := 0;
  v_new_return integer;
  v_gross numeric;
  v_commission numeric;
  v_admin numeric;
  v_profit numeric;
begin
  select case when jsonb_typeof(value)='number' then (value #>> '{}')::integer when jsonb_typeof(value)='string' then trim(both '"' from value::text)::integer else null end into v_deployed_version from public.settings where key='inventoryEngineVersion';
  if p_engine_version=0 or v_deployed_version is null or v_deployed_version<>p_engine_version then raise exception using errcode='P0001', message=format('INVENTORY_ENGINE_VERSION_MISMATCH: app=%s db=%s',p_engine_version,coalesce(v_deployed_version,-1)); end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception using errcode='P0001', message='ORDER_NOT_FOUND'; end if;
  v_remaining := greatest(0,coalesce(v_order.return_quantity,0));
  if v_remaining < 1 then raise exception using errcode='P0001', message='ORDER_HAS_NO_RETURN'; end if;

  for v_row in
    select id, inventory_id, returned_quantity
    from public.order_inventory_allocations
    where order_id=p_order_id and allocation_type = 'sale' and returned_quantity > 0
    order by created_at desc, id desc
    for update
  loop
    exit when v_remaining <= 0;
    v_take := least(v_row.returned_quantity,v_remaining);
    update public.inventory
    set quantity_available = quantity_available - v_take,
        updated_at = now()
    where id=v_row.inventory_id and quantity_available >= v_take;
    if not found then raise exception using errcode='P0001', message='UNDO_RETURN_INSUFFICIENT_GLOBAL_STOCK'; end if;
    update public.order_inventory_allocations
    set returned_quantity = returned_quantity - v_take
    where id=v_row.id;
    v_remaining := v_remaining - v_take;
    v_undone := v_undone + v_take;
  end loop;

  if v_remaining > 0 then raise exception using errcode='P0001', message='RETURN_ALLOCATION_NOT_FOUND'; end if;

  v_new_return := greatest(0,coalesce(v_order.return_quantity,0)-v_undone);
  v_gross := v_order.selling_price * greatest(0,v_order.quantity-v_new_return) - v_order.shipment_cost;
  v_commission := round(greatest(0,v_gross) * coalesce(v_order.commission_percent,0) / 100, 2);
  v_admin := greatest(0,v_gross)-v_commission;
  v_profit := v_admin - coalesce(v_order.cost_price,0)*greatest(0,v_order.quantity-v_new_return);

  update public.orders
  set order_returned=false,
      return_quantity=case when v_new_return=0 then null else v_new_return end,
      return_reason=case when v_new_return=0 then null else return_reason end,
      return_size_quantities=case when v_new_return=0 then null else return_size_quantities end,
      return_color_quantities=case when v_new_return=0 then null else return_color_quantities end,
      return_variant_quantities=case when v_new_return=0 then null else return_variant_quantities end,
      returned_at=case when v_new_return=0 then null else returned_at end,
      return_proof_url=case when v_new_return=0 then null else return_proof_url end,
      profit=greatest(0,v_profit),
      admin_take=greatest(0,v_admin),
      commission_amount=greatest(0,v_commission)
  where id=p_order_id;

  return jsonb_build_object('success',true,'undone',v_undone,'order_id',p_order_id);
end;
$$;

revoke all on function public.undo_global_order_return(uuid, integer) from public;
grant execute on function public.undo_global_order_return(uuid, integer) to service_role;


-- Restock the physical original item for a replacement without changing the order's
-- normal return counters. The replacement flow keeps its own refund metadata.
create or replace function public.restock_order_original_for_replacement(
  p_order_id uuid,
  p_quantity integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining integer := greatest(0,coalesce(p_quantity,0));
  v_total integer := 0;
  v_row record;
  v_take integer;
begin
  if v_remaining < 1 then raise exception using errcode='P0001', message='RESTOCK_QUANTITY_MUST_BE_POSITIVE'; end if;

  for v_row in
    select id, inventory_id, quantity, bonus_quantity, returned_quantity
    from public.order_inventory_allocations
    where order_id=p_order_id
    order by created_at desc, id desc
    for update
  loop
    exit when v_remaining <= 0;
    -- Prefer sold units; bonus units are also physical stock and may be used if needed.
    v_take := least(v_remaining, greatest(0,v_row.quantity+v_row.bonus_quantity-v_row.returned_quantity));
    if v_take > 0 then
      update public.inventory
      set quantity_available=quantity_available+v_take, updated_at=now()
      where id=v_row.inventory_id;
      if not found then raise exception using errcode='P0001', message='INVENTORY_BATCH_NOT_FOUND'; end if;
      v_remaining := v_remaining-v_take;
      v_total := v_total+v_take;
    end if;
  end loop;

  if v_remaining > 0 then raise exception using errcode='P0001', message='RESTOCK_ALLOCATION_NOT_FOUND'; end if;
  return jsonb_build_object('success',true,'restocked',v_total);
end;
$$;

revoke all on function public.restock_order_original_for_replacement(uuid, integer) from public;
grant execute on function public.restock_order_original_for_replacement(uuid, integer) to service_role;


-- Transactional financial refund + global replacement engine.
create or replace function public.process_global_refund(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_engine_version integer := coalesce((p_payload->>'engine_version')::integer,0);
  v_deployed_version integer;
  v_method text := coalesce(nullif(p_payload->>'refund_type',''),'quantity');
  v_ref_qty integer;
  v_original_qty integer;
  v_returned_qty integer;
  v_refunded_qty integer;
  v_remaining_qty integer;
  v_fixed_amount numeric := greatest(0,coalesce((p_payload->>'fixed_amount')::numeric,0));
  v_new_refund_qty integer;
  v_refund_amount numeric := 0;
  v_replacement_qty integer := greatest(1,coalesce((p_payload->>'replacement_quantity')::integer,1));
  v_replacement_product_id uuid := nullif(p_payload->>'replacement_product_id','')::uuid;
  v_replacement_cost numeric := 0;
  v_replacement_remaining integer;
  v_row record;
  v_take integer;
  v_restock_remaining integer;
  v_gross numeric;
  v_commission numeric;
  v_admin numeric;
  v_profit numeric;
begin
  select case when jsonb_typeof(value)='number' then (value #>> '{}')::integer
              when jsonb_typeof(value)='string' then trim(both '"' from value::text)::integer
              else null end
    into v_deployed_version
  from public.settings where key='inventoryEngineVersion';

  if v_engine_version = 0 or v_deployed_version is null or v_deployed_version <> v_engine_version then
    raise exception using errcode='P0001', message=format('INVENTORY_ENGINE_VERSION_MISMATCH: app=%s db=%s',v_engine_version,coalesce(v_deployed_version,-1));
  end if;

  select * into v_order
  from public.orders
  where id = nullif(p_payload->>'order_id','')::uuid
  for update;
  if not found then raise exception using errcode='P0001', message='ORDER_NOT_FOUND'; end if;

  v_original_qty := greatest(0,coalesce(v_order.quantity,0));
  v_returned_qty := greatest(0,coalesce(v_order.return_quantity,0));
  v_refunded_qty := greatest(0,coalesce(v_order.refund_quantity,0));
  v_remaining_qty := greatest(0,v_original_qty-v_returned_qty-v_refunded_qty);
  if v_remaining_qty < 1 then raise exception using errcode='P0001', message='NO_REMAINING_UNITS'; end if;

  if v_method = 'amount' then
    if v_fixed_amount <= 0 then raise exception using errcode='P0001', message='FIXED_REFUND_AMOUNT_REQUIRED'; end if;
    v_ref_qty := least(v_remaining_qty, greatest(1,coalesce((p_payload->>'refund_quantity')::integer,v_remaining_qty)));
  elsif v_method = 'replacement' then
    if v_replacement_product_id is null then raise exception using errcode='P0001', message='REPLACEMENT_PRODUCT_REQUIRED'; end if;
    v_ref_qty := least(v_remaining_qty, greatest(1,coalesce((p_payload->>'refund_quantity')::integer,1)));
  else
    v_ref_qty := least(v_remaining_qty, greatest(1,coalesce((p_payload->>'refund_quantity')::integer,v_remaining_qty)));
  end if;
  if v_ref_qty < 1 then raise exception using errcode='P0001', message='REFUND_QUANTITY_MUST_BE_POSITIVE'; end if;

  v_new_refund_qty := v_refunded_qty + v_ref_qty;

  -- Replacement stock is deducted under the same transaction and exact FIFO batches
  -- are recorded as replacement allocations for COGS/auditability.
  if v_method = 'replacement' then
    v_replacement_remaining := v_replacement_qty;
    for v_row in
      select id, quantity_available, cost_price
      from public.inventory
      where product_id=v_replacement_product_id and quantity_available > 0
      order by created_at asc, id asc
      for update
    loop
      exit when v_replacement_remaining <= 0;
      v_take := least(v_row.quantity_available,v_replacement_remaining);

      update public.inventory
      set quantity_available=quantity_available-v_take, updated_at=now()
      where id=v_row.id and quantity_available >= v_take;
      if not found then raise exception using errcode='P0001', message='INVENTORY_CONCURRENT_UPDATE'; end if;

      insert into public.order_inventory_allocations(
        order_id, inventory_id, quantity, bonus_quantity, unit_cost, allocation_type
      ) values (
        v_order.id, v_row.id, v_take, 0, v_row.cost_price, 'replacement'
      );

      v_replacement_cost := v_replacement_cost + v_row.cost_price*v_take;
      v_replacement_remaining := v_replacement_remaining-v_take;
    end loop;

    if v_replacement_remaining > 0 then
      raise exception using errcode='P0001', message=format('INSUFFICIENT_GLOBAL_STOCK: replacement_available=%s replacement_requested=%s',v_replacement_qty-v_replacement_remaining,v_replacement_qty);
    end if;

    -- Scenario A: original item physically returned. Restore the original sale
    -- allocations atomically and remember the exact batches so undo is reversible.
    if coalesce((p_payload->>'original_item_returned')::boolean,false) then
      v_restock_remaining := v_ref_qty;
      for v_row in
        select id, inventory_id, quantity, bonus_quantity, returned_quantity
        from public.order_inventory_allocations
        where order_id=v_order.id and allocation_type='sale'
          and (quantity+bonus_quantity-returned_quantity) > 0
        order by created_at desc, id desc
        for update
      loop
        exit when v_restock_remaining <= 0;
        v_take := least(v_restock_remaining, v_row.quantity+v_row.bonus_quantity-v_row.returned_quantity);
        update public.inventory set quantity_available=quantity_available+v_take, updated_at=now()
        where id=v_row.inventory_id;
        if not found then raise exception using errcode='P0001', message='INVENTORY_BATCH_NOT_FOUND'; end if;
        insert into public.order_replacement_restock_allocations(order_id,inventory_id,quantity)
        values(v_order.id,v_row.inventory_id,v_take);
        v_restock_remaining := v_restock_remaining-v_take;
      end loop;
      if v_restock_remaining > 0 then
        raise exception using errcode='P0001', message='RESTOCK_ALLOCATION_NOT_FOUND';
      end if;
    end if;
  end if;

  if v_method='amount' then
    v_refund_amount := coalesce(v_order.refund_amount,0)+v_fixed_amount;
  elsif v_method='replacement' then
    v_refund_amount := 0;
  else
    v_refund_amount := coalesce(v_order.refund_amount,0)+v_order.selling_price*v_ref_qty;
  end if;

  v_gross := v_order.selling_price * greatest(0,v_original_qty-v_returned_qty)
             - v_order.shipment_cost
             - case when v_method='amount' then v_fixed_amount else 0 end;
  if v_method='quantity' then
    v_gross := v_order.selling_price * greatest(0,v_original_qty-v_returned_qty-v_new_refund_qty)
               - v_order.shipment_cost;
  end if;

  v_commission := round(greatest(0,v_gross)*coalesce(v_order.commission_percent,0)/100,2);
  v_admin := greatest(0,v_gross)-v_commission;

  if v_method='replacement' and coalesce((p_payload->>'original_item_returned')::boolean,false) then
    v_profit := v_admin - coalesce(v_order.cost_price,0)*greatest(0,v_original_qty-v_returned_qty-v_new_refund_qty) - v_replacement_cost;
  elsif v_method='replacement' then
    v_profit := v_admin - coalesce(v_order.cost_price,0)*greatest(0,v_original_qty-v_returned_qty) - v_replacement_cost;
  else
    v_profit := v_admin - coalesce(v_order.cost_price,0)*greatest(0,v_original_qty-v_returned_qty);
  end if;

  update public.orders
  set profit=greatest(0,v_profit),
      admin_take=greatest(0,v_admin),
      commission_amount=greatest(0,v_commission),
      refund_quantity=v_new_refund_qty,
      refund_amount=v_refund_amount,
      refund_type=v_method,
      replacement_item=case when v_method='replacement' then nullif(p_payload->>'replacement_item','') else null end,
      replacement_product_id=case when v_method='replacement' then v_replacement_product_id else null end,
      replacement_quantity=case when v_method='replacement' then v_replacement_qty else null end,
      replacement_size=case when v_method='replacement' then nullif(p_payload->>'replacement_size','') else null end,
      replacement_color=case when v_method='replacement' then nullif(p_payload->>'replacement_color','') else null end,
      original_item_returned=case when v_method='replacement' then coalesce((p_payload->>'original_item_returned')::boolean,false) else null end,
      refund_reason=case when v_method='replacement' then concat('Replacement: ',coalesce(nullif(p_payload->>'replacement_item',''),'Replacement')) else nullif(p_payload->>'refund_reason','') end,
      refund_size_quantities=p_payload->'refund_size_quantities',
      refund_color_quantities=p_payload->'refund_color_quantities',
      refund_variant_quantities=p_payload->'refund_variant_quantities',
      refunded_at=now(),
      refund_proof_url=nullif(p_payload->>'refund_proof_url','')
  where id=v_order.id;

  return jsonb_build_object(
    'success',true,
    'refund_amount',v_refund_amount,
    'replacement_cost_total',v_replacement_cost,
    'replacement_consumed_inventory_ids',coalesce((select jsonb_agg(inventory_id) from public.order_inventory_allocations where order_id=v_order.id and allocation_type='replacement'), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.process_global_refund(jsonb) from public;
grant execute on function public.process_global_refund(jsonb) to service_role;

-- Reverse a refund/replacement atomically.
create or replace function public.undo_global_refund(p_order_id uuid, p_engine_version integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_deployed_version integer;
  v_row record;
  v_restored integer := 0;
  v_gross numeric;
  v_commission numeric;
  v_admin numeric;
  v_profit numeric;
begin
  select case when jsonb_typeof(value)='number' then (value #>> '{}')::integer
              when jsonb_typeof(value)='string' then trim(both '"' from value::text)::integer
              else null end
    into v_deployed_version
  from public.settings where key='inventoryEngineVersion';
  if p_engine_version=0 or v_deployed_version is null or v_deployed_version<>p_engine_version then
    raise exception using errcode='P0001', message=format('INVENTORY_ENGINE_VERSION_MISMATCH: app=%s db=%s',p_engine_version,coalesce(v_deployed_version,-1));
  end if;

  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception using errcode='P0001', message='ORDER_NOT_FOUND'; end if;
  if coalesce(v_order.refund_quantity,0) < 1 then raise exception using errcode='P0001', message='NO_REFUND_TO_UNDO'; end if;

  -- Remove replacement stock from the exact batches that were returned to the pool.
  for v_row in
    select id, inventory_id, quantity
    from public.order_inventory_allocations
    where order_id=p_order_id and allocation_type='replacement'
    order by created_at desc, id desc
    for update
  loop
    update public.inventory
    set quantity_available=quantity_available-v_row.quantity, updated_at=now()
    where id=v_row.inventory_id and quantity_available>=v_row.quantity;
    if not found then raise exception using errcode='P0001', message='INSUFFICIENT_GLOBAL_STOCK'; end if;
    v_restored := v_restored+v_row.quantity;
    delete from public.order_inventory_allocations where id=v_row.id;
  end loop;

  -- Reverse Scenario-A original-item restock using the exact recorded batches.
  for v_row in
    select id, inventory_id, quantity
    from public.order_replacement_restock_allocations
    where order_id=p_order_id
    order by created_at desc, id desc
    for update
  loop
    update public.inventory
    set quantity_available=quantity_available-v_row.quantity, updated_at=now()
    where id=v_row.inventory_id and quantity_available>=v_row.quantity;
    if not found then raise exception using errcode='P0001', message='INSUFFICIENT_GLOBAL_STOCK'; end if;
    delete from public.order_replacement_restock_allocations where id=v_row.id;
  end loop;

  v_gross := v_order.selling_price*greatest(0,v_order.quantity-coalesce(v_order.return_quantity,0))-v_order.shipment_cost;
  v_commission := round(greatest(0,v_gross)*coalesce(v_order.commission_percent,0)/100,2);
  v_admin := greatest(0,v_gross)-v_commission;
  v_profit := v_admin-coalesce(v_order.cost_price,0)*greatest(0,v_order.quantity-coalesce(v_order.return_quantity,0));

  update public.orders
  set profit=greatest(0,v_profit),
      admin_take=greatest(0,v_admin),
      commission_amount=greatest(0,v_commission),
      refund_quantity=null,
      refund_amount=null,
      refund_type=null,
      replacement_item=null,
      replacement_product_id=null,
      replacement_quantity=null,
      replacement_size=null,
      replacement_color=null,
      original_item_returned=null,
      refund_reason=null,
      refund_size_quantities=null,
      refund_color_quantities=null,
      refund_variant_quantities=null,
      refunded_at=null,
      refund_proof_url=null
  where id=p_order_id;

  return jsonb_build_object('success',true,'restored',v_restored);
end;
$$;

revoke all on function public.undo_global_refund(uuid, integer) from public;
grant execute on function public.undo_global_refund(uuid, integer) to service_role;
