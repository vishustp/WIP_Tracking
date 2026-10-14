-- 073_ensure_meters_qty_in_pending_orders_summary.sql
-- Ensure all quantities (ordered, planned, produced, pending) in vw_work_order_summary are represented in meters (mtr)

-- 1. Drop dependent views first to cleanly recreate vw_work_order_summary with new column schema
drop view if exists public.vw_dashboard_kpis cascade;
drop view if exists public.vw_work_order_summary cascade;

-- 2. Recreate vw_work_order_summary ensuring all quantities are in meters
create or replace view public.vw_work_order_summary as
select
  wo.id as work_order_id,
  wo.work_order_no,
  wo.customer_name as customer,
  wo.size_od as od,
  wo.size_wt as wt,
  coalesce(wo.grade, wo.specification) as grade,
  greatest(
    0,
    coalesce(
      nullif(wo.ordered_qty_mtr, 0),
      case
        when wo.uom = 'Pcs' and coalesce(wo.l1, 6.0) > 0
          then wo.ordered_qty * coalesce(nullif((coalesce(wo.l1, 0) + coalesce(wo.l2, wo.l1, 0)) / 2.0, 0), 6.0)
        else wo.ordered_qty
      end
    )
  ) as ordered_qty,
  coalesce(wo.uom::text, 'Mtrs') as uom,
  coalesce(sum(rp.planned_qty), 0) as planned_qty,
  coalesce((select sum(output_qty) from public.production_logs p where p.work_order_id = wo.id), 0) as produced_qty,
  coalesce((select sum(rejection_qty) from public.production_logs p where p.work_order_id = wo.id), 0) as rejected_qty,
  coalesce((select string_agg(distinct pr.route_code, ', ' order by pr.route_code) from public.rolling_plans x join public.process_routes pr on pr.id = x.process_route_id where x.work_order_id = wo.id), '') as route,
  wo.target_date,
  greatest(
    0,
    coalesce(
      nullif(wo.balance_qty_mtr, 0),
      nullif(wo.ordered_qty_mtr, 0),
      case
        when wo.uom = 'Pcs' and coalesce(wo.l1, 6.0) > 0
          then wo.ordered_qty * coalesce(nullif((coalesce(wo.l1, 0) + coalesce(wo.l2, wo.l1, 0)) / 2.0, 0), 6.0)
        else wo.ordered_qty
      end
    )
    - coalesce((select sum(output_qty - rejection_qty) from public.production_logs p where p.work_order_id = wo.id and p.stage_id = (select id from public.process_stages where stage_code = 'FINISHING')), 0)
    - coalesce((select sum(diverted_qty) from public.diversion_plans d where d.source_wo_id = wo.id), 0)
  ) as total_pending,
  wo.status
from public.work_orders wo
left join public.rolling_plans rp on rp.work_order_id = wo.id
group by wo.id, wo.uom;

-- 3. Recreate vw_dashboard_kpis
create or replace view public.vw_dashboard_kpis as
select
  count(*) filter(where status in ('Scheduled', 'In Progress')) as active_work_orders,
  count(*) filter(where status = 'Pending Plan') as pending_planning,
  count(*) filter(where status = 'Scheduled') as scheduled_orders,
  count(*) filter(where status = 'In Progress') as in_progress_orders,
  coalesce((select count(*) from public.production_logs
            where process_date = current_date
              and stage_id = (select id from public.process_stages where stage_code = 'FINISHING')), 0) as completed_today,
  coalesce((select sum(current_wip) from public.vw_route_stage_wip), 0) as total_wip,
  coalesce((select sum(rejection_qty) from public.production_logs), 0) as rejection_qty,
  count(*) filter(where target_date < current_date and total_pending > 0) as delayed_orders
from public.vw_work_order_summary;

-- 4. Re-grant select access
grant select on public.vw_work_order_summary to anon, authenticated, service_role;
grant select on public.vw_dashboard_kpis to anon, authenticated, service_role;
