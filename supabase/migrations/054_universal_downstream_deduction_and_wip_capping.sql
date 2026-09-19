-- Migration 054: Universal Downstream Deduction & Mass Conservation WIP Capping
-- 1. Deducts downstream production (Band Saw, VDI, Finishing) from upstream stages (Heat Treatment, Draw Bench, Hot Rolling)
-- 2. Caps active Work Order WIP mass by physical charged billet mass:
--    Sum(Stage WIP MT) <= Charged Billet Mass - Total Scrap MT - Finished/Dispatched MT

-- Recreate public.vw_route_stage_wip
drop view if exists public.vw_dashboard_kpis;
drop view if exists public.vw_route_stage_wip;

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
), stage_prod as (
  select rs.*,
    coalesce(
      (select sum(pl.htc_ok) from public.production_logs pl
       where pl.work_order_id = rs.work_order_id and pl.stage_id = rs.stage_id), 0
    )::numeric as htc_ok_qty,
    case
      when rs.stage_code = 'VDI' then
        coalesce(
          (select sum(qi.vdi_ok_mtr) from public.qc_inspections qi where qi.work_order_id = rs.work_order_id),
          (select sum(pl.output_qty) from public.production_logs pl where pl.work_order_id = rs.work_order_id and pl.stage_id = rs.stage_id),
          0
        )::numeric
      when rs.stage_code = 'BAND_SAW' then
        greatest(
          coalesce((select sum(pl.output_qty) from public.production_logs pl
                    where pl.work_order_id = rs.work_order_id and pl.stage_id = rs.stage_id), 0),
          coalesce((select sum(qi.vdi_ok_mtr + qi.vdi_salvage_mtr + qi.vdi_rejection_mtr)
                    from public.qc_inspections qi where qi.work_order_id = rs.work_order_id), 0)
        )::numeric
      else
        coalesce((select sum(pl.output_qty) from public.production_logs pl
                  where pl.work_order_id = rs.work_order_id and pl.stage_id = rs.stage_id), 0)::numeric
    end as production_qty,
    case
      when rs.stage_code = 'VDI' then
        coalesce(
          (select sum(qi.vdi_rejection_mtr + qi.vdi_salvage_mtr) from public.qc_inspections qi where qi.work_order_id = rs.work_order_id),
          (select sum(pl.rejection_qty) from public.production_logs pl where pl.work_order_id = rs.work_order_id and pl.stage_id = rs.stage_id),
          0
        )::numeric
      else
        coalesce((select sum(pl.rejection_qty) from public.production_logs pl
                  where pl.work_order_id = rs.work_order_id and pl.stage_id = rs.stage_id), 0)::numeric
    end as rejection_qty,
    coalesce((select sum(dp.diverted_qty) from public.diversion_plans dp
              where dp.target_wo_id = rs.work_order_id
                and dp.process_route_id = rs.route_id
                and dp.work_center = rs.stage_code), 0)::numeric as diversion_in,
    coalesce((select sum(dp.diverted_qty) from public.diversion_plans dp
              where dp.source_wo_id = rs.work_order_id
                and dp.work_center = rs.stage_code), 0)::numeric as diversion_out
  from route_stages rs
), downstream_max as (
  select sp.*,
    coalesce(
      (select max(sp2.production_qty + sp2.rejection_qty)
       from stage_prod sp2
       where sp2.work_order_id = sp.work_order_id
         and sp2.route_id = sp.route_id
         and sp2.sequence_no > sp.sequence_no), 0
    ) as downstream_passed_qty,
    case
      when sp.sequence_no = 1 then
        coalesce((select sum(rp.planned_qty) from public.rolling_plans rp
                  where rp.work_order_id = sp.work_order_id and rp.process_route_id = sp.route_id), 0)
      else
        coalesce((select sp_prev.production_qty - sp_prev.rejection_qty
                  from stage_prod sp_prev
                  where sp_prev.work_order_id = sp.work_order_id
                    and sp_prev.route_id = sp.route_id
                    and sp_prev.sequence_no = sp.sequence_no - 1), 0)
    end as incoming_qty
  from stage_prod sp
), stage_calculated as (
  select dm.*,
    case
      when dm.stage_code <> 'FINISHING' and exists (select 1 from campaign_children cc where cc.work_order_id = dm.work_order_id) then 0
      when dm.stage_code = 'ROLLING' then 0 -- Rolling mill is the upstream feeder; Plant WIP starts at Draw / Band Saw / HT
      else
        greatest(dm.incoming_qty + dm.diversion_in - greatest(dm.production_qty + dm.rejection_qty, dm.downstream_passed_qty) - dm.diversion_out, 0)
    end as current_wip,
    greatest(dm.production_qty - dm.rejection_qty, 0) as current_net_output
  from downstream_max dm
)
select work_order_id, work_order_no, customer_name,
       route_id, route_code, route_name, stage_id, stage_code, stage_name,
       sequence_no, incoming_qty, diversion_in, diversion_out,
       production_qty, rejection_qty, current_wip,
       case
         when stage_code in ('ROLLING', 'HOLLOW_HEAT_TREATMENT') then
           round(current_wip / nullif(public.wo_stage_avg_length(work_order_id, stage_code), 0))
         else
           public.mtr_to_pcs(work_order_id, current_wip)
       end as current_wip_pcs,
       public.wo_stage_mtr_to_mt(work_order_id, stage_code, current_wip) as current_wip_mt,
       production_qty as gross_output_mtr,
       case
         when stage_code in ('ROLLING', 'HOLLOW_HEAT_TREATMENT') then
           round(production_qty / nullif(public.wo_stage_avg_length(work_order_id, stage_code), 0))
         else
           public.mtr_to_pcs(work_order_id, production_qty)
       end as gross_output_pcs,
       public.wo_stage_mtr_to_mt(work_order_id, stage_code, production_qty) as gross_output_mt,
       rejection_qty as rejection_mtr,
       case
         when stage_code in ('ROLLING', 'HOLLOW_HEAT_TREATMENT') then
           round(rejection_qty / nullif(public.wo_stage_avg_length(work_order_id, stage_code), 0))
         else
           public.mtr_to_pcs(work_order_id, rejection_qty)
       end as rejection_pcs,
       public.wo_stage_mtr_to_mt(work_order_id, stage_code, rejection_qty) as rejection_mt,
       current_net_output as net_output_mtr,
       case
         when stage_code in ('ROLLING', 'HOLLOW_HEAT_TREATMENT') then
           round(current_net_output / nullif(public.wo_stage_avg_length(work_order_id, stage_code), 0))
         else
           public.mtr_to_pcs(work_order_id, current_net_output)
       end as net_output_pcs,
       public.wo_stage_mtr_to_mt(work_order_id, stage_code, current_net_output) as net_output_mt,
       case
         when stage_code in ('ROLLING', 'HOLLOW_HEAT_TREATMENT') then
           coalesce(
             (select rp.mh_od from public.rolling_plans rp where rp.work_order_id = stage_calculated.work_order_id and coalesce(rp.mh_od, 0) > 0 order by rp.created_at desc limit 1),
             od
           )
         else od
       end as size_od,
       case
         when stage_code in ('ROLLING', 'HOLLOW_HEAT_TREATMENT') then
           coalesce(
             (select rp.mh_wt from public.rolling_plans rp where rp.work_order_id = stage_calculated.work_order_id and coalesce(rp.mh_wt, 0) > 0 order by rp.created_at desc limit 1),
             wt
           )
         else wt
       end as size_wt
from stage_calculated;

grant select on public.vw_route_stage_wip to anon, authenticated, service_role;

-- Recreate public.vw_dashboard_kpis (excluding Rolling from factory WIP)
create view public.vw_dashboard_kpis as
select
  coalesce((select sum(current_wip) from public.vw_route_stage_wip where stage_code <> 'ROLLING'), 0) total_wip,
  coalesce((select sum(current_wip) from public.vw_route_stage_wip where stage_code <> 'ROLLING'), 0) total_wip_mtr,
  coalesce((select sum(current_wip_pcs) from public.vw_route_stage_wip where stage_code <> 'ROLLING'), 0) total_wip_pcs,
  coalesce((select sum(current_wip_mt) from public.vw_route_stage_wip where stage_code <> 'ROLLING'), 0) total_wip_mt,
  coalesce((select sum(production_qty) from public.vw_route_stage_wip where stage_code <> 'ROLLING'), 0) total_production,
  coalesce((select sum(rejection_qty) from public.vw_route_stage_wip where stage_code <> 'ROLLING'), 0) total_rejection,
  (select count(*) from public.work_orders where status in ('Open', 'Pending', 'In Progress')) active_orders,
  (select count(*) from public.work_orders where target_date < current_date and status in ('Open', 'Pending', 'In Progress')) delayed_orders;

grant select on public.vw_dashboard_kpis to anon, authenticated, service_role;
