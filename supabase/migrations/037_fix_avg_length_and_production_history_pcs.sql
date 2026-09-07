-- 037: Fix wo_avg_length, stage-aware pieces calculation, and add htc_ok_pcs to get_production_entries.
-- 1. wo_avg_length was returning NULL when l1 and l2 were null, causing mtr_to_pcs to return 0.
--    Now it falls back to ordered_qty_mtr / ordered_qty_pcs, or 6.0m.
-- 2. Stage-aware piece calculations ensure ROLLING and HOLLOW_HEAT_TREATMENT use Mother Hollow length.
-- 3. get_production_entries now returns htc_ok_pcs and computes pieces from stage-aware length.

create or replace function public.wo_avg_length(p_work_order_id uuid)
returns numeric language sql stable security definer set search_path=public as $$
  select coalesce(
    nullif((coalesce(l1, 0) + coalesce(l2, 0)) / 2, 0),
    case when coalesce(ordered_qty_pcs, 0) > 0 and coalesce(ordered_qty_mtr, 0) > 0
         then ordered_qty_mtr / ordered_qty_pcs
         else null
    end,
    6.0
  )
  from public.work_orders where id = p_work_order_id;
$$;

grant execute on function public.wo_avg_length(uuid) to authenticated, anon, service_role;

-- Stage-aware average length: Mother hollow length for Rolling & Hollow HT; finished tube length downstream.
create or replace function public.wo_stage_avg_length(p_work_order_id uuid, p_stage_code text default null)
returns numeric language sql stable security definer set search_path=public as $$
  select case
    when p_stage_code in ('ROLLING', 'HOLLOW_HEAT_TREATMENT') then
      coalesce(
        (select nullif((coalesce(rp.mh_l1, 0) + coalesce(rp.mh_l2, 0)) / 2, 0)
         from public.rolling_plans rp
         where rp.work_order_id = p_work_order_id
         order by rp.created_at desc limit 1),
        (select nullif(rp.mh_l1, 0)
         from public.rolling_plans rp
         where rp.work_order_id = p_work_order_id
         order by rp.created_at desc limit 1),
        public.wo_avg_length(p_work_order_id),
        6.0
      )
    else
      public.wo_avg_length(p_work_order_id)
  end;
$$;

grant execute on function public.wo_stage_avg_length(uuid, text) to authenticated, anon, service_role;

-- Drop and recreate get_production_entries to add htc_ok_pcs to return table
drop function if exists public.get_production_entries(text, text, text, date, date, integer, integer);

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
      not exists (
        select 1
        from public.production_logs newer
        where newer.work_order_id = pl.work_order_id
          and newer.process_route_id = pl.process_route_id
          and newer.created_at > pl.created_at
      ) as can_modify,
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

grant execute on function public.get_production_entries(text,text,text,date,date,integer,integer) to authenticated, anon, service_role;
