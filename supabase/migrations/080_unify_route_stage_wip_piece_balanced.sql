-- 080_unify_route_stage_wip_piece_balanced.sql
-- Unify vw_route_stage_wip, vw_wip_aging, and vw_dashboard_kpis with piece-balanced, elongation-aware logic.
-- Matches the shop-floor Queue Engine and Size-Grade WIP Matrix (/reports/wip).

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
          WHEN sp2.stage_code = 'VDI' THEN
            COALESCE((SELECT SUM(qi.vdi_ok_mtr) FROM public.qc_inspections qi
                      WHERE qi.work_order_id = sp.work_order_id
                         OR qi.work_order_id IN (SELECT ch.child_wo_id FROM campaign_hierarchy ch WHERE ch.master_wo_id = sp.work_order_id)), 0)
          WHEN sp2.stage_code = 'FINISHING' THEN
            COALESCE((SELECT SUM(pl_c.output_qty) FROM public.production_logs pl_c
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
    -- Stage nominal lengths
    COALESCE(
      (SELECT COALESCE(rp.mh_l1, (substring(rp.status from '"eff_len":([0-9.]+)'))::numeric, (substring(rp.status from '"sm_len":([0-9.]+)'))::numeric)
       FROM public.rolling_plans rp WHERE rp.work_order_id = dm.work_order_id LIMIT 1),
      (SELECT (wo.l1 + wo.l2) / 2.0 FROM public.work_orders wo WHERE wo.id = dm.work_order_id),
      6.0
    ) AS mh_eff_length,
    COALESCE(
      (SELECT (wo.l1 + wo.l2) / 2.0 FROM public.work_orders wo WHERE wo.id = dm.work_order_id),
      dm.l1, dm.l2, 6.0
    ) AS order_avg_length,

    -- Preceding stage piece count
    COALESCE(
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
    ) AS prec_stage_pcs,

    -- Current stage logged pieces
    COALESCE(
      (SELECT SUM(COALESCE(
        (substring(pl.remarks from '\[PCS:\s*([0-9]+)\]'))::numeric,
        public.mtr_to_pcs(dm.work_order_id, pl.output_qty)
      ))
      FROM public.production_logs pl
      WHERE pl.work_order_id = dm.work_order_id AND pl.stage_id = dm.stage_id), 0
    ) AS curr_stage_pcs,

    -- Downstream passed mother pieces
    COALESCE(
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
    ) AS downstream_passed_pcs,

    -- Band saw mother pieces cut
    COALESCE(
      (SELECT SUM((substring(pl_bs.remarks from '"m_pcs":([0-9]+)'))::numeric)
       FROM public.production_logs pl_bs
       WHERE pl_bs.work_order_id = dm.work_order_id AND pl_bs.stage_id = dm.stage_id), 0
    ) AS bs_mother_pieces_cut
  FROM downstream_max dm
), stage_wip_resolved AS (
  SELECT sc.*,
    CASE
      WHEN sc.stage_code <> 'FINISHING' AND EXISTS (SELECT 1 FROM campaign_children cc WHERE cc.work_order_id = sc.work_order_id) THEN 0
      WHEN sc.stage_code = 'ROLLING' THEN 0

      -- DRAW and PILGER: Piece-balanced to account for cold drawing elongation
      WHEN sc.stage_code IN ('DRAW', 'PILGER') THEN
        CASE
          WHEN sc.prec_stage_pcs > 0 AND GREATEST(sc.curr_stage_pcs, sc.downstream_passed_pcs) >= sc.prec_stage_pcs THEN 0
          WHEN sc.prec_stage_pcs > 0 THEN
            GREATEST(0, sc.prec_stage_pcs - GREATEST(sc.curr_stage_pcs, sc.downstream_passed_pcs)) * sc.mh_eff_length
          ELSE
            GREATEST(sc.incoming_qty + sc.diversion_in - GREATEST(sc.production_qty + sc.rejection_qty, sc.downstream_passed_qty) - sc.declared_rej_mtr - sc.diversion_out, 0)
        END

      -- HEAT_TREATMENT: Piece-balanced against Draw output and Band Saw mother pipe cuts
      WHEN sc.stage_code IN ('HEAT_TREATMENT', 'HOLLOW_HEAT_TREATMENT') THEN
        CASE
          WHEN sc.prec_stage_pcs > 0 AND GREATEST(sc.curr_stage_pcs, sc.downstream_passed_pcs) >= sc.prec_stage_pcs THEN 0
          WHEN sc.prec_stage_pcs > 0 THEN
            GREATEST(0, sc.prec_stage_pcs - GREATEST(sc.curr_stage_pcs, sc.downstream_passed_pcs)) * sc.order_avg_length
          ELSE
            GREATEST(sc.incoming_qty + sc.diversion_in - GREATEST(sc.production_qty + sc.rejection_qty, sc.downstream_passed_qty) - sc.declared_rej_mtr - sc.diversion_out, 0)
        END

      -- BAND_SAW: Piece-balanced against mother pieces cut
      WHEN sc.stage_code = 'BAND_SAW' THEN
        CASE
          WHEN sc.prec_stage_pcs > 0 AND (sc.bs_mother_pieces_cut >= sc.prec_stage_pcs OR sc.downstream_passed_pcs >= sc.prec_stage_pcs) THEN 0
          WHEN sc.prec_stage_pcs > 0 AND sc.bs_mother_pieces_cut > 0 THEN
            GREATEST(0, sc.prec_stage_pcs - sc.bs_mother_pieces_cut) * sc.order_avg_length
          ELSE
            GREATEST(sc.incoming_qty + sc.diversion_in - GREATEST(sc.production_qty + sc.rejection_qty, sc.downstream_passed_qty) - sc.declared_rej_mtr - sc.diversion_out, 0)
        END

      -- VDI: Clearance when inspected ok + salvage/rejection or downstream finishing accounts for incoming
      WHEN sc.stage_code = 'VDI' AND sc.incoming_qty = 0 AND sc.diversion_in > 0 AND (sc.production_qty + sc.rejection_qty) > 0 AND (sc.downstream_passed_qty > 0 OR (sc.production_qty + sc.rejection_qty) >= sc.diversion_in * 0.8) THEN 0
      WHEN sc.stage_code = 'VDI' AND (
        (GREATEST(sc.production_qty + sc.rejection_qty, sc.downstream_passed_qty + sc.rejection_qty) >= sc.incoming_qty)
        OR (public.mtr_to_pcs(sc.work_order_id, GREATEST(sc.production_qty + sc.rejection_qty, sc.downstream_passed_qty + sc.rejection_qty)) >= public.mtr_to_pcs(sc.work_order_id, sc.incoming_qty))
      ) THEN 0

      ELSE
        GREATEST(sc.incoming_qty + sc.diversion_in - GREATEST(sc.production_qty + sc.rejection_qty, sc.downstream_passed_qty + CASE WHEN sc.stage_code = 'VDI' THEN sc.rejection_qty ELSE 0 END) - sc.declared_rej_mtr - sc.diversion_out, 0)
    END AS current_wip,
    GREATEST(sc.production_qty - sc.rejection_qty, 0) AS net_output_mtr
  FROM stage_calculated sc
)
SELECT 
  sw.work_order_id,
  sw.work_order_no,
  sw.customer_name,
  sw.od AS size_od,
  sw.wt AS size_wt,
  sw.route_id,
  sw.route_code,
  sw.route_name,
  sw.sequence_no,
  sw.stage_id,
  sw.stage_code,
  sw.stage_name,
  sw.htc_ok_qty,
  sw.incoming_qty,
  sw.production_qty,
  sw.rejection_qty,
  sw.net_output_mtr,
  sw.diversion_in,
  sw.diversion_out,
  sw.declared_rej_mtr,
  sw.pending_rej_mtr,
  sw.pending_rej_pcs,
  sw.current_wip,
  CASE
    WHEN sw.stage_code IN ('DRAW', 'PILGER') AND sw.prec_stage_pcs > 0 AND GREATEST(sw.curr_stage_pcs, sw.downstream_passed_pcs) >= sw.prec_stage_pcs THEN 0
    WHEN sw.stage_code IN ('DRAW', 'PILGER') AND sw.prec_stage_pcs > 0 THEN GREATEST(0, sw.prec_stage_pcs - GREATEST(sw.curr_stage_pcs, sw.downstream_passed_pcs))
    WHEN sw.stage_code IN ('HEAT_TREATMENT', 'HOLLOW_HEAT_TREATMENT') AND sw.prec_stage_pcs > 0 AND GREATEST(sw.curr_stage_pcs, sw.downstream_passed_pcs) >= sw.prec_stage_pcs THEN 0
    WHEN sw.stage_code IN ('HEAT_TREATMENT', 'HOLLOW_HEAT_TREATMENT') AND sw.prec_stage_pcs > 0 THEN GREATEST(0, sw.prec_stage_pcs - GREATEST(sw.curr_stage_pcs, sw.downstream_passed_pcs))
    WHEN sw.stage_code = 'BAND_SAW' AND sw.prec_stage_pcs > 0 AND (sw.bs_mother_pieces_cut >= sw.prec_stage_pcs OR sw.downstream_passed_pcs >= sw.prec_stage_pcs) THEN 0
    WHEN sw.stage_code = 'BAND_SAW' AND sw.prec_stage_pcs > 0 AND sw.bs_mother_pieces_cut > 0 THEN GREATEST(0, sw.prec_stage_pcs - sw.bs_mother_pieces_cut)
    ELSE public.mtr_to_pcs(sw.work_order_id, sw.current_wip)
  END AS current_wip_pcs,
  public.mtr_to_mt(sw.work_order_id, sw.current_wip) AS current_wip_mt,
  sw.production_qty AS gross_output_mtr,
  public.mtr_to_pcs(sw.work_order_id, sw.production_qty) AS gross_output_pcs,
  public.mtr_to_mt(sw.work_order_id, sw.production_qty) AS gross_output_mt,
  sw.rejection_qty AS rejection_mtr,
  public.mtr_to_pcs(sw.work_order_id, sw.rejection_qty) AS rejection_pcs,
  public.mtr_to_mt(sw.work_order_id, sw.rejection_qty) AS rejection_mt,
  public.mtr_to_pcs(sw.work_order_id, sw.net_output_mtr) AS net_output_pcs,
  public.mtr_to_mt(sw.work_order_id, sw.net_output_mtr) AS net_output_mt
FROM stage_wip_resolved sw;

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
