-- Migration 046: Allow Rolling Production to be more than 10% of Rolling Plan
-- Business Rule Update:
-- 1. Rolling production can exceed 10% of the Rolling Plan (removes hard 110% ceiling on rolling).
-- 2. For child plans, rolling plan quantity is not issued separately; child plan uses master plan's rolling quantity.

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
  available_mtr numeric;
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
    raise exception 'Corrected Production MTR must be positive';
  end if;

  if coalesce(p_rejection_qty,0) < 0 or p_rejection_qty > p_output_qty then
    raise exception 'Rejection MTR cannot exceed corrected production MTR';
  end if;

  if coalesce(p_htc_ok,0) < 0 then
    raise exception 'HTC OK cannot be negative';
  end if;

  if stage_code_value <> 'ROLLING' and coalesce(p_htc_ok,0) <> 0 then
    raise exception 'HTC OK can only be entered at Rolling';
  end if;

  if stage_code_value = 'ROLLING'
     and p_htc_ok > p_output_qty - coalesce(p_rejection_qty,0) then
    raise exception 'HTC OK cannot exceed net rolling MTR';
  end if;

  if stage_code_value = 'ROLLING' then
    -- RULE: Rolling Production can be more than 10% of the Rolling Plan.
    -- No hard 110% restriction is enforced on Rolling stage.
    null;
  else
    select q.balance_to_make_mtr + oldrec.input_qty
    into available_mtr
    from public.get_production_entry_queue(stage_code_value) q
    where q.work_order_id = oldrec.work_order_id
      and q.route_id = oldrec.process_route_id
    limit 1;

    if available_mtr is null then
      raise exception 'No eligible WIP found for this Work Order and route';
    end if;

    if p_output_qty > available_mtr + 0.000001 then
      raise exception 'Corrected Production MTR % exceeds available WIP MTR %', p_output_qty, available_mtr;
    end if;
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

grant execute on function public.update_production_entry(uuid,date,numeric,numeric,numeric,text,text) to authenticated;
