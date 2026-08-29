-- Historical order backfill for the global inventory model.
-- Non-destructive: only fills orders.inventory_id where the existing
-- store_inventory_id -> inventory_id relationship is explicit.
-- Do NOT manufacture multi-batch allocation rows from this relationship alone.

begin;

-- Review the candidate set before enabling the UPDATE below.
select
  o.id as order_id,
  o.order_code,
  o.store_inventory_id,
  si.inventory_id,
  o.inventory_id as current_inventory_id
from public.orders o
join public.store_inventory si on si.id=o.store_inventory_id
where o.inventory_id is null
  and si.inventory_id is not null;

-- Safe backfill of the direct historical relationship.
update public.orders o
set inventory_id = si.inventory_id
from public.store_inventory si
where o.store_inventory_id = si.id
  and o.inventory_id is null
  and si.inventory_id is not null;

-- No historical order_inventory_allocations are created here. A store-inventory
-- pointer does not prove that a historical order consumed only one batch.

commit;
