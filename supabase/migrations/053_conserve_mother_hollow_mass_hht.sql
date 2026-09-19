-- Migration 053: Conserve Mother Hollow mass at Hollow Heat Treatment & Rolling Mill
-- 1. Stage-aware MT calculation function: wo_stage_mtr_to_mt
-- 2. Update recalculate_work_order_wip to use stage-aware dimensions for ROLLING and HOLLOW_HEAT_TREATMENT
-- 3. Recreate vw_route_stage_wip with stage-aware pieces, MT, and Mother Hollow dimensions
-- 4. Recreate get_production_entries returning Mother Hollow OD, WT, and MT for ROLLING & HOLLOW_HEAT_TREATMENT
-- 5. Refresh vw_dashboard_kpis and trigger recalculate_work_order_wip on all active work orders

-- 1. Create public.wo_stage_mtr_to_mt
create or replace function public.wo_stage_mtr_to_mt(
  p_work_order_id uuid,
  p_stage_code text default null,
  p_mtr numeric default 0
)
returns numeric language sql stable security definer set search_path = public as $$
  select case
    when p_stage_code in ('ROLLING', 'HOLLOW_HEAT_TREATMENT') then
      coalesce(
        (select greatest(coalesce(rp.mh_od, w.size_od, 0) - coalesce(rp.mh_wt, w.size_wt, 0), 0)
              * greatest(coalesce(rp.mh_wt, w.size_wt, 0), 0)
              * 0.0246615 * 0.001 * greatest(coalesce(p_mtr, 0), 0)
         from public.rolling_plans rp
         where rp.work_order_id = p_work_order_id
           and coalesce(rp.mh_od, 0) > 0 and coalesce(rp.mh_wt, 0) > 0
         order by rp.created_at desc limit 1),
        greatest(coalesce(w.size_od, 0) - coalesce(w.size_wt, 0), 0)
        * greatest(coalesce(w.size_wt, 0), 0)
        * 0.0246615 * 0.001 * greatest(coalesce(p_mtr, 0), 0)
      )
    else
      greatest(coalesce(w.size_od, 0) - coalesce(w.size_wt, 0), 0)
      * greatest(coalesce(w.size_wt, 0), 0)
      * 0.0246615 * 0.001 * greatest(coalesce(p_mtr, 0), 0)
  end
  from public.work_orders w where w.id = p_work_order_id;
$$;

grant execute on function public.wo_stage_mtr_to_mt(uuid, text, numeric) to authenticated, anon, service_role;

-- 2. Update recalculate_work_order_wip
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
  stage_od numeric;
  stage_wt numeric;
  stage_avg_len numeric;
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
              and pl.process_route_id = route_cur
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
              and pl.process_route_id = route_cur
              and pl.stage_id = stage_rec.stage_id
          ), 0);
        end if;
      elsif stage_rec.stage_code = 'BAND_SAW' then
        prod := greatest(
          coalesce((
            select sum(pl.output_qty)
            from public.production_logs pl
            where pl.work_order_id = p_work_order_id
              and pl.process_route_id = route_cur
              and pl.stage_id = stage_rec.stage_id
          ), 0),
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

      -- Stage-aware dimensions: Use Mother Hollow for ROLLING and HOLLOW_HEAT_TREATMENT
      if stage_rec.stage_code in ('ROLLING', 'HOLLOW_HEAT_TREATMENT') then
        select coalesce(rp.mh_od, od), coalesce(rp.mh_wt, wt),
               public.wo_stage_avg_length(p_work_order_id, stage_rec.stage_code)
          into stage_od, stage_wt, stage_avg_len
        from public.rolling_plans rp
        where rp.work_order_id = p_work_order_id
          and rp.process_route_id = route_cur
          and coalesce(rp.mh_od, 0) > 0 and coalesce(rp.mh_wt, 0) > 0
        order by rp.created_at desc limit 1;

        stage_od := coalesce(stage_od, od);
        stage_wt := coalesce(stage_wt, wt);
        stage_avg_len := coalesce(stage_avg_len, avg_len);
      else
        stage_od := od;
        stage_wt := wt;
        stage_avg_len := avg_len;
      end if;

      mt_per_mtr := case
        when coalesce(stage_od, 0) > coalesce(stage_wt, 0)
        then (stage_od - stage_wt) * stage_wt * 0.0246615 * 0.001
        else 0
      end;

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
        case when stage_avg_len > 0 then cur / stage_avg_len else 0 end,
        cur * mt_per_mtr,
        greatest(0, prod - rej),
        case when stage_avg_len > 0 then greatest(0, prod - rej) / stage_avg_len else 0 end,
        greatest(0, prod - rej) * mt_per_mtr,
        now()
      );

      prev_stage_production := greatest(prod - rej, 0);
      prev_stage_wip := cur;
    end loop;
  end loop;
end;
$$;

grant execute on function public.recalculate_work_order_wip(uuid, uuid) to authenticated, anon, service_role;

-- 3. Drop and recreate views: vw_dashboard_kpis and vw_route_stage_wip
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
             (select rp.mh_od from public.rolling_plans rp where rp.work_order_id = final.work_order_id and coalesce(rp.mh_od, 0) > 0 order by rp.created_at desc limit 1),
             od
           )
         else od
       end as size_od,
       case
         when stage_code in ('ROLLING', 'HOLLOW_HEAT_TREATMENT') then
           coalesce(
             (select rp.mh_wt from public.rolling_plans rp where rp.work_order_id = final.work_order_id and coalesce(rp.mh_wt, 0) > 0 order by rp.created_at desc limit 1),
             wt
           )
         else wt
       end as size_wt,
       case
         when stage_code in ('ROLLING', 'HOLLOW_HEAT_TREATMENT') then
           coalesce(
             (select rp.mh_l1 from public.rolling_plans rp where rp.work_order_id = final.work_order_id and coalesce(rp.mh_l1, 0) > 0 order by rp.created_at desc limit 1),
             l1
           )
         else l1
       end as l1,
       case
         when stage_code in ('ROLLING', 'HOLLOW_HEAT_TREATMENT') then
           coalesce(
             (select rp.mh_l2 from public.rolling_plans rp where rp.work_order_id = final.work_order_id and coalesce(rp.mh_l2, 0) > 0 order by rp.created_at desc limit 1),
             l2
           )
         else l2
       end as l2
from final;

grant select on public.vw_route_stage_wip to anon, authenticated, service_role;

-- Recreate vw_dashboard_kpis
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

-- 4. Recreate get_production_entries returning Mother Hollow OD, WT, and MT for ROLLING & HOLLOW_HEAT_TREATMENT
drop function if exists public.get_production_entries(text, text, text, date, date, integer, integer);

create or replace function public.get_production_entries(
  p_search text default null,
  p_stage_code text default null,
  p_route_code text default null,
  p_from_date date default null,
  p_to_date date default null,
  p_limit integer default 500,
  p_offset integer default 0
)
returns table(
  id uuid,
  work_order_no text,
  customer_name text,
  route_code text,
  stage_code text,
  process_date date,
  od numeric,
  wl numeric,
  l1 numeric,
  l2 numeric,
  avg_length numeric,
  input_mtr numeric,
  input_pcs numeric,
  input_mt numeric,
  output_mtr numeric,
  output_pcs numeric,
  output_mt numeric,
  rejection_mtr numeric,
  rejection_pcs numeric,
  rejection_mt numeric,
  htc_ok_mtr numeric,
  htc_ok_pcs numeric,
  heat_lot_no text,
  remarks text,
  created_at timestamptz,
  can_modify boolean
)
language sql
security definer
set search_path = public
as $function$
  with base as (
    select
      pl.id,
      wo.work_order_no,
      wo.customer_name,
      r.route_code,
      ps.stage_code,
      pl.process_date,
      case
        when ps.stage_code in ('ROLLING', 'HOLLOW_HEAT_TREATMENT') then
          coalesce(
            (select rp.mh_od from public.rolling_plans rp where rp.work_order_id = wo.id and coalesce(rp.mh_od, 0) > 0 order by rp.created_at desc limit 1),
            wo.size_od
          )
        else wo.size_od
      end as od,
      case
        when ps.stage_code in ('ROLLING', 'HOLLOW_HEAT_TREATMENT') then
          coalesce(
            (select rp.mh_wt from public.rolling_plans rp where rp.work_order_id = wo.id and coalesce(rp.mh_wt, 0) > 0 order by rp.created_at desc limit 1),
            wo.size_wt
          )
        else wo.size_wt
      end as wl,
      case
        when ps.stage_code in ('ROLLING', 'HOLLOW_HEAT_TREATMENT') then
          coalesce(
            (select rp.mh_l1 from public.rolling_plans rp where rp.work_order_id = wo.id and coalesce(rp.mh_l1, 0) > 0 order by rp.created_at desc limit 1),
            wo.l1
          )
        else wo.l1
      end as l1,
      case
        when ps.stage_code in ('ROLLING', 'HOLLOW_HEAT_TREATMENT') then
          coalesce(
            (select rp.mh_l2 from public.rolling_plans rp where rp.work_order_id = wo.id and coalesce(rp.mh_l2, 0) > 0 order by rp.created_at desc limit 1),
            wo.l2
          )
        else wo.l2
      end as l2,
      public.wo_stage_avg_length(wo.id, ps.stage_code) as stage_len,
      pl.input_qty as in_mtr,
      pl.output_qty as out_mtr,
      pl.rejection_qty as rej_mtr,
      pl.htc_ok as htc_mtr,
      pl.heat_lot_no,
      pl.remarks,
      pl.created_at,
      not exists (
        select 1
        from public.production_logs newer
        where newer.work_order_id = pl.work_order_id
          and newer.process_route_id = pl.process_route_id
          and newer.created_at > pl.created_at
      ) as can_modify,
      wo.id as work_order_id
    from public.production_logs pl
    join public.work_orders wo on wo.id = pl.work_order_id
    join public.process_routes r on r.id = pl.process_route_id
    join public.process_stages ps on ps.id = pl.stage_id
    where (
      nullif(trim(coalesce(p_search, '')), '') is null
      or wo.work_order_no ilike '%' || trim(p_search) || '%'
      or coalesce(wo.customer_name, '') ilike '%' || trim(p_search) || '%'
      or coalesce(wo.grade, '') ilike '%' || trim(p_search) || '%'
      or coalesce(r.route_code, '') ilike '%' || trim(p_search) || '%'
    )
    and (p_stage_code is null or ps.stage_code = p_stage_code)
    and (p_route_code is null or r.route_code = p_route_code)
    and (p_from_date is null or pl.process_date >= p_from_date)
    and (p_to_date is null or pl.process_date <= p_to_date)
  )
  select
    b.id,
    b.work_order_no,
    b.customer_name,
    b.route_code,
    b.stage_code,
    b.process_date,
    b.od,
    b.wl,
    b.l1,
    b.l2,
    b.stage_len as avg_length,
    b.in_mtr as input_mtr,
    round(b.in_mtr / nullif(b.stage_len, 0)) as input_pcs,
    public.wo_stage_mtr_to_mt(b.work_order_id, b.stage_code, b.in_mtr) as input_mt,
    b.out_mtr as output_mtr,
    round(b.out_mtr / nullif(b.stage_len, 0)) as output_pcs,
    public.wo_stage_mtr_to_mt(b.work_order_id, b.stage_code, b.out_mtr) as output_mt,
    b.rej_mtr as rejection_mtr,
    round(b.rej_mtr / nullif(b.stage_len, 0)) as rejection_pcs,
    public.wo_stage_mtr_to_mt(b.work_order_id, b.stage_code, b.rej_mtr) as rejection_mt,
    b.htc_mtr as htc_ok_mtr,
    round(b.htc_mtr / nullif(b.stage_len, 0)) as htc_ok_pcs,
    b.heat_lot_no,
    b.remarks,
    b.created_at,
    b.can_modify
  from base b
  order by b.created_at desc
  limit greatest(1, least(coalesce(p_limit, 500), 2500))
  offset greatest(coalesce(p_offset, 0), 0);
$function$;

grant execute on function public.get_production_entries(text,text,text,date,date,integer,integer) to authenticated, anon, service_role;

-- 5. Trigger recalculate_work_order_wip on all work orders
do $$
declare
  wo_rec record;
begin
  for wo_rec in select id from public.work_orders loop
    perform public.recalculate_work_order_wip(wo_rec.id);
  end loop;
end $$;
