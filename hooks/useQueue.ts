import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { StageCode, Row, emptyRow } from "@/types";
import { extractPcsFromRemarks } from "@/lib/productionUtils";

const clientQueueCache = new Map<string, { timestamp: number; rows: Row[] }>();
const inflightPromises = new Map<string, Promise<any>>();
const CLIENT_CACHE_TTL_MS = 2000;

export function useQueue(stage: StageCode) {
  const [rows, setRows] = useState<Row[]>(() => {
    const cached = clientQueueCache.get(stage);
    return cached && Date.now() - cached.timestamp < CLIENT_CACHE_TTL_MS ? cached.rows : [];
  });
  const [loading, setLoading] = useState<boolean>(() => {
    const cached = clientQueueCache.get(stage);
    return !(cached && Date.now() - cached.timestamp < CLIENT_CACHE_TTL_MS);
  });
  const [error, setError] = useState<string | null>(null);
  const stageRef = useRef(stage);
  stageRef.current = stage;

  const loadQueue = useCallback(async (targetStage?: StageCode, forceRefresh = false) => {
    const s = targetStage || stageRef.current;

    // Check fast client-side cache
    if (!forceRefresh) {
      const cached = clientQueueCache.get(s);
      if (cached && Date.now() - cached.timestamp < CLIENT_CACHE_TTL_MS) {
        setRows(cached.rows);
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    setError(null);

    try {
      // Deduplicate concurrent inflight requests for the same stage
      const cacheKey = `${s}_${forceRefresh ? 'fresh' : 'cached'}`;
      let fetchPromise = inflightPromises.get(cacheKey);

      if (!fetchPromise) {
        const url = `/api/production/queue?stage=${s}&_t=${Date.now()}${forceRefresh ? '&nocache=1' : ''}`;
        fetchPromise = fetch(url, {
          cache: "no-store",
          headers: { "Pragma": "no-cache", "Cache-Control": "no-cache" },
        }).then(async (res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        }).finally(() => {
          inflightPromises.delete(cacheKey);
        });
        inflightPromises.set(cacheKey, fetchPromise);
      }

      const json = await fetchPromise;
      if (Array.isArray(json?.data)) {
        const mappedRows = json.data.map((r: any) => emptyRow(r));
        clientQueueCache.set(s, { timestamp: Date.now(), rows: mappedRows });
        setRows(mappedRows);
        setLoading(false);
        return;
      }
    } catch {
      // Fall back to direct query below
    }

    try {
      const supabase = createClient();

      // 1. Fetch standard queue, plans, process stages, production logs, qc, and diversions
      const [queueRes, plansRes, stagesRes, logsRes, qcRes, divsRes] = await Promise.all([
        supabase.rpc("get_production_entry_queue", { p_stage_code: s }),
        supabase
          .from("rolling_plans")
          .select("id, plan_no, work_order_id, status, process_route_id, planned_qty, mh_od, mh_wt, mh_l1, mh_l2")
          .not("status", "is", null)
          .order("created_at", { ascending: false })
          .limit(250),
        supabase
          .from("process_stages")
          .select("id, stage_code"),
        supabase
          .from("production_logs")
          .select("work_order_id, stage_id, output_qty, rejection_qty, htc_ok, remarks")
          .order("created_at", { ascending: false })
          .limit(50000),
        supabase
          .from("qc_inspections")
          .select("work_order_id, inspected_pcs, inspected_mtr, vdi_ok_pcs, vdi_ok_mtr, vdi_salvage_pcs, vdi_salvage_mtr, vdi_rejection_pcs, vdi_rejection_mtr"),
        supabase
          .from("diversion_plans")
          .select("source_wo_id, target_wo_id, diverted_qty, work_center, status"),
      ]);

      if (queueRes.error) {
        setRows([]);
        setError(queueRes.error.message);
        setLoading(false);
        return;
      }

      const rawRows: Row[] = (queueRes.data ?? []).map((r: any) => emptyRow(r));
      const plans = plansRes.data ?? [];
      const stages = stagesRes.data ?? [];
      const logs = logsRes.data ?? [];
      const qcInspections: any[] = qcRes?.data || [];
      const diversions: any[] = divsRes?.data || [];

      const getStageDivIn = (wId: string, stageCode: string) =>
        diversions
          .filter((d: any) => d.target_wo_id === wId && (d.work_center || "ROLLING") === stageCode)
          .reduce((sum: number, d: any) => sum + Number(d.diverted_qty || 0), 0);

      const getStageDivOut = (wId: string, stageCode: string) =>
        diversions
          .filter((d: any) => d.source_wo_id === wId && (d.work_center || "ROLLING") === stageCode)
          .reduce((sum: number, d: any) => sum + Number(d.diverted_qty || 0), 0);

      const rollingStageId = stages.find((st: any) => st.stage_code === "ROLLING")?.id;
      const finishingStageId = stages.find((st: any) => st.stage_code === "FINISHING")?.id;

      // Parse multi-WO campaigns from rolling plans
      const masterCampaignMap = new Map<string, any>(); // key: master_wo_id
      const childWoMap = new Map<string, any>(); // key: child_wo_id -> child metadata + master info
      const planByWoMap = new Map<string, any>(); // key: work_order_id -> plan info

      for (const p of plans) {
        if (!p.status) continue;
        try {
          const parsed = typeof p.status === "string" ? JSON.parse(p.status) : p.status;
          const lifecycle = parsed?.lifecycle_status || (parsed?.issued_at ? "ISSUED" : "DRAFT");
          const isIssued = (lifecycle === "ISSUED" || lifecycle === "REVISED") && lifecycle !== "CLOSED" && lifecycle !== "SHORT_CLOSED";

          const mhOdVal = p.mh_od || parsed?.mh_od || parsed?.cust_od || parsed?.sm?.cust_od || parsed?.sizing_mill?.cust_od || null;
          const mhWtVal = p.mh_wt || parsed?.mh_wt || parsed?.cust_wt || parsed?.sm?.rolling_wt || parsed?.sm?.cust_wt || parsed?.sizing_mill?.rolling_wt || null;
          const mhL1Val = p.mh_l1 || parsed?.mh_l1 || parsed?.sm?.sm_len || null;
          const mhL2Val = p.mh_l2 || parsed?.mh_l2 || parsed?.sm?.sm_len || null;

          const planNoStr = p.plan_no ? String(p.plan_no).trim() : '';
          const storedPlanPcs = Number(
            parsed?.master_planned_pcs ||
            parsed?.planned_pcs ||
            0
          );

          const existingPlan = planByWoMap.get(p.work_order_id);
          if (!existingPlan) {
            planByWoMap.set(p.work_order_id, {
              id: p.id,
              plan_no: planNoStr,
              plan_nos: [planNoStr].filter(Boolean),
              planned_qty_sum: Number(p.planned_qty || 0),
              planned_pcs_sum: storedPlanPcs,
              lifecycle_status: lifecycle,
              is_issued: isIssued,
              revision_no: Number(parsed?.revision_no || 0),
              mh_od: mhOdVal,
              mh_wt: mhWtVal,
              mh_l1: mhL1Val,
              mh_l2: mhL2Val,
            });
          } else {
            const updatedPlanNos = Array.from(new Set([...(existingPlan.plan_nos || []), planNoStr].filter(Boolean)));
            existingPlan.plan_nos = updatedPlanNos;
            existingPlan.plan_no = updatedPlanNos.join(', ');
            existingPlan.planned_qty_sum = (existingPlan.planned_qty_sum || 0) + Number(p.planned_qty || 0);
            existingPlan.planned_pcs_sum = (existingPlan.planned_pcs_sum || 0) + storedPlanPcs;
            if (isIssued) existingPlan.is_issued = true;
            if (!existingPlan.mh_od && mhOdVal) existingPlan.mh_od = mhOdVal;
            if (!existingPlan.mh_wt && mhWtVal) existingPlan.mh_wt = mhWtVal;
            if (!existingPlan.mh_l1 && mhL1Val) existingPlan.mh_l1 = mhL1Val;
            if (!existingPlan.mh_l2 && mhL2Val) existingPlan.mh_l2 = mhL2Val;
          }

          if (parsed?.is_master && Array.isArray(parsed?.child_work_orders)) {
            const masterPlannedMtr = Number(parsed.master_planned_mtr || p.planned_qty || 0);
            const childPlannedMtr = (parsed.child_work_orders || []).reduce(
              (sum: number, c: any) => sum + Number(c.planned_mtr || 0),
              0
            );
            const totalCampaignMtr =
              Number(parsed.total_campaign_mtr) > 0
                ? Number(parsed.total_campaign_mtr)
                : masterPlannedMtr + childPlannedMtr;

            const masterPlannedPcs = Number(parsed.master_planned_pcs || 0);
            const childPlannedPcs = (parsed.child_work_orders || []).reduce(
              (sum: number, c: any) => sum + Number(c.planned_pcs || 0),
              0
            );
            const totalCampaignPcs =
              Number(parsed.total_campaign_pcs) > 0
                ? Number(parsed.total_campaign_pcs)
                : masterPlannedPcs + childPlannedPcs;

            const existing = masterCampaignMap.get(p.work_order_id);
            const combinedPlanNos = existing
              ? Array.from(new Set([...(existing.plan_nos || [existing.plan_no]), planNoStr].filter(Boolean)))
              : [planNoStr].filter(Boolean);

            masterCampaignMap.set(p.work_order_id, {
              plan_id: p.id,
              plan_no: combinedPlanNos.join(', ') || p.plan_no,
              plan_nos: combinedPlanNos,
              master_wo_id: p.work_order_id,
              master_wo_no: parsed.master_wo_no,
              master_planned_mtr: (existing?.master_planned_mtr || 0) + masterPlannedMtr,
              master_planned_pcs: (existing?.master_planned_pcs || 0) + masterPlannedPcs,
              total_campaign_mtr: (existing?.total_campaign_mtr || 0) + totalCampaignMtr,
              total_campaign_pcs: (existing?.total_campaign_pcs || 0) + totalCampaignPcs,
              child_work_orders: parsed.child_work_orders,
              route_id: p.process_route_id,
              mh_od: mhOdVal,
              mh_wt: mhWtVal,
              mh_l1: mhL1Val,
              mh_l2: mhL2Val,
              is_issued: isIssued || existing?.is_issued,
              lifecycle_status: lifecycle,
              revision_no: Number(parsed?.revision_no || 0),
            });

            for (const child of parsed.child_work_orders) {
              childWoMap.set(child.work_order_id || child.id, {
                ...child,
                master_wo_id: p.work_order_id,
                master_wo_no: parsed.master_wo_no,
                master_plan_no: combinedPlanNos.join(', ') || p.plan_no,
                master_plan_id: p.id,
              });
            }
          } else if (parsed?.is_child) {
            childWoMap.set(p.work_order_id, {
              work_order_id: p.work_order_id,
              master_wo_id: parsed.master_wo_id,
              master_wo_no: parsed.master_wo_no,
              master_plan_no: parsed.master_plan_no,
              planned_mtr: parsed.planned_mtr || p.planned_qty,
              planned_pcs: parsed.planned_pcs,
            });
          }
        } catch {
          // Standard text status (e.g. 'Scheduled')
        }
      }

      // RULE 2:
      // In Draw, Hollow Heat Treatment, Heat Treatment WIP: ONLY Master Work Order will be available!
      // In Finishing: ALL Master and Child Work Orders will be displayed!
      const isMasterOnlyStage =
        s === "DRAW" ||
        s === "HOLLOW_HEAT_TREATMENT" ||
        s === "HEAT_TREATMENT" ||
        s === "VDI" ||
        s === "ROLLING";

      if (s === "ROLLING") {
        // Filter out any child work orders AND only show work orders with an ISSUED rolling plan!
        const filtered = rawRows.filter((r) => {
          if (childWoMap.has(r.work_order_id)) return false;
          const campaign = masterCampaignMap.get(r.work_order_id);
          const planInfo = planByWoMap.get(r.work_order_id);
          const isPlanIssued = campaign ? Boolean(campaign.is_issued) : Boolean(planInfo?.is_issued);
          return isPlanIssued;
        });

        // Enrich master rows with aggregated campaign WIP and Capping
        const enriched: Row[] = filtered.map((r) => {
          const campaign = masterCampaignMap.get(r.work_order_id);
          const masterLogs = logs.filter(
            (l: any) =>
              l.work_order_id === r.work_order_id &&
              (!rollingStageId || l.stage_id === rollingStageId)
          );
          const loggedOutput = masterLogs.reduce(
            (sum: number, l: any) => sum + Number(l.output_qty || 0),
            0
          );
          const loggedRej = masterLogs.reduce(
            (sum: number, l: any) => sum + Number(l.rejection_qty || 0),
            0
          );
          const totalLoggedMtr = loggedOutput + loggedRej;

          // Effective average length for Mother Hollow PCS
          const mhL1 = Number(campaign?.mh_l1 || r.mh_l1 || r.l1 || 6);
          const mhL2 = Number(campaign?.mh_l2 || r.mh_l2 || r.l2 || 6);
          const mhAvg = mhL1 > 0 && mhL2 > 0 ? (mhL1 + mhL2) / 2 : mhL1 || 6;
          const effAvg = mhAvg > 0 ? mhAvg : Number(r.avg_length) || 6;

          const loggedOutputPcs = masterLogs.reduce(
            (sum: number, l: any) => {
              if (Number(l.output_pcs || 0) > 0) return sum + Number(l.output_pcs);
              const p = extractPcsFromRemarks(l.remarks).pcs;
              if (p !== null && p > 0) return sum + p;
              return sum + (effAvg > 0 ? Math.round(Number(l.output_qty || 0) / effAvg) : 0);
            },
            0
          );
          const loggedRejPcs = masterLogs.reduce(
            (sum: number, l: any) => {
              if (Number(l.rejection_pcs || 0) > 0) return sum + Number(l.rejection_pcs);
              const rp = extractPcsFromRemarks(l.remarks).rejPcs;
              if (rp !== null && rp > 0) return sum + rp;
              return sum + (effAvg > 0 ? Math.round(Number(l.rejection_qty || 0) / effAvg) : 0);
            },
            0
          );
          const totalLoggedPcs = loggedOutputPcs + loggedRejPcs;

          const rawBalMtr = Number(r.balance_to_make_mtr || 0);
          const rawBalPcs = Number(r.balance_to_make_pcs || 0);

          const rollDivIn = getStageDivIn(r.work_order_id, "ROLLING");
          const rollDivOut = getStageDivOut(r.work_order_id, "ROLLING");

          if (campaign) {
            const masterPlannedMtr = Number(campaign.master_planned_mtr || campaign.planned_mtr || 0);
            const masterPlannedPcs = Number(campaign.master_planned_pcs || campaign.planned_pcs || 0) || (effAvg > 0 ? Math.round(masterPlannedMtr / effAvg) : 0);

            // If totalLoggedMtr > 0, calculate balance; otherwise use the database RPC computed balance
            const availMtr = totalLoggedMtr > 0
              ? Math.max(0, masterPlannedMtr + rollDivIn - totalLoggedMtr - rollDivOut)
              : (rawBalMtr > 0 ? rawBalMtr : Math.max(0, masterPlannedMtr + rollDivIn - rollDivOut));

            const availPcs = effAvg > 0
              ? Math.round(availMtr / effAvg)
              : (rawBalPcs > 0 ? Math.round(rawBalPcs) : (masterPlannedPcs > 0 ? Math.max(0, masterPlannedPcs - totalLoggedPcs) : 0));
            const mhOd = Number(campaign.mh_od || r.mh_od || r.od || 0);
            const mhWt = Number(campaign.mh_wt || r.mh_wt || r.wl || 0);
            const availMt =
              Math.max(mhOd - mhWt, 0) * Math.max(mhWt, 0) * 0.0246615 * 0.001 * availMtr;

            // Effective logged production for capping
            const effLoggedMtr = totalLoggedMtr > 0
              ? totalLoggedMtr
              : (masterPlannedMtr > availMtr ? masterPlannedMtr - availMtr : 0);

            // Capping at rolling = 110% of Plan issued against master work order - total already logged
            const maxCappingMtr = Number((masterPlannedMtr * 1.1).toFixed(2));
            const cappingMtr = Math.max(0, maxCappingMtr - effLoggedMtr);
            const cappingPcs = effAvg > 0
              ? Math.round(cappingMtr / effAvg)
              : Math.max(0, Math.round(masterPlannedPcs * 1.1) - totalLoggedPcs);

            return {
              ...r,
              mh_od: campaign.mh_od ?? r.mh_od,
              mh_wt: campaign.mh_wt ?? r.mh_wt,
              mh_l1: campaign.mh_l1 ?? r.mh_l1,
              mh_l2: campaign.mh_l2 ?? r.mh_l2,
              mh_avg_length: mhAvg,
              is_master: true,
              master_plan_no: campaign.plan_no,
              plan_no: campaign.plan_no,
              plan_id: campaign.plan_id,
              lifecycle_status: campaign.lifecycle_status,
              planned_pcs: masterPlannedPcs,
              campaign_total_mtr: masterPlannedMtr,
              campaign_total_pcs: masterPlannedPcs,
              child_work_orders: campaign.child_work_orders,
              balance_to_make_mtr: availMtr,
              balance_to_make_pcs: availPcs,
              balance_to_make_mt: Number(availMt.toFixed(2)),
              max_allowed_mtr: cappingMtr,
              max_allowed_pcs: cappingPcs,
            };
          } else {
            // Standard single work order plan
            const planInfo = planByWoMap.get(r.work_order_id);
            const plan = plans.find((p: any) => p.work_order_id === r.work_order_id);
            const planMtr = planInfo?.planned_qty_sum ? Number(planInfo.planned_qty_sum) : plan ? Number(plan.planned_qty || 0) : rawBalMtr;
            const storedPcs = Number(planInfo?.planned_pcs_sum || 0);
            const planPcs = storedPcs > 0 ? storedPcs : (effAvg > 0 ? Math.round(planMtr / effAvg) : rawBalPcs);
            const effPlanLen = planPcs > 0 && planMtr > 0 ? planMtr / planPcs : effAvg;

            const availMtr = totalLoggedMtr > 0
              ? Math.max(0, (planMtr || rawBalMtr) + rollDivIn - totalLoggedMtr - rollDivOut)
              : (rawBalMtr > 0 ? rawBalMtr : Math.max(0, (planMtr || 0) + rollDivIn - rollDivOut));
            const availPcs = totalLoggedMtr <= 0 && planPcs > 0
              ? planPcs
              : (planPcs > 0 ? Math.max(0, planPcs - (totalLoggedMtr > 0 ? Math.round(totalLoggedMtr / effPlanLen) : 0)) : (effPlanLen > 0 ? Math.round(availMtr / effPlanLen) : 0));
            const od = Number(r.od || 0);
            const wt = Number(r.wl || 0);
            const availMt = Math.max(od - wt, 0) * Math.max(wt, 0) * 0.0246615 * 0.001 * availMtr;

            const effLoggedMtr = totalLoggedMtr > 0
              ? totalLoggedMtr
              : ((planMtr || availMtr) > availMtr ? (planMtr || availMtr) - availMtr : 0);
            const maxCappingMtr = Number(((planMtr || availMtr) * 1.1).toFixed(2));
            const cappingMtr = Math.max(0, maxCappingMtr - effLoggedMtr);
            const cappingPcs = effPlanLen > 0 ? Math.round(cappingMtr / effPlanLen) : Math.max(0, Math.round(availPcs * 1.1) - totalLoggedPcs);

            return {
              ...r,
              mh_avg_length: effPlanLen,
              master_plan_no: planInfo?.plan_no || plan?.plan_no,
              plan_no: planInfo?.plan_no || plan?.plan_no,
              plan_id: planInfo?.id || plan?.id,
              lifecycle_status: planInfo?.lifecycle_status || "ISSUED",
              revision_no: planInfo?.revision_no || 0,
              planned_pcs: planPcs,
              campaign_total_mtr: planMtr,
              campaign_total_pcs: planPcs,
              balance_to_make_mtr: availMtr,
              balance_to_make_pcs: availPcs,
              balance_to_make_mt: Number(availMt.toFixed(2)),
              max_allowed_mtr: cappingMtr,
              max_allowed_pcs: cappingPcs,
            };
          }
        });

        // Ensure any Master Campaign with remaining available WIP is included
        const existingWoIds = new Set(filtered.map((r) => r.work_order_id));
        for (const [masterWoId, campaign] of masterCampaignMap.entries()) {
          if (!existingWoIds.has(masterWoId) && campaign.is_issued) {
            const masterLogs = logs.filter(
              (l: any) =>
                l.work_order_id === masterWoId &&
                (!rollingStageId || l.stage_id === rollingStageId)
            );
            const totalLogged = masterLogs.reduce(
              (sum: number, l: any) => sum + Number(l.output_qty || 0) + Number(l.rejection_qty || 0),
              0
            );
            const masterRollDivIn = getStageDivIn(masterWoId, "ROLLING");
            const masterRollDivOut = getStageDivOut(masterWoId, "ROLLING");
            const availMtr = Math.max(0, campaign.total_campaign_mtr + masterRollDivIn - totalLogged - masterRollDivOut);
            const totalCampaignPcs = Number(campaign.total_campaign_pcs || 0);

            const mhL1 = Number(campaign.mh_l1 || 0);
            const mhL2 = Number(campaign.mh_l2 || 0);
            const mhAvg = mhL1 > 0 && mhL2 > 0 ? (mhL1 + mhL2) / 2 : mhL1 || 6;
            const effAvg = mhAvg > 0 ? mhAvg : 6;

            const loggedOutputPcs = masterLogs.reduce(
              (sum: number, l: any) =>
                sum +
                (Number(l.output_pcs || 0) > 0
                  ? Number(l.output_pcs)
                  : effAvg > 0
                  ? Math.round(Number(l.output_qty || 0) / effAvg)
                  : 0),
              0
            );
            const loggedRejPcs = masterLogs.reduce(
              (sum: number, l: any) =>
                sum +
                (Number(l.rejection_pcs || 0) > 0
                  ? Number(l.rejection_pcs)
                  : effAvg > 0
                  ? Math.round(Number(l.rejection_qty || 0) / effAvg)
                  : 0),
              0
            );
            const totalLoggedPcs = loggedOutputPcs + loggedRejPcs;

            if (availMtr > 0) {
              const { data: wo } = await supabase
                .from("work_orders")
                .select("*")
                .eq("id", masterWoId)
                .single();
              const { data: route } = await supabase
                .from("process_routes")
                .select("*")
                .eq("id", campaign.route_id)
                .single();

              if (wo) {
                const l1 = Number(wo.l1 || 6);
                const l2 = Number(wo.l2 || 6);
                const avg = l1 > 0 && l2 > 0 ? (l1 + l2) / 2 : l1 || 6;
                const woEffAvg = mhAvg > 0 ? mhAvg : avg;
                const availPcs = woEffAvg > 0
                  ? Math.round(availMtr / woEffAvg)
                  : (totalCampaignPcs > 0 ? Math.max(0, totalCampaignPcs - totalLoggedPcs) : 0);
                const mhOd = Number(campaign.mh_od || wo.size_od || 0);
                const mhWt = Number(campaign.mh_wt || wo.size_wt || 0);
                const availMt =
                  Math.max(mhOd - mhWt, 0) * Math.max(mhWt, 0) * 0.0246615 * 0.001 * availMtr;
                const maxCappingMtr = Number((campaign.total_campaign_mtr * 1.1).toFixed(2));
                const cappingMtr = Math.max(0, maxCappingMtr - totalLogged);
                const cappingPcs = woEffAvg > 0
                  ? Math.round(cappingMtr / woEffAvg)
                  : Math.max(0, Math.round(totalCampaignPcs * 1.1) - totalLoggedPcs);

                enriched.push(
                  emptyRow({
                    work_order_id: wo.id,
                    work_order_no: wo.work_order_no,
                    customer_name: wo.customer_name,
                    specification: wo.grade,
                    od: Number(wo.size_od || 0),
                    wl: Number(wo.size_wt || 0),
                    l1,
                    l2,
                    avg_length: avg,
                    mh_od: campaign.mh_od,
                    mh_wt: campaign.mh_wt,
                    mh_l1: campaign.mh_l1,
                    mh_l2: campaign.mh_l2,
                    mh_avg_length: mhAvg,
                    route_id: campaign.route_id,
                    route_code: route?.route_code || "CDS",
                    route_name: route?.route_name || "Cold Drawn Seamless",
                    stage_code: "ROLLING",
                    balance_to_make_mtr: availMtr,
                    balance_to_make_pcs: availPcs,
                    balance_to_make_mt: Number(availMt.toFixed(2)),
                    max_allowed_mtr: cappingMtr,
                    max_allowed_pcs: cappingPcs,
                    multiple: 1,
                    ht_nos: null,
                    is_master: true,
                    master_plan_no: campaign.plan_no,
                    plan_no: campaign.plan_no,
                    plan_id: campaign.plan_id,
                    lifecycle_status: campaign.lifecycle_status,
                    revision_no: campaign.revision_no,
                    campaign_total_mtr: campaign.total_campaign_mtr,
                    campaign_total_pcs: campaign.total_campaign_pcs,
                    child_work_orders: campaign.child_work_orders,
                  })
                );
              }
            }
          }
        }

        setRows(enriched.filter((r) => Number(r.balance_to_make_mtr || 0) > 0));
      } else if (isMasterOnlyStage) {
        const hollowHtStageId = stages.find((st: any) => st.stage_code === "HOLLOW_HEAT_TREATMENT")?.id;
        const drawStageId = stages.find((st: any) => st.stage_code === "DRAW")?.id;
        const htStageId = stages.find((st: any) => st.stage_code === "HEAT_TREATMENT")?.id;

        // Filter out any child work orders
        const filtered = rawRows.filter((r) => !childWoMap.has(r.work_order_id));

        // Enrich master rows with campaign details and strict downstream Rolling HTC OK propagation
        const enriched = filtered
          .map((r) => {
            const campaign = masterCampaignMap.get(r.work_order_id);
            const masterLogs = logs.filter((l: any) => l.work_order_id === r.work_order_id);

            const planInfo = planByWoMap.get(r.work_order_id);
            const plan = plans.find((p: any) => p.work_order_id === r.work_order_id);
            let planParsed: any = {};
            try {
              planParsed = typeof plan?.status === "string" ? JSON.parse(plan.status) : plan?.status || {};
            } catch {}

            const mhL1 = Number(
              campaign?.mh_l1 ||
              planInfo?.mh_l1 ||
              r.mh_l1 ||
              plan?.mh_l1 ||
              planParsed?.mh_l1 ||
              planParsed?.sm?.sm_len ||
              6
            );
            const mhL2 = Number(
              campaign?.mh_l2 ||
              planInfo?.mh_l2 ||
              r.mh_l2 ||
              plan?.mh_l2 ||
              planParsed?.mh_l2 ||
              planParsed?.sm?.sm_len ||
              6
            );
            const mhAvg = mhL1 > 0 && mhL2 > 0 ? (mhL1 + mhL2) / 2 : mhL1 || 6;
            const tubeAvg = Number(r.avg_length) || 6.25;

            const mhOd = Number(
              campaign?.mh_od ||
              planInfo?.mh_od ||
              r.mh_od ||
              plan?.mh_od ||
              planParsed?.mh_od ||
              planParsed?.cust_od ||
              planParsed?.sm?.cust_od ||
              planParsed?.sizing_mill?.cust_od ||
              r.od ||
              0
            );
            const mhWt = Number(
              campaign?.mh_wt ||
              planInfo?.mh_wt ||
              r.mh_wt ||
              plan?.mh_wt ||
              planParsed?.mh_wt ||
              planParsed?.cust_wt ||
              planParsed?.sm?.rolling_wt ||
              planParsed?.sm?.cust_wt ||
              planParsed?.sizing_mill?.rolling_wt ||
              r.wl ||
              0
            );

            const rollLogs = masterLogs.filter((l: any) => !rollingStageId || l.stage_id === rollingStageId);
            const rollingHtcOkMtr = rollLogs.reduce((sum: number, l: any) => sum + Number(l.htc_ok || 0), 0);
            const rollHtcOkPcs = mhAvg > 0 ? Math.round(rollingHtcOkMtr / mhAvg) : 0;

            const hollowHtLogs = masterLogs.filter((l: any) => l.stage_id === hollowHtStageId);
            const hollowHtOutMtr = hollowHtLogs.reduce((sum: number, l: any) => sum + Number(l.output_qty || 0), 0);
            const hollowHtRejMtr = hollowHtLogs.reduce((sum: number, l: any) => sum + Number(l.rejection_qty || 0), 0);
            const hollowHtOutPcs = mhAvg > 0 ? Math.round(hollowHtOutMtr / mhAvg) : 0;
            const hollowHtRejPcs = mhAvg > 0 ? Math.round(hollowHtRejMtr / mhAvg) : 0;
            const hollowHtNetPcs = Math.max(0, hollowHtOutPcs - hollowHtRejPcs);

            const drawLogs = masterLogs.filter((l: any) => l.stage_id === drawStageId);
            const drawOutMtr = drawLogs.reduce((sum: number, l: any) => sum + Number(l.output_qty || 0), 0);
            const drawRejMtr = drawLogs.reduce((sum: number, l: any) => sum + Number(l.rejection_qty || 0), 0);
            const drawOutPcs = tubeAvg > 0 ? Math.round(drawOutMtr / tubeAvg) : 0;
            const drawRejPcs = tubeAvg > 0 ? Math.round(drawRejMtr / tubeAvg) : 0;
            const drawNetPcs = Math.max(0, drawOutPcs - drawRejPcs);

            const htLogs = masterLogs.filter((l: any) => l.stage_id === htStageId);
            const htOutMtr = htLogs.reduce((sum: number, l: any) => sum + Number(l.output_qty || 0), 0);
            const htRejMtr = htLogs.reduce((sum: number, l: any) => sum + Number(l.rejection_qty || 0), 0);
            const htOutPcs = tubeAvg > 0 ? Math.round(htOutMtr / tubeAvg) : 0;
            const htRejPcs = tubeAvg > 0 ? Math.round(htRejMtr / tubeAvg) : 0;
            const htNetPcs = Math.max(0, htOutPcs - htRejPcs);
            const htNetMtr = Math.max(0, htOutMtr - htRejMtr);

            const hhtDivIn = getStageDivIn(r.work_order_id, "HOLLOW_HEAT_TREATMENT");
            const hhtDivOut = getStageDivOut(r.work_order_id, "HOLLOW_HEAT_TREATMENT");
            const drawDivIn = getStageDivIn(r.work_order_id, "DRAW");
            const drawDivOut = getStageDivOut(r.work_order_id, "DRAW");
            const htDivIn = getStageDivIn(r.work_order_id, "HEAT_TREATMENT");
            const htDivOut = getStageDivOut(r.work_order_id, "HEAT_TREATMENT");

            let availPcs = 0;
            let availMtr = 0;

            if (s === "HOLLOW_HEAT_TREATMENT") {
              const hhtDivInPcs = mhAvg > 0 ? Math.round(hhtDivIn / mhAvg) : 0;
              const hhtDivOutPcs = mhAvg > 0 ? Math.round(hhtDivOut / mhAvg) : 0;
              availPcs = Math.max(0, rollHtcOkPcs + hhtDivInPcs - hollowHtOutPcs - hollowHtRejPcs - hhtDivOutPcs);
              availMtr = mhAvg > 0 ? Number((availPcs * mhAvg).toFixed(2)) : 0;
            } else if (s === "DRAW") {
              const incomingPcs = r.route_code === "ALLOY_CDS" ? hollowHtNetPcs : rollHtcOkPcs;
              const drawDivInPcs = tubeAvg > 0 ? Math.round(drawDivIn / tubeAvg) : (mhAvg > 0 ? Math.round(drawDivIn / mhAvg) : 0);
              const drawDivOutPcs = tubeAvg > 0 ? Math.round(drawDivOut / tubeAvg) : (mhAvg > 0 ? Math.round(drawDivOut / mhAvg) : 0);
              availPcs = Math.max(0, incomingPcs + drawDivInPcs - drawOutPcs - drawRejPcs - drawDivOutPcs);
              availMtr = tubeAvg > 0 ? Number((availPcs * tubeAvg).toFixed(2)) : 0;
            } else if (s === "HEAT_TREATMENT") {
              const htDivInPcs = tubeAvg > 0 ? Math.round(htDivIn / tubeAvg) : 0;
              const htDivOutPcs = tubeAvg > 0 ? Math.round(htDivOut / tubeAvg) : 0;
              availPcs = Math.max(0, drawNetPcs + htDivInPcs - htOutPcs - htRejPcs - htDivOutPcs);
              availMtr = tubeAvg > 0 ? Number((availPcs * tubeAvg).toFixed(2)) : 0;
            } else if (s === "VDI") {
              const isHfs = r.route_code === "HFS" || r.route_code === "ALLOY_HFS";
              const incomingPcs = isHfs
                ? (r.route_code === "ALLOY_HFS" ? hollowHtNetPcs : rollHtcOkPcs)
                : htNetPcs;
              const effLen = isHfs ? (mhAvg > 0 ? mhAvg : tubeAvg) : tubeAvg;
              const vdiDivIn = getStageDivIn(r.work_order_id, "VDI");
              const vdiDivOut = getStageDivOut(r.work_order_id, "VDI");
              const vdiDivInPcs = effLen > 0 ? Math.round(vdiDivIn / effLen) : 0;
              const vdiDivOutPcs = effLen > 0 ? Math.round(vdiDivOut / effLen) : 0;
              const vdiLogs = qcInspections.filter((q: any) => q.work_order_id === r.work_order_id);
              const qcInspectedPcs = vdiLogs.reduce(
                (sum: number, q: any) =>
                  sum + Number(q.inspected_pcs || Number(q.vdi_ok_pcs || 0) + Number(q.vdi_salvage_pcs || 0) + Number(q.vdi_rejection_pcs || 0)),
                0
              );
              availPcs = Math.max(0, incomingPcs + vdiDivInPcs - qcInspectedPcs - vdiDivOutPcs);
              availMtr = effLen > 0 ? Number((availPcs * effLen).toFixed(2)) : 0;
            }

            const isMhWip = s === "HOLLOW_HEAT_TREATMENT";
            const effectiveOd = isMhWip && mhOd > 0 ? mhOd : Number(r.od || 0);
            const effectiveWt = isMhWip && mhWt > 0 ? mhWt : Number(r.wl || 0);
            const availMt = Math.max(effectiveOd - effectiveWt, 0) * Math.max(effectiveWt, 0) * 0.0246615 * 0.001 * availMtr;

            const base: Row = {
              ...r,
              mh_od: mhOd,
              mh_wt: mhWt,
              mh_l1: mhL1,
              mh_l2: mhL2,
              mh_avg_length: mhAvg,
              balance_to_make_mtr: availMtr,
              balance_to_make_pcs: availPcs,
              balance_to_make_mt: Number(availMt.toFixed(2)),
              max_allowed_mtr: availMtr,
              max_allowed_pcs: availPcs,
              prev_htc_ok: rollingHtcOkMtr,
            };

            if (campaign) {
              return {
                ...base,
                is_master: true,
                master_plan_no: campaign.plan_no,
                campaign_total_mtr: campaign.total_campaign_mtr,
                campaign_total_pcs: campaign.total_campaign_pcs,
                child_work_orders: campaign.child_work_orders,
              };
            }
            return base;
          })
          .filter((r) => Number(r.balance_to_make_mtr || 0) > 0);

        setRows(enriched);
      } else if (s === "FINISHING") {
        // Finishing stage: display ALL master and child work orders
        const allChildIds = Array.from(childWoMap.keys());
        let finishingLogs: any[] = [];
        if (allChildIds.length > 0) {
          const { data: logsData } = await supabase
            .from("production_logs")
            .select("work_order_id, output_qty")
            .in("work_order_id", allChildIds);
          finishingLogs = logsData || [];
        }

        const processedRows: Row[] = [];
        const addedWoIds = new Set<string>();

        // 1. Process existing rows from queue (e.g. Master orders and standard orders)
        for (const r of rawRows) {
          addedWoIds.add(r.work_order_id);
          const campaign = masterCampaignMap.get(r.work_order_id);
          const childInfo = childWoMap.get(r.work_order_id);

          const finDivIn = getStageDivIn(r.work_order_id, "FINISHING");
          const finDivOut = getStageDivOut(r.work_order_id, "FINISHING");
          const effAvg = Number(r.avg_length) || 6;
          const finDivInPcs = effAvg > 0 ? Math.round(finDivIn / effAvg) : 0;
          const finDivOutPcs = effAvg > 0 ? Math.round(finDivOut / effAvg) : 0;

          // Check QC inspections for this WO
          const woQc = qcInspections.filter((q: any) => q.work_order_id === r.work_order_id);
          let rowToUse = { ...r };
          if (woQc.length > 0) {
            const qcOk = woQc.reduce((sum: number, q: any) => sum + Number(q.vdi_ok_pcs || 0), 0);
            const finishedLogs = logs.filter(
              (l: any) =>
                l.work_order_id === r.work_order_id &&
                (!finishingStageId || l.stage_id === finishingStageId)
            );
            const finishedPcs = finishedLogs.reduce((sum: number, l: any) => {
              const pcsMatch = l.remarks ? l.remarks.match(/\[PCS:(\d+)\]/i) : null;
              const rejMatch = l.remarks ? l.remarks.match(/\[REJ_PCS:(\d+)\]/i) : null;
              const outP = pcsMatch ? parseInt(pcsMatch[1], 10) : (Number(l.output_pcs || 0) > 0 ? Number(l.output_pcs) : (effAvg > 0 ? Math.round(Number(l.output_qty || 0) / effAvg) : 0));
              const rejP = rejMatch ? parseInt(rejMatch[1], 10) : (Number(l.rejection_pcs || 0) > 0 ? Number(l.rejection_pcs) : (effAvg > 0 ? Math.round(Number(l.rejection_qty || 0) / effAvg) : 0));
              return sum + outP + rejP;
            }, 0);
            const availPcs = Math.max(0, qcOk + finDivInPcs - finishedPcs - finDivOutPcs);
            const availMtr: number = effAvg > 0 ? Number((availPcs * effAvg).toFixed(2)) : Math.max(0, (Number(r.balance_to_make_mtr) || 0) + finDivIn - finDivOut);
            const od = Number(r.od || 0);
            const wt = Number(r.wl || 0);
            const availMt = Math.max(od - wt, 0) * Math.max(wt, 0) * 0.0246615 * 0.001 * availMtr;
            rowToUse = {
              ...rowToUse,
              balance_to_make_pcs: availPcs,
              balance_to_make_mtr: availMtr,
              balance_to_make_mt: Number(availMt.toFixed(2)),
              max_allowed_pcs: availPcs,
              max_allowed_mtr: availMtr,
            };
          }

          if (campaign) {
            processedRows.push({
              ...rowToUse,
              is_master: true,
              master_plan_no: campaign.plan_no,
              campaign_total_mtr: campaign.total_campaign_mtr,
              campaign_total_pcs: campaign.total_campaign_pcs,
              child_work_orders: campaign.child_work_orders,
            });

            // 2. Also ensure every Child WO from this campaign is included in the Finishing queue!
            for (const child of campaign.child_work_orders) {
              const childId = child.work_order_id || child.id;
              if (addedWoIds.has(childId)) continue;
              addedWoIds.add(childId);

              // Calculate finished output so far for this child order
              const childFinishedMtr = logs
                .filter(
                  (l: any) =>
                    l.work_order_id === childId &&
                    (!finishingStageId || l.stage_id === finishingStageId)
                )
                .reduce((sum: number, l: any) => sum + Number(l.output_qty || 0), 0);

              const childDivIn = getStageDivIn(childId, "FINISHING");
              const childDivOut = getStageDivOut(childId, "FINISHING");
              const childPlannedMtr = Number(child.planned_mtr || 0);
              const remainingMtr = Math.max(0, childPlannedMtr + childDivIn - childFinishedMtr - childDivOut);

              const l1 = Number(child.l1 || r.l1 || 6);
              const l2 = Number(child.l2 || r.l2 || 6);
              const avgLen = l1 > 0 && l2 > 0 ? (l1 + l2) / 2 : l1 || 6;
              const childPlannedPcs = Number(child.planned_pcs || 0);
              const remainingPcs = childFinishedMtr <= 0 && childPlannedPcs > 0
                ? childPlannedPcs
                : (avgLen > 0 ? Math.round(remainingMtr / avgLen) : 0);

              const od = Number(child.size_od || r.od || 0);
              const wt = Number(child.size_wt || r.wl || 0);
              const remainingMt =
                Math.max(od - wt, 0) * Math.max(wt, 0) * 0.0246615 * 0.001 * remainingMtr;

              const childRow: Row = emptyRow({
                work_order_id: childId,
                work_order_no: child.work_order_no,
                customer_name: child.customer_name || null,
                specification: child.grade || r.specification,
                od,
                wl: wt,
                l1,
                l2,
                avg_length: avgLen,
                route_id: r.route_id,
                route_code: r.route_code,
                route_name: r.route_name,
                stage_code: "FINISHING",
                is_hfs: r.is_hfs,
                is_cds: r.is_cds,
                prev_stage_code: r.prev_stage_code,
                prev_stage_name: r.prev_stage_name,
                balance_to_make_mtr: remainingMtr,
                balance_to_make_pcs: remainingPcs,
                balance_to_make_mt: Number(remainingMt.toFixed(2)),
                max_allowed_mtr: remainingMtr > 0 ? remainingMtr : r.balance_to_make_mtr,
                multiple: r.multiple || 1,
                ht_nos: null,
                is_child: true,
                master_wo_id: r.work_order_id,
                master_wo_no: r.work_order_no,
                master_plan_no: campaign.plan_no,
              });

              processedRows.push(childRow);
            }
          } else if (childInfo) {
            processedRows.push({
              ...rowToUse,
              is_child: true,
              master_wo_id: childInfo.master_wo_id,
              master_wo_no: childInfo.master_wo_no,
              master_plan_no: childInfo.master_plan_no,
            });
          } else {
            processedRows.push(rowToUse);
          }
        }

        setRows(processedRows);
      } else {
        setRows(rawRows);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load queue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadQueue(stage);
  }, [stage, loadQueue]);

  return { rows, setRows, loading, error, reload: () => loadQueue(stage) };
}

