-- 051_deduct_vdi_from_cutting_wip.sql
-- Deduct VDI inspected quantity from Band Saw (Cutting) WIP across vw_route_stage_wip and recalculate_work_order_wip

-- 1. Update recalculate_work_order_wip RPC
create or replace function public.recalculate_work_order_wip(p_work_order_id uuid, p_route_id uuid default null)
returns void language plpgsql security definer set search_path = public
as $$
declare
  stage_rec record;
  prev_stage_production numeric := 0;
  prev_stage_wip numeric := 0;
  incoming numeric;
  div_in numeric;
  div_out_total numeric;
  prod numeric;
  rej numeric;
  cur numeric;
  od numeric;
  wt numeric;
  avg_len numeric;
  mt_per_mtr numeric;
  route_cur uuid;
begin
  if p_route_id is null then
    delete from public.work_order_wip where work_order_id = p_work_order_id;
  else
    delete from public.work_order_wip
    where work_order_id = p_work_order_id and route_id = p_route_id;
  end if;

  for route_cur in
    select pr.id
    from public.process_routes pr
    where pr.active
      and (p_route_id is null or pr.id = p_route_id)
      and exists (
        select 1
        from public.rolling_plans rp
        where rp.work_order_id = p_work_order_id
          and rp.process_route_id = pr.id
      )
  loop
    prev_stage_production := 0;
    prev_stage_wip := 0;

    select wo.size_od, wo.size_wt, public.wo_avg_length(wo.id)
      into od, wt, avg_len
    from public.work_orders wo
    where wo.id = p_work_order_id;

    avg_len := greatest(coalesce(avg_len, 0), 0);
    mt_per_mtr := case
      when coalesce(od,0) > coalesce(wt,0)
      then (od - wt) * wt * 0.0246615 * 0.001
      else 0
    end;

    for stage_rec in
      select rs.stage_id, rs.sequence_no, ps.stage_code, ps.stage_name
      from public.route_stages rs
      join public.process_stages ps on ps.id = rs.stage_id and ps.active
      where rs.route_id = route_cur and rs.is_required
      order by rs.sequence_no
    loop
      if stage_rec.sequence_no = 1 then
        incoming := coalesce((
          select sum(rp.planned_qty)
          from public.rolling_plans rp
          where rp.work_order_id = p_work_order_id
            and rp.process_route_id = route_cur
        ), 0);
      else
        incoming := greatest(prev_stage_production + prev_stage_wip, 0);
      end if;

      div_in := coalesce((
        select sum(dp.diverted_qty)
        from public.diversion_plans dp
        where dp.target_wo_id = p_work_order_id
          and dp.process_route_id = route_cur
          and coalesce(dp.work_center, 'ROLLING') = stage_rec.stage_code
      ), 0);

      div_out_total := coalesce((
        select sum(dp.diverted_qty)
        from public.diversion_plans dp
        where dp.source_wo_id = p_work_order_id
          and dp.process_route_id = route_cur
      ), 0);

      if stage_rec.stage_code = 'VDI' then
        prod := coalesce((
          select sum(qi.vdi_ok_mtr)
          from public.qc_inspections qi
          where qi.work_order_id = p_work_order_id
        ), 0);
        if prod = 0 then
          prod := coalesce((
            select sum(pl.output_qty)
            from public.production_logs pl
            where pl.work_order_id = p_work_order_id
              and pl.stage_id = stage_rec.stage_id
          ), 0);
        end if;

        rej := coalesce((
          select sum(qi.vdi_rejection_mtr + qi.vdi_salvage_mtr)
          from public.qc_inspections qi
          where qi.work_order_id = p_work_order_id
        ), 0);
        if rej = 0 then
          rej := coalesce((
            select sum(pl.rejection_qty)
            from public.production_logs pl
            where pl.work_order_id = p_work_order_id
              and pl.stage_id = stage_rec.stage_id
          ), 0);
        end if;
      elsif stage_rec.stage_code = 'BAND_SAW' then
        -- Band Saw output: explicit logs OR downstream VDI inspection
        prod := coalesce((
          select sum(pl.output_qty)
          from public.production_logs pl
          where pl.work_order_id = p_work_order_id
            and pl.process_route_id = route_cur
            and pl.stage_id = stage_rec.stage_id
        ), 0);
        prod := greatest(
          prod,
          coalesce((
            select sum(qi.vdi_ok_mtr + qi.vdi_salvage_mtr + qi.vdi_rejection_mtr)
            from public.qc_inspections qi
            where qi.work_order_id = p_work_order_id
          ), 0)
        );

        rej := coalesce((
          select sum(pl.rejection_qty)
          from public.production_logs pl
          where pl.work_order_id = p_work_order_id
            and pl.process_route_id = route_cur
            and pl.stage_id = stage_rec.stage_id
        ), 0);
      else
        prod := coalesce((
          select sum(pl.output_qty)
          from public.production_logs pl
          where pl.work_order_id = p_work_order_id
            and pl.process_route_id = route_cur
            and pl.stage_id = stage_rec.stage_id
        ), 0);

        rej := coalesce((
          select sum(pl.rejection_qty)
          from public.production_logs pl
          where pl.work_order_id = p_work_order_id
            and pl.process_route_id = route_cur
            and pl.stage_id = stage_rec.stage_id
        ), 0);
      end if;

      cur := greatest(0, incoming + div_in - prod - rej);

      insert into public.work_order_wip(
        work_order_id, route_id, stage_id, sequence_no,
        incoming_qty, diversion_in, production_qty, rejection_qty, diversion_out,
        current_wip, current_rejection, total_available_wip,
        current_wip_pcs, current_wip_mt,
        net_output_mtr, net_output_pcs, net_output_mt, calculated_at
      ) values (
        p_work_order_id, route_cur, stage_rec.stage_id, stage_rec.sequence_no,
        incoming, div_in, prod, rej,
        case when stage_rec.sequence_no = 1 then div_out_total else 0 end,
        cur, greatest(rej, 0), cur + greatest(rej, 0),
        case when avg_len > 0 then cur / avg_len else 0 end,
        cur * mt_per_mtr,
        greatest(0, prod - rej),
        case when avg_len > 0 then greatest(0, prod - rej) / avg_len else 0 end,
        greatest(0, prod - rej) * mt_per_mtr,
        now()
      );

      prev_stage_production := greatest(prod - rej, 0);
      prev_stage_wip := cur;
    end loop;
  end loop;
end;
$$;

-- 2. Update vw_route_stage_wip and vw_dashboard_kpis
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
), flow as (
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
  select rs.work_order_id, rs.work_order_no, rs.customer_name,
         rs.od, rs.wt, rs.l1, rs.l2, rs.route_id, rs.route_code, rs.route_name,
         rs.sequence_no, rs.stage_id, rs.stage_code, rs.stage_name,
         case
           when f.stage_code = 'ROLLING' then
             coalesce((select sum(pl.htc_ok) from public.production_logs pl
                       where pl.work_order_id = f.work_order_id
                         and pl.stage_id = f.stage_id), 0)::numeric
           when f.stage_code = 'BAND_SAW' then
             greatest(
               coalesce((select sum(pl.output_qty) from public.production_logs pl
                         where pl.work_order_id = f.work_order_id
                           and pl.stage_id = f.stage_id), 0)
               - coalesce((select sum(pl.rejection_qty) from public.production_logs pl
                           where pl.work_order_id = f.work_order_id
                             and pl.stage_id = f.stage_id), 0),
               coalesce((select sum(qi.vdi_ok_mtr + qi.vdi_salvage_mtr + qi.vdi_rejection_mtr)
                         from public.qc_inspections qi where qi.work_order_id = f.work_order_id), 0),
               0
             )::numeric
           when f.stage_code = 'VDI' then
             coalesce(
               (select sum(qi.vdi_ok_mtr) from public.qc_inspections qi where qi.work_order_id = f.work_order_id),
               (select sum(pl.output_qty) from public.production_logs pl where pl.work_order_id = f.work_order_id and pl.stage_id = f.stage_id),
               0
             )::numeric
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
    case
      when f.stage_code = 'VDI' then
        coalesce(
          (select sum(qi.vdi_ok_mtr) from public.qc_inspections qi where qi.work_order_id = f.work_order_id),
          (select sum(pl.output_qty) from public.production_logs pl where pl.work_order_id = f.work_order_id and pl.stage_id = f.stage_id),
          0
        )::numeric
      when f.stage_code = 'BAND_SAW' then
        greatest(
          coalesce((select sum(pl.output_qty) from public.production_logs pl
                    where pl.work_order_id = f.work_order_id
                      and pl.stage_id = f.stage_id), 0),
          coalesce((select sum(qi.vdi_ok_mtr + qi.vdi_salvage_mtr + qi.vdi_rejection_mtr)
                    from public.qc_inspections qi where qi.work_order_id = f.work_order_id), 0)
        )::numeric
      else
        coalesce((select sum(pl.output_qty) from public.production_logs pl
                  where pl.work_order_id = f.work_order_id
                    and pl.stage_id = f.stage_id), 0)::numeric
    end as production_qty,
    case
      when f.stage_code = 'VDI' then
        coalesce(
          (select sum(qi.vdi_rejection_mtr + qi.vdi_salvage_mtr) from public.qc_inspections qi where qi.work_order_id = f.work_order_id),
          (select sum(pl.rejection_qty) from public.production_logs pl where pl.work_order_id = f.work_order_id and pl.stage_id = f.stage_id),
          0
        )::numeric
      else
        coalesce((select sum(pl.rejection_qty) from public.production_logs pl
                  where pl.work_order_id = f.work_order_id
                    and pl.stage_id = f.stage_id), 0)::numeric
    end as rejection_qty,
    coalesce((select sum(pl.htc_ok) from public.production_logs pl
              where pl.work_order_id = f.work_order_id
                and pl.stage_id = f.stage_id), 0)::numeric as htc_ok_qty
  from flow f
), final as (
  select c.*,
    case
      when c.stage_code <> 'FINISHING' and exists (select 1 from campaign_children cc where cc.work_order_id = c.work_order_id) then 0
      when c.stage_code = 'ROLLING' then
        greatest(c.htc_ok_qty - coalesce(
          (select sum(pl.input_qty) from public.production_logs pl
           join route_stages nxt on nxt.work_order_id = c.work_order_id and nxt.sequence_no = 2
           where pl.work_order_id = c.work_order_id and pl.stage_id = nxt.stage_id), 0), 0)
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

-- 3. Trigger recalculate_work_order_wip on all active work orders
do $$
declare
  wo_rec record;
begin
  for wo_rec in select id from public.work_orders loop
    perform public.recalculate_work_order_wip(wo_rec.id);
  end loop;
end $$;
