-- Migration 042: Create process_sheets table to store user-customized Process Sheet specifications

create table if not exists public.process_sheets (
  id uuid primary key default gen_random_uuid(),
  plan_id text not null,
  work_order_no text not null,
  sheet_no text not null,
  sheet_data jsonb not null default '{}'::jsonb,
  saved_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint process_sheets_sheet_no_key unique (sheet_no)
);

create index if not exists idx_process_sheets_plan_id on public.process_sheets(plan_id);
create index if not exists idx_process_sheets_work_order_no on public.process_sheets(work_order_no);

alter table public.process_sheets enable row level security;

create policy "Enable all access for authenticated and anon users on process_sheets"
  on public.process_sheets
  for all
  using (true)
  with check (true);

grant all on public.process_sheets to authenticated, anon, service_role;
