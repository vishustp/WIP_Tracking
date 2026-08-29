-- Fixes a race condition: create_rolling_plan, create_diversion, and record_production
-- each read an available-balance total and then insert, with no lock in between.
-- Two concurrent calls against the same work order can both read the same balance,
-- both pass the check, and both insert, over-allocating quantity beyond what's
-- actually available. This locks the relevant work_orders row(s) first, so
-- concurrent calls on the same work order serialize instead of racing.
-- (update_production_entry / delete_production_entry already did this correctly.)

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

  -- Lock the work order so a concurrent call can't read the same available
  -- balance before this one inserts.
  perform 1 from public.work_orders where id=p_work_order_id for update;

  select public.get_unplanned_qty(p_work_order_id) into avail_mtr;
  if p_planned_qty>avail_mtr then raise exception 'Planned MTR % exceeds unplanned MTR %',p_planned_qty,avail_mtr; end if;
  insert into public.rolling_plans(work_order_id,planned_rolling_date,planned_qty,process_route_id,target_mother_size,multiple)
  values(p_work_order_id,p_rolling_date,p_planned_qty,p_route_id,p_target_mother_size,p_multiple)
  returning plan_no into n;
  update public.work_orders set status='Scheduled' where id=p_work_order_id and status='Pending Plan';
  return n;
end;
$$;

create or replace function public.create_diversion(
  p_source uuid,p_target uuid,p_qty numeric,p_route uuid,p_multiple numeric default 1,
  p_reason text default '',p_date date default current_date
) returns uuid language plpgsql security invoker set search_path=public as $$
declare avail_mtr numeric; idd uuid;
begin
  if p_source=p_target then raise exception 'Source and target WO cannot be same'; end if;
  if p_qty<=0 then raise exception 'Diversion MTR must be positive'; end if;
  if p_multiple<=0 then raise exception 'Multiple must be positive'; end if;

  -- Lock the source work order so a concurrent diversion/rolling-plan call
  -- can't read the same available balance before this one inserts.
  perform 1 from public.work_orders where id=p_source for update;

  select public.get_unplanned_qty(p_source) into avail_mtr;
  if p_qty>avail_mtr then raise exception 'Diversion exceeds available MTR'; end if;
  if not exists(select 1 from public.process_routes where id=p_route and active) then raise exception 'Invalid route'; end if;
  if trim(coalesce(p_reason,''))='' then raise exception 'Reason is required'; end if;
  insert into public.diversion_plans(source_wo_id,target_wo_id,diverted_qty,process_route_id,multiple,reason,approved_by,diversion_date)
  values(p_source,p_target,p_qty,p_route,p_multiple,p_reason,auth.uid(),p_date) returning id into idd;
  return idd;
end;
$$;

create or replace function public.record_production(
  p_work_order_id uuid,
  p_route_id uuid,
  p_stage_code text,
  p_process_date date,
  p_input_qty numeric,
  p_output_qty numeric,
  p_rejection_qty numeric,
  p_htc_ok numeric,
  p_heat_lot_no text,
  p_remarks text
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  sid uuid;
  rec uuid;
  balance_mtr numeric;
begin
  if public.app_current_role() not in ('Admin','Production','QA') then
    raise exception 'You do not have permission to record production';
  end if;

  if p_input_qty is null or p_output_qty is null or p_input_qty <= 0 or p_output_qty <= 0 then
    raise exception 'Production MTR must be positive';
  end if;
  if p_output_qty > p_input_qty then
    raise exception 'Output MTR cannot exceed input MTR';
  end if;
  if coalesce(p_rejection_qty,0) < 0 or p_rejection_qty > p_output_qty then
    raise exception 'Rejection MTR cannot exceed output MTR';
  end if;
  if coalesce(p_htc_ok,0) < 0 then
    raise exception 'HTC OK cannot be negative';
  end if;

  select ps.id into sid
  from public.process_stages ps
  join public.route_stages rs on rs.stage_id=ps.id
  where rs.route_id=p_route_id
    and rs.is_required
    and ps.stage_code=p_stage_code
    and ps.active;

  if sid is null then
    raise exception 'Stage is not part of selected route';
  end if;

  if p_stage_code <> 'ROLLING' and coalesce(p_htc_ok,0) <> 0 then
    raise exception 'HTC OK can only be entered at Rolling';
  end if;

  if p_stage_code='ROLLING' and p_htc_ok > p_output_qty-coalesce(p_rejection_qty,0) then
    raise exception 'HTC OK cannot exceed net rolling MTR';
  end if;

  -- Lock the work order so a concurrent production entry for the same
  -- work order/route can't read the same available balance before this
  -- one inserts (mirrors the FOR UPDATE already used in update/delete).
  perform 1 from public.work_orders where id=p_work_order_id for update;

  select q.balance_to_make_mtr into balance_mtr
  from public.get_production_entry_queue(p_stage_code) q
  where q.work_order_id=p_work_order_id
    and q.route_id=p_route_id
  limit 1;

  if balance_mtr is null then
    raise exception 'No eligible WIP found for this Work Order and route';
  end if;
  if p_input_qty > balance_mtr then
    raise exception 'Production MTR % exceeds available WIP MTR %',p_input_qty,balance_mtr;
  end if;

  insert into public.production_logs(
    work_order_id,stage_id,process_route_id,process_date,
    input_qty,output_qty,rejection_qty,htc_ok,heat_lot_no,remarks,created_by
  ) values (
    p_work_order_id,sid,p_route_id,p_process_date,
    p_input_qty,p_output_qty,coalesce(p_rejection_qty,0),coalesce(p_htc_ok,0),
    nullif(trim(p_heat_lot_no),''),nullif(trim(p_remarks),''),auth.uid()
  ) returning id into rec;

  update public.work_orders
  set status='In Progress'
  where id=p_work_order_id
    and status in ('Pending Plan','Scheduled');

  return rec;
end;
$$;
