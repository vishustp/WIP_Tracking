-- 071_deduct_vdi_diversions_from_finishing_incoming.sql
-- Deduct VDI-stage prime material diversions out from the incoming feed to Finishing.
-- Ensures that when prime or VDI-cleared material is diverted out from a work order (e.g. WO 6349),
-- it is excluded from Finishing incoming feed, resolving phantom remaining WIP at Finishing.

DROP VIEW IF EXISTS public.vw_dashboard_kpis CASCADE;
DROP VIEW IF EXISTS public.vw_wip_aging CASCADE;
DROP VIEW IF EXISTS public.vw_route_stage_wip CASCADE;

CREATE VIEW public.vw_route_stage_wip AS
WITH RECURSIVE route_base AS (
  SELECT DISTINCT wo.id AS work_order_id, wo.work_order_no, wo.customer_name,
         wo.size_od AS od, wo.size_wt AS wt, wo.l1, wo.l2,
         r.id AS route_id, r.route_code, r.route_name
  FROM public.work_orders wo
  JOIN public.rolling_plans rp ON rp.work_order_id = wo.id
  JOIN public.process_routes r ON r.id = rp.process_route_id AND r.active
  UNION
  SELECT DISTINCT wo.id, wo.work_order_no, wo.customer_name,
         wo.size_od, wo.size_wt, wo.l1, wo.l2,
         r.id, r.route_code, r.route_name
  FROM public.work_orders wo
  JOIN public.diversion_plans dp ON dp.target_wo_id = wo.id
  JOIN public.process_routes r ON r.id = dp.process_route_id AND r.active
), route_stages AS (
  SELECT rb.*, rs.sequence_no, ps.id AS stage_id, ps.stage_code, ps.stage_name
  FROM route_base rb
  JOIN public.route_stages rs ON rs.route_id = rb.route_id AND rs.is_required
  JOIN public.process_stages ps ON ps.id = rs.stage_id AND ps.active
), campaign_hierarchy AS (
  SELECT rp.work_order_id AS master_wo_id,
         (c->>'work_order_id')::uuid AS child_wo_id
  FROM public.rolling_plans rp,
       LATERAL jsonb_array_elements(
         CASE
           WHEN jsonb_typeof(rp.status::jsonb->'child_work_orders') = 'array' THEN rp.status::jsonb->'child_work_orders'
           ELSE '[]'::jsonb
         END
       ) AS c
  WHERE rp.status::text LIKE '%"is_master":true%'
    AND (c->>'work_order_id') IS NOT NULL
  UNION
  SELECT (rp.status::jsonb->>'master_wo_id')::uuid AS master_wo_id,
         rp.work_order_id AS child_wo_id
  FROM public.rolling_plans rp
  WHERE rp.status::text LIKE '%"is_child":true%'
    AND (rp.status::jsonb->>'master_wo_id') IS NOT NULL
), campaign_children AS (
  SELECT DISTINCT child_wo_id AS work_order_id FROM campaign_hierarchy
), campaign_masters AS (
  SELECT DISTINCT master_wo_id AS work_order_id FROM campaign_hierarchy
), stage_prod AS (
  SELECT rs.*,
    COALESCE(
      (SELECT SUM(pl.htc_ok) FROM public.production_logs pl
       WHERE pl.work_order_id = rs.work_order_id AND pl.stage_id = rs.stage_id), 0
    )::numeric AS htc_ok_qty,
    CASE
      WHEN rs.stage_code = 'VDI' THEN
        COALESCE(
          (SELECT SUM(qi.vdi_ok_mtr) FROM public.qc_inspections qi
           WHERE qi.work_order_id = rs.work_order_id
              OR qi.work_order_id IN (SELECT ch.child_wo_id FROM campaign_hierarchy ch WHERE ch.master_wo_id = rs.work_order_id)),
          (SELECT SUM(pl.output_qty) FROM public.production_logs pl WHERE pl.work_order_id = rs.work_order_id AND pl.stage_id = rs.stage_id),
          0
        )::numeric
      WHEN rs.stage_code = 'BAND_SAW' THEN
        GREATEST(
          COALESCE((SELECT SUM(pl.output_qty) FROM public.production_logs pl
                    WHERE pl.work_order_id = rs.work_order_id AND pl.stage_id = rs.stage_id), 0),
          GREATEST(0,
            COALESCE((SELECT SUM(qi.vdi_ok_mtr + qi.vdi_salvage_mtr + qi.vdi_rejection_mtr)
                      FROM public.qc_inspections qi
                      WHERE qi.work_order_id = rs.work_order_id
                         OR qi.work_order_id IN (SELECT ch.child_wo_id FROM campaign_hierarchy ch WHERE ch.master_wo_id = rs.work_order_id)), 0)
            - COALESCE((SELECT SUM(dp.diverted_qty) FROM public.diversion_plans dp
                        WHERE dp.target_wo_id = rs.work_order_id
                          AND dp.process_route_id = rs.route_id
                          AND COALESCE(substring(dp.reason from '\[TO_STAGE:\s*([A-Z_]+)\]'), dp.work_center) = 'VDI'), 0)
          )
        )::numeric
      ELSE
        COALESCE((SELECT SUM(pl.output_qty) FROM public.production_logs pl
                  WHERE pl.work_order_id = rs.work_order_id AND pl.stage_id = rs.stage_id), 0)::numeric
    END AS production_qty,
    CASE
      WHEN rs.stage_code = 'VDI' THEN
        COALESCE(
          (SELECT SUM(qi.vdi_rejection_mtr + qi.vdi_salvage_mtr) FROM public.qc_inspections qi
           WHERE qi.work_order_id = rs.work_order_id
              OR qi.work_order_id IN (SELECT ch.child_wo_id FROM campaign_hierarchy ch WHERE ch.master_wo_id = rs.work_order_id)),
          (SELECT SUM(pl.rejection_qty) FROM public.production_logs pl WHERE pl.work_order_id = rs.work_order_id AND pl.stage_id = rs.stage_id),
          0
        )::numeric
      ELSE
        COALESCE((SELECT SUM(pl.rejection_qty) FROM public.production_logs pl
                  WHERE pl.work_order_id = rs.work_order_id AND pl.stage_id = rs.stage_id), 0)::numeric
    END AS rejection_qty,
    COALESCE((SELECT SUM(dp.diverted_qty) FROM public.diversion_plans dp
              WHERE dp.target_wo_id = rs.work_order_id
                AND dp.process_route_id = rs.route_id
                AND COALESCE(substring(dp.reason from '\[TO_STAGE:\s*([A-Z_]+)\]'), dp.work_center) = rs.stage_code), 0)::numeric AS diversion_in,
    COALESCE((SELECT SUM(dp.diverted_qty) FROM public.diversion_plans dp
              WHERE dp.source_wo_id = rs.work_order_id
                AND COALESCE(substring(dp.reason from '\[FROM_STAGE:\s*([A-Z_]+)\]'), dp.work_center) = rs.stage_code), 0)::numeric AS diversion_out,
    -- Approved Rejection Declarations (deducted from stage WIP)
    COALESCE((
      SELECT SUM(COALESCE(rd.ppc_approved_mtr, rd.qc_verified_mtr, rd.rejected_mtr))
      FROM public.rejection_declarations rd
      WHERE rd.work_order_id = rs.work_order_id
        AND rd.work_center = rs.stage_code
        AND rd.status = 'APPROVED'
    ), 0)::numeric AS declared_rej_mtr,
    -- Pending Rejection Declarations (for operational hold warnings)
    COALESCE((
      SELECT SUM(COALESCE(rd.qc_verified_mtr, rd.rejected_mtr))
      FROM public.rejection_declarations rd
      WHERE rd.work_order_id = rs.work_order_id
        AND rd.work_center = rs.stage_code
        AND rd.status IN ('PENDING_QC', 'PENDING_PPC')
    ), 0)::numeric AS pending_rej_mtr,
    COALESCE((
      SELECT SUM(COALESCE(rd.qc_verified_pcs, rd.rejected_pcs))
      FROM public.rejection_declarations rd
      WHERE rd.work_order_id = rs.work_order_id
        AND rd.work_center = rs.stage_code
        AND rd.status IN ('PENDING_QC', 'PENDING_PPC')
    ), 0)::numeric AS pending_rej_pcs
  FROM route_stages rs
), downstream_max AS (
  SELECT sp.*,
    COALESCE(
      (SELECT MAX(sp2.production_qty + sp2.rejection_qty)
       FROM stage_prod sp2
       WHERE sp2.work_order_id = sp.work_order_id
         AND sp2.route_id = sp.route_id
         AND sp2.sequence_no > sp.sequence_no), 0
    ) AS downstream_passed_qty,
    CASE
      WHEN sp.sequence_no = 1 THEN
        COALESCE((SELECT SUM(rp.planned_qty) FROM public.rolling_plans rp
                  WHERE rp.work_order_id = sp.work_order_id AND rp.process_route_id = sp.route_id), 0)
      WHEN sp.stage_code = 'FINISHING' THEN
        GREATEST(0,
          COALESCE(
            (SELECT SUM(qi.vdi_ok_mtr) FROM public.qc_inspections qi WHERE qi.work_order_id = sp.work_order_id),
            (SELECT sp_prev.production_qty
             FROM stage_prod sp_prev
             WHERE sp_prev.work_order_id = sp.work_order_id
               AND sp_prev.route_id = sp.route_id
               AND sp_prev.sequence_no < sp.sequence_no
             ORDER BY sp_prev.sequence_no DESC LIMIT 1),
            0
          )
          - COALESCE(
              (SELECT SUM(dp.diverted_qty) FROM public.diversion_plans dp
               WHERE dp.source_wo_id = sp.work_order_id
                 AND COALESCE(substring(dp.reason from '\[FROM_STAGE:\s*([A-Z_]+)\]'), dp.work_center) = 'VDI'),
              0
            )
        )
      ELSE
        COALESCE((SELECT sp_prev.production_qty - sp_prev.rejection_qty
                  FROM stage_prod sp_prev
                  WHERE sp_prev.work_order_id = sp.work_order_id
                    AND sp_prev.route_id = sp.route_id
                    AND sp_prev.sequence_no < sp.sequence_no
                  ORDER BY sp_prev.sequence_no DESC LIMIT 1), 0)
    END AS incoming_qty
  FROM stage_prod sp
), stage_calculated AS (
  SELECT dm.*,
    CASE
      WHEN dm.stage_code <> 'FINISHING' AND EXISTS (SELECT 1 FROM campaign_children cc WHERE cc.work_order_id = dm.work_order_id) THEN 0
      WHEN dm.stage_code = 'ROLLING' THEN 0
      WHEN dm.stage_code = 'VDI' AND dm.incoming_qty = 0 AND dm.diversion_in > 0 AND (dm.production_qty + dm.rejection_qty) > 0 AND (dm.downstream_passed_qty > 0 OR (dm.production_qty + dm.rejection_qty) >= dm.diversion_in * 0.8) THEN 0
      ELSE
        GREATEST(dm.incoming_qty + dm.diversion_in - GREATEST(dm.production_qty + dm.rejection_qty, dm.downstream_passed_qty) - dm.declared_rej_mtr - dm.diversion_out, 0)
    END AS current_wip,
    GREATEST(dm.production_qty - dm.rejection_qty, 0) AS net_output_mtr
  FROM downstream_max dm
)
SELECT 
  sc.work_order_id,
  sc.work_order_no,
  sc.customer_name,
  sc.od AS size_od,
  sc.wt AS size_wt,
  sc.route_id,
  sc.route_code,
  sc.route_name,
  sc.sequence_no,
  sc.stage_id,
  sc.stage_code,
  sc.stage_name,
  sc.htc_ok_qty,
  sc.incoming_qty,
  sc.production_qty,
  sc.rejection_qty,
  sc.net_output_mtr,
  sc.diversion_in,
  sc.diversion_out,
  sc.declared_rej_mtr,
  sc.pending_rej_mtr,
  sc.pending_rej_pcs,
  sc.current_wip,
  public.mtr_to_pcs(sc.work_order_id, sc.current_wip) AS current_wip_pcs,
  public.mtr_to_mt(sc.work_order_id, sc.current_wip) AS current_wip_mt,
  sc.production_qty AS gross_output_mtr,
  public.mtr_to_pcs(sc.work_order_id, sc.production_qty) AS gross_output_pcs,
  public.mtr_to_mt(sc.work_order_id, sc.production_qty) AS gross_output_mt,
  sc.rejection_qty AS rejection_mtr,
  public.mtr_to_pcs(sc.work_order_id, sc.rejection_qty) AS rejection_pcs,
  public.mtr_to_mt(sc.work_order_id, sc.rejection_qty) AS rejection_mt,
  public.mtr_to_pcs(sc.work_order_id, sc.net_output_mtr) AS net_output_pcs,
  public.mtr_to_mt(sc.work_order_id, sc.net_output_mtr) AS net_output_mt
FROM stage_calculated sc;

GRANT SELECT ON public.vw_route_stage_wip TO anon, authenticated, service_role;

-- Ensure acknowledgements table exists
CREATE TABLE IF NOT EXISTS public.aging_alert_acknowledgements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  stage_code text NOT NULL,
  acknowledged_by text NOT NULL,
  notes text,
  snooze_until date DEFAULT (CURRENT_DATE + INTERVAL '2 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_aging_ack UNIQUE (work_order_id, stage_code)
);

ALTER TABLE public.aging_alert_acknowledgements ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'aging_alert_acknowledgements' 
      AND policyname = 'Allow all to view acknowledgements'
  ) THEN
    CREATE POLICY "Allow all to view acknowledgements"
      ON public.aging_alert_acknowledgements
      FOR SELECT TO anon, authenticated, service_role USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'aging_alert_acknowledgements' 
      AND policyname = 'Allow all to upsert acknowledgements'
  ) THEN
    CREATE POLICY "Allow all to upsert acknowledgements"
      ON public.aging_alert_acknowledgements
      FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT ALL ON public.aging_alert_acknowledgements TO anon, authenticated, service_role;

-- Recreate dependent view: vw_wip_aging (Migration 070 definition)
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
