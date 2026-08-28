-- Production entry management: search all entries, controlled edit, controlled delete.

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
  heat_lot_no text,
  remarks text,
  created_at timestamptz,
  can_modify boolean
)
language sql
security definer
set search_path = public
as $function$
  select
    pl.id,
    wo.work_order_no,
    wo.customer_name,
    r.route_code,
    ps.stage_code,
    pl.process_date,
    wo.size_od,
    wo.size_wt,
    wo.l1,
    wo.l2,
    public.wo_avg_length(wo.id),
    pl.input_qty,
    public.mtr_to_pcs(wo.id, pl.input_qty),
    public.mtr_to_mt(wo.id, pl.input_qty),
    pl.output_qty,
    public.mtr_to_pcs(wo.id, pl.output_qty),
    public.mtr_to_mt(wo.id, pl.output_qty),
    pl.rejection_qty,
    public.mtr_to_pcs(wo.id, pl.rejection_qty),
    public.mtr_to_mt(wo.id, pl.rejection_qty),
    pl.htc_ok,
    pl.heat_lot_no,
    pl.remarks,
    pl.created_at,
    not exists (
      select 1
      from public.production_logs newer
      where newer.work_order_id = pl.work_order_id
        and newer.process_route_id = pl.process_route_id
        and newer.created_at > pl.created_at
    ) as can_modify
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
  order by pl.created_at desc
  limit greatest(1, least(coalesce(p_limit, 500), 2000))
  offset greatest(coalesce(p_offset, 0), 0);
$function$;

grant execute on function public.get_production_entries(text,text,text,date,date,integer,integer) to authenticated;

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
  planned_mtr numeric;
  produced_other_mtr numeric;
  max_allowed_mtr numeric;
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
    select
      coalesce((select sum(rp.planned_qty)
                from public.rolling_plans rp
                where rp.work_order_id = oldrec.work_order_id
                  and rp.process_route_id = oldrec.process_route_id),0)
      + coalesce((select sum(dp.diverted_qty)
                  from public.diversion_plans dp
                  where dp.target_wo_id = oldrec.work_order_id
                    and dp.process_route_id = oldrec.process_route_id),0)
    into planned_mtr;

    select coalesce(sum(pl.input_qty),0)
    into produced_other_mtr
    from public.production_logs pl
    where pl.work_order_id = oldrec.work_order_id
      and pl.process_route_id = oldrec.process_route_id
      and pl.stage_id = oldrec.stage_id
      and pl.id <> oldrec.id;

    max_allowed_mtr := planned_mtr * 1.10;
    if produced_other_mtr + p_output_qty > max_allowed_mtr + 0.000001 then
      raise exception 'Corrected Rolling production exceeds 110%% allowance. Maximum: % MTR', max_allowed_mtr;
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
  set process_date = p_process_date,
      input_qty = p_output_qty,
      output_qty = p_output_qty,
      rejection_qty = coalesce(p_rejection_qty,0),
      htc_ok = coalesce(p_htc_ok,0),
      heat_lot_no = nullif(trim(coalesce(p_heat_lot_no,'')),''),
      remarks = nullif(trim(coalesce(p_remarks,'')),'')
  where id = p_production_id;
end;
$function$;

grant execute on function public.update_production_entry(uuid,date,numeric,numeric,numeric,text,text) to authenticated;

create or replace function public.delete_production_entry(p_production_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  oldrec public.production_logs%rowtype;
begin
  if public.app_current_role() not in ('Admin','Production','QA') then
    raise exception 'You do not have permission to delete production entries';
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
    raise exception 'Only the latest production entry for this Work Order and route can be deleted';
  end if;

  delete from public.production_logs
  where id = p_production_id;
end;
$function$;

grant execute on function public.delete_production_entry(uuid) to authenticated;
