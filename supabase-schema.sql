-- Trendy Wear ERP (Supabase) — Schema for current app
--
-- This schema is designed to match the existing Next.js UI + API routes in this repo.
-- Auth model in this repo (current): username/password stored in public.accounts + cookie sessions in public.sessions.
--
-- Core business tables (your requested model):
-- - store_owners, stores, products, inventory, store_inventory, orders
--
-- Support tables required by current screens/APIs:
-- - purchases (warehouse entry history)
-- - expenses (dashboard + PDF report)
-- - clients (clients section)
-- - settings (defaultCommission + lowStockThreshold)
-- - audit_logs (optional, used by /api/reset)
--
-- Notes on RLS:
-- - API routes use SUPABASE_SERVICE_ROLE_KEY (service role) and therefore bypass RLS.
-- - We enable RLS on business tables but do not create policies here (client-side access denied by default).

create extension if not exists pgcrypto;

-- 1) Enums
do $$ begin
  create type public.user_role as enum ('admin', 'store');
exception when duplicate_object then null;
end $$;

-- 2) updated_at helper
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =========================================================
-- AUTH TABLES (KEEP THESE)
-- =========================================================
-- Accounts + sessions are used by pages/api/auth.ts + lib/api/session.ts

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  role public.user_role not null,
  scope text,
  store_id uuid,
  managed_stores text[] not null default '{}'::text[],
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accounts_scope_check check (scope is null or scope = 'all')
);

drop trigger if exists trg_accounts_updated_at on public.accounts;
create trigger trg_accounts_updated_at
before update on public.accounts
for each row execute function public.set_updated_at();

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  user_agent text,
  ip text
);

create index if not exists idx_sessions_account_id on public.sessions(account_id);
create index if not exists idx_sessions_expires_at on public.sessions(expires_at);

alter table public.accounts enable row level security;
alter table public.sessions enable row level security;
-- Intentionally no policies: API uses service role.

-- =========================================================
-- CORE BUSINESS TABLES (6)
-- =========================================================

-- 1) Store owners
create table if not exists public.store_owners (
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

-- 2) Stores
create table if not exists public.stores (
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

create index if not exists idx_stores_paid on public.stores(paid);
create index if not exists idx_stores_owner_id on public.stores(owner_id);

drop trigger if exists trg_stores_updated_at on public.stores;
create trigger trg_stores_updated_at
before update on public.stores
for each row execute function public.set_updated_at();

-- Link accounts.store_id to stores
do $$ begin
  alter table public.accounts
    add constraint accounts_store_id_fk
    foreign key (store_id) references public.stores(id)
    on delete set null;
exception when duplicate_object then null;
end $$;

-- 3) Products
create table if not exists public.products (
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
  constraint uq_products_name_brand_type unique (product_name, brand_name, product_type)
);

alter table if exists public.products drop constraint if exists uq_products_name_brand;

do $$ begin
  alter table public.products
    add constraint uq_products_name_brand_type unique (product_name, brand_name, product_type);
exception when duplicate_object then null;
end $$;

drop trigger if exists trg_products_updated_at on public.products;
create trigger trg_products_updated_at
before update on public.products
for each row execute function public.set_updated_at();

create index if not exists idx_products_name on public.products(product_name);

-- 4) Inventory (warehouse batches) — matches pages/api/purchases.ts
create table if not exists public.inventory (
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
  size_quantities jsonb,
  color_quantities jsonb,
  low_stock_warning int not null default 5,

  owner text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_inventory_product_name on public.inventory(product_name);
create index if not exists idx_inventory_product_id on public.inventory(product_id);

drop trigger if exists trg_inventory_updated_at on public.inventory;
create trigger trg_inventory_updated_at
before update on public.inventory
for each row execute function public.set_updated_at();

-- 5) Store inventory (allotted lots) — matches pages/api/storeInventory.ts
create table if not exists public.store_inventory (
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
  size_quantities_assigned jsonb,
  size_quantities_remaining jsonb,
  color_quantities_assigned jsonb,
  color_quantities_remaining jsonb,

  owner text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint uq_store_inventory unique (store_id, product_name)
);

create index if not exists idx_store_inventory_store_id on public.store_inventory(store_id);
create index if not exists idx_store_inventory_product_name on public.store_inventory(product_name);
create index if not exists idx_store_inventory_product_id on public.store_inventory(product_id);

drop trigger if exists trg_store_inventory_updated_at on public.store_inventory;
create trigger trg_store_inventory_updated_at
before update on public.store_inventory
for each row execute function public.set_updated_at();

-- 6) Orders (sales) — matches pages/api/orders.ts and PDF report
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_code text not null unique,

  store_id uuid not null references public.stores(id) on delete restrict,
  client_id uuid,

  product_id uuid references public.products(id) on delete set null,
  inventory_id uuid references public.inventory(id) on delete set null,
  store_inventory_id uuid references public.store_inventory(id) on delete set null,

  product_name text not null,
  quantity int not null,
  size text,
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

create index if not exists idx_orders_store_id on public.orders(store_id);
create index if not exists idx_orders_occurred_at on public.orders(occurred_at);
create index if not exists idx_orders_included_in_payout on public.orders(included_in_payout);

drop trigger if exists trg_orders_updated_at on public.orders;
create trigger trg_orders_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

-- =========================================================
-- SUPPORT TABLES (required by current app)
-- =========================================================

-- Clients (used by pages/api/clients.ts)
create table if not exists public.clients (
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

-- Add FK now that clients exists
do $$ begin
  alter table public.orders
    add constraint orders_client_id_fk
    foreign key (client_id) references public.clients(id)
    on delete set null;
exception when duplicate_object then null;
end $$;

-- Purchases (used by pages/api/purchases.ts)
create table if not exists public.purchases (
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

create index if not exists idx_purchases_inventory_id on public.purchases(inventory_id);
create index if not exists idx_purchases_purchased_at on public.purchases(purchased_at);

-- Expenses (used by pages/api/expenses.ts and PDF report)
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_code text unique,
  title text not null,
  amount numeric(12,2) not null,
  category text,
  expense_date date,
  paid_by_owner_id uuid references public.owners(id) on delete set null,
  from_acc text,
  expense_type text,
  occurred_at timestamptz not null default now(),
  created_by uuid references public.accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_expenses_occurred_at on public.expenses(occurred_at);
create index if not exists idx_expenses_category on public.expenses(category);
create index if not exists idx_expenses_paid_by_owner_id on public.expenses(paid_by_owner_id);

drop trigger if exists trg_expenses_updated_at on public.expenses;
create trigger trg_expenses_updated_at
before update on public.expenses
for each row execute function public.set_updated_at();

-- Settings (used by lib/api/supabaseHelpers.ts)
create table if not exists public.settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.settings(key, value)
values
  ('defaultCommission', to_jsonb(10)),
  ('lowStockThreshold', to_jsonb(5))
on conflict (key) do nothing;

-- Optional audit log table (used only by /api/reset cleanup in this repo)
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid,
  action text not null check (action in ('INSERT','UPDATE','DELETE')),
  old_values jsonb,
  new_values jsonb,
  changed_by uuid references public.accounts(id) on delete set null,
  changed_at timestamptz not null default now()
);

-- =========================================================
-- RLS: lock down business tables by default
-- =========================================================
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

-- No policies added: access via server using SUPABASE_SERVICE_ROLE_KEY.
