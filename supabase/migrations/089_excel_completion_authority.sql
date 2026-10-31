-- Migration 089: PPC Master Excel Completion Authority & Bundling Auto-Complete Decoupling
-- Description:
-- 1. Adds 'excel_completed' boolean column to public.work_orders to store PPC Excel completion authority.
-- 2. Updates import_work_orders_batch and import_work_order to update excel_completed and allow reopening
--    prematurely completed orders if incoming master Excel has pending balance (>= 5m) or open status.
-- 3. Decouples shop-floor bundling from unilateral commercial completion.

-- Step 1: Add excel_completed column to public.work_orders
ALTER TABLE public.work_orders 
  ADD COLUMN IF NOT EXISTS excel_completed boolean DEFAULT false;

-- Create performance index for status & completion lookups
CREATE INDEX IF NOT EXISTS idx_work_orders_excel_completed 
  ON public.work_orders(excel_completed, status);

-- Step 2: Backfill existing completed work orders
UPDATE public.work_orders 
SET excel_completed = true 
WHERE status = 'Completed' AND (balance_qty_mtr < 5 OR balance_qty_mtr IS NULL);

-- Step 3: Update import_work_orders_batch with Excel completion authority
CREATE OR REPLACE FUNCTION public.import_work_orders_batch(p_rows jsonb)
RETURNS TABLE(imported integer, failed integer, errors jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
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
BEGIN
  IF jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'Import payload must be a JSON array';
  END IF;

  FOR r IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    BEGIN
      v_wo := trim(coalesce(r->>'work_order_no', ''));
      IF v_wo = '' THEN RAISE EXCEPTION 'Work Order No is required'; END IF;

      v_po := nullif(trim(coalesce(r->>'po_no', r->>'purchase_order_no', '')), '');
      v_po_date := nullif(trim(coalesce(r->>'po_date', r->>'purchase_order_date', '')), '');
      v_mat := nullif(trim(coalesce(r->>'material_code', r->>'item_code', '')), '');
      v_dest := nullif(trim(coalesce(r->>'destination', r->>'Destination-2', r->>'destination_2', '')), '');

      IF coalesce((r->>'ordered_qty_pcs')::numeric, 0) > 0 THEN
        v_ordered := (r->>'ordered_qty_pcs')::numeric;
        v_uom := 'Pcs';
      ELSIF coalesce((r->>'ordered_qty_mtr')::numeric, 0) > 0 THEN
        v_ordered := (r->>'ordered_qty_mtr')::numeric;
        v_uom := 'Mtrs';
      ELSIF coalesce((r->>'ordered_qty_mt')::numeric, 0) > 0 THEN
        v_ordered := (r->>'ordered_qty_mt')::numeric;
        v_uom := 'Mtrs';
      ELSE
        RAISE EXCEPTION 'Order Qty is required';
      END IF;

      -- Check if row qualifies as Completed per PPC Master Excel:
      -- Rule A: Balance < 5m indicates completion.
      -- Rule B: Explicit status 'completed', 'closed', 'done', 'dispatched'.
      v_is_completed := (
        (r->>'balance_to_make_mtr' is not null and (r->>'balance_to_make_mtr')::numeric < 5 and (r->>'balance_to_make_mtr')::numeric >= 0)
        or (r->>'balance_qty_mtr' is not null and (r->>'balance_qty_mtr')::numeric < 5 and (r->>'balance_qty_mtr')::numeric >= 0)
        or lower(trim(coalesce(r->>'current_status', r->>'status', ''))) in ('completed', 'closed', 'done', 'dispatched')
      );

      v_initial_status := case when v_is_completed then 'Completed' else 'Pending Plan' end;

      INSERT INTO public.work_orders(
        work_order_no, customer_name, size_od, size_wt, grade,
        ordered_qty, uom, status, excel_completed,
        ordered_qty_pcs, ordered_qty_mtr, ordered_qty_mt,
        balance_qty_pcs, balance_qty_mtr, balance_qty_mt,
        l1, l2,
        po_no, po_date, material_code,
        purchase_order_no, purchase_order_date,
        destination,
        updated_at
      ) VALUES (
        v_wo,
        nullif(trim(coalesce(r->>'customer_name', '')), ''),
        nullif(r->>'od', '')::numeric,
        nullif(r->>'wl', '')::numeric,
        nullif(trim(coalesce(r->>'specification', '')), ''),
        v_ordered, v_uom, v_initial_status, v_is_completed,
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
      ON CONFLICT (work_order_no) DO UPDATE SET
        customer_name = coalesce(excluded.customer_name, public.work_orders.customer_name),
        size_od = coalesce(excluded.size_od, public.work_orders.size_od),
        size_wt = coalesce(excluded.size_wt, public.work_orders.size_wt),
        grade = coalesce(excluded.grade, public.work_orders.grade),
        ordered_qty = excluded.ordered_qty,
        uom = excluded.uom,
        ordered_qty_pcs = excluded.ordered_qty_pcs,
        ordered_qty_mtr = excluded.ordered_qty_mtr,
        ordered_qty_mt = excluded.ordered_qty_mt,
        -- RULE 1: Do NOT overwrite balance_qty_pcs, balance_qty_mtr, balance_qty_mt for existing orders!
        -- Ledger balance is preserved from mill operations.
        -- RULE 2: PPC Excel Completion Authority
        excel_completed = v_is_completed,
        status = CASE
          WHEN v_is_completed THEN 'Completed'
          -- Reopen order if Excel shows it is still active/pending and has balance to make:
          WHEN public.work_orders.status = 'Completed' AND NOT v_is_completed THEN 'In Progress'
          ELSE public.work_orders.status
        END,
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
    EXCEPTION WHEN others THEN
      v_failed := v_failed + 1;
      IF jsonb_array_length(v_errors) < 10 THEN
        v_errors := v_errors || jsonb_build_object(
          'work_order_no', v_wo,
          'error', sqlerrm
        );
      END IF;
    END;
  END LOOP;

  RETURN QUERY SELECT v_imported, v_failed, v_errors;
END;
$$;

GRANT EXECUTE ON FUNCTION public.import_work_orders_batch(jsonb) TO authenticated, anon, service_role;

-- Step 4: Update single-row fallback RPC
CREATE OR REPLACE FUNCTION public.import_work_order(
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
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE 
  v_id uuid;
  v_is_completed boolean;
BEGIN
  IF trim(coalesce(p_work_order_no,''))='' THEN
    RAISE EXCEPTION 'Work Order No is required';
  END IF;

  v_is_completed := coalesce(p_balance_qty_mtr, 0) < 5 AND coalesce(p_balance_qty_mtr, 0) >= 0;

  INSERT INTO public.work_orders(
    work_order_no, customer_name, size_od, size_wt, grade, ordered_qty, uom, status, excel_completed,
    ordered_qty_pcs, ordered_qty_mtr, ordered_qty_mt,
    balance_qty_pcs, balance_qty_mtr, balance_qty_mt, l1, l2, updated_at
  ) VALUES (
    trim(p_work_order_no), nullif(trim(coalesce(p_customer_name,'')),''), p_od, p_wl,
    nullif(trim(coalesce(p_specification,'')),''),
    CASE WHEN coalesce(p_ordered_qty_pcs,0)>0 THEN p_ordered_qty_pcs
         WHEN coalesce(p_ordered_qty_mtr,0)>0 THEN p_ordered_qty_mtr
         ELSE p_ordered_qty_mt END,
    CASE WHEN coalesce(p_ordered_qty_pcs,0)>0 THEN 'Pcs'::uom_type ELSE 'Mtrs'::uom_type END,
    CASE WHEN v_is_completed THEN 'Completed' ELSE 'Pending Plan' END,
    v_is_completed,
    greatest(coalesce(p_ordered_qty_pcs,0),0), greatest(coalesce(p_ordered_qty_mtr,0),0),
    greatest(coalesce(p_ordered_qty_mt,0),0), greatest(coalesce(p_balance_qty_pcs,0),0),
    greatest(coalesce(p_balance_qty_mtr,0),0), greatest(coalesce(p_balance_qty_mt,0),0),
    p_l1, p_l2, now()
  )
  ON CONFLICT(work_order_no) DO UPDATE SET
    customer_name = excluded.customer_name,
    size_od = excluded.size_od,
    size_wt = excluded.size_wt,
    grade = excluded.grade,
    ordered_qty = excluded.ordered_qty,
    uom = excluded.uom,
    ordered_qty_pcs = excluded.ordered_qty_pcs,
    ordered_qty_mtr = excluded.ordered_qty_mtr,
    ordered_qty_mt = excluded.ordered_qty_mt,
    excel_completed = v_is_completed,
    status = CASE
      WHEN v_is_completed THEN 'Completed'
      WHEN public.work_orders.status = 'Completed' AND NOT v_is_completed THEN 'In Progress'
      ELSE public.work_orders.status
    END,
    l1 = excluded.l1,
    l2 = excluded.l2,
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.import_work_order(text,text,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric) TO authenticated, anon, service_role;
