import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { StageCode, Row, WorkCenterWipInfo } from "@/types";
import { mtFromMtr, extractPcsFromRemarks } from "@/lib/productionUtils";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface CachePayload {
  timestamp: number;
  allCalculatedRows: Map<string, { queueRows: Record<StageCode, Row | null>; pipeline: WorkCenterWipInfo[] }>;
  rollingPlanRows: Row[];
  childFinishingRows: Row[];
  workCenterSummary: Record<StageCode, { label: string; stage_code: StageCode; availMtr: number; availPcs: number; availMt: number; count: number }>;
}

let memoryCache: CachePayload | null = null;
const CACHE_TTL_MS = 3500; // 3.5s in-memory TTL for high-concurrency request deduplication

function invalidateQueueCache() {
  memoryCache = null;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const targetStage = (searchParams.get("stage")?.toUpperCase() || "ROLLING") as StageCode;
    const forceFresh = searchParams.has("nocache") || searchParams.has("refresh");

    // Fast-path: Return from memory cache if within TTL (reduces DB hits by 90% during navigation)
    if (!forceFresh && memoryCache && (Date.now() - memoryCache.timestamp) < CACHE_TTL_MS) {
      const selectedRows: Row[] = [];
      if (targetStage === "ROLLING") {
        selectedRows.push(
          ...memoryCache.rollingPlanRows.filter(
            (r) => Number(r.balance_to_make_pcs ?? 0) >= 1 || Number(r.balance_to_make_mtr ?? 0) >= 1.0
          )
        );
      } else {
        for (const { queueRows } of memoryCache.allCalculatedRows.values()) {
          const row = queueRows[targetStage];
          if (row && (Number(row.balance_to_make_pcs ?? 0) >= 1 || Number(row.balance_to_make_mtr ?? 0) >= 1.0)) {
            selectedRows.push(row);
          }
        }
      }
      if (targetStage === "FINISHING") {
        selectedRows.push(
          ...memoryCache.childFinishingRows.filter(
            (r) => Number(r.balance_to_make_pcs ?? 0) >= 1 || Number(r.balance_to_make_mtr ?? 0) >= 1.0
          )
        );
      }
      const summaryArray = Object.values(memoryCache.workCenterSummary).map((s) => ({
        ...s,
        availMtr: Number(s.availMtr.toFixed(2)),
        availMt: Number(s.availMt.toFixed(2)),
      }));

      return NextResponse.json(
        {
          success: true,
          stage: targetStage,
          count: selectedRows.length,
          data: selectedRows,
          summary: summaryArray,
          cached: true,
        },
        {
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
          },
        }
      );
    }

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: "Database service is temporarily unavailable." },
        { status: 500 }
      );
    }

    // Helper to fetch all production logs overcoming 1,000-row default PostgREST limit
    async function fetchAllLogs(client: any) {
      const PAGE_SIZE = 1000;
      const all: any[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await client
          .from("production_logs")
          .select("id, work_order_id, rolling_plan_id, stage_id, process_route_id, process_date, input_qty, output_qty, rejection_qty, htc_ok, heat_lot_no, remarks, created_at")
          .order("created_at", { ascending: true })
          .range(from, from + PAGE_SIZE - 1);
        if (error || !data || data.length === 0) break;
        all.push(...data);
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
      return all;
    }

    // Fetch plans, stages, logs, work orders, routes, qc, diversions
    const [plansRes, stagesRes, logs, woRes, routesRes, qcRes, divsRes] = await Promise.all([
      admin
        .from("rolling_plans")
        .select("id, plan_no, work_order_id, status, process_route_id, planned_qty, mh_od, mh_wt, mh_l1, mh_l2, multiple, created_at")
        .not("status", "is", null)
        .order("created_at", { ascending: false })
        .limit(300),
      admin.from("process_stages").select("id, stage_code, stage_name"),
      fetchAllLogs(admin),
      admin
        .from("work_orders")
        .select("id, work_order_no, customer_name, grade, size_od, size_wt, l1, l2, ordered_qty, ordered_qty_mtr, ordered_qty_pcs, ordered_qty_mt, balance_qty_mtr, balance_qty_pcs, balance_qty_mt"),
      admin.from("process_routes").select("id, route_code, route_name"),
      admin
        .from("qc_inspections")
        .select("id, work_order_id, inspected_pcs, inspected_mtr, vdi_ok_pcs, vdi_ok_mtr, vdi_salvage_pcs, vdi_salvage_mtr, vdi_rejection_pcs, vdi_rejection_mtr"),
      admin
        .from("diversion_plans")
        .select("id, source_wo_id, target_wo_id, diverted_qty, work_center, multiple, status"),
    ]);

    if (stagesRes.error) throw stagesRes.error;

    const plans = plansRes.data || [];
    const stages = stagesRes.data || [];
    const workOrders = woRes.data || [];
    const routes = routesRes.data || [];
    const qcInspections = qcRes?.data || [];
    const hasQcTable = !qcRes?.error;
    const diversions = divsRes?.data || [];

    const getStageDivIn = (wId: string, stageCode: string) =>
      diversions
        .filter((d: any) => d.target_wo_id === wId && (d.work_center || "ROLLING") === stageCode)
        .reduce((sum: number, d: any) => sum + Number(d.diverted_qty || 0), 0);

    const getStageDivOut = (wId: string, stageCode: string) =>
      diversions
        .filter((d: any) => d.source_wo_id === wId && (d.work_center || "ROLLING") === stageCode)
        .reduce((sum: number, d: any) => sum + Number(d.diverted_qty || 0), 0);

    const stageCodeToId = new Map<string, string>();
    const stageIdToCode = new Map<string, string>();
    stages.forEach((s) => {
      stageCodeToId.set(s.stage_code, s.id);
      stageIdToCode.set(s.id, s.stage_code);
    });

    const routeMap = new Map<string, any>();
    routes.forEach((r) => routeMap.set(r.id, r));

    const woMap = new Map<string, any>();
    workOrders.forEach((w) => woMap.set(w.id, w));

    const rollingStageId = stageCodeToId.get("ROLLING");
    const hollowHtStageId = stageCodeToId.get("HOLLOW_HEAT_TREATMENT");
    const drawStageId = stageCodeToId.get("DRAW");
    const htStageId = stageCodeToId.get("HEAT_TREATMENT");
    const bandSawStageId = stageCodeToId.get("BAND_SAW");
    const vdiStageId = stageCodeToId.get("VDI");
    const finStageId = stageCodeToId.get("FINISHING");

    // Parse multi-WO campaigns from rolling plans
    const masterCampaignMap = new Map<string, any>(); // key: master_wo_id
    const childWoMap = new Map<string, any>(); // key: child_wo_id -> child info
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
            revision_date: parsed?.revision_date || null,
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

          // Retain campaign with children if already recorded, or combine plan numbers
          const existing = masterCampaignMap.get(p.work_order_id);
          const hasChildren = Array.isArray(parsed.child_work_orders) && parsed.child_work_orders.length > 0;
          if (!existing || (hasChildren && (!existing.child_work_orders || existing.child_work_orders.length === 0))) {
            const enrichedChildOrders = (parsed.child_work_orders || []).map((child: any) => {
              const cId = child.work_order_id || child.id;
              const cWo = woMap.get(cId);
              const cL1 = Number(child.l1 || cWo?.l1 || 6);
              const cL2 = Number(child.l2 || cWo?.l2 || 6.5);
              const cAvg = cL1 > 0 && cL2 > 0 ? (cL1 + cL2) / 2 : cL1 || 6.25;
              const cOd = Number(child.size_od || cWo?.size_od || 0);
              const cWt = Number(child.size_wt || cWo?.size_wt || 0);

              const cTotalOrderMtr = Number(child.planned_mtr || cWo?.ordered_qty_mtr || cWo?.ordered_qty || 0);
              const cTotalOrderPcs =
                Number(child.planned_pcs || cWo?.ordered_qty_pcs || 0) ||
                (cAvg > 0 ? Math.round(cTotalOrderMtr / cAvg) : 0);
              const cTotalOrderMt =
                Number(child.planned_mt || cWo?.ordered_qty_mt || 0) || mtFromMtr(cTotalOrderMtr, cOd, cWt);

              const cFinLogs = logs.filter((l) => l.work_order_id === cId && l.stage_id === finStageId);
              const cFinishedMtr = sumQty(cFinLogs, "output_qty");
              const cFinishedPcs = cAvg > 0 ? Math.round(cFinishedMtr / cAvg) : 0;

              const cBalOrderMtr = Math.max(0, cTotalOrderMtr - cFinishedMtr);
              const cBalOrderPcs = cAvg > 0 ? Math.round(cBalOrderMtr / cAvg) : 0;
              const cBalOrderMt = mtFromMtr(cBalOrderMtr, cOd, cWt);

              const cCappingMtr = Number((cTotalOrderMtr * 1.10).toFixed(2));
              const cCappingPcs = cAvg > 0 ? Math.round(cCappingMtr / cAvg) : 0;

              return {
                ...child,
                work_order_id: cId,
                id: cId,
                work_order_no: child.work_order_no || cWo?.work_order_no || "Child Order",
                customer_name: child.customer_name || cWo?.customer_name || null,
                grade: child.grade || cWo?.grade || null,
                size_od: cOd,
                size_wt: cWt,
                l1: cL1,
                l2: cL2,
                total_order_pcs: cTotalOrderPcs,
                total_order_mtr: cTotalOrderMtr,
                total_order_mt: cTotalOrderMt,
                balance_to_make_pcs: cBalOrderPcs,
                balance_to_make_mtr: cBalOrderMtr,
                balance_to_make_mt: cBalOrderMt,
                finished_output_mtr: cFinishedMtr,
                finished_output_pcs: cFinishedPcs,
                order_capping_mtr: cCappingMtr,
                order_capping_pcs: cCappingPcs,
              };
            });

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
              child_work_orders: enrichedChildOrders,
              route_id: p.process_route_id,
              mh_od: mhOdVal,
              mh_wt: mhWtVal,
              mh_l1: mhL1Val,
              mh_l2: mhL2Val,
              multiple: p.multiple || 1,
              is_issued: isIssued || existing?.is_issued,
              lifecycle_status: lifecycle,
              revision_no: Number(parsed?.revision_no || 0),
              revision_date: parsed?.revision_date || null,
            });

            for (const child of enrichedChildOrders) {
              childWoMap.set(child.work_order_id, {
                ...child,
                master_wo_id: p.work_order_id,
                master_wo_no: parsed.master_wo_no,
                master_plan_no: combinedPlanNos.join(', ') || p.plan_no,
                master_plan_id: p.id,
                route_id: p.process_route_id,
              });
            }
          } else if (existing) {
            const combinedPlanNos = Array.from(new Set([...(existing.plan_nos || [existing.plan_no]), planNoStr].filter(Boolean)));
            existing.plan_nos = combinedPlanNos;
            existing.plan_no = combinedPlanNos.join(', ');
            existing.master_planned_mtr = (existing.master_planned_mtr || 0) + masterPlannedMtr;
            existing.total_campaign_mtr = (existing.total_campaign_mtr || 0) + totalCampaignMtr;
            if (isIssued) existing.is_issued = true;
          }
        } else if (parsed?.is_child) {
          const masterPlan = plans.find(
            (pl) => pl.id === parsed.master_plan_id || (parsed.master_plan_no && pl.plan_no === parsed.master_plan_no)
          );
          let mParsed: any = {};
          try {
            mParsed = typeof masterPlan?.status === 'string' ? JSON.parse(masterPlan.status) : masterPlan?.status || {};
          } catch {}

          const childInMaster = Array.isArray(mParsed?.child_work_orders)
            ? mParsed.child_work_orders.find((c: any) => (c.work_order_id || c.id) === p.work_order_id)
            : null;

          const childPlannedMtr = Number(
            childInMaster?.planned_mtr ||
            parsed.planned_mtr ||
            p.planned_qty ||
            0
          );
          const childPlannedPcs = Number(
            childInMaster?.planned_pcs ||
            parsed.planned_pcs ||
            (childInMaster as any)?.pcs ||
            0
          );

          childWoMap.set(p.work_order_id, {
            work_order_id: p.work_order_id,
            master_wo_id: parsed.master_wo_id,
            master_wo_no: parsed.master_wo_no,
            master_plan_no: parsed.master_plan_no,
            planned_mtr: childPlannedMtr,
            planned_pcs: childPlannedPcs,
          });
        }
      } catch {
        // text status
      }
    }

    // Helper to calculate stage totals for a work order
    const getStageLogs = (woId: string, stageId?: string) => {
      if (!stageId) return [];
      return logs.filter((l) => l.work_order_id === woId && l.stage_id === stageId);
    };

    const sumQty = (logList: any[], field: string) =>
      logList.reduce((sum, l) => sum + Number(l[field] || 0), 0);

    const getLogPcs = (log: any, fallbackAvg: number = 0) => {
      if (log.output_pcs !== undefined && log.output_pcs !== null && Number(log.output_pcs) > 0) {
        return Number(log.output_pcs);
      }
      const parsed = extractPcsFromRemarks(log.remarks);
      if (parsed.pcs !== null && parsed.pcs > 0) {
        return parsed.pcs;
      }
      if (fallbackAvg > 0 && Number(log.output_qty || 0) > 0) {
        return Math.round(Number(log.output_qty) / fallbackAvg);
      }
      return 0;
    };

    const getLogRejPcs = (log: any, fallbackAvg: number = 0) => {
      if (log.rejection_pcs !== undefined && log.rejection_pcs !== null && Number(log.rejection_pcs) > 0) {
        return Number(log.rejection_pcs);
      }
      const parsed = extractPcsFromRemarks(log.remarks);
      if (parsed.rejPcs !== null && parsed.rejPcs > 0) {
        return parsed.rejPcs;
      }
      if (fallbackAvg > 0 && Number(log.rejection_qty || 0) > 0) {
        return Math.round(Number(log.rejection_qty) / fallbackAvg);
      }
      return 0;
    };

    const getLogHtcOkPcs = (log: any, fallbackAvg: number = 0) => {
      if (Number(log.htc_ok || 0) > 0) {
        if (log.output_pcs !== undefined && log.output_pcs !== null && Number(log.output_pcs) > 0) {
          return Number(log.output_pcs);
        }
        const parsed = extractPcsFromRemarks(log.remarks);
        if (parsed.pcs !== null && parsed.pcs > 0) {
          return parsed.pcs;
        }
        if (fallbackAvg > 0) {
          return Math.round(Number(log.htc_ok) / fallbackAvg);
        }
      }
      return 0;
    };

    const sumPcs = (logList: any[], fallbackAvg: number = 0) =>
      logList.reduce((sum, l) => sum + getLogPcs(l, fallbackAvg), 0);

    const sumRejPcs = (logList: any[], fallbackAvg: number = 0) =>
      logList.reduce((sum, l) => sum + getLogRejPcs(l, fallbackAvg), 0);

    const sumHtcOkPcs = (logList: any[], fallbackAvg: number = 0) =>
      logList.reduce((sum, l) => sum + getLogHtcOkPcs(l, fallbackAvg), 0);

    // Summary accumulator across all 7 work centers
    const workCenterSummary: Record<
      StageCode,
      { label: string; stage_code: StageCode; availMtr: number; availPcs: number; availMt: number; count: number }
    > = {
      ROLLING: { label: "Rolling Mill", stage_code: "ROLLING", availMtr: 0, availPcs: 0, availMt: 0, count: 0 },
      HOLLOW_HEAT_TREATMENT: { label: "Hollow Heat Treatment", stage_code: "HOLLOW_HEAT_TREATMENT", availMtr: 0, availPcs: 0, availMt: 0, count: 0 },
      DRAW: { label: "Draw Bench", stage_code: "DRAW", availMtr: 0, availPcs: 0, availMt: 0, count: 0 },
      HEAT_TREATMENT: { label: "Heat Treatment", stage_code: "HEAT_TREATMENT", availMtr: 0, availPcs: 0, availMt: 0, count: 0 },
      BAND_SAW: { label: "Band Saw", stage_code: "BAND_SAW", availMtr: 0, availPcs: 0, availMt: 0, count: 0 },
      VDI: { label: "VDI / QC Inspection", stage_code: "VDI", availMtr: 0, availPcs: 0, availMt: 0, count: 0 },
      FINISHING: { label: "Finishing Line", stage_code: "FINISHING", availMtr: 0, availPcs: 0, availMt: 0, count: 0 },
    };

    // Build complete WIP details for all active work orders / campaigns
    const allCalculatedRows: Map<string, { queueRows: Record<StageCode, Row | null>; pipeline: WorkCenterWipInfo[] }> =
      new Map();

    const rollingPlanRows: Row[] = [];

    // Collect all candidate master / standalone work orders
    const candidateWoIds = new Set<string>();
    plans.forEach((p) => {
      if (!childWoMap.has(p.work_order_id)) candidateWoIds.add(p.work_order_id);
    });
    logs.forEach((l) => {
      if (!childWoMap.has(l.work_order_id)) candidateWoIds.add(l.work_order_id);
    });

    for (const woId of candidateWoIds) {
      const wo = woMap.get(woId);
      if (!wo) continue;

      const campaign = masterCampaignMap.get(woId);
      const plan = plans.find((p) => p.work_order_id === woId);
      const planInfo = planByWoMap.get(woId);
      const isRollingPlanIssued = campaign ? Boolean(campaign.is_issued) : Boolean(planInfo?.is_issued);

      const routeId = campaign?.route_id || plan?.process_route_id || routes[0]?.id;
      const route = routeMap.get(routeId);
      const routeCode = route?.route_code || "CDS";
      const routeName = route?.route_name || "Standard CDS";

      const isCds = routeCode === "CDS" || routeCode === "ALLOY_CDS";
      const isAlloy = routeCode.includes("ALLOY");

      const l1 = Number(wo.l1 || 6);
      const l2 = Number(wo.l2 || 6.5);
      const avgLength = l1 > 0 && l2 > 0 ? (l1 + l2) / 2 : l1 || 6.25;

      let planParsed: any = {};
      try {
        planParsed = typeof plan?.status === "string" ? JSON.parse(plan.status) : plan?.status || {};
      } catch {}

      const mhL1 = Number(
        campaign?.mh_l1 ||
        planInfo?.mh_l1 ||
        plan?.mh_l1 ||
        planParsed?.mh_l1 ||
        planParsed?.sm?.sm_len ||
        l1
      );
      const mhL2 = Number(
        campaign?.mh_l2 ||
        planInfo?.mh_l2 ||
        plan?.mh_l2 ||
        planParsed?.mh_l2 ||
        planParsed?.sm?.sm_len ||
        l2
      );
      const mhAvgLength = mhL1 > 0 && mhL2 > 0 ? (mhL1 + mhL2) / 2 : mhL1 || avgLength;

      const mhOd = Number(
        campaign?.mh_od ||
        planInfo?.mh_od ||
        plan?.mh_od ||
        planParsed?.mh_od ||
        planParsed?.cust_od ||
        planParsed?.sm?.cust_od ||
        planParsed?.sizing_mill?.cust_od ||
        wo.size_od ||
        0
      );
      const mhWt = Number(
        campaign?.mh_wt ||
        planInfo?.mh_wt ||
        plan?.mh_wt ||
        planParsed?.mh_wt ||
        planParsed?.cust_wt ||
        planParsed?.sm?.rolling_wt ||
        planParsed?.sm?.cust_wt ||
        planParsed?.sizing_mill?.rolling_wt ||
        wo.size_wt ||
        0
      );

      const multiple = Number(campaign?.multiple || plan?.multiple || 1);

      const storedPlanPcs = Number(
        campaign?.master_planned_pcs ||
        planInfo?.planned_pcs_sum ||
        planParsed?.master_planned_pcs ||
        planParsed?.planned_pcs ||
        0
      );

      const totalCampaignMtr = campaign
        ? Number(campaign.master_planned_mtr || 0)
        : Number(planInfo?.planned_qty_sum || plan?.planned_qty || 0);
      const totalCampaignPcs = campaign
        ? (Number(campaign.master_planned_pcs) > 0 ? Number(campaign.master_planned_pcs) : (mhAvgLength > 0 ? Math.round(totalCampaignMtr / mhAvgLength) : 0))
        : (storedPlanPcs > 0 ? storedPlanPcs : (mhAvgLength > 0 ? Math.round(totalCampaignMtr / mhAvgLength) : 0));

      const effPlanMhAvg = totalCampaignPcs > 0 && totalCampaignMtr > 0 ? totalCampaignMtr / totalCampaignPcs : mhAvgLength;
      const effMhAvg = effPlanMhAvg > 0 ? effPlanMhAvg : (mhAvgLength > 0 ? mhAvgLength : avgLength);

      // 1. Rolling Stage Metrics
      const rollLogs = getStageLogs(woId, rollingStageId);
      const rollGrossPcs = sumPcs(rollLogs, effMhAvg);
      const rollRejPcs = sumRejPcs(rollLogs, effMhAvg);
      const rollNetPcs = Math.max(0, rollGrossPcs - rollRejPcs);
      const rollHtcOkPcs = sumHtcOkPcs(rollLogs, effMhAvg);

      const rawRollOut = sumQty(rollLogs, "output_qty");
      const rawRollRej = sumQty(rollLogs, "rejection_qty");
      const rawRollHtc = sumQty(rollLogs, "htc_ok");
      const rollOutMtr = rawRollOut > 0 ? rawRollOut : (effMhAvg > 0 ? Number((rollGrossPcs * effMhAvg).toFixed(3)) : 0);
      const rollRejMtr = rawRollRej > 0 ? rawRollRej : (effMhAvg > 0 ? Number((rollRejPcs * effMhAvg).toFixed(3)) : 0);
      const rollNetMtr = Math.max(0, rollOutMtr - rollRejMtr);
      const rollHtcOkMtr = rawRollHtc > 0 ? rawRollHtc : (effMhAvg > 0 ? Number((rollHtcOkPcs * effMhAvg).toFixed(3)) : rollNetMtr);

      // 1. Rolling Available WIP & Target Tracking
      const rollDivIn = getStageDivIn(woId, "ROLLING");
      const rollDivOut = getStageDivOut(woId, "ROLLING");
      const rollDivInPcs = effMhAvg > 0 ? Math.round(rollDivIn / effMhAvg) : 0;
      const rollDivOutPcs = effMhAvg > 0 ? Math.round(rollDivOut / effMhAvg) : 0;
      const rollTotalLoggedPcs = rollGrossPcs + rollRejPcs;

      const rollAvailPcs = Math.max(0, totalCampaignPcs + rollDivInPcs - rollTotalLoggedPcs - rollDivOutPcs);
      const rollAvailMtr = effMhAvg > 0 ? Number((rollAvailPcs * effMhAvg).toFixed(3)) : Math.max(0, totalCampaignMtr + rollDivIn - (rollOutMtr + rollRejMtr) - rollDivOut);
      const rollAvailMt = mtFromMtr(rollAvailMtr, mhOd, mhWt);

      // 2. Hollow Heat Treatment Stage Metrics (adjusted for HHT Diversions)
      const effHhtAvg = mhAvgLength > 0 ? mhAvgLength : effMhAvg;
      const hollowHtLogs = getStageLogs(woId, hollowHtStageId);
      const hollowHtOutPcs = sumPcs(hollowHtLogs, effHhtAvg);
      const hollowHtRejPcs = sumRejPcs(hollowHtLogs, effHhtAvg);
      const hollowHtNetPcs = Math.max(0, hollowHtOutPcs - hollowHtRejPcs);
      const rawHhtOut = sumQty(hollowHtLogs, "output_qty");
      const rawHhtRej = sumQty(hollowHtLogs, "rejection_qty");
      const hollowHtOutMtr = rawHhtOut > 0 ? rawHhtOut : (effHhtAvg > 0 ? Number((hollowHtOutPcs * effHhtAvg).toFixed(3)) : 0);
      const hollowHtRejMtr = rawHhtRej > 0 ? rawHhtRej : (effHhtAvg > 0 ? Number((hollowHtRejPcs * effHhtAvg).toFixed(3)) : 0);
      const hollowHtNetMtr = Math.max(0, hollowHtOutMtr - hollowHtRejMtr);

      const hhtDivIn = getStageDivIn(woId, "HOLLOW_HEAT_TREATMENT");
      const hhtDivOut = getStageDivOut(woId, "HOLLOW_HEAT_TREATMENT");
      const hhtDivInPcs = effHhtAvg > 0 ? Math.round(hhtDivIn / effHhtAvg) : 0;
      const hhtDivOutPcs = effHhtAvg > 0 ? Math.round(hhtDivOut / effHhtAvg) : 0;

      // Hollow HT incoming: strictly from Rolling HTC OK!
      const isHhtRoute = isAlloy || routeCode.includes("ALLOY");
      const hollowHtRemMtr = Math.max(0, rollHtcOkMtr + hhtDivIn - hollowHtOutMtr - hollowHtRejMtr - hhtDivOut);
      const hollowHtRemPcs = effHhtAvg > 0 ? Math.round(hollowHtRemMtr / effHhtAvg) : Math.max(0, rollHtcOkPcs + hhtDivInPcs - hollowHtOutPcs - hollowHtRejPcs - hhtDivOutPcs);
      const hollowHtAvailPcs = isHhtRoute ? (hollowHtRemMtr >= 1.0 ? Math.max(1, hollowHtRemPcs) : 0) : 0;
      const hollowHtAvailMtr = isHhtRoute ? (hollowHtAvailPcs > 0 ? Number(hollowHtRemMtr.toFixed(3)) : 0) : 0;
      const hollowHtEffOd = mhOd > 0 ? mhOd : Number(wo.size_od || 0);
      const hollowHtEffWt = mhWt > 0 ? mhWt : Number(wo.size_wt || 0);
      const hollowHtAvailMt = mtFromMtr(hollowHtAvailMtr, hollowHtEffOd, hollowHtEffWt);

      // 3. Draw Stage Metrics (adjusted for Draw Diversions)
      const drawLogs = getStageLogs(woId, drawStageId);
      const drawOutPcs = sumPcs(drawLogs, avgLength);
      const drawRejPcs = sumRejPcs(drawLogs, avgLength);
      const drawNetPcs = Math.max(0, drawOutPcs - drawRejPcs);
      const rawDrawOut = sumQty(drawLogs, "output_qty");
      const rawDrawRej = sumQty(drawLogs, "rejection_qty");
      const drawOutMtr = rawDrawOut > 0 ? rawDrawOut : (avgLength > 0 ? Number((drawOutPcs * avgLength).toFixed(3)) : 0);
      const drawRejMtr = rawDrawRej > 0 ? rawDrawRej : (avgLength > 0 ? Number((drawRejPcs * avgLength).toFixed(3)) : 0);
      const drawNetMtr = Math.max(0, drawOutMtr - drawRejMtr);

      const drawDivIn = getStageDivIn(woId, "DRAW");
      const drawDivOut = getStageDivOut(woId, "DRAW");
      const drawDivInPcs = avgLength > 0 ? Math.round(drawDivIn / avgLength) : 0;
      const drawDivOutPcs = avgLength > 0 ? Math.round(drawDivOut / avgLength) : 0;

      // Draw incoming:
      // - CDS route: incoming is Rolling HTC OK pieces
      // - ALLOY_CDS: incoming is Hollow HT Net Output pieces
      const drawIncomingPcs = isAlloy ? hollowHtNetPcs : rollHtcOkPcs;
      let drawAvailPcs = isCds
        ? Math.max(0, drawIncomingPcs + drawDivInPcs - drawOutPcs - drawRejPcs - drawDivOutPcs)
        : 0;
      const effDrawLen = effMhAvg > 0 ? effMhAvg : (mhAvgLength > 0 ? mhAvgLength : avgLength);
      let drawAvailMtr = effDrawLen > 0 ? Number((drawAvailPcs * effDrawLen).toFixed(3)) : 0;
      let drawAvailMt = mtFromMtr(drawAvailMtr, mhOd > 0 ? mhOd : Number(wo.size_od || 0), mhWt > 0 ? mhWt : Number(wo.size_wt || 0));

      // 4. Heat Treatment Stage Metrics (adjusted for HT Diversions & Downstream Consumption)
      const htLogs = getStageLogs(woId, htStageId);
      const htOutPcs = sumPcs(htLogs, avgLength);
      const htRejPcs = sumRejPcs(htLogs, avgLength);
      const htNetPcs = Math.max(0, htOutPcs - htRejPcs);
      const rawHtOut = sumQty(htLogs, "output_qty");
      const rawHtRej = sumQty(htLogs, "rejection_qty");
      const htOutMtr = rawHtOut > 0 ? rawHtOut : (avgLength > 0 ? Number((htOutPcs * avgLength).toFixed(3)) : 0);
      const htRejMtr = rawHtRej > 0 ? rawHtRej : (avgLength > 0 ? Number((htRejPcs * avgLength).toFixed(3)) : 0);
      const htNetMtr = Math.max(0, htOutMtr - htRejMtr);

      const htDivIn = getStageDivIn(woId, "HEAT_TREATMENT");
      const htDivOut = getStageDivOut(woId, "HEAT_TREATMENT");
      const htDivInPcs = avgLength > 0 ? Math.round(htDivIn / avgLength) : 0;
      const htDivOutPcs = avgLength > 0 ? Math.round(htDivOut / avgLength) : 0;

      // Check QC Inspections for this WO (or related campaign)
      let woQcList = qcInspections.filter((q: any) => q.work_order_id === woId);
      if (campaign && Array.isArray(campaign.child_work_orders)) {
        const childWoIds = new Set(campaign.child_work_orders.map((c: any) => c.work_order_id || c.id));
        const campaignQcList = qcInspections.filter((q: any) => q.work_order_id === woId || childWoIds.has(q.work_order_id));
        if (campaignQcList.length > 0) {
          woQcList = campaignQcList;
        }
      }
      const qcOkPcs = woQcList.reduce((sum: number, q: any) => sum + Number(q.vdi_ok_pcs || 0), 0);
      const qcSalvagePcs = woQcList.reduce((sum: number, q: any) => sum + Number(q.vdi_salvage_pcs || 0), 0);
      const qcRejPcs = woQcList.reduce((sum: number, q: any) => sum + Number(q.vdi_rejection_pcs || 0), 0);
      const qcInspectedPcs = woQcList.reduce(
        (sum: number, q: any) =>
          sum + Number(q.inspected_pcs || Number(q.vdi_ok_pcs || 0) + Number(q.vdi_salvage_pcs || 0) + Number(q.vdi_rejection_pcs || 0)),
        0
      );

      const qcInspectedMtr = avgLength > 0 ? Number((qcInspectedPcs * avgLength).toFixed(3)) : 0;
      const qcOkMtr = avgLength > 0 ? Number((qcOkPcs * avgLength).toFixed(3)) : 0;
      const qcSalvageMtr = avgLength > 0 ? Number((qcSalvagePcs * avgLength).toFixed(3)) : 0;
      const qcRejMtr = avgLength > 0 ? Number((qcRejPcs * avgLength).toFixed(3)) : 0;

      // 4.5 Band Saw Stage Metrics (between HT / Hollow HT / Rolling and VDI)
      const bandSawLogs = getStageLogs(woId, bandSawStageId);
      const bandSawOutPcs = sumPcs(bandSawLogs, avgLength);
      const bandSawRejPcs = sumRejPcs(bandSawLogs, avgLength);
      const bandSawNetPcs = Math.max(0, bandSawOutPcs - bandSawRejPcs);
      const bandSawOutMtr = avgLength > 0 ? Number((bandSawOutPcs * avgLength).toFixed(3)) : sumQty(bandSawLogs, "output_qty");
      const bandSawRejMtr = avgLength > 0 ? Number((bandSawRejPcs * avgLength).toFixed(3)) : sumQty(bandSawLogs, "rejection_qty");
      const bandSawNetMtr = avgLength > 0 ? Number((bandSawNetPcs * avgLength).toFixed(3)) : Math.max(0, bandSawOutMtr - bandSawRejMtr);

      const bandSawDivIn = getStageDivIn(woId, "BAND_SAW");
      const bandSawDivOut = getStageDivOut(woId, "BAND_SAW");
      const bandSawDivInPcs = avgLength > 0 ? Math.round(bandSawDivIn / avgLength) : 0;
      const bandSawDivOutPcs = avgLength > 0 ? Math.round(bandSawDivOut / avgLength) : 0;

      // 5. Finishing Stage Metrics (adjusted for Finishing Diversions)
      const finLogs = getStageLogs(woId, finStageId);
      let finOutPcs = sumPcs(finLogs, avgLength);
      let finRejPcs = sumRejPcs(finLogs, avgLength);

      // If this is a master campaign with child orders, also include child finishing production in consumed stock
      if (campaign && Array.isArray(campaign.child_work_orders)) {
        for (const child of campaign.child_work_orders) {
          const cId = child.work_order_id || child.id;
          const childFinLogs = getStageLogs(cId, finStageId);
          const childWo = woMap.get(cId);
          const childL1 = Number(child.l1 || childWo?.l1 || 0);
          const childL2 = Number(child.l2 || childWo?.l2 || 0);
          const childAvg = childL1 > 0 && childL2 > 0 ? (childL1 + childL2) / 2 : childL1 || avgLength;

          finOutPcs += sumPcs(childFinLogs, childAvg);
          finRejPcs += sumRejPcs(childFinLogs, childAvg);
        }
      }
      const finNetPcs = Math.max(0, finOutPcs - finRejPcs);
      const finOutMtr = avgLength > 0 ? Number((finOutPcs * avgLength).toFixed(3)) : 0;
      const finRejMtr = avgLength > 0 ? Number((finRejPcs * avgLength).toFixed(3)) : 0;
      const finNetMtr = avgLength > 0 ? Number((finNetPcs * avgLength).toFixed(3)) : 0;

      // Heat treatment incoming: strictly from Draw net output pieces minus downstream processed
      const htPassedPcs = Math.max(htOutPcs + htRejPcs, bandSawOutPcs + bandSawRejPcs, qcInspectedPcs, finOutPcs + finRejPcs);
      const htAvailPcs = isCds
        ? Math.max(0, drawNetPcs + htDivInPcs - htPassedPcs - htDivOutPcs)
        : 0;
      const htAvailMtr = avgLength > 0 ? Number((htAvailPcs * avgLength).toFixed(3)) : 0;
      const htAvailMt = mtFromMtr(htAvailMtr, Number(wo.size_od || 0), Number(wo.size_wt || 0));

      // Apply downstream consumption to Draw availability
      const downstreamDrawPassed = Math.max(drawOutPcs + drawRejPcs, htPassedPcs);
      if (isCds) {
        drawAvailPcs = Math.max(0, drawIncomingPcs + drawDivInPcs - downstreamDrawPassed - drawDivOutPcs);
        drawAvailMtr = effDrawLen > 0 ? Number((drawAvailPcs * effDrawLen).toFixed(3)) : 0;
        drawAvailMt = mtFromMtr(drawAvailMtr, mhOd > 0 ? mhOd : Number(wo.size_od || 0), mhWt > 0 ? mhWt : Number(wo.size_wt || 0));
      }

      const bandSawIncomingPcs = !isCds
        ? (isAlloy ? hollowHtNetPcs : rollHtcOkPcs)
        : htNetPcs;

      // Deduct whichever is greater: explicit Band Saw cuts, downstream VDI inspected pieces, or downstream Finishing
      const bandSawPassedPcs = Math.max(bandSawOutPcs + bandSawRejPcs, qcInspectedPcs, finOutPcs + finRejPcs);
      const bandSawAvailPcs = Math.max(0, bandSawIncomingPcs + bandSawDivInPcs - bandSawPassedPcs - bandSawDivOutPcs);
      const bandSawAvailMtr = avgLength > 0 ? Number((bandSawAvailPcs * avgLength).toFixed(3)) : 0;
      const bandSawAvailMt = mtFromMtr(bandSawAvailMtr, Number(wo.size_od || 0), Number(wo.size_wt || 0));


      // VDI Stage WIP (Waiting for QC Inspection)
      const vdiDivIn = getStageDivIn(woId, "VDI");
      const vdiDivOut = getStageDivOut(woId, "VDI");
      const vdiDivInPcs = avgLength > 0 ? Math.round(vdiDivIn / avgLength) : 0;
      const vdiDivOutPcs = avgLength > 0 ? Math.round(vdiDivOut / avgLength) : 0;

      // VDI incoming: strictly from Band Saw Net Output Pieces (or feeder stage if no band saw logged yet for legacy data)
      const vdiIncomingPcs = bandSawLogs.length > 0
        ? bandSawNetPcs
        : (qcInspectedPcs > 0 ? qcInspectedPcs : (!isCds ? (isAlloy ? hollowHtNetPcs : rollHtcOkPcs) : htNetPcs));

      const vdiAvailPcs = Math.max(0, vdiIncomingPcs + vdiDivInPcs - qcInspectedPcs - vdiDivOutPcs);
      const vdiAvailMtr = avgLength > 0
        ? (vdiAvailPcs > 0 ? Number((vdiAvailPcs * avgLength).toFixed(3)) : 0)
        : 0;
      const vdiAvailMt = mtFromMtr(vdiAvailMtr, Number(wo.size_od || 0), Number(wo.size_wt || 0));

      const finDivIn = getStageDivIn(woId, "FINISHING");
      const finDivOut = getStageDivOut(woId, "FINISHING");

      let finIncomingPcs = 0;
      if (woQcList.length > 0) {
        finIncomingPcs = Math.round(qcOkPcs);
      } else {
        finIncomingPcs = 0;
      }

      const finDivInPcs = avgLength > 0 ? Math.round(finDivIn / avgLength) : 0;
      const finDivOutPcs = avgLength > 0 ? Math.round(finDivOut / avgLength) : 0;

      const finAvailPcs = Math.max(0, finIncomingPcs + finDivInPcs - finOutPcs - finRejPcs - finDivOutPcs);
      const finAvailMtr = avgLength > 0 ? Number((finAvailPcs * avgLength).toFixed(3)) : 0;
      const finAvailMt = mtFromMtr(finAvailMtr, Number(wo.size_od || 0), Number(wo.size_wt || 0));

      // Build WorkCenterWipInfo pipeline for this order
      const pipeline: WorkCenterWipInfo[] = [
        {
          stage_code: "ROLLING",
          stage_name: "Rolling",
          sequence_no: 1,
          available_mtr: isRollingPlanIssued ? rollAvailMtr : 0,
          available_pcs: isRollingPlanIssued ? rollAvailPcs : 0,
          available_mt: isRollingPlanIssued ? rollAvailMt : 0,
          gross_output_mtr: rollOutMtr,
          gross_output_pcs: rollGrossPcs,
          gross_output_mt: mtFromMtr(rollOutMtr, mhOd, mhWt),
          rejection_mtr: rollRejMtr,
          rejection_pcs: rollRejPcs,
          rejection_mt: mtFromMtr(rollRejMtr, mhOd, mhWt),
          net_output_mtr: rollNetMtr,
          net_output_pcs: rollNetPcs,
          net_output_mt: mtFromMtr(rollNetMtr, mhOd, mhWt),
          htc_ok_mtr: rollHtcOkMtr,
          htc_ok_pcs: rollHtcOkPcs,
          htc_ok_mt: mtFromMtr(rollHtcOkMtr, mhOd, mhWt),
        },
      ];

      if (isAlloy) {
        pipeline.push({
          stage_code: "HOLLOW_HEAT_TREATMENT",
          stage_name: "Hollow Heat Treatment",
          sequence_no: 2,
          available_mtr: hollowHtAvailMtr,
          available_pcs: hollowHtAvailPcs,
          available_mt: hollowHtAvailMt,
          gross_output_mtr: hollowHtOutMtr,
          gross_output_pcs: hollowHtOutPcs,
          gross_output_mt: mtFromMtr(hollowHtOutMtr, hollowHtEffOd, hollowHtEffWt),
          rejection_mtr: hollowHtRejMtr,
          rejection_pcs: hollowHtRejPcs,
          rejection_mt: mtFromMtr(hollowHtRejMtr, hollowHtEffOd, hollowHtEffWt),
          net_output_mtr: hollowHtNetMtr,
          net_output_pcs: hollowHtNetPcs,
          net_output_mt: mtFromMtr(hollowHtNetMtr, hollowHtEffOd, hollowHtEffWt),
        });
      }

      if (isCds) {
        pipeline.push({
          stage_code: "DRAW",
          stage_name: "Draw Bench",
          sequence_no: isAlloy ? 3 : 2,
          available_mtr: drawAvailMtr,
          available_pcs: drawAvailPcs,
          available_mt: drawAvailMt,
          gross_output_mtr: drawOutMtr,
          gross_output_pcs: drawOutPcs,
          gross_output_mt: mtFromMtr(drawOutMtr, Number(wo.size_od || 0), Number(wo.size_wt || 0)),
          rejection_mtr: drawRejMtr,
          rejection_pcs: drawRejPcs,
          rejection_mt: mtFromMtr(drawRejMtr, Number(wo.size_od || 0), Number(wo.size_wt || 0)),
          net_output_mtr: drawNetMtr,
          net_output_pcs: drawNetPcs,
          net_output_mt: mtFromMtr(drawNetMtr, Number(wo.size_od || 0), Number(wo.size_wt || 0)),
        });

        pipeline.push({
          stage_code: "HEAT_TREATMENT",
          stage_name: "Heat Treatment",
          sequence_no: isAlloy ? 4 : 3,
          available_mtr: htAvailMtr,
          available_pcs: htAvailPcs,
          available_mt: htAvailMt,
          gross_output_mtr: htOutMtr,
          gross_output_pcs: htOutPcs,
          gross_output_mt: mtFromMtr(htOutMtr, Number(wo.size_od || 0), Number(wo.size_wt || 0)),
          rejection_mtr: htRejMtr,
          rejection_pcs: htRejPcs,
          rejection_mt: mtFromMtr(htRejMtr, Number(wo.size_od || 0), Number(wo.size_wt || 0)),
          net_output_mtr: htNetMtr,
          net_output_pcs: htNetPcs,
          net_output_mt: mtFromMtr(htNetMtr, Number(wo.size_od || 0), Number(wo.size_wt || 0)),
        });
      }

      pipeline.push({
        stage_code: "BAND_SAW",
        stage_name: "Band Saw",
        sequence_no: pipeline.length + 1,
        available_mtr: bandSawAvailMtr,
        available_pcs: bandSawAvailPcs,
        available_mt: bandSawAvailMt,
        gross_output_mtr: bandSawOutMtr,
        gross_output_pcs: bandSawOutPcs,
        gross_output_mt: mtFromMtr(bandSawOutMtr, Number(wo.size_od || 0), Number(wo.size_wt || 0)),
        rejection_mtr: bandSawRejMtr,
        rejection_pcs: bandSawRejPcs,
        rejection_mt: mtFromMtr(bandSawRejMtr, Number(wo.size_od || 0), Number(wo.size_wt || 0)),
        net_output_mtr: bandSawNetMtr,
        net_output_pcs: bandSawNetPcs,
        net_output_mt: mtFromMtr(bandSawNetMtr, Number(wo.size_od || 0), Number(wo.size_wt || 0)),
      });

      pipeline.push({
        stage_code: "VDI",
        stage_name: "Visual Dimension Inspection",
        sequence_no: pipeline.length + 1,
        available_mtr: vdiAvailMtr,
        available_pcs: vdiAvailPcs,
        available_mt: vdiAvailMt,
        gross_output_mtr: qcInspectedMtr,
        gross_output_pcs: qcInspectedPcs,
        gross_output_mt: mtFromMtr(qcInspectedMtr, Number(wo.size_od || 0), Number(wo.size_wt || 0)),
        rejection_mtr: qcRejMtr + qcSalvageMtr,
        rejection_pcs: qcRejPcs + qcSalvagePcs,
        rejection_mt: mtFromMtr(qcRejMtr + qcSalvageMtr, Number(wo.size_od || 0), Number(wo.size_wt || 0)),
        net_output_mtr: qcOkMtr,
        net_output_pcs: qcOkPcs,
        net_output_mt: mtFromMtr(qcOkMtr, Number(wo.size_od || 0), Number(wo.size_wt || 0)),
      });

      pipeline.push({
        stage_code: "FINISHING",
        stage_name: "Finishing",
        sequence_no: pipeline.length + 1,
        available_mtr: finAvailMtr,
        available_pcs: finAvailPcs,
        available_mt: finAvailMt,
        gross_output_mtr: finOutMtr,
        gross_output_pcs: finOutPcs,
        gross_output_mt: mtFromMtr(finOutMtr, Number(wo.size_od || 0), Number(wo.size_wt || 0)),
        rejection_mtr: finRejMtr,
        rejection_pcs: finRejPcs,
        rejection_mt: mtFromMtr(finRejMtr, Number(wo.size_od || 0), Number(wo.size_wt || 0)),
        net_output_mtr: finNetMtr,
        net_output_pcs: finNetPcs,
        net_output_mt: mtFromMtr(finNetMtr, Number(wo.size_od || 0), Number(wo.size_wt || 0)),
      });

      // Update workCenterSummary for all stages
      // (Universal Rule: Work orders with zero or sub-single balance < 1 Pc and < 1.0 Mtr must not appear in queues)
      if (isRollingPlanIssued && (rollAvailMtr >= 1.0 || rollAvailPcs >= 1)) {
        workCenterSummary.ROLLING.availMtr += rollAvailMtr;
        workCenterSummary.ROLLING.availPcs += rollAvailPcs;
        workCenterSummary.ROLLING.availMt += rollAvailMt;
        workCenterSummary.ROLLING.count += 1;
      }
      if (isAlloy && (hollowHtAvailMtr >= 1.0 || hollowHtAvailPcs >= 1)) {
        workCenterSummary.HOLLOW_HEAT_TREATMENT.availMtr += hollowHtAvailMtr;
        workCenterSummary.HOLLOW_HEAT_TREATMENT.availPcs += hollowHtAvailPcs;
        workCenterSummary.HOLLOW_HEAT_TREATMENT.availMt += hollowHtAvailMt;
        workCenterSummary.HOLLOW_HEAT_TREATMENT.count += 1;
      }
      if (isCds && (drawAvailMtr >= 1.0 || drawAvailPcs >= 1)) {
        workCenterSummary.DRAW.availMtr += drawAvailMtr;
        workCenterSummary.DRAW.availPcs += drawAvailPcs;
        workCenterSummary.DRAW.availMt += drawAvailMt;
        workCenterSummary.DRAW.count += 1;
      }
      if (isCds && (htAvailMtr >= 1.0 || htAvailPcs >= 1)) {
        workCenterSummary.HEAT_TREATMENT.availMtr += htAvailMtr;
        workCenterSummary.HEAT_TREATMENT.availPcs += htAvailPcs;
        workCenterSummary.HEAT_TREATMENT.availMt += htAvailMt;
        workCenterSummary.HEAT_TREATMENT.count += 1;
      }
      if (bandSawAvailMtr >= 1.0 || bandSawAvailPcs >= 1) {
        workCenterSummary.BAND_SAW.availMtr += bandSawAvailMtr;
        workCenterSummary.BAND_SAW.availPcs += bandSawAvailPcs;
        workCenterSummary.BAND_SAW.availMt += bandSawAvailMt;
        workCenterSummary.BAND_SAW.count += 1;
      }
      if (vdiAvailMtr >= 1.0 || vdiAvailPcs >= 1) {
        workCenterSummary.VDI.availMtr += vdiAvailMtr;
        workCenterSummary.VDI.availPcs += vdiAvailPcs;
        workCenterSummary.VDI.availMt += vdiAvailMt;
        workCenterSummary.VDI.count += 1;
      }
      if (finAvailMtr >= 1.0 || finAvailPcs >= 1) {
        workCenterSummary.FINISHING.availMtr += finAvailMtr;
        workCenterSummary.FINISHING.availPcs += finAvailPcs;
        workCenterSummary.FINISHING.availMt += finAvailMt;
        workCenterSummary.FINISHING.count += 1;
      }

      // Total Order and Order Balance metrics
      const woOd = Number(wo.size_od || 0);
      const woWt = Number(wo.size_wt || 0);
      const totalOrderMtr = Number(wo.ordered_qty_mtr || wo.ordered_qty || 0);
      const totalOrderPcs = Number(wo.ordered_qty_pcs) > 0
        ? Number(wo.ordered_qty_pcs)
        : (avgLength > 0 ? Math.round(totalOrderMtr / avgLength) : 0);
      const totalOrderMt = Number(wo.ordered_qty_mt) > 0
        ? Number(wo.ordered_qty_mt)
        : mtFromMtr(totalOrderMtr, woOd, woWt);

      const woFinLogs = getStageLogs(wo.id, finStageId);
      const woFinishedMtr = sumQty(woFinLogs, "output_qty");
      const woFinishedPcs = avgLength > 0 ? Math.round(woFinishedMtr / avgLength) : 0;

      const balanceToMakeOrderMtr = Math.max(0, totalOrderMtr - woFinishedMtr);
      const balanceToMakeOrderPcs = avgLength > 0 ? Math.round(balanceToMakeOrderMtr / avgLength) : 0;
      const balanceToMakeOrderMt = mtFromMtr(balanceToMakeOrderMtr, woOd, woWt);

      const orderCappingMtr = Number((totalOrderMtr * 1.10).toFixed(2));
      const orderCappingPcs = avgLength > 0 ? Math.round(orderCappingMtr / avgLength) : 0;

      // Pre-build Row objects for this work order for all 6 stages
      const baseRowData = {
        work_order_id: wo.id,
        work_order_no: wo.work_order_no,
        customer_name: wo.customer_name || null,
        specification: wo.grade || null,
        od: woOd,
        wl: woWt,
        l1,
        l2,
        avg_length: avgLength,
        total_order_pcs: totalOrderPcs,
        total_order_mtr: totalOrderMtr,
        total_order_mt: totalOrderMt,
        balance_to_make_order_pcs: balanceToMakeOrderPcs,
        balance_to_make_order_mtr: balanceToMakeOrderMtr,
        balance_to_make_order_mt: balanceToMakeOrderMt,
        finished_output_mtr: woFinishedMtr,
        finished_output_pcs: woFinishedPcs,
        order_capping_mtr: orderCappingMtr,
        order_capping_pcs: orderCappingPcs,
        mh_od: mhOd,
        mh_wt: mhWt,
        mh_l1: mhL1,
        mh_l2: mhL2,
        mh_avg_length: mhAvgLength,
        route_id: routeId,
        route_code: routeCode,
        route_name: routeName,
        multiple,
        ht_nos: null,
        is_master: !!campaign,
        master_plan_no: campaign?.plan_no || planInfo?.plan_no || plan?.plan_no,
        plan_no: campaign?.plan_no || planInfo?.plan_no || plan?.plan_no,
        plan_id: campaign?.plan_id || planInfo?.id || plan?.id,
        lifecycle_status: campaign?.lifecycle_status || planInfo?.lifecycle_status || (plan ? "DRAFT" : undefined),
        revision_no: campaign?.revision_no ?? planInfo?.revision_no ?? 0,
        campaign_total_mtr: totalCampaignMtr,
        campaign_total_pcs: totalCampaignPcs,
        child_work_orders: campaign?.child_work_orders,
        work_centers_wip: pipeline,
        pcs: "",
        mtr: "",
        rejection_pcs: "",
        rejection_mtr: "",
        htc_ok_pcs: "",
        htc_ok_mtr: "",
        heat_lot_no: "",
        remarks: "",
        ht_input_nos: "",
      };

      const queueRows: Record<StageCode, Row | null> = {
        ROLLING:
          isRollingPlanIssued && (rollAvailMtr >= 1.0 || rollAvailPcs >= 1)
            ? {
                ...baseRowData,
                od: mhOd > 0 ? mhOd : woOd,
                wl: mhWt > 0 ? mhWt : woWt,
                avg_length: effMhAvg > 0 ? effMhAvg : avgLength,
                stage_code: "ROLLING",
                balance_to_make_mtr: rollAvailMtr,
                balance_to_make_pcs: rollAvailPcs,
                balance_to_make_mt: rollAvailMt,
                planned_rolling_total: totalCampaignMtr,
                max_allowed_mtr: Number((totalCampaignMtr * 1.10).toFixed(2)),
                max_allowed_pcs: Math.round(totalCampaignPcs * 1.10),
                prev_gross_output: rollOutMtr + rollRejMtr,
                feeder_source_label: "Active Rolling Plan",
                feeder_stage_code: "ROLLING_PLAN",
              }
            : null,
        HOLLOW_HEAT_TREATMENT:
          isAlloy && (hollowHtAvailMtr >= 1.0 || hollowHtAvailPcs >= 1)
            ? {
                ...baseRowData,
                od: mhOd > 0 ? mhOd : woOd,
                wl: mhWt > 0 ? mhWt : woWt,
                avg_length: effHhtAvg > 0 ? effHhtAvg : avgLength,
                stage_code: "HOLLOW_HEAT_TREATMENT",
                balance_to_make_mtr: hollowHtAvailMtr,
                balance_to_make_pcs: hollowHtAvailPcs,
                balance_to_make_mt: hollowHtAvailMt,
                max_allowed_mtr: hollowHtAvailMtr,
                max_allowed_pcs: hollowHtAvailPcs,
                prev_stage_code: "ROLLING",
                prev_htc_ok: rollHtcOkMtr,
                feeder_source_label: "Rolling HTC OK",
                feeder_stage_code: "ROLLING",
              }
            : null,
        DRAW:
          isCds && (drawAvailMtr >= 1.0 || drawAvailPcs >= 1)
            ? {
                ...baseRowData,
                od: mhOd > 0 ? mhOd : woOd,
                wl: mhWt > 0 ? mhWt : woWt,
                avg_length: effDrawLen > 0 ? effDrawLen : avgLength,
                stage_code: "DRAW",
                balance_to_make_mtr: drawAvailMtr,
                balance_to_make_pcs: drawAvailPcs,
                balance_to_make_mt: drawAvailMt,
                max_allowed_mtr: drawAvailMtr,
                max_allowed_pcs: drawAvailPcs,
                prev_stage_code: isAlloy ? "HOLLOW_HEAT_TREATMENT" : "ROLLING",
                prev_htc_ok: isAlloy ? undefined : rollHtcOkMtr,
                prev_net_output: isAlloy ? hollowHtNetMtr : undefined,
                feeder_source_label: isAlloy ? "Hollow HT Net OK" : "Rolling HTC OK",
                feeder_stage_code: isAlloy ? "HOLLOW_HEAT_TREATMENT" : "ROLLING",
              }
            : null,
        HEAT_TREATMENT:
          isCds && (htAvailMtr >= 1.0 || htAvailPcs >= 1)
            ? {
                ...baseRowData,
                stage_code: "HEAT_TREATMENT",
                balance_to_make_mtr: htAvailMtr,
                balance_to_make_pcs: htAvailPcs,
                balance_to_make_mt: htAvailMt,
                max_allowed_mtr: htAvailMtr,
                max_allowed_pcs: htAvailPcs,
                prev_stage_code: "DRAW",
                prev_net_output: drawNetMtr,
                feeder_source_label: "Draw Bench Net OK",
                feeder_stage_code: "DRAW",
              }
            : null,
        BAND_SAW:
          (bandSawAvailMtr >= 1.0 || bandSawAvailPcs >= 1)
            ? {
                ...baseRowData,
                stage_code: "BAND_SAW",
                balance_to_make_mtr: bandSawAvailMtr,
                balance_to_make_pcs: bandSawAvailPcs,
                balance_to_make_mt: bandSawAvailMt,
                max_allowed_mtr: bandSawAvailMtr,
                max_allowed_pcs: bandSawAvailPcs,
                prev_stage_code: isCds ? "HEAT_TREATMENT" : (isAlloy ? "HOLLOW_HEAT_TREATMENT" : "ROLLING"),
                prev_htc_ok: !isCds && !isAlloy ? rollHtcOkMtr : undefined,
                prev_net_output: isCds ? htNetMtr : (isAlloy ? hollowHtNetMtr : undefined),
                feeder_source_label: isCds ? "Heat Treatment Net OK" : (isAlloy ? "Hollow HT Net OK" : "Rolling HTC OK"),
                feeder_stage_code: isCds ? "HEAT_TREATMENT" : (isAlloy ? "HOLLOW_HEAT_TREATMENT" : "ROLLING"),
              }
            : null,
        VDI:
          (vdiAvailMtr >= 1.0 || vdiAvailPcs >= 1)
            ? {
                ...baseRowData,
                stage_code: "VDI",
                balance_to_make_mtr: vdiAvailMtr,
                balance_to_make_pcs: vdiAvailPcs,
                balance_to_make_mt: vdiAvailMt,
                max_allowed_mtr: vdiAvailMtr,
                max_allowed_pcs: vdiAvailPcs,
                prev_stage_code: bandSawLogs.length > 0 ? "BAND_SAW" : (!isCds ? (isAlloy ? "HOLLOW_HEAT_TREATMENT" : "ROLLING") : "HEAT_TREATMENT"),
                prev_htc_ok: bandSawLogs.length === 0 && !isCds && !isAlloy ? rollHtcOkMtr : undefined,
                prev_net_output: bandSawLogs.length > 0 ? bandSawNetMtr : (!isCds ? (isAlloy ? hollowHtNetMtr : undefined) : htNetPcs),
                feeder_source_label: bandSawLogs.length > 0 ? "Band Saw Net OK" : (!isCds ? (isAlloy ? "Hollow HT Net OK" : "Rolling HTC OK") : "Heat Treatment Net OK"),
                feeder_stage_code: bandSawLogs.length > 0 ? "BAND_SAW" : (!isCds ? (isAlloy ? "HOLLOW_HEAT_TREATMENT" : "ROLLING") : "HEAT_TREATMENT"),
              }
            : null,
        FINISHING:
          (finAvailMtr >= 1.0 || finAvailPcs >= 1)
            ? {
                ...baseRowData,
                stage_code: "FINISHING",
                balance_to_make_mtr: finAvailMtr,
                balance_to_make_pcs: finAvailPcs,
                balance_to_make_mt: finAvailMt,
                max_allowed_mtr: Math.min(finAvailMtr, Math.max(0, orderCappingMtr - woFinishedMtr)),
                max_allowed_pcs: avgLength > 0 ? Math.round(Math.min(finAvailMtr, Math.max(0, orderCappingMtr - woFinishedMtr)) / avgLength) : finAvailPcs,
                prev_stage_code: "VDI",
                prev_net_output: qcOkMtr,
                feeder_source_label: "VDI QC Passed",
                feeder_stage_code: "VDI",
              }
            : null,
      };

      allCalculatedRows.set(woId, { queueRows, pipeline });

      // Generate individual plan rows for ROLLING stage queue
      const woPlans = plans
        .filter((p) => p.work_order_id === woId)
        .sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());

      if (woPlans.length > 0) {
        // Pre-assign all rollLogs for this work order to their specific plan chronologically
        const planLogMap = new Map<string, any[]>();
        woPlans.forEach((pl) => planLogMap.set(pl.id, []));

        const sortedPlans = [...woPlans].sort(
          (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
        );

        // Pre-calculate target planned quantity for each plan
        const planTargetMtr = new Map<string, number>();
        const planAccumulatedMtr = new Map<string, number>();
        sortedPlans.forEach((pl) => {
          let tMtr = Number(pl.planned_qty || 0);
          try {
            const st = typeof pl.status === "string" ? JSON.parse(pl.status) : pl.status || {};
            tMtr = Number(st.master_planned_mtr || st.planned_mtr || pl.planned_qty || 0);
          } catch {}
          planTargetMtr.set(pl.id, tMtr);
          planAccumulatedMtr.set(pl.id, 0);
        });

        // First, assign logs that have an explicit rolling_plan_id
        const unassignedLogs: any[] = [];
        for (const log of rollLogs) {
          if (log.rolling_plan_id && planLogMap.has(log.rolling_plan_id)) {
            planLogMap.get(log.rolling_plan_id)!.push(log);
            const mtr = Number(log.output_qty || 0) + Number(log.rejection_qty || 0);
            planAccumulatedMtr.set(log.rolling_plan_id, (planAccumulatedMtr.get(log.rolling_plan_id) || 0) + mtr);
          } else {
            unassignedLogs.push(log);
          }
        }

        // Second, assign unassigned logs FIFO across sortedPlans
        if (unassignedLogs.length > 0) {
          if (sortedPlans.length === 1) {
            planLogMap.get(sortedPlans[0].id)!.push(...unassignedLogs);
          } else {
            // Sort unassigned logs chronologically by process_date or created_at
            unassignedLogs.sort((a, b) => {
              const ta = new Date(a.process_date || a.created_at || 0).getTime();
              const tb = new Date(b.process_date || b.created_at || 0).getTime();
              return ta - tb;
            });

            let currentPlanIdx = 0;
            for (const log of unassignedLogs) {
              const logMtr = Number(log.output_qty || 0) + Number(log.rejection_qty || 0);

              // Advance to next plan if current plan is already filled to its target planned quantity
              while (currentPlanIdx < sortedPlans.length - 1) {
                const currPlanId = sortedPlans[currentPlanIdx].id;
                const target = planTargetMtr.get(currPlanId) || 0;
                const accumulated = planAccumulatedMtr.get(currPlanId) || 0;
                if (target > 0 && accumulated >= target) {
                  currentPlanIdx++;
                } else {
                  break;
                }
              }

              const matchedPlan = sortedPlans[currentPlanIdx];
              planLogMap.get(matchedPlan.id)!.push(log);
              planAccumulatedMtr.set(matchedPlan.id, (planAccumulatedMtr.get(matchedPlan.id) || 0) + logMtr);
            }
          }
        }

        for (const pl of woPlans) {
          try {
            const plParsed = typeof pl.status === "string" ? JSON.parse(pl.status) : pl.status || {};
            // RULE 2: Child plans are NOT separate rolling plans on the Hot Rolling floor.
            // Hot Rolling executes only the Master / Released PPC Rolling Plan!
            if (plParsed?.is_child) continue;

            const plLifecycle = plParsed?.lifecycle_status || (plParsed?.issued_at ? "ISSUED" : "DRAFT");
            const plIsIssued = (plLifecycle === "ISSUED" || plLifecycle === "REVISED") && plLifecycle !== "CLOSED" && plLifecycle !== "SHORT_CLOSED";
            if (!plIsIssued) continue;

            const plMhOd = Number(pl.mh_od || plParsed?.mh_od || plParsed?.cust_od || plParsed?.sm?.cust_od || plParsed?.sizing_mill?.cust_od || mhOd);
            const plMhWt = Number(pl.mh_wt || plParsed?.mh_wt || plParsed?.cust_wt || plParsed?.sm?.rolling_wt || plParsed?.sm?.cust_wt || plParsed?.sizing_mill?.rolling_wt || mhWt);
            const plMhL1 = Number(pl.mh_l1 || plParsed?.mh_l1 || plParsed?.sm?.sm_len || mhL1);
            const plMhL2 = Number(pl.mh_l2 || plParsed?.mh_l2 || plParsed?.sm?.sm_len || mhL2);
            const plMhAvg = plMhL1 > 0 && plMhL2 > 0 ? (plMhL1 + plMhL2) / 2 : plMhL1 || mhAvgLength;

            const isPlMaster = Boolean(plParsed?.is_master && Array.isArray(plParsed?.child_work_orders));

            let plPlannedMtr = Number(
              pl.planned_qty ||
              plParsed?.master_planned_mtr ||
              plParsed?.planned_mtr ||
              plParsed?.rolling_mtr ||
              0
            );

            let plPlannedPcs = Number(
              plParsed?.master_planned_pcs ||
              plParsed?.planned_pcs ||
              0
            );

            if (plPlannedPcs <= 0 && plMhAvg > 0 && plPlannedMtr > 0) {
              plPlannedPcs = Math.round(plPlannedMtr / plMhAvg);
            }

            let plEnrichedChildren: any[] | undefined = undefined;

            if (isPlMaster) {
              plEnrichedChildren = (plParsed.child_work_orders || []).map((child: any) => {
                const cId = child.work_order_id || child.id;
                const cWo = woMap.get(cId);
                const cL1 = Number(child.l1 || cWo?.l1 || 6);
                const cL2 = Number(child.l2 || cWo?.l2 || 6.5);
                const cAvg = cL1 > 0 && cL2 > 0 ? (cL1 + cL2) / 2 : cL1 || 6.25;
                const cOd = Number(child.size_od || cWo?.size_od || 0);
                const cWt = Number(child.size_wt || cWo?.size_wt || 0);
                const cTotalMtr = Number(child.planned_mtr || cWo?.ordered_qty_mtr || cWo?.ordered_qty || 0);
                const cTotalPcs = Number(child.planned_pcs || cWo?.ordered_qty_pcs || 0) || (cAvg > 0 ? Math.round(cTotalMtr / cAvg) : 0);
                return {
                  ...child,
                  work_order_id: cId,
                  id: cId,
                  work_order_no: child.work_order_no || cWo?.work_order_no || "Child Order",
                  customer_name: child.customer_name || cWo?.customer_name || null,
                  grade: child.grade || cWo?.grade || null,
                  size_od: cOd,
                  size_wt: cWt,
                  l1: cL1,
                  l2: cL2,
                  total_order_pcs: cTotalPcs,
                  total_order_mtr: cTotalMtr,
                  total_order_mt: Number(child.planned_mt || cWo?.ordered_qty_mt || 0) || mtFromMtr(cTotalMtr, cOd, cWt),
                };
              });
            }

            const effPlMhAvg = plPlannedPcs > 0 && plPlannedMtr > 0 ? plPlannedMtr / plPlannedPcs : plMhAvg;

            const directPlLogs = planLogMap.get(pl.id) || [];
            let directLoggedPcs = 0;
            let directRejPcs = 0;
            let directLoggedMtr = 0;

            for (const l of directPlLogs) {
              const lPcs = getLogPcs(l, effPlMhAvg);
              const lRej = getLogRejPcs(l, effPlMhAvg);
              directLoggedPcs += lPcs;
              directRejPcs += lRej;
              directLoggedMtr += Number(l.output_qty || 0) + Number(l.rejection_qty || 0);
            }

            const plLoggedTotalPcs = directLoggedPcs + directRejPcs;

            const plAvailPcs = plPlannedPcs > 0
              ? Math.max(0, plPlannedPcs - plLoggedTotalPcs)
              : (effPlMhAvg > 0 ? Math.max(0, Math.round((plPlannedMtr - directLoggedMtr) / effPlMhAvg)) : 0);

            const plAvailMtr = plPlannedPcs > 0 && effPlMhAvg > 0
              ? Number((plAvailPcs * (plMhL1 && plMhL2 ? (plMhL1 + plMhL2) / 2 : (plMhL1 || effPlMhAvg))).toFixed(2))
              : Math.max(0, Number((plPlannedMtr - directLoggedMtr).toFixed(2)));

            const plAvailMt = mtFromMtr(plAvailMtr, plMhOd, plMhWt);

            if (plAvailMtr >= 1.0 || plAvailPcs >= 1) {
              rollingPlanRows.push({
                ...baseRowData,
                od: plMhOd > 0 ? plMhOd : baseRowData.od,
                wl: plMhWt > 0 ? plMhWt : baseRowData.wl,
                avg_length: effPlMhAvg > 0 ? effPlMhAvg : baseRowData.avg_length,
                stage_code: "ROLLING",
                plan_id: pl.id,
                plan_no: pl.plan_no,
                master_plan_no: pl.plan_no,
                lifecycle_status: plLifecycle,
                revision_no: Number(plParsed?.revision_no || 0),
                is_master: isPlMaster,
                child_work_orders: plEnrichedChildren,
                planned_pcs: plPlannedPcs,
                campaign_total_mtr: plPlannedMtr,
                campaign_total_pcs: plPlannedPcs,
                balance_to_make_mtr: plAvailMtr,
                balance_to_make_pcs: plAvailPcs,
                balance_to_make_mt: plAvailMt,
                mh_od: plMhOd,
                mh_wt: plMhWt,
                mh_l1: plMhL1,
                mh_l2: plMhL2,
                mh_avg_length: effPlMhAvg,
                max_allowed_mtr: Number(((plPlannedMtr || plAvailMtr) * 1.10).toFixed(2)),
                max_allowed_pcs: Math.round((plPlannedPcs || plAvailPcs) * 1.10),
                feeder_source_label: `Rolling Plan: ${pl.plan_no}`,
                feeder_stage_code: "ROLLING_PLAN",
              });
            }
          } catch {}
        }
      }
    }

    // Process Child Work Orders for Finishing stage
    const childFinishingRows: Row[] = [];
    for (const [childId, child] of childWoMap.entries()) {
      const childWo = woMap.get(childId);
      const masterCalc = allCalculatedRows.get(child.master_wo_id);
      const masterPipeline = masterCalc?.pipeline;
      const masterFinishingAvail =
        masterPipeline?.find((p) => p.stage_code === "FINISHING")?.available_mtr || 0;

      // Child order finishing logs
      const childFinLogs = logs.filter(
        (l) => l.work_order_id === childId && l.stage_id === finStageId
      );
      const childFinOutMtr = sumQty(childFinLogs, "output_qty");
      const childFinRejMtr = sumQty(childFinLogs, "rejection_qty");
      const childPlannedMtr = Number(child.planned_mtr || childWo?.balance_qty_mtr || 0);
      const l1 = Number(child.l1 || childWo?.l1 || 6);
      const l2 = Number(child.l2 || childWo?.l2 || 6.5);
      const avgLength = l1 > 0 && l2 > 0 ? (l1 + l2) / 2 : l1 || 6.25;
      const childPlannedPcs = Number(child.planned_pcs || childWo?.ordered_qty_pcs || (avgLength > 0 ? Math.round(childPlannedMtr / avgLength) : 0));

      // Remaining to finish for this child order
      const remainingTargetMtr = Math.max(0, childPlannedMtr - childFinOutMtr - childFinRejMtr);
      // Available WIP is bounded by upstream finishing available stock
      const childAvailMtr = Math.min(remainingTargetMtr, masterFinishingAvail);
      const childAvailPcs = (childFinOutMtr <= 0 && childFinRejMtr <= 0 && childPlannedPcs > 0)
        ? childPlannedPcs
        : (avgLength > 0 ? Math.round(childAvailMtr / avgLength) : 0);

      if (childAvailPcs >= 1 || childAvailMtr >= 1.0) {
        const od = Number(child.size_od || childWo?.size_od || 0);
        const wt = Number(child.size_wt || childWo?.size_wt || 0);
        const childAvailMt = mtFromMtr(childAvailMtr, od, wt);

        const childRouteId =
          child.route_id ||
          masterCalc?.queueRows.FINISHING?.route_id ||
          masterCampaignMap.get(child.master_wo_id)?.route_id ||
          routes[0]?.id ||
          "";

        const childTotalOrderMtr = Number(child.total_order_mtr || child.planned_mtr || childWo?.ordered_qty_mtr || childWo?.ordered_qty || 0);
        const childTotalOrderPcs = Number(child.total_order_pcs || child.planned_pcs || childWo?.ordered_qty_pcs || 0) || (avgLength > 0 ? Math.round(childTotalOrderMtr / avgLength) : 0);
        const childTotalOrderMt = Number(child.total_order_mt || child.planned_mt || childWo?.ordered_qty_mt || 0) || mtFromMtr(childTotalOrderMtr, od, wt);

        const childBalOrderMtr = Math.max(0, childTotalOrderMtr - childFinOutMtr);
        const childBalOrderPcs = avgLength > 0 ? Math.round(childBalOrderMtr / avgLength) : 0;
        const childBalOrderMt = mtFromMtr(childBalOrderMtr, od, wt);

        const childCappingMtr = Number((childTotalOrderMtr * 1.10).toFixed(2));
        const childCappingPcs = avgLength > 0 ? Math.round(childCappingMtr / avgLength) : 0;

        const childMaxAllowedMtr = Math.min(childAvailMtr, Math.max(0, childCappingMtr - childFinOutMtr));
        const childMaxAllowedPcs = avgLength > 0 ? Math.round(childMaxAllowedMtr / avgLength) : 0;

        childFinishingRows.push({
          work_order_id: childId,
          work_order_no: child.work_order_no || childWo?.work_order_no || "Child Order",
          customer_name: child.customer_name || childWo?.customer_name || null,
          specification: child.grade || childWo?.grade || null,
          od,
          wl: wt,
          l1,
          l2,
          avg_length: avgLength,
          total_order_pcs: childTotalOrderPcs,
          total_order_mtr: childTotalOrderMtr,
          total_order_mt: childTotalOrderMt,
          balance_to_make_order_pcs: childBalOrderPcs,
          balance_to_make_order_mtr: childBalOrderMtr,
          balance_to_make_order_mt: childBalOrderMt,
          finished_output_mtr: childFinOutMtr,
          finished_output_pcs: avgLength > 0 ? Math.round(childFinOutMtr / avgLength) : 0,
          order_capping_mtr: childCappingMtr,
          order_capping_pcs: childCappingPcs,
          mh_od: null,
          mh_wt: null,
          mh_l1: null,
          mh_l2: null,
          mh_avg_length: null,
          route_id: childRouteId,
          route_code: masterCalc?.queueRows.FINISHING?.route_code || "CDS",
          route_name: masterCalc?.queueRows.FINISHING?.route_name || "Standard CDS",
          stage_code: "FINISHING",
          balance_to_make_mtr: childAvailMtr,
          balance_to_make_pcs: childAvailPcs,
          balance_to_make_mt: childAvailMt,
          max_allowed_mtr: childMaxAllowedMtr,
          max_allowed_pcs: childMaxAllowedPcs,
          feeder_source_label: "VDI QC Passed",
          feeder_stage_code: "VDI",
          multiple: 1,
          ht_nos: null,
          is_child: true,
          master_wo_id: child.master_wo_id,
          master_wo_no: child.master_wo_no,
          master_plan_no: child.master_plan_no,
          work_centers_wip: masterPipeline,
          pcs: "",
          mtr: "",
          rejection_pcs: "",
          rejection_mtr: "",
          htc_ok_pcs: "",
          htc_ok_mtr: "",
          heat_lot_no: "",
          remarks: "",
          ht_input_nos: "",
        });

        // If this child belongs to a master campaign whose available stock is already in workCenterSummary,
        // do not double-count it in the workCenterSummary WIP total
        if (!child.master_wo_id) {
          workCenterSummary.FINISHING.availMtr += childAvailMtr;
          workCenterSummary.FINISHING.availPcs += childAvailPcs;
          workCenterSummary.FINISHING.availMt += childAvailMt;
          workCenterSummary.FINISHING.count += 1;
        }
      }
    }

    // Sync Rolling Mill summary with individual plan balances
    if (rollingPlanRows.length > 0) {
      workCenterSummary.ROLLING.availMtr = rollingPlanRows.reduce((sum, r) => sum + Number(r.balance_to_make_mtr || 0), 0);
      workCenterSummary.ROLLING.availPcs = rollingPlanRows.reduce((sum, r) => sum + Number(r.balance_to_make_pcs || 0), 0);
      workCenterSummary.ROLLING.availMt = rollingPlanRows.reduce((sum, r) => sum + Number(r.balance_to_make_mt || 0), 0);
      workCenterSummary.ROLLING.count = rollingPlanRows.length;
    }

    // Select the appropriate rows for the requested stage
    // (Universal Rule: Filter out any work order/plan whose available balance is less than 1 (Qty < 1 Pc or < 1.0 Mtr))
    const selectedRows: Row[] = [];
    if (targetStage === "ROLLING") {
      selectedRows.push(
        ...rollingPlanRows.filter(
          (r) => Number(r.balance_to_make_pcs ?? 0) >= 1 || Number(r.balance_to_make_mtr ?? 0) >= 1.0
        )
      );
    } else {
      for (const { queueRows } of allCalculatedRows.values()) {
        const row = queueRows[targetStage];
        if (row && (Number(row.balance_to_make_pcs ?? 0) >= 1 || Number(row.balance_to_make_mtr ?? 0) >= 1.0)) {
          selectedRows.push(row);
        }
      }
    }

    // For finishing stage, also append child orders with balance >= 1
    if (targetStage === "FINISHING") {
      selectedRows.push(
        ...childFinishingRows.filter(
          (r) => Number(r.balance_to_make_pcs ?? 0) >= 1 || Number(r.balance_to_make_mtr ?? 0) >= 1.0
        )
      );
    }

    // Format workCenterSummary values nicely
    const summaryArray = Object.values(workCenterSummary).map((s) => ({
      ...s,
      availMtr: Number(s.availMtr.toFixed(2)),
      availMt: Number(s.availMt.toFixed(2)),
    }));

    // Save to memory cache for fast consecutive reads across tabs
    memoryCache = {
      timestamp: Date.now(),
      allCalculatedRows,
      rollingPlanRows,
      childFinishingRows,
      workCenterSummary,
    };

    return NextResponse.json(
      {
        success: true,
        stage: targetStage,
        count: selectedRows.length,
        data: selectedRows,
        summary: summaryArray,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
          "Pragma": "no-cache",
        },
      }
    );
  } catch (err: any) {
    console.error("[production/queue] Error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to load production queue" },
      { status: 500 }
    );
  }
}
