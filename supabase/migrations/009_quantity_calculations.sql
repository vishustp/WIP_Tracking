-- Quantity calculation rules for downstream planning / WIP.
-- Work Orders keeps the raw Excel quantities and raw L1/L2 values.
-- Derived quantities are calculated when used by planning, diversion and production.

alter table public.work_orders
  add column if not exists l1 numeric,
  add column if not exists l2 numeric;

-- Replace the import RPC so L1/L2 are retained while existing Work Orders are
-- updated only when source data changes. Status is deliberately preserved.
create or replace function public.import_work_order(
  p_work_order_no text,
  p_customer_name text default '',
  p_specification text default '',
  p_od numeric default null,
  p_wl numeric default null,
  p_l1 numeric default null,
  p_l2 numeric default null,
  p_ordered_qty_pcs numeric default 0,
  p_ordered_qty_mtr numeric default 0,
  p_ordered_qty_mt numeric default 0,
  p_balance_qty_pcs numeric default 0,
  p_balance_qty_mtr numeric default 0,
  p_balance_qty_mt numeric default 0
) returns uuid
language plpgsql security definer set search_path=public
as $$
declare v_id uuid;
begin
  if trim(coalesce(p_work_order_no,''))='' then
    raise exception 'Work Order No is required';
  end if;

  insert into public.work_orders(
    work_order_no,customer_name,size_od,size_wt,grade,ordered_qty,uom,status,
    ordered_qty_pcs,ordered_qty_mtr,ordered_qty_mt,
    balance_qty_pcs,balance_qty_mtr,balance_qty_mt,l1,l2,updated_at
  ) values (
    trim(p_work_order_no),nullif(trim(coalesce(p_customer_name,'')),''),p_od,p_wl,
    nullif(trim(coalesce(p_specification,'')),''),
    case when coalesce(p_ordered_qty_pcs,0)>0 then p_ordered_qty_pcs
         when coalesce(p_ordered_qty_mtr,0)>0 then p_ordered_qty_mtr
         else p_ordered_qty_mt end,
    case when coalesce(p_ordered_qty_pcs,0)>0 then 'Pcs'::uom_type else 'Mtrs'::uom_type end,
    'Pending Plan',
    greatest(coalesce(p_ordered_qty_pcs,0),0),greatest(coalesce(p_ordered_qty_mtr,0),0),
    greatest(coalesce(p_ordered_qty_mt,0),0),greatest(coalesce(p_balance_qty_pcs,0),0),
    greatest(coalesce(p_balance_qty_mtr,0),0),greatest(coalesce(p_balance_qty_mt,0),0),
    p_l1,p_l2,now()
  )
  on conflict(work_order_no) do update set
    customer_name=excluded.customer_name,size_od=excluded.size_od,size_wt=excluded.size_wt,
    grade=excluded.grade,ordered_qty=excluded.ordered_qty,uom=excluded.uom,
    ordered_qty_pcs=excluded.ordered_qty_pcs,ordered_qty_mtr=excluded.ordered_qty_mtr,
    ordered_qty_mt=excluded.ordered_qty_mt,balance_qty_pcs=excluded.balance_qty_pcs,
    balance_qty_mtr=excluded.balance_qty_mtr,balance_qty_mt=excluded.balance_qty_mt,
    l1=excluded.l1,l2=excluded.l2,updated_at=now()
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.import_work_order(text,text,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric) to authenticated;

-- Average cut length used to convert metres to pieces.
create or replace function public.wo_avg_length(p_work_order_id uuid)
returns numeric language sql stable security definer set search_path=public as $$
  select nullif((coalesce(l1,0)+coalesce(l2,0))/2,0)
  from public.work_orders where id=p_work_order_id;
$$;

-- Convert metres to pieces using Average(L1,L2).
create or replace function public.mtr_to_pcs(p_work_order_id uuid,p_mtr numeric)
returns numeric language sql stable security definer set search_path=public as $$
  select case when public.wo_avg_length(p_work_order_id) is null then 0
              else greatest(coalesce(p_mtr,0),0)/public.wo_avg_length(p_work_order_id) end;
$$;

-- Convert metres to metric tonnes:
-- (OD-WT) * WT * 0.0246615 * 0.001 * MTR
create or replace function public.mtr_to_mt(p_work_order_id uuid,p_mtr numeric)
returns numeric language sql stable security definer set search_path=public as $$
  select greatest(coalesce(w.size_od,0)-coalesce(w.size_wt,0),0)
       * greatest(coalesce(w.size_wt,0),0)
       * 0.0246615 * 0.001 * greatest(coalesce(p_mtr,0),0)
  from public.work_orders w where w.id=p_work_order_id;
$$;

grant execute on function public.wo_avg_length(uuid) to authenticated;
grant execute on function public.mtr_to_pcs(uuid,numeric) to authenticated;
grant execute on function public.mtr_to_mt(uuid,numeric) to authenticated;

-- Normalized downstream quantity view. Raw Work Order columns remain untouched;
-- this view supplies calculated Pcs/Mtr/MT quantities for every planning/WIP row.
create or replace view public.vw_work_order_quantities as
select
  wo.id work_order_id,
  wo.work_order_no,
  wo.customer_name,
  wo.size_od od,
  wo.size_wt wt,
  wo.l1,
  wo.l2,
  wo.ordered_qty_pcs,
  wo.ordered_qty_mtr,
  wo.ordered_qty_mt,
  wo.balance_qty_pcs,
  wo.balance_qty_mtr,
  wo.balance_qty_mt,
  public.mtr_to_pcs(wo.id,wo.balance_qty_mtr) calculated_balance_pcs,
  public.mtr_to_mt(wo.id,wo.balance_qty_mtr) calculated_balance_mt
from public.work_orders wo;

grant select on public.vw_work_order_quantities to authenticated;
