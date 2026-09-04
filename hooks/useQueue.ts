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

      // 1. Fetch standard queue from database RPC and active plans
      const [queueRes, plansRes] = await Promise.all([
        supabase.rpc("get_production_entry_queue", { p_stage_code: s }),
        supabase
          .from("rolling_plans")
          .select("id, plan_no, work_order_id, status, process_route_id, planned_qty")
          .not("status", "is", null)
          .order("created_at", { ascending: false })
          .limit(250),
      ]);

      if (queueRes.error) {
        setRows([]);
        setError(queueRes.error.message);
        setLoading(false);
        return;
      }

      const rawRows: Row[] = (queueRes.data ?? []).map((r: any) => emptyRow(r));
      const plans = plansRes.data ?? [];

      // Parse multi-WO campaigns from rolling plans
      const masterCampaignMap = new Map<string, any>(); // key: master_wo_id
      const childWoMap = new Map<string, any>(); // key: child_wo_id -> child metadata + master info

      for (const p of plans) {
        if (!p.status) continue;
        try {
          const parsed = typeof p.status === "string" ? JSON.parse(p.status) : p.status;
          if (parsed?.is_master && Array.isArray(parsed?.child_work_orders)) {
            masterCampaignMap.set(p.work_order_id, {
              plan_id: p.id,
              plan_no: p.plan_no,
              master_wo_id: p.work_order_id,
              master_wo_no: parsed.master_wo_no,
              master_planned_mtr: parsed.master_planned_mtr,
              master_planned_pcs: parsed.master_planned_pcs,
              total_campaign_mtr: parsed.total_campaign_mtr,
              total_campaign_pcs: parsed.total_campaign_pcs,
              child_work_orders: parsed.child_work_orders,
              route_id: p.process_route_id,
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

      if (isMasterOnlyStage) {
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
              const childFinishedMtr = finishingLogs
                .filter((l: any) => l.work_order_id === childId)
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

