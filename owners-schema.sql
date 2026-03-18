-- ============================================================
-- Trendy Wear — Owners & Profit-Split Schema
-- Run this in the Supabase SQL editor (once)
-- ============================================================

-- ─────────────────────────────────────────────
-- 1) OWNERS  (Bilal, Yahya, Hammad)
--    Each row = one business partner.
--    profit_share_percent should sum to 100 across active owners.
-- ─────────────────────────────────────────────
create table if not exists public.owners (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null unique,
  phone                text,
  email                text,
  profit_share_percent numeric(5,2) not null default 0.00
    check (profit_share_percent >= 0 and profit_share_percent <= 100),
  notes                text,
  is_active            boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

drop trigger if exists trg_owners_updated_at on public.owners;
create trigger trg_owners_updated_at
before update on public.owners
for each row execute function public.set_updated_at();

-- Enable RLS (API uses service role, no need for client policies)
alter table public.owners enable row level security;

-- Seed the three partners
insert into public.owners (name, profit_share_percent) values
  ('Bilal',  33.34),
  ('Yahya',  33.33),
  ('Hammad', 33.33)
on conflict (name) do nothing;

-- ─────────────────────────────────────────────
-- 2) OWNER PAYOUTS
--    Tracks each time profit money is distributed to an owner.
--    amount = cash actually handed over for that period's share.
-- ─────────────────────────────────────────────
create table if not exists public.owner_payouts (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.owners(id) on delete cascade,
  amount      numeric(12,2) not null check (amount >= 0),
  period_from date not null,
  period_to   date not null,
  notes       text,
  paid_at     timestamptz not null default now(),
  created_by  uuid references public.accounts(id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint chk_period check (period_to >= period_from)
);

create index if not exists idx_owner_payouts_owner_id on public.owner_payouts(owner_id);
create index if not exists idx_owner_payouts_paid_at  on public.owner_payouts(paid_at);

alter table public.owner_payouts enable row level security;

-- ─────────────────────────────────────────────
-- 3) HELPER VIEW  (optional, for quick summaries)
--    Shows total paid out per owner so far.
-- ─────────────────────────────────────────────
create or replace view public.owner_payout_summary as
select
  o.id,
  o.name,
  o.profit_share_percent,
  o.is_active,
  coalesce(sum(p.amount), 0) as total_paid_out,
  count(p.id)::int           as payout_count,
  max(p.paid_at)             as last_payout_at
from public.owners o
left join public.owner_payouts p on p.owner_id = o.id
group by o.id, o.name, o.profit_share_percent, o.is_active;

-- ─────────────────────────────────────────────
-- 4) OWNER TRANSACTIONS
--    Tracks various owner transactions:
--    - 'internal_transfer_out' / 'internal_transfer_in' = owner-to-owner transfers
--    - 'owner_advance' = owner paid from personal account (money owed back to owner)
-- ─────────────────────────────────────────────
create table if not exists public.owner_transactions (
  id                   uuid primary key default gen_random_uuid(),
  owner_id             uuid not null references public.owners(id) on delete cascade,
  transaction_type     text not null,  -- 'internal_transfer_out', 'internal_transfer_in', 'owner_advance'
  amount               numeric(12,2) not null check (amount >= 0),
  description          text,
  counterpart_owner_id uuid references public.owners(id) on delete set null,
  occurred_at          timestamptz not null default now(),
  created_at           timestamptz not null default now()
);

create index if not exists idx_owner_transactions_owner_id on public.owner_transactions(owner_id);
create index if not exists idx_owner_transactions_type on public.owner_transactions(transaction_type);
create index if not exists idx_owner_transactions_occurred_at on public.owner_transactions(occurred_at);

alter table public.owner_transactions enable row level security;
