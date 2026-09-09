-- Migration 041: Add PO No, PO Date, and Material Code to work_orders and update import RPC

alter table public.work_orders
  add column if not exists po_no text,
  add column if not exists po_date text,
  add column if not exists material_code text;

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
begin
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Import payload must be a JSON array';
  end if;

  for r in select value from jsonb_array_elements(p_rows)
  loop
    begin
      v_wo := trim(coalesce(r->>'work_order_no', ''));
      if v_wo = '' then raise exception 'Work Order No is required'; end if;

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
        nullif(trim(coalesce(r->>'po_no', '')), ''),
        nullif(trim(coalesce(r->>'po_date', '')), ''),
        nullif(trim(coalesce(r->>'material_code', '')), ''),
        now()
      )
      on conflict (work_order_no) do update set
        customer_name = excluded.customer_name,
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
        l1 = coalesce(excluded.l1, public.work_orders.l1),
        l2 = coalesce(excluded.l2, public.work_orders.l2),
        po_no = coalesce(excluded.po_no, public.work_orders.po_no),
        po_date = coalesce(excluded.po_date, public.work_orders.po_date),
        material_code = coalesce(excluded.material_code, public.work_orders.material_code),
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
