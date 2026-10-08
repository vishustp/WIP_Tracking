-- Migration 065: Harmonize get_production_entries with Mother Hollow, Logged Pieces, and Draw Mass Conservation
--
-- 1. Updates get_production_entries to:
--    a. Extract operator-entered pieces from [PCS:...] and [HTC_OK_PCS:...] tags in remarks,
--       avoiding synthetic meter division errors.
--    b. Correctly retrieve Mother Hollow dimensions (mh_od, mh_wt, mh_l1, mh_l2) from rolling_plans
--       (both table columns and status JSON) for ROLLING and HOLLOW_HEAT_TREATMENT stages.
--    c. Apply Cold Drawing Mass Conservation (AGENTS.md Rule 3: Mass_In = Mass_Out) at DRAW and PILGER stages.

DROP FUNCTION IF EXISTS public.get_production_entries(text, text, text, date, date, integer, integer);

CREATE OR REPLACE FUNCTION public.get_production_entries(
  p_search text DEFAULT NULL,
  p_stage_code text DEFAULT NULL,
  p_route_code text DEFAULT NULL,
  p_from_date date DEFAULT NULL,
  p_to_date date DEFAULT NULL,
  p_limit integer DEFAULT 500,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  work_order_no text,
  customer_name text,
  route_code text,
  stage_code text,
  process_date date,
  od numeric,
  wl numeric,
  l1 numeric,
  l2 numeric,
  avg_length numeric,
  input_mtr numeric,
  input_pcs numeric,
  input_mt numeric,
  output_mtr numeric,
  output_pcs numeric,
  output_mt numeric,
  rejection_mtr numeric,
  rejection_pcs numeric,
  rejection_mt numeric,
  htc_ok_mtr numeric,
  htc_ok_pcs numeric,
  heat_lot_no text,
  remarks text,
  created_at timestamptz,
  can_modify boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $function$
  WITH plan_data AS (
    SELECT
      rp.id AS rolling_plan_id,
      rp.work_order_id,
      COALESCE(
        NULLIF(rp.mh_od, 0),
        NULLIF((rp.status->>'cust_od')::numeric, 0),
        NULLIF((rp.status->'sm'->>'cust_od')::numeric, 0),
        NULLIF((rp.status->'sizing_mill'->>'cust_od')::numeric, 0)
      ) AS eff_mh_od,
      COALESCE(
        NULLIF(rp.mh_wt, 0),
        NULLIF((rp.status->>'rolling_wt')::numeric, 0),
        NULLIF((rp.status->'sm'->>'rolling_wt')::numeric, 0),
        NULLIF((rp.status->'sizing_mill'->>'rolling_wt')::numeric, 0)
      ) AS eff_mh_wt,
      COALESCE(
        NULLIF(rp.mh_l1, 0),
        NULLIF((rp.status->'sm'->>'sm_len')::numeric, 0),
        NULLIF((rp.status->>'eff_len')::numeric, 0),
        NULLIF((rp.status->>'l1')::numeric, 0)
      ) AS eff_mh_l1,
      COALESCE(
        NULLIF(rp.mh_l2, 0),
        NULLIF((rp.status->'sm'->>'sm_len')::numeric, 0),
        NULLIF((rp.status->>'eff_len')::numeric, 0),
        NULLIF((rp.status->>'l2')::numeric, 0)
      ) AS eff_mh_l2
    FROM public.rolling_plans rp
    WHERE rp.status IS NOT NULL
  ),
  base AS (
    SELECT
      pl.id,
      wo.work_order_no,
      wo.customer_name,
      r.route_code,
      ps.stage_code,
      pl.process_date,
      CASE
        WHEN ps.stage_code IN ('ROLLING', 'HOLLOW_HEAT_TREATMENT') THEN
          COALESCE(pd.eff_mh_od, wo.size_od)
        ELSE wo.size_od
      END AS od,
      CASE
        WHEN ps.stage_code IN ('ROLLING', 'HOLLOW_HEAT_TREATMENT') THEN
          COALESCE(pd.eff_mh_wt, wo.size_wt)
        ELSE wo.size_wt
      END AS wl,
      CASE
        WHEN ps.stage_code IN ('ROLLING', 'HOLLOW_HEAT_TREATMENT') THEN
          COALESCE(pd.eff_mh_l1, wo.l1)
        ELSE wo.l1
      END AS l1,
      CASE
        WHEN ps.stage_code IN ('ROLLING', 'HOLLOW_HEAT_TREATMENT') THEN
          COALESCE(pd.eff_mh_l2, wo.l2)
        ELSE wo.l2
      END AS l2,
      public.wo_stage_avg_length(wo.id, ps.stage_code) AS stage_len,
      pl.input_qty AS in_mtr,
      pl.output_qty AS out_mtr,
      pl.rejection_qty AS rej_mtr,
      pl.htc_ok AS htc_mtr,
      pl.heat_lot_no,
      pl.remarks,
      pl.created_at,
      NOT EXISTS (
        SELECT 1
        FROM public.production_logs newer
        WHERE newer.work_order_id = pl.work_order_id
          AND newer.process_route_id = pl.process_route_id
          AND newer.created_at > pl.created_at
      ) AS can_modify,
      wo.id AS work_order_id,
      pd.eff_mh_od,
      pd.eff_mh_wt,
      pd.eff_mh_l1,
      -- Extract actual operator-entered pieces from [PCS:...] tag
      substring(pl.remarks FROM '\[PCS:\s*(\d+)\]')::numeric AS tag_pcs,
      -- Extract rejection pieces from [REJ_PCS:...] tag
      substring(pl.remarks FROM '\[REJ_PCS:\s*(\d+)\]')::numeric AS tag_rej_pcs,
      -- Extract HTC OK pieces from [HTC_OK_PCS:...] or [HTC:...] tag
      COALESCE(
        substring(pl.remarks FROM '\[HTC_OK_PCS:\s*(\d+)\]')::numeric,
        substring(pl.remarks FROM '\[HTC:\s*(\d+)\]')::numeric
      ) AS tag_htc_pcs
    FROM public.production_logs pl
    JOIN public.work_orders wo ON wo.id = pl.work_order_id
    JOIN public.process_routes r ON r.id = pl.process_route_id
    JOIN public.process_stages ps ON ps.id = pl.stage_id
    LEFT JOIN LATERAL (
      SELECT pd_inner.*
      FROM plan_data pd_inner
      WHERE pd_inner.rolling_plan_id = pl.rolling_plan_id
         OR pd_inner.work_order_id = wo.id
      LIMIT 1
    ) pd ON true
    WHERE (
      NULLIF(TRIM(COALESCE(p_search, '')), '') IS NULL
      OR wo.work_order_no ILIKE '%' || TRIM(p_search) || '%'
      OR COALESCE(wo.customer_name, '') ILIKE '%' || TRIM(p_search) || '%'
      OR COALESCE(wo.grade, '') ILIKE '%' || TRIM(p_search) || '%'
      OR COALESCE(r.route_code, '') ILIKE '%' || TRIM(p_search) || '%'
    )
    AND (p_stage_code IS NULL OR ps.stage_code = p_stage_code)
    AND (p_route_code IS NULL OR r.route_code = p_route_code)
    AND (p_from_date IS NULL OR pl.process_date >= p_from_date)
    AND (p_to_date IS NULL OR pl.process_date <= p_to_date)
  ),
  computed AS (
    SELECT
      b.id,
      b.work_order_no,
      b.customer_name,
      b.route_code,
      b.stage_code,
      b.process_date,
      b.od,
      b.wl,
      b.l1,
      b.l2,
      b.stage_len AS avg_length,
      b.in_mtr AS input_mtr,
      COALESCE(
        ROUND(b.in_mtr / NULLIF(b.stage_len, 0)),
        0
      ) AS input_pcs,
      public.wo_stage_mtr_to_mt(b.work_order_id, b.stage_code, b.in_mtr) AS input_mt,
      b.out_mtr AS output_mtr,
      COALESCE(
        b.tag_pcs,
        ROUND(b.out_mtr / NULLIF(b.stage_len, 0)),
        0
      ) AS output_pcs,
      -- Output MT with Cold Drawing Mass Conservation (AGENTS.md Rule 3)
      CASE
        WHEN b.stage_code IN ('DRAW', 'PILGER') AND b.eff_mh_od > 0 AND b.eff_mh_wt > 0 AND b.eff_mh_l1 > 0 THEN
          GREATEST(
            public.wo_stage_mtr_to_mt(b.work_order_id, b.stage_code, b.out_mtr),
            ROUND(
              COALESCE(b.tag_pcs, ROUND(b.out_mtr / NULLIF(b.stage_len, 0)), 0)
              * b.eff_mh_l1
              * (b.eff_mh_od - b.eff_mh_wt) * b.eff_mh_wt * 0.0246615 * 0.001,
              3
            )
          )
        ELSE
          public.wo_stage_mtr_to_mt(b.work_order_id, b.stage_code, b.out_mtr)
      END AS output_mt,
      b.rej_mtr AS rejection_mtr,
      COALESCE(
        b.tag_rej_pcs,
        ROUND(b.rej_mtr / NULLIF(b.stage_len, 0)),
        0
      ) AS rejection_pcs,
      public.wo_stage_mtr_to_mt(b.work_order_id, b.stage_code, b.rej_mtr) AS rejection_mt,
      b.htc_mtr AS htc_ok_mtr,
      COALESCE(
        b.tag_htc_pcs,
        b.tag_pcs,
        ROUND(b.htc_mtr / NULLIF(b.stage_len, 0)),
        0
      ) AS htc_ok_pcs,
      b.heat_lot_no,
      b.remarks,
      b.created_at,
      b.can_modify
    FROM base b
  )
  SELECT
    c.id,
    c.work_order_no,
    c.customer_name,
    c.route_code,
    c.stage_code,
    c.process_date,
    c.od,
    c.wl,
    c.l1,
    c.l2,
    c.avg_length,
    c.input_mtr,
    c.input_pcs,
    c.input_mt,
    c.output_mtr,
    c.output_pcs,
    c.output_mt,
    c.rejection_mtr,
    c.rejection_pcs,
    c.rejection_mt,
    c.htc_ok_mtr,
    c.htc_ok_pcs,
    c.heat_lot_no,
    c.remarks,
    c.created_at,
    c.can_modify
  FROM computed c
  ORDER BY c.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 500), 2500))
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$function$;

GRANT EXECUTE ON FUNCTION public.get_production_entries(text, text, text, date, date, integer, integer) TO authenticated, anon, service_role;
