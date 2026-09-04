-- 032: Strict WIP Flow: WIP is strictly generated AFTER Rolling production is done, and ONLY from HTC OK quantity.
-- Child work orders in multi-WO campaigns do NOT generate independent pre-finishing WIP (bundled in Master).

-- 1. Safely drop dependent views
drop view if exists public.vw_dashboard_kpis;
drop view if exists public.vw_route_stage_wip;

-- 2. Create strict route stage WIP view
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
), campaign_children as (
  -- Set of child work order IDs bundled under a master campaign
  select distinct (c->>'work_order_id')::uuid as work_order_id
  from public.rolling_plans rp,
       lateral jsonb_array_elements(
         case
           when jsonb_typeof(rp.status::jsonb->'child_work_orders') = 'array' then rp.status::jsonb->'child_work_orders'
           else '[]'::jsonb
         end
       ) as c
  where rp.status::text like '%"is_master":true%'
    and (c->>'work_order_id') is not null
  union
  select distinct rp.work_order_id
  from public.rolling_plans rp
  where rp.status::text like '%"is_child":true%'
), flow as (
  -- Sequence 1: Rolling Mill
  -- NOTE: Physical mother hollow WIP does NOT exist before rolling production is done.
  -- Physical rolled WIP is strictly generated from HTC OK quantity!
  select rs.work_order_id, rs.work_order_no, rs.customer_name,
         rs.od, rs.wt, rs.l1, rs.l2, rs.route_id, rs.route_code, rs.route_name,
         rs.sequence_no, rs.stage_id, rs.stage_code, rs.stage_name,
         coalesce(
           (select sum(pl.htc_ok) from public.production_logs pl
            where pl.work_order_id = rs.work_order_id
              and pl.stage_id = rs.stage_id), 0
         )::numeric as incoming_qty
  from route_stages rs
  where rs.sequence_no = 1
  union all
  -- Downstream sequences (HTC, Draw, HT, Finishing):
  -- Receive stock from preceding stage.
  -- Specifically, from Rolling, only HTC OK quantity feeds downstream!
  select rs.work_order_id, rs.work_order_no, rs.customer_name,
         rs.od, rs.wt, rs.l1, rs.l2, rs.route_id, rs.route_code, rs.route_name,
         rs.sequence_no, rs.stage_id, rs.stage_code, rs.stage_name,
         case
           when f.stage_code = 'ROLLING' then
             coalesce((select sum(pl.htc_ok) from public.production_logs pl
                       where pl.work_order_id = f.work_order_id
                         and pl.stage_id = f.stage_id), 0)::numeric
           else
             greatest(
               coalesce((select sum(pl.output_qty) from public.production_logs pl
                         where pl.work_order_id = f.work_order_id
                           and pl.stage_id = f.stage_id), 0)
               - coalesce((select sum(pl.rejection_qty) from public.production_logs pl
                           where pl.work_order_id = f.work_order_id
                             and pl.stage_id = f.stage_id), 0), 0)::numeric
         end as incoming_qty
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
                and pl.stage_id = f.stage_id), 0)::numeric as production_qty,
    coalesce((select sum(pl.rejection_qty) from public.production_logs pl
              where pl.work_order_id = f.work_order_id
                and pl.stage_id = f.stage_id), 0)::numeric as rejection_qty,
    coalesce((select sum(pl.htc_ok) from public.production_logs pl
              where pl.work_order_id = f.work_order_id
                and pl.stage_id = f.stage_id), 0)::numeric as htc_ok_qty
  from flow f
), final as (
  select c.*,
    case
      -- 1. Child orders in pre-finishing stages (Rolling, HTC, Draw, HT) have NO independent WIP
      when c.stage_code <> 'FINISHING' and exists (select 1 from campaign_children cc where cc.work_order_id = c.work_order_id) then 0
      -- 2. For Rolling stage: Physical WIP is 0 until rolled. Once rolled, WIP is remaining HTC OK stock.
      when c.stage_code = 'ROLLING' then
        greatest(c.htc_ok_qty - coalesce(
          (select sum(pl.input_qty) from public.production_logs pl
           join route_stages nxt on nxt.work_order_id = c.work_order_id and nxt.sequence_no = 2
           where pl.work_order_id = c.work_order_id and pl.stage_id = nxt.stage_id), 0), 0)
      -- 3. Downstream stages: incoming HTC OK minus current stage production and rejection
      else
        greatest(c.incoming_qty + c.diversion_in - c.production_qty - c.rejection_qty - c.diversion_out, 0)
    end as current_wip,
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

-- 3. Recreate dashboard view
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
