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
      const supabase = createClient();

      // 1. Fetch standard queue, plans, process stages, and production logs
      const [queueRes, plansRes, stagesRes, logsRes] = await Promise.all([
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
          .select("work_order_id, stage_id, output_qty, rejection_qty, output_pcs, rejection_pcs"),
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
          const loggedOutputPcs = masterLogs.reduce(
            (sum: number, l: any) => sum + Number(l.output_pcs || 0),
            0
          );
          const loggedRejPcs = masterLogs.reduce(
            (sum: number, l: any) => sum + Number(l.rejection_pcs || 0),
            0
          );
          const totalLoggedPcs = loggedOutputPcs + loggedRejPcs;

          if (campaign) {
            const totalCampaignMtr = Number(campaign.total_campaign_mtr || 0);
            const totalCampaignPcs = Number(campaign.total_campaign_pcs || 0);

            // Available WIP = Total Plan issued against Master + Child Work Orders - Logged Rolling Production
            const availMtr = Math.max(0, totalCampaignMtr - totalLoggedMtr);

            // Effective average length for Mother Hollow PCS
            const mhL1 = Number(campaign.mh_l1 || r.mh_l1 || r.l1 || 6);
            const mhL2 = Number(campaign.mh_l2 || r.mh_l2 || r.l2 || 6);
            const mhAvg = mhL1 > 0 && mhL2 > 0 ? (mhL1 + mhL2) / 2 : mhL1 || 6;
            const effAvg = mhAvg > 0 ? mhAvg : Number(r.avg_length) || 6;

            const availPcs = totalCampaignPcs > 0
              ? Math.max(0, totalCampaignPcs - totalLoggedPcs)
              : (effAvg > 0 ? Math.round(availMtr / effAvg) : 0);
            const mhOd = Number(campaign.mh_od || r.mh_od || r.od || 0);
            const mhWt = Number(campaign.mh_wt || r.mh_wt || r.wl || 0);
            const availMt =
              Math.max(mhOd - mhWt, 0) * Math.max(mhWt, 0) * 0.0246615 * 0.001 * availMtr;

            // Capping at rolling = 110% of total Plan issued against master + child work order
            const cappingMtr = Number((totalCampaignMtr * 1.1).toFixed(3));
            const cappingPcs = totalCampaignPcs > 0
              ? Math.round(totalCampaignPcs * 1.1)
              : (effAvg > 0 ? Math.round(cappingMtr / effAvg) : 0);

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
            const planMtr = plan ? Number(plan.planned_qty || 0) : Number(r.balance_to_make_mtr || 0);
            const availMtr = Math.max(0, (planMtr || Number(r.balance_to_make_mtr || 0)) - totalLoggedMtr);
            const effAvg = Number(r.avg_length) || 6;
            const availPcs = effAvg > 0 ? Math.round(availMtr / effAvg) : (r.balance_to_make_pcs || 0);
            const od = Number(r.od || 0);
            const wt = Number(r.wl || 0);
            const availMt = Math.max(od - wt, 0) * Math.max(wt, 0) * 0.0246615 * 0.001 * availMtr;

            const cappingMtr = Number(((planMtr || availMtr) * 1.1).toFixed(3));
            const cappingPcs = effAvg > 0 ? Math.round(cappingMtr / effAvg) : Math.round(availPcs * 1.1);

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
            const totalLoggedPcs = masterLogs.reduce(
              (sum: number, l: any) => sum + Number(l.output_pcs || 0) + Number(l.rejection_pcs || 0),
              0
            );
            const availMtr = Math.max(0, campaign.total_campaign_mtr - totalLogged);
            const totalCampaignPcs = Number(campaign.total_campaign_pcs || 0);
            if (availMtr > 0 || (totalCampaignPcs > 0 && totalCampaignPcs > totalLoggedPcs)) {
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
                const mhL1 = Number(campaign.mh_l1 || 0);
                const mhL2 = Number(campaign.mh_l2 || 0);
                const mhAvg = mhL1 > 0 && mhL2 > 0 ? (mhL1 + mhL2) / 2 : mhL1 || avg;
                const effAvg = mhAvg > 0 ? mhAvg : avg;
                const availPcs = totalCampaignPcs > 0
                  ? Math.max(0, totalCampaignPcs - totalLoggedPcs)
                  : (effAvg > 0 ? Math.round(availMtr / effAvg) : 0);
                const mhOd = Number(campaign.mh_od || wo.size_od || 0);
                const mhWt = Number(campaign.mh_wt || wo.size_wt || 0);
                const availMt =
                  Math.max(mhOd - mhWt, 0) * Math.max(mhWt, 0) * 0.0246615 * 0.001 * availMtr;
                const cappingMtr = Number((campaign.total_campaign_mtr * 1.1).toFixed(3));
                const cappingPcs = totalCampaignPcs > 0
                  ? Math.round(totalCampaignPcs * 1.1)
                  : (effAvg > 0 ? Math.round(cappingMtr / effAvg) : 0);

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

        setRows(enriched);
      } else if (isMasterOnlyStage) {
        // Filter out any child work orders
        const filtered = rawRows.filter((r) => !childWoMap.has(r.work_order_id));

        // Enrich master rows with campaign details
        const enriched = filtered.map((r) => {
          const campaign = masterCampaignMap.get(r.work_order_id);
          if (campaign) {
            return {
              ...r,
              is_master: true,
              master_plan_no: campaign.plan_no,
              campaign_total_mtr: campaign.total_campaign_mtr,
              campaign_total_pcs: campaign.total_campaign_pcs,
              child_work_orders: campaign.child_work_orders,
            };
          }
          return r;
        });

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

          if (campaign) {
            processedRows.push({
              ...r,
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

              const childPlannedMtr = Number(child.planned_mtr || 0);
              const remainingMtr = Math.max(0, childPlannedMtr - childFinishedMtr);

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
              ...r,
              is_child: true,
              master_wo_id: childInfo.master_wo_id,
              master_wo_no: childInfo.master_wo_no,
              master_plan_no: childInfo.master_plan_no,
            });
          } else {
            processedRows.push(r);
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

