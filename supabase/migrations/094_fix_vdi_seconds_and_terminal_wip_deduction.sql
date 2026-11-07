-- 094_fix_vdi_seconds_and_terminal_wip_deduction.sql
-- Fixes:
-- 1. Deduct approved VDI rejection declarations / seconds (work_center in 'VDI', 'VDI_SALVAGE') from active VDI salvage WIP and Aging Report.
-- 2. Include modern hot rolling and HTC logs in ROLLING stage production and HTC OK metrics in vw_route_stage_wip.
-- 3. Prevent downstream Band Saw cut pieces from zeroing out Heat Treatment mother pipe WIP when Draw output > HT output.
-- 4. Recreate get_production_entry_queue RPC with correct wo.l1 and wo.l2 references.

DROP VIEW IF EXISTS public.vw_dashboard_kpis CASCADE;
DROP VIEW IF EXISTS public.vw_wip_aging CASCADE;
DROP VIEW IF EXISTS public.vw_route_stage_wip CASCADE;

CREATE VIEW public.vw_route_stage_wip AS
WITH wo_primary_route AS (
  SELECT DISTINCT ON (wo.id)
    wo.id AS work_order_id,
    wo.work_order_no,
    wo.customer_name,
    wo.size_od AS od,
    wo.size_wt AS wt,
    wo.l1,
    wo.l2,
    COALESCE(rp.process_route_id, dp.process_route_id) AS route_id
  FROM public.work_orders wo
  LEFT JOIN public.rolling_plans rp ON rp.work_order_id = wo.id AND rp.process_route_id IS NOT NULL
  LEFT JOIN public.diversion_plans dp ON dp.target_wo_id = wo.id AND dp.process_route_id IS NOT NULL
  WHERE wo.id <> '00000000-0000-0000-0000-00000000000b'
    AND upper(trim(coalesce(wo.work_order_no, ''))) NOT IN ('HOLLOW BANK', 'HB-BUFFER', 'HB BUFFER')
    AND upper(trim(coalesce(wo.customer_name, ''))) NOT LIKE '%HOLLOW BANK%'
    AND upper(trim(coalesce(wo.customer_name, ''))) NOT LIKE '%HB-BUFFER%'
    AND (rp.process_route_id IS NOT NULL OR dp.process_route_id IS NOT NULL)
  ORDER BY wo.id, rp.created_at DESC NULLS LAST, dp.created_at DESC NULLS LAST
), route_base AS (
  SELECT wpr.work_order_id, wpr.work_order_no, wpr.customer_name,
         wpr.od, wpr.wt, wpr.l1, wpr.l2,
         r.id AS route_id, r.route_code, r.route_name
  FROM wo_primary_route wpr
  JOIN public.process_routes r ON r.id = wpr.route_id AND r.active
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
       JOIN public.process_stages ps_pl ON ps_pl.id = pl.stage_id
       WHERE pl.work_order_id = rs.work_order_id
         AND (
           pl.stage_id = rs.stage_id
           OR (rs.stage_code = 'ROLLING' AND ps_pl.stage_code IN ('ROLLING', 'HOT_ROLLING', 'HTC'))
         )
      ), 0
    )::numeric AS htc_ok_qty,
    CASE
      WHEN rs.stage_code = 'ROLLING' THEN
        COALESCE(
          (SELECT SUM(pl.output_qty) FROM public.production_logs pl
           JOIN public.process_stages ps_pl ON ps_pl.id = pl.stage_id
           WHERE pl.work_order_id = rs.work_order_id
             AND (
               pl.stage_id = rs.stage_id
               OR ps_pl.stage_code IN ('ROLLING', 'HOT_ROLLING')
             )
          ), 0
        )::numeric
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
        COALESCE(
          (SELECT SUM(pl.output_qty) FROM public.production_logs pl
           WHERE pl.work_order_id = rs.work_order_id AND pl.stage_id = rs.stage_id), 0
        )::numeric
    END AS production_qty,
    CASE
      WHEN rs.stage_code = 'VDI' THEN
        COALESCE(
          (SELECT SUM(qi.vdi_rejection_mtr) FROM public.qc_inspections qi
           WHERE qi.work_order_id = rs.work_order_id
              OR qi.work_order_id IN (SELECT ch.child_wo_id FROM campaign_hierarchy ch WHERE ch.master_wo_id = rs.work_order_id)),
          (SELECT SUM(pl.rejection_qty) FROM public.production_logs pl WHERE pl.work_order_id = rs.work_order_id AND pl.stage_id = rs.stage_id),
          0
        )::numeric
      ELSE
        COALESCE(
          (SELECT SUM(pl.rejection_qty) FROM public.production_logs pl
           WHERE pl.work_order_id = rs.work_order_id AND pl.stage_id = rs.stage_id), 0
        )::numeric
    END AS rejection_qty,
    CASE
      WHEN rs.stage_code = 'VDI' THEN
        COALESCE(
          (SELECT SUM(qi.vdi_salvage_mtr) FROM public.qc_inspections qi
           WHERE qi.work_order_id = rs.work_order_id
              OR qi.work_order_id IN (SELECT ch.child_wo_id FROM campaign_hierarchy ch WHERE ch.master_wo_id = rs.work_order_id)),
          0
        )::numeric
      ELSE 0
    END AS salvage_mtr,
    CASE
      WHEN rs.stage_code = 'VDI' THEN
        COALESCE(
          (SELECT SUM(qi.vdi_salvage_pcs) FROM public.qc_inspections qi
           WHERE qi.work_order_id = rs.work_order_id
              OR qi.work_order_id IN (SELECT ch.child_wo_id FROM campaign_hierarchy ch WHERE ch.master_wo_id = rs.work_order_id)),
          0
        )::numeric
      ELSE 0
    END AS salvage_pcs,
    COALESCE((
      SELECT SUM(dp.diverted_qty) FROM public.diversion_plans dp
      WHERE dp.source_wo_id = rs.work_order_id
        AND (dp.status IS NULL OR dp.status = 'APPROVED')
        AND (
          COALESCE(substring(dp.reason from '\[FROM_STAGE:\s*([A-Z_]+)\]'), dp.work_center) IN ('VDI_SALVAGE')
          OR (
            COALESCE(substring(dp.reason from '\[FROM_STAGE:\s*([A-Z_]+)\]'), dp.work_center) = 'VDI'
            AND (
              lower(coalesce(dp.reason, '')) LIKE '%salvage%'
              OR lower(coalesce(dp.reason, '')) LIKE '%offcut%'
              OR lower(coalesce(dp.reason, '')) LIKE '%remnant%'
            )
          )
        )
    ), 0)::numeric AS salvage_div_out_mtr,
    COALESCE((
      SELECT SUM(COALESCE((substring(dp.reason from '\[PCS:\s*([0-9]+)\]'))::numeric, public.mtr_to_pcs(rs.work_order_id, dp.diverted_qty), 0)) FROM public.diversion_plans dp
      WHERE dp.source_wo_id = rs.work_order_id
        AND (dp.status IS NULL OR dp.status = 'APPROVED')
        AND (
          COALESCE(substring(dp.reason from '\[FROM_STAGE:\s*([A-Z_]+)\]'), dp.work_center) IN ('VDI_SALVAGE')
          OR (
            COALESCE(substring(dp.reason from '\[FROM_STAGE:\s*([A-Z_]+)\]'), dp.work_center) = 'VDI'
            AND (
              lower(coalesce(dp.reason, '')) LIKE '%salvage%'
              OR lower(coalesce(dp.reason, '')) LIKE '%offcut%'
              OR lower(coalesce(dp.reason, '')) LIKE '%remnant%'
            )
          )
        )
    ), 0)::numeric AS salvage_div_out_pcs,
    COALESCE((
      SELECT SUM(hb.total_meters) FROM public.hollow_bank_inventory hb
      WHERE hb.source_wo_id = rs.work_order_id
        AND (hb.source_stage_code IN ('VDI', 'VDI_SALVAGE') OR hb.source_stage_code IS NULL)
    ), 0)::numeric
    +
    COALESCE((
      SELECT SUM(dp.diverted_qty) FROM public.diversion_plans dp
      WHERE dp.source_wo_id = rs.work_order_id
        AND (dp.status IS NULL OR dp.status = 'APPROVED')
        AND (dp.target_wo_id = '00000000-0000-0000-0000-00000000000b' OR upper(trim(dp.reason)) LIKE '%HOLLOW BANK%')
        AND COALESCE(substring(dp.reason from '\[FROM_STAGE:\s*([A-Z_]+)\]'), dp.work_center) IN ('VDI', 'VDI_SALVAGE')
        AND NOT EXISTS (
          SELECT 1 FROM public.hollow_bank_inventory hb2
          WHERE hb2.source_wo_id = rs.work_order_id AND abs(hb2.total_meters - dp.diverted_qty) < 0.1
        )
    ), 0)::numeric AS salvage_hb_out_mtr,
    COALESCE((
      SELECT SUM(hb.pcs) FROM public.hollow_bank_inventory hb
      WHERE hb.source_wo_id = rs.work_order_id
        AND (hb.source_stage_code IN ('VDI', 'VDI_SALVAGE') OR hb.source_stage_code IS NULL)
    ), 0)::numeric
    +
    COALESCE((
      SELECT SUM(COALESCE((substring(dp.reason from '\[PCS:\s*([0-9]+)\]'))::numeric, public.mtr_to_pcs(rs.work_order_id, dp.diverted_qty), 0)) FROM public.diversion_plans dp
      WHERE dp.source_wo_id = rs.work_order_id
        AND (dp.status IS NULL OR dp.status = 'APPROVED')
        AND (dp.target_wo_id = '00000000-0000-0000-0000-00000000000b' OR upper(trim(dp.reason)) LIKE '%HOLLOW BANK%')
        AND COALESCE(substring(dp.reason from '\[FROM_STAGE:\s*([A-Z_]+)\]'), dp.work_center) IN ('VDI', 'VDI_SALVAGE')
    ), 0)::numeric AS salvage_hb_out_pcs,
    COALESCE((
      SELECT SUM(COALESCE(rd.ppc_approved_mtr, rd.qc_verified_mtr, rd.rejected_mtr))
      FROM public.rejection_declarations rd
      WHERE rd.work_order_id = rs.work_order_id
        AND rd.work_center IN ('VDI', 'VDI_SALVAGE')
        AND rd.status = 'APPROVED'
    ), 0)::numeric AS salvage_approved_decl_mtr,
    COALESCE((
      SELECT SUM(COALESCE(rd.ppc_approved_pcs, rd.qc_verified_pcs, rd.rejected_pcs))
      FROM public.rejection_declarations rd
      WHERE rd.work_order_id = rs.work_order_id
        AND rd.work_center IN ('VDI', 'VDI_SALVAGE')
        AND rd.status = 'APPROVED'
    ), 0)::numeric AS salvage_approved_decl_pcs,
    COALESCE(
      (SELECT SUM(COALESCE(
        NULLIF(pl.output_pcs, 0),
        (substring(pl.remarks from '\[PCS:\s*([0-9]+)\]'))::numeric,
        public.mtr_to_pcs(rs.work_order_id, pl.output_qty)
      ))
      FROM public.production_logs pl
      WHERE pl.work_order_id = rs.work_order_id AND pl.stage_id = rs.stage_id), 0
    )::numeric AS curr_stage_pcs,
    COALESCE(
      (SELECT SUM(dp.diverted_qty) FROM public.diversion_plans dp
       WHERE dp.target_wo_id = rs.work_order_id
         AND (dp.status IS NULL OR dp.status = 'APPROVED')
         AND dp.process_route_id = rs.route_id
         AND COALESCE(substring(dp.reason from '\[TO_STAGE:\s*([A-Z_]+)\]'), dp.work_center) = rs.stage_code), 0
    )::numeric AS diversion_in,
    COALESCE(
      (SELECT SUM(dp.diverted_qty) FROM public.diversion_plans dp
       WHERE dp.source_wo_id = rs.work_order_id
         AND (dp.status IS NULL OR dp.status = 'APPROVED')
         AND dp.process_route_id = rs.route_id
         AND COALESCE(substring(dp.reason from '\[FROM_STAGE:\s*([A-Z_]+)\]'), dp.work_center) = rs.stage_code), 0
    )::numeric AS diversion_out,
    -- Approved Rejection Declarations (strictly deducted from stage WIP only upon final PPC approval)
    COALESCE((
      SELECT SUM(COALESCE(rd.ppc_approved_mtr, rd.qc_verified_mtr, rd.rejected_mtr))
      FROM public.rejection_declarations rd
      WHERE rd.work_order_id = rs.work_order_id
        AND rd.work_center = rs.stage_code
        AND rd.status = 'APPROVED'
    ), 0)::numeric AS declared_rej_mtr,
    -- Pending Rejection Declarations (for operational hold warnings, NOT deducted from active WIP)
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
            GREATEST(
              sp2.production_qty,
              COALESCE((SELECT SUM(qi.vdi_ok_mtr + qi.vdi_salvage_mtr + qi.vdi_rejection_mtr) FROM public.qc_inspections qi
                        WHERE qi.work_order_id = sp.work_order_id
                           OR qi.work_order_id IN (SELECT ch.child_wo_id FROM campaign_hierarchy ch WHERE ch.master_wo_id = sp.work_order_id)), 0)
            )
          ELSE sp2.production_qty
        END
      )
      FROM stage_prod sp2
      WHERE sp2.work_order_id = sp.work_order_id
        AND sp2.route_id = sp.route_id
        AND sp2.sequence_no > sp.sequence_no), 0
    )::numeric AS downstream_passed_qty,
    COALESCE(
      (SELECT MAX(
        CASE 
          WHEN sp2.stage_code = 'VDI' THEN
            COALESCE((SELECT SUM(qi.vdi_ok_pcs) FROM public.qc_inspections qi
                      WHERE qi.work_order_id = sp.work_order_id
                         OR qi.work_order_id IN (SELECT ch.child_wo_id FROM campaign_hierarchy ch WHERE ch.master_wo_id = sp.work_order_id)),
                      sp2.curr_stage_pcs)
          WHEN sp2.stage_code = 'BAND_SAW' THEN
            GREATEST(
              COALESCE((SELECT SUM((substring(pl.remarks from '"m_pcs":([0-9]+)'))::numeric) FROM public.production_logs pl
                        WHERE pl.work_order_id = sp.work_order_id AND pl.stage_id = sp2.stage_id), 0),
              sp2.curr_stage_pcs
            )
          ELSE sp2.curr_stage_pcs
        END
      )
      FROM stage_prod sp2
      WHERE sp2.work_order_id = sp.work_order_id
        AND sp2.route_id = sp.route_id
        AND sp2.sequence_no > sp.sequence_no), 0
    )::numeric AS downstream_passed_pcs
  FROM stage_prod sp
), stage_calculated AS (
  SELECT dm.*,
    COALESCE(
      (SELECT
         CASE 
           WHEN prev.stage_code = 'ROLLING' THEN prev.htc_ok_qty
           WHEN prev.stage_code = 'HOLLOW_HEAT_TREATMENT' THEN prev.htc_ok_qty
           WHEN prev.stage_code = 'VDI' THEN prev.production_qty
           ELSE GREATEST(prev.production_qty - prev.rejection_qty, 0)
         END
       FROM stage_prod prev
       WHERE prev.work_order_id = dm.work_order_id
         AND prev.route_id = dm.route_id
         AND prev.sequence_no = (
           SELECT MAX(p.sequence_no) FROM stage_prod p
           WHERE p.work_order_id = dm.work_order_id AND p.route_id = dm.route_id AND p.sequence_no < dm.sequence_no
         )
      ), 0
    )::numeric AS incoming_qty,
    -- Preceding stage piece count deducting preceding stage rejections
    COALESCE(
      (SELECT 
         CASE
           WHEN prev.stage_code = 'ROLLING' THEN
             COALESCE((SELECT SUM(COALESCE(NULLIF(pl.htc_ok_pcs, 0), (substring(pl.remarks from '\[HTC_PCS:\s*([0-9]+)\]'))::numeric, NULLIF(pl.output_pcs, 0))) FROM public.production_logs pl
                       WHERE pl.work_order_id = dm.work_order_id AND pl.stage_id = prev.stage_id AND (pl.htc_ok_pcs > 0 OR pl.output_pcs > 0)),
                      prev.curr_stage_pcs)
           WHEN prev.stage_code = 'VDI' THEN
             COALESCE((SELECT SUM(qi.vdi_ok_pcs) FROM public.qc_inspections qi
                       WHERE qi.work_order_id = dm.work_order_id
                          OR qi.work_order_id IN (SELECT ch.child_wo_id FROM campaign_hierarchy ch WHERE ch.master_wo_id = dm.work_order_id)),
                      prev.curr_stage_pcs)
           ELSE 
             GREATEST(0, prev.curr_stage_pcs - prev.rejection_qty / NULLIF(public.wo_avg_length(dm.work_order_id), 0))
         END
       FROM stage_prod prev
       WHERE prev.work_order_id = dm.work_order_id
         AND prev.route_id = dm.route_id
         AND prev.sequence_no = (
           SELECT MAX(p.sequence_no) FROM stage_prod p
           WHERE p.work_order_id = dm.work_order_id AND p.route_id = dm.route_id AND p.sequence_no < dm.sequence_no
         )
      ), 0
    )::numeric AS prec_stage_pcs,
    COALESCE(public.wo_avg_length(dm.work_order_id), 6.0)::numeric AS order_avg_length,
    COALESCE(
      (SELECT rp.mh_l1 FROM public.rolling_plans rp
       WHERE rp.work_order_id = dm.work_order_id AND COALESCE(rp.mh_l1, 0) > 0
       ORDER BY rp.created_at DESC LIMIT 1),
      public.wo_avg_length(dm.work_order_id),
      6.0
    )::numeric AS mh_eff_length,
    -- Band saw mother pieces cut
    COALESCE(
      (SELECT SUM((substring(pl_bs.remarks from '"m_pcs":([0-9]+)'))::numeric)
       FROM public.production_logs pl_bs
       WHERE pl_bs.work_order_id = dm.work_order_id AND pl_bs.stage_id = dm.stage_id), 0
    ) AS bs_mother_pieces_cut,
    CASE
      WHEN dm.stage_code = 'VDI' THEN
        GREATEST(0, dm.salvage_mtr - dm.salvage_div_out_mtr - dm.salvage_hb_out_mtr - dm.salvage_approved_decl_mtr)::numeric
      ELSE 0::numeric
    END AS active_salvage_mtr_val,
    CASE
      WHEN dm.stage_code = 'VDI' THEN
        GREATEST(0, dm.salvage_pcs - dm.salvage_div_out_pcs - dm.salvage_hb_out_pcs - dm.salvage_approved_decl_pcs)::numeric
      ELSE 0::numeric
    END AS active_salvage_pcs_val
  FROM downstream_max dm
), stage_wip_resolved AS (
  SELECT sc.*,
    CASE
      WHEN sc.stage_code <> 'FINISHING' AND EXISTS (SELECT 1 FROM campaign_children cc WHERE cc.work_order_id = sc.work_order_id) THEN 0
      WHEN sc.stage_code = 'ROLLING' THEN 0

      -- DRAW and PILGER: Piece-balanced to account for cold drawing elongation
      WHEN sc.stage_code IN ('DRAW', 'PILGER') THEN
        CASE
          WHEN (sc.prec_stage_pcs > 0 AND GREATEST(sc.curr_stage_pcs, sc.downstream_passed_pcs) >= sc.prec_stage_pcs)
            OR (sc.incoming_qty > 0 AND GREATEST(sc.production_qty, sc.downstream_passed_qty) >= sc.incoming_qty) THEN 0
          WHEN sc.prec_stage_pcs > 0 THEN
            GREATEST(0, sc.prec_stage_pcs - GREATEST(sc.curr_stage_pcs, sc.downstream_passed_pcs)) * sc.mh_eff_length
          ELSE
            GREATEST(sc.incoming_qty + sc.diversion_in - GREATEST(sc.production_qty + sc.rejection_qty, sc.downstream_passed_qty) - sc.declared_rej_mtr - sc.diversion_out, 0)
        END

      -- HEAT_TREATMENT: Piece-balanced against Preceding output (Draw / Pilger) minus Heat Treatment output
      WHEN sc.stage_code IN ('HEAT_TREATMENT', 'HOLLOW_HEAT_TREATMENT') THEN
        CASE
          WHEN (sc.prec_stage_pcs > 0 AND sc.curr_stage_pcs >= sc.prec_stage_pcs)
            OR (sc.incoming_qty > 0 AND sc.production_qty >= sc.incoming_qty) THEN 0
          WHEN sc.prec_stage_pcs > 0 THEN
            GREATEST(0, sc.prec_stage_pcs - sc.curr_stage_pcs) * sc.order_avg_length
          ELSE
            GREATEST(sc.incoming_qty + sc.diversion_in - (sc.production_qty + sc.rejection_qty) - sc.declared_rej_mtr - sc.diversion_out, 0)
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

      -- VDI: Active WIP = Uninspected incoming pipes + Active Salvage awaiting disposition
      WHEN sc.stage_code = 'VDI' THEN
        CASE
          WHEN sc.prec_stage_pcs > 0 THEN
            GREATEST(0,
              sc.prec_stage_pcs
              - COALESCE((SELECT SUM(qi.vdi_ok_pcs + qi.vdi_salvage_pcs + qi.vdi_rejection_pcs)
                          FROM public.qc_inspections qi
                          WHERE qi.work_order_id = sc.work_order_id
                             OR qi.work_order_id IN (SELECT ch.child_wo_id FROM campaign_hierarchy ch WHERE ch.master_wo_id = sc.work_order_id)), 0)
            ) * sc.order_avg_length
            + sc.active_salvage_mtr_val
          ELSE
            GREATEST(0,
              sc.incoming_qty + sc.diversion_in
              - GREATEST(
                  sc.production_qty + sc.rejection_qty + sc.salvage_mtr,
                  sc.downstream_passed_qty + sc.rejection_qty + sc.salvage_mtr
                )
              - sc.declared_rej_mtr - GREATEST(0, sc.diversion_out - sc.salvage_div_out_mtr)
            )
            + sc.active_salvage_mtr_val
        END

      -- FINISHING: Direct stage balance deducting declared rejections and outbound diversions
      ELSE
        GREATEST(
          sc.incoming_qty + sc.diversion_in - (sc.production_qty + sc.rejection_qty) - sc.declared_rej_mtr - sc.diversion_out,
          0
        )
    END::numeric AS current_wip,
    GREATEST(sc.production_qty - sc.rejection_qty, 0)::numeric AS net_output_mtr
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
  sw.current_wip,
  CASE
    WHEN sw.current_wip <= 0 THEN 0
    WHEN sw.stage_code = 'ROLLING' THEN 0
    WHEN sw.stage_code = 'VDI' THEN
      CASE
        WHEN sw.prec_stage_pcs > 0 THEN
          GREATEST(0,
            sw.prec_stage_pcs
            - COALESCE((SELECT SUM(qi.vdi_ok_pcs + qi.vdi_salvage_pcs + qi.vdi_rejection_pcs)
                        FROM public.qc_inspections qi
                        WHERE qi.work_order_id = sw.work_order_id
                           OR qi.work_order_id IN (SELECT ch.child_wo_id FROM campaign_hierarchy ch WHERE ch.master_wo_id = sw.work_order_id)), 0)
          )
          + sw.active_salvage_pcs_val
        ELSE
          GREATEST(0,
            sw.incoming_qty
            - GREATEST(
                sw.production_qty + sw.rejection_qty + sw.salvage_mtr,
                sw.downstream_passed_qty + sw.rejection_qty + sw.salvage_mtr
              )
          ) / NULLIF(sw.order_avg_length, 0)
          + sw.active_salvage_pcs_val
      END
    WHEN sw.stage_code IN ('DRAW', 'PILGER') AND ((sw.prec_stage_pcs > 0 AND GREATEST(sw.curr_stage_pcs, sw.downstream_passed_pcs) >= sw.prec_stage_pcs) OR sw.current_wip <= 0) THEN 0
    WHEN sw.stage_code IN ('DRAW', 'PILGER') AND sw.prec_stage_pcs > 0 THEN GREATEST(0, sw.prec_stage_pcs - GREATEST(sw.curr_stage_pcs, sw.downstream_passed_pcs))
    WHEN sw.stage_code IN ('HEAT_TREATMENT', 'HOLLOW_HEAT_TREATMENT') AND ((sw.prec_stage_pcs > 0 AND sw.curr_stage_pcs >= sw.prec_stage_pcs) OR sw.current_wip <= 0) THEN 0
    WHEN sw.stage_code IN ('HEAT_TREATMENT', 'HOLLOW_HEAT_TREATMENT') AND sw.prec_stage_pcs > 0 THEN GREATEST(0, sw.prec_stage_pcs - sw.curr_stage_pcs)
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
  sw.net_output_mtr,
  public.mtr_to_pcs(sw.work_order_id, sw.net_output_mtr) AS net_output_pcs,
  public.mtr_to_mt(sw.work_order_id, sw.net_output_mtr) AS net_output_mt,
  sw.declared_rej_mtr,
  sw.pending_rej_mtr,
  sw.pending_rej_pcs,
  sw.active_salvage_pcs_val AS vdi_salvage_pcs,
  sw.active_salvage_mtr_val AS vdi_salvage_mtr
FROM stage_wip_resolved sw;

GRANT SELECT ON public.vw_route_stage_wip TO anon, authenticated, service_role;

-- Recreate dependent view: vw_wip_aging with Hollow Bank excluded & piece-balanced stages
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
    w.vdi_salvage_pcs,
    w.vdi_salvage_mtr,
    (
      SELECT pl.process_date
      FROM public.production_logs pl
      WHERE pl.work_order_id = w.work_order_id AND pl.stage_id = w.stage_id
      ORDER BY pl.process_date DESC, pl.created_at DESC LIMIT 1
    ) AS stage_last_log_date,
    (
      SELECT pl.process_date
      FROM public.production_logs pl
      JOIN public.route_stages rs_prev ON rs_prev.stage_id = pl.stage_id AND rs_prev.route_id = w.route_id
      WHERE pl.work_order_id = w.work_order_id AND rs_prev.sequence_no < w.sequence_no
      ORDER BY pl.process_date DESC, pl.created_at DESC LIMIT 1
    ) AS upstream_last_log_date,
    (
      SELECT rp.planned_rolling_date
      FROM public.rolling_plans rp
      WHERE rp.work_order_id = w.work_order_id
      ORDER BY rp.planned_rolling_date DESC, rp.created_at DESC LIMIT 1
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
    AND upper(trim(coalesce(wo.customer_name, ''))) NOT LIKE '%HB-BUFFER%'
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

-- Recreate get_production_entry_queue function with correct column references (wo.l1, wo.l2)
DROP FUNCTION IF EXISTS public.get_production_entry_queue(text);

CREATE OR REPLACE FUNCTION public.get_production_entry_queue(p_stage_code text)
RETURNS TABLE(
  work_order_id uuid, work_order_no text, customer_name text, specification text,
  od numeric, wl numeric, l1 numeric, l2 numeric, avg_length numeric,
  route_id uuid, route_code text, route_name text, stage_code text,
  balance_to_make_mtr numeric, balance_to_make_pcs numeric, balance_to_make_mt numeric,
  multiple numeric
) LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
SELECT w.work_order_id, w.work_order_no, w.customer_name,
       wo.grade AS specification, w.size_od AS od, w.size_wt AS wl,
       wo.l1, wo.l2, public.wo_avg_length(w.work_order_id) AS avg_length,
       w.route_id, w.route_code, w.route_name, w.stage_code,
       w.current_wip AS balance_to_make_mtr,
       public.mtr_to_pcs(w.work_order_id, w.current_wip) AS balance_to_make_pcs,
       public.mtr_to_mt(w.work_order_id, w.current_wip) AS balance_to_make_mt,
       COALESCE((SELECT MAX(dp.multiple) FROM public.diversion_plans dp
                 WHERE dp.target_wo_id = w.work_order_id
                   AND dp.process_route_id = w.route_id
                   AND dp.work_center = w.stage_code),
                (SELECT MAX(rp.multiple) FROM public.rolling_plans rp
                 WHERE rp.work_order_id = w.work_order_id
                   AND rp.process_route_id = w.route_id), 1) AS multiple
FROM public.vw_route_stage_wip w
JOIN public.work_orders wo ON wo.id = w.work_order_id
WHERE w.stage_code = p_stage_code 
  AND w.current_wip > 0
  AND w.work_order_id <> '00000000-0000-0000-0000-00000000000b'
ORDER BY w.work_order_no, w.route_code;
$$;

GRANT EXECUTE ON FUNCTION public.get_production_entry_queue(text) TO authenticated, anon, service_role;
