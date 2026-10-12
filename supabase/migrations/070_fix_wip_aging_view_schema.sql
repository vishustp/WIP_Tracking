-- Migration 070: Standardize vw_wip_aging schema with severity, last_activity_date, and acknowledgements
-- Ensures direct column parity with AgingRow frontend interface while retaining legacy column aliases.

DROP VIEW IF EXISTS public.vw_wip_aging CASCADE;

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
    CASE
      WHEN w.stage_code = 'VDI' THEN
        GREATEST(
          (SELECT MAX(qi.created_at) FROM public.qc_inspections qi WHERE qi.work_order_id = w.work_order_id),
          (SELECT MAX(pl.created_at) FROM public.production_logs pl WHERE pl.work_order_id = w.work_order_id AND pl.stage_id = w.stage_id)
        )
      ELSE
        (SELECT MAX(pl.created_at) FROM public.production_logs pl WHERE pl.work_order_id = w.work_order_id AND pl.stage_id = w.stage_id)
    END AS stage_last_timestamp,
    (
      SELECT MAX(pl.created_at)
      FROM public.production_logs pl
      JOIN public.route_stages rs ON rs.stage_id = pl.stage_id AND rs.route_id = w.route_id
      WHERE pl.work_order_id = w.work_order_id
        AND rs.sequence_no < w.sequence_no
    ) AS upstream_last_timestamp,
    (
      SELECT MAX(rp.created_at)
      FROM public.rolling_plans rp
      WHERE rp.work_order_id = w.work_order_id
    ) AS rolling_plan_timestamp,
    wo.created_at AS wo_created_timestamp
  FROM public.vw_route_stage_wip w
  JOIN public.work_orders wo ON wo.id = w.work_order_id
  WHERE w.current_wip > 0
    AND w.stage_code <> 'ROLLING'
)
SELECT 
  aw.work_order_id,
  aw.work_order_no,
  aw.customer_name,
  aw.grade,
  aw.od,
  aw.wt,
  aw.l1,
  aw.l2,
  aw.route_id,
  aw.route_code,
  aw.route_name,
  aw.sequence_no,
  aw.stage_id,
  aw.stage_code,
  aw.stage_name,
  aw.current_wip,
  aw.current_wip_pcs,
  aw.available_mt,
  aw.stage_last_log_date,
  aw.upstream_last_log_date,
  aw.rolling_plan_date,
  aw.wo_created_date,
  COALESCE(
    aw.stage_last_log_date,
    aw.upstream_last_log_date,
    aw.rolling_plan_date,
    aw.wo_created_date
  ) AS effective_reference_date,
  COALESCE(
    aw.stage_last_log_date,
    aw.upstream_last_log_date,
    aw.rolling_plan_date,
    aw.wo_created_date
  ) AS last_activity_date,
  GREATEST(0, (CURRENT_DATE - COALESCE(
    aw.stage_last_log_date,
    aw.upstream_last_log_date,
    aw.rolling_plan_date,
    aw.wo_created_date
  ))::integer) AS days_stuck,
  COALESCE(
    aw.stage_last_timestamp,
    aw.upstream_last_timestamp,
    aw.rolling_plan_timestamp,
    aw.wo_created_timestamp
  ) AS last_activity_timestamp,
  CASE
    WHEN (CURRENT_DATE - COALESCE(aw.stage_last_log_date, aw.upstream_last_log_date, aw.rolling_plan_date, aw.wo_created_date))::integer > 5 THEN 'CRITICAL'
    WHEN (CURRENT_DATE - COALESCE(aw.stage_last_log_date, aw.upstream_last_log_date, aw.rolling_plan_date, aw.wo_created_date))::integer >= 3 THEN 'WARNING'
    ELSE 'NORMAL'
  END AS severity,
  CASE
    WHEN (CURRENT_DATE - COALESCE(aw.stage_last_log_date, aw.upstream_last_log_date, aw.rolling_plan_date, aw.wo_created_date))::integer > 5 THEN 'CRITICAL'
    WHEN (CURRENT_DATE - COALESCE(aw.stage_last_log_date, aw.upstream_last_log_date, aw.rolling_plan_date, aw.wo_created_date))::integer >= 3 THEN 'WARNING'
    ELSE 'NORMAL'
  END AS aging_status,
  COALESCE(ack.id IS NOT NULL AND (ack.snooze_until IS NULL OR ack.snooze_until >= CURRENT_DATE), false) AS is_acknowledged,
  ack.acknowledged_by,
  ack.notes AS ack_notes,
  ack.snooze_until AS ack_snooze_until
FROM active_wip aw
LEFT JOIN public.aging_alert_acknowledgements ack
  ON ack.work_order_id = aw.work_order_id
 AND ack.stage_code = aw.stage_code;

GRANT SELECT ON public.vw_wip_aging TO anon, authenticated, service_role;
