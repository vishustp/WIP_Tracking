-- 079_piece_balanced_stage_wip_draw_and_ht.sql
-- Fix phantom WIP and aging at intermediate stages (DRAW, PILGER, HEAT_TREATMENT, HOLLOW_HEAT_TREATMENT)
-- When mother pipes rolled (e.g. 100 Nos @ 7.81m = 781m) are drawn to customer lengths (e.g. 100 Nos @ 6.21m = 621m),
-- all incoming mother pieces are fully accounted for. This migration ensures stage WIP evaluates to 0 in physical pieces
-- and meters when current stage output pieces or downstream passed pieces account for incoming mother pieces.

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
  WHERE wo.id <> '00000000-0000-0000-0000-00000000000b'
    AND upper(trim(wo.work_order_no)) NOT IN ('HOLLOW BANK', 'HB-BUFFER', 'HB BUFFER')
    AND upper(trim(coalesce(wo.customer_name, ''))) NOT LIKE '%HOLLOW BANK%'
    AND upper(trim(coalesce(wo.customer_name, ''))) NOT LIKE '%HB-BUFFER%'
  UNION
  SELECT DISTINCT wo.id, wo.work_order_no, wo.customer_name,
         wo.size_od, wo.size_wt, wo.l1, wo.l2,
         r.id, r.route_code, r.route_name
  FROM public.work_orders wo
  JOIN public.diversion_plans dp ON dp.target_wo_id = wo.id
  JOIN public.process_routes r ON r.id = dp.process_route_id AND r.active
  WHERE wo.id <> '00000000-0000-0000-0000-00000000000b'
    AND upper(trim(wo.work_order_no)) NOT IN ('HOLLOW BANK', 'HB-BUFFER', 'HB BUFFER')
    AND upper(trim(coalesce(wo.customer_name, ''))) NOT LIKE '%HOLLOW BANK%'
    AND upper(trim(coalesce(wo.customer_name, ''))) NOT LIKE '%HB-BUFFER%'
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
      (SELECT MAX(
        CASE
          WHEN sp2.stage_code = 'FINISHING' THEN
            sp2.production_qty + sp2.rejection_qty +
            COALESCE((SELECT SUM(pl_c.output_qty + pl_c.rejection_qty)
                      FROM public.production_logs pl_c
                      JOIN public.route_stages rs_c ON rs_c.stage_id = pl_c.stage_id AND rs_c.route_id = sp2.route_id
                      JOIN public.process_stages ps_c ON ps_c.id = rs_c.stage_id AND ps_c.stage_code = 'FINISHING'
                      WHERE pl_c.work_order_id IN (SELECT ch.child_wo_id FROM campaign_hierarchy ch WHERE ch.master_wo_id = sp.work_order_id)), 0)
          WHEN sp2.stage_code = 'BAND_SAW' THEN
            GREATEST(
              sp2.production_qty + sp2.rejection_qty,
              COALESCE((SELECT SUM(pl_bs.input_qty) FROM public.production_logs pl_bs WHERE pl_bs.work_order_id = sp.work_order_id AND pl_bs.stage_id = sp2.stage_id), 0)
            )
          ELSE sp2.production_qty + sp2.rejection_qty
        END
      )
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
      -- Piece-based clearance for DRAW, PILGER, HEAT_TREATMENT, and HOLLOW_HEAT_TREATMENT:
      -- When logged output pieces or downstream passed pieces account for incoming pieces, active WIP is 0.
      WHEN dm.stage_code IN ('DRAW', 'PILGER', 'HOLLOW_HEAT_TREATMENT', 'HEAT_TREATMENT') AND (
        GREATEST(dm.production_qty + dm.rejection_qty, dm.downstream_passed_qty) > 0
        AND (
          -- Actual logged pieces in remarks [PCS:...] >= preceding stage pieces
          COALESCE(
            (SELECT SUM(COALESCE(
              (substring(pl.remarks from '\[PCS:\s*([0-9]+)\]'))::numeric,
              public.mtr_to_pcs(dm.work_order_id, pl.output_qty)
            ))
            FROM public.production_logs pl
            WHERE pl.work_order_id = dm.work_order_id AND pl.stage_id = dm.stage_id), 0
          ) >= COALESCE(
            (SELECT SUM(COALESCE(
              (substring(pl_prev.remarks from '\[PCS:\s*([0-9]+)\]'))::numeric,
              (substring(pl_prev.remarks from '\[HTC_OK_PCS:\s*([0-9]+)\]'))::numeric,
              (substring(pl_prev.remarks from '\[HTC:\s*([0-9]+)\]'))::numeric,
              public.mtr_to_pcs(dm.work_order_id, pl_prev.output_qty)
            ))
            FROM public.production_logs pl_prev
            WHERE pl_prev.work_order_id = dm.work_order_id
              AND pl_prev.stage_id = (
                SELECT rs_prev.stage_id FROM route_stages rs_prev
                WHERE rs_prev.work_order_id = dm.work_order_id AND rs_prev.sequence_no = dm.sequence_no - 1 LIMIT 1
              )), 0
          )
          -- OR if downstream passed pieces or mother cuts account for incoming pieces
          OR COALESCE(
            (SELECT MAX(
              COALESCE(
                (substring(pl_down.remarks from '"m_pcs":([0-9]+)'))::numeric,
                (substring(pl_down.remarks from '\[PCS:\s*([0-9]+)\]'))::numeric,
                public.mtr_to_pcs(dm.work_order_id, pl_down.output_qty)
              )
            )
            FROM public.production_logs pl_down
            JOIN route_stages rs_down ON rs_down.stage_id = pl_down.stage_id AND rs_down.work_order_id = dm.work_order_id
            WHERE pl_down.work_order_id = dm.work_order_id
              AND rs_down.sequence_no > dm.sequence_no), 0
          ) >= COALESCE(
            (SELECT SUM(COALESCE(
              (substring(pl_prev.remarks from '\[PCS:\s*([0-9]+)\]'))::numeric,
              (substring(pl_prev.remarks from '\[HTC_OK_PCS:\s*([0-9]+)\]'))::numeric,
              (substring(pl_prev.remarks from '\[HTC:\s*([0-9]+)\]'))::numeric,
              public.mtr_to_pcs(dm.work_order_id, pl_prev.output_qty)
            ))
            FROM public.production_logs pl_prev
            WHERE pl_prev.work_order_id = dm.work_order_id
              AND pl_prev.stage_id = (
                SELECT rs_prev.stage_id FROM route_stages rs_prev
                WHERE rs_prev.work_order_id = dm.work_order_id AND rs_prev.sequence_no = dm.sequence_no - 1 LIMIT 1
              )), 0
          )
          -- OR if meters-to-pieces of production or downstream >= incoming pieces
          OR public.mtr_to_pcs(dm.work_order_id, GREATEST(dm.production_qty, dm.downstream_passed_qty)) >= COALESCE(
            (SELECT SUM(COALESCE(
              (substring(pl_prev.remarks from '\[PCS:\s*([0-9]+)\]'))::numeric,
              (substring(pl_prev.remarks from '\[HTC_OK_PCS:\s*([0-9]+)\]'))::numeric,
              (substring(pl_prev.remarks from '\[HTC:\s*([0-9]+)\]'))::numeric,
              public.mtr_to_pcs(dm.work_order_id, pl_prev.output_qty)
            ))
            FROM public.production_logs pl_prev
            WHERE pl_prev.work_order_id = dm.work_order_id
              AND pl_prev.stage_id = (
                SELECT rs_prev.stage_id FROM route_stages rs_prev
                WHERE rs_prev.work_order_id = dm.work_order_id AND rs_prev.sequence_no = dm.sequence_no - 1 LIMIT 1
              )), 0
          )
        )
      ) THEN 0
      WHEN dm.stage_code = 'VDI' AND dm.incoming_qty = 0 AND dm.diversion_in > 0 AND (dm.production_qty + dm.rejection_qty) > 0 AND (dm.downstream_passed_qty > 0 OR (dm.production_qty + dm.rejection_qty) >= dm.diversion_in * 0.8) THEN 0
      WHEN dm.stage_code = 'BAND_SAW' AND (
        -- If Band Saw cuts or downstream passes account for incoming mother pipes:
        GREATEST(dm.production_qty, dm.downstream_passed_qty) > 0
        AND (
          COALESCE((SELECT SUM((substring(pl.remarks from '"m_pcs":([0-9]+)'))::numeric) FROM public.production_logs pl WHERE pl.work_order_id = dm.work_order_id AND pl.stage_id = dm.stage_id), 0) >= public.mtr_to_pcs(dm.work_order_id, dm.incoming_qty)
          OR public.mtr_to_pcs(dm.work_order_id, GREATEST(dm.production_qty, dm.downstream_passed_qty)) >= public.mtr_to_pcs(dm.work_order_id, dm.incoming_qty)
        )
      ) THEN 0
      WHEN dm.stage_code = 'VDI' AND (
        -- If all cut pieces are accounted for by inspected ok + salvage/rejection or downstream finishing:
        (GREATEST(dm.production_qty + dm.rejection_qty, dm.downstream_passed_qty + dm.rejection_qty) >= dm.incoming_qty)
        OR (public.mtr_to_pcs(dm.work_order_id, GREATEST(dm.production_qty + dm.rejection_qty, dm.downstream_passed_qty + dm.rejection_qty)) >= public.mtr_to_pcs(dm.work_order_id, dm.incoming_qty))
      ) THEN 0
      ELSE
        GREATEST(dm.incoming_qty + dm.diversion_in - GREATEST(dm.production_qty + dm.rejection_qty, dm.downstream_passed_qty + CASE WHEN dm.stage_code = 'VDI' THEN dm.rejection_qty ELSE 0 END) - dm.declared_rej_mtr - dm.diversion_out, 0)
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

-- Recreate dependent view: vw_wip_aging with Hollow Bank excluded & piece-balanced stages
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
    COALESCE(
      (SELECT SUM(qi.vdi_salvage_pcs) FROM public.qc_inspections qi WHERE qi.work_order_id = w.work_order_id),
      0
    )::numeric AS vdi_salvage_pcs,
    COALESCE(
      (SELECT SUM(qi.vdi_salvage_mtr) FROM public.qc_inspections qi WHERE qi.work_order_id = w.work_order_id),
      0
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
