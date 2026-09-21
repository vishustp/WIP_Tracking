-- ======================================================================================
-- DIRECT STAGE-TO-STAGE WORK ORDER WIP VIEW & PRODUCTION ENTRY QUEUE (v3)
-- ======================================================================================
-- 1. No "Supply" process or intermediate feeder status.
-- 2. Direct stage-to-stage balance: Stage WIP = Preceding Stage OK - Current Stage OK.
-- 3. First processing stage feeds directly from Rolling HTC OK:
--    - CDS (Carbon): Draw Queue = Rolling HTC OK - Draw OK
--    - ALLOY_CDS: Hollow HT Queue = Rolling HTC OK - Hollow HT OK; Draw Queue = Hollow HT OK - Draw OK
--    - HFS: Band Saw Queue = Rolling HTC OK - Band Saw OK
--    - ALLOY_HFS: Hollow HT Queue = Rolling HTC OK - Hollow HT OK; Band Saw Queue = Hollow HT OK - Band Saw OK
-- 4. Band Saw Transformation:
--    - Upstream of Band Saw: Mother / Drawn Long Pipes (HT Nos)
--    - Downstream of Band Saw (VDI, Finishing): Actual Cut Pieces (Cut Nos)
-- 5. Universal Rejection Handling (Option B):
--    - Rejections stay attached to the work order's balance until diverted or marked commercial.
-- ======================================================================================

DROP VIEW IF EXISTS public.vw_dashboard_kpis CASCADE;
DROP VIEW IF EXISTS public.vw_route_stage_wip CASCADE;

CREATE OR REPLACE VIEW public.vw_route_stage_wip AS
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
        COALESCE(rp.multiple, 1) AS multiple,
        COALESCE(pr.id, wo.process_route_id) AS route_id,
        COALESCE(pr.route_code, CASE 
            WHEN wo.grade ~* 'T11|T12|T22' THEN 'ALLOY_CDS'
            ELSE 'CDS'
        END) AS route_code,
        COALESCE(pr.route_name, 'Cold Drawn Seamless') AS route_name,
        COALESCE(sp_roll.htc_ok_pcs, sp_roll.production_pcs, 0) AS roll_htc_pcs,
        COALESCE(sp_roll.production_mtr, 0) AS roll_mtr
    FROM work_orders wo
    LEFT JOIN rolling_plans rp ON wo.id = rp.work_order_id
    LEFT JOIN process_routes pr ON COALESCE(rp.process_route_id, wo.process_route_id) = pr.id
    LEFT JOIN stage_prod sp_roll ON wo.id = sp_roll.work_order_id AND sp_roll.stage_code = 'ROLLING'
),
route_expanded AS (
    SELECT 
        rc.work_order_id,
        rc.work_order_no,
        rc.customer_name,
        rc.grade,
        rc.size_od,
        rc.size_wt,
        rc.route_id,
        rc.route_code,
        rc.route_name,
        rc.final_avg_length,
        rc.mh_od,
        rc.mh_wt,
        rc.mh_avg_length,
        rc.multiple,
        rc.roll_htc_pcs,
        ps.id AS stage_id,
        ps.stage_code,
        ps.stage_name,
        rs.sequence_no,
        -- Upstream incoming pieces based on preceding stage OK (No Supply process)
        CASE 
            WHEN ps.stage_code = 'HOLLOW_HEAT_TREATMENT' THEN rc.roll_htc_pcs
            WHEN ps.stage_code = 'DRAW' THEN 
                CASE 
                    WHEN rc.route_code ~* 'ALLOY' THEN COALESCE(sp_hht.production_pcs, 0)
                    ELSE rc.roll_htc_pcs
                END
            WHEN ps.stage_code = 'HEAT_TREATMENT' THEN COALESCE(sp_draw.production_pcs, 0)
            WHEN ps.stage_code = 'BAND_SAW' THEN 
                CASE 
                    WHEN rc.route_code ~* 'HFS' THEN rc.roll_htc_pcs
                    ELSE COALESCE(sp_ht.production_pcs, 0)
                END
            WHEN ps.stage_code = 'VDI' THEN COALESCE(sp_bs.production_pcs, 0)
            WHEN ps.stage_code = 'FINISHING' THEN COALESCE(sp_vdi.production_pcs, 0)
            ELSE 0
        END AS incoming_pcs,
        -- Diversions in & out for this stage
        COALESCE((SELECT SUM(dp.diverted_qty) FROM public.diversion_plans dp 
                  WHERE dp.target_wo_id = rc.work_order_id 
                    AND dp.work_center = ps.stage_code), 0)::numeric AS diversion_in_pcs,
        COALESCE((SELECT SUM(dp.diverted_qty) FROM public.diversion_plans dp 
                  WHERE dp.source_wo_id = rc.work_order_id 
                    AND dp.work_center = ps.stage_code), 0)::numeric AS diversion_out_pcs,
        -- Current stage output
        COALESCE(sp_cur.production_pcs, 0) AS production_pcs,
        COALESCE(sp_cur.production_mtr, 0) AS production_mtr,
        COALESCE(sp_cur.rejection_pcs, 0) AS rejection_pcs,
        COALESCE(sp_cur.rejection_mtr, 0) AS rejection_mtr
    FROM wo_route_context rc
    JOIN route_stages rs ON rs.route_id = (SELECT id FROM process_routes WHERE route_code = rc.route_code LIMIT 1)
    JOIN process_stages ps ON rs.stage_id = ps.id
    LEFT JOIN stage_prod sp_cur ON rc.work_order_id = sp_cur.work_order_id AND ps.stage_code = sp_cur.stage_code
    LEFT JOIN stage_prod sp_hht ON rc.work_order_id = sp_hht.work_order_id AND sp_hht.stage_code = 'HOLLOW_HEAT_TREATMENT'
    LEFT JOIN stage_prod sp_draw ON rc.work_order_id = sp_draw.work_order_id AND sp_draw.stage_code = 'DRAW'
    LEFT JOIN stage_prod sp_ht ON rc.work_order_id = sp_ht.work_order_id AND sp_ht.stage_code = 'HEAT_TREATMENT'
    LEFT JOIN stage_prod sp_bs ON rc.work_order_id = sp_bs.work_order_id AND sp_bs.stage_code = 'BAND_SAW'
    LEFT JOIN stage_prod sp_vdi ON rc.work_order_id = sp_vdi.work_order_id AND sp_vdi.stage_code = 'VDI'
    WHERE ps.stage_code != 'ROLLING'
),
wip_calculated AS (
    SELECT 
        re.*,
        -- Direct stage formula: Stage WIP = Preceding OK - Current Stage OK (Option B preserves rejections in order balance)
        GREATEST(0, (re.incoming_pcs + re.diversion_in_pcs) - re.production_pcs - re.diversion_out_pcs) AS current_wip_pcs,
        -- Stage average length
        -- Stage average length (Physical Actual Length)
        CASE 
            WHEN re.stage_code IN ('HOLLOW_HEAT_TREATMENT', 'DRAW') OR (re.stage_code = 'BAND_SAW' AND re.route_code ~* 'HFS') THEN
                re.mh_avg_length
            WHEN re.stage_code IN ('HEAT_TREATMENT', 'BAND_SAW') AND re.route_code ~* 'CDS' THEN
                -- Actual physical elongated drawn length from mass conservation
                COALESCE(
                    ROUND(re.mh_avg_length * (
                        ((re.mh_od - re.mh_wt) * re.mh_wt) / 
                        NULLIF((re.size_od - re.size_wt) * re.size_wt, 0)
                    ), 2),
                    re.final_avg_length
                )
            ELSE
                re.final_avg_length
        END AS stage_avg_length,
        -- Stage Unit Weight MT / meter
        CASE 
            WHEN re.stage_code IN ('HOLLOW_HEAT_TREATMENT', 'DRAW') OR (re.stage_code = 'BAND_SAW' AND re.route_code ~* 'HFS') THEN
                ((re.mh_od - re.mh_wt) * re.mh_wt * 0.0246615 * 0.001)
            ELSE
                ((re.size_od - re.size_wt) * re.size_wt * 0.0246615 * 0.001)
        END AS stage_unit_weight_mt
    FROM route_expanded re
)
SELECT 
    wc.work_order_id,
    wc.work_order_no,
    wc.customer_name,
    wc.route_id,
    wc.route_code,
    wc.route_name,
    wc.stage_id,
    wc.stage_code,
    wc.stage_name,
    wc.sequence_no,
    wc.size_od,
    wc.size_wt,
    wc.final_avg_length AS l1,
    wc.final_avg_length AS l2,
    -- WIP in Pieces, Meters, MT
    wc.current_wip_pcs,
    ROUND(wc.current_wip_pcs * wc.stage_avg_length, 2) AS current_wip_mtr,
    ROUND(wc.current_wip_pcs * wc.stage_avg_length * wc.stage_unit_weight_mt, 3) AS current_wip_mt,
    wc.current_wip_pcs * wc.stage_avg_length AS current_wip,
    -- Production Output Metrics
    wc.production_pcs AS gross_output_pcs,
    wc.production_mtr AS gross_output_mtr,
    ROUND(wc.production_mtr * wc.stage_unit_weight_mt, 3) AS gross_output_mt,
    wc.production_pcs AS net_output_pcs,
    wc.production_mtr AS net_output_mtr,
    ROUND(wc.production_mtr * wc.stage_unit_weight_mt, 3) AS net_output_mt,
    -- Rejection Metrics
    wc.rejection_pcs,
    wc.rejection_mtr,
    ROUND(wc.rejection_mtr * wc.stage_unit_weight_mt, 3) AS rejection_mt,
    -- Feeder incoming metrics
    wc.incoming_pcs,
    ROUND(wc.incoming_pcs * wc.stage_avg_length, 2) AS incoming_mtr,
    wc.diversion_in_pcs AS diversion_in,
    wc.diversion_out_pcs AS diversion_out
FROM wip_calculated wc;

GRANT SELECT ON public.vw_route_stage_wip TO anon, authenticated, service_role;

-- Recreate vw_dashboard_kpis
CREATE OR REPLACE VIEW public.vw_dashboard_kpis AS
SELECT
  COUNT(*) FILTER(WHERE status IN ('Scheduled', 'In Progress')) AS active_work_orders,
  COUNT(*) FILTER(WHERE status = 'Pending Plan') AS pending_planning,
  COUNT(*) FILTER(WHERE status = 'Scheduled') AS scheduled_orders,
  COUNT(*) FILTER(WHERE status = 'In Progress') AS in_progress_orders,
  COALESCE((SELECT COUNT(*) FROM public.production_logs
            WHERE process_date = current_date
              AND stage_id = (SELECT id FROM public.process_stages WHERE stage_code = 'FINISHING')), 0) AS completed_today,
  COALESCE((SELECT SUM(current_wip_mtr) FROM public.vw_route_stage_wip), 0) AS total_wip,
  COALESCE((SELECT SUM(rejection_qty) FROM public.production_logs), 0) AS rejection_qty,
  COUNT(*) FILTER(WHERE target_date < current_date AND total_pending > 0) AS delayed_orders
FROM public.vw_work_order_summary;

GRANT SELECT ON public.vw_dashboard_kpis TO anon, authenticated, service_role;

-- Recreate get_production_entry_queue
CREATE OR REPLACE FUNCTION public.get_production_entry_queue(p_stage_code text)
RETURNS TABLE(
  work_order_id uuid, work_order_no text, customer_name text, specification text,
  od numeric, wl numeric, l1 numeric, l2 numeric, avg_length numeric,
  route_id uuid, route_code text, route_name text, stage_code text,
  balance_to_make_mtr numeric, balance_to_make_pcs numeric, balance_to_make_mt numeric,
  multiple numeric
) LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
SELECT 
  w.work_order_id, 
  w.work_order_no, 
  w.customer_name,
  wo.grade AS specification, 
  w.size_od AS od, 
  w.size_wt AS wl,
  w.l1, 
  w.l2, 
  COALESCE(NULLIF(w.l1, 0), NULLIF(w.l2, 0), 6.0) AS avg_length,
  w.route_id, 
  w.route_code, 
  w.route_name, 
  w.stage_code,
  w.current_wip_mtr AS balance_to_make_mtr,
  w.current_wip_pcs AS balance_to_make_pcs,
  w.current_wip_mt AS balance_to_make_mt,
  COALESCE((SELECT MAX(rp.multiple) FROM public.rolling_plans rp
            WHERE rp.work_order_id = w.work_order_id
              AND rp.process_route_id = w.route_id), 1) AS multiple
FROM public.vw_route_stage_wip w
JOIN public.work_orders wo ON wo.id = w.work_order_id
WHERE w.stage_code = p_stage_code AND w.current_wip_pcs > 0
ORDER BY w.work_order_no, w.route_code;
$$;

GRANT EXECUTE ON FUNCTION public.get_production_entry_queue(text) TO authenticated;
