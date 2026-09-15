-- Migration 048: Support Elongation-Based Calculations for Draw Bench Production & Heat Treatment WIP
-- Business Rules:
-- 1. Cold Draw Bench (DRAW) draws Mother Hollow (MH) into elongated, finished-diameter pipe.
-- 2. Elongation factor mu = Area(MH) / Area(Final) = (MH_OD - MH_WT)*MH_WT / ((Order_OD - Order_WT)*Order_WT).
-- 3. Draw queue balance represents available incoming Mother Hollow MTR.
-- 4. Drawn production output is validated against (available MH MTR * Elongation) with reasonable shop-floor tolerance.
-- 5. Heat Treatment (HEAT_TREATMENT) WIP receives net drawn pipe with final OD, WT, and drawn lengths.

-- Update record_production to support DRAW elongation
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
  v_mh_od numeric;
  v_mh_wt numeric;
  v_order_od numeric;
  v_order_wt numeric;
  v_area_mh numeric;
  v_area_final numeric;
  v_elongation numeric := 1.0;
  v_max_output_mtr numeric;
begin
  if public.app_current_role() not in ('Admin','Production','QA') then
    raise exception 'You do not have permission to record production';
  end if;

  if p_input_qty is null or p_output_qty is null or p_input_qty <= 0 or p_output_qty <= 0 then
    raise exception 'Production MTR must be positive';
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

  if balance_mtr is null and p_stage_code <> 'ROLLING' then
    raise exception 'No eligible WIP found for this Work Order and route';
  end if;

  if p_stage_code = 'DRAW' then
    -- Calculate elongation factor from MH to Final dimensions
    select coalesce(rp.mh_od, 0), coalesce(rp.mh_wt, 0), coalesce(wo.size_od, 0), coalesce(wo.size_wt, 0)
    into v_mh_od, v_mh_wt, v_order_od, v_order_wt
    from public.work_orders wo
    left join public.rolling_plans rp on rp.work_order_id = wo.id
    where wo.id = p_work_order_id
    order by rp.created_at desc limit 1;

    if v_mh_od > v_mh_wt and v_mh_wt > 0 and v_order_od > v_order_wt and v_order_wt > 0 then
      v_area_mh := (v_mh_od - v_mh_wt) * v_mh_wt;
      v_area_final := (v_order_od - v_order_wt) * v_order_wt;
      if v_area_final > 0 then
        v_elongation := v_area_mh / v_area_final;
      end if;
    end if;

    v_max_output_mtr := (coalesce(balance_mtr, p_input_qty) * v_elongation) * 1.15;

    if p_output_qty > v_max_output_mtr + 0.000001 then
      raise exception 'Draw Production MTR % exceeds maximum available drawn MTR % (available MH MTR % × elongation %)',
        p_output_qty, round(v_max_output_mtr, 2), round(balance_mtr, 2), round(v_elongation, 2);
    end if;
  elsif p_stage_code <> 'ROLLING' then
    if p_output_qty > p_input_qty then
      raise exception 'Output MTR cannot exceed input MTR';
    end if;
    if balance_mtr is not null and p_input_qty > balance_mtr + 0.000001 then
      raise exception 'Production MTR % exceeds available WIP MTR %', p_input_qty, balance_mtr;
    end if;
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

-- Update update_production_entry to support DRAW elongation
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
  v_mh_od numeric;
  v_mh_wt numeric;
  v_order_od numeric;
  v_order_wt numeric;
  v_area_mh numeric;
  v_area_final numeric;
  v_elongation numeric := 1.0;
  v_max_drawn_mtr numeric;
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
    null;
  elsif stage_code_value = 'DRAW' then
    -- For DRAW stage: calculate elongation factor from Mother Hollow to Final dimensions
    select coalesce(rp.mh_od, 0), coalesce(rp.mh_wt, 0), coalesce(wo.size_od, 0), coalesce(wo.size_wt, 0)
    into v_mh_od, v_mh_wt, v_order_od, v_order_wt
    from public.work_orders wo
    left join public.rolling_plans rp on rp.work_order_id = wo.id
    where wo.id = oldrec.work_order_id
    order by rp.created_at desc limit 1;

    if v_mh_od > v_mh_wt and v_mh_wt > 0 and v_order_od > v_order_wt and v_order_wt > 0 then
      v_area_mh := (v_mh_od - v_mh_wt) * v_mh_wt;
      v_area_final := (v_order_od - v_order_wt) * v_order_wt;
      if v_area_final > 0 then
        v_elongation := v_area_mh / v_area_final;
      end if;
    end if;

    select coalesce(q.balance_to_make_mtr, 0) + (oldrec.input_qty / greatest(v_elongation, 1.0))
    into available_mtr
    from public.get_production_entry_queue('DRAW') q
    where q.work_order_id = oldrec.work_order_id
      and q.route_id = oldrec.process_route_id
    limit 1;

    if available_mtr is null then
      available_mtr := oldrec.input_qty / greatest(v_elongation, 1.0);
    end if;

    v_max_drawn_mtr := (available_mtr * v_elongation) * 1.15;

    if p_output_qty > v_max_drawn_mtr + 0.000001 then
      raise exception 'Corrected Draw Production MTR % exceeds maximum available drawn MTR % (available MH MTR % × elongation %)',
        p_output_qty, round(v_max_drawn_mtr, 2), round(available_mtr, 2), round(v_elongation, 2);
    end if;
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

grant execute on function public.update_production_entry(uuid,date,numeric,numeric,numeric,text,text) to authenticated, anon, service_role;
