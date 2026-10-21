-- 074_hollow_bank_inventory_and_diversion.sql
-- Dedicated Hollow Bank yard inventory and stage diversion workflow

-- 1. Virtual buffer work order for Hollow Bank
insert into public.work_orders(id, work_order_no, customer_name, status, size_od, size_wt, ordered_qty, uom, grade)
values (
  '00000000-0000-0000-0000-00000000000b',
  'Hollow bank',
  'Hollow bank',
  'In Progress',
  1,
  1,
  999999,
  'Mtrs'::public.uom_type,
  'BUFFER'
) on conflict (id) do update set
  work_order_no = excluded.work_order_no,
  customer_name = excluded.customer_name,
  uom = excluded.uom;

-- 2. Hollow Bank Inventory table
create table if not exists public.hollow_bank_inventory (
  id uuid primary key default gen_random_uuid(),
  lot_no text unique not null default ('HB-' || to_char(clock_timestamp(), 'YYYYMMDD-HH24MISSMS')),
  source_wo_id uuid not null references public.work_orders(id) on delete restrict,
  source_stage_code text not null,
  heat_no text,
  od numeric not null check (od > 0),
  wt numeric not null check (wt > 0),
  grade text not null,
  pcs integer not null check (pcs > 0),
  avg_length numeric not null check (avg_length > 0),
  total_meters numeric not null check (total_meters > 0),
  weight_mt numeric not null default 0 check (weight_mt >= 0),
  status text not null default 'AVAILABLE' check (status in ('AVAILABLE', 'PARTIALLY_ALLOCATED', 'FULLY_ALLOCATED', 'SCRAPPED')),
  available_pcs integer not null check (available_pcs >= 0),
  available_meters numeric not null check (available_meters >= 0),
  available_mt numeric not null default 0 check (available_mt >= 0),
  banked_date date not null default current_date,
  banked_by uuid references auth.users(id),
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexing for instant filtering and search
create index if not exists idx_hollow_bank_status on public.hollow_bank_inventory(status);
create index if not exists idx_hollow_bank_source_wo on public.hollow_bank_inventory(source_wo_id);
create index if not exists idx_hollow_bank_stage on public.hollow_bank_inventory(source_stage_code);
create index if not exists idx_hollow_bank_dimensions on public.hollow_bank_inventory(od, wt, grade);

-- 3. Hollow Bank Allocations table
create table if not exists public.hollow_bank_allocations (
  id uuid primary key default gen_random_uuid(),
  hollow_bank_id uuid not null references public.hollow_bank_inventory(id) on delete cascade,
  target_wo_id uuid not null references public.work_orders(id) on delete restrict,
  target_stage_code text not null,
  allocated_pcs integer not null check (allocated_pcs > 0),
  allocated_meters numeric not null check (allocated_meters > 0),
  allocated_mt numeric not null default 0 check (allocated_mt >= 0),
  allocated_date date not null default current_date,
  allocated_by uuid references auth.users(id),
  remarks text,
  created_at timestamptz not null default now()
);

create index if not exists idx_hollow_bank_alloc_bank on public.hollow_bank_allocations(hollow_bank_id);
create index if not exists idx_hollow_bank_alloc_target on public.hollow_bank_allocations(target_wo_id);

-- 4. Trigger Function: On Bank Inventory Inbound Entry -> Create diversion_plans record
create or replace function public.fn_hollow_bank_inbound_diversion()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_route_id uuid;
begin
  -- Resolve valid route_id from rolling plans or default active process route
  select rp.process_route_id into v_route_id
  from public.rolling_plans rp
  where rp.work_order_id = NEW.source_wo_id
  limit 1;

  if v_route_id is null then
    select pr.id into v_route_id
    from public.process_routes pr
    where pr.active
    limit 1;
  end if;

  -- Calculate weight if not provided
  if coalesce(NEW.weight_mt, 0) = 0 and NEW.od > 0 and NEW.wt > 0 and NEW.total_meters > 0 then
    NEW.weight_mt := round(((NEW.od - NEW.wt) * NEW.wt * 0.0246615 * 0.001 * NEW.total_meters)::numeric, 3);
  end if;

  if coalesce(NEW.available_pcs, 0) = 0 then
    NEW.available_pcs := NEW.pcs;
  end if;
  if coalesce(NEW.available_meters, 0) = 0 then
    NEW.available_meters := NEW.total_meters;
  end if;
  if coalesce(NEW.available_mt, 0) = 0 then
    NEW.available_mt := NEW.weight_mt;
  end if;

  -- Create diversion record transferring material from source_wo_id at source_stage_code into HB-BUFFER
  -- This deducts WIP from source_wo_id across vw_route_stage_wip, work_order_wip, and production queues
  insert into public.diversion_plans (
    source_wo_id,
    target_wo_id,
    diverted_qty,
    process_route_id,
    work_center,
    multiple,
    reason,
    approved_by,
    diversion_date
  ) values (
    NEW.source_wo_id,
    '00000000-0000-0000-0000-00000000000b',
    NEW.total_meters,
    v_route_id,
    NEW.source_stage_code,
    1,
    coalesce('Diverted to Hollow Bank: ' || NEW.lot_no || coalesce(' (' || NEW.remarks || ')', ''), 'Diverted to Hollow Bank: ' || NEW.lot_no),
    NEW.banked_by,
    NEW.banked_date
  );

  return NEW;
end;
$$;

drop trigger if exists trg_hollow_bank_inbound on public.hollow_bank_inventory;
create trigger trg_hollow_bank_inbound
before insert on public.hollow_bank_inventory
for each row execute function public.fn_hollow_bank_inbound_diversion();

-- 5. Trigger Function: On Bank Allocation Outbound Entry -> Update balance & Create diversion_plans record
create or replace function public.fn_hollow_bank_outbound_allocation()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_bank public.hollow_bank_inventory%rowtype;
  v_route_id uuid;
  v_new_avail_pcs integer;
  v_new_avail_mtr numeric;
  v_new_avail_mt numeric;
  v_new_status text;
begin
  select * into v_bank
  from public.hollow_bank_inventory
  where id = NEW.hollow_bank_id
  for update;

  if not found then
    raise exception 'Hollow bank lot % not found.', NEW.hollow_bank_id;
  end if;

  if v_bank.status not in ('AVAILABLE', 'PARTIALLY_ALLOCATED') then
    raise exception 'Hollow bank lot % is not available for allocation (current status: %).', v_bank.lot_no, v_bank.status;
  end if;

  if NEW.allocated_pcs > v_bank.available_pcs then
    raise exception 'Cannot allocate % pcs: only % pcs available in lot %.', NEW.allocated_pcs, v_bank.available_pcs, v_bank.lot_no;
  end if;

  if NEW.allocated_meters > v_bank.available_meters then
    raise exception 'Cannot allocate % m: only % m available in lot %.', NEW.allocated_meters, v_bank.available_meters, v_bank.lot_no;
  end if;

  -- Calculate allocated MT if missing
  if coalesce(NEW.allocated_mt, 0) = 0 and v_bank.od > 0 and v_bank.wt > 0 and NEW.allocated_meters > 0 then
    NEW.allocated_mt := round(((v_bank.od - v_bank.wt) * v_bank.wt * 0.0246615 * 0.001 * NEW.allocated_meters)::numeric, 3);
  end if;

  -- Decrement available balances
  v_new_avail_pcs := greatest(0, v_bank.available_pcs - NEW.allocated_pcs);
  v_new_avail_mtr := greatest(0, round((v_bank.available_meters - NEW.allocated_meters)::numeric, 3));
  v_new_avail_mt := greatest(0, round((v_bank.available_mt - NEW.allocated_mt)::numeric, 3));

  if v_new_avail_pcs <= 0 or v_new_avail_mtr <= 0 then
    v_new_status := 'FULLY_ALLOCATED';
  else
    v_new_status := 'PARTIALLY_ALLOCATED';
  end if;

  update public.hollow_bank_inventory
  set available_pcs = v_new_avail_pcs,
      available_meters = v_new_avail_mtr,
      available_mt = v_new_avail_mt,
      status = v_new_status,
      updated_at = now()
  where id = v_bank.id;

  -- Resolve valid target route_id
  select rp.process_route_id into v_route_id
  from public.rolling_plans rp
  where rp.work_order_id = NEW.target_wo_id
  limit 1;

  if v_route_id is null then
    select pr.id into v_route_id
    from public.process_routes pr
    where pr.active
    limit 1;
  end if;

  -- Insert diversion record transferring from HB-BUFFER to target_wo_id at target_stage_code
  -- This immediately injects the quantity into target_wo_id's queue at target_stage_code!
  insert into public.diversion_plans (
    source_wo_id,
    target_wo_id,
    diverted_qty,
    process_route_id,
    work_center,
    multiple,
    reason,
    approved_by,
    diversion_date
  ) values (
    '00000000-0000-0000-0000-00000000000b',
    NEW.target_wo_id,
    NEW.allocated_meters,
    v_route_id,
    NEW.target_stage_code,
    1,
    coalesce('Allocated from Hollow Bank: ' || v_bank.lot_no || coalesce(' (' || NEW.remarks || ')', ''), 'Allocated from Hollow Bank: ' || v_bank.lot_no),
    NEW.allocated_by,
    NEW.allocated_date
  );

  return NEW;
end;
$$;

drop trigger if exists trg_hollow_bank_outbound on public.hollow_bank_allocations;
create trigger trg_hollow_bank_outbound
before insert on public.hollow_bank_allocations
for each row execute function public.fn_hollow_bank_outbound_allocation();

-- 6. View: vw_hollow_bank_inventory
drop view if exists public.vw_hollow_bank_inventory cascade;
create or replace view public.vw_hollow_bank_inventory as
select
  hbi.id,
  hbi.lot_no,
  hbi.source_wo_id,
  wo.work_order_no as source_wo_no,
  wo.customer_name as source_customer,
  hbi.source_stage_code,
  hbi.heat_no,
  hbi.od,
  hbi.wt,
  hbi.grade,
  hbi.pcs,
  hbi.avg_length,
  hbi.total_meters,
  hbi.weight_mt,
  hbi.status,
  hbi.available_pcs,
  hbi.available_meters,
  hbi.available_mt,
  hbi.banked_date,
  hbi.banked_by,
  hbi.remarks,
  hbi.created_at,
  hbi.updated_at,
  coalesce((select count(*) from public.hollow_bank_allocations hba where hba.hollow_bank_id = hbi.id), 0) as allocations_count
from public.hollow_bank_inventory hbi
join public.work_orders wo on wo.id = hbi.source_wo_id;

-- 7. View: vw_hollow_bank_allocations
drop view if exists public.vw_hollow_bank_allocations cascade;
create or replace view public.vw_hollow_bank_allocations as
select
  hba.id,
  hba.hollow_bank_id,
  hbi.lot_no,
  hbi.od,
  hbi.wt,
  hbi.grade,
  hbi.heat_no,
  hbi.source_stage_code,
  src_wo.work_order_no as source_wo_no,
  src_wo.customer_name as source_customer,
  hba.target_wo_id,
  tgt_wo.work_order_no as target_wo_no,
  tgt_wo.customer_name as target_customer,
  hba.target_stage_code,
  hba.allocated_pcs,
  hba.allocated_meters,
  hba.allocated_mt,
  hba.allocated_date,
  hba.allocated_by,
  hba.remarks,
  hba.created_at
from public.hollow_bank_allocations hba
join public.hollow_bank_inventory hbi on hbi.id = hba.hollow_bank_id
join public.work_orders src_wo on src_wo.id = hbi.source_wo_id
join public.work_orders tgt_wo on tgt_wo.id = hba.target_wo_id;

-- 8. Permissions & RLS
alter table public.hollow_bank_inventory enable row level security;
alter table public.hollow_bank_allocations enable row level security;

create policy hb_inv_read on public.hollow_bank_inventory for select to public using (true);
create policy hb_inv_write on public.hollow_bank_inventory for insert to public with check (true);
create policy hb_inv_update on public.hollow_bank_inventory for update to public using (true);

create policy hb_alloc_read on public.hollow_bank_allocations for select to public using (true);
create policy hb_alloc_write on public.hollow_bank_allocations for insert to public with check (true);

grant select, insert, update on public.hollow_bank_inventory to anon, authenticated, service_role;
grant select, insert on public.hollow_bank_allocations to anon, authenticated, service_role;
grant select on public.vw_hollow_bank_inventory to anon, authenticated, service_role;
grant select on public.vw_hollow_bank_allocations to anon, authenticated, service_role;
