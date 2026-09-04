-- ============================================================
-- 034_wip_aging_and_notifications.sql
--
-- WIP Aging Analysis & Department Material Stagnation Notifications
-- 1. vw_wip_aging: Calculates dwell time/days stuck for each positive WIP location
-- 2. aging_alert_acknowledgements: Tracks user acknowledgements/snoozes for alerts
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

create policy "Allow all authenticated users to view acknowledgements"
  on public.aging_alert_acknowledgements
  for select to authenticated using (true);

create policy "Allow authenticated users to insert/update acknowledgements"
  on public.aging_alert_acknowledgements
  for all to authenticated using (true) with check (true);

grant all on public.aging_alert_acknowledgements to authenticated;

-- 2. View: vw_wip_aging
drop view if exists public.vw_wip_aging cascade;

create or replace view public.vw_wip_aging as
with active_wip as (
  select 
    w.work_order_id,
    w.work_order_no,
    w.customer_name,
    wo.grade,
    w.od,
    w.wt,
    w.l1,
    w.l2,
    w.route_id,
    w.route_code,
    w.route_name,
    w.sequence_no,
    w.stage_id,
    w.stage_code,
    w.stage_name,
    w.current_wip,
    w.current_wip_pcs,
    w.available_mt,
    -- Find latest production date at this stage
    (
      select max(pl.process_date)
      from public.production_logs pl
      where pl.work_order_id = w.work_order_id
        and pl.stage_id = w.stage_id
    ) as stage_last_log_date,
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
    ) as rolling_plan_date
  from public.vw_route_stage_wip w
  join public.work_orders wo on wo.id = w.work_order_id
  where w.current_wip > 0
),
computed_dates as (
  select
    aw.*,
    coalesce(
      aw.stage_last_log_date,
      aw.upstream_last_log_date,
      aw.rolling_plan_date,
      current_date
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
  cd.last_activity_date,
  greatest(0, (current_date - cd.last_activity_date)::integer) as days_stuck,
  case
    when (current_date - cd.last_activity_date)::integer > 5 then 'CRITICAL'
    when (current_date - cd.last_activity_date)::integer between 3 and 5 then 'WARNING'
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

grant select on public.vw_wip_aging to authenticated;
