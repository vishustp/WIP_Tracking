-- 025: Correct WIP calculation to the confirmed business rules.
-- Rules:
-- 1) WIP starts from issued Rolling Plan quantity on the WO route.
-- 2) Stage WIP = (previous stage production + previous stage WIP)
--    + diversion in - current stage production - current stage rejection.
-- 3) Rejection remains separately available because it can be diverted.
-- 4) Diversion availability includes normal WIP + rejection across ALL stages.
-- Order quantity is never used as WIP.

alter table public.work_order_wip
  add column if not exists current_rejection numeric not null default 0,
  add column if not exists total_available_wip numeric not null default 0;

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
        -- Material available to the current stage consists of what the
        -- previous stage produced plus what was left WIP there.
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

      -- Confirmed rule: normal stage WIP is reduced by both production and rejection.
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

-- Total source availability is physical WIP + all rejection at every stage,
-- less quantities already diverted out of the WO. Target work-center selection
-- does not affect this total.
create or replace function public.get_work_order_total_wip(p_work_order_id uuid)
returns table(total_wip_mtr numeric, total_wip_pcs numeric, total_wip_mt numeric)
language sql security definer set search_path = public
as $$
  with stage_totals as (
    select
      coalesce(sum(greatest(current_wip,0) + greatest(current_rejection,0)),0) as mtr
    from public.work_order_wip
    where work_order_id = p_work_order_id
  ),
  source_diversions as (
    select coalesce(sum(diverted_qty),0) as mtr
    from public.diversion_plans
    where source_wo_id = p_work_order_id
  ),
  wo as (
    select public.wo_avg_length(id) avg_len, size_od, size_wt
    from public.work_orders
    where id = p_work_order_id
  )
  select
    greatest(0, s.mtr - d.mtr),
    greatest(0, s.mtr - d.mtr) / nullif(w.avg_len,0),
    greatest(0, s.mtr - d.mtr) * case
      when coalesce(w.size_od,0) > coalesce(w.size_wt,0)
      then (w.size_od-w.size_wt)*w.size_wt*0.0246615*0.001
      else 0
    end
  from stage_totals s
  cross join source_diversions d
  cross join wo w;
$$;

grant execute on function public.recalculate_work_order_wip(uuid,uuid) to authenticated;
grant execute on function public.get_work_order_total_wip(uuid) to authenticated;

-- Rebuild all existing ledger rows using the corrected rules.
do $$
declare
  wo_rec record;
begin
  for wo_rec in select id from public.work_orders loop
    perform public.recalculate_work_order_wip(wo_rec.id);
  end loop;
end $$;
