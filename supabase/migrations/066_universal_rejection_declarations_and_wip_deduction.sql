-- Migration 066: Universal Work Center Rejection Declarations, 3-Stage Workflow & WIP Deduction
--
-- 1. Creates public.rejection_declarations table to track material rejected/salvaged at any work center.
-- 2. Implements 3-stage lifecycle: PENDING_QC -> PENDING_PPC -> APPROVED (or REJECTED_BY_QC / REJECTED_BY_PPC).
-- 3. Updates public.vw_route_stage_wip, public.vw_dashboard_kpis, and public.recalculate_work_order_wip
--    to deduct approved rejections from the designated work center's WIP balance.
-- 4. Exposes pending rejection pieces and meters on the stage WIP view for operational queue hold alerts.

-- 1. Create sequence for human-readable declaration numbers: REJ-YYYY-XXXX
CREATE SEQUENCE IF NOT EXISTS public.seq_rejection_declaration_no START WITH 1 INCREMENT BY 1;

-- 2. Create public.rejection_declarations table
CREATE TABLE IF NOT EXISTS public.rejection_declarations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  declaration_no text UNIQUE NOT NULL,
  work_order_id uuid NOT NULL REFERENCES public.work_orders(id) ON DELETE RESTRICT,
  process_route_id uuid REFERENCES public.process_routes(id),
  stage_id uuid REFERENCES public.process_stages(id),
  work_center text NOT NULL, -- 'ROLLING' | 'HOLLOW_HEAT_TREATMENT' | 'DRAW' | 'PILGER' | 'HEAT_TREATMENT' | 'BAND_SAW' | 'VDI' | 'FINISHING'

  -- Production Department Declaration
  rejected_pcs numeric NOT NULL DEFAULT 0 CHECK (rejected_pcs >= 0),
  rejected_mtr numeric NOT NULL DEFAULT 0 CHECK (rejected_mtr >= 0),
  rejected_mt numeric NOT NULL DEFAULT 0 CHECK (rejected_mt >= 0),
  heat_lot_no text,
  reason_category text NOT NULL DEFAULT 'SMALL_QTY_NO_REPROCESS'
    CHECK (reason_category IN ('SMALL_QTY_NO_REPROCESS', 'SURFACE_DEFECT', 'WALL_THICKNESS_OFF', 'CRACK', 'BEND', 'DIMENSIONAL_OFF_SPEC', 'OTHER')),
  production_remarks text NOT NULL,
  declared_by text NOT NULL,
  declared_by_user_id uuid,
  declared_at timestamptz NOT NULL DEFAULT now(),

  -- Workflow Status
  status text NOT NULL DEFAULT 'PENDING_QC'
    CHECK (status IN ('PENDING_QC', 'PENDING_PPC', 'APPROVED', 'REJECTED_BY_QC', 'REJECTED_BY_PPC')),

  -- Stage 2: QC Department Verification
  qc_verified_pcs numeric,
  qc_verified_mtr numeric,
  qc_verified_mt numeric,
  qc_remarks text,
  qc_verified_by text,
  qc_verified_by_user_id uuid,
  qc_verified_at timestamptz,

  -- Stage 3: PPC Department Authorization
  ppc_approved_pcs numeric,
  ppc_approved_mtr numeric,
  ppc_approved_mt numeric,
  ppc_remarks text,
  ppc_approved_by text,
  ppc_approved_by_user_id uuid,
  ppc_approved_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rejection_declarations_wo ON public.rejection_declarations(work_order_id);
CREATE INDEX IF NOT EXISTS idx_rejection_declarations_wc ON public.rejection_declarations(work_center);
CREATE INDEX IF NOT EXISTS idx_rejection_declarations_status ON public.rejection_declarations(status);
CREATE INDEX IF NOT EXISTS idx_rejection_declarations_date ON public.rejection_declarations(declared_at DESC);

-- Trigger to auto-generate declaration_no if not supplied
CREATE OR REPLACE FUNCTION public.fn_assign_rejection_declaration_no()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.declaration_no IS NULL OR TRIM(NEW.declaration_no) = '' THEN
    NEW.declaration_no := 'REJ-' || to_char(CURRENT_DATE, 'YYYY') || '-' || lpad(nextval('public.seq_rejection_declaration_no')::text, 4, '0');
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_rejection_declaration_no ON public.rejection_declarations;
CREATE TRIGGER trg_assign_rejection_declaration_no
BEFORE INSERT ON public.rejection_declarations
FOR EACH ROW EXECUTE FUNCTION public.fn_assign_rejection_declaration_no();

-- Enable RLS and grant permissions
ALTER TABLE public.rejection_declarations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rejection_declarations_all ON public.rejection_declarations;
CREATE POLICY rejection_declarations_all
ON public.rejection_declarations FOR ALL
TO authenticated, anon, service_role
USING (true) WITH CHECK (true);

GRANT ALL ON public.rejection_declarations TO authenticated, anon, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.seq_rejection_declaration_no TO authenticated, anon, service_role;

-- 3. Recreate views: vw_route_stage_wip, vw_dashboard_kpis, and vw_wip_aging
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
          COALESCE((SELECT SUM(qi.vdi_ok_mtr + qi.vdi_salvage_mtr + qi.vdi_rejection_mtr)
                    FROM public.qc_inspections qi
                    WHERE qi.work_order_id = rs.work_order_id
                       OR qi.work_order_id IN (SELECT ch.child_wo_id FROM campaign_hierarchy ch WHERE ch.master_wo_id = rs.work_order_id)), 0)
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
      ELSE
        GREATEST(dm.incoming_qty + dm.diversion_in - GREATEST(dm.production_qty + dm.rejection_qty, dm.downstream_passed_qty) - dm.declared_rej_mtr - dm.diversion_out, 0)
    END AS current_wip,
    CASE
      WHEN dm.stage_code <> 'FINISHING' AND EXISTS (SELECT 1 FROM campaign_children cc WHERE cc.work_order_id = dm.work_order_id) THEN 0
      ELSE GREATEST(dm.production_qty - dm.rejection_qty, 0)
    END AS current_net_output,
    CASE
      WHEN dm.stage_code <> 'FINISHING' AND EXISTS (SELECT 1 FROM campaign_children cc WHERE cc.work_order_id = dm.work_order_id) THEN 0
      ELSE dm.production_qty
    END AS eff_production_qty,
    CASE
      WHEN dm.stage_code <> 'FINISHING' AND EXISTS (SELECT 1 FROM campaign_children cc WHERE cc.work_order_id = dm.work_order_id) THEN 0
      ELSE dm.rejection_qty
    END AS eff_rejection_qty
  FROM downstream_max dm
)
SELECT work_order_id, work_order_no, customer_name,
       route_id, route_code, route_name, stage_id, stage_code, stage_name,
       sequence_no, incoming_qty, diversion_in, diversion_out,
       eff_production_qty AS production_qty,
       eff_rejection_qty AS rejection_qty,
       current_wip,
       CASE
         WHEN stage_code IN ('ROLLING', 'HOLLOW_HEAT_TREATMENT') THEN
           round(current_wip / NULLIF(public.wo_stage_avg_length(work_order_id, stage_code), 0))
         ELSE
           public.mtr_to_pcs(work_order_id, current_wip)
       END AS current_wip_pcs,
       public.wo_stage_mtr_to_mt(work_order_id, stage_code, current_wip) AS current_wip_mt,
       eff_production_qty AS gross_output_mtr,
       CASE
         WHEN stage_code IN ('ROLLING', 'HOLLOW_HEAT_TREATMENT') THEN
           round(eff_production_qty / NULLIF(public.wo_stage_avg_length(work_order_id, stage_code), 0))
         ELSE
           public.mtr_to_pcs(work_order_id, eff_production_qty)
       END AS gross_output_pcs,
       public.wo_stage_mtr_to_mt(work_order_id, stage_code, eff_production_qty) AS gross_output_mt,
       eff_rejection_qty AS rejection_mtr,
       CASE
         WHEN stage_code IN ('ROLLING', 'HOLLOW_HEAT_TREATMENT') THEN
           round(eff_rejection_qty / NULLIF(public.wo_stage_avg_length(work_order_id, stage_code), 0))
         ELSE
           public.mtr_to_pcs(work_order_id, eff_rejection_qty)
       END AS rejection_pcs,
       public.wo_stage_mtr_to_mt(work_order_id, stage_code, eff_rejection_qty) AS rejection_mt,
       current_net_output AS net_output_mtr,
       CASE
         WHEN stage_code IN ('ROLLING', 'HOLLOW_HEAT_TREATMENT') THEN
           round(current_net_output / NULLIF(public.wo_stage_avg_length(work_order_id, stage_code), 0))
         ELSE
           public.mtr_to_pcs(work_order_id, current_net_output)
       END AS net_output_pcs,
       public.wo_stage_mtr_to_mt(work_order_id, stage_code, current_net_output) AS net_output_mt,
       declared_rej_mtr,
       pending_rej_mtr,
       pending_rej_pcs,
       CASE
         WHEN stage_code IN ('ROLLING', 'HOLLOW_HEAT_TREATMENT') THEN
           COALESCE(
             (SELECT rp.mh_od FROM public.rolling_plans rp WHERE rp.work_order_id = stage_calculated.work_order_id AND COALESCE(rp.mh_od, 0) > 0 ORDER BY rp.created_at DESC LIMIT 1),
             od
           )
         ELSE od
       END AS size_od,
       CASE
         WHEN stage_code IN ('ROLLING', 'HOLLOW_HEAT_TREATMENT') THEN
           COALESCE(
             (SELECT rp.mh_wt FROM public.rolling_plans rp WHERE rp.work_order_id = stage_calculated.work_order_id AND COALESCE(rp.mh_wt, 0) > 0 ORDER BY rp.created_at DESC LIMIT 1),
             wt
           )
         ELSE wt
       END AS size_wt
FROM stage_calculated;

GRANT SELECT ON public.vw_route_stage_wip TO anon, authenticated, service_role;

-- 4. Recreate public.vw_dashboard_kpis
CREATE VIEW public.vw_dashboard_kpis AS
SELECT
  COALESCE((SELECT SUM(current_wip) FROM public.vw_route_stage_wip WHERE stage_code <> 'ROLLING'), 0) AS total_wip,
  COALESCE((SELECT SUM(current_wip) FROM public.vw_route_stage_wip WHERE stage_code <> 'ROLLING'), 0) AS total_wip_mtr,
  COALESCE((SELECT SUM(current_wip_pcs) FROM public.vw_route_stage_wip WHERE stage_code <> 'ROLLING'), 0) AS total_wip_pcs,
  COALESCE((SELECT SUM(current_wip_mt) FROM public.vw_route_stage_wip WHERE stage_code <> 'ROLLING'), 0) AS total_wip_mt,
  COALESCE((SELECT SUM(production_qty) FROM public.vw_route_stage_wip WHERE stage_code <> 'ROLLING'), 0) AS total_production,
  COALESCE((SELECT SUM(rejection_qty) FROM public.vw_route_stage_wip WHERE stage_code <> 'ROLLING'), 0) AS total_rejection,
  (SELECT COUNT(*) FROM public.work_orders WHERE status::text IN ('Pending Plan', 'Scheduled', 'In Progress')) AS active_orders,
  (SELECT COUNT(*) FROM public.work_orders WHERE target_date < CURRENT_DATE AND status::text IN ('Pending Plan', 'Scheduled', 'In Progress')) AS delayed_orders;

GRANT SELECT ON public.vw_dashboard_kpis TO anon, authenticated, service_role;

-- 5. Recreate public.vw_wip_aging (depends on vw_route_stage_wip)
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
    wo.created_at::date AS wo_created_date
  FROM public.vw_route_stage_wip w
  JOIN public.work_orders wo ON wo.id = w.work_order_id
  WHERE w.current_wip > 0
    AND UPPER(COALESCE(w.stage_code, '')) != 'ROLLING'
),
computed_dates AS (
  SELECT
    aw.*,
    GREATEST(
      aw.stage_last_log_date,
      aw.upstream_last_log_date,
      aw.rolling_plan_date,
      aw.wo_created_date
    ) AS last_activity_date
  FROM active_wip aw
)
SELECT
  cd.work_order_id,
  cd.work_order_no,
  cd.customer_name,
  cd.grade,
  cd.od,
  cd.wt,
  cd.l1,
  cd.l2,
  cd.route_id,
  cd.route_code,
  cd.route_name,
  cd.sequence_no,
  cd.stage_id,
  cd.stage_code,
  cd.stage_name,
  cd.current_wip,
  cd.current_wip_pcs,
  cd.available_mt,
  COALESCE(cd.last_activity_date, CURRENT_DATE) AS last_activity_date,
  GREATEST(0, (CURRENT_DATE - COALESCE(cd.last_activity_date, CURRENT_DATE))::integer) AS days_stuck,
  CASE
    WHEN (CURRENT_DATE - COALESCE(cd.last_activity_date, CURRENT_DATE))::integer > 5 THEN 'CRITICAL'
    WHEN (CURRENT_DATE - COALESCE(cd.last_activity_date, CURRENT_DATE))::integer BETWEEN 3 AND 5 THEN 'WARNING'
    ELSE 'NORMAL'
  END AS severity,
  ack.id IS NOT NULL AND (ack.snooze_until IS NULL OR ack.snooze_until >= CURRENT_DATE) AS is_acknowledged,
  ack.acknowledged_by,
  ack.notes AS ack_notes,
  ack.snooze_until AS ack_snooze_until
FROM computed_dates cd
LEFT JOIN public.aging_alert_acknowledgements ack
  ON ack.work_order_id = cd.work_order_id
 AND ack.stage_code = cd.stage_code;

GRANT SELECT ON public.vw_wip_aging TO anon, authenticated, service_role;

-- 6. Trigger to recalculate work order WIP on rejection declaration changes
CREATE OR REPLACE FUNCTION public.trg_recalculate_wip_on_rejection()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM public.recalculate_work_order_wip(COALESCE(NEW.work_order_id, OLD.work_order_id));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalculate_wip_on_rejection ON public.rejection_declarations;
CREATE TRIGGER trg_recalculate_wip_on_rejection
AFTER INSERT OR UPDATE OR DELETE ON public.rejection_declarations
FOR EACH ROW EXECUTE FUNCTION public.trg_recalculate_wip_on_rejection();
