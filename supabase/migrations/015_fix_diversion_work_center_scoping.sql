-- Migration 015: Add work_center to diversion_plans and properly scope stage WIP
-- Prevents diversions issued at upstream work centers (e.g. Rolling, Draw) from incorrectly appearing in Finishing queue

-- 1. Ensure work_center column exists
alter table public.diversion_plans 
add column if not exists work_center text not null default 'ROLLING';

-- 2. Update create_diversion RPC to accept and record p_work_center
create or replace function public.create_diversion(
  p_source uuid,
  p_target uuid,
  p_qty numeric,
  p_route uuid,
  p_multiple numeric,
  p_reason text,
  p_date date,
  p_work_center text default 'ROLLING'
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  idd uuid;
  avail_mtr numeric;
  wc_code text;
begin
  if p_source = p_target then 
    raise exception 'Source and target WO cannot be same'; 
  end if;
  if p_qty <= 0 then 
    raise exception 'Diversion MTR must be positive'; 
  end if;
  if p_multiple <= 0 then 
    raise exception 'Multiple must be positive'; 
  end if;
  
  wc_code := coalesce(nullif(trim(p_work_center), ''), 'ROLLING');
  
  select public.get_unplanned_qty(p_source) into avail_mtr;
  if p_qty > avail_mtr and avail_mtr > 0 then 
    raise exception 'Diversion exceeds available MTR'; 
  end if;
  
  if not exists(select 1 from public.process_routes where id = p_route and active) then 
    raise exception 'Invalid route'; 
  end if;
  if trim(coalesce(p_reason, '')) = '' then 
    raise exception 'Reason is required'; 
  end if;

  insert into public.diversion_plans(
    source_wo_id,
    target_wo_id,
    diverted_qty,
    work_center,
    process_route_id,
    multiple,
    reason,
    approved_by,
    diversion_date
  )
  values (
    p_source,
    p_target,
    p_qty,
    wc_code,
    p_route,
    p_multiple,
    p_reason,
    auth.uid(),
    p_date
  ) returning id into idd;

  return idd;
end;
$$;

grant execute on function public.create_diversion(uuid,uuid,numeric,uuid,numeric,text,date,text) to authenticated;

-- 3. Update get_production_entry_queue so that diversions only feed into their specific work_center
create or replace function public.get_production_entry_queue(p_stage_code text)
returns table(
  work_order_id uuid,
  work_order_no text,
  customer_name text,
  specification text,
  od numeric,
  wl numeric,
  l1 numeric,
  l2 numeric,
  avg_length numeric,
  route_id uuid,
  route_code text,
  route_name text,
  stage_code text,
  balance_to_make_mtr numeric,
  balance_to_make_pcs numeric,
  balance_to_make_mt numeric,
  multiple numeric
) language sql security definer set search_path=public as $$
with route_stage_union as (
  select wo.id work_order_id, wo.work_order_no, wo.customer_name, wo.grade specification,
         wo.size_od od, wo.size_wt wl, wo.l1, wo.l2, public.wo_avg_length(wo.id) avg_length,
         r.id route_id, r.route_code, r.route_name, ps.stage_code, rs.sequence_no
  from public.work_orders wo
  join public.rolling_plans rp on rp.work_order_id = wo.id
  join public.process_routes r on r.id = rp.process_route_id and r.active
  join public.route_stages rs on rs.route_id = r.id and rs.is_required
  join public.process_stages ps on ps.id = rs.stage_id and ps.active
  where ps.stage_code = p_stage_code
  union
  select wo.id, wo.work_order_no, wo.customer_name, wo.grade, wo.size_od, wo.size_wt, wo.l1, wo.l2,
         public.wo_avg_length(wo.id), r.id, r.route_code, r.route_name, ps.stage_code, rs.sequence_no
  from public.work_orders wo
  join public.diversion_plans dp on dp.target_wo_id = wo.id and dp.work_center = p_stage_code
  join public.process_routes r on r.id = dp.process_route_id and r.active
  join public.route_stages rs on rs.route_id = r.id and rs.is_required
  join public.process_stages ps on ps.id = rs.stage_id and ps.active
  where ps.stage_code = p_stage_code
), route_stage_list as (
  select distinct on(work_order_id, route_id, stage_code) *
  from route_stage_union
  order by work_order_id, route_id, stage_code, sequence_no
), balances as (
  select b.*,
    greatest(0, case
      when b.stage_code = 'ROLLING' then
        coalesce((select sum(rp.planned_qty) from public.rolling_plans rp where rp.work_order_id = b.work_order_id and rp.process_route_id = b.route_id), 0)
        + coalesce((select sum(dp.diverted_qty) from public.diversion_plans dp where dp.target_wo_id = b.work_order_id and dp.process_route_id = b.route_id and dp.work_center = 'ROLLING'), 0)
        - coalesce((select sum(dp.diverted_qty) from public.diversion_plans dp where dp.source_wo_id = b.work_order_id and dp.work_center = 'ROLLING'), 0)
        - coalesce((select sum(pl.input_qty) from public.production_logs pl join public.process_stages ps on ps.id = pl.stage_id
                    where pl.work_order_id = b.work_order_id and pl.process_route_id = b.route_id and ps.stage_code = 'ROLLING'), 0)
      when b.stage_code = 'HOLLOW_HEAT_TREATMENT' then
        coalesce((select sum(pl.htc_ok) from public.production_logs pl join public.process_stages ps on ps.id = pl.stage_id
                  where pl.work_order_id = b.work_order_id and pl.process_route_id = b.route_id and ps.stage_code = 'ROLLING'), 0)
        + coalesce((select sum(dp.diverted_qty) from public.diversion_plans dp where dp.target_wo_id = b.work_order_id and dp.process_route_id = b.route_id and dp.work_center = 'HOLLOW_HEAT_TREATMENT'), 0)
        - coalesce((select sum(dp.diverted_qty) from public.diversion_plans dp where dp.source_wo_id = b.work_order_id and dp.work_center = 'HOLLOW_HEAT_TREATMENT'), 0)
        - coalesce((select sum(pl.input_qty) from public.production_logs pl join public.process_stages ps on ps.id = pl.stage_id
                    where pl.work_order_id = b.work_order_id and pl.process_route_id = b.route_id and ps.stage_code = 'HOLLOW_HEAT_TREATMENT'), 0)
      when b.stage_code = 'DRAW' then
        (case when b.route_code = 'ALLOY_CDS' then
          coalesce((select sum(pl.output_qty - pl.rejection_qty) from public.production_logs pl join public.process_stages ps on ps.id = pl.stage_id
                    where pl.work_order_id = b.work_order_id and pl.process_route_id = b.route_id and ps.stage_code = 'HOLLOW_HEAT_TREATMENT'), 0)
         else
          coalesce((select sum(pl.htc_ok) from public.production_logs pl join public.process_stages ps on ps.id = pl.stage_id
                    where pl.work_order_id = b.work_order_id and pl.process_route_id = b.route_id and ps.stage_code = 'ROLLING'), 0)
         end)
        + coalesce((select sum(dp.diverted_qty) from public.diversion_plans dp where dp.target_wo_id = b.work_order_id and dp.process_route_id = b.route_id and dp.work_center = 'DRAW'), 0)
        - coalesce((select sum(dp.diverted_qty) from public.diversion_plans dp where dp.source_wo_id = b.work_order_id and dp.work_center = 'DRAW'), 0)
        - coalesce((select sum(pl.input_qty) from public.production_logs pl join public.process_stages ps on ps.id = pl.stage_id
                    where pl.work_order_id = b.work_order_id and pl.process_route_id = b.route_id and ps.stage_code = 'DRAW'), 0)
      when b.stage_code = 'HEAT_TREATMENT' then
        coalesce((select sum(pl.output_qty - pl.rejection_qty) from public.production_logs pl join public.process_stages ps on ps.id = pl.stage_id
                  where pl.work_order_id = b.work_order_id and pl.process_route_id = b.route_id and ps.stage_code = 'DRAW'), 0)
        + coalesce((select sum(dp.diverted_qty) from public.diversion_plans dp where dp.target_wo_id = b.work_order_id and dp.process_route_id = b.route_id and dp.work_center = 'HEAT_TREATMENT'), 0)
        - coalesce((select sum(dp.diverted_qty) from public.diversion_plans dp where dp.source_wo_id = b.work_order_id and dp.work_center = 'HEAT_TREATMENT'), 0)
        - coalesce((select sum(pl.input_qty) from public.production_logs pl join public.process_stages ps on ps.id = pl.stage_id
                    where pl.work_order_id = b.work_order_id and pl.process_route_id = b.route_id and ps.stage_code = 'HEAT_TREATMENT'), 0)
      when b.stage_code = 'FINISHING' then
        least(
          (case
            when b.route_code = 'HFS' then
              coalesce((select sum(pl.htc_ok) from public.production_logs pl join public.process_stages ps on ps.id = pl.stage_id
                        where pl.work_order_id = b.work_order_id and pl.process_route_id = b.route_id and ps.stage_code = 'ROLLING'), 0)
              * coalesce((select max(rp.multiple) from public.rolling_plans rp where rp.work_order_id = b.work_order_id and rp.process_route_id = b.route_id), 1)
            when b.route_code = 'ALLOY_HFS' then
              coalesce((select sum(pl.output_qty - pl.rejection_qty) from public.production_logs pl join public.process_stages ps on ps.id = pl.stage_id
                        where pl.work_order_id = b.work_order_id and pl.process_route_id = b.route_id and ps.stage_code = 'HOLLOW_HEAT_TREATMENT'), 0)
              * coalesce((select max(rp.multiple) from public.rolling_plans rp where rp.work_order_id = b.work_order_id and rp.process_route_id = b.route_id), 1)
            else
              coalesce((select sum(pl.output_qty - pl.rejection_qty) from public.production_logs pl join public.process_stages ps on ps.id = pl.stage_id
                        where pl.work_order_id = b.work_order_id and pl.process_route_id = b.route_id and ps.stage_code = 'HEAT_TREATMENT'), 0)
              * coalesce((select max(rp.multiple) from public.rolling_plans rp where rp.work_order_id = b.work_order_id and rp.process_route_id = b.route_id), 1)
          end)
          + coalesce((select sum(dp.diverted_qty) from public.diversion_plans dp where dp.target_wo_id = b.work_order_id and dp.process_route_id = b.route_id and dp.work_center = 'FINISHING'), 0)
          - coalesce((select sum(dp.diverted_qty) from public.diversion_plans dp where dp.source_wo_id = b.work_order_id and dp.work_center = 'FINISHING'), 0)
          - coalesce((select sum(pl.input_qty) from public.production_logs pl join public.process_stages ps on ps.id = pl.stage_id
                      where pl.work_order_id = b.work_order_id and pl.process_route_id = b.route_id and ps.stage_code = 'FINISHING'), 0),
          coalesce((select wo.balance_qty_mtr from public.work_orders wo where wo.id = b.work_order_id), 0)
        )
      else 0
    end) as balance_to_make_mtr
  from route_stage_list b
)
select b.work_order_id, b.work_order_no, b.customer_name, b.specification, b.od, b.wl, b.l1, b.l2, b.avg_length,
       b.route_id, b.route_code, b.route_name, b.stage_code, b.balance_to_make_mtr,
       public.mtr_to_pcs(b.work_order_id, b.balance_to_make_mtr),
       public.mtr_to_mt(b.work_order_id, b.balance_to_make_mtr),
       coalesce((select max(dp.multiple) from public.diversion_plans dp where dp.target_wo_id = b.work_order_id and dp.process_route_id = b.route_id and dp.work_center = b.stage_code),
                (select max(rp.multiple) from public.rolling_plans rp where rp.work_order_id = b.work_order_id and rp.process_route_id = b.route_id), 1)
from balances b 
where b.balance_to_make_mtr > 0 
order by b.work_order_no, b.route_code;
$$;

grant execute on function public.get_production_entry_queue(text) to authenticated;
