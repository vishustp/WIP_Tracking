-- Production entry is executed through a controlled RPC so the insert/update is not blocked by table RLS.
-- The function still enforces the application role explicitly.

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

grant execute on function public.record_production(uuid,uuid,text,date,numeric,numeric,numeric,numeric,text,text) to authenticated;
