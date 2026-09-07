// hooks/useQueue.ts
import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { StageCode, Row, emptyRow } from "@/types";

export function useQueue(stage: StageCode) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stageRef = useRef(stage);
  stageRef.current = stage;

  const loadQueue = useCallback(async (targetStage?: StageCode) => {
    const s = targetStage || stageRef.current;
    setLoading(true);
    setError(null);
    try {
      // 1. Try to fetch from server-side queue API (calculates strict WIP from Rolling HTC OK)
      try {
        const apiRes = await fetch(`/api/production/queue?stage=${s}&_t=${Date.now()}`, {
          cache: "no-store",
          headers: { "Pragma": "no-cache", "Cache-Control": "no-cache" },
        });
        if (apiRes.ok) {
          const json = await apiRes.json();
          if (Array.isArray(json?.data)) {
            setRows(json.data.map((r: any) => emptyRow(r)));
            setLoading(false);
            return;
          }
        }
      } catch {
        // Fall back to direct query below
      }

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
          .select("work_order_id, stage_id, output_qty, rejection_qty, htc_ok, output_pcs, rejection_pcs")
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

      for (const p of plans) {
        if (!p.status) continue;
        try {
          const parsed = typeof p.status === "string" ? JSON.parse(p.status) : p.status;
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

            masterCampaignMap.set(p.work_order_id, {
              plan_id: p.id,
              plan_no: p.plan_no,
              master_wo_id: p.work_order_id,
              master_wo_no: parsed.master_wo_no,
              master_planned_mtr: masterPlannedMtr,
              master_planned_pcs: masterPlannedPcs,
              total_campaign_mtr: totalCampaignMtr,
              total_campaign_pcs: totalCampaignPcs,
              child_work_orders: parsed.child_work_orders,
              route_id: p.process_route_id,
              mh_od: p.mh_od,
              mh_wt: p.mh_wt,
              mh_l1: p.mh_l1,
              mh_l2: p.mh_l2,
            });

            for (const child of parsed.child_work_orders) {
              childWoMap.set(child.work_order_id || child.id, {
                ...child,
                master_wo_id: p.work_order_id,
                master_wo_no: parsed.master_wo_no,
                master_plan_no: p.plan_no,
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
        s === "ROLLING";

      if (s === "ROLLING") {
        // Filter out any child work orders
        const filtered = rawRows.filter((r) => !childWoMap.has(r.work_order_id));

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

          const rawBalMtr = Number(r.balance_to_make_mtr || 0);
          const rawBalPcs = Number(r.balance_to_make_pcs || 0);

          const rollDivIn = getStageDivIn(r.work_order_id, "ROLLING");
          const rollDivOut = getStageDivOut(r.work_order_id, "ROLLING");

          if (campaign) {
            const totalCampaignMtr = Number(campaign.total_campaign_mtr || 0);
            const totalCampaignPcs = Number(campaign.total_campaign_pcs || 0);

            // If totalLoggedMtr > 0, calculate balance; otherwise use the database RPC computed balance
            const availMtr = totalLoggedMtr > 0
              ? Math.max(0, totalCampaignMtr + rollDivIn - totalLoggedMtr - rollDivOut)
              : (rawBalMtr > 0 ? rawBalMtr : Math.max(0, totalCampaignMtr + rollDivIn - rollDivOut));

            const availPcs = effAvg > 0
              ? Math.round(availMtr / effAvg)
              : (rawBalPcs > 0 ? Math.round(rawBalPcs) : (totalCampaignPcs > 0 ? Math.max(0, totalCampaignPcs - totalLoggedPcs) : 0));
            const mhOd = Number(campaign.mh_od || r.mh_od || r.od || 0);
            const mhWt = Number(campaign.mh_wt || r.mh_wt || r.wl || 0);
            const availMt =
              Math.max(mhOd - mhWt, 0) * Math.max(mhWt, 0) * 0.0246615 * 0.001 * availMtr;

            // Effective logged production for capping
            const effLoggedMtr = totalLoggedMtr > 0
              ? totalLoggedMtr
              : (totalCampaignMtr > availMtr ? totalCampaignMtr - availMtr : 0);

            // Capping at rolling = 110% of total Plan issued against master + child work order - total already logged
            const maxCappingMtr = Number((totalCampaignMtr * 1.1).toFixed(3));
            const cappingMtr = Math.max(0, maxCappingMtr - effLoggedMtr);
            const cappingPcs = effAvg > 0
              ? Math.round(cappingMtr / effAvg)
              : Math.max(0, Math.round(totalCampaignPcs * 1.1) - totalLoggedPcs);

            return {
              ...r,
              mh_od: campaign.mh_od ?? r.mh_od,
              mh_wt: campaign.mh_wt ?? r.mh_wt,
              mh_l1: campaign.mh_l1 ?? r.mh_l1,
              mh_l2: campaign.mh_l2 ?? r.mh_l2,
              mh_avg_length: mhAvg,
              is_master: true,
              master_plan_no: campaign.plan_no,
              campaign_total_mtr: totalCampaignMtr,
              campaign_total_pcs: totalCampaignPcs,
              child_work_orders: campaign.child_work_orders,
              balance_to_make_mtr: availMtr,
              balance_to_make_pcs: availPcs,
              balance_to_make_mt: Number(availMt.toFixed(3)),
              max_allowed_mtr: cappingMtr,
              max_allowed_pcs: cappingPcs,
            };
          } else {
            // Standard single work order plan
            const plan = plans.find((p: any) => p.work_order_id === r.work_order_id);
            const planMtr = plan ? Number(plan.planned_qty || 0) : rawBalMtr;
            const availMtr = totalLoggedMtr > 0
              ? Math.max(0, (planMtr || rawBalMtr) + rollDivIn - totalLoggedMtr - rollDivOut)
              : (rawBalMtr > 0 ? rawBalMtr : Math.max(0, (planMtr || 0) + rollDivIn - rollDivOut));
            const availPcs = effAvg > 0 ? Math.round(availMtr / effAvg) : (rawBalPcs > 0 ? Math.round(rawBalPcs) : 0);
            const od = Number(r.od || 0);
            const wt = Number(r.wl || 0);
            const availMt = Math.max(od - wt, 0) * Math.max(wt, 0) * 0.0246615 * 0.001 * availMtr;

            const effLoggedMtr = totalLoggedMtr > 0
              ? totalLoggedMtr
              : ((planMtr || availMtr) > availMtr ? (planMtr || availMtr) - availMtr : 0);
            const maxCappingMtr = Number(((planMtr || availMtr) * 1.1).toFixed(3));
            const cappingMtr = Math.max(0, maxCappingMtr - effLoggedMtr);
            const cappingPcs = effAvg > 0 ? Math.round(cappingMtr / effAvg) : Math.max(0, Math.round(availPcs * 1.1) - totalLoggedPcs);

            return {
              ...r,
              balance_to_make_mtr: availMtr,
              balance_to_make_pcs: availPcs,
              balance_to_make_mt: Number(availMt.toFixed(3)),
              max_allowed_mtr: cappingMtr,
              max_allowed_pcs: cappingPcs,
            };
          }
        });

        // Ensure any Master Campaign with remaining available WIP is included
        const existingWoIds = new Set(filtered.map((r) => r.work_order_id));
        for (const [masterWoId, campaign] of masterCampaignMap.entries()) {
          if (!existingWoIds.has(masterWoId)) {
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
                const maxCappingMtr = Number((campaign.total_campaign_mtr * 1.1).toFixed(3));
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
                    balance_to_make_mt: Number(availMt.toFixed(3)),
                    max_allowed_mtr: cappingMtr,
                    max_allowed_pcs: cappingPcs,
                    multiple: 1,
                    ht_nos: null,
                    is_master: true,
                    master_plan_no: campaign.plan_no,
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

            const rollLogs = masterLogs.filter((l: any) => !rollingStageId || l.stage_id === rollingStageId);
            const rollingHtcOk = rollLogs.reduce((sum: number, l: any) => sum + Number(l.htc_ok || 0), 0);

            const hollowHtLogs = masterLogs.filter((l: any) => l.stage_id === hollowHtStageId);
            const hollowHtOut = hollowHtLogs.reduce((sum: number, l: any) => sum + Number(l.output_qty || 0), 0);
            const hollowHtRej = hollowHtLogs.reduce((sum: number, l: any) => sum + Number(l.rejection_qty || 0), 0);
            const hollowHtNet = Math.max(0, hollowHtOut - hollowHtRej);

            const drawLogs = masterLogs.filter((l: any) => l.stage_id === drawStageId);
            const drawOut = drawLogs.reduce((sum: number, l: any) => sum + Number(l.output_qty || 0), 0);
            const drawRej = drawLogs.reduce((sum: number, l: any) => sum + Number(l.rejection_qty || 0), 0);
            const drawNet = Math.max(0, drawOut - drawRej);

            const htLogs = masterLogs.filter((l: any) => l.stage_id === htStageId);
            const htOut = htLogs.reduce((sum: number, l: any) => sum + Number(l.output_qty || 0), 0);
            const htRej = htLogs.reduce((sum: number, l: any) => sum + Number(l.rejection_qty || 0), 0);

            const hhtDivIn = getStageDivIn(r.work_order_id, "HOLLOW_HEAT_TREATMENT");
            const hhtDivOut = getStageDivOut(r.work_order_id, "HOLLOW_HEAT_TREATMENT");
            const drawDivIn = getStageDivIn(r.work_order_id, "DRAW");
            const drawDivOut = getStageDivOut(r.work_order_id, "DRAW");
            const htDivIn = getStageDivIn(r.work_order_id, "HEAT_TREATMENT");
            const htDivOut = getStageDivOut(r.work_order_id, "HEAT_TREATMENT");

            let availMtr = 0;
            if (s === "HOLLOW_HEAT_TREATMENT") {
              availMtr = Math.max(0, rollingHtcOk + hhtDivIn - hollowHtOut - hollowHtRej - hhtDivOut);
            } else if (s === "DRAW") {
              const incoming = r.route_code === "ALLOY_CDS" ? hollowHtNet : rollingHtcOk;
              availMtr = Math.max(0, incoming + drawDivIn - drawOut - drawRej - drawDivOut);
            } else if (s === "HEAT_TREATMENT") {
              availMtr = Math.max(0, drawNet + htDivIn - htOut - htRej - htDivOut);
            }
            if (availMtr === 0 && Number(r.balance_to_make_mtr || 0) > 0 && rollingHtcOk === 0) {
              availMtr = Number(r.balance_to_make_mtr || 0);
            }

            const effAvg = Number(r.avg_length) || 6.25;
            const availPcs = effAvg > 0 ? Math.round(availMtr / effAvg) : 0;
            const od = Number(r.od || 0);
            const wt = Number(r.wl || 0);
            const availMt = Math.max(od - wt, 0) * Math.max(wt, 0) * 0.0246615 * 0.001 * availMtr;

            const base: Row = {
              ...r,
              balance_to_make_mtr: availMtr,
              balance_to_make_pcs: availPcs,
              balance_to_make_mt: Number(availMt.toFixed(3)),
              max_allowed_mtr: availMtr,
              max_allowed_pcs: availPcs,
              prev_htc_ok: rollingHtcOk,
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
            const finishedPcs = finishedLogs.reduce((sum: number, l: any) => sum + Number(l.output_pcs || 0) + Number(l.rejection_pcs || 0), 0);
            const availPcs = Math.max(0, qcOk + finDivInPcs - finishedPcs - finDivOutPcs);
            const availMtr: number = effAvg > 0 ? Number((availPcs * effAvg).toFixed(3)) : Math.max(0, (Number(r.balance_to_make_mtr) || 0) + finDivIn - finDivOut);
            const od = Number(r.od || 0);
            const wt = Number(r.wl || 0);
            const availMt = Math.max(od - wt, 0) * Math.max(wt, 0) * 0.0246615 * 0.001 * availMtr;
            rowToUse = {
              ...rowToUse,
              balance_to_make_pcs: availPcs,
              balance_to_make_mtr: availMtr,
              balance_to_make_mt: Number(availMt.toFixed(3)),
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
              const remainingPcs = avgLen > 0 ? Math.round(remainingMtr / avgLen) : 0;

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
                balance_to_make_mt: Number(remainingMt.toFixed(3)),
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

