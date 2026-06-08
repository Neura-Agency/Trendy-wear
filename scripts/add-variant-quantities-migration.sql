-- Add color x size stock tracking while keeping legacy flat rollups.

alter table public.inventory
  add column if not exists variant_quantities jsonb;

alter table public.store_inventory
  add column if not exists variant_quantities_assigned jsonb,
  add column if not exists variant_quantities_remaining jsonb,
  add column if not exists pending_return_variant_quantities jsonb;

alter table public.orders
  add column if not exists variant_quantities jsonb,
  add column if not exists return_variant_quantities jsonb;

comment on column public.inventory.variant_quantities is
  'Nested JSONB stock by color and size, e.g. {"red":{"M":3,"L":2}}. size_quantities/color_quantities are rollups.';
comment on column public.store_inventory.variant_quantities_assigned is
  'Nested JSONB initially allotted to a store by color and size.';
comment on column public.store_inventory.variant_quantities_remaining is
  'Nested JSONB remaining in a store by color and size.';
comment on column public.orders.variant_quantities is
  'Nested JSONB sold in an order by color and size.';
comment on column public.orders.return_variant_quantities is
  'Nested JSONB returned from an order by color and size.';
comment on column public.store_inventory.pending_return_variant_quantities is
  'Nested JSONB of returned store stock awaiting warehouse return by color and size.';
