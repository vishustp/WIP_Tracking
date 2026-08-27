-- Excel Work Order import backend
-- Run this migration AFTER the base WIP schema has been created.

alter table public.work_orders
  add column if not exists ordered_qty_pcs numeric not null default 0 check (ordered_qty_pcs >= 0),
  add column if not exists ordered_qty_mtr numeric not null default 0 check (ordered_qty_mtr >= 0),
  add column if not exists ordered_qty_mt numeric not null default 0 check (ordered_qty_mt >= 0),
  add column if not exists balance_qty_pcs numeric not null default 0 check (balance_qty_pcs >= 0),
  add column if not exists balance_qty_mtr numeric not null default 0 check (balance_qty_mtr >= 0),
  add column if not exists balance_qty_mt numeric not null default 0 check (balance_qty_mt >= 0);

create or replace function public.import_work_order(
  p_work_order_no text,
  p_customer_name text default '',
  p_specification text default '',
  p_od numeric default null,
  p_wl numeric default null,
  p_ordered_qty_pcs numeric default 0,
  p_ordered_qty_mtr numeric default 0,
  p_ordered_qty_mt numeric default 0,
  p_balance_qty_pcs numeric default 0,
  p_balance_qty_mtr numeric default 0,
  p_balance_qty_mt numeric default 0
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_ordered_qty numeric;
  v_uom uom_type;
begin
  if trim(coalesce(p_work_order_no, '')) = '' then
    raise exception 'Work Order No is required';
  end if;

  if coalesce(p_ordered_qty_pcs, 0) < 0
     or coalesce(p_ordered_qty_mtr, 0) < 0
     or coalesce(p_ordered_qty_mt, 0) < 0
     or coalesce(p_balance_qty_pcs, 0) < 0
     or coalesce(p_balance_qty_mtr, 0) < 0
     or coalesce(p_balance_qty_mt, 0) < 0 then
    raise exception 'Quantity cannot be negative for Work Order %', p_work_order_no;
  end if;

  -- The planning engine currently uses one ordered_qty + UOM.
  -- Prefer Pcs, then Mtrs; MT is retained in the dedicated Excel fields.
  if coalesce(p_ordered_qty_pcs, 0) > 0 then
    v_ordered_qty := p_ordered_qty_pcs;
    v_uom := 'Pcs';
  elsif coalesce(p_ordered_qty_mtr, 0) > 0 then
    v_ordered_qty := p_ordered_qty_mtr;
    v_uom := 'Mtrs';
  elsif coalesce(p_ordered_qty_mt, 0) > 0 then
    -- Existing planning schema has no MT UOM, so retain MT separately and
    -- use the MT quantity as the planning quantity in Mtrs only when no
    -- Pcs/Mtrs quantity exists. This keeps the imported row usable while
    -- preserving the actual MT value in ordered_qty_mt.
    v_ordered_qty := p_ordered_qty_mt;
    v_uom := 'Mtrs';
  else
    raise exception 'Order Qty is required for Work Order %', p_work_order_no;
  end if;

  insert into public.work_orders (
    work_order_no,
    customer_name,
    size_od,
    size_wt,
    grade,
    ordered_qty,
    uom,
    status,
    ordered_qty_pcs,
    ordered_qty_mtr,
    ordered_qty_mt,
    balance_qty_pcs,
    balance_qty_mtr,
    balance_qty_mt,
    updated_at
  )
  values (
    trim(p_work_order_no),
    nullif(trim(coalesce(p_customer_name, '')), ''),
    p_od,
    p_wl,
    nullif(trim(coalesce(p_specification, '')), ''),
    v_ordered_qty,
    v_uom,
    'Pending Plan',
    greatest(coalesce(p_ordered_qty_pcs, 0), 0),
    greatest(coalesce(p_ordered_qty_mtr, 0), 0),
    greatest(coalesce(p_ordered_qty_mt, 0), 0),
    greatest(coalesce(p_balance_qty_pcs, 0), 0),
    greatest(coalesce(p_balance_qty_mtr, 0), 0),
    greatest(coalesce(p_balance_qty_mt, 0), 0),
    now()
  )
  on conflict (work_order_no) do update
  set customer_name = excluded.customer_name,
      size_od = excluded.size_od,
      size_wt = excluded.size_wt,
      grade = excluded.grade,
      ordered_qty = excluded.ordered_qty,
      uom = excluded.uom,
      ordered_qty_pcs = excluded.ordered_qty_pcs,
      ordered_qty_mtr = excluded.ordered_qty_mtr,
      ordered_qty_mt = excluded.ordered_qty_mt,
      balance_qty_pcs = excluded.balance_qty_pcs,
      balance_qty_mtr = excluded.balance_qty_mtr,
      balance_qty_mt = excluded.balance_qty_mt,
      updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.import_work_order(
  text,text,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric
) to authenticated;
