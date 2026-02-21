-- Trendy Wear ERP (Supabase Auth) - Schema + RLS
-- Run this in Supabase Dashboard → SQL Editor
--
-- This version uses Supabase Auth (auth.users) and a profile table (public.app_users)
-- for role/store permissions. Do NOT store passwords in your own tables.

-- 0) Extensions
create extension if not exists pgcrypto;

-- 1) Enums
do $$ begin
  create type public.user_role as enum ('admin', 'store');
exception when duplicate_object then null;
end $$;

-- 2) Timestamps helper
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ===================================================================
-- STORES
-- ===================================================================
create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  commission numeric(5,2) not null default 10.00,
  paid_amount numeric(12,2) not null default 0.00,
  paid boolean not null default false,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_stores_updated_at
before update on public.stores
for each row execute function public.set_updated_at();

-- ===================================================================
-- APP USERS (profile/permissions) - 1 row per Supabase Auth user
-- ===================================================================
create table if not exists public.app_users (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  role public.user_role not null,
  scope text,
  store_id uuid references public.stores(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scope_check check (scope is null or scope = 'all')
);

create trigger trg_app_users_updated_at
before update on public.app_users
for each row execute function public.set_updated_at();

-- Admins that can manage multiple stores (many-to-many)
create table if not exists public.app_user_managed_stores (
  user_id uuid not null references public.app_users(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, store_id)
);

-- ===================================================================
-- ACCOUNTS + SESSIONS (Custom username/password auth - Option C)
-- ===================================================================
-- This is a simple alternative to Supabase Auth.
-- Passwords must be stored as bcrypt hashes (never plaintext).

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  role public.user_role not null,
  scope text,
  store_id uuid references public.stores(id) on delete set null,
  managed_stores text[] not null default '{}'::text[],
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accounts_scope_check check (scope is null or scope = 'all')
);

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
-- Intentionally no RLS policies: access only from server using service role.

-- ===================================================================
-- CLIENTS
-- ===================================================================
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  payments_received numeric(12,2) not null default 0.00,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_clients_updated_at
before update on public.clients
for each row execute function public.set_updated_at();

-- ===================================================================
-- INVENTORY (master)
-- ===================================================================
create table if not exists public.inventory (
  id uuid primary key default gen_random_uuid(),
  product_name text not null,
  category text,
  brand text,
  size_options text[] not null default '{}',
  color_options text[] not null default '{}',
  other_variants jsonb not null default '{}'::jsonb,
  batch_number text not null unique,
  cost_price numeric(12,2) not null,
  selling_price numeric(12,2) not null default 0.00,
  quantity_available int not null default 0,
  low_stock_warning int not null default 5,
  -- Legacy field used by current UI filters (username)
  owner text,
  owner_user_id uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.inventory
  add column if not exists owner text;

create index if not exists idx_inventory_product_name on public.inventory(product_name);
create index if not exists idx_inventory_owner_user_id on public.inventory(owner_user_id);

create trigger trg_inventory_updated_at
before update on public.inventory
for each row execute function public.set_updated_at();

-- ===================================================================
-- PURCHASES
-- ===================================================================
create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid references public.inventory(id) on delete restrict,
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
  -- Legacy field used by current UI filters (username)
  owner text,
  owner_user_id uuid references public.app_users(id) on delete set null,
  purchased_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.purchases
  add column if not exists owner text;

create index if not exists idx_purchases_inventory_id on public.purchases(inventory_id);
create index if not exists idx_purchases_purchased_at on public.purchases(purchased_at);

-- ===================================================================
-- ORDERS
-- ===================================================================
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_code text not null unique,
  inventory_id uuid references public.inventory(id) on delete set null,
  store_id uuid not null references public.stores(id) on delete restrict,
  client_id uuid references public.clients(id) on delete set null,

  product_name text not null,
  quantity int not null,
  selling_price numeric(12,2) not null,
  shipment_cost numeric(12,2) not null default 0.00,
  client_name text,
  order_type text,
  occurred_at timestamptz not null default now(),

  included_in_payout boolean not null default false,
  commission_percent numeric(5,2) not null,
  cost_price numeric(12,2) not null,
  commission_amount numeric(12,2) not null,
  admin_take numeric(12,2) not null,
  profit numeric(12,2) not null,

  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_orders_store_id on public.orders(store_id);
create index if not exists idx_orders_occurred_at on public.orders(occurred_at);
create index if not exists idx_orders_included_in_payout on public.orders(included_in_payout);

create trigger trg_orders_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

-- ===================================================================
-- STORE INVENTORY (items assigned to a store)
-- ===================================================================
create table if not exists public.store_inventory (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  -- App uses storeName + productName (not batch) as the natural key
  product_name text not null,
  -- Optional link to a specific inventory row (batch) if you want it
  inventory_id uuid references public.inventory(id) on delete set null,
  owner_supply_price numeric(12,2) not null,
  commission_percent numeric(5,2) not null,
  store_selling_price numeric(12,2) not null default 0.00,
  quantity_assigned int not null default 0,
  quantity_remaining int not null default 0,
  -- Legacy field used by current UI filters (username)
  owner text,
  owner_user_id uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_store_inventory unique (store_id, product_name)
);

alter table public.store_inventory
  add column if not exists owner text;

create index if not exists idx_store_inventory_store_id on public.store_inventory(store_id);
create index if not exists idx_store_inventory_inventory_id on public.store_inventory(inventory_id);
create index if not exists idx_store_inventory_product_name on public.store_inventory(product_name);

create trigger trg_store_inventory_updated_at
before update on public.store_inventory
for each row execute function public.set_updated_at();

-- ===================================================================
-- EXPENSES
-- ===================================================================
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_code text unique,
  title text not null,
  amount numeric(12,2) not null,
  category text,
  occurred_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_expenses_occurred_at on public.expenses(occurred_at);
create index if not exists idx_expenses_category on public.expenses(category);

create trigger trg_expenses_updated_at
before update on public.expenses
for each row execute function public.set_updated_at();

-- ===================================================================
-- SETTINGS (key/value)
-- ===================================================================
create table if not exists public.settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- ===================================================================
-- AUDIT LOGS (optional)
-- ===================================================================
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid,
  action text not null check (action in ('INSERT','UPDATE','DELETE')),
  old_values jsonb,
  new_values jsonb,
  changed_by uuid references public.app_users(id) on delete set null,
  changed_at timestamptz not null default now()
);

-- ===================================================================
-- DEFAULT SETTINGS
-- ===================================================================
insert into public.settings(key, value)
values
  ('defaultCommission', to_jsonb(10)),
  ('lowStockThreshold', to_jsonb(5))
on conflict (key) do nothing;

create index if not exists idx_stores_paid on public.stores(paid);

-- (updated_at triggers already created above)

-- ===================================================================
-- RLS HELPERS
-- ===================================================================
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_users au
    where au.id = auth.uid()
      and au.role = 'admin'
      and au.is_active = true
  );
$$;

create or replace function public.current_store_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select au.store_id
  from public.app_users au
  where au.id = auth.uid()
    and au.is_active = true;
$$;

create or replace function public.can_manage_store(target_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_admin()
    and (
      exists (
        select 1
        from public.app_users au
        where au.id = auth.uid()
          and au.scope = 'all'
      )
      or exists (
        select 1
        from public.app_user_managed_stores ms
        where ms.user_id = auth.uid()
          and ms.store_id = target_store_id
      )
      or (public.current_store_id() = target_store_id)
    );
$$;

-- ===================================================================
-- ENABLE RLS
-- ===================================================================
alter table public.stores enable row level security;
alter table public.app_users enable row level security;
alter table public.app_user_managed_stores enable row level security;
alter table public.clients enable row level security;
alter table public.inventory enable row level security;
alter table public.purchases enable row level security;
alter table public.store_inventory enable row level security;
alter table public.orders enable row level security;
alter table public.expenses enable row level security;
alter table public.settings enable row level security;
alter table public.audit_logs enable row level security;

-- ===================================================================
-- POLICIES
-- ===================================================================

-- app_users: read self; admin can read all
drop policy if exists app_users_select on public.app_users;
create policy app_users_select
on public.app_users
for select
to authenticated
using (id = auth.uid() or public.is_admin());

-- app_users: update self only (keep role/store changes admin-only via API/service-role)
drop policy if exists app_users_update_self on public.app_users;
create policy app_users_update_self
on public.app_users
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- app_user_managed_stores: admin-only
drop policy if exists managed_stores_admin_all on public.app_user_managed_stores;
create policy managed_stores_admin_all
on public.app_user_managed_stores
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- stores: selectable if you are admin and can manage it, or you are that store user
drop policy if exists stores_select on public.stores;
create policy stores_select
on public.stores
for select
to authenticated
using (
  public.is_admin()
  or id = public.current_store_id()
  or exists (
    select 1
    from public.app_user_managed_stores ms
    where ms.user_id = auth.uid()
      and ms.store_id = stores.id
  )
);

-- stores write: admins only
drop policy if exists stores_admin_all on public.stores;
create policy stores_admin_all
on public.stores
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- clients: admins only (simple + safe)
drop policy if exists clients_admin_all on public.clients;
create policy clients_admin_all
on public.clients
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- inventory: admins only (master inventory)
drop policy if exists inventory_admin_all on public.inventory;
create policy inventory_admin_all
on public.inventory
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- purchases: admins only
drop policy if exists purchases_admin_all on public.purchases;
create policy purchases_admin_all
on public.purchases
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- store_inventory: selectable by admin managers or store user; writable by admin managers
drop policy if exists store_inventory_select on public.store_inventory;
create policy store_inventory_select
on public.store_inventory
for select
to authenticated
using (
  public.is_admin()
  or store_id = public.current_store_id()
  or exists (
    select 1
    from public.app_user_managed_stores ms
    where ms.user_id = auth.uid()
      and ms.store_id = store_inventory.store_id
  )
);

drop policy if exists store_inventory_admin_write on public.store_inventory;
create policy store_inventory_admin_write
on public.store_inventory
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- store_inventory: store users can update their own store rows (e.g. selling price)
drop policy if exists store_inventory_store_update on public.store_inventory;
create policy store_inventory_store_update
on public.store_inventory
for update
to authenticated
using (store_id = public.current_store_id())
with check (store_id = public.current_store_id());

-- orders: admins read all; store user reads own store; managed-admin reads managed stores
drop policy if exists orders_select on public.orders;
create policy orders_select
on public.orders
for select
to authenticated
using (
  public.is_admin()
  or store_id = public.current_store_id()
  or exists (
    select 1
    from public.app_user_managed_stores ms
    where ms.user_id = auth.uid()
      and ms.store_id = orders.store_id
  )
);

-- orders: store user can insert/update only for their store and only their own created rows
drop policy if exists orders_store_insert on public.orders;
create policy orders_store_insert
on public.orders
for insert
to authenticated
with check (
  store_id = public.current_store_id()
  and created_by = auth.uid()
);

drop policy if exists orders_store_update on public.orders;
create policy orders_store_update
on public.orders
for update
to authenticated
using (
  store_id = public.current_store_id()
  and created_by = auth.uid()
)
with check (
  store_id = public.current_store_id()
  and created_by = auth.uid()
);

-- orders: admins can write all
drop policy if exists orders_admin_write on public.orders;
create policy orders_admin_write
on public.orders
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- expenses: admins only
drop policy if exists expenses_admin_all on public.expenses;
create policy expenses_admin_all
on public.expenses
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- settings: admins only
drop policy if exists settings_admin_all on public.settings;
create policy settings_admin_all
on public.settings
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- audit_logs: admins only
drop policy if exists audit_logs_admin_all on public.audit_logs;
create policy audit_logs_admin_all
on public.audit_logs
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- ===================================================================
-- GRANTS (required if you query from the browser using anon/auth keys)
-- Note: RLS still applies; GRANTs only remove "permission denied".
-- ===================================================================

grant usage on schema public to authenticated;

grant select, insert, update, delete on table
  public.stores,
  public.app_users,
  public.app_user_managed_stores,
  public.clients,
  public.inventory,
  public.purchases,
  public.store_inventory,
  public.orders,
  public.expenses,
  public.settings,
  public.audit_logs
to authenticated;

grant execute on function
  public.is_admin(),
  public.current_store_id(),
  public.can_manage_store(uuid),
  public.set_updated_at()
to authenticated;

-- ===================================================================
-- NOTES
-- ===================================================================
-- 1) Create users in Supabase Auth.
-- 2) Insert rows into public.app_users linking auth.users(id) to a role/store.
-- 3) For “managed stores” admins, insert rows into public.app_user_managed_stores.