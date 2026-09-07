-- 040_qc_vdi_inspections.sql
-- Create dedicated table for Quality Control / Visual Dimension Inspection (QC / VDI) logs.
-- Gates Heat Treatment output before it can be processed in Finishing Line.

create table if not exists public.qc_inspections (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  process_route_id uuid references public.process_routes(id),
  inspection_date date not null default current_date,
  inspected_pcs numeric not null default 0,
  inspected_mtr numeric not null default 0,
  inspected_mt numeric not null default 0,
  vdi_ok_pcs numeric not null default 0,
  vdi_ok_mtr numeric not null default 0,
  vdi_ok_mt numeric not null default 0,
  vdi_salvage_pcs numeric not null default 0,
  vdi_salvage_mtr numeric not null default 0,
  vdi_salvage_mt numeric not null default 0,
  vdi_rejection_pcs numeric not null default 0,
  vdi_rejection_mtr numeric not null default 0,
  vdi_rejection_mt numeric not null default 0,
  salvage_reasons jsonb default '[]'::jsonb,
  remarks text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes for performance
create index if not exists idx_qc_inspections_wo on public.qc_inspections(work_order_id);
create index if not exists idx_qc_inspections_date on public.qc_inspections(inspection_date);
create index if not exists idx_qc_inspections_created on public.qc_inspections(created_at desc);

-- RLS
alter table public.qc_inspections enable row level security;

create policy "Allow all users to select qc_inspections"
  on public.qc_inspections for select
  using (true);

create policy "Allow authenticated and anon to insert qc_inspections"
  on public.qc_inspections for insert
  with check (true);

create policy "Allow authenticated and anon to update qc_inspections"
  on public.qc_inspections for update
  using (true)
  with check (true);

create policy "Allow authenticated and anon to delete qc_inspections"
  on public.qc_inspections for delete
  using (true);

grant select, insert, update, delete on public.qc_inspections to authenticated, anon, service_role;
