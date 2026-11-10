-- Migration 095: Fix Excel Completion Authority for Rolling Balance & Protect In-Process Shop-Floor WIP
-- Description:
-- 1. Corrects import_work_orders_batch: 'balance_to_make_mtr' is the Hot Rolling Plan balance to roll,
--    NOT the customer order completion balance. When hot rolling finishes rolling a campaign,
--    balance_to_make_mtr becomes 0 while the pipes are just entering Cold Drawing, Heat Treatment, Band Saw, and VDI.
--    Removes balance_to_make_mtr < 5 from determining work order completion.
-- 2. Restores prematurely completed work orders that have pending balance (balance_qty_mtr >= 5) or
--    active in-process material produced upstream with 0 finishing output.

-- Step 1: Reopen any prematurely completed work orders with active in-process material or pending balance
UPDATE public.work_orders
SET status = 'In Progress', excel_completed = false
WHERE status = 'Completed'
  AND (
    coalesce(balance_qty_mtr, 0) >= 5
    OR id IN (
      SELECT pl.work_order_id
      FROM public.production_logs pl
      JOIN public.process_stages ps ON ps.id = pl.stage_id
      WHERE ps.stage_code IN ('HOT_ROLLING', 'ROLLING', 'HTC', 'DRAW', 'PILGER')
      EXCEPT
      SELECT pl2.work_order_id
      FROM public.production_logs pl2
      JOIN public.process_stages ps2 ON ps2.id = pl2.stage_id
      WHERE ps2.stage_code = 'FINISHING' AND coalesce(pl2.output_qty, 0) > 0
    )
  );

-- Step 2: Update import_work_orders_batch with strict customer order completion check
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
      -- Rule A: Commercial balance_qty_mtr < 5m indicates completion.
      -- Rule B: Explicit status 'completed', 'closed', 'done', 'dispatched'.
      -- NOTE: Never use balance_to_make_mtr (which is Hot Mill rolling plan balance) to mark order completed!
      v_is_completed := (
        (r->>'balance_qty_mtr' is not null and (r->>'balance_qty_mtr')::numeric < 5 and (r->>'balance_qty_mtr')::numeric >= 0 and v_ordered > 0)
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
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      v_errors := v_errors || jsonb_build_object('row', r, 'error', SQLERRM);
    END;
  END LOOP;

  RETURN QUERY SELECT v_imported, v_failed, v_errors;
END;
$$;
