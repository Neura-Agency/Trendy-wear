-- Trendy Wear ERP (Supabase)
-- One-time rebuild script to fix legacy/mismatched tables while KEEPING public.accounts + public.sessions.
--
-- Use when you see errors like:
-- - PGRST205: Could not find the table 'public.expenses' in the schema cache
-- - 42703: column stores.id does not exist
--
-- WARNING:
-- - This DROPS and recreates business tables (stores/inventory/orders/etc).
-- - It preserves ONLY login data in public.accounts and public.sessions.
-- - If you have important sales/inventory data already in Supabase, STOP and ask for a migration script instead.

begin;

-- 0) Detach accounts from stores (if previously linked)
alter table if exists public.accounts drop constraint if exists accounts_store_id_fk;
update public.accounts set store_id = null;

-- 1) Drop business/support tables (safe order; CASCADE cleans dependent objects)
drop table if exists public.audit_logs cascade;
drop table if exists public.expenses cascade;
drop table if exists public.purchases cascade;
drop table if exists public.orders cascade;
drop table if exists public.store_inventory cascade;
drop table if exists public.inventory cascade;
drop table if exists public.products cascade;
drop table if exists public.clients cascade;
drop table if exists public.settings cascade;
drop table if exists public.stores cascade;
drop table if exists public.store_owners cascade;

-- 2) Helpers
do $$ begin
  create extension if not exists pgcrypto;
exception when insufficient_privilege then null;
end $$;

do $$ begin
  create type public.user_role as enum ('admin', 'store');
exception when duplicate_object then null;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 3) Core tables
create table public.store_owners (
  id uuid primary key default gen_random_uuid(),
  owner_name text not null,
  contact text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_store_owners_owner_name unique (owner_name)
);

drop trigger if exists trg_store_owners_updated_at on public.store_owners;
create trigger trg_store_owners_updated_at
before update on public.store_owners
for each row execute function public.set_updated_at();

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  store_code text,
  owner_id uuid references public.store_owners(id) on delete set null,

  commission numeric(5,2) not null default 10.00,
  paid_amount numeric(12,2) not null default 0.00,
  paid boolean not null default false,
  paid_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_stores_updated_at on public.stores;
create trigger trg_stores_updated_at
before update on public.stores
for each row execute function public.set_updated_at();

-- Relink accounts.store_id -> stores.id (accounts table must already have store_id uuid)
do $$ begin
  alter table public.accounts
    add constraint accounts_store_id_fk
    foreign key (store_id) references public.stores(id)
    on delete set null;
exception when duplicate_object then null;
end $$;

create table public.products (
  id uuid primary key default gen_random_uuid(),
  product_name text not null,
  brand_name text,
  product_type text,
  price_per_piece numeric(12,2) not null default 0.00,
  total_qty int not null default 0,
  colors text[] not null default '{}'::text[],
  sizes text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_products_name_brand unique (product_name, brand_name)
);

drop trigger if exists trg_products_updated_at on public.products;
create trigger trg_products_updated_at
before update on public.products
for each row execute function public.set_updated_at();

create table public.inventory (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete set null,

  product_name text not null,
  category text,
  brand text,

  size_options text[] not null default '{}',
  color_options text[] not null default '{}',
  other_variants jsonb not null default '{}'::jsonb,

  batch_number text not null unique,
  cost_price numeric(12,2) not null default 0.00,
  selling_price numeric(12,2) not null default 0.00,
  quantity_available int not null default 0,
  low_stock_warning int not null default 5,

  owner text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_inventory_updated_at on public.inventory;
create trigger trg_inventory_updated_at
before update on public.inventory
for each row execute function public.set_updated_at();

create table public.store_inventory (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,

  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  inventory_id uuid references public.inventory(id) on delete set null,

  owner_supply_price numeric(12,2) not null default 0.00,
  commission_percent numeric(5,2) not null default 0.00,
  store_selling_price numeric(12,2) not null default 0.00,
  quantity_assigned int not null default 0,
  quantity_remaining int not null default 0,

  owner text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint uq_store_inventory unique (store_id, product_name)
);

drop trigger if exists trg_store_inventory_updated_at on public.store_inventory;
create trigger trg_store_inventory_updated_at
before update on public.store_inventory
for each row execute function public.set_updated_at();

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_code text not null unique,

  store_id uuid not null references public.stores(id) on delete restrict,
  client_id uuid,

  product_id uuid references public.products(id) on delete set null,
  inventory_id uuid references public.inventory(id) on delete set null,
  store_inventory_id uuid references public.store_inventory(id) on delete set null,

  product_name text not null,
  quantity int not null,
  selling_price numeric(12,2) not null,
  shipment_cost numeric(12,2) not null default 0.00,
  client_name text,
  order_type text,
  occurred_at timestamptz not null default now(),

  included_in_payout boolean not null default false,
  commission_percent numeric(5,2) not null default 0.00,
  cost_price numeric(12,2) not null default 0.00,
  commission_amount numeric(12,2) not null default 0.00,
  admin_take numeric(12,2) not null default 0.00,
  profit numeric(12,2) not null default 0.00,

  created_by uuid references public.accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_orders_updated_at on public.orders;
create trigger trg_orders_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

-- 4) Support tables
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  payments_received numeric(12,2) not null default 0.00,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_clients_updated_at on public.clients;
create trigger trg_clients_updated_at
before update on public.clients
for each row execute function public.set_updated_at();

do $$ begin
  alter table public.orders
    add constraint orders_client_id_fk
    foreign key (client_id) references public.clients(id)
    on delete set null;
exception when duplicate_object then null;
end $$;

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid references public.inventory(id) on delete restrict,
  product_id uuid references public.products(id) on delete set null,

  product_name text not null,
  category text,
  brand text,
  size_options text[] not null default '{}',
  color_options text[] not null default '{}',
  other_variants jsonb not null default '{}'::jsonb,

  batch_number text not null,
  cost_price numeric(12,2) not null,
  selling_price numeric(12,2) not null default 0.00,
  quantity int not null,
  low_stock_warning int not null default 5,
  owner text,

  purchased_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_code text unique,
  title text not null,
  amount numeric(12,2) not null,
  category text,
  occurred_at timestamptz not null default now(),
  created_by uuid references public.accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_expenses_updated_at on public.expenses;
create trigger trg_expenses_updated_at
before update on public.expenses
for each row execute function public.set_updated_at();

create table public.settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.settings(key, value)
values
  ('defaultCommission', to_jsonb(10)),
  ('lowStockThreshold', to_jsonb(5))
on conflict (key) do nothing;

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid,
  action text not null check (action in ('INSERT','UPDATE','DELETE')),
  old_values jsonb,
  new_values jsonb,
  changed_by uuid references public.accounts(id) on delete set null,
  changed_at timestamptz not null default now()
);

-- 5) RLS enabled, policies intentionally omitted (API uses service role)
alter table public.store_owners enable row level security;
alter table public.stores enable row level security;
alter table public.products enable row level security;
alter table public.inventory enable row level security;
alter table public.store_inventory enable row level security;
alter table public.orders enable row level security;
alter table public.clients enable row level security;
alter table public.purchases enable row level security;
alter table public.expenses enable row level security;
alter table public.settings enable row level security;
alter table public.audit_logs enable row level security;

commit;

-- If you still see PGRST205 for a minute or two, reload PostgREST schema cache:
-- In Supabase Dashboard: Settings -> API -> "Reload schema"
-- Or try: notify pgrst, 'reload schema';
