-- Migration 058: Preserve WIP Balance and Auto-Complete on Work Order Excel Import
-- Rule 1: Do NOT update balance_qty_pcs, balance_qty_mtr, balance_qty_mt for existing orders on conflict.
-- Rule 2: If balance_to_make < 5 meters or current_status is Completed/Closed/Done/Dispatched, mark status as 'Completed'.

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
  v_dest text;
  v_is_completed boolean;
  v_initial_status text;
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
      v_dest := nullif(trim(coalesce(r->>'destination', r->>'Destination-2', r->>'destination_2', '')), '');

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

      -- Check if row qualifies for auto-completion (Rule 2)
      v_is_completed := (
        (r->>'balance_to_make_mtr' is not null and (r->>'balance_to_make_mtr')::numeric < 5 and (r->>'balance_to_make_mtr')::numeric >= 0)
        or (r->>'balance_qty_mtr' is not null and (r->>'balance_qty_mtr')::numeric < 5 and (r->>'balance_qty_mtr')::numeric >= 0)
        or lower(trim(coalesce(r->>'current_status', r->>'status', ''))) in ('completed', 'closed', 'done', 'dispatched')
      );

      v_initial_status := case when v_is_completed then 'Completed' else 'Pending Plan' end;

      insert into public.work_orders(
        work_order_no, customer_name, size_od, size_wt, grade,
        ordered_qty, uom, status,
        ordered_qty_pcs, ordered_qty_mtr, ordered_qty_mt,
        balance_qty_pcs, balance_qty_mtr, balance_qty_mt,
        l1, l2,
        po_no, po_date, material_code,
        purchase_order_no, purchase_order_date,
        destination,
        updated_at
      ) values (
        v_wo,
        nullif(trim(coalesce(r->>'customer_name', '')), ''),
        nullif(r->>'od', '')::numeric,
        nullif(r->>'wl', '')::numeric,
        nullif(trim(coalesce(r->>'specification', '')), ''),
        v_ordered, v_uom, v_initial_status,
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
        v_dest,
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
        -- RULE 1: Do NOT update balance_qty_pcs, balance_qty_mtr, balance_qty_mt for existing orders!
        -- They are omitted from update so current ledger balance is strictly preserved.
        -- RULE 2: If completed or balance to make < 5 mtr, mark as 'Completed':
        status = case
          when (
            (r->>'balance_to_make_mtr' is not null and (r->>'balance_to_make_mtr')::numeric < 5 and (r->>'balance_to_make_mtr')::numeric >= 0)
            or (r->>'balance_qty_mtr' is not null and (r->>'balance_qty_mtr')::numeric < 5 and (r->>'balance_qty_mtr')::numeric >= 0)
            or lower(trim(coalesce(r->>'current_status', r->>'status', ''))) in ('completed', 'closed', 'done', 'dispatched')
          ) then 'Completed'
          else public.work_orders.status
        end,
        l1 = coalesce(excluded.l1, public.work_orders.l1),
        l2 = coalesce(excluded.l2, public.work_orders.l2),
        po_no = coalesce(excluded.po_no, public.work_orders.po_no),
        po_date = coalesce(excluded.po_date, public.work_orders.po_date),
        material_code = coalesce(excluded.material_code, public.work_orders.material_code),
        purchase_order_no = coalesce(excluded.purchase_order_no, public.work_orders.purchase_order_no),
        purchase_order_date = coalesce(excluded.purchase_order_date, public.work_orders.purchase_order_date),
        destination = coalesce(excluded.destination, public.work_orders.destination),
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

-- Update single-row fallback RPC
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
    case when coalesce(p_balance_qty_mtr,0) < 5 and coalesce(p_balance_qty_mtr,0) >= 0 then 'Completed' else 'Pending Plan' end,
    greatest(coalesce(p_ordered_qty_pcs,0),0),greatest(coalesce(p_ordered_qty_mtr,0),0),
    greatest(coalesce(p_ordered_qty_mt,0),0),greatest(coalesce(p_balance_qty_pcs,0),0),
    greatest(coalesce(p_balance_qty_mtr,0),0),greatest(coalesce(p_balance_qty_mt,0),0),
    p_l1,p_l2,now()
  )
  on conflict(work_order_no) do update set
    customer_name=excluded.customer_name,size_od=excluded.size_od,size_wt=excluded.size_wt,
    grade=excluded.grade,ordered_qty=excluded.ordered_qty,uom=excluded.uom,
    ordered_qty_pcs=excluded.ordered_qty_pcs,ordered_qty_mtr=excluded.ordered_qty_mtr,
    ordered_qty_mt=excluded.ordered_qty_mt,
    -- RULE 1: Do NOT update balance_qty_pcs, balance_qty_mtr, balance_qty_mt
    -- RULE 2: If balance < 5 mtr, mark Completed
    status = case
      when coalesce(p_balance_qty_mtr, 0) < 5 and coalesce(p_balance_qty_mtr, 0) >= 0 then 'Completed'
      else public.work_orders.status
    end,
    l1=excluded.l1,l2=excluded.l2,updated_at=now()
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.import_work_order(text,text,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric) to authenticated, anon, service_role;
