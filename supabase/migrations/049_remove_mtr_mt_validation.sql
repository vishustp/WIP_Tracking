-- Drop existing functions first to prevent parameter default conflict errors
drop function if exists public.update_production_entry(uuid,date,numeric,numeric,numeric,text,text);
drop function if exists public.record_production(uuid,uuid,text,date,numeric,numeric,numeric,numeric,text,text);

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
begin
  if public.app_current_role() not in ('Admin','Production','QA') then
    raise exception 'You do not have permission to record production';
  end if;

  if p_input_qty is null or p_output_qty is null or p_input_qty <= 0 or p_output_qty <= 0 then
    raise exception 'Production quantity must be positive';
  end if;

  if coalesce(p_rejection_qty,0) < 0 or p_rejection_qty > p_output_qty then
    raise exception 'Rejection cannot exceed output';
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
    raise exception 'HTC OK cannot exceed net rolling quantity';
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

grant execute on function public.record_production(uuid,uuid,text,date,numeric,numeric,numeric,numeric,text,text) to authenticated, anon, service_role;

create or replace function public.update_production_entry(
  p_production_id uuid,
  p_process_date date,
  p_output_qty numeric,
  p_rejection_qty numeric,
  p_htc_ok numeric,
  p_heat_lot_no text,
  p_remarks text
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  oldrec public.production_logs%rowtype;
  stage_code_value text;
begin
  if public.app_current_role() not in ('Admin','Production','QA') then
    raise exception 'You do not have permission to edit production entries';
  end if;

  select * into oldrec
  from public.production_logs
  where id = p_production_id
  for update;

  if oldrec.id is null then
    raise exception 'Production entry not found';
  end if;

  if exists (
    select 1
    from public.production_logs x
    where x.work_order_id = oldrec.work_order_id
      and x.process_route_id = oldrec.process_route_id
      and x.created_at > oldrec.created_at
  ) then
    raise exception 'Only the latest production entry for this Work Order and route can be corrected';
  end if;

  select ps.stage_code into stage_code_value
  from public.process_stages ps
  where ps.id = oldrec.stage_id;

  if p_process_date is null then
    raise exception 'Production date is required';
  end if;

  if p_output_qty is null or p_output_qty <= 0 then
    raise exception 'Production quantity must be positive';
  end if;

  if coalesce(p_rejection_qty,0) < 0 or p_rejection_qty > p_output_qty then
    raise exception 'Rejection cannot exceed production quantity';
  end if;

  if coalesce(p_htc_ok,0) < 0 then
    raise exception 'HTC OK cannot be negative';
  end if;

  if stage_code_value <> 'ROLLING' and coalesce(p_htc_ok,0) <> 0 then
    raise exception 'HTC OK can only be entered at Rolling';
  end if;

  if stage_code_value = 'ROLLING'
     and p_htc_ok > p_output_qty - coalesce(p_rejection_qty,0) then
    raise exception 'HTC OK cannot exceed net rolling quantity';
  end if;

  update public.production_logs
  set
    process_date = p_process_date,
    input_qty = p_output_qty,
    output_qty = p_output_qty,
    rejection_qty = coalesce(p_rejection_qty, 0),
    htc_ok = case when stage_code_value = 'ROLLING' then coalesce(p_htc_ok, 0) else 0 end,
    heat_lot_no = nullif(trim(coalesce(p_heat_lot_no, '')), ''),
    remarks = nullif(trim(coalesce(p_remarks, '')), '')
  where id = p_production_id;
end;
$function$;

grant execute on function public.update_production_entry(uuid,date,numeric,numeric,numeric,text,text) to authenticated, anon, service_role;
