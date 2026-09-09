-- Migration 043: Ensure PO No, PO Date, Material Code (both short and full column names) on work_orders and update batch importer

alter table public.work_orders
  add column if not exists po_no text,
  add column if not exists po_date text,
  add column if not exists material_code text,
  add column if not exists purchase_order_no text,
  add column if not exists purchase_order_date text;

-- Sync any existing records
update public.work_orders
set
  purchase_order_no = coalesce(purchase_order_no, po_no),
  po_no = coalesce(po_no, purchase_order_no),
  purchase_order_date = coalesce(purchase_order_date, po_date),
  po_date = coalesce(po_date, purchase_order_date)
where purchase_order_no is null or po_no is null or purchase_order_date is null or po_date is null;

-- Update import_work_orders_batch RPC to guarantee both sets of columns are populated
create or replace function public.import_work_orders_batch(p_rows jsonb)
returns table(imported integer, failed integer, errors jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  v_ordered numeric;
  v_uom public.uom_type;
  v_errors jsonb := '[]'::jsonb;
  v_imported integer := 0;
  v_failed integer := 0;
  v_wo text;
  v_po text;
  v_po_date text;
  v_mat text;
begin
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Import payload must be a JSON array';
  end if;

  for r in select value from jsonb_array_elements(p_rows)
  loop
    begin
      v_wo := trim(coalesce(r->>'work_order_no', ''));
      if v_wo = '' then raise exception 'Work Order No is required'; end if;

      v_po := nullif(trim(coalesce(r->>'po_no', r->>'purchase_order_no', '')), '');
      v_po_date := nullif(trim(coalesce(r->>'po_date', r->>'purchase_order_date', '')), '');
      v_mat := nullif(trim(coalesce(r->>'material_code', r->>'item_code', '')), '');

      if coalesce((r->>'ordered_qty_pcs')::numeric, 0) > 0 then
        v_ordered := (r->>'ordered_qty_pcs')::numeric;
        v_uom := 'Pcs';
      elsif coalesce((r->>'ordered_qty_mtr')::numeric, 0) > 0 then
        v_ordered := (r->>'ordered_qty_mtr')::numeric;
        v_uom := 'Mtrs';
      elsif coalesce((r->>'ordered_qty_mt')::numeric, 0) > 0 then
        v_ordered := (r->>'ordered_qty_mt')::numeric;
        v_uom := 'Mtrs';
      else
        raise exception 'Order Qty is required';
      end if;

      insert into public.work_orders(
        work_order_no, customer_name, size_od, size_wt, grade,
        ordered_qty, uom, status,
        ordered_qty_pcs, ordered_qty_mtr, ordered_qty_mt,
        balance_qty_pcs, balance_qty_mtr, balance_qty_mt,
        l1, l2,
        po_no, po_date, material_code,
        purchase_order_no, purchase_order_date,
        updated_at
      ) values (
        v_wo,
        nullif(trim(coalesce(r->>'customer_name', '')), ''),
        nullif(r->>'od', '')::numeric,
        nullif(r->>'wl', '')::numeric,
        nullif(trim(coalesce(r->>'specification', '')), ''),
        v_ordered, v_uom, 'Pending Plan',
        greatest(coalesce((r->>'ordered_qty_pcs')::numeric, 0), 0),
        greatest(coalesce((r->>'ordered_qty_mtr')::numeric, 0), 0),
        greatest(coalesce((r->>'ordered_qty_mt')::numeric, 0), 0),
        greatest(coalesce((r->>'balance_qty_pcs')::numeric, 0), 0),
        greatest(coalesce((r->>'balance_qty_mtr')::numeric, 0), 0),
        greatest(coalesce((r->>'balance_qty_mt')::numeric, 0), 0),
        nullif(r->>'l1', '')::numeric,
        nullif(r->>'l2', '')::numeric,
        v_po,
        v_po_date,
        v_mat,
        v_po,
        v_po_date,
        now()
      )
      on conflict (work_order_no) do update set
        customer_name = coalesce(excluded.customer_name, public.work_orders.customer_name),
        size_od = coalesce(excluded.size_od, public.work_orders.size_od),
        size_wt = coalesce(excluded.size_wt, public.work_orders.size_wt),
        grade = coalesce(excluded.grade, public.work_orders.grade),
        ordered_qty = excluded.ordered_qty,
        uom = excluded.uom,
        ordered_qty_pcs = excluded.ordered_qty_pcs,
        ordered_qty_mtr = excluded.ordered_qty_mtr,
        ordered_qty_mt = excluded.ordered_qty_mt,
        balance_qty_pcs = excluded.balance_qty_pcs,
        balance_qty_mtr = excluded.balance_qty_mtr,
        balance_qty_mt = excluded.balance_qty_mt,
        l1 = coalesce(excluded.l1, public.work_orders.l1),
        l2 = coalesce(excluded.l2, public.work_orders.l2),
        po_no = coalesce(excluded.po_no, public.work_orders.po_no),
        po_date = coalesce(excluded.po_date, public.work_orders.po_date),
        material_code = coalesce(excluded.material_code, public.work_orders.material_code),
        purchase_order_no = coalesce(excluded.purchase_order_no, public.work_orders.purchase_order_no),
        purchase_order_date = coalesce(excluded.purchase_order_date, public.work_orders.purchase_order_date),
        updated_at = now();

      v_imported := v_imported + 1;
    exception when others then
      v_failed := v_failed + 1;
      if jsonb_array_length(v_errors) < 10 then
        v_errors := v_errors || jsonb_build_object(
          'work_order_no', v_wo,
          'error', sqlerrm
        );
      end if;
    end;
  end loop;

  return query select v_imported, v_failed, v_errors;
end;
$$;

grant execute on function public.import_work_orders_batch(jsonb) to authenticated, anon, service_role;
