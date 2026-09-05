import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { StageCode, Row, WorkCenterWipInfo } from "@/types";
import { mtFromMtr } from "@/lib/productionUtils";

export async function GET(req: NextRequest) {
  try {
    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: "Database service is temporarily unavailable." },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(req.url);
    const targetStage = (searchParams.get("stage")?.toUpperCase() || "ROLLING") as StageCode;

    // Fetch plans, stages, logs, work orders, routes
    const [plansRes, stagesRes, logsRes, woRes, routesRes] = await Promise.all([
      admin
        .from("rolling_plans")
        .select("id, plan_no, work_order_id, status, process_route_id, planned_qty, mh_od, mh_wt, mh_l1, mh_l2, multiple")
        .not("status", "is", null)
        .order("created_at", { ascending: false })
        .limit(300),
      admin.from("process_stages").select("id, stage_code, stage_name"),
      admin
        .from("production_logs")
        .select("id, work_order_id, stage_id, process_route_id, process_date, input_qty, output_qty, rejection_qty, htc_ok, heat_lot_no, remarks")
        .order("created_at", { ascending: true }),
      admin
        .from("work_orders")
        .select("id, work_order_no, customer_name, grade, size_od, size_wt, l1, l2, balance_qty_mtr"),
      admin.from("process_routes").select("id, route_code, route_name"),
    ]);

    if (stagesRes.error) throw stagesRes.error;

    const plans = plansRes.data || [];
    const stages = stagesRes.data || [];
    const logs = logsRes.data || [];
    const workOrders = woRes.data || [];
    const routes = routesRes.data || [];

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
    const finStageId = stageCodeToId.get("FINISHING");

    // Parse multi-WO campaigns from rolling plans
    const masterCampaignMap = new Map<string, any>(); // key: master_wo_id
    const childWoMap = new Map<string, any>(); // key: child_wo_id -> child info

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
            multiple: p.multiple || 1,
          });

          for (const child of parsed.child_work_orders) {
            const cId = child.work_order_id || child.id;
            childWoMap.set(cId, {
              ...child,
              work_order_id: cId,
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

    // Summary accumulator across all 5 work centers
    const workCenterSummary: Record<
      StageCode,
      { label: string; stage_code: StageCode; availMtr: number; availPcs: number; availMt: number; count: number }
    > = {
      ROLLING: { label: "Rolling Mill", stage_code: "ROLLING", availMtr: 0, availPcs: 0, availMt: 0, count: 0 },
      HOLLOW_HEAT_TREATMENT: { label: "Hollow Heat Treatment", stage_code: "HOLLOW_HEAT_TREATMENT", availMtr: 0, availPcs: 0, availMt: 0, count: 0 },
      DRAW: { label: "Draw Bench", stage_code: "DRAW", availMtr: 0, availPcs: 0, availMt: 0, count: 0 },
      HEAT_TREATMENT: { label: "Heat Treatment", stage_code: "HEAT_TREATMENT", availMtr: 0, availPcs: 0, availMt: 0, count: 0 },
      FINISHING: { label: "Finishing Line", stage_code: "FINISHING", availMtr: 0, availPcs: 0, availMt: 0, count: 0 },
    };

    // Build complete WIP details for all active work orders / campaigns
    const allCalculatedRows: Map<string, { queueRows: Record<StageCode, Row | null>; pipeline: WorkCenterWipInfo[] }> =
      new Map();

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
      const routeId = campaign?.route_id || plan?.process_route_id || routes[0]?.id;
      const route = routeMap.get(routeId);
      const routeCode = route?.route_code || "CDS";
      const routeName = route?.route_name || "Standard CDS";

      const isCds = routeCode === "CDS" || routeCode === "ALLOY_CDS";
      const isAlloy = routeCode.includes("ALLOY");

      const l1 = Number(wo.l1 || 6);
      const l2 = Number(wo.l2 || 6.5);
      const avgLength = l1 > 0 && l2 > 0 ? (l1 + l2) / 2 : l1 || 6.25;

      const mhL1 = Number(campaign?.mh_l1 || plan?.mh_l1 || l1);
      const mhL2 = Number(campaign?.mh_l2 || plan?.mh_l2 || l2);
      const mhAvgLength = mhL1 > 0 && mhL2 > 0 ? (mhL1 + mhL2) / 2 : mhL1 || avgLength;

      const mhOd = Number(campaign?.mh_od || plan?.mh_od || wo.size_od || 0);
      const mhWt = Number(campaign?.mh_wt || plan?.mh_wt || wo.size_wt || 0);

      const multiple = Number(campaign?.multiple || plan?.multiple || 1);

      // 1. Rolling Stage Metrics
      const rollLogs = getStageLogs(woId, rollingStageId);
      const rollOutMtr = sumQty(rollLogs, "output_qty");
      const rollRejMtr = sumQty(rollLogs, "rejection_qty");
      const rollHtcOkMtr = sumQty(rollLogs, "htc_ok");
      const rollNetMtr = Math.max(0, rollOutMtr - rollRejMtr);
      const rollTotalLogged = rollOutMtr + rollRejMtr;

      const totalCampaignMtr = campaign
        ? Number(campaign.total_campaign_mtr || 0)
        : Number(plan?.planned_qty || 0);
      const totalCampaignPcs = campaign
        ? Number(campaign.total_campaign_pcs || 0)
        : (mhAvgLength > 0 ? Math.round(totalCampaignMtr / mhAvgLength) : 0);

      // Rolling Available WIP & 110% Capping
      const rollAvailMtr = Math.max(0, totalCampaignMtr - rollTotalLogged);
      const rollAvailPcs = mhAvgLength > 0 ? Math.round(rollAvailMtr / mhAvgLength) : 0;
      const rollAvailMt = mtFromMtr(rollAvailMtr, mhOd, mhWt);

      const rollCappingMtr = Number((totalCampaignMtr * 1.1).toFixed(3));
      const rollCappingPcs = mhAvgLength > 0 ? Math.round(rollCappingMtr / mhAvgLength) : 0;

      // 2. Hollow Heat Treatment Stage Metrics
      const hollowHtLogs = getStageLogs(woId, hollowHtStageId);
      const hollowHtOutMtr = sumQty(hollowHtLogs, "output_qty");
      const hollowHtRejMtr = sumQty(hollowHtLogs, "rejection_qty");
      const hollowHtNetMtr = Math.max(0, hollowHtOutMtr - hollowHtRejMtr);

      // Hollow HT incoming: strictly from Rolling HTC OK!
      const hollowHtAvailMtr = isAlloy
        ? Math.max(0, rollHtcOkMtr - hollowHtOutMtr - hollowHtRejMtr)
        : 0;
      const hollowHtAvailPcs = mhAvgLength > 0 ? Math.round(hollowHtAvailMtr / mhAvgLength) : 0;
      const hollowHtAvailMt = mtFromMtr(hollowHtAvailMtr, mhOd, mhWt);

      // 3. Draw Stage Metrics
      const drawLogs = getStageLogs(woId, drawStageId);
      const drawOutMtr = sumQty(drawLogs, "output_qty");
      const drawRejMtr = sumQty(drawLogs, "rejection_qty");
      const drawNetMtr = Math.max(0, drawOutMtr - drawRejMtr);

      // Draw incoming:
      // - CDS route: strictly from Rolling HTC OK!
      // - ALLOY_CDS: from Hollow HT Net Output (which was generated from Rolling HTC OK)
      let drawAvailMtr = 0;
      if (routeCode === "CDS") {
        drawAvailMtr = Math.max(0, rollHtcOkMtr - drawOutMtr - drawRejMtr);
      } else if (routeCode === "ALLOY_CDS") {
        drawAvailMtr = Math.max(0, hollowHtNetMtr - drawOutMtr - drawRejMtr);
      }
      const drawAvailPcs = avgLength > 0 ? Math.round(drawAvailMtr / avgLength) : 0;
      const drawAvailMt = mtFromMtr(drawAvailMtr, Number(wo.size_od || 0), Number(wo.size_wt || 0));

      // 4. Heat Treatment Stage Metrics
      const htLogs = getStageLogs(woId, htStageId);
      const htOutMtr = sumQty(htLogs, "output_qty");
      const htRejMtr = sumQty(htLogs, "rejection_qty");
      const htNetMtr = Math.max(0, htOutMtr - htRejMtr);

      // Heat treatment incoming: strictly from Draw net output
      const htAvailMtr = isCds ? Math.max(0, drawNetMtr - htOutMtr - htRejMtr) : 0;
      const htAvailPcs = avgLength > 0 ? Math.round(htAvailMtr / avgLength) : 0;
      const htAvailMt = mtFromMtr(htAvailMtr, Number(wo.size_od || 0), Number(wo.size_wt || 0));

      // 5. Finishing Stage Metrics (for Master WO)
      const finLogs = getStageLogs(woId, finStageId);
      const finOutMtr = sumQty(finLogs, "output_qty");
      const finRejMtr = sumQty(finLogs, "rejection_qty");
      const finNetMtr = Math.max(0, finOutMtr - finRejMtr);

      // Finishing incoming for master order:
      let finIncomingMtr = 0;
      if (routeCode === "HFS") {
        finIncomingMtr = rollHtcOkMtr * multiple;
      } else if (routeCode === "ALLOY_HFS") {
        finIncomingMtr = hollowHtNetMtr * multiple;
      } else {
        finIncomingMtr = htNetMtr * multiple;
      }
      const finAvailMtr = Math.max(0, finIncomingMtr - finOutMtr - finRejMtr);
      const finAvailPcs = avgLength > 0 ? Math.round(finAvailMtr / avgLength) : 0;
      const finAvailMt = mtFromMtr(finAvailMtr, Number(wo.size_od || 0), Number(wo.size_wt || 0));

      // Build WorkCenterWipInfo pipeline for this order
      const pipeline: WorkCenterWipInfo[] = [
        {
          stage_code: "ROLLING",
          stage_name: "Rolling",
          sequence_no: 1,
          available_mtr: rollAvailMtr,
          available_pcs: rollAvailPcs,
          available_mt: rollAvailMt,
          gross_output_mtr: rollOutMtr,
          gross_output_pcs: mhAvgLength > 0 ? Math.round(rollOutMtr / mhAvgLength) : 0,
          gross_output_mt: mtFromMtr(rollOutMtr, mhOd, mhWt),
          rejection_mtr: rollRejMtr,
          rejection_pcs: mhAvgLength > 0 ? Math.round(rollRejMtr / mhAvgLength) : 0,
          rejection_mt: mtFromMtr(rollRejMtr, mhOd, mhWt),
          net_output_mtr: rollNetMtr,
          net_output_pcs: mhAvgLength > 0 ? Math.round(rollNetMtr / mhAvgLength) : 0,
          net_output_mt: mtFromMtr(rollNetMtr, mhOd, mhWt),
          htc_ok_mtr: rollHtcOkMtr,
          htc_ok_pcs: mhAvgLength > 0 ? Math.round(rollHtcOkMtr / mhAvgLength) : 0,
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
          gross_output_pcs: mhAvgLength > 0 ? Math.round(hollowHtOutMtr / mhAvgLength) : 0,
          gross_output_mt: mtFromMtr(hollowHtOutMtr, mhOd, mhWt),
          rejection_mtr: hollowHtRejMtr,
          rejection_pcs: mhAvgLength > 0 ? Math.round(hollowHtRejMtr / mhAvgLength) : 0,
          rejection_mt: mtFromMtr(hollowHtRejMtr, mhOd, mhWt),
          net_output_mtr: hollowHtNetMtr,
          net_output_pcs: mhAvgLength > 0 ? Math.round(hollowHtNetMtr / mhAvgLength) : 0,
          net_output_mt: mtFromMtr(hollowHtNetMtr, mhOd, mhWt),
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
          gross_output_pcs: avgLength > 0 ? Math.round(drawOutMtr / avgLength) : 0,
          gross_output_mt: mtFromMtr(drawOutMtr, Number(wo.size_od || 0), Number(wo.size_wt || 0)),
          rejection_mtr: drawRejMtr,
          rejection_pcs: avgLength > 0 ? Math.round(drawRejMtr / avgLength) : 0,
          rejection_mt: mtFromMtr(drawRejMtr, Number(wo.size_od || 0), Number(wo.size_wt || 0)),
          net_output_mtr: drawNetMtr,
          net_output_pcs: avgLength > 0 ? Math.round(drawNetMtr / avgLength) : 0,
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
          gross_output_pcs: avgLength > 0 ? Math.round(htOutMtr / avgLength) : 0,
          gross_output_mt: mtFromMtr(htOutMtr, Number(wo.size_od || 0), Number(wo.size_wt || 0)),
          rejection_mtr: htRejMtr,
          rejection_pcs: avgLength > 0 ? Math.round(htRejMtr / avgLength) : 0,
          rejection_mt: mtFromMtr(htRejMtr, Number(wo.size_od || 0), Number(wo.size_wt || 0)),
          net_output_mtr: htNetMtr,
          net_output_pcs: avgLength > 0 ? Math.round(htNetMtr / avgLength) : 0,
          net_output_mt: mtFromMtr(htNetMtr, Number(wo.size_od || 0), Number(wo.size_wt || 0)),
        });
      }

      pipeline.push({
        stage_code: "FINISHING",
        stage_name: "Finishing",
        sequence_no: pipeline.length + 1,
        available_mtr: finAvailMtr,
        available_pcs: finAvailPcs,
        available_mt: finAvailMt,
        gross_output_mtr: finOutMtr,
        gross_output_pcs: avgLength > 0 ? Math.round(finOutMtr / avgLength) : 0,
        gross_output_mt: mtFromMtr(finOutMtr, Number(wo.size_od || 0), Number(wo.size_wt || 0)),
        rejection_mtr: finRejMtr,
        rejection_pcs: avgLength > 0 ? Math.round(finRejMtr / avgLength) : 0,
        rejection_mt: mtFromMtr(finRejMtr, Number(wo.size_od || 0), Number(wo.size_wt || 0)),
        net_output_mtr: finNetMtr,
        net_output_pcs: avgLength > 0 ? Math.round(finNetMtr / avgLength) : 0,
        net_output_mt: mtFromMtr(finNetMtr, Number(wo.size_od || 0), Number(wo.size_wt || 0)),
      });

      // Update workCenterSummary for the 5 stages
      // (Pre-finishing: only Master orders; Finishing: Master and Child orders)
      if (rollAvailMtr > 0) {
        workCenterSummary.ROLLING.availMtr += rollAvailMtr;
        workCenterSummary.ROLLING.availPcs += rollAvailPcs;
        workCenterSummary.ROLLING.availMt += rollAvailMt;
        workCenterSummary.ROLLING.count += 1;
      }
      if (hollowHtAvailMtr > 0) {
        workCenterSummary.HOLLOW_HEAT_TREATMENT.availMtr += hollowHtAvailMtr;
        workCenterSummary.HOLLOW_HEAT_TREATMENT.availPcs += hollowHtAvailPcs;
        workCenterSummary.HOLLOW_HEAT_TREATMENT.availMt += hollowHtAvailMt;
        workCenterSummary.HOLLOW_HEAT_TREATMENT.count += 1;
      }
      if (drawAvailMtr > 0) {
        workCenterSummary.DRAW.availMtr += drawAvailMtr;
        workCenterSummary.DRAW.availPcs += drawAvailPcs;
        workCenterSummary.DRAW.availMt += drawAvailMt;
        workCenterSummary.DRAW.count += 1;
      }
      if (htAvailMtr > 0) {
        workCenterSummary.HEAT_TREATMENT.availMtr += htAvailMtr;
        workCenterSummary.HEAT_TREATMENT.availPcs += htAvailPcs;
        workCenterSummary.HEAT_TREATMENT.availMt += htAvailMt;
        workCenterSummary.HEAT_TREATMENT.count += 1;
      }
      if (finAvailMtr > 0) {
        workCenterSummary.FINISHING.availMtr += finAvailMtr;
        workCenterSummary.FINISHING.availPcs += finAvailPcs;
        workCenterSummary.FINISHING.availMt += finAvailMt;
        workCenterSummary.FINISHING.count += 1;
      }

      // Pre-build Row objects for this work order for all 5 stages
      const baseRowData = {
        work_order_id: wo.id,
        work_order_no: wo.work_order_no,
        customer_name: wo.customer_name || null,
        specification: wo.grade || null,
        od: Number(wo.size_od || 0),
        wl: Number(wo.size_wt || 0),
        l1,
        l2,
        avg_length: avgLength,
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
        master_plan_no: campaign?.plan_no || plan?.plan_no,
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
          rollAvailMtr > 0 || totalCampaignMtr > 0
            ? {
                ...baseRowData,
                stage_code: "ROLLING",
                balance_to_make_mtr: rollAvailMtr,
                balance_to_make_pcs: rollAvailPcs,
                balance_to_make_mt: rollAvailMt,
                max_allowed_mtr: rollCappingMtr,
                max_allowed_pcs: rollCappingPcs,
              }
            : null,
        HOLLOW_HEAT_TREATMENT:
          isAlloy && hollowHtAvailMtr > 0
            ? {
                ...baseRowData,
                stage_code: "HOLLOW_HEAT_TREATMENT",
                balance_to_make_mtr: hollowHtAvailMtr,
                balance_to_make_pcs: hollowHtAvailPcs,
                balance_to_make_mt: hollowHtAvailMt,
                max_allowed_mtr: hollowHtAvailMtr,
                max_allowed_pcs: hollowHtAvailPcs,
                prev_stage_code: "ROLLING",
                prev_htc_ok: rollHtcOkMtr,
              }
            : null,
        DRAW:
          isCds && drawAvailMtr > 0
            ? {
                ...baseRowData,
                stage_code: "DRAW",
                balance_to_make_mtr: drawAvailMtr,
                balance_to_make_pcs: drawAvailPcs,
                balance_to_make_mt: drawAvailMt,
                max_allowed_mtr: drawAvailMtr,
                max_allowed_pcs: drawAvailPcs,
                prev_stage_code: isAlloy ? "HOLLOW_HEAT_TREATMENT" : "ROLLING",
                prev_htc_ok: rollHtcOkMtr,
              }
            : null,
        HEAT_TREATMENT:
          isCds && htAvailMtr > 0
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
              }
            : null,
        FINISHING:
          finAvailMtr > 0
            ? {
                ...baseRowData,
                stage_code: "FINISHING",
                balance_to_make_mtr: finAvailMtr,
                balance_to_make_pcs: finAvailPcs,
                balance_to_make_mt: finAvailMt,
                max_allowed_mtr: finAvailMtr,
                max_allowed_pcs: finAvailPcs,
                prev_stage_code: isCds
                  ? "HEAT_TREATMENT"
                  : isAlloy
                  ? "HOLLOW_HEAT_TREATMENT"
                  : "ROLLING",
                prev_htc_ok: rollHtcOkMtr,
              }
            : null,
      };

      allCalculatedRows.set(woId, { queueRows, pipeline });
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

      // Remaining to finish for this child order
      const remainingTargetMtr = Math.max(0, childPlannedMtr - childFinOutMtr - childFinRejMtr);
      // Available WIP is bounded by upstream finishing available stock
      const childAvailMtr = Math.min(remainingTargetMtr, masterFinishingAvail);

      if (childAvailMtr > 0) {
        const l1 = Number(child.l1 || childWo?.l1 || 6);
        const l2 = Number(child.l2 || childWo?.l2 || 6.5);
        const avgLength = l1 > 0 && l2 > 0 ? (l1 + l2) / 2 : l1 || 6.25;
        const childAvailPcs = avgLength > 0 ? Math.round(childAvailMtr / avgLength) : 0;
        const od = Number(child.size_od || childWo?.size_od || 0);
        const wt = Number(child.size_wt || childWo?.size_wt || 0);
        const childAvailMt = mtFromMtr(childAvailMtr, od, wt);

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
          mh_od: null,
          mh_wt: null,
          mh_l1: null,
          mh_l2: null,
          mh_avg_length: null,
          route_id: childWo?.process_route_id || "",
          route_code: masterCalc?.queueRows.FINISHING?.route_code || "CDS",
          route_name: masterCalc?.queueRows.FINISHING?.route_name || "Standard CDS",
          stage_code: "FINISHING",
          balance_to_make_mtr: childAvailMtr,
          balance_to_make_pcs: childAvailPcs,
          balance_to_make_mt: childAvailMt,
          max_allowed_mtr: childAvailMtr,
          max_allowed_pcs: childAvailPcs,
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

        workCenterSummary.FINISHING.availMtr += childAvailMtr;
        workCenterSummary.FINISHING.availPcs += childAvailPcs;
        workCenterSummary.FINISHING.availMt += childAvailMt;
        workCenterSummary.FINISHING.count += 1;
      }
    }

    // Select the appropriate rows for the requested stage
    const selectedRows: Row[] = [];
    for (const { queueRows } of allCalculatedRows.values()) {
      const row = queueRows[targetStage];
      if (row) {
        selectedRows.push(row);
      }
    }

    // For finishing stage, also append child orders
    if (targetStage === "FINISHING") {
      selectedRows.push(...childFinishingRows);
    }

    // Format workCenterSummary values nicely
    const summaryArray = Object.values(workCenterSummary).map((s) => ({
      ...s,
      availMtr: Number(s.availMtr.toFixed(3)),
      availMt: Number(s.availMt.toFixed(3)),
    }));

    return NextResponse.json({
      success: true,
      stage: targetStage,
      count: selectedRows.length,
      data: selectedRows,
      summary: summaryArray,
    });
  } catch (err: any) {
    console.error("[production/queue] Error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to load production queue" },
      { status: 500 }
    );
  }
}
