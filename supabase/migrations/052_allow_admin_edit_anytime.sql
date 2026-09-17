-- Migration 052: Allow Admin and Super Users to edit/delete production history entries anytime
-- Removes the sequential lock when next entries exist, allowing full retroactive admin corrections.

-- 1. Update update_production_entry to allow Admin edit anytime
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
  current_user_role text;
begin
  current_user_role := coalesce(public.app_current_role(), 'Admin');

  select * into oldrec
  from public.production_logs
  where id = p_production_id
  for update;

  if oldrec.id is null then
    raise exception 'Production entry not found';
  end if;

  -- Only enforce "latest entry only" restriction for non-admin/regular operators
  if current_user_role not in ('Admin', 'Super User', 'Production', 'QA') then
    if exists (
      select 1
      from public.production_logs x
      where x.work_order_id = oldrec.work_order_id
        and x.process_route_id = oldrec.process_route_id
        and x.created_at > oldrec.created_at
    ) then
      raise exception 'Only the latest production entry can be corrected by regular operators. Contact Admin for retroactive corrections.';
    end if;
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

-- 2. Update delete_production_entry to allow Admin delete anytime
create or replace function public.delete_production_entry(p_production_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  oldrec public.production_logs%rowtype;
  current_user_role text;
begin
  current_user_role := coalesce(public.app_current_role(), 'Admin');

  select * into oldrec
  from public.production_logs
  where id = p_production_id
  for update;

  if oldrec.id is null then
    raise exception 'Production entry not found';
  end if;

  -- Only enforce "latest entry only" restriction for regular operators
  if current_user_role not in ('Admin', 'Super User', 'Production', 'QA') then
    if exists (
      select 1
      from public.production_logs x
      where x.work_order_id = oldrec.work_order_id
        and x.process_route_id = oldrec.process_route_id
        and x.created_at > oldrec.created_at
    ) then
      raise exception 'Only the latest production entry can be deleted by regular operators. Contact Admin for override.';
    end if;
  end if;

  delete from public.production_logs
  where id = p_production_id;
end;
$function$;

grant execute on function public.delete_production_entry(uuid) to authenticated, anon, service_role;

-- 3. Update get_production_history function to mark can_modify as true for Admins
create or replace function public.get_production_history(
  p_search text default null,
  p_stage_code text default null,
  p_route_code text default null,
  p_from_date date default null,
  p_to_date date default null,
  p_limit integer default 500,
  p_offset integer default 0
)
returns table (
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
  htc_ok_pcs numeric,
  heat_lot_no text,
  remarks text,
  created_at timestamptz,
  can_modify boolean
)
language sql
security definer
set search_path = public
as $function$
  with base as (
    select
      pl.id,
      wo.work_order_no,
      wo.customer_name,
      r.route_code,
      ps.stage_code,
      pl.process_date,
      wo.size_od as od,
      wo.size_wt as wl,
      wo.l1,
      wo.l2,
      public.wo_stage_avg_length(wo.id, ps.stage_code) as stage_len,
      pl.input_qty as in_mtr,
      pl.output_qty as out_mtr,
      pl.rejection_qty as rej_mtr,
      pl.htc_ok as htc_mtr,
      pl.heat_lot_no,
      pl.remarks,
      pl.created_at,
      case
        when coalesce(public.app_current_role(), '') in ('Admin', 'Super User') then true
        else not exists (
          select 1
          from public.production_logs newer
          where newer.work_order_id = pl.work_order_id
            and newer.process_route_id = pl.process_route_id
            and newer.created_at > pl.created_at
        )
      end as can_modify,
      wo.id as work_order_id
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
  )
  select
    b.id,
    b.work_order_no,
    b.customer_name,
    b.route_code,
    b.stage_code,
    b.process_date,
    b.od,
    b.wl,
    b.l1,
    b.l2,
    b.stage_len as avg_length,
    b.in_mtr as input_mtr,
    round(b.in_mtr / nullif(b.stage_len, 0)) as input_pcs,
    public.mtr_to_mt(b.work_order_id, b.in_mtr) as input_mt,
    b.out_mtr as output_mtr,
    round(b.out_mtr / nullif(b.stage_len, 0)) as output_pcs,
    public.mtr_to_mt(b.work_order_id, b.out_mtr) as output_mt,
    b.rej_mtr as rejection_mtr,
    round(b.rej_mtr / nullif(b.stage_len, 0)) as rejection_pcs,
    public.mtr_to_mt(b.work_order_id, b.rej_mtr) as rejection_mt,
    b.htc_mtr as htc_ok_mtr,
    round(b.htc_mtr / nullif(b.stage_len, 0)) as htc_ok_pcs,
    b.heat_lot_no,
    b.remarks,
    b.created_at,
    b.can_modify
  from base b
  order by b.created_at desc
  limit greatest(1, least(coalesce(p_limit, 500), 2000))
  offset greatest(coalesce(p_offset, 0), 0);
$function$;

grant execute on function public.get_production_history(text,text,text,date,date,integer,integer) to authenticated, anon, service_role;
