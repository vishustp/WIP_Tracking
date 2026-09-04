-- 031: Rolling WIP and Capping Aggregation for Multi-WO Campaigns (Master + Child Work Orders)
-- Ensures available WIP and capping at Rolling stage represents the total Plan issued against Master + Child Work Orders.

-- 1. Safely drop dependent dashboard view
drop view if exists public.vw_dashboard_kpis;

-- 2. Drop existing WIP view
drop view if exists public.vw_route_stage_wip;

-- 3. Recreate WIP view with aggregated rolling plan quantities for master orders
create view public.vw_route_stage_wip as
with recursive route_base as (
  select distinct wo.id as work_order_id, wo.work_order_no, wo.customer_name,
         wo.size_od as od, wo.size_wt as wt, wo.l1, wo.l2,
         r.id as route_id, r.route_code, r.route_name
  from public.work_orders wo
  join public.rolling_plans rp on rp.work_order_id = wo.id
  join public.process_routes r on r.id = rp.process_route_id and r.active
  union
  select distinct wo.id, wo.work_order_no, wo.customer_name,
         wo.size_od, wo.size_wt, wo.l1, wo.l2,
         r.id, r.route_code, r.route_name
  from public.work_orders wo
  join public.diversion_plans dp on dp.target_wo_id = wo.id
  join public.process_routes r on r.id = dp.process_route_id and r.active
), route_stages as (
  select rb.*, rs.sequence_no, ps.id as stage_id, ps.stage_code, ps.stage_name
  from route_base rb
  join public.route_stages rs on rs.route_id = rb.route_id and rs.is_required
  join public.process_stages ps on ps.id = rs.stage_id and ps.active
), flow as (
  select rs.work_order_id, rs.work_order_no, rs.customer_name,
         rs.od, rs.wt, rs.l1, rs.l2, rs.route_id, rs.route_code, rs.route_name,
         rs.sequence_no, rs.stage_id, rs.stage_code, rs.stage_name,
         coalesce(
           (
             select sum(
               case
                 when rp.status::text like '%"total_campaign_mtr"%' then
                   coalesce((rp.status->>'total_campaign_mtr')::numeric, rp.planned_qty)
                 else rp.planned_qty
               end
             )
             from public.rolling_plans rp
             where rp.work_order_id = rs.work_order_id
               and rp.process_route_id = rs.route_id
           ), 0
         )::numeric as incoming_qty
  from route_stages rs
  where rs.sequence_no = 1
  union all
  select rs.work_order_id, rs.work_order_no, rs.customer_name,
         rs.od, rs.wt, rs.l1, rs.l2, rs.route_id, rs.route_code, rs.route_name,
         rs.sequence_no, rs.stage_id, rs.stage_code, rs.stage_name,
         greatest(
           coalesce((select sum(pl.output_qty) from public.production_logs pl
                     where pl.work_order_id = f.work_order_id
                       and pl.process_route_id = f.route_id
                       and pl.stage_id = f.stage_id), 0)
           - coalesce((select sum(pl.rejection_qty) from public.production_logs pl
                       where pl.work_order_id = f.work_order_id
                         and pl.process_route_id = f.route_id
                         and pl.stage_id = f.stage_id), 0), 0)::numeric as incoming_qty
  from flow f
  join route_stages rs on rs.work_order_id = f.work_order_id
                       and rs.route_id = f.route_id
                       and rs.sequence_no = f.sequence_no + 1
), calculated as (
  select f.*,
    coalesce((select sum(dp.diverted_qty) from public.diversion_plans dp
              where dp.target_wo_id = f.work_order_id
                and dp.process_route_id = f.route_id
                and dp.work_center = f.stage_code), 0)::numeric as diversion_in,
    coalesce((select sum(dp.diverted_qty) from public.diversion_plans dp
              where dp.source_wo_id = f.work_order_id
                and dp.work_center = f.stage_code), 0)::numeric as diversion_out,
    coalesce((select sum(pl.output_qty) from public.production_logs pl
              where pl.work_order_id = f.work_order_id
                and pl.process_route_id = f.route_id
                and pl.stage_id = f.stage_id), 0)::numeric as production_qty,
    coalesce((select sum(pl.rejection_qty) from public.production_logs pl
              where pl.work_order_id = f.work_order_id
                and pl.process_route_id = f.route_id
                and pl.stage_id = f.stage_id), 0)::numeric as rejection_qty
  from flow f
), final as (
  select c.*,
    greatest(c.incoming_qty + c.diversion_in - c.production_qty
             - c.rejection_qty - c.diversion_out, 0) as current_wip,
    greatest(c.production_qty - c.rejection_qty, 0) as current_net_output
  from calculated c
)
select work_order_id, work_order_no, customer_name,
       route_id, route_code, route_name, stage_id, stage_code, stage_name,
       sequence_no, incoming_qty, diversion_in, diversion_out,
       production_qty, rejection_qty, current_wip,
       public.mtr_to_pcs(work_order_id, current_wip) as current_wip_pcs,
       public.mtr_to_mt(work_order_id, current_wip) as current_wip_mt,
       production_qty as gross_output_mtr,
       public.mtr_to_pcs(work_order_id, production_qty) as gross_output_pcs,
       public.mtr_to_mt(work_order_id, production_qty) as gross_output_mt,
       rejection_qty as rejection_mtr,
       public.mtr_to_pcs(work_order_id, rejection_qty) as rejection_pcs,
       public.mtr_to_mt(work_order_id, rejection_qty) as rejection_mt,
       current_net_output as net_output_mtr,
       public.mtr_to_pcs(work_order_id, current_net_output) as net_output_pcs,
       public.mtr_to_mt(work_order_id, current_net_output) as net_output_mt,
       od as size_od, wt as size_wt, l1, l2
from final;

grant select on public.vw_route_stage_wip to anon, authenticated, service_role;

-- 4. Recreate dashboard view
create view public.vw_dashboard_kpis as
select
  count(*) filter(where status in ('Scheduled', 'In Progress')) active_work_orders,
  count(*) filter(where status = 'Pending Plan') pending_planning,
  count(*) filter(where status = 'Scheduled') scheduled_orders,
  count(*) filter(where status = 'In Progress') in_progress_orders,
  coalesce((select count(*) from public.production_logs
            where process_date = current_date
              and stage_id = (select id from public.process_stages where stage_code = 'FINISHING')), 0) completed_today,
  coalesce((select sum(current_wip) from public.vw_route_stage_wip), 0) total_wip,
  coalesce((select sum(rejection_qty) from public.production_logs), 0) rejection_qty,
  count(*) filter(where target_date < current_date and total_pending > 0) delayed_orders
from public.vw_work_order_summary;

grant select on public.vw_dashboard_kpis to anon, authenticated, service_role;

-- 5. Queue function returning available WIP and capping for rolling stage
drop function if exists public.get_production_entry_queue(text);
create function public.get_production_entry_queue(p_stage_code text)
returns table(
  work_order_id uuid, work_order_no text, customer_name text, specification text,
  od numeric, wl numeric, l1 numeric, l2 numeric, avg_length numeric,
  route_id uuid, route_code text, route_name text, stage_code text,
  balance_to_make_mtr numeric, balance_to_make_pcs numeric, balance_to_make_mt numeric,
  multiple numeric
) language sql security definer set search_path=public as $$
select w.work_order_id, w.work_order_no, w.customer_name,
       wo.grade as specification, w.size_od as od, w.size_wt as wl,
       w.l1, w.l2, public.wo_avg_length(w.work_order_id) as avg_length,
       w.route_id, w.route_code, w.route_name, w.stage_code,
       w.current_wip as balance_to_make_mtr,
       public.mtr_to_pcs(w.work_order_id, w.current_wip) as balance_to_make_pcs,
       public.mtr_to_mt(w.work_order_id, w.current_wip) as balance_to_make_mt,
       coalesce((select max(dp.multiple) from public.diversion_plans dp
                 where dp.target_wo_id = w.work_order_id
                   and dp.process_route_id = w.route_id
                   and dp.work_center = w.stage_code),
                (select max(rp.multiple) from public.rolling_plans rp
                 where rp.work_order_id = w.work_order_id
                   and rp.process_route_id = w.route_id), 1) as multiple
from public.vw_route_stage_wip w
join public.work_orders wo on wo.id = w.work_order_id
where w.stage_code = p_stage_code and w.current_wip > 0
order by w.work_order_no, w.route_code;
$$;

grant execute on function public.get_production_entry_queue(text) to authenticated;
