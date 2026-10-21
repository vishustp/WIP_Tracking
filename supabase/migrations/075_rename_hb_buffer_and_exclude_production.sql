-- 075_rename_hb_buffer_and_exclude_production.sql
-- 1. Rename HB-BUFFER virtual work order to 'Hollow bank'
update public.work_orders
set work_order_no = 'Hollow bank',
    customer_name = 'Hollow bank'
where id = '00000000-0000-0000-0000-00000000000b';

-- 2. Also ensure future conflict upserts preserve 'Hollow bank'
insert into public.work_orders(id, work_order_no, customer_name, status, size_od, size_wt, ordered_qty, uom, grade)
values (
  '00000000-0000-0000-0000-00000000000b',
  'Hollow bank',
  'Hollow bank',
  'In Progress',
  1,
  1,
  999999,
  'Mtrs'::public.uom_type,
  'BUFFER'
) on conflict (id) do update set
  work_order_no = excluded.work_order_no,
  customer_name = excluded.customer_name;

-- 3. Exclude Hollow bank virtual buffer work order from production entry queue RPC
create or replace function public.get_production_entry_queue(p_stage_code text)
returns table(
  work_order_id uuid, work_order_no text, customer_name text, specification text,
  od numeric, wl numeric, l1 numeric, l2 numeric, avg_length numeric,
  route_id uuid, route_code text, route_name text, stage_code text,
  balance_to_make_mtr numeric, balance_to_make_pcs numeric, balance_to_make_mt numeric,
  multiple numeric
) language sql security definer set search_path=public as $$
select w.work_order_id, w.work_order_no, w.customer_name,
       wo.grade as specification, w.size_od as od, w.size_wt as wl,
       wo.l1, wo.l2, public.wo_avg_length(w.work_order_id) as avg_length,
       w.route_id, w.route_code, w.route_name, w.stage_code,
       w.current_wip as balance_to_make_mtr,
       public.mtr_to_pcs(w.work_order_id, w.current_wip) as balance_to_make_pcs,
       public.mtr_to_mt(w.work_order_id, w.current_wip) as balance_to_make_mt,
       coalesce((select max(dp.multiple) from public.diversion_plans dp
                 where dp.target_wo_id = w.work_order_id
                   and dp.process_route_id = w.route_id
                   and dp.work_center = w.stage_code),
                (select max(rp.multiple) from public.rolling_plans rp
                 where rp.work_order_id = w.work_order_id
                   and rp.process_route_id = w.route_id), 1) as multiple
from public.vw_route_stage_wip w
join public.work_orders wo on wo.id = w.work_order_id
where w.stage_code = p_stage_code 
  and w.current_wip > 0
  and w.work_order_id <> '00000000-0000-0000-0000-00000000000b'
order by w.work_order_no, w.route_code;
$$;

grant execute on function public.get_production_entry_queue(text) to authenticated, anon, service_role;
