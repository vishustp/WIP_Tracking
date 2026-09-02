-- 023: Dedicated Work Order WIP ledger
-- WIP is physical process inventory. Order quantities remain in work_orders.
-- This table is the single source of truth for stage WIP and total WO WIP.

create table if not exists public.work_order_wip (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  route_id uuid not null references public.process_routes(id) on delete cascade,
  stage_id uuid not null references public.process_stages(id) on delete cascade,
  sequence_no integer not null,
  incoming_qty numeric not null default 0,
  diversion_in numeric not null default 0,
  production_qty numeric not null default 0,
  rejection_qty numeric not null default 0,
  diversion_out numeric not null default 0,
  current_wip numeric not null default 0,
  current_wip_pcs numeric not null default 0,
  current_wip_mt numeric not null default 0,
  net_output_mtr numeric not null default 0,
  net_output_pcs numeric not null default 0,
  net_output_mt numeric not null default 0,
  calculated_at timestamptz not null default now(),
  unique(work_order_id, route_id, stage_id)
);

create index if not exists idx_work_order_wip_wo on public.work_order_wip(work_order_id);
create index if not exists idx_work_order_wip_stage on public.work_order_wip(stage_id);
create index if not exists idx_work_order_wip_route on public.work_order_wip(route_id);

alter table public.work_order_wip enable row level security;
drop policy if exists work_order_wip_read_authenticated on public.work_order_wip;
create policy work_order_wip_read_authenticated on public.work_order_wip
  for select to authenticated using (true);

-- Rebuild one WO/route from the transactional source tables.
-- Order metadata is deliberately NOT copied here; join work_orders when UI needs it.
create or replace function public.recalculate_work_order_wip(p_work_order_id uuid, p_route_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  prev_net numeric := 0;
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
    delete from public.work_order_wip where work_order_id = p_work_order_id and route_id = p_route_id;
  end if;

  for route_cur in
    select r.id
    from public.process_routes r
    where r.active
      and (p_route_id is null or r.id = p_route_id)
      and (
        exists (select 1 from public.rolling_plans rp where rp.work_order_id = p_work_order_id and rp.process_route_id = r.id)
        or exists (select 1 from public.diversion_plans dp where (dp.source_wo_id = p_work_order_id or dp.target_wo_id = p_work_order_id) and dp.process_route_id = r.id)
      )
  loop
    prev_net := 0;

    select wo.size_od, wo.size_wt, public.wo_avg_length(wo.id)
      into od, wt, avg_len
    from public.work_orders wo
    where wo.id = p_work_order_id;

    avg_len := greatest(coalesce(avg_len, 0), 0);
    mt_per_mtr := case when coalesce(od,0) > coalesce(wt,0)
      then (od - wt) * wt * 0.0246615 * 0.001 else 0 end;

    for r in
      select rs.stage_id, rs.sequence_no, ps.stage_code, ps.stage_name
      from public.route_stages rs
      join public.process_stages ps on ps.id = rs.stage_id and ps.active
      where rs.route_id = route_cur and rs.is_required
      order by rs.sequence_no
    loop
      if r.sequence_no = 1 then
        incoming := coalesce((select sum(rp.planned_qty)
          from public.rolling_plans rp
          where rp.work_order_id = p_work_order_id and rp.process_route_id = route_cur), 0);
      else
        incoming := greatest(prev_net, 0);
      end if;

      div_in := coalesce((select sum(dp.diverted_qty)
        from public.diversion_plans dp
        where dp.target_wo_id = p_work_order_id
          and dp.process_route_id = route_cur
          and coalesce(dp.work_center, 'ROLLING') = r.stage_code), 0);

      div_out_total := coalesce((select sum(dp.diverted_qty)
        from public.diversion_plans dp
        where dp.source_wo_id = p_work_order_id
          and dp.process_route_id = route_cur), 0);

      prod := coalesce((select sum(pl.output_qty)
        from public.production_logs pl
        where pl.work_order_id = p_work_order_id
          and pl.process_route_id = route_cur
          and pl.stage_id = r.stage_id), 0);

      rej := coalesce((select sum(pl.rejection_qty)
        from public.production_logs pl
        where pl.work_order_id = p_work_order_id
          and pl.process_route_id = route_cur
          and pl.stage_id = r.stage_id), 0);

      -- Stage WIP is physical material at this stage. Source diversion is a WO-level
      -- deduction and is exposed separately through total-WIP RPC; we do not guess
      -- which stage the source material came from.
      cur := greatest(0, incoming + div_in - prod - rej);

      insert into public.work_order_wip(
        work_order_id, route_id, stage_id, sequence_no,
        incoming_qty, diversion_in, production_qty, rejection_qty, diversion_out,
        current_wip, current_wip_pcs, current_wip_mt,
        net_output_mtr, net_output_pcs, net_output_mt, calculated_at
      ) values (
        p_work_order_id, route_cur, r.stage_id, r.sequence_no,
        incoming, div_in, prod, rej,
        case when r.sequence_no = 1 then div_out_total else 0 end,
        cur,
        case when avg_len > 0 then cur / avg_len else 0 end,
        cur * mt_per_mtr,
        greatest(0, prod - rej),
        case when avg_len > 0 then greatest(0, prod - rej) / avg_len else 0 end,
        greatest(0, prod - rej) * mt_per_mtr,
        now()
      );

      prev_net := greatest(0, prod - rej);
    end loop;
  end loop;
end;
$$;

-- Recalculate every affected WO after source transactions change.
create or replace function public.trg_recalculate_work_order_wip()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'rolling_plans' then
    perform public.recalculate_work_order_wip(coalesce(new.work_order_id, old.work_order_id), coalesce(new.process_route_id, old.process_route_id));
  elsif tg_table_name = 'production_logs' then
    perform public.recalculate_work_order_wip(coalesce(new.work_order_id, old.work_order_id), coalesce(new.process_route_id, old.process_route_id));
  elsif tg_table_name = 'diversion_plans' then
    perform public.recalculate_work_order_wip(coalesce(new.source_wo_id, old.source_wo_id));
    perform public.recalculate_work_order_wip(coalesce(new.target_wo_id, old.target_wo_id));
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists rolling_plans_recalculate_wip on public.rolling_plans;
create trigger rolling_plans_recalculate_wip
after insert or update or delete on public.rolling_plans
for each row execute function public.trg_recalculate_work_order_wip();

drop trigger if exists production_logs_recalculate_wip on public.production_logs;
create trigger production_logs_recalculate_wip
after insert or update or delete on public.production_logs
for each row execute function public.trg_recalculate_work_order_wip();

drop trigger if exists diversion_plans_recalculate_wip on public.diversion_plans;
create trigger diversion_plans_recalculate_wip
after insert or update or delete on public.diversion_plans
for each row execute function public.trg_recalculate_work_order_wip();

-- Total physical WIP for a source WO. This is intentionally independent of
-- diversion destination/work center and independent of order quantity.
create or replace function public.get_work_order_total_wip(p_work_order_id uuid)
returns table(total_wip_mtr numeric, total_wip_pcs numeric, total_wip_mt numeric)
language sql
security definer
set search_path = public
as $$
  with stage_totals as (
    select
      coalesce(sum(greatest(current_wip,0)),0) mtr,
      coalesce(sum(greatest(current_wip_pcs,0)),0) pcs,
      coalesce(sum(greatest(current_wip_mt,0)),0) mt
    from public.work_order_wip
    where work_order_id = p_work_order_id
  ), source_diversions as (
    select coalesce(sum(diverted_qty),0) mtr
    from public.diversion_plans
    where source_wo_id = p_work_order_id
  ), wo as (
    select public.wo_avg_length(id) avg_len, size_od, size_wt
    from public.work_orders where id = p_work_order_id
  )
  select
    greatest(0, s.mtr - d.mtr),
    greatest(0, s.pcs - case when coalesce(w.avg_len,0)>0 then d.mtr/w.avg_len else 0 end),
    greatest(0, s.mt - d.mtr * case when coalesce(w.size_od,0)>coalesce(w.size_wt,0) then (w.size_od-w.size_wt)*w.size_wt*0.0246615*0.001 else 0 end)
  from stage_totals s cross join source_diversions d cross join wo w;
$$;

grant execute on function public.get_work_order_total_wip(uuid) to authenticated;
grant execute on function public.recalculate_work_order_wip(uuid,uuid) to authenticated;

-- Seed the ledger for existing data once, without touching order quantities.
do $$
declare x record;
begin
  for x in select id from public.work_orders loop
    perform public.recalculate_work_order_wip(x.id);
  end loop;
end $$;
