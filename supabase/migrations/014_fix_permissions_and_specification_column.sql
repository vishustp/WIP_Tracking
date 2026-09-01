-- 014_fix_permissions_and_specification_column.sql
-- Fixes:
-- 1. Missing `specification` column on public.work_orders (Error 42703)
-- 2. Missing SELECT grants on views and tables for authenticated and anon roles (Error 42501)
-- 3. Anonymous/SSR read RLS policies for lookup tables and views

-- 1. Ensure `specification` column exists and sync with `grade`
alter table public.work_orders add column if not exists specification text;
update public.work_orders set specification = coalesce(specification, grade);
update public.work_orders set grade = coalesce(grade, specification);

-- Trigger to keep grade and specification synchronized
create or replace function public.sync_work_orders_grade_spec()
returns trigger language plpgsql as $$
begin
  if new.specification is not null and new.grade is null then
    new.grade := new.specification;
  elsif new.grade is not null and new.specification is null then
    new.specification := new.grade;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_work_orders_grade_spec on public.work_orders;
create trigger trg_sync_work_orders_grade_spec
before insert or update on public.work_orders
for each row execute function public.sync_work_orders_grade_spec();

-- 2. Ensure all views are defined and up to date
create or replace view public.vw_route_stage_wip as
with balances as (
  select work_order_id, process_route_id, stage_id,
         sum(input_qty) input_qty,
         sum(output_qty) output_qty,
         sum(rejection_qty) rejection_qty
  from public.production_logs
  group by 1, 2, 3
)
select
  wo.id work_order_id,
  wo.work_order_no,
  r.id route_id,
  r.route_code,
  s.id stage_id,
  s.stage_name,
  rs.sequence_no,
  coalesce(b.input_qty, 0) input_qty,
  coalesce(b.output_qty, 0) output_qty,
  coalesce(b.rejection_qty, 0) rejection_qty,
  greatest(coalesce(b.output_qty, 0) - coalesce(b.input_qty, 0) - coalesce(b.rejection_qty, 0), 0) current_wip
from public.work_orders wo
join public.rolling_plans rp on rp.work_order_id = wo.id
join public.process_routes r on r.id = rp.process_route_id
join public.route_stages rs on rs.route_id = r.id
join public.process_stages s on s.id = rs.stage_id
left join balances b on b.work_order_id = wo.id and b.process_route_id = r.id and b.stage_id = s.id
group by wo.id, wo.work_order_no, r.id, r.route_code, s.id, s.stage_name, rs.sequence_no, b.input_qty, b.output_qty, b.rejection_qty;

create or replace view public.vw_work_order_summary as
select
  wo.id work_order_id,
  wo.work_order_no,
  wo.customer_name customer,
  wo.size_od od,
  wo.size_wt wt,
  coalesce(wo.grade, wo.specification) grade,
  wo.ordered_qty,
  coalesce(sum(rp.planned_qty), 0) planned_qty,
  coalesce((select sum(output_qty) from public.production_logs p where p.work_order_id = wo.id), 0) produced_qty,
  coalesce((select sum(rejection_qty) from public.production_logs p where p.work_order_id = wo.id), 0) rejected_qty,
  coalesce((select string_agg(distinct pr.route_code, ', ' order by pr.route_code) from public.rolling_plans x join public.process_routes pr on pr.id = x.process_route_id where x.work_order_id = wo.id), '') route,
  wo.target_date,
  greatest(0, coalesce(wo.balance_qty_mtr, wo.ordered_qty) - coalesce((select sum(output_qty - rejection_qty) from public.production_logs p where p.work_order_id = wo.id and p.stage_id = (select id from public.process_stages where stage_code = 'FINISHING')), 0) - coalesce((select sum(diverted_qty) from public.diversion_plans d where d.source_wo_id = wo.id), 0)) total_pending,
  wo.status
from public.work_orders wo
left join public.rolling_plans rp on rp.work_order_id = wo.id
group by wo.id;

create or replace view public.vw_dashboard_kpis as
select
  count(*) filter(where status in ('Scheduled', 'In Progress')) active_work_orders,
  count(*) filter(where status = 'Pending Plan') pending_planning,
  count(*) filter(where status = 'Scheduled') scheduled_orders,
  count(*) filter(where status = 'In Progress') in_progress_orders,
  coalesce((select count(*) from public.production_logs where process_date = current_date and stage_id = (select id from public.process_stages where stage_code = 'FINISHING')), 0) completed_today,
  coalesce((select sum(current_wip) from public.vw_route_stage_wip), 0) total_wip,
  coalesce((select sum(rejection_qty) from public.production_logs), 0) rejection_qty,
  count(*) filter(where target_date < current_date and total_pending > 0) delayed_orders
from public.vw_work_order_summary;

-- 3. Permissions & Grants
grant usage on schema public to anon, authenticated, service_role;
grant select on all tables in schema public to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;

grant select on public.vw_route_stage_wip to anon, authenticated, service_role;
grant select on public.vw_work_order_summary to anon, authenticated, service_role;
grant select on public.vw_dashboard_kpis to anon, authenticated, service_role;
grant select on public.vw_work_order_quantities to anon, authenticated, service_role;

-- 4. RLS policies for unauthenticated / SSR reads
drop policy if exists stages_anon_read on public.process_stages;
create policy stages_anon_read on public.process_stages for select to anon using (active);

drop policy if exists routes_anon_read on public.process_routes;
create policy routes_anon_read on public.process_routes for select to anon using (active);

drop policy if exists route_stages_anon_read on public.route_stages;
create policy route_stages_anon_read on public.route_stages for select to anon using (true);

drop policy if exists wo_anon_read on public.work_orders;
create policy wo_anon_read on public.work_orders for select to anon using (true);

drop policy if exists rp_anon_read on public.rolling_plans;
create policy rp_anon_read on public.rolling_plans for select to anon using (true);

drop policy if exists div_anon_read on public.diversion_plans;
create policy div_anon_read on public.diversion_plans for select to anon using (true);

drop policy if exists prod_anon_read on public.production_logs;
create policy prod_anon_read on public.production_logs for select to anon using (true);
