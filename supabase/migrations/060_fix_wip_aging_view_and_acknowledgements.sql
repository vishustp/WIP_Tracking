-- ============================================================
-- 060_fix_wip_aging_view_and_acknowledgements.sql
--
-- WIP Aging Analysis & Department Material Stagnation Notifications
-- Recreates vw_wip_aging with correct schema aligning with vw_route_stage_wip
-- and ensures aging_alert_acknowledgements table exists.
-- ============================================================

-- 1. Acknowledgements table
create table if not exists public.aging_alert_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  stage_code text not null,
  acknowledged_by text not null,
  notes text,
  snooze_until date default (current_date + interval '2 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_aging_ack unique (work_order_id, stage_code)
);

alter table public.aging_alert_acknowledgements enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies 
    where tablename = 'aging_alert_acknowledgements' 
      and policyname = 'Allow all to view acknowledgements'
  ) then
    create policy "Allow all to view acknowledgements"
      on public.aging_alert_acknowledgements
      for select to anon, authenticated, service_role using (true);
  end if;

  if not exists (
    select 1 from pg_policies 
    where tablename = 'aging_alert_acknowledgements' 
      and policyname = 'Allow all to upsert acknowledgements'
  ) then
    create policy "Allow all to upsert acknowledgements"
      on public.aging_alert_acknowledgements
      for all to anon, authenticated, service_role using (true) with check (true);
  end if;
end $$;

grant all on public.aging_alert_acknowledgements to anon, authenticated, service_role;

-- 2. View: vw_wip_aging
drop view if exists public.vw_wip_aging cascade;

create or replace view public.vw_wip_aging as
with active_wip as (
  select 
    w.work_order_id,
    w.work_order_no,
    w.customer_name,
    wo.grade,
    w.size_od as od,
    w.size_wt as wt,
    wo.l1,
    wo.l2,
    w.route_id,
    w.route_code,
    w.route_name,
    w.sequence_no,
    w.stage_id,
    w.stage_code,
    w.stage_name,
    w.current_wip,
    w.current_wip_pcs,
    w.current_wip_mt as available_mt,
    -- Find latest production/inspection date at this stage
    case
      when w.stage_code = 'VDI' then
        greatest(
          (select max(qi.inspection_date) from public.qc_inspections qi where qi.work_order_id = w.work_order_id),
          (select max(pl.process_date) from public.production_logs pl where pl.work_order_id = w.work_order_id and pl.stage_id = w.stage_id)
        )
      else
        (select max(pl.process_date) from public.production_logs pl where pl.work_order_id = w.work_order_id and pl.stage_id = w.stage_id)
    end as stage_last_log_date,
    -- Find latest production date at upstream stages
    (
      select max(pl.process_date)
      from public.production_logs pl
      join public.route_stages rs on rs.stage_id = pl.stage_id and rs.route_id = w.route_id
      where pl.work_order_id = w.work_order_id
        and rs.sequence_no < w.sequence_no
    ) as upstream_last_log_date,
    -- Find plan date if rolling
    (
      select max(rp.rolling_date)
      from public.rolling_plans rp
      where rp.work_order_id = w.work_order_id
    ) as rolling_plan_date,
    wo.created_at::date as wo_created_date
  from public.vw_route_stage_wip w
  join public.work_orders wo on wo.id = w.work_order_id
  where w.current_wip > 0
    and upper(coalesce(w.stage_code, '')) != 'ROLLING'
),
computed_dates as (
  select
    aw.*,
    greatest(
      aw.stage_last_log_date,
      aw.upstream_last_log_date,
      aw.rolling_plan_date,
      aw.wo_created_date
    ) as last_activity_date
  from active_wip aw
)
select
  cd.work_order_id,
  cd.work_order_no,
  cd.customer_name,
  cd.grade,
  cd.od,
  cd.wt,
  cd.l1,
  cd.l2,
  cd.route_id,
  cd.route_code,
  cd.route_name,
  cd.sequence_no,
  cd.stage_id,
  cd.stage_code,
  cd.stage_name,
  cd.current_wip,
  cd.current_wip_pcs,
  cd.available_mt,
  coalesce(cd.last_activity_date, current_date) as last_activity_date,
  greatest(0, (current_date - coalesce(cd.last_activity_date, current_date))::integer) as days_stuck,
  case
    when (current_date - coalesce(cd.last_activity_date, current_date))::integer > 5 then 'CRITICAL'
    when (current_date - coalesce(cd.last_activity_date, current_date))::integer between 3 and 5 then 'WARNING'
    else 'NORMAL'
  end as severity,
  ack.id is not null and (ack.snooze_until is null or ack.snooze_until >= current_date) as is_acknowledged,
  ack.acknowledged_by,
  ack.notes as ack_notes,
  ack.snooze_until as ack_snooze_until
from computed_dates cd
left join public.aging_alert_acknowledgements ack
  on ack.work_order_id = cd.work_order_id
 and ack.stage_code = cd.stage_code;

grant select on public.vw_wip_aging to anon, authenticated, service_role;
