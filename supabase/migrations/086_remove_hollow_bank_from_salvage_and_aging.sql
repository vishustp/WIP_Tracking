-- Migration 086: Remove Hollow Bank Material from Salvage and Aging
-- Ensures material banked in Hollow Bank (via hollow_bank_inventory or diversion to HOLLOW_BANK_WO_ID)
-- is deducted from VDI salvage and active WIP, and completely excluded from aging and salvage views.

-- 1. Ensure fn_hollow_bank_inbound_diversion creates APPROVED diversion with explicit piece tags
CREATE OR REPLACE FUNCTION public.fn_hollow_bank_inbound_diversion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_route_id uuid;
  v_reason text;
BEGIN
  -- Resolve valid route_id from rolling plans or default active process route
  SELECT rp.process_route_id INTO v_route_id
  FROM public.rolling_plans rp
  WHERE rp.work_order_id = NEW.source_wo_id
  LIMIT 1;

  IF v_route_id IS NULL THEN
    SELECT pr.id INTO v_route_id
    FROM public.process_routes pr
    WHERE pr.active
    LIMIT 1;
  END IF;

  -- Calculate weight if not provided
  IF COALESCE(NEW.weight_mt, 0) = 0 AND NEW.od > 0 AND NEW.wt > 0 AND NEW.total_meters > 0 THEN
    NEW.weight_mt := round(((NEW.od - NEW.wt) * NEW.wt * 0.0246615 * 0.001 * NEW.total_meters)::numeric, 3);
  END IF;

  IF COALESCE(NEW.available_pcs, 0) = 0 THEN
    NEW.available_pcs := NEW.pcs;
  END IF;
  IF COALESCE(NEW.available_meters, 0) = 0 THEN
    NEW.available_meters := NEW.total_meters;
  END IF;
  IF COALESCE(NEW.available_mt, 0) = 0 THEN
    NEW.available_mt := NEW.weight_mt;
  END IF;

  -- Build explicit routing and piece tags so parser assigns correct stage and pieces
  v_reason := '[FROM_STAGE: ' || NEW.source_stage_code || '] [TO_STAGE: HOLLOW_BANK] [PCS: ' || NEW.pcs || '] Diverted to Hollow Bank: ' || NEW.lot_no;
  IF NEW.remarks IS NOT NULL AND TRIM(NEW.remarks) <> '' THEN
    v_reason := v_reason || ' (' || TRIM(NEW.remarks) || ')';
  END IF;

  -- Create diversion record transferring material from source_wo_id at source_stage_code into HB-BUFFER
  INSERT INTO public.diversion_plans (
    source_wo_id,
    target_wo_id,
    diverted_qty,
    process_route_id,
    work_center,
    multiple,
    reason,
    approved_by,
    diversion_date,
    status
  ) VALUES (
    NEW.source_wo_id,
    '00000000-0000-0000-0000-00000000000b',
    NEW.total_meters,
    v_route_id,
    NEW.source_stage_code,
    1,
    v_reason,
    NEW.banked_by,
    NEW.banked_date,
    'APPROVED'
  );

  RETURN NEW;
END;
$$;

-- 2. Drop dependent view vw_dashboard_kpis and vw_wip_aging
DROP VIEW IF EXISTS public.vw_dashboard_kpis CASCADE;
DROP VIEW IF EXISTS public.vw_wip_aging CASCADE;

-- 3. Recreate vw_wip_aging strictly deducting material banked in Hollow Bank
CREATE VIEW public.vw_wip_aging AS
WITH active_wip AS (
  SELECT 
    w.work_order_id,
    w.work_order_no,
    w.customer_name,
    wo.grade,
    w.size_od AS od,
    w.size_wt AS wt,
    wo.l1,
    wo.l2,
    w.route_id,
    w.route_code,
    w.route_name,
    w.sequence_no,
    w.stage_id,
    w.stage_code,
    w.stage_name,
    w.current_wip,
    w.current_wip_pcs,
    w.current_wip_mt AS available_mt,
    GREATEST(0,
      COALESCE(
        (SELECT SUM(qi.vdi_salvage_pcs) FROM public.qc_inspections qi WHERE qi.work_order_id = w.work_order_id),
        0
      )
      - COALESCE(
        (
          SELECT SUM(
            CASE
              WHEN dp.reason ~* '\[PCS:\s*(\d+)\]' THEN (substring(dp.reason from '\[PCS:\s*(\d+)\]'))::numeric
              ELSE ROUND(dp.diverted_qty / NULLIF(COALESCE(wo.l1, 6.0), 0))
            END
          )
          FROM public.diversion_plans dp
          WHERE dp.source_wo_id = w.work_order_id
            AND (
              dp.work_center IN ('VDI', 'VDI_SALVAGE')
              OR dp.reason ~* '\[FROM_STAGE:\s*(VDI|VDI_SALVAGE)\]'
              OR dp.target_wo_id = '00000000-0000-0000-0000-00000000000b'
              OR dp.reason ~* 'HOLLOW BANK'
            )
        ),
        0
      )
      - COALESCE(
        (
          SELECT SUM(hbi.pcs)
          FROM public.hollow_bank_inventory hbi
          WHERE hbi.source_wo_id = w.work_order_id
            AND (hbi.source_stage_code IN ('VDI', 'VDI_SALVAGE') OR hbi.source_stage_code IS NULL)
            AND NOT EXISTS (
              SELECT 1 FROM public.diversion_plans dp
              WHERE dp.source_wo_id = w.work_order_id
                AND (dp.target_wo_id = '00000000-0000-0000-0000-00000000000b' OR dp.reason ~* 'HOLLOW BANK')
                AND dp.diverted_qty = hbi.total_meters
            )
        ),
        0
      )
    )::numeric AS vdi_salvage_pcs,
    GREATEST(0,
      COALESCE(
        (SELECT SUM(qi.vdi_salvage_mtr) FROM public.qc_inspections qi WHERE qi.work_order_id = w.work_order_id),
        0
      )
      - COALESCE(
        (
          SELECT SUM(dp.diverted_qty)
          FROM public.diversion_plans dp
          WHERE dp.source_wo_id = w.work_order_id
            AND (
              dp.work_center IN ('VDI', 'VDI_SALVAGE')
              OR dp.reason ~* '\[FROM_STAGE:\s*(VDI|VDI_SALVAGE)\]'
              OR dp.target_wo_id = '00000000-0000-0000-0000-00000000000b'
              OR dp.reason ~* 'HOLLOW BANK'
            )
        ),
        0
      )
      - COALESCE(
        (
          SELECT SUM(hbi.total_meters)
          FROM public.hollow_bank_inventory hbi
          WHERE hbi.source_wo_id = w.work_order_id
            AND (hbi.source_stage_code IN ('VDI', 'VDI_SALVAGE') OR hbi.source_stage_code IS NULL)
            AND NOT EXISTS (
              SELECT 1 FROM public.diversion_plans dp
              WHERE dp.source_wo_id = w.work_order_id
                AND (dp.target_wo_id = '00000000-0000-0000-0000-00000000000b' OR dp.reason ~* 'HOLLOW BANK')
                AND dp.diverted_qty = hbi.total_meters
            )
        ),
        0
      )
    )::numeric AS vdi_salvage_mtr,
    CASE
      WHEN w.stage_code = 'VDI' THEN
        GREATEST(
          (SELECT MAX(qi.inspection_date) FROM public.qc_inspections qi WHERE qi.work_order_id = w.work_order_id),
          (SELECT MAX(pl.process_date) FROM public.production_logs pl WHERE pl.work_order_id = w.work_order_id AND pl.stage_id = w.stage_id)
        )
      ELSE
        (SELECT MAX(pl.process_date) FROM public.production_logs pl WHERE pl.work_order_id = w.work_order_id AND pl.stage_id = w.stage_id)
    END AS stage_last_log_date,
    (
      SELECT MAX(pl.process_date)
      FROM public.production_logs pl
      JOIN public.route_stages rs ON rs.stage_id = pl.stage_id AND rs.route_id = w.route_id
      WHERE pl.work_order_id = w.work_order_id
        AND rs.sequence_no < w.sequence_no
    ) AS upstream_last_log_date,
    (
      SELECT MAX(COALESCE(rp.planned_rolling_date, rp.created_at::date))
      FROM public.rolling_plans rp
      WHERE rp.work_order_id = w.work_order_id
    ) AS rolling_plan_date,
    COALESCE(wo.created_at::date, CURRENT_DATE) AS wo_created_date,
    (
      SELECT pl.created_at
      FROM public.production_logs pl
      WHERE pl.work_order_id = w.work_order_id AND pl.stage_id = w.stage_id
      ORDER BY pl.created_at DESC LIMIT 1
    ) AS stage_last_created_at,
    (
      SELECT qi.created_at
      FROM public.qc_inspections qi
      WHERE qi.work_order_id = w.work_order_id
      ORDER BY qi.created_at DESC LIMIT 1
    ) AS vdi_last_created_at
  FROM public.vw_route_stage_wip w
  JOIN public.work_orders wo ON wo.id = w.work_order_id
  WHERE w.current_wip > 0
    AND w.work_order_id <> '00000000-0000-0000-0000-00000000000b'
    AND upper(trim(w.work_order_no)) NOT IN ('HOLLOW BANK', 'HB-BUFFER', 'HB BUFFER')
    AND upper(trim(coalesce(w.customer_name, ''))) NOT LIKE '%HOLLOW BANK%'
    AND upper(trim(coalesce(w.customer_name, ''))) NOT LIKE '%HB-BUFFER%'
    AND wo.id <> '00000000-0000-0000-0000-00000000000b'
    AND upper(trim(wo.work_order_no)) NOT IN ('HOLLOW BANK', 'HB-BUFFER', 'HB BUFFER')
    AND upper(trim(coalesce(wo.customer_name, ''))) NOT LIKE '%HOLLOW BANK%'
    AND upper(trim(coalesce(wo.customer_name, ''))) NOT LIKE '%HB-BUFFER%'
), date_resolved AS (
  SELECT 
    aw.*,
    COALESCE(
      aw.stage_last_log_date,
      aw.upstream_last_log_date,
      aw.rolling_plan_date,
      aw.wo_created_date,
      CURRENT_DATE
    ) AS effective_reference_date,
    GREATEST(
      COALESCE(aw.stage_last_created_at, '-infinity'::timestamptz),
      COALESCE(aw.vdi_last_created_at, '-infinity'::timestamptz),
      COALESCE(aw.stage_last_log_date::timestamptz, '-infinity'::timestamptz),
      COALESCE(aw.upstream_last_log_date::timestamptz, '-infinity'::timestamptz),
      COALESCE(aw.rolling_plan_date::timestamptz, '-infinity'::timestamptz),
      aw.wo_created_date::timestamptz
    ) AS last_activity_timestamp
  FROM active_wip aw
), calculated_aging AS (
  SELECT 
    dr.*,
    dr.effective_reference_date AS last_activity_date,
    GREATEST(0, (CURRENT_DATE - dr.effective_reference_date)::integer) AS days_stuck,
    CASE
      WHEN (CURRENT_DATE - dr.effective_reference_date) > 5 THEN 'CRITICAL'
      WHEN (CURRENT_DATE - dr.effective_reference_date) >= 3 THEN 'WARNING'
      ELSE 'NORMAL'
    END AS severity
  FROM date_resolved dr
)
SELECT 
  ca.work_order_id,
  ca.work_order_no,
  ca.customer_name,
  ca.grade,
  ca.od,
  ca.wt,
  ca.l1,
  ca.l2,
  ca.route_id,
  ca.route_code,
  ca.route_name,
  ca.sequence_no,
  ca.stage_id,
  ca.stage_code,
  ca.stage_name,
  ca.current_wip,
  ca.current_wip_pcs,
  ca.available_mt,
  ca.vdi_salvage_pcs,
  ca.vdi_salvage_mtr,
  ca.stage_last_log_date,
  ca.upstream_last_log_date,
  ca.rolling_plan_date,
  ca.wo_created_date,
  ca.effective_reference_date,
  ca.last_activity_date,
  ca.days_stuck,
  ca.last_activity_timestamp,
  ca.severity,
  ca.severity AS aging_status,
  CASE
    WHEN ack.id IS NOT NULL AND (ack.snooze_until IS NULL OR ack.snooze_until >= CURRENT_DATE) THEN true
    ELSE false
  END AS is_acknowledged,
  ack.acknowledged_by,
  ack.notes AS ack_notes,
  ack.snooze_until AS ack_snooze_until
FROM calculated_aging ca
LEFT JOIN LATERAL (
  SELECT ack_inner.id, ack_inner.acknowledged_by, ack_inner.notes, ack_inner.snooze_until
  FROM public.aging_alert_acknowledgements ack_inner
  WHERE ack_inner.work_order_id = ca.work_order_id
    AND ack_inner.stage_code = ca.stage_code
  ORDER BY ack_inner.created_at DESC
  LIMIT 1
) ack ON true
WHERE ca.current_wip > 0
  AND (ca.stage_code <> 'VDI_SALVAGE' OR ca.vdi_salvage_pcs > 0)
  AND ca.work_order_id <> '00000000-0000-0000-0000-00000000000b'
  AND upper(trim(ca.work_order_no)) NOT IN ('HOLLOW BANK', 'HB-BUFFER', 'HB BUFFER')
  AND upper(trim(coalesce(ca.customer_name, ''))) NOT LIKE '%HOLLOW BANK%'
  AND upper(trim(coalesce(ca.customer_name, ''))) NOT LIKE '%HB-BUFFER%';

GRANT SELECT ON public.vw_wip_aging TO anon, authenticated, service_role;

-- Recreate dependent view: vw_dashboard_kpis
DROP VIEW IF EXISTS public.vw_dashboard_kpis CASCADE;

CREATE VIEW public.vw_dashboard_kpis AS
SELECT
  COALESCE((SELECT SUM(current_wip) FROM public.vw_route_stage_wip), 0) AS total_wip,
  COALESCE((SELECT SUM(current_wip_mt) FROM public.vw_route_stage_wip), 0) AS total_wip_mt,
  COALESCE((SELECT SUM(gross_output_mtr) FROM public.vw_route_stage_wip), 0) AS total_production,
  COALESCE((SELECT SUM(rejection_mtr) FROM public.vw_route_stage_wip), 0) AS total_rejections,
  COALESCE((SELECT SUM(diverted_qty) FROM public.diversion_plans), 0) AS total_diversions,
  (SELECT COUNT(*) FROM public.vw_wip_aging WHERE severity = 'CRITICAL') AS critical_stagnant_count,
  (SELECT COUNT(*) FROM public.vw_wip_aging WHERE severity = 'WARNING') AS warning_count,
  (SELECT COUNT(*) FROM public.vw_wip_aging WHERE severity = 'NORMAL') AS normal_count;

GRANT SELECT ON public.vw_dashboard_kpis TO anon, authenticated, service_role;
