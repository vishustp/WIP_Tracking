-- MTR is the planning/base quantity across PPC planning and WIP.
-- Work Orders keep raw Excel quantities. PCS and MT are derived from MTR.
-- Rolling Plan: user enters Planned MTR only.
-- Production Entry: user may enter PCS and/or MTR; MT is always calculated.

create or replace function public.get_unplanned_qty(p_work_order_id uuid)
returns numeric language sql security definer set search_path=public as $$
  select greatest(
    0,
    coalesce((select w.balance_qty_mtr from public.work_orders w where w.id=p_work_order_id),0)
    - coalesce((select sum(rp.planned_qty) from public.rolling_plans rp where rp.work_order_id=p_work_order_id),0)
    - coalesce((select sum(dp.diverted_qty) from public.diversion_plans dp where dp.source_wo_id=p_work_order_id),0)
  );
$$;
grant execute on function public.get_unplanned_qty(uuid) to authenticated;

create or replace function public.create_rolling_plan(
  p_work_order_id uuid,p_planned_qty numeric,p_rolling_date date,p_route_id uuid,
  p_target_mother_size text,p_multiple numeric default 1
) returns text language plpgsql security invoker set search_path=public as $$
declare n text; avail_mtr numeric;
begin
  if p_planned_qty<=0 then raise exception 'Planned MTR must be positive'; end if;
  if p_multiple<=0 then raise exception 'Multiple must be positive'; end if;
  if not exists(select 1 from public.work_orders where id=p_work_order_id) then raise exception 'Work Order not found'; end if;
  if not exists(select 1 from public.process_routes where id=p_route_id and active) then raise exception 'Invalid route'; end if;
  select public.get_unplanned_qty(p_work_order_id) into avail_mtr;
  if p_planned_qty>avail_mtr then raise exception 'Planned MTR % exceeds unplanned MTR %',p_planned_qty,avail_mtr; end if;
  insert into public.rolling_plans(work_order_id,planned_rolling_date,planned_qty,process_route_id,target_mother_size,multiple)
  values(p_work_order_id,p_rolling_date,p_planned_qty,p_route_id,p_target_mother_size,p_multiple)
  returning plan_no into n;
  update public.work_orders set status='Scheduled' where id=p_work_order_id and status='Pending Plan';
  return n;
end;
$$;
grant execute on function public.create_rolling_plan(uuid,numeric,date,uuid,text,numeric) to authenticated;

create or replace function public.create_diversion(
  p_source uuid,p_target uuid,p_qty numeric,p_route uuid,p_multiple numeric default 1,
  p_reason text default '',p_date date default current_date
) returns uuid language plpgsql security invoker set search_path=public as $$
declare avail_mtr numeric; idd uuid;
begin
  if p_source=p_target then raise exception 'Source and target WO cannot be same'; end if;
  if p_qty<=0 then raise exception 'Diversion MTR must be positive'; end if;
  if p_multiple<=0 then raise exception 'Multiple must be positive'; end if;
  select public.get_unplanned_qty(p_source) into avail_mtr;
  if p_qty>avail_mtr then raise exception 'Diversion exceeds available MTR'; end if;
  if not exists(select 1 from public.process_routes where id=p_route and active) then raise exception 'Invalid route'; end if;
  if trim(coalesce(p_reason,''))='' then raise exception 'Reason is required'; end if;
  insert into public.diversion_plans(source_wo_id,target_wo_id,diverted_qty,process_route_id,multiple,reason,approved_by,diversion_date)
  values(p_source,p_target,p_qty,p_route,p_multiple,p_reason,auth.uid(),p_date) returning id into idd;
  return idd;
end;
$$;
grant execute on function public.create_diversion(uuid,uuid,numeric,uuid,numeric,text,date) to authenticated;

drop function if exists public.get_production_entry_queue(text);
create function public.get_production_entry_queue(p_stage_code text)
returns table(
  work_order_id uuid,work_order_no text,customer_name text,specification text,
  od numeric,wl numeric,l1 numeric,l2 numeric,avg_length numeric,
  route_id uuid,route_code text,route_name text,stage_code text,
  balance_to_make_mtr numeric,balance_to_make_pcs numeric,balance_to_make_mt numeric,multiple numeric
) language sql security definer set search_path=public as $$
with route_stage_union as (
  select wo.id work_order_id,wo.work_order_no,wo.customer_name,wo.grade specification,
         wo.size_od od,wo.size_wt wl,wo.l1,wo.l2,public.wo_avg_length(wo.id) avg_length,
         r.id route_id,r.route_code,r.route_name,ps.stage_code,rs.sequence_no
  from public.work_orders wo
  join public.rolling_plans rp on rp.work_order_id=wo.id
  join public.process_routes r on r.id=rp.process_route_id and r.active
  join public.route_stages rs on rs.route_id=r.id and rs.is_required
  join public.process_stages ps on ps.id=rs.stage_id and ps.active
  where ps.stage_code=p_stage_code
  union
  select wo.id,wo.work_order_no,wo.customer_name,wo.grade,wo.size_od,wo.size_wt,wo.l1,wo.l2,
         public.wo_avg_length(wo.id),r.id,r.route_code,r.route_name,ps.stage_code,rs.sequence_no
  from public.work_orders wo
  join public.diversion_plans dp on dp.target_wo_id=wo.id
  join public.process_routes r on r.id=dp.process_route_id and r.active
  join public.route_stages rs on rs.route_id=r.id and rs.is_required
  join public.process_stages ps on ps.id=rs.stage_id and ps.active
  where ps.stage_code=p_stage_code
), route_stage_list as (
  select distinct on(work_order_id,route_id,stage_code) *
  from route_stage_union
  order by work_order_id,route_id,stage_code,sequence_no
), balances as (
  select b.*,
    greatest(0,case
      when b.stage_code='ROLLING' then
        coalesce((select sum(rp.planned_qty) from public.rolling_plans rp where rp.work_order_id=b.work_order_id and rp.process_route_id=b.route_id),0)
        + coalesce((select sum(dp.diverted_qty) from public.diversion_plans dp where dp.target_wo_id=b.work_order_id and dp.process_route_id=b.route_id),0)
        - coalesce((select sum(pl.input_qty) from public.production_logs pl join public.process_stages ps on ps.id=pl.stage_id
                    where pl.work_order_id=b.work_order_id and pl.process_route_id=b.route_id and ps.stage_code='ROLLING'),0)
      when b.stage_code='HOLLOW_HEAT_TREATMENT' then
        coalesce((select sum(pl.output_qty-pl.rejection_qty) from public.production_logs pl join public.process_stages ps on ps.id=pl.stage_id
                  where pl.work_order_id=b.work_order_id and pl.process_route_id=b.route_id and ps.stage_code='ROLLING'),0)
        - coalesce((select sum(pl.input_qty) from public.production_logs pl join public.process_stages ps on ps.id=pl.stage_id
                    where pl.work_order_id=b.work_order_id and pl.process_route_id=b.route_id and ps.stage_code='HOLLOW_HEAT_TREATMENT'),0)
      when b.stage_code='DRAW' then
        coalesce((select sum(pl.output_qty-pl.rejection_qty) from public.production_logs pl join public.process_stages ps on ps.id=pl.stage_id
                  where pl.work_order_id=b.work_order_id and pl.process_route_id=b.route_id and ps.stage_code='HOLLOW_HEAT_TREATMENT'),0)
        - coalesce((select sum(pl.input_qty) from public.production_logs pl join public.process_stages ps on ps.id=pl.stage_id
                    where pl.work_order_id=b.work_order_id and pl.process_route_id=b.route_id and ps.stage_code='DRAW'),0)
      when b.stage_code='HEAT_TREATMENT' then
        coalesce((select sum(pl.output_qty-pl.rejection_qty) from public.production_logs pl join public.process_stages ps on ps.id=pl.stage_id
                  where pl.work_order_id=b.work_order_id and pl.process_route_id=b.route_id and ps.stage_code='DRAW'),0)
        - coalesce((select sum(pl.input_qty) from public.production_logs pl join public.process_stages ps on ps.id=pl.stage_id
                    where pl.work_order_id=b.work_order_id and pl.process_route_id=b.route_id and ps.stage_code='HEAT_TREATMENT'),0)
      when b.stage_code='FINISHING' then
        coalesce((select sum(pl.output_qty-pl.rejection_qty) from public.production_logs pl join public.process_stages ps on ps.id=pl.stage_id
                  where pl.work_order_id=b.work_order_id and pl.process_route_id=b.route_id
                    and ps.stage_code in('HEAT_TREATMENT','ROLLING')),0)
        - coalesce((select sum(pl.input_qty) from public.production_logs pl join public.process_stages ps on ps.id=pl.stage_id
                    where pl.work_order_id=b.work_order_id and pl.process_route_id=b.route_id and ps.stage_code='FINISHING'),0)
      else 0 end) balance_to_make_mtr
  from route_stage_list b
)
select b.work_order_id,b.work_order_no,b.customer_name,b.specification,b.od,b.wl,b.l1,b.l2,b.avg_length,
       b.route_id,b.route_code,b.route_name,b.stage_code,b.balance_to_make_mtr,
       public.mtr_to_pcs(b.work_order_id,b.balance_to_make_mtr),
       public.mtr_to_mt(b.work_order_id,b.balance_to_make_mtr),
       coalesce((select max(dp.multiple) from public.diversion_plans dp where dp.target_wo_id=b.work_order_id and dp.process_route_id=b.route_id),
                (select max(rp.multiple) from public.rolling_plans rp where rp.work_order_id=b.work_order_id and rp.process_route_id=b.route_id),1)
from balances b where b.balance_to_make_mtr>0 order by b.work_order_no,b.route_code;
$$;
grant execute on function public.get_production_entry_queue(text) to authenticated;

create or replace function public.record_production(
  p_work_order_id uuid,p_route_id uuid,p_stage_code text,p_process_date date,
  p_input_qty numeric,p_output_qty numeric,p_rejection_qty numeric,p_htc_ok numeric,
  p_heat_lot_no text,p_remarks text
) returns uuid language plpgsql security invoker set search_path=public as $$
declare sid uuid; rec uuid; balance_mtr numeric;
begin
  if p_input_qty<=0 or p_output_qty<=0 then raise exception 'Production MTR must be positive'; end if;
  if p_output_qty>p_input_qty then raise exception 'Output MTR cannot exceed input MTR'; end if;
  if p_rejection_qty<0 or p_rejection_qty>p_output_qty then raise exception 'Rejection MTR cannot exceed output MTR'; end if;
  if p_htc_ok<0 then raise exception 'HTC OK cannot be negative'; end if;
  select ps.id into sid from public.process_stages ps join public.route_stages rs on rs.stage_id=ps.id
  where rs.route_id=p_route_id and rs.is_required and ps.stage_code=p_stage_code and ps.active;
  if sid is null then raise exception 'Stage is not part of selected route'; end if;
  if p_stage_code<>'ROLLING' and p_htc_ok<>0 then raise exception 'HTC OK can only be entered at Rolling'; end if;
  if p_stage_code='ROLLING' and p_htc_ok>(p_output_qty-p_rejection_qty) then raise exception 'HTC OK cannot exceed net rolling MTR'; end if;
  select q.balance_to_make_mtr into balance_mtr from public.get_production_entry_queue(p_stage_code) q
  where q.work_order_id=p_work_order_id and q.route_id=p_route_id limit 1;
  if balance_mtr is null then raise exception 'No eligible WIP found for this Work Order and route'; end if;
  if p_input_qty>balance_mtr then raise exception 'Production MTR % exceeds available WIP MTR %',p_input_qty,balance_mtr; end if;
  insert into public.production_logs(work_order_id,stage_id,process_route_id,process_date,input_qty,output_qty,rejection_qty,htc_ok,heat_lot_no,remarks,created_by)
  values(p_work_order_id,sid,p_route_id,p_process_date,p_input_qty,p_output_qty,p_rejection_qty,p_htc_ok,nullif(trim(p_heat_lot_no),''),nullif(trim(p_remarks),''),auth.uid())
  returning id into rec;
  update public.work_orders set status='In Progress' where id=p_work_order_id and status in('Pending Plan','Scheduled');
  return rec;
end;
$$;
grant execute on function public.record_production(uuid,uuid,text,date,numeric,numeric,numeric,numeric,text,text) to authenticated;

drop function if exists public.get_recent_production_entries(integer);
create function public.get_recent_production_entries(p_limit integer default 50)
returns table(
  id uuid,work_order_no text,customer_name text,route_code text,stage_code text,process_date date,
  od numeric,wl numeric,l1 numeric,l2 numeric,avg_length numeric,
  input_mtr numeric,input_pcs numeric,input_mt numeric,output_mtr numeric,output_pcs numeric,output_mt numeric,
  rejection_mtr numeric,rejection_pcs numeric,rejection_mt numeric,htc_ok_mtr numeric,heat_lot_no text,remarks text,created_at timestamptz
) language sql security definer set search_path=public as $$
select pl.id,wo.work_order_no,wo.customer_name,r.route_code,ps.stage_code,pl.process_date,
       wo.size_od,wo.size_wt,wo.l1,wo.l2,public.wo_avg_length(wo.id),
       pl.input_qty,public.mtr_to_pcs(wo.id,pl.input_qty),public.mtr_to_mt(wo.id,pl.input_qty),
       pl.output_qty,public.mtr_to_pcs(wo.id,pl.output_qty),public.mtr_to_mt(wo.id,pl.output_qty),
       pl.rejection_qty,public.mtr_to_pcs(wo.id,pl.rejection_qty),public.mtr_to_mt(wo.id,pl.rejection_qty),
       pl.htc_ok,pl.heat_lot_no,pl.remarks,pl.created_at
from public.production_logs pl join public.work_orders wo on wo.id=pl.work_order_id
join public.process_routes r on r.id=pl.process_route_id join public.process_stages ps on ps.id=pl.stage_id
order by pl.created_at desc limit greatest(1,least(coalesce(p_limit,50),100));
$$;
grant execute on function public.get_recent_production_entries(integer) to authenticated;
