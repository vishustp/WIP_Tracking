-- 067_create_daily_production_plans.sql
-- Subsystem: Unified Daily Planning Console
-- Covers daily shift target scheduling for Draw Bench, Heat Treatment, Finishing, and Pilger Mill

create table if not exists public.daily_production_plans (
  id uuid primary key default gen_random_uuid(),
  plan_date date not null,
  shift text not null default 'ALL_DAY' check (shift in ('ALL_DAY', 'SHIFT_A', 'SHIFT_B', 'SHIFT_C')),
  work_center text not null check (work_center in ('DRAW', 'PILGER', 'HOLLOW_HEAT_TREATMENT', 'HEAT_TREATMENT', 'BAND_SAW', 'VDI', 'FINISHING')),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  target_pcs integer not null default 0 check (target_pcs >= 0),
  target_mtr numeric(12,2) not null default 0.00 check (target_mtr >= 0),
  target_mt numeric(12,3) not null default 0.000 check (target_mt >= 0),
  machine_id text,
  charge_no text,
  pass_no text,
  priority_rank integer not null default 1,
  notes text,
  status text not null default 'PLANNED' check (status in ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexing for high-speed queue lookups and plan queries
create index if not exists idx_daily_plans_date_wc on public.daily_production_plans(plan_date, work_center);
create index if not exists idx_daily_plans_wo on public.daily_production_plans(work_order_id);
create index if not exists idx_daily_plans_status on public.daily_production_plans(status);

-- Enable RLS
alter table public.daily_production_plans enable row level security;

-- Policies for authenticated and anon roles matching existing project security
drop policy if exists "allow_read_daily_production_plans" on public.daily_production_plans;
create policy "allow_read_daily_production_plans"
  on public.daily_production_plans for select
  using (true);

drop policy if exists "allow_insert_daily_production_plans" on public.daily_production_plans;
create policy "allow_insert_daily_production_plans"
  on public.daily_production_plans for insert
  with check (true);

drop policy if exists "allow_update_daily_production_plans" on public.daily_production_plans;
create policy "allow_update_daily_production_plans"
  on public.daily_production_plans for update
  using (true)
  with check (true);

drop policy if exists "allow_delete_daily_production_plans" on public.daily_production_plans;
create policy "allow_delete_daily_production_plans"
  on public.daily_production_plans for delete
  using (true);

-- Table access grants for all app roles
grant all on public.daily_production_plans to authenticated, anon, service_role;

