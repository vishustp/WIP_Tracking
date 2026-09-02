-- 027: Fix diversion source availability without replaying Rolling WIP.
--
-- Source diversion is global at WO level in the current schema (diversion_plans
-- has no source stage/work-center). Therefore source availability must always be
-- calculated as total physical WIP + rejection across ALL stages, less every
-- diversion already made OUT of the source WO.
--
-- This migration is intentionally additive. Do NOT rerun 025/026.

create or replace function public.get_work_order_total_wip(p_work_order_id uuid)
returns table(total_wip_mtr numeric, total_wip_pcs numeric, total_wip_mt numeric)
language sql security definer set search_path = public
as $$
  with stage_totals as (
    select
      coalesce(sum(greatest(coalesce(current_wip,0),0)
                 + greatest(coalesce(current_rejection,0),0)),0) as mtr
    from public.work_order_wip
    where work_order_id = p_work_order_id
  ),
  source_diversions as (
    select coalesce(sum(greatest(coalesce(diverted_qty,0),0)),0) as mtr
    from public.diversion_plans
    where source_wo_id = p_work_order_id
  ),
  wo as (
    select public.wo_avg_length(id) as avg_len, size_od, size_wt
    from public.work_orders
    where id = p_work_order_id
  ),
  available as (
    select greatest(0, s.mtr - d.mtr) as mtr
    from stage_totals s
    cross join source_diversions d
  )
  select
    a.mtr,
    case when coalesce(w.avg_len,0) > 0 then a.mtr / w.avg_len else 0 end,
    a.mtr * case
      when coalesce(w.size_od,0) > coalesce(w.size_wt,0)
      then (w.size_od-w.size_wt)*w.size_wt*0.0246615*0.001
      else 0
    end
  from available a
  cross join wo w;
$$;

grant execute on function public.get_work_order_total_wip(uuid) to authenticated;

-- Keep the read model consistent with the same global source-availability rule.
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
    ww.current_rejection,
    ww.total_available_wip,
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
),
source_available as (
  select
    b.work_order_id,
    greatest(
      0,
      coalesce(sum(greatest(coalesce(b.current_wip,0),0)
                 + greatest(coalesce(b.current_rejection,0),0)),0)
      - coalesce((
          select sum(greatest(coalesce(dp.diverted_qty,0),0))
          from public.diversion_plans dp
          where dp.source_wo_id = b.work_order_id
        ),0)
    ) as total_mtr
  from base b
  group by b.work_order_id
)
select
  b.*,
  sa.total_mtr as total_wip_mtr,
  case
    when coalesce(public.wo_avg_length(b.work_order_id),0) > 0
    then sa.total_mtr / public.wo_avg_length(b.work_order_id)
    else 0
  end as total_wip_pcs,
  sa.total_mtr * case
    when coalesce(b.size_od,0) > coalesce(b.size_wt,0)
    then (b.size_od-b.size_wt)*b.size_wt*0.0246615*0.001
    else 0
  end as total_wip_mt
from base b
join source_available sa on sa.work_order_id = b.work_order_id;

grant select on public.vw_work_order_wip to anon, authenticated, service_role;
