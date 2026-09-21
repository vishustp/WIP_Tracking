-- ======================================================================================
-- REDESIGNED WORK ORDER ROUTE STAGE WIP VIEW (vw_route_stage_wip_v2)
-- ======================================================================================
-- 1. Pieces (PCS) as fundamental integer unit.
-- 2. Rolling Mill is the raw supply feeder (HTC OK mother hollows).
-- 3. Standard CDS -> Feeds directly to DRAW queue.
-- 4. Alloy CDS    -> Feeds to HOLLOW_HEAT_TREATMENT queue (then DRAW once heat-treated).
-- 5. Standard HFS -> Feeds directly to BAND_SAW cutting queue.
-- 6. Dual-dimension mass: Upstream Mother Hollows use (mh_od x mh_wt); drawn pipes use (size_od x size_wt).
-- ======================================================================================

CREATE OR REPLACE VIEW vw_route_stage_wip_v2 AS
WITH stage_prod AS (
    SELECT 
        pl.work_order_id,
        ps.stage_code,
        COALESCE(SUM(CASE 
            WHEN pl.remarks ~* '\[PCS:\s*(\d+)\]' THEN 
                (regexp_match(pl.remarks, '\[PCS:\s*(\d+)\]', 'i'))[1]::numeric
            ELSE 
                ROUND(pl.output_qty / NULLIF(COALESCE(wo.l1, wo.l2, 6.0), 0))
        END), 0) AS production_pcs,
        COALESCE(SUM(pl.output_qty), 0) AS production_mtr,
        COALESCE(SUM(CASE 
            WHEN pl.remarks ~* '\[REJ_PCS:\s*(\d+)\]' THEN 
                (regexp_match(pl.remarks, '\[REJ_PCS:\s*(\d+)\]', 'i'))[1]::numeric
            ELSE 
                ROUND(COALESCE(pl.rejection_qty, 0) / NULLIF(COALESCE(wo.l1, wo.l2, 6.0), 0))
        END), 0) AS rejection_pcs,
        COALESCE(SUM(COALESCE(pl.rejection_qty, 0)), 0) AS rejection_mtr,
        COALESCE(SUM(CASE 
            WHEN pl.remarks ~* '\[HTC_OK:\s*(\d+)\]' THEN 
                (regexp_match(pl.remarks, '\[HTC_OK:\s*(\d+)\]', 'i'))[1]::numeric
            ELSE 
                COALESCE(pl.htc_ok, pl.output_qty)
        END), 0) AS htc_ok_pcs
    FROM production_logs pl
    JOIN process_stages ps ON pl.stage_id = ps.id
    JOIN work_orders wo ON pl.work_order_id = wo.id
    GROUP BY pl.work_order_id, ps.stage_code
),
wo_route_context AS (
    SELECT 
        wo.id AS work_order_id,
        wo.work_order_no,
        wo.customer_name,
        wo.grade,
        wo.size_od,
        wo.size_wt,
        COALESCE(wo.l1, wo.l2, 6.0) AS final_avg_length,
        COALESCE(rp.mh_od, wo.size_od) AS mh_od,
        COALESCE(rp.mh_wt, wo.size_wt) AS mh_wt,
        COALESCE(rp.mh_l1, rp.mh_l2, 6.0) AS mh_avg_length,
        COALESCE(pr.route_code, CASE 
            WHEN wo.grade ~* 'T11|T12|T22' THEN 'ALLOY_CDS'
            ELSE 'CDS'
        END) AS route_code,
        COALESCE(sp_roll.htc_ok_pcs, sp_roll.production_pcs, 0) AS roll_htc_pcs,
        COALESCE(sp_roll.production_mtr, 0) AS roll_mtr
    FROM work_orders wo
    LEFT JOIN rolling_plans rp ON wo.id = rp.work_order_id
    LEFT JOIN process_routes pr ON COALESCE(rp.process_route_id, wo.process_route_id) = pr.id
    LEFT JOIN stage_prod sp_roll ON wo.id = sp_roll.work_order_id AND sp_roll.stage_code = 'ROLLING'
)
SELECT 
    rc.work_order_id,
    rc.work_order_no,
    rc.customer_name,
    rc.grade,
    rc.size_od AS target_od,
    rc.size_wt AS target_wt,
    rc.route_code,
    ps.stage_code,
    ps.stage_name,
    rs.sequence_no,
    -- Physical WIP Calculation per route stage
    CASE 
        WHEN ps.stage_code = 'ROLLING' THEN 0 -- Feeder
        WHEN ps.stage_code = 'HOLLOW_HEAT_TREATMENT' AND rc.route_code ~* 'ALLOY' THEN 
            GREATEST(0, rc.roll_htc_pcs - COALESCE(sp_cur.production_pcs, 0))
        WHEN ps.stage_code = 'DRAW' THEN 
            CASE 
                WHEN rc.route_code ~* 'ALLOY' THEN GREATEST(0, COALESCE(sp_hht.production_pcs, 0) - COALESCE(sp_cur.production_pcs, 0))
                ELSE GREATEST(0, rc.roll_htc_pcs - COALESCE(sp_cur.production_pcs, 0))
            END
        WHEN ps.stage_code = 'HEAT_TREATMENT' THEN 
            GREATEST(0, COALESCE(sp_draw.production_pcs, 0) - COALESCE(sp_cur.production_pcs, 0))
        WHEN ps.stage_code = 'BAND_SAW' THEN 
            CASE 
                WHEN rc.route_code ~* 'HFS' THEN GREATEST(0, rc.roll_htc_pcs - COALESCE(sp_cur.production_pcs, 0))
                ELSE GREATEST(0, COALESCE(sp_ht.production_pcs, 0) - COALESCE(sp_cur.production_pcs, 0))
            END
        WHEN ps.stage_code = 'VDI' THEN 
            GREATEST(0, COALESCE(sp_bs.production_pcs, 0) - COALESCE(sp_cur.production_pcs, 0))
        WHEN ps.stage_code = 'FINISHING' THEN 
            GREATEST(0, COALESCE(sp_vdi.production_pcs, 0) - COALESCE(sp_cur.production_pcs, 0))
        ELSE 0
    END AS current_wip_pcs,
    -- Length Calculation
    CASE 
        WHEN ps.stage_code IN ('HOLLOW_HEAT_TREATMENT', 'DRAW') OR (ps.stage_code = 'BAND_SAW' AND rc.route_code ~* 'HFS') THEN
            rc.mh_avg_length
        ELSE
            rc.final_avg_length
    END AS stage_avg_length,
    -- Mass Calculation (Dual-Dimension MT)
    CASE 
        WHEN ps.stage_code IN ('HOLLOW_HEAT_TREATMENT', 'DRAW') OR (ps.stage_code = 'BAND_SAW' AND rc.route_code ~* 'HFS') THEN
            ((rc.mh_od - rc.mh_wt) * rc.mh_wt * 0.0246615 * 0.001)
        ELSE
            ((rc.size_od - rc.size_wt) * rc.size_wt * 0.0246615 * 0.001)
    END AS stage_unit_weight_mt_per_m
FROM wo_route_context rc
JOIN route_stages rs ON rs.route_id = (SELECT id FROM process_routes WHERE route_code = rc.route_code LIMIT 1)
JOIN process_stages ps ON rs.stage_id = ps.id
LEFT JOIN stage_prod sp_cur ON rc.work_order_id = sp_cur.work_order_id AND ps.stage_code = sp_cur.stage_code
LEFT JOIN stage_prod sp_hht ON rc.work_order_id = sp_hht.work_order_id AND sp_hht.stage_code = 'HOLLOW_HEAT_TREATMENT'
LEFT JOIN stage_prod sp_draw ON rc.work_order_id = sp_draw.work_order_id AND sp_draw.stage_code = 'DRAW'
LEFT JOIN stage_prod sp_ht ON rc.work_order_id = sp_ht.work_order_id AND sp_ht.stage_code = 'HEAT_TREATMENT'
LEFT JOIN stage_prod sp_bs ON rc.work_order_id = sp_bs.work_order_id AND sp_bs.stage_code = 'BAND_SAW'
LEFT JOIN stage_prod sp_vdi ON rc.work_order_id = sp_vdi.work_order_id AND sp_vdi.stage_code = 'VDI'
WHERE ps.stage_code != 'ROLLING';
