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
  created_at timestamptz not null default now(),
  constraint order_inventory_allocations_positive_units check (quantity + bonus_quantity > 0)
);
create index if not exists idx_order_inventory_allocations_order on public.order_inventory_allocations(order_id);
create index if not exists idx_order_inventory_allocations_inventory on public.order_inventory_allocations(inventory_id);

alter table public.orders
  add column if not exists extra_qty integer not null default 0;

alter table public.order_inventory_allocations
  add column if not exists returned_quantity integer not null default 0;

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
create or replace function public.process_global_order_return(p_payload jsonb)
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
begin
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

revoke all on function public.process_global_order_return(jsonb) from public;
grant execute on function public.process_global_order_return(jsonb) to service_role;

-- Undo the most recent physical return, reversing the exact allocation batches.
create or replace function public.undo_global_order_return(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
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
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception using errcode='P0001', message='ORDER_NOT_FOUND'; end if;
  v_remaining := greatest(0,coalesce(v_order.return_quantity,0));
  if v_remaining < 1 then raise exception using errcode='P0001', message='ORDER_HAS_NO_RETURN'; end if;

  for v_row in
    select id, inventory_id, returned_quantity
    from public.order_inventory_allocations
    where order_id=p_order_id and returned_quantity > 0
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

revoke all on function public.undo_global_order_return(uuid) from public;
grant execute on function public.undo_global_order_return(uuid) to service_role;
