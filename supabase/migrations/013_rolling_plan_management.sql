-- Rolling plan management: search/list, controlled edit, controlled delete.

create or replace function public.get_rolling_plans(
  p_search text default null,
  p_route_code text default null,
  p_from_date date default null,
  p_to_date date default null,
  p_limit integer default 500,
  p_offset integer default 0
)
returns table(
  id uuid,
  plan_no text,
  work_order_id uuid,
  work_order_no text,
  customer_name text,
  grade text,
  od numeric,
  wt numeric,
  l1 numeric,
  l2 numeric,
  avg_length numeric,
  route_id uuid,
  route_code text,
  route_name text,
  planned_rolling_date date,
  planned_mtr numeric,
  planned_pcs numeric,
  planned_mt numeric,
  target_mother_size text,
  multiple numeric,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  can_modify boolean
)
language sql
security definer
set search_path = public
as $function$
select
  rp.id,
  rp.plan_no,
  wo.id,
  wo.work_order_no,
  wo.customer_name,
  wo.grade,
  wo.size_od,
  wo.size_wt,
  wo.l1,
  wo.l2,
  public.wo_avg_length(wo.id),
  r.id,
  r.route_code,
  r.route_name,
  rp.planned_rolling_date,
  rp.planned_qty,
  public.mtr_to_pcs(wo.id, rp.planned_qty),
  public.mtr_to_mt(wo.id, rp.planned_qty),
  rp.target_mother_size,
  rp.multiple,
  rp.status,
  rp.created_at,
  rp.updated_at,
  not exists (
    select 1
    from public.production_logs pl
    where pl.work_order_id = rp.work_order_id
      and pl.process_route_id = rp.process_route_id
      and pl.created_at >= rp.created_at
  ) as can_modify
from public.rolling_plans rp
join public.work_orders wo on wo.id = rp.work_order_id
join public.process_routes r on r.id = rp.process_route_id
where (
  nullif(trim(coalesce(p_search, '')), '') is null
  or wo.work_order_no ilike '%' || trim(p_search) || '%'
  or coalesce(wo.customer_name, '') ilike '%' || trim(p_search) || '%'
  or coalesce(wo.grade, '') ilike '%' || trim(p_search) || '%'
  or rp.plan_no ilike '%' || trim(p_search) || '%'
)
and (p_route_code is null or r.route_code = p_route_code)
and (p_from_date is null or rp.planned_rolling_date >= p_from_date)
and (p_to_date is null or rp.planned_rolling_date <= p_to_date)
order by rp.planned_rolling_date desc, rp.created_at desc
limit greatest(1, least(coalesce(p_limit, 500), 2000))
offset greatest(coalesce(p_offset, 0), 0);
$function$;

grant execute on function public.get_rolling_plans(text,text,date,date,integer,integer) to authenticated;

create or replace function public.update_rolling_plan(
  p_plan_id uuid,
  p_planned_qty numeric,
  p_rolling_date date,
  p_route_id uuid,
  p_target_mother_size text,
  p_multiple numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  oldrec public.rolling_plans%rowtype;
  old_qty numeric;
  available_mtr numeric;
  new_unplanned numeric;
begin
  if public.app_current_role() not in ('Admin','PPC') then
    raise exception 'You do not have permission to edit Rolling Plans';
  end if;

  select * into oldrec
  from public.rolling_plans
  where id = p_plan_id
  for update;

  if oldrec.id is null then
    raise exception 'Rolling Plan not found';
  end if;

  if exists (
    select 1
    from public.production_logs pl
    where pl.work_order_id = oldrec.work_order_id
      and pl.process_route_id = oldrec.process_route_id
      and pl.created_at >= oldrec.created_at
  ) then
    raise exception 'Rolling Plan cannot be modified because production has already been recorded for this Work Order and route';
  end if;

  if p_planned_qty <= 0 then
    raise exception 'Planned MTR must be positive';
  end if;

  if p_multiple <= 0 then
    raise exception 'Multiple must be positive';
  end if;

  if not exists (
    select 1 from public.process_routes
    where id = p_route_id and active = true
  ) then
    raise exception 'Invalid route';
  end if;

  -- Available MTR excluding this plan's current allocation.
  select
    coalesce(wo.balance_qty_mtr, 0)
    - coalesce((
      select sum(rp.planned_qty)
      from public.rolling_plans rp
      where rp.work_order_id = oldrec.work_order_id
        and rp.id <> oldrec.id
    ),0)
    - coalesce((
      select sum(dp.diverted_qty)
      from public.diversion_plans dp
      where dp.source_wo_id = oldrec.work_order_id
    ),0)
  into available_mtr
  from public.work_orders wo
  where wo.id = oldrec.work_order_id;

  if p_planned_qty > greatest(available_mtr,0) then
    raise exception 'Planned MTR % exceeds available unplanned MTR %', p_planned_qty, greatest(available_mtr,0);
  end if;

  update public.rolling_plans
  set planned_qty = p_planned_qty,
      planned_rolling_date = p_rolling_date,
      process_route_id = p_route_id,
      target_mother_size = nullif(trim(coalesce(p_target_mother_size,'')),''),
      multiple = p_multiple
  where id = p_plan_id;
end;
$function$;

grant execute on function public.update_rolling_plan(uuid,numeric,date,uuid,text,numeric) to authenticated;

create or replace function public.delete_rolling_plan(p_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  oldrec public.rolling_plans%rowtype;
begin
  if public.app_current_role() not in ('Admin','PPC') then
    raise exception 'You do not have permission to delete Rolling Plans';
  end if;

  select * into oldrec
  from public.rolling_plans
  where id = p_plan_id
  for update;

  if oldrec.id is null then
    raise exception 'Rolling Plan not found';
  end if;

  if exists (
    select 1
    from public.production_logs pl
    where pl.work_order_id = oldrec.work_order_id
      and pl.process_route_id = oldrec.process_route_id
      and pl.created_at >= oldrec.created_at
  ) then
    raise exception 'Rolling Plan cannot be deleted because production has already been recorded for this Work Order and route';
  end if;

  delete from public.rolling_plans
  where id = p_plan_id;

  -- If no plans remain, return WO to planning state.
  if not exists (
    select 1 from public.rolling_plans
    where work_order_id = oldrec.work_order_id
  ) then
    update public.work_orders
    set status = 'Pending Plan'
    where id = oldrec.work_order_id
      and status = 'Scheduled';
  end if;
end;
$function$;

grant execute on function public.delete_rolling_plan(uuid) to authenticated;
