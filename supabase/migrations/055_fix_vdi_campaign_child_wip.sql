-- Migration 055: Fix VDI Stage WIP for Master Campaigns and Child Work Orders
-- When mother pipes are rolled and cut under a master campaign, cut pieces at VDI are pooled under the master work order.
-- When QC inspections are logged (either on master or child work orders), the inspected quantity must deduct from
-- the master campaign's VDI queue, and flow into the respective child work orders' Finishing stage queues.

-- Helper 1: Average finished tube length
CREATE OR REPLACE FUNCTION public.wo_avg_length(p_work_order_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    NULLIF((COALESCE(l1, 0) + COALESCE(l2, 0)) / 2, 0),
    CASE WHEN COALESCE(ordered_qty_pcs, 0) > 0 AND COALESCE(ordered_qty_mtr, 0) > 0
         THEN ordered_qty_mtr / ordered_qty_pcs
         ELSE NULL
    END,
    6.0
  )
  FROM public.work_orders WHERE id = p_work_order_id;
$$;
GRANT EXECUTE ON FUNCTION public.wo_avg_length(uuid) TO authenticated, anon, service_role;

-- Helper 2: Stage-aware average length (Mother Hollow for Rolling & Hollow HT; finished length downstream)
CREATE OR REPLACE FUNCTION public.wo_stage_avg_length(p_work_order_id uuid, p_stage_code text DEFAULT null)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN p_stage_code IN ('ROLLING', 'HOLLOW_HEAT_TREATMENT') THEN
      COALESCE(
        (SELECT NULLIF((COALESCE(rp.mh_l1, 0) + COALESCE(rp.mh_l2, 0)) / 2, 0)
         FROM public.rolling_plans rp
         WHERE rp.work_order_id = p_work_order_id
         ORDER BY rp.created_at DESC LIMIT 1),
        (SELECT NULLIF(rp.mh_l1, 0)
         FROM public.rolling_plans rp
         WHERE rp.work_order_id = p_work_order_id
         ORDER BY rp.created_at DESC LIMIT 1),
        public.wo_avg_length(p_work_order_id),
        6.0
      )
    ELSE
      public.wo_avg_length(p_work_order_id)
  END;
$$;
GRANT EXECUTE ON FUNCTION public.wo_stage_avg_length(uuid, text) TO authenticated, anon, service_role;

-- Helper 3: Convert meters to pieces
CREATE OR REPLACE FUNCTION public.mtr_to_pcs(p_work_order_id uuid, p_mtr numeric)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN COALESCE(public.wo_avg_length(p_work_order_id), 0) <= 0 THEN 0
    ELSE ROUND(GREATEST(COALESCE(p_mtr, 0), 0) / public.wo_avg_length(p_work_order_id))
  END;
$$;
GRANT EXECUTE ON FUNCTION public.mtr_to_pcs(uuid, numeric) TO authenticated, anon, service_role;

-- Helper 4: Stage-aware Metric Ton (MT) calculation
CREATE OR REPLACE FUNCTION public.wo_stage_mtr_to_mt(
  p_work_order_id uuid,
  p_stage_code text DEFAULT null,
  p_mtr numeric DEFAULT 0
)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN p_stage_code IN ('ROLLING', 'HOLLOW_HEAT_TREATMENT') THEN
      COALESCE(
        (SELECT GREATEST(COALESCE(rp.mh_od, w.size_od, 0) - COALESCE(rp.mh_wt, w.size_wt, 0), 0)
              * GREATEST(COALESCE(rp.mh_wt, w.size_wt, 0), 0)
              * 0.0246615 * 0.001 * GREATEST(COALESCE(p_mtr, 0), 0)
         FROM public.rolling_plans rp
         WHERE rp.work_order_id = p_work_order_id
           AND COALESCE(rp.mh_od, 0) > 0 AND COALESCE(rp.mh_wt, 0) > 0
         ORDER BY rp.created_at DESC LIMIT 1),
        GREATEST(COALESCE(w.size_od, 0) - COALESCE(w.size_wt, 0), 0)
        * GREATEST(COALESCE(w.size_wt, 0), 0)
        * 0.0246615 * 0.001 * GREATEST(COALESCE(p_mtr, 0), 0)
      )
    ELSE
      GREATEST(COALESCE(w.size_od, 0) - COALESCE(w.size_wt, 0), 0)
      * GREATEST(COALESCE(w.size_wt, 0), 0)
      * 0.0246615 * 0.001 * GREATEST(COALESCE(p_mtr, 0), 0)
  END
  FROM public.work_orders w WHERE w.id = p_work_order_id;
$$;
GRANT EXECUTE ON FUNCTION public.wo_stage_mtr_to_mt(uuid, text, numeric) TO authenticated, anon, service_role;

-- Drop and recreate views
DROP VIEW IF EXISTS public.vw_dashboard_kpis;
DROP VIEW IF EXISTS public.vw_route_stage_wip;

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
                AND dp.work_center = rs.stage_code), 0)::numeric AS diversion_in,
    COALESCE((SELECT SUM(dp.diverted_qty) FROM public.diversion_plans dp
              WHERE dp.source_wo_id = rs.work_order_id
                AND dp.work_center = rs.stage_code), 0)::numeric AS diversion_out
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
      WHEN sp.stage_code = 'FINISHING' AND EXISTS (SELECT 1 FROM campaign_children cc WHERE cc.work_order_id = sp.work_order_id) THEN
        COALESCE((SELECT SUM(qi.vdi_ok_mtr) FROM public.qc_inspections qi WHERE qi.work_order_id = sp.work_order_id), 0)
      WHEN sp.stage_code = 'FINISHING' AND EXISTS (SELECT 1 FROM campaign_masters cm WHERE cm.work_order_id = sp.work_order_id) THEN
        COALESCE((SELECT SUM(qi.vdi_ok_mtr) FROM public.qc_inspections qi WHERE qi.work_order_id = sp.work_order_id), 0)
      ELSE
        COALESCE((SELECT sp_prev.production_qty - sp_prev.rejection_qty
                  FROM stage_prod sp_prev
                  WHERE sp_prev.work_order_id = sp.work_order_id
                    AND sp_prev.route_id = sp.route_id
                    AND sp_prev.sequence_no = sp.sequence_no - 1), 0)
    END AS incoming_qty
  FROM stage_prod sp
), stage_calculated AS (
  SELECT dm.*,
    CASE
      WHEN dm.stage_code <> 'FINISHING' AND EXISTS (SELECT 1 FROM campaign_children cc WHERE cc.work_order_id = dm.work_order_id) THEN 0
      WHEN dm.stage_code = 'ROLLING' THEN 0
      ELSE
        GREATEST(dm.incoming_qty + dm.diversion_in - GREATEST(dm.production_qty + dm.rejection_qty, dm.downstream_passed_qty) - dm.diversion_out, 0)
    END AS current_wip,
    GREATEST(dm.production_qty - dm.rejection_qty, 0) AS current_net_output
  FROM downstream_max dm
)
SELECT work_order_id, work_order_no, customer_name,
       route_id, route_code, route_name, stage_id, stage_code, stage_name,
       sequence_no, incoming_qty, diversion_in, diversion_out,
       production_qty, rejection_qty, current_wip,
       CASE
         WHEN stage_code IN ('ROLLING', 'HOLLOW_HEAT_TREATMENT') THEN
           round(current_wip / NULLIF(public.wo_stage_avg_length(work_order_id, stage_code), 0))
         ELSE
           public.mtr_to_pcs(work_order_id, current_wip)
       END AS current_wip_pcs,
       public.wo_stage_mtr_to_mt(work_order_id, stage_code, current_wip) AS current_wip_mt,
       production_qty AS gross_output_mtr,
       CASE
         WHEN stage_code IN ('ROLLING', 'HOLLOW_HEAT_TREATMENT') THEN
           round(production_qty / NULLIF(public.wo_stage_avg_length(work_order_id, stage_code), 0))
         ELSE
           public.mtr_to_pcs(work_order_id, production_qty)
       END AS gross_output_pcs,
       public.wo_stage_mtr_to_mt(work_order_id, stage_code, production_qty) AS gross_output_mt,
       rejection_qty AS rejection_mtr,
       CASE
         WHEN stage_code IN ('ROLLING', 'HOLLOW_HEAT_TREATMENT') THEN
           round(rejection_qty / NULLIF(public.wo_stage_avg_length(work_order_id, stage_code), 0))
         ELSE
           public.mtr_to_pcs(work_order_id, rejection_qty)
       END AS rejection_pcs,
       public.wo_stage_mtr_to_mt(work_order_id, stage_code, rejection_qty) AS rejection_mt,
       current_net_output AS net_output_mtr,
       CASE
         WHEN stage_code IN ('ROLLING', 'HOLLOW_HEAT_TREATMENT') THEN
           round(current_net_output / NULLIF(public.wo_stage_avg_length(work_order_id, stage_code), 0))
         ELSE
           public.mtr_to_pcs(work_order_id, current_net_output)
       END AS net_output_pcs,
       public.wo_stage_mtr_to_mt(work_order_id, stage_code, current_net_output) AS net_output_mt,
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

-- Recreate public.vw_dashboard_kpis (excluding Rolling from factory WIP)
CREATE VIEW public.vw_dashboard_kpis AS
SELECT
  COALESCE((SELECT SUM(current_wip) FROM public.vw_route_stage_wip WHERE stage_code <> 'ROLLING'), 0) AS total_wip,
  COALESCE((SELECT SUM(current_wip) FROM public.vw_route_stage_wip WHERE stage_code <> 'ROLLING'), 0) AS total_wip_mtr,
  COALESCE((SELECT SUM(current_wip_pcs) FROM public.vw_route_stage_wip WHERE stage_code <> 'ROLLING'), 0) AS total_wip_pcs,
  COALESCE((SELECT SUM(current_wip_mt) FROM public.vw_route_stage_wip WHERE stage_code <> 'ROLLING'), 0) AS total_wip_mt,
  COALESCE((SELECT SUM(production_qty) FROM public.vw_route_stage_wip WHERE stage_code <> 'ROLLING'), 0) AS total_production,
  COALESCE((SELECT SUM(rejection_qty) FROM public.vw_route_stage_wip WHERE stage_code <> 'ROLLING'), 0) AS total_rejection,
  (SELECT COUNT(*) FROM public.work_orders WHERE status IN ('Open', 'Pending', 'In Progress')) AS active_orders,
  (SELECT COUNT(*) FROM public.work_orders WHERE target_date < current_date AND status IN ('Open', 'Pending', 'In Progress')) AS delayed_orders;

GRANT SELECT ON public.vw_dashboard_kpis TO anon, authenticated, service_role;
