-- 024: Read model for Production Entry and WIP screens.
-- WIP quantities come from work_order_wip; order metadata comes from work_orders.
-- This deliberately keeps order quantity out of WIP calculation.

create or replace view public.vw_work_order_wip as
with base as (
  select
    w.id as work_order_id,
    w.work_order_no,
    w.customer_name,
    w.grade,
    w.specification,
    w.size_od,
    w.size_wt,
    w.l1,
    w.l2,
    w.ordered_qty,
    w.uom,
    w.target_date,
    w.status,
    w.created_at as work_order_created_at,
    w.updated_at as work_order_updated_at,
    ww.id as wip_id,
    ww.route_id,
    r.route_code,
    r.route_name,
    ww.stage_id,
    ps.stage_code,
    ps.stage_name,
    ww.sequence_no,
    ww.incoming_qty,
    ww.diversion_in,
    ww.production_qty,
    ww.rejection_qty,
    ww.diversion_out,
    ww.current_wip,
    ww.current_wip_pcs,
    ww.current_wip_mt,
    ww.net_output_mtr,
    ww.net_output_pcs,
    ww.net_output_mt,
    ww.calculated_at
  from public.work_order_wip ww
  join public.work_orders w on w.id = ww.work_order_id
  join public.process_routes r on r.id = ww.route_id
  join public.process_stages ps on ps.id = ww.stage_id
), totals as (
  select
    b.*,
    greatest(0, sum(greatest(b.current_wip,0)) over (partition by b.work_order_id)
      - coalesce((select sum(dp.diverted_qty) from public.diversion_plans dp where dp.source_wo_id=b.work_order_id),0)
    ) as total_wip_mtr,
    greatest(0, sum(greatest(b.current_wip_pcs,0)) over (partition by b.work_order_id)
      - coalesce((select sum(dp.diverted_qty) from public.diversion_plans dp where dp.source_wo_id=b.work_order_id),0)
        / nullif(public.wo_avg_length(b.work_order_id),0)
    ) as total_wip_pcs,
    greatest(0, sum(greatest(b.current_wip_mt,0)) over (partition by b.work_order_id)
      - coalesce((select sum(dp.diverted_qty) from public.diversion_plans dp where dp.source_wo_id=b.work_order_id),0)
        * case when coalesce(b.size_od,0)>coalesce(b.size_wt,0)
          then (b.size_od-b.size_wt)*b.size_wt*0.0246615*0.001 else 0 end
    ) as total_wip_mt
  from base b
)
select * from totals;

grant select on public.vw_work_order_wip to anon, authenticated, service_role;
