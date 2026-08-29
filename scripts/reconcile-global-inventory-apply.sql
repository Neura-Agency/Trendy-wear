-- Global inventory reconciliation APPLY. Run only after the DRY RUN is reviewed.
begin;
create table if not exists public.global_inventory_reconciliation (
  store_inventory_id uuid primary key,
  inventory_id uuid not null,
  original_quantity_remaining integer not null,
  applied_at timestamptz not null default now()
);
with candidates as (
  select si.id store_inventory_id, si.inventory_id,
         greatest(0,coalesce(si.quantity_remaining,0)) remaining
  from public.store_inventory si
  join public.inventory i on i.id=si.inventory_id
  where greatest(0,coalesce(si.quantity_remaining,0)) > 0
), inserted as (
  insert into public.global_inventory_reconciliation(store_inventory_id,inventory_id,original_quantity_remaining)
  select store_inventory_id,inventory_id,remaining from candidates
  on conflict (store_inventory_id) do nothing
  returning store_inventory_id,inventory_id,original_quantity_remaining
)
update public.inventory i
set quantity_available=i.quantity_available+r.original_quantity_remaining, updated_at=now()
from inserted r where i.id=r.inventory_id;
update public.store_inventory si
set quantity_remaining=0, size_quantities_remaining=null,
    color_quantities_remaining=null, variant_quantities_remaining=null, updated_at=now()
where exists (select 1 from public.global_inventory_reconciliation r where r.store_inventory_id=si.id);
commit;
