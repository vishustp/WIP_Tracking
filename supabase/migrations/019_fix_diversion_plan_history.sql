-- 019: Restore Diversion Plan history for the Diversion form.
-- The UI calls get_diversion_plans() for the Issued Diversion Plans table.
-- Keep history sourced directly from diversion_plans so every issued plan is visible.

create or replace function public.get_diversion_plans(
  p_search text default null,
  p_route_code text default null,
  p_work_center text default null,
  p_from_date date default null,
  p_to_date date default null,
  p_limit integer default 500
)
returns table(
  id uuid,
  source_wo_id uuid,
  source_wo_no text,
  source_customer text,
  source_grade text,
  source_size text,
  target_wo_id uuid,
  target_wo_no text,
  target_customer text,
  target_grade text,
  target_size text,
  diverted_qty numeric,
  diverted_pcs numeric,
  diverted_mt numeric,
  work_center text,
  work_center_name text,
  route_id uuid,
  route_code text,
  route_name text,
  multiple numeric,
  reason text,
  approved_by text,
  diversion_date date,
  created_at timestamptz,
  updated_at timestamptz,
  can_modify boolean
)
language sql
security definer
set search_path = public
as $$
  select
    dp.id,
    dp.source_wo_id,
    sw.work_order_no as source_wo_no,
    coalesce(sw.customer_name, '') as source_customer,
    coalesce(sw.grade, sw.specification, '') as source_grade,
    concat(coalesce(sw.size_od, 0), '×', coalesce(sw.size_wt, 0), ' mm') as source_size,
    dp.target_wo_id,
    tw.work_order_no as target_wo_no,
    coalesce(tw.customer_name, '') as target_customer,
    coalesce(tw.grade, tw.specification, '') as target_grade,
    concat(coalesce(tw.size_od, 0), '×', coalesce(tw.size_wt, 0), ' mm') as target_size,
    dp.diverted_qty,
    public.mtr_to_pcs(dp.source_wo_id, dp.diverted_qty) as diverted_pcs,
    public.mtr_to_mt(dp.source_wo_id, dp.diverted_qty) as diverted_mt,
    coalesce(dp.work_center, 'ROLLING') as work_center,
    coalesce(ps.stage_name, replace(coalesce(dp.work_center, 'ROLLING'), '_', ' ')) as work_center_name,
    dp.process_route_id as route_id,
    pr.route_code,
    pr.route_name,
    dp.multiple,
    dp.reason,
    coalesce((select u.email from auth.users u where u.id = dp.approved_by), dp.approved_by::text, '') as approved_by,
    dp.diversion_date,
    dp.created_at,
    dp.updated_at,
    true as can_modify
  from public.diversion_plans dp
  join public.work_orders sw on sw.id = dp.source_wo_id
  join public.work_orders tw on tw.id = dp.target_wo_id
  left join public.process_routes pr on pr.id = dp.process_route_id
  left join public.process_stages ps on ps.stage_code = coalesce(dp.work_center, 'ROLLING')
  where (p_route_code is null or pr.route_code = p_route_code)
    and (p_work_center is null or coalesce(dp.work_center, 'ROLLING') = p_work_center)
    and (p_from_date is null or dp.diversion_date >= p_from_date)
    and (p_to_date is null or dp.diversion_date <= p_to_date)
    and (
      nullif(trim(p_search), '') is null
      or dp.id::text ilike '%' || trim(p_search) || '%'
      or sw.work_order_no ilike '%' || trim(p_search) || '%'
      or tw.work_order_no ilike '%' || trim(p_search) || '%'
      or coalesce(sw.customer_name, '') ilike '%' || trim(p_search) || '%'
      or coalesce(tw.customer_name, '') ilike '%' || trim(p_search) || '%'
      or coalesce(dp.reason, '') ilike '%' || trim(p_search) || '%'
      or coalesce((select u.email from auth.users u where u.id = dp.approved_by), '') ilike '%' || trim(p_search) || '%'
    )
  order by dp.diversion_date desc, dp.created_at desc
  limit greatest(coalesce(p_limit, 500), 1);
$$;

grant execute on function public.get_diversion_plans(text,text,text,date,date,integer) to authenticated;
