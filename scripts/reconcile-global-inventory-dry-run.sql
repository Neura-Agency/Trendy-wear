-- Global inventory migration reconciliation — DRY RUN ONLY.
-- This file intentionally performs NO writes.

with legacy as (
  select
    si.id as store_inventory_id,
    si.inventory_id,
    si.store_id,
    si.product_name,
    coalesce(si.quantity_remaining,0) as remaining_legacy
  from public.store_inventory si
), grouped as (
  select inventory_id, sum(remaining_legacy) as remaining_allocated
  from legacy
  where inventory_id is not null
  group by inventory_id
)
select
  i.id as inventory_id,
  i.batch_number,
  i.product_name,
  coalesce(i.quantity_available,0) as current_global_available,
  coalesce(g.remaining_allocated,0) as remaining_legacy_store_allocation,
  coalesce(i.quantity_available,0) + coalesce(g.remaining_allocated,0) as expected_global_available_after_migration,
  case when coalesce(i.quantity_available,0) < 0 then 'NEGATIVE_GLOBAL_STOCK' end as negative_global_stock,
  case when g.inventory_id is null then null else 'LEGACY_ALLOCATION_PRESENT' end as allocation_status
from public.inventory i
left join grouped g on g.inventory_id=i.id
order by i.created_at asc, i.id asc;

-- Invalid/unmatched legacy references.
select
  si.id as store_inventory_id,
  si.store_id,
  si.product_name,
  si.inventory_id,
  si.quantity_remaining
from public.store_inventory si
left join public.inventory i on i.id=si.inventory_id
where si.inventory_id is null or i.id is null
order by si.created_at asc, si.id asc;

-- Negative legacy quantities.
select id, store_id, product_name, quantity_remaining
from public.store_inventory
where coalesce(quantity_remaining,0) < 0;
