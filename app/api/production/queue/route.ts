import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { StageCode, Row, WorkCenterWipInfo } from "@/types";
import { mtFromMtr, extractPcsFromRemarks, extractBandSawCutsFromRemarks } from "@/lib/productionUtils";

import { getQueueCache, setQueueCache, invalidateQueueCache } from "@/lib/cache/queueCache";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const HOLLOW_BANK_WO_ID = '00000000-0000-0000-0000-00000000000b';

function isHollowBankOrder(w: { id?: string; work_order_id?: string; work_order_no?: string | null; customer_name?: string | null } | null | undefined): boolean {
  if (!w) return false;
  if (w.id === HOLLOW_BANK_WO_ID || w.work_order_id === HOLLOW_BANK_WO_ID) return true;
  const woNo = String(w.work_order_no || '').trim().toUpperCase();
  if (woNo === 'HB-BUFFER' || woNo === 'HOLLOW BANK' || woNo === 'HB BUFFER') return true;
  const cust = String(w.customer_name || '').trim().toUpperCase();
  if (cust.includes('HOLLOW BANK') || cust.includes('HB-BUFFER') || cust.includes('HB BUFFER')) return true;
  return false;
}

async function enrichWithDailyPlans(admin: any, rows: Row[], stage: StageCode) {
  if (!rows || rows.length === 0 || !admin) return;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { data: dailyPlans, error } = await admin
      .from('daily_production_plans')
      .select('work_order_id, work_center, target_pcs, machine_id, priority_rank')
      .eq('plan_date', today);

    if (error || !dailyPlans || dailyPlans.length === 0) return;

    const planMap = new Map<string, any>();
    dailyPlans.forEach((dp: any) => {
      planMap.set(`${dp.work_order_id}_${dp.work_center}`, dp);
    });

    rows.forEach((r) => {
      const dp = planMap.get(`${r.work_order_id}_${stage}`);
      if (dp) {
        r.daily_plan_target_pcs = Number(dp.target_pcs || 0);
        r.daily_plan_machine = dp.machine_id;
        r.daily_plan_priority = dp.priority_rank;
      }
    });

    rows.sort((a, b) => {
      const aHas = (a.daily_plan_target_pcs || 0) > 0 ? 1 : 0;
      const bHas = (b.daily_plan_target_pcs || 0) > 0 ? 1 : 0;
      if (aHas !== bHas) return bHas - aHas;
      if (aHas && bHas) return (a.daily_plan_priority || 1) - (b.daily_plan_priority || 1);
      return 0;
    });
  } catch {
    // Fail-safe if daily_production_plans table is missing or query fails
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const isAllStages = searchParams.get("all_stages") === "true" || searchParams.get("matrix") === "true";
    const stagesParam = searchParams.get("stages");
    const targetStages: StageCode[] = stagesParam
      ? (stagesParam.split(",").map((s) => s.trim().toUpperCase()) as StageCode[])
      : [(searchParams.get("stage")?.toUpperCase() || "ROLLING") as StageCode];
    const targetStage = targetStages[0];
    const includeFeeder = searchParams.get("include_feeder") === "true" || searchParams.get("for_planning") === "true";
    const forceFresh = searchParams.has("nocache") || searchParams.has("refresh");

    if (forceFresh) {
      invalidateQueueCache();
    }

    // Fast-path: Return from memory cache if within TTL (reduces DB hits by 90% during navigation)
    const memoryCache = !forceFresh ? getQueueCache() : null;
    if (memoryCache) {
      const selectedRows: Row[] = [];
      if (isAllStages) {
        const activeStages: StageCode[] = [
          "HOT_ROLLING",
          "HTC",
          "HOLLOW_HEAT_TREATMENT",
          "DRAW",
          "PILGER",
          "HEAT_TREATMENT",
          "BAND_SAW",
          "VDI",
          "FINISHING",
        ];
        for (const { queueRows, vdiSalvageRow } of memoryCache.allCalculatedRows.values()) {
          for (const st of activeStages) {
            const row = queueRows[st];
            if (row) {
              if (st === "HOT_ROLLING" || st === "ROLLING") {
                if (Number(row.rolled_pcs || 0) > 0 || Number(row.rolled_mtr || 0) > 0) {
                  selectedRows.push(row);
                }
              } else if (!row.is_feeder_source) {
                const readyPcs = Number(row.ready_pcs ?? 0);
                const readyMtr = Number(row.ready_mtr ?? 0);
                if (readyPcs >= 1 && readyMtr > 0) {
                  selectedRows.push(row);
                }
              }
            }
          }
          if (vdiSalvageRow) {
            const readyPcs = Number(vdiSalvageRow.ready_pcs ?? 0);
            const readyMtr = Number(vdiSalvageRow.ready_mtr ?? 0);
            if (readyPcs >= 1 && readyMtr > 0) {
              selectedRows.push(vdiSalvageRow);
            }
          }
        }
        for (const r of memoryCache.childFinishingRows) {
          if (!r.is_feeder_source) {
            const readyPcs = Number(r.ready_pcs ?? 0);
            const readyMtr = Number(r.ready_mtr ?? 0);
            if (readyPcs >= 1 && readyMtr > 0) {
              selectedRows.push(r);
            }
          }
        }
      } else if (targetStage === "ROLLING") {
        selectedRows.push(
          ...memoryCache.rollingPlanRows.filter(
            (r) => Number(r.balance_to_make_pcs ?? 0) >= 1 || Number(r.balance_to_make_mtr ?? 0) >= 1.0 || Number(r.max_allowed_pcs ?? 0) >= 1
          )
        );
      } else {
        for (const st of targetStages) {
          if (st === "ROLLING") {
            selectedRows.push(
              ...memoryCache.rollingPlanRows.filter(
                (r) => Number(r.balance_to_make_pcs ?? 0) >= 1 || Number(r.balance_to_make_mtr ?? 0) >= 1.0 || Number(r.max_allowed_pcs ?? 0) >= 1
              )
            );
          } else if ((st as string) === "VDI_SALVAGE") {
            for (const { vdiSalvageRow } of memoryCache.allCalculatedRows.values()) {
              if (vdiSalvageRow) {
                const readyPcs = Number(vdiSalvageRow.ready_pcs ?? vdiSalvageRow.balance_to_make_pcs ?? 0);
                const readyMtr = Number(vdiSalvageRow.ready_mtr ?? vdiSalvageRow.balance_to_make_mtr ?? 0);
                if (readyPcs >= 1 || readyMtr >= 1.0) {
                  selectedRows.push(vdiSalvageRow);
                }
              }
            }
          } else {
            for (const { queueRows } of memoryCache.allCalculatedRows.values()) {
              const row = queueRows[st];
              if (row) {
                if (includeFeeder) {
                  if (Number(row.balance_to_make_pcs ?? 0) >= 1 || Number(row.balance_to_make_mtr ?? 0) >= 1.0 || Number(row.feeder_pcs ?? 0) >= 1) {
                    selectedRows.push(row);
                  }
                } else {
                  if (!row.is_feeder_source && (Number(row.ready_pcs ?? row.balance_to_make_pcs ?? 0) >= 1 || Number(row.ready_mtr ?? row.balance_to_make_mtr ?? 0) >= 1.0)) {
                    selectedRows.push(row);
                  }
                }
              }
            }
          }
          if (st === "FINISHING") {
            if (includeFeeder) {
              selectedRows.push(
                ...memoryCache.childFinishingRows.filter(
                  (r) => Number(r.balance_to_make_pcs ?? 0) >= 1 || Number(r.balance_to_make_mtr ?? 0) >= 1.0 || Number(r.feeder_pcs ?? 0) >= 1
                )
              );
            } else {
              selectedRows.push(
                ...memoryCache.childFinishingRows.filter(
                  (r) => !r.is_feeder_source && (Number(r.ready_pcs ?? r.balance_to_make_pcs ?? 0) >= 1 || Number(r.ready_mtr ?? r.balance_to_make_mtr ?? 0) >= 1.0)
                )
              );
            }
          }
        }
      }
      const summaryArray = Object.values(memoryCache.workCenterSummary).map((s) => ({
        ...s,
        availMtr: Number(s.availMtr.toFixed(2)),
        availMt: Number(s.availMt.toFixed(2)),
      }));

      const finalCachedRows = selectedRows.filter((r) => !isHollowBankOrder(r));

      return NextResponse.json(
        {
          success: true,
          stage: isAllStages ? "ALL" : targetStage,
          count: finalCachedRows.length,
          data: finalCachedRows,
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

    // Fetch plans, stages, logs, work orders, routes, qc, diversions, rejection declarations
    const [plansRes, stagesRes, logs, woRes, routesRes, qcRes, divsRes, rejsRes] = await Promise.all([
      admin
        .from("rolling_plans")
        .select("id, plan_no, work_order_id, status, process_route_id, planned_qty, mh_od, mh_wt, mh_l1, mh_l2, multiple, created_at")
        .not("status", "is", null)
        .order("created_at", { ascending: false })
        .limit(1000),
      admin.from("process_stages").select("id, stage_code, stage_name"),
      fetchAllLogs(admin),
      admin
        .from("work_orders")
        .select("id, work_order_no, customer_name, grade, specification, status, size_od, size_wt, l1, l2, ordered_qty, ordered_qty_mtr, ordered_qty_pcs, ordered_qty_mt, balance_qty_mtr, balance_qty_pcs, balance_qty_mt"),
      admin.from("process_routes").select("id, route_code, route_name"),
      admin
        .from("qc_inspections")
        .select("id, work_order_id, inspected_pcs, inspected_mtr, vdi_ok_pcs, vdi_ok_mtr, vdi_salvage_pcs, vdi_salvage_mtr, vdi_rejection_pcs, vdi_rejection_mtr, remarks"),
      admin
        .from("diversion_plans")
        .select("id, source_wo_id, target_wo_id, diverted_qty, work_center, multiple, process_route_id, reason"),
      admin
        .from("rejection_declarations")
        .select("id, work_order_id, work_center, rejected_pcs, rejected_mtr, qc_verified_pcs, qc_verified_mtr, ppc_approved_pcs, ppc_approved_mtr, status")
        .not("status", "in", '("REJECTED_BY_QC","REJECTED_BY_PPC")'),
    ]);

    if (stagesRes.error) throw stagesRes.error;
    if (divsRes?.error) {
      console.error("[production/queue] divsRes error:", divsRes.error);
    }
    if (qcRes?.error) {
      console.error("[production/queue] qcRes error:", qcRes.error);
    } else {
      console.log("[production/queue] qcRes count:", qcRes?.data?.length);
    }

    const plans = plansRes.data || [];
    const stages = stagesRes.data || [];
    const rawWorkOrders = woRes.data || [];
    // Hollow bank is dedicated yard buffer inventory (accessible via /hollow-bank) and must not be available for production entry
    const workOrders = rawWorkOrders.filter((w: any) => !isHollowBankOrder(w));
    const routes = routesRes.data || [];
    const qcInspections = qcRes?.data || [];
    const hasQcTable = !qcRes?.error;
    const diversions = divsRes?.data || [];
    const rejectionDeclarations = rejsRes?.data || [];

    const getStageRejDecl = (wId: string, stageCode: string) => {
      const matching = rejectionDeclarations.filter(
        (rd: any) => rd.work_order_id === wId && (rd.work_center || "").toUpperCase() === stageCode.toUpperCase()
      );
      const pcs = matching.reduce(
        (sum: number, rd: any) => sum + Number(rd.ppc_approved_pcs ?? rd.qc_verified_pcs ?? rd.rejected_pcs ?? 0),
        0
      );
      const mtr = matching.reduce(
        (sum: number, rd: any) => sum + Number(rd.ppc_approved_mtr ?? rd.qc_verified_mtr ?? rd.rejected_mtr ?? 0),
        0
      );
      return { pcs, mtr };
    };

    const parseDivStages = (d: any) => {
      const fromMatch = typeof d.reason === "string" ? d.reason.match(/\[FROM_STAGE:\s*([A-Z_]+)\]/i) : null;
      const toMatch = typeof d.reason === "string" ? d.reason.match(/\[TO_STAGE:\s*([A-Z_]+)\]/i) : null;
      const sourceStage = fromMatch ? fromMatch[1].toUpperCase() : (d.work_center || "ROLLING");
      const targetStage = toMatch ? toMatch[1].toUpperCase() : (d.work_center || "ROLLING");
      return { sourceStage, targetStage };
    };

    const getStageDivIn = (wId: string, stageCode: string) =>
      diversions
        .filter((d: any) => d.target_wo_id === wId && parseDivStages(d).targetStage === stageCode)
        .reduce((sum: number, d: any) => sum + Number(d.diverted_qty || 0), 0);

    const getStageDivOut = (wId: string, stageCode: string) =>
      diversions
        .filter((d: any) => d.source_wo_id === wId && parseDivStages(d).sourceStage === stageCode)
        .reduce((sum: number, d: any) => sum + Number(d.diverted_qty || 0), 0);

    const woMap = new Map<string, any>();
    workOrders.forEach((w) => woMap.set(w.id, w));

    const getStageDivInPcs = (wId: string, stageCode: string, fallbackTargetAvgLen: number = 6.0) => {
      const matching = diversions.filter((d: any) => d.target_wo_id === wId && parseDivStages(d).targetStage === stageCode);
      return matching.reduce((sum: number, d: any) => {
        const dQty = Number(d.diverted_qty || 0);
        if (dQty <= 0) return sum;
        const multMatch = typeof d.reason === "string" ? d.reason.match(/\[MULTIPLE:\s*([0-9.]+)\]/i) : null;
        const mult = Math.max(1, Number(multMatch ? multMatch[1] : (d.multiple || 1)));
        const srcWo = woMap.get(d.source_wo_id);
        const srcL1 = Number(srcWo?.l1 || 0);
        const srcL2 = Number(srcWo?.l2 || 0);
        const srcAvgLen = srcL1 > 0 && srcL2 > 0 ? (srcL1 + srcL2) / 2 : srcL1 || fallbackTargetAvgLen;
        const srcMotherPcs = srcAvgLen > 0 ? Math.round(dQty / srcAvgLen) : 0;
        const cutPcs = srcMotherPcs > 0 ? Math.round(srcMotherPcs * mult) : (fallbackTargetAvgLen > 0 ? Math.round(dQty / fallbackTargetAvgLen) : 0);
        return sum + cutPcs;
      }, 0);
    };

    const getStageDivOutPcs = (wId: string, stageCode: string, sourceAvgLen: number = 6.0) => {
      const matching = diversions.filter((d: any) => d.source_wo_id === wId && parseDivStages(d).sourceStage === stageCode);
      return matching.reduce((sum: number, d: any) => {
        const dQty = Number(d.diverted_qty || 0);
        if (dQty <= 0) return sum;
        return sum + (sourceAvgLen > 0 ? Math.round(dQty / sourceAvgLen) : 0);
      }, 0);
    };

    const getStageDivDetails = (wId: string, stageCode: string, fallbackTargetAvgLen: number = 6.0) => {
      const matching = diversions.filter((d: any) => d.target_wo_id === wId && parseDivStages(d).targetStage === stageCode);
      if (matching.length === 0) {
        return {
          has_diversion: false,
          diversion_in_pcs: 0,
          diversion_in_mtr: 0,
          diversion_source_wo: null,
          diversion_remarks: null,
        };
      }
      const totalMtr = matching.reduce((sum: number, d: any) => sum + Number(d.diverted_qty || 0), 0);
      const totalPcs = matching.reduce((sum: number, d: any) => {
        const dQty = Number(d.diverted_qty || 0);
        if (dQty <= 0) return sum;
        const multMatch = typeof d.reason === "string" ? d.reason.match(/\[MULTIPLE:\s*([0-9.]+)\]/i) : null;
        const mult = Math.max(1, Number(multMatch ? multMatch[1] : (d.multiple || 1)));
        const srcWo = woMap.get(d.source_wo_id);
        const srcL1 = Number(srcWo?.l1 || 0);
        const srcL2 = Number(srcWo?.l2 || 0);
        const srcAvgLen = srcL1 > 0 && srcL2 > 0 ? (srcL1 + srcL2) / 2 : srcL1 || fallbackTargetAvgLen;
        const srcMotherPcs = srcAvgLen > 0 ? Math.round(dQty / srcAvgLen) : 0;
        const cutPcs = srcMotherPcs > 0 ? Math.round(srcMotherPcs * mult) : (fallbackTargetAvgLen > 0 ? Math.round(dQty / fallbackTargetAvgLen) : 0);
        return sum + cutPcs;
      }, 0);
      const sourceWoList = Array.from(
        new Set(
          matching
            .map((d: any) => {
              const src = woMap.get(d.source_wo_id);
              return src?.work_order_no || d.source_wo_id?.slice(0, 8);
            })
            .filter(Boolean)
        )
      );
      const remarks = matching.map((d: any) => d.reason).filter(Boolean).join("; ");
      return {
        has_diversion: totalMtr > 0 || totalPcs > 0,
        diversion_in_pcs: totalPcs,
        diversion_in_mtr: Number(totalMtr.toFixed(2)),
        diversion_source_wo: sourceWoList.join(", ") || null,
        diversion_remarks: remarks || null,
      };
    };

    const getWoDivDetails = (wId: string) => {
      const matching = diversions.filter((d: any) => d.target_wo_id === wId);
      if (matching.length === 0) {
        return {
          has_diversion: false,
          diversion_in_pcs: 0,
          diversion_in_mtr: 0,
          diversion_source_wo: null,
          diversion_remarks: null,
        };
      }
      const totalMtr = matching.reduce((sum: number, d: any) => sum + Number(d.diverted_qty || 0), 0);
      const sourceWoList = Array.from(
        new Set(
          matching
            .map((d: any) => {
              const src = woMap.get(d.source_wo_id);
              return src?.work_order_no || d.source_wo_id?.slice(0, 8);
            })
            .filter(Boolean)
        )
      );
      const remarks = matching.map((d: any) => d.reason).filter(Boolean).join("; ");
      return {
        has_diversion: totalMtr > 0,
        diversion_in_pcs: 0,
        diversion_in_mtr: Number(totalMtr.toFixed(2)),
        diversion_source_wo: sourceWoList.join(", ") || null,
        diversion_remarks: remarks || null,
      };
    };

    const stageCodeToId = new Map<string, string>();
    const stageIdToCode = new Map<string, string>();
    stages.forEach((s) => {
      stageCodeToId.set(s.stage_code, s.id);
      stageIdToCode.set(s.id, s.stage_code);
    });

    const routeMap = new Map<string, any>();
    routes.forEach((r) => routeMap.set(r.id, r));

    const hotRollingStageId = stageCodeToId.get("HOT_ROLLING") || stageCodeToId.get("ROLLING");
    const htcStageId = stageCodeToId.get("HTC") || stageCodeToId.get("ROLLING");
    const rollingStageId = stageCodeToId.get("ROLLING");
    const hollowHtStageId = stageCodeToId.get("HOLLOW_HEAT_TREATMENT");
    const ipCuttingStageId = stageCodeToId.get("IP_CUTTING");
    const drawStageId = stageCodeToId.get("DRAW");
    const pilgerStageId = stageCodeToId.get("PILGER");
    const htStageId = stageCodeToId.get("HEAT_TREATMENT");
    const bandSawStageId = stageCodeToId.get("BAND_SAW");
    const vdiStageId = stageCodeToId.get("VDI");
    const finStageId = stageCodeToId.get("FINISHING");

    // Helper to calculate stage totals for a work order
    const getStageLogs = (woId: string, stageId?: string, fallbackCode?: string) => {
      if (!stageId && !fallbackCode) return [];
      return logs.filter((l) => {
        if (l.work_order_id !== woId) return false;
        if (stageId && l.stage_id === stageId) return true;
        if (fallbackCode && (l.stage_code === fallbackCode || l.stage?.stage_code === fallbackCode)) return true;
        return false;
      });
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
      const htcOkVal = Number(log.htc_ok ?? log.htc_ok_qty ?? 0);
      if (htcOkVal > 0) {
        if (log.htc_ok_pcs !== undefined && log.htc_ok_pcs !== null && Number(log.htc_ok_pcs) > 0) {
          return Number(log.htc_ok_pcs);
        }
        const parsed = extractPcsFromRemarks(log.remarks);
        if (parsed.pcs !== null && parsed.pcs !== undefined && parsed.pcs > 0) {
          const rejPcs = parsed.rejPcs || (Number(log.rejection_pcs || 0) > 0 ? Number(log.rejection_pcs) : 0);
          return Math.max(0, parsed.pcs - rejPcs);
        }
        if (log.output_pcs !== undefined && log.output_pcs !== null && Number(log.output_pcs) > 0) {
          const rejPcs = Number(log.rejection_pcs || 0);
          return Math.max(0, Number(log.output_pcs) - rejPcs);
        }
        if (fallbackAvg > 0) {
          return Math.round(htcOkVal / fallbackAvg);
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

    // Summary accumulator across all work centers
    const workCenterSummary: Record<
      StageCode,
      { label: string; stage_code: StageCode; availMtr: number; availPcs: number; availMt: number; count: number }
    > = {
      HOT_ROLLING: { label: "Hot Rolling Mill", stage_code: "HOT_ROLLING", availMtr: 0, availPcs: 0, availMt: 0, count: 0 },
      HTC: { label: "HTC", stage_code: "HTC", availMtr: 0, availPcs: 0, availMt: 0, count: 0 },
      ROLLING: { label: "Rolling Mill (Legacy)", stage_code: "ROLLING", availMtr: 0, availPcs: 0, availMt: 0, count: 0 },
      HOLLOW_HEAT_TREATMENT: { label: "Hollow Heat Treatment", stage_code: "HOLLOW_HEAT_TREATMENT", availMtr: 0, availPcs: 0, availMt: 0, count: 0 },
      IP_CUTTING: { label: "IP Cutting (Band Saw)", stage_code: "IP_CUTTING", availMtr: 0, availPcs: 0, availMt: 0, count: 0 },
      DRAW: { label: "Draw Bench", stage_code: "DRAW", availMtr: 0, availPcs: 0, availMt: 0, count: 0 },
      PILGER: { label: "Cold Pilger Mill", stage_code: "PILGER", availMtr: 0, availPcs: 0, availMt: 0, count: 0 },
      HEAT_TREATMENT: { label: "Heat Treatment", stage_code: "HEAT_TREATMENT", availMtr: 0, availPcs: 0, availMt: 0, count: 0 },
      BAND_SAW: { label: "Band Saw", stage_code: "BAND_SAW", availMtr: 0, availPcs: 0, availMt: 0, count: 0 },
      VDI: { label: "VDI / QC Inspection", stage_code: "VDI", availMtr: 0, availPcs: 0, availMt: 0, count: 0 },
      FINISHING: { label: "Finishing Line", stage_code: "FINISHING", availMtr: 0, availPcs: 0, availMt: 0, count: 0 },
    };

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

        const isIpCut = Boolean(parsed?.is_ip_cutting);
        const ipCutLen = parsed?.ip_cut_length ? Number(parsed.ip_cut_length) : null;
        const ipMult = parsed?.ip_multiple ? Number(parsed.ip_multiple) : 1;

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
            is_ip_cutting: isIpCut,
            ip_cut_length: ipCutLen,
            ip_multiple: ipMult,
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
          if (isIpCut) {
            existingPlan.is_ip_cutting = true;
            existingPlan.ip_cut_length = ipCutLen;
            existingPlan.ip_multiple = ipMult;
          }
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

              const childCustomCapPcs = Number(child.order_capping_pcs || child.capping_pcs || 0);
              const childCustomCapMtr = Number(child.order_capping_mtr || child.capping_mtr || 0);
              const cCappingMtr = childCustomCapMtr > 0 ? childCustomCapMtr : Number((cTotalOrderMtr * 1.10).toFixed(2));
              const cCappingPcs = childCustomCapPcs > 0 ? childCustomCapPcs : (cAvg > 0 ? Math.round(cCappingMtr / cAvg) : 0);

              return {
                ...child,
                work_order_id: cId,
                id: cId,
                work_order_no: child.work_order_no || cWo?.work_order_no || "Child Order",
                customer_name: child.customer_name || cWo?.customer_name || null,
                specification: child.specification || cWo?.specification || child.grade || cWo?.grade || null,
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
              is_ip_cutting: isIpCut,
              ip_cut_length: ipCutLen,
              ip_multiple: ipMult,
            });

            for (const child of enrichedChildOrders) {
              childWoMap.set(child.work_order_id, {
                ...child,
                master_wo_id: p.work_order_id,
                master_wo_no: parsed.master_wo_no,
                master_plan_no: combinedPlanNos.join(', ') || p.plan_no,
                master_plan_id: p.id,
                route_id: p.process_route_id,
                is_ip_cutting: isIpCut || Boolean(child.is_ip_cutting),
                ip_cut_length: ipCutLen || (child.ip_cut_length ? Number(child.ip_cut_length) : null),
                ip_multiple: ipMult || (child.ip_multiple ? Number(child.ip_multiple) : 1),
              });
            }
          } else if (existing) {
            const combinedPlanNos = Array.from(new Set([...(existing.plan_nos || [existing.plan_no]), planNoStr].filter(Boolean)));
            existing.plan_nos = combinedPlanNos;
            existing.plan_no = combinedPlanNos.join(', ');
            existing.master_planned_mtr = (existing.master_planned_mtr || 0) + masterPlannedMtr;
            existing.total_campaign_mtr = (existing.total_campaign_mtr || 0) + totalCampaignMtr;
            if (isIssued) existing.is_issued = true;
            if (isIpCut) {
              existing.is_ip_cutting = true;
              existing.ip_cut_length = ipCutLen;
              existing.ip_multiple = ipMult;
            }
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
            is_ip_cutting: Boolean(parsed.is_ip_cutting || mParsed.is_ip_cutting),
            ip_cut_length: parsed.ip_cut_length ? Number(parsed.ip_cut_length) : (mParsed.ip_cut_length ? Number(mParsed.ip_cut_length) : null),
            ip_multiple: parsed.ip_multiple ? Number(parsed.ip_multiple) : (mParsed.ip_multiple ? Number(mParsed.ip_multiple) : 1),
          });
        }
      } catch {
        // text status
      }
    }

    // Build complete WIP details for all active work orders / campaigns
    const allCalculatedRows: Map<
      string,
      {
        queueRows: Record<StageCode, Row | null>;
        pipeline: WorkCenterWipInfo[];
        bandSawLotRows?: Row[];
        vdiLotRows?: Row[];
        vdiSalvageRow?: Row | null;
      }
    > = new Map();

    const rollingPlanRows: Row[] = [];

    // Collect all candidate master / standalone work orders
    const candidateWoIds = new Set<string>();
    plans.forEach((p) => {
      let isChild = false;
      try {
        const parsed = typeof p.status === "string" ? JSON.parse(p.status) : p.status;
        isChild = Boolean(parsed?.is_child);
      } catch {}
      // If this plan is a master or standalone plan, its work order is a candidate master WO
      if (!isChild) {
        candidateWoIds.add(p.work_order_id);
      } else if (!childWoMap.has(p.work_order_id)) {
        candidateWoIds.add(p.work_order_id);
      }
    });
    logs.forEach((l) => {
      if (!childWoMap.has(l.work_order_id)) candidateWoIds.add(l.work_order_id);
    });
    diversions.forEach((d: any) => {
      if (d.target_wo_id && !childWoMap.has(d.target_wo_id)) candidateWoIds.add(d.target_wo_id);
      if (d.source_wo_id && !childWoMap.has(d.source_wo_id)) candidateWoIds.add(d.source_wo_id);
    });

    for (const woId of candidateWoIds) {
      const wo = woMap.get(woId);
      if (!wo) continue;

      const campaign = masterCampaignMap.get(woId);
      const plan = plans.find((p) => p.work_order_id === woId);
      const planInfo = planByWoMap.get(woId);
      const isRollingPlanIssued = campaign ? Boolean(campaign.is_issued) : Boolean(planInfo?.is_issued);

      const targetDiv = diversions.find((d: any) => d.target_wo_id === woId);
      const routeId = campaign?.route_id || plan?.process_route_id || targetDiv?.process_route_id || routes[0]?.id;
      const route = routeMap.get(routeId);
      const routeCode = route?.route_code || "CDS";
      const routeName = route?.route_name || "Standard CDS";

      const isCds = routeCode === "CDS" || routeCode === "ALLOY_CDS";
      const isAlloy = routeCode.includes("ALLOY");
      const isSsSteel = routeCode === "SS_STEEL";

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

      const multiple = Number(campaign?.multiple || plan?.multiple || targetDiv?.multiple || 1);

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
      const hotRollLogs = getStageLogs(woId, hotRollingStageId);
      const rollLogs = hotRollLogs.length > 0 ? hotRollLogs : getStageLogs(woId, rollingStageId);
      const rollGrossPcs = sumPcs(rollLogs, effMhAvg);
      const rollRejPcs = sumRejPcs(rollLogs, effMhAvg);
      const rollNetPcs = Math.max(0, rollGrossPcs - rollRejPcs);

      const rawRollOut = sumQty(rollLogs, "output_qty");
      const rawRollRej = sumQty(rollLogs, "rejection_qty");
      const rollOutMtr = rawRollOut > 0 ? rawRollOut : (effMhAvg > 0 ? Number((rollGrossPcs * effMhAvg).toFixed(3)) : 0);
      const rollRejMtr = rawRollRej > 0 ? rawRollRej : (effMhAvg > 0 ? Number((rollRejPcs * effMhAvg).toFixed(3)) : 0);
      const rollNetMtr = Math.max(0, rollOutMtr - rollRejMtr);

      // 1. Rolling Available WIP & Target Tracking
      const rollDivIn = getStageDivIn(woId, "HOT_ROLLING") || getStageDivIn(woId, "ROLLING");
      const rollDivOut = getStageDivOut(woId, "HOT_ROLLING") || getStageDivOut(woId, "ROLLING");
      const rollDivInPcs = effMhAvg > 0 ? Math.round(rollDivIn / effMhAvg) : 0;
      const rollDivOutPcs = effMhAvg > 0 ? Math.round(rollDivOut / effMhAvg) : 0;
      const rollTotalLoggedPcs = rollGrossPcs + rollRejPcs;

      let rollAvailPcs = Math.max(0, totalCampaignPcs + rollDivInPcs - rollTotalLoggedPcs - rollDivOutPcs);
      let rollAvailMtr = effMhAvg > 0 ? Number((rollAvailPcs * effMhAvg).toFixed(3)) : Math.max(0, totalCampaignMtr + rollDivIn - (rollOutMtr + rollRejMtr) - rollDivOut);
      let rollAvailMt = mtFromMtr(rollAvailMtr, mhOd, mhWt);

      // 1.5 HTC (Hot Test Check) Stage Metrics
      const htcLogs = getStageLogs(woId, htcStageId);
      const htcTestedPcs = sumPcs(htcLogs, effMhAvg);
      const htcRejPcs = sumRejPcs(htcLogs, effMhAvg);

      // Hot Rolling Mill Output: strictly new pipes from HOT_ROLLING
      const hotRollGrossPcs = sumPcs(hotRollLogs, effMhAvg);
      const hotRollRejPcs = sumRejPcs(hotRollLogs, effMhAvg);
      const hotRollNetPcs = Math.max(0, hotRollGrossPcs - hotRollRejPcs);
      const hotRollOutMtr = sumQty(hotRollLogs, "output_qty");
      const hotRollRejMtr = sumQty(hotRollLogs, "rejection_qty");
      const hotRollNetMtr = Math.max(0, hotRollOutMtr - hotRollRejMtr);

      // Legacy rolling logs: under the legacy system, ROLLING already included HTC check
      const legacyRollLogs = hotRollLogs.length === 0 ? rollLogs : [];
      const legacyHtcOkPcs = sumHtcOkPcs(legacyRollLogs, effMhAvg);
      const rawLegacyHtcOk = sumQty(legacyRollLogs, "htc_ok");
      const legacyRollGrossPcs = sumPcs(legacyRollLogs, effMhAvg);
      const legacyRollRejPcs = sumRejPcs(legacyRollLogs, effMhAvg);
      const legacyRollNetPcs = Math.max(0, legacyRollGrossPcs - legacyRollRejPcs);
      const legacyRollNetMtr = Math.max(0, sumQty(legacyRollLogs, "output_qty") - sumQty(legacyRollLogs, "rejection_qty"));

      // Incoming HTC pieces = new hot rolled pipes (legacy rolling pipes already had HTC performed)
      const incomingHtcPcs = hotRollNetPcs;
      const incomingHtcMtr = hotRollNetMtr;

      const rawHtcOk = sumQty(htcLogs, "htc_ok") || rawLegacyHtcOk;
      const loggedHtcOkPcs = sumHtcOkPcs(htcLogs, effMhAvg) || legacyHtcOkPcs;
      const htcOkPcs = loggedHtcOkPcs > 0
        ? loggedHtcOkPcs
        : (htcTestedPcs > 0
            ? Math.max(0, htcTestedPcs - htcRejPcs)
            : (hotRollLogs.length === 0 ? legacyRollNetPcs : 0));
      const htcOkMtr = rawHtcOk > 0
        ? rawHtcOk
        : (effMhAvg > 0
            ? Number((htcOkPcs * effMhAvg).toFixed(3))
            : (hotRollLogs.length === 0 ? legacyRollNetMtr : 0));

      const htcDivIn = getStageDivIn(woId, "HTC");
      const htcDivOut = getStageDivOut(woId, "HTC");
      const htcDivInPcs = effMhAvg > 0 ? Math.round(htcDivIn / effMhAvg) : 0;
      const htcDivOutPcs = effMhAvg > 0 ? Math.round(htcDivOut / effMhAvg) : 0;

      let htcAvailPcs = Math.max(0, incomingHtcPcs + htcDivInPcs - htcTestedPcs - htcDivOutPcs);
      let htcAvailMtr = effMhAvg > 0 ? Number((htcAvailPcs * effMhAvg).toFixed(3)) : Math.max(0, incomingHtcMtr + htcDivIn - (sumQty(htcLogs, "output_qty") + sumQty(htcLogs, "rejection_qty")) - htcDivOut);
      let htcAvailMt = mtFromMtr(htcAvailMtr, mhOd, mhWt);

      const rollHtcOkPcs = htcOkPcs;
      const rollHtcOkMtr = htcOkMtr;

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
      const hhtDivInPcs = getStageDivInPcs(woId, "HOLLOW_HEAT_TREATMENT", effHhtAvg > 0 ? effHhtAvg : avgLength);
      const hhtDivOutPcs = getStageDivOutPcs(woId, "HOLLOW_HEAT_TREATMENT", effHhtAvg > 0 ? effHhtAvg : avgLength);

      // Hollow HT incoming: strictly from Rolling HTC OK!
      const isHhtRoute = isAlloy || routeCode.includes("ALLOY");
      const hhtRejDecl = getStageRejDecl(woId, "HOLLOW_HEAT_TREATMENT");
      const hollowHtRemMtr = Math.max(0, rollHtcOkMtr + hhtDivIn - hollowHtOutMtr - hollowHtRejMtr - hhtDivOut - hhtRejDecl.mtr);
      const hollowHtRemPcs = Math.max(0, (effHhtAvg > 0 ? Math.round(hollowHtRemMtr / effHhtAvg) : (rollHtcOkPcs + hhtDivInPcs - hollowHtOutPcs - hollowHtRejPcs - hhtDivOutPcs)) - hhtRejDecl.pcs);
      let hollowHtAvailPcs = isHhtRoute ? (hollowHtRemMtr >= 1.0 ? Math.max(1, hollowHtRemPcs) : 0) : 0;
      let hollowHtAvailMtr = isHhtRoute ? (hollowHtAvailPcs > 0 ? Number(hollowHtRemMtr.toFixed(3)) : 0) : 0;
      const hollowHtEffOd = mhOd > 0 ? mhOd : Number(wo.size_od || 0);
      const hollowHtEffWt = mhWt > 0 ? mhWt : Number(wo.size_wt || 0);
      let hollowHtAvailMt = mtFromMtr(hollowHtAvailMtr, hollowHtEffOd, hollowHtEffWt);

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
      const drawDivInPcs = getStageDivInPcs(woId, "DRAW", effMhAvg > 0 ? effMhAvg : avgLength);
      const drawDivOutPcs = getStageDivOutPcs(woId, "DRAW", effMhAvg > 0 ? effMhAvg : avgLength);

      // 2.5 IP Cutting Stage Metrics (between Rolling/HTC/HHT and Cold Draw Bench)
      const childPlanInfo = childWoMap.get(woId);
      const isIpCutting = Boolean(planInfo?.is_ip_cutting || campaign?.is_ip_cutting || childPlanInfo?.is_ip_cutting);
      const ipCutLength = Number(planInfo?.ip_cut_length || campaign?.ip_cut_length || childPlanInfo?.ip_cut_length || 0);
      const ipMultiple = Number(planInfo?.ip_multiple || campaign?.ip_multiple || childPlanInfo?.ip_multiple || 1);

      const ipCutLogs = getStageLogs(woId, ipCuttingStageId, "IP_CUTTING");
      const allIpCutLogs = [...ipCutLogs];
      if (campaign && Array.isArray(campaign.child_work_orders)) {
        for (const child of campaign.child_work_orders) {
          const cId = child.work_order_id || child.id;
          allIpCutLogs.push(...getStageLogs(cId, ipCuttingStageId, "IP_CUTTING"));
        }
      }

      const ipCutOutPcs = sumPcs(allIpCutLogs, ipCutLength > 0 ? ipCutLength : effMhAvg);
      const ipCutRejPcs = sumRejPcs(allIpCutLogs, ipCutLength > 0 ? ipCutLength : effMhAvg);
      const ipCutNetPcs = Math.max(0, ipCutOutPcs - ipCutRejPcs);
      const rawIpCutOutMtr = sumQty(allIpCutLogs, "output_qty");
      const rawIpCutRejMtr = sumQty(allIpCutLogs, "rejection_qty");
      const ipCutOutMtr = rawIpCutOutMtr > 0 ? rawIpCutOutMtr : (ipCutLength > 0 ? Number((ipCutOutPcs * ipCutLength).toFixed(3)) : Number((ipCutOutPcs * effMhAvg).toFixed(3)));
      const ipCutRejMtr = rawIpCutRejMtr > 0 ? rawIpCutRejMtr : (ipCutLength > 0 ? Number((ipCutRejPcs * ipCutLength).toFixed(3)) : Number((ipCutRejPcs * effMhAvg).toFixed(3)));
      const ipCutNetMtr = Math.max(0, ipCutOutMtr - ipCutRejMtr);

      let ipMotherPcsCut = 0;
      for (const log of allIpCutLogs) {
        const { motherPcs: mPcs } = extractBandSawCutsFromRemarks(log.remarks);
        if (mPcs != null && mPcs > 0) {
          ipMotherPcsCut += mPcs;
        } else {
          const p = getLogPcs(log, ipCutLength > 0 ? ipCutLength : effMhAvg);
          ipMotherPcsCut += ipMultiple > 1 ? Math.ceil(p / ipMultiple) : p;
        }
      }

      // Material feeding IP Cutting: HTC OK (for CDS) or Hollow HT OK (for ALLOY_CDS)
      const ipCutFeederPcs = isAlloy ? hollowHtNetPcs : rollHtcOkPcs;
      const ipCutFeederMtr = isAlloy ? hollowHtNetMtr : rollHtcOkMtr;
      const ipCutFeederMt = mtFromMtr(ipCutFeederMtr, mhOd > 0 ? mhOd : Number(wo.size_od || 0), mhWt > 0 ? mhWt : Number(wo.size_wt || 0));

      const ipCutAvailPcs = isIpCutting ? Math.max(0, ipCutFeederPcs - ipMotherPcsCut) : 0;
      const ipCutAvailMtr = effMhAvg > 0 ? Number((ipCutAvailPcs * effMhAvg).toFixed(3)) : 0;
      const ipCutAvailMt = mtFromMtr(ipCutAvailMtr, mhOd > 0 ? mhOd : Number(wo.size_od || 0), mhWt > 0 ? mhWt : Number(wo.size_wt || 0));

      const isIpCutReady = ipCutAvailMtr >= 1.0 || ipCutAvailPcs >= 1;
      const isIpCutFeeder = !isIpCutReady && (ipCutFeederMtr >= 1.0 || ipCutFeederPcs >= 1);

      // Draw incoming:
      // - When IP Cutting enabled: incoming is IP Cutting Net Passed Cut Pieces
      // - CDS route without IP Cutting: incoming is Rolling HTC OK pieces
      // - ALLOY_CDS without IP Cutting: incoming is Hollow HT Net Output pieces
      const drawIncomingPcs = isIpCutting
        ? ipCutNetPcs
        : (isAlloy ? hollowHtNetPcs : rollHtcOkPcs);

      const drawIncomingMtr = isIpCutting
        ? ipCutNetMtr
        : (isAlloy ? hollowHtNetMtr : rollHtcOkMtr);

      let drawAvailPcs = isCds
        ? Math.max(0, drawIncomingPcs + drawDivInPcs - drawOutPcs - drawRejPcs - drawDivOutPcs)
        : 0;
      const effDrawLen = isIpCutting && ipCutLength > 0
        ? ipCutLength
        : (effMhAvg > 0 ? effMhAvg : (mhAvgLength > 0 ? mhAvgLength : avgLength));
      let drawAvailMtr = effDrawLen > 0 ? Number((drawAvailPcs * effDrawLen).toFixed(3)) : 0;
      let drawAvailMt = mtFromMtr(drawAvailMtr, mhOd > 0 ? mhOd : Number(wo.size_od || 0), mhWt > 0 ? mhWt : Number(wo.size_wt || 0));

      // 3.5 Pilger Stage Metrics (for SS_STEEL route)
      const pilgerLogs = getStageLogs(woId, pilgerStageId);
      const pilgerOutPcs = sumPcs(pilgerLogs, avgLength);
      const pilgerRejPcs = sumRejPcs(pilgerLogs, avgLength);
      const pilgerNetPcs = Math.max(0, pilgerOutPcs - pilgerRejPcs);
      const rawPilgerOut = sumQty(pilgerLogs, "output_qty");
      const rawPilgerRej = sumQty(pilgerLogs, "rejection_qty");
      const pilgerOutMtr = rawPilgerOut > 0 ? rawPilgerOut : (avgLength > 0 ? Number((pilgerOutPcs * avgLength).toFixed(3)) : 0);
      const pilgerRejMtr = rawPilgerRej > 0 ? rawPilgerRej : (avgLength > 0 ? Number((pilgerRejPcs * avgLength).toFixed(3)) : 0);
      const pilgerNetMtr = Math.max(0, pilgerOutMtr - pilgerRejMtr);

      const effPilgerLen = effMhAvg > 0 ? effMhAvg : (mhAvgLength > 0 ? mhAvgLength : avgLength);
      const pilgerDivIn = getStageDivIn(woId, "PILGER");
      const pilgerDivOut = getStageDivOut(woId, "PILGER");
      const pilgerDivInPcs = getStageDivInPcs(woId, "PILGER", effPilgerLen > 0 ? effPilgerLen : avgLength);
      const pilgerDivOutPcs = getStageDivOutPcs(woId, "PILGER", effPilgerLen > 0 ? effPilgerLen : avgLength);

      const pilgerIncomingPcs = rollHtcOkPcs;
      let pilgerAvailPcs = isSsSteel
        ? Math.max(0, pilgerIncomingPcs + pilgerDivInPcs - pilgerOutPcs - pilgerRejPcs - pilgerDivOutPcs)
        : 0;
      let pilgerAvailMtr = effPilgerLen > 0 ? Number((pilgerAvailPcs * effPilgerLen).toFixed(3)) : 0;
      let pilgerAvailMt = mtFromMtr(pilgerAvailMtr, mhOd > 0 ? mhOd : Number(wo.size_od || 0), mhWt > 0 ? mhWt : Number(wo.size_wt || 0));

      // 4. Heat Treatment Stage Metrics (adjusted for HT Diversions & Downstream Consumption)
      const htLogs = getStageLogs(woId, htStageId);
      const allHtLogsList = [...htLogs];
      if (campaign && Array.isArray(campaign.child_work_orders)) {
        for (const child of campaign.child_work_orders) {
          const cId = child.work_order_id || child.id;
          allHtLogsList.push(...getStageLogs(cId, htStageId));
        }
      }
      const htOutPcs = sumPcs(allHtLogsList, avgLength);
      const htRejPcs = sumRejPcs(allHtLogsList, avgLength);
      const htNetPcs = Math.max(0, htOutPcs - htRejPcs);
      const rawHtOut = sumQty(allHtLogsList, "output_qty");
      const rawHtRej = sumQty(allHtLogsList, "rejection_qty");
      const htOutMtr = rawHtOut > 0 ? rawHtOut : (avgLength > 0 ? Number((htOutPcs * avgLength).toFixed(3)) : 0);
      const htRejMtr = rawHtRej > 0 ? rawHtRej : (avgLength > 0 ? Number((htRejPcs * avgLength).toFixed(3)) : 0);
      const htNetMtr = Math.max(0, htOutMtr - htRejMtr);

      const htDivIn = getStageDivIn(woId, "HEAT_TREATMENT");
      const htDivOut = getStageDivOut(woId, "HEAT_TREATMENT");
      const htDivInPcs = getStageDivInPcs(woId, "HEAT_TREATMENT", avgLength);
      const htDivOutPcs = getStageDivOutPcs(woId, "HEAT_TREATMENT", avgLength);

      const htIncomingPcs = isSsSteel ? pilgerNetPcs : drawNetPcs;

      // Check QC Inspections for this WO (or related campaign)
      const directWoQcList = qcInspections.filter((q: any) => q.work_order_id === woId);
      let woQcList = directWoQcList;
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
      const qcDirectSalvageMtr = woQcList.reduce((sum: number, q: any) => sum + Number(q.vdi_salvage_mtr || 0), 0);
      const qcSalvageMtr = qcDirectSalvageMtr > 0 ? qcDirectSalvageMtr : (avgLength > 0 ? Number((qcSalvagePcs * avgLength).toFixed(3)) : 0);
      const qcSalvageMt = mtFromMtr(qcSalvageMtr, Number(wo.size_od || 0), Number(wo.size_wt || 0));
      const qcRejMtr = avgLength > 0 ? Number((qcRejPcs * avgLength).toFixed(3)) : 0;

      // Direct QC for this specific work order
      const directQcOkPcs = directWoQcList.reduce((sum: number, q: any) => sum + Number(q.vdi_ok_pcs || 0), 0);

      // 4.5 Band Saw Stage Metrics (between HT / Hollow HT / Rolling and VDI)
      const bandSawLogs = getStageLogs(woId, bandSawStageId);
      const allBandSawLogs = [...bandSawLogs];
      if (campaign && Array.isArray(campaign.child_work_orders)) {
        for (const child of campaign.child_work_orders) {
          const cId = child.work_order_id || child.id;
          allBandSawLogs.push(...getStageLogs(cId, bandSawStageId));
        }
      }
      const bandSawOutPcs = sumPcs(allBandSawLogs, avgLength);
      const bandSawRejPcs = sumRejPcs(allBandSawLogs, avgLength);
      const bandSawNetPcs = Math.max(0, bandSawOutPcs - bandSawRejPcs);
      const rawBandSawOutMtr = sumQty(allBandSawLogs, "output_qty");
      const rawBandSawRejMtr = sumQty(allBandSawLogs, "rejection_qty");
      const bandSawOutMtr = rawBandSawOutMtr > 0 ? rawBandSawOutMtr : (avgLength > 0 ? Number((bandSawOutPcs * avgLength).toFixed(3)) : 0);
      const bandSawRejMtr = rawBandSawRejMtr > 0 ? rawBandSawRejMtr : (avgLength > 0 ? Number((bandSawRejPcs * avgLength).toFixed(3)) : 0);
      const bandSawNetMtr = Math.max(0, bandSawOutMtr - bandSawRejMtr);

      let bsMotherPcsCut = 0;
      for (const log of allBandSawLogs) {
        const { motherPcs: mPcs } = extractBandSawCutsFromRemarks(log.remarks);
        if (mPcs != null && mPcs > 0) {
          bsMotherPcsCut += mPcs;
        } else {
          const p = getLogPcs(log, avgLength);
          bsMotherPcsCut += multiple > 1 ? Math.ceil(p / multiple) : p;
        }
      }

      const bandSawDivIn = getStageDivIn(woId, "BAND_SAW");
      const bandSawDivOut = getStageDivOut(woId, "BAND_SAW");
      const bandSawDivInPcs = getStageDivInPcs(woId, "BAND_SAW", avgLength);
      const bandSawDivOutPcs = getStageDivOutPcs(woId, "BAND_SAW", avgLength);

      // 5. Finishing Stage Metrics (adjusted for Finishing Diversions)
      const finLogs = getStageLogs(woId, finStageId);
      const directFinOutPcs = sumPcs(finLogs, avgLength);
      const directFinRejPcs = sumRejPcs(finLogs, avgLength);
      let finOutPcs = directFinOutPcs;
      let finRejPcs = directFinRejPcs;

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

      // Heat treatment incoming: strictly from Draw (or Pilger) net output pieces minus downstream processed
      const mult = multiple > 0 ? multiple : 1;
      const htPassedPcs = Math.max(
        htOutPcs + htRejPcs,
        bsMotherPcsCut,
        mult > 1 ? Math.ceil((bandSawOutPcs + bandSawRejPcs) / mult) : (bandSawOutPcs + bandSawRejPcs),
        mult > 1 ? Math.ceil(qcInspectedPcs / mult) : qcInspectedPcs,
        mult > 1 ? Math.ceil((finOutPcs + finRejPcs) / mult) : (finOutPcs + finRejPcs)
      );
      const htRejDecl = getStageRejDecl(woId, "HEAT_TREATMENT");
      let htAvailPcs = (isCds || isSsSteel)
        ? Math.max(0, htIncomingPcs + htDivInPcs - htPassedPcs - htDivOutPcs - htRejDecl.pcs)
        : 0;
      let htAvailMtr = avgLength > 0 ? Number((htAvailPcs * avgLength).toFixed(3)) : 0;
      let htAvailMt = mtFromMtr(htAvailMtr, Number(wo.size_od || 0), Number(wo.size_wt || 0));

      // Apply rejection declarations to Draw availability (Rule 1 & Rule 2: Preceding Stage OK - Current Stage OK)
      const drawRejDecl = getStageRejDecl(woId, "DRAW");
      const effDrawRej = Math.max(drawRejPcs, drawRejDecl.pcs);
      if (isCds) {
        drawAvailPcs = Math.max(0, drawIncomingPcs + drawDivInPcs - (drawOutPcs + effDrawRej) - drawDivOutPcs);
        drawAvailMtr = effDrawLen > 0 ? Number((drawAvailPcs * effDrawLen).toFixed(3)) : 0;
        drawAvailMt = mtFromMtr(drawAvailMtr, mhOd > 0 ? mhOd : Number(wo.size_od || 0), mhWt > 0 ? mhWt : Number(wo.size_wt || 0));
      }

      // Apply rejection declarations to Pilger availability (Rule 1 & Rule 2: Preceding Stage OK - Current Stage OK)
      const pilgerRejDecl = getStageRejDecl(woId, "PILGER");
      if (isSsSteel) {
        pilgerAvailPcs = Math.max(0, pilgerIncomingPcs + pilgerDivInPcs - (pilgerOutPcs + pilgerRejPcs) - pilgerDivOutPcs - pilgerRejDecl.pcs);
        pilgerAvailMtr = effPilgerLen > 0 ? Number((pilgerAvailPcs * effPilgerLen).toFixed(3)) : 0;
        pilgerAvailMt = mtFromMtr(pilgerAvailMtr, mhOd > 0 ? mhOd : Number(wo.size_od || 0), mhWt > 0 ? mhWt : Number(wo.size_wt || 0));
      }

      const bandSawIncomingPcs = (isCds || isSsSteel)
        ? htNetPcs
        : (isAlloy ? hollowHtNetPcs : rollHtcOkPcs);

      // Deduct whichever is greater: explicit Band Saw cuts, downstream VDI inspected pieces, or downstream Finishing
      const bandSawPassedPcs = Math.max(
        bsMotherPcsCut,
        mult > 1 ? Math.ceil((bandSawOutPcs + bandSawRejPcs) / mult) : (bandSawOutPcs + bandSawRejPcs),
        mult > 1 ? Math.ceil(qcInspectedPcs / mult) : qcInspectedPcs,
        mult > 1 ? Math.ceil((finOutPcs + finRejPcs) / mult) : (finOutPcs + finRejPcs)
      );
      const bsRejDecl = getStageRejDecl(woId, "BAND_SAW");
      let bandSawAvailPcs = Math.max(0, bandSawIncomingPcs + bandSawDivInPcs - bandSawPassedPcs - bandSawDivOutPcs - bsRejDecl.pcs);
      let bandSawAvailMtr = avgLength > 0 ? Number((bandSawAvailPcs * avgLength).toFixed(3)) : 0;
      let bandSawAvailMt = mtFromMtr(bandSawAvailMtr, Number(wo.size_od || 0), Number(wo.size_wt || 0));

      // VDI Stage WIP (Waiting for QC Inspection)
      const vdiDivIn = getStageDivIn(woId, "VDI");
      const vdiDivOut = getStageDivOut(woId, "VDI");
      let vdiDivInPcs = getStageDivInPcs(woId, "VDI", avgLength);
      let effVdiDivInMtr = vdiDivIn;
      const vdiDivOutPcs = getStageDivOutPcs(woId, "VDI", avgLength);
      const vdiRejDecl = getStageRejDecl(woId, "VDI");

      // Distinguish salvage diversions out vs prime diversions out from VDI
      const vdiSalvageDivOut = diversions
        .filter(
          (d: any) =>
            d.source_wo_id === woId &&
            (parseDivStages(d).sourceStage === "VDI_SALVAGE" ||
              (parseDivStages(d).sourceStage === "VDI" &&
                typeof d.reason === "string" &&
                (d.reason.includes("Salvage") || d.reason.includes("Rejection"))))
        )
        .reduce((sum: number, d: any) => sum + Number(d.diverted_qty || 0), 0);
      const vdiSalvageDivOutPcs = avgLength > 0 ? Math.round(vdiSalvageDivOut / avgLength) : 0;

      const vdiPrimeDivOut = Math.max(0, vdiDivOut - vdiSalvageDivOut);
      const vdiPrimeDivOutPcs = Math.max(0, vdiDivOutPcs - vdiSalvageDivOutPcs);

      // VDI incoming: strictly from Band Saw Net Output Pieces
      const vdiIncomingPcs = allBandSawLogs.length > 0 ? bandSawNetPcs : 0;
      const vdiIncomingMtr = allBandSawLogs.length > 0 ? bandSawNetMtr : 0;

      // When material was diverted into VDI without Band Saw cuts, and inspection was completed or downstream bundling started:
      if (allBandSawLogs.length === 0 && vdiDivIn > 0 && qcInspectedPcs > 0 && (finOutPcs > 0 || qcInspectedPcs >= vdiDivInPcs * 0.9)) {
        vdiDivInPcs = Math.min(vdiDivInPcs, qcInspectedPcs);
        effVdiDivInMtr = Math.min(effVdiDivInMtr, qcInspectedMtr);
      }

      let vdiAvailPcs = Math.max(0, vdiIncomingPcs + vdiDivInPcs - qcInspectedPcs - vdiDivOutPcs - vdiRejDecl.pcs);
      let vdiAvailMtr = Math.max(0, Number((vdiIncomingMtr + effVdiDivInMtr - qcInspectedMtr - vdiDivOut - vdiRejDecl.mtr).toFixed(3)));
      if (vdiAvailPcs <= 0 && vdiAvailMtr > 0 && avgLength > 0 && qcInspectedPcs === 0) {
        vdiAvailPcs = Math.max(1, Math.round(vdiAvailMtr / avgLength));
      } else if (vdiAvailPcs <= 0) {
        vdiAvailMtr = 0;
      } else if (vdiAvailMtr === 0 && vdiAvailPcs > 0 && avgLength > 0) {
        vdiAvailMtr = Number((vdiAvailPcs * avgLength).toFixed(3));
      }
      let vdiAvailMt = mtFromMtr(vdiAvailMtr, Number(wo.size_od || 0), Number(wo.size_wt || 0));

      const finDivIn = getStageDivIn(woId, "FINISHING");
      const finDivOut = getStageDivOut(woId, "FINISHING");
      const totalFinDivOut = finDivOut + vdiPrimeDivOut;
      const finDivInPcs = getStageDivInPcs(woId, "FINISHING", avgLength);
      const finDivOutPcs = getStageDivOutPcs(woId, "FINISHING", avgLength) + vdiPrimeDivOutPcs;
      const finRejDecl = getStageRejDecl(woId, "FINISHING");

      const isCampaignMaster = Boolean(campaign && Array.isArray(campaign.child_work_orders) && campaign.child_work_orders.length > 0);
      // For Master campaign WO, finishing WIP only comes from QC records done directly against this master WO.
      // If all QC was separated against child WOs, child WOs own the finishing WIP in childFinishingRows.
      const finIncomingPcs = isCampaignMaster ? directQcOkPcs : Math.round(qcOkPcs);
      const finConsumedPcs = isCampaignMaster ? (directFinOutPcs + directFinRejPcs) : (finOutPcs + finRejPcs);

      let finAvailPcs = Math.max(0, finIncomingPcs + finDivInPcs - finConsumedPcs - finDivOutPcs - finRejDecl.pcs);
      const finIncomingMtr = avgLength > 0 ? Number((finIncomingPcs * avgLength).toFixed(3)) : 0;
      let finAvailMtr = Math.max(0, Number((finIncomingMtr + finDivIn - (finOutMtr + finRejMtr) - totalFinDivOut - finRejDecl.mtr).toFixed(3)));
      if (finAvailPcs <= 0 && finAvailMtr > 0 && avgLength > 0 && finConsumedPcs === 0) {
        finAvailPcs = Math.max(1, Math.round(finAvailMtr / avgLength));
      } else if (finAvailPcs <= 0) {
        finAvailMtr = 0;
      } else if (finAvailMtr === 0 && finAvailPcs > 0 && avgLength > 0) {
        finAvailMtr = Number((finAvailPcs * avgLength).toFixed(3));
      }
      let finAvailMt = mtFromMtr(finAvailMtr, Number(wo.size_od || 0), Number(wo.size_wt || 0));

      // Universal Rule: Work orders marked Completed / Closed must not show phantom WIP in upstream stations.
      // Exception: For a master campaign whose child work orders are still active (In Progress / Pending),
      // the upstream campaign stock (e.g. Draw Bench queue) is real feeding inventory and must remain available.
      const isOrderCompletedRaw = (wo.status || "").toLowerCase() === "completed" || (wo.status || "").toLowerCase() === "closed";
      const hasActiveChildOrders = Boolean(
        campaign &&
        Array.isArray(campaign.child_work_orders) &&
        campaign.child_work_orders.some((c: any) => {
          const childWo = woMap.get(c.work_order_id || c.id);
          const st = (childWo?.status || "").toLowerCase();
          return st !== "completed" && st !== "closed";
        })
      );
      const isOrderCompleted = isOrderCompletedRaw && !hasActiveChildOrders;
      if (isOrderCompleted) {
        rollAvailPcs = 0; rollAvailMtr = 0; rollAvailMt = 0;
        hollowHtAvailPcs = 0; hollowHtAvailMtr = 0; hollowHtAvailMt = 0;
        drawAvailPcs = 0; drawAvailMtr = 0; drawAvailMt = 0;
        pilgerAvailPcs = 0; pilgerAvailMtr = 0; pilgerAvailMt = 0;
        htAvailPcs = 0; htAvailMtr = 0; htAvailMt = 0;
        bandSawAvailPcs = 0; bandSawAvailMtr = 0; bandSawAvailMt = 0;
        vdiAvailPcs = 0; vdiAvailMtr = 0; vdiAvailMt = 0;
        if (Number(wo.balance_qty_mtr ?? 0) === 0 && Number(wo.balance_qty_pcs ?? 0) === 0) {
          finAvailPcs = 0; finAvailMtr = 0; finAvailMt = 0;
        }
      }
      if (isOrderCompletedRaw && Number(wo.balance_qty_mtr ?? 0) === 0 && Number(wo.balance_qty_pcs ?? 0) === 0) {
        finAvailPcs = 0; finAvailMtr = 0; finAvailMt = 0;
      }


      // Build WorkCenterWipInfo pipeline for this order
      const pipeline: WorkCenterWipInfo[] = [
        {
          stage_code: "HOT_ROLLING",
          stage_name: "Hot Rolling Mill",
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
          htc_ok_mtr: rollNetMtr,
          htc_ok_pcs: rollNetPcs,
          htc_ok_mt: mtFromMtr(rollNetMtr, mhOd, mhWt),
        },
        {
          stage_code: "HTC",
          stage_name: "HTC",
          sequence_no: 2,
          available_mtr: htcAvailMtr,
          available_pcs: htcAvailPcs,
          available_mt: htcAvailMt,
          gross_output_mtr: sumQty(htcLogs, "output_qty") || rollNetMtr,
          gross_output_pcs: htcTestedPcs > 0 ? htcTestedPcs : rollNetPcs,
          gross_output_mt: mtFromMtr(sumQty(htcLogs, "output_qty") || rollNetMtr, mhOd, mhWt),
          rejection_mtr: htcRejPcs > 0 ? sumQty(htcLogs, "rejection_qty") : 0,
          rejection_pcs: htcRejPcs,
          rejection_mt: mtFromMtr(sumQty(htcLogs, "rejection_qty"), mhOd, mhWt),
          net_output_mtr: htcOkMtr,
          net_output_pcs: htcOkPcs,
          net_output_mt: mtFromMtr(htcOkMtr, mhOd, mhWt),
          htc_ok_mtr: htcOkMtr,
          htc_ok_pcs: htcOkPcs,
          htc_ok_mt: mtFromMtr(htcOkMtr, mhOd, mhWt),
        },
        {
          stage_code: "ROLLING",
          stage_name: "Rolling (Legacy)",
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

      if (isSsSteel) {
        pipeline.push({
          stage_code: "PILGER",
          stage_name: "Cold Pilger Mill",
          sequence_no: 2,
          available_mtr: pilgerAvailMtr,
          available_pcs: pilgerAvailPcs,
          available_mt: pilgerAvailMt,
          gross_output_mtr: pilgerOutMtr,
          gross_output_pcs: pilgerOutPcs,
          gross_output_mt: mtFromMtr(pilgerOutMtr, Number(wo.size_od || 0), Number(wo.size_wt || 0)),
          rejection_mtr: pilgerRejMtr,
          rejection_pcs: pilgerRejPcs,
          rejection_mt: mtFromMtr(pilgerRejMtr, Number(wo.size_od || 0), Number(wo.size_wt || 0)),
          net_output_mtr: pilgerNetMtr,
          net_output_pcs: pilgerNetPcs,
          net_output_mt: mtFromMtr(pilgerNetMtr, Number(wo.size_od || 0), Number(wo.size_wt || 0)),
        });

        pipeline.push({
          stage_code: "HEAT_TREATMENT",
          stage_name: "Heat Treatment",
          sequence_no: 3,
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
        workCenterSummary.HOT_ROLLING.availMtr += rollAvailMtr;
        workCenterSummary.HOT_ROLLING.availPcs += rollAvailPcs;
        workCenterSummary.HOT_ROLLING.availMt += rollAvailMt;
        workCenterSummary.HOT_ROLLING.count += 1;

        workCenterSummary.ROLLING.availMtr += rollAvailMtr;
        workCenterSummary.ROLLING.availPcs += rollAvailPcs;
        workCenterSummary.ROLLING.availMt += rollAvailMt;
        workCenterSummary.ROLLING.count += 1;
      }
      if (htcAvailMtr >= 1.0 || htcAvailPcs >= 1) {
        workCenterSummary.HTC.availMtr += htcAvailMtr;
        workCenterSummary.HTC.availPcs += htcAvailPcs;
        workCenterSummary.HTC.availMt += htcAvailMt;
        workCenterSummary.HTC.count += 1;
      }
      if (isAlloy && (hollowHtAvailMtr >= 1.0 || hollowHtAvailPcs >= 1)) {
        workCenterSummary.HOLLOW_HEAT_TREATMENT.availMtr += hollowHtAvailMtr;
        workCenterSummary.HOLLOW_HEAT_TREATMENT.availPcs += hollowHtAvailPcs;
        workCenterSummary.HOLLOW_HEAT_TREATMENT.availMt += hollowHtAvailMt;
        workCenterSummary.HOLLOW_HEAT_TREATMENT.count += 1;
      }
      if (isIpCutting && (ipCutAvailMtr >= 1.0 || ipCutAvailPcs >= 1)) {
        workCenterSummary.IP_CUTTING.availMtr += ipCutAvailMtr;
        workCenterSummary.IP_CUTTING.availPcs += ipCutAvailPcs;
        workCenterSummary.IP_CUTTING.availMt += ipCutAvailMt;
        workCenterSummary.IP_CUTTING.count += 1;

        // Till final draw complete, IP cut stock is part of Draw Bench WIP
        workCenterSummary.DRAW.availMtr += ipCutAvailMtr;
        workCenterSummary.DRAW.availPcs += ipCutAvailPcs * (ipMultiple || 1);
        workCenterSummary.DRAW.availMt += ipCutAvailMt;
      }
      if (isCds && (drawAvailMtr >= 1.0 || drawAvailPcs >= 1)) {
        workCenterSummary.DRAW.availMtr += drawAvailMtr;
        workCenterSummary.DRAW.availPcs += drawAvailPcs;
        workCenterSummary.DRAW.availMt += drawAvailMt;
        workCenterSummary.DRAW.count += 1;
      }
      if (isSsSteel && (pilgerAvailMtr >= 1.0 || pilgerAvailPcs >= 1)) {
        workCenterSummary.PILGER.availMtr += pilgerAvailMtr;
        workCenterSummary.PILGER.availPcs += pilgerAvailPcs;
        workCenterSummary.PILGER.availMt += pilgerAvailMt;
        workCenterSummary.PILGER.count += 1;
      }
      if ((isCds || isSsSteel) && (htAvailMtr >= 1.0 || htAvailPcs >= 1)) {
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

      const parsedPlanStatus = typeof plan?.status === "string" ? JSON.parse(plan.status) : plan?.status || {};
      const customCapPcs = Number(parsedPlanStatus?.order_capping_pcs || parsedPlanStatus?.capping_pcs || (campaign as any)?.order_capping_pcs || 0);
      const customCapMtr = Number(parsedPlanStatus?.order_capping_mtr || parsedPlanStatus?.capping_mtr || (campaign as any)?.order_capping_mtr || 0);

      const campaignMasterPlannedPcs = campaign?.child_work_orders ? (
        Number(campaign.planned_pcs || 0) + (campaign.child_work_orders || []).reduce((s: number, c: any) => s + Number(c.total_order_pcs || c.planned_pcs || 0), 0)
      ) : 0;

      const defaultCapPcs = campaignMasterPlannedPcs > totalOrderPcs
        ? Math.round(campaignMasterPlannedPcs * 1.10)
        : (avgLength > 0 ? Math.round((totalOrderMtr * 1.10) / avgLength) : 0);

      const defaultCapMtr = campaignMasterPlannedPcs > totalOrderPcs && avgLength > 0
        ? Number((defaultCapPcs * avgLength).toFixed(2))
        : Number((totalOrderMtr * 1.10).toFixed(2));

      const orderCappingMtr = customCapMtr > 0 ? customCapMtr : defaultCapMtr;
      const orderCappingPcs = customCapPcs > 0 ? customCapPcs : defaultCapPcs;

      // Pre-build Row objects for this work order for all 6 stages
      const rollingDate = rollLogs.length > 0
        ? (rollLogs[0].process_date ? String(rollLogs[0].process_date).slice(0, 10) : (rollLogs[0].created_at ? String(rollLogs[0].created_at).slice(0, 10) : null))
        : null;

      const woDivDetails = getWoDivDetails(wo.id);

      const baseRowData = {
        work_order_id: wo.id,
        work_order_no: wo.work_order_no,
        customer_name: wo.customer_name || null,
        specification: wo.specification || wo.grade || null,
        grade: wo.grade || null,
        has_diversion: woDivDetails.has_diversion,
        diversion_in_pcs: woDivDetails.diversion_in_pcs,
        diversion_in_mtr: woDivDetails.diversion_in_mtr,
        diversion_source_wo: woDivDetails.diversion_source_wo,
        diversion_remarks: woDivDetails.diversion_remarks,
        od: woOd,
        wl: woWt,
        final_od: woOd,
        final_wt: woWt,
        size_od: woOd,
        size_wt: woWt,
        l1,
        l2,
        avg_length: avgLength,
        order_status: wo.status || (balanceToMakeOrderPcs === 0 ? "Completed" : "In Progress"),
        balance_qty_pcs: wo.balance_qty_pcs != null ? Number(wo.balance_qty_pcs) : balanceToMakeOrderPcs,
        balance_qty_mtr: wo.balance_qty_mtr != null ? Number(wo.balance_qty_mtr) : balanceToMakeOrderMtr,
        rolling_date: rollingDate,
        total_order_pcs: totalOrderPcs,
        total_order_mtr: totalOrderMtr,
        total_order_mt: totalOrderMt,
        balance_to_make_order_pcs: balanceToMakeOrderPcs,
        balance_to_make_order_mtr: balanceToMakeOrderMtr,
        balance_to_make_order_mt: balanceToMakeOrderMt,
        finished_output_mtr: woFinishedMtr,
        finished_output_pcs: woFinishedPcs,
        vdi_salvage_pcs: 0,
        vdi_salvage_mtr: 0,
        order_capping_mtr: orderCappingMtr,
        order_capping_pcs: orderCappingPcs,
        rolled_pcs: rollGrossPcs,
        rolled_mtr: rollOutMtr,
        rolled_mt: mtFromMtr(rollOutMtr, mhOd, mhWt),
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

      // Find all distinct HT Lot Nos from upstream Heat Treatment (or Hollow HT) for this work order
      const allHtLogs = [...htLogs, ...hollowHtLogs].sort(
        (a, b) => new Date(b.created_at || b.process_date || 0).getTime() - new Date(a.created_at || a.process_date || 0).getTime()
      );
      const htLotMap = new Map<string, { lot_no: string; pcs: number; mtr: number }>();
      for (const log of allHtLogs) {
        const lot = (log.heat_lot_no || "").trim();
        if (!lot) continue;
        const outPcs = Number(log.output_pcs || 0) || (avgLength > 0 ? Math.round(Number(log.output_qty || 0) / avgLength) : 0);
        const outMtr = Number(log.output_qty || 0);
        if (!htLotMap.has(lot)) {
          htLotMap.set(lot, { lot_no: lot, pcs: outPcs, mtr: outMtr });
        } else {
          const existing = htLotMap.get(lot)!;
          existing.pcs += outPcs;
          existing.mtr += outMtr;
        }
      }
      const htLots = Array.from(htLotMap.values());
      const latestHtLotNo = htLots.length > 0 ? htLots[0].lot_no : "";

      // Find all distinct Band Saw Logs for this work order
      const sortedBandSawLogs = [...bandSawLogs].sort(
        (a, b) => new Date(b.created_at || b.process_date || 0).getTime() - new Date(a.created_at || a.process_date || 0).getTime()
      );
      const bandSawLotMap = new Map<string, { lot_no: string; pcs: number; mtr: number }>();
      for (const log of sortedBandSawLogs) {
        const lot = (log.heat_lot_no || "").trim();
        if (!lot) continue;
        const outPcs = Number(log.output_pcs || 0) || (avgLength > 0 ? Math.round(Number(log.output_qty || 0) / avgLength) : 0);
        const outMtr = Number(log.output_qty || 0);
        if (!bandSawLotMap.has(lot)) {
          bandSawLotMap.set(lot, { lot_no: lot, pcs: outPcs, mtr: outMtr });
        } else {
          const existing = bandSawLotMap.get(lot)!;
          existing.pcs += outPcs;
          existing.mtr += outMtr;
        }
      }
      const bandSawLots = Array.from(bandSawLotMap.values());
      const vdiLots = bandSawLots.length > 0 ? bandSawLots : htLots;
      const latestBandSawLotNo = bandSawLots.length > 0 ? bandSawLots[0].lot_no : latestHtLotNo;

      // Feeder WIP metrics for upstream planning (Draw from Rolling Plan, HT from DB Qty, Finishing from HT Qty)

      // 1. Hollow HT Feeder: Rolling Plan issued quantity
      const hhtFeederPcs = isAlloy ? Math.max(0, totalCampaignPcs - hollowHtOutPcs - hollowHtRejPcs - hhtRejDecl.pcs) : 0;
      const hhtFeederMtr = effHhtAvg > 0 ? Number((hhtFeederPcs * effHhtAvg).toFixed(3)) : Math.max(0, totalCampaignMtr - hollowHtOutMtr - hollowHtRejMtr - hhtRejDecl.mtr);
      const hhtFeederMt = mtFromMtr(hhtFeederMtr, hollowHtEffOd, hollowHtEffWt);

      // 2. Draw Bench Feeder: Rolling Plan issued quantity (or Hollow HT output for Alloy, or IP Cutting for IP Cutting)
      const drawFeederPcs = isCds
        ? Math.max(0, isIpCutting ? (ipCutNetPcs - drawOutPcs - drawRejPcs - drawRejDecl.pcs) : (isAlloy ? (hollowHtNetPcs + hollowHtAvailPcs - drawOutPcs - drawRejPcs - drawRejDecl.pcs) : (totalCampaignPcs - drawOutPcs - drawRejPcs - drawRejDecl.pcs)))
        : 0;
      const drawFeederMtr = effDrawLen > 0 ? Number((drawFeederPcs * effDrawLen).toFixed(3)) : Math.max(0, totalCampaignMtr - drawOutMtr - drawRejMtr - drawRejDecl.mtr);
      const drawFeederMt = mtFromMtr(drawFeederMtr, mhOd > 0 ? mhOd : woOd, mhWt > 0 ? mhWt : woWt);

      // 3. Pilger Mill Feeder: Rolling Plan issued quantity
      const pilgerFeederPcs = isSsSteel ? Math.max(0, totalCampaignPcs - pilgerOutPcs - pilgerRejPcs - pilgerRejDecl.pcs) : 0;
      const pilgerFeederMtr = effPilgerLen > 0 ? Number((pilgerFeederPcs * effPilgerLen).toFixed(3)) : Math.max(0, totalCampaignMtr - pilgerOutMtr - pilgerRejMtr - pilgerRejDecl.mtr);
      const pilgerFeederMt = mtFromMtr(pilgerFeederMtr, mhOd > 0 ? mhOd : woOd, mhWt > 0 ? mhWt : woWt);

      // 4. Heat Treatment Feeder: Draw Bench (DB) QTY (drawn pieces + un-drawn DB WIP)
      const dbWaitingToDraw = drawAvailPcs > 0 ? drawAvailPcs : (totalCampaignPcs > 0 ? Math.max(0, totalCampaignPcs - drawOutPcs - drawRejPcs - drawRejDecl.pcs) : 0);
      const dbTotalPipeline = isSsSteel ? (pilgerAvailPcs + pilgerNetPcs) : (dbWaitingToDraw + drawNetPcs);
      const htFeederPcs = (isCds || isSsSteel) ? Math.max(0, dbTotalPipeline - htOutPcs - htRejPcs - htRejDecl.pcs) : 0;
      const htFeederMtr = avgLength > 0 ? Number((htFeederPcs * avgLength).toFixed(3)) : 0;
      const htFeederMt = mtFromMtr(htFeederMtr, woOd, woWt);

      // 5. Band Saw Feeder: Heat Treatment (HT) QTY (heat treated pieces + HT WIP)
      const bsRemainingHt = (isCds || isSsSteel)
        ? Math.max(0, (htAvailPcs + htNetPcs) - bandSawOutPcs - bandSawRejPcs - bsRejDecl.pcs)
        : (isAlloy ? Math.max(0, (hollowHtAvailPcs + hollowHtNetPcs) - bandSawOutPcs - bandSawRejPcs - bsRejDecl.pcs) : Math.max(0, rollHtcOkPcs - bandSawOutPcs - bandSawRejPcs - bsRejDecl.pcs));
      const bsFeederPcs = Math.max(0, bsRemainingHt);
      const bsFeederMtr = avgLength > 0 ? Number((bsFeederPcs * avgLength).toFixed(3)) : 0;
      const bsFeederMt = mtFromMtr(bsFeederMtr, woOd, woWt);

      // 6. VDI Feeder: Band Saw Cut Qty
      const vdiWaitingCut = Math.round(bandSawAvailPcs * mult);
      const vdiFeederPcs = Math.max(0, (vdiWaitingCut + bandSawNetPcs) - qcInspectedPcs - vdiRejDecl.pcs);
      const vdiFeederMtr = avgLength > 0 ? Number((vdiFeederPcs * avgLength).toFixed(3)) : 0;
      const vdiFeederMt = mtFromMtr(vdiFeederMtr, woOd, woWt);

      // 7. Finishing Feeder: Heat Treatment (HT) QTY (cut piece equivalent) / VDI QC
      const htCutPieces = Math.round((htAvailPcs + htNetPcs) * mult);
      const finFeederPcs = Math.max(0, htCutPieces - finOutPcs - finRejPcs - finRejDecl.pcs);
      const finFeederMtr = avgLength > 0 ? Number((finFeederPcs * avgLength).toFixed(3)) : Math.max(0, (htAvailMtr + htNetMtr) - (finOutMtr + finRejMtr) - finRejDecl.mtr);
      const finFeederMt = mtFromMtr(finFeederMtr, woOd, woWt);

      const isHhtReady = hollowHtAvailMtr >= 1.0 || hollowHtAvailPcs >= 1;
      const isHhtFeeder = !isHhtReady && (hhtFeederMtr >= 1.0 || hhtFeederPcs >= 1);

      const isDrawReady = drawAvailMtr >= 1.0 || drawAvailPcs >= 1;
      const isDrawFeeder = !isDrawReady && (drawFeederMtr >= 1.0 || drawFeederPcs >= 1);

      const isPilgerReady = pilgerAvailMtr >= 1.0 || pilgerAvailPcs >= 1;
      const isPilgerFeeder = !isPilgerReady && (pilgerFeederMtr >= 1.0 || pilgerFeederPcs >= 1);

      const isHtReady = htAvailMtr >= 1.0 || htAvailPcs >= 1;
      const isHtFeeder = !isHtReady && (htFeederMtr >= 1.0 || htFeederPcs >= 1);

      const isBsReady = bandSawAvailMtr >= 1.0 || bandSawAvailPcs >= 1;
      const isBsFeeder = !isBsReady && (bsFeederMtr >= 1.0 || bsFeederPcs >= 1);

      const isVdiReady = vdiAvailPcs >= 1 && vdiAvailMtr >= 0.5;
      const isVdiFeeder = !isVdiReady && (vdiFeederMtr >= 1.0 || vdiFeederPcs >= 1);

      const isFinReady = finAvailPcs >= 1 && finAvailMtr >= 0.5;
      const isFinFeeder = !isFinReady && (finFeederMtr >= 1.0 || finFeederPcs >= 1);

      const rollDivDetails = getStageDivDetails(woId, "HOT_ROLLING", effMhAvg > 0 ? effMhAvg : avgLength);
      const htcDivDetails = getStageDivDetails(woId, "HTC", effMhAvg > 0 ? effMhAvg : avgLength);
      const legacyRollDivDetails = getStageDivDetails(woId, "ROLLING", effMhAvg > 0 ? effMhAvg : avgLength);
      const hhtDivDetails = getStageDivDetails(woId, "HOLLOW_HEAT_TREATMENT", effHhtAvg > 0 ? effHhtAvg : avgLength);
      const drawDivDetails = getStageDivDetails(woId, "DRAW", effDrawLen > 0 ? effDrawLen : avgLength);
      const pilgerDivDetails = getStageDivDetails(woId, "PILGER", effPilgerLen > 0 ? effPilgerLen : avgLength);
      const htDivDetails = getStageDivDetails(woId, "HEAT_TREATMENT", avgLength);
      const bsDivDetails = getStageDivDetails(woId, "BAND_SAW", avgLength);
      const vdiDivDetails = getStageDivDetails(woId, "VDI", avgLength);
      const finDivDetails = getStageDivDetails(woId, "FINISHING", avgLength);

      const queueRows: Record<StageCode, Row | null> = {
        HOT_ROLLING:
          (isRollingPlanIssued && (rollAvailMtr >= 1.0 || rollAvailPcs >= 1)) || (rollGrossPcs > 0 || rollOutMtr > 0)
            ? {
                ...baseRowData,
                ...(rollDivDetails.has_diversion ? rollDivDetails : {}),
                od: woOd,
                wl: woWt,
                l1: mhL1 > 0 ? mhL1 : l1,
                l2: mhL2 > 0 ? mhL2 : l2,
                avg_length: effMhAvg > 0 ? effMhAvg : avgLength,
                stage_code: "HOT_ROLLING",
                stage_name: "Hot Rolling Mill",
                balance_to_make_mtr: rollAvailMtr,
                balance_to_make_pcs: rollAvailPcs,
                balance_to_make_mt: rollAvailMt,
                ready_pcs: rollAvailPcs,
                ready_mtr: rollAvailMtr,
                ready_mt: rollAvailMt,
                rolled_pcs: rollGrossPcs,
                rolled_mtr: rollOutMtr,
                rolled_mt: mtFromMtr(rollOutMtr, mhOd, mhWt),
                feeder_pcs: rollAvailPcs,
                feeder_mtr: rollAvailMtr,
                feeder_mt: rollAvailMt,
                is_feeder_source: rollAvailPcs <= 0,
                planned_rolling_total: totalCampaignMtr,
                max_allowed_mtr: null,
                max_allowed_pcs: null,
                prev_gross_output: rollOutMtr + rollRejMtr,
                feeder_source_label: "Active Rolling Plan",
                feeder_stage_code: "ROLLING_PLAN",
              }
            : null,
        HTC:
          (htcAvailMtr >= 1.0 || htcAvailPcs >= 1)
            ? {
                ...baseRowData,
                ...(htcDivDetails.has_diversion ? htcDivDetails : {}),
                od: woOd,
                wl: woWt,
                l1: mhL1 > 0 ? mhL1 : l1,
                l2: mhL2 > 0 ? mhL2 : l2,
                avg_length: effMhAvg > 0 ? effMhAvg : avgLength,
                stage_code: "HTC",
                stage_name: "HTC",
                balance_to_make_mtr: htcAvailMtr,
                balance_to_make_pcs: htcAvailPcs,
                balance_to_make_mt: htcAvailMt,
                ready_pcs: htcAvailPcs,
                ready_mtr: htcAvailMtr,
                ready_mt: htcAvailMt,
                feeder_pcs: htcAvailPcs,
                feeder_mtr: htcAvailMtr,
                feeder_mt: htcAvailMt,
                is_feeder_source: false,
                max_allowed_mtr: htcAvailMtr,
                max_allowed_pcs: htcAvailPcs,
                prev_stage_code: "HOT_ROLLING",
                prev_net_output: rollNetMtr,
                feeder_source_label: "Hot Mill Rolling Net OK",
                feeder_stage_code: "HOT_ROLLING",
              }
            : null,
        ROLLING:
          isRollingPlanIssued && (rollAvailMtr >= 1.0 || rollAvailPcs >= 1)
            ? {
                ...baseRowData,
                ...(legacyRollDivDetails.has_diversion ? legacyRollDivDetails : {}),
                od: woOd,
                wl: woWt,
                l1: mhL1 > 0 ? mhL1 : l1,
                l2: mhL2 > 0 ? mhL2 : l2,
                avg_length: effMhAvg > 0 ? effMhAvg : avgLength,
                stage_code: "ROLLING",
                balance_to_make_mtr: rollAvailMtr,
                balance_to_make_pcs: rollAvailPcs,
                balance_to_make_mt: rollAvailMt,
                ready_pcs: rollAvailPcs,
                ready_mtr: rollAvailMtr,
                ready_mt: rollAvailMt,
                feeder_pcs: rollAvailPcs,
                feeder_mtr: rollAvailMtr,
                feeder_mt: rollAvailMt,
                is_feeder_source: false,
                planned_rolling_total: totalCampaignMtr,
                max_allowed_mtr: null,
                max_allowed_pcs: null,
                prev_gross_output: rollOutMtr + rollRejMtr,
                feeder_source_label: "Active Rolling Plan",
                feeder_stage_code: "ROLLING_PLAN",
              }
            : null,
        HOLLOW_HEAT_TREATMENT:
          isAlloy && (isHhtReady || isHhtFeeder)
            ? {
                ...baseRowData,
                ...(hhtDivDetails.has_diversion ? hhtDivDetails : {}),
                od: woOd,
                wl: woWt,
                l1: mhL1 > 0 ? mhL1 : l1,
                l2: mhL2 > 0 ? mhL2 : l2,
                avg_length: effHhtAvg > 0 ? effHhtAvg : avgLength,
                stage_code: "HOLLOW_HEAT_TREATMENT",
                balance_to_make_mtr: isHhtReady ? hollowHtAvailMtr : hhtFeederMtr,
                balance_to_make_pcs: isHhtReady ? hollowHtAvailPcs : hhtFeederPcs,
                balance_to_make_mt: isHhtReady ? hollowHtAvailMt : hhtFeederMt,
                ready_pcs: isHhtReady ? hollowHtAvailPcs : 0,
                ready_mtr: isHhtReady ? hollowHtAvailMtr : 0,
                ready_mt: isHhtReady ? hollowHtAvailMt : 0,
                feeder_pcs: hhtFeederPcs,
                feeder_mtr: hhtFeederMtr,
                feeder_mt: hhtFeederMt,
                is_feeder_source: isHhtFeeder,
                max_allowed_mtr: isHhtReady ? hollowHtAvailMtr : hhtFeederMtr,
                max_allowed_pcs: isHhtReady ? hollowHtAvailPcs : hhtFeederPcs,
                prev_stage_code: "ROLLING",
                prev_htc_ok: rollHtcOkMtr,
                feeder_source_label: isHhtReady ? "Rolling HTC OK" : "Rolling Plan Issued",
                feeder_stage_code: "ROLLING",
              }
            : null,
        IP_CUTTING:
          isIpCutting && (isIpCutReady || isIpCutFeeder)
            ? {
                ...baseRowData,
                stage_code: "IP_CUTTING",
                stage_name: "IP Cutting (Band Saw)",
                od: mhOd > 0 ? mhOd : woOd,
                wl: mhWt > 0 ? mhWt : woWt,
                l1: ipCutLength > 0 ? ipCutLength : (mhL1 > 0 ? mhL1 : l1),
                l2: ipCutLength > 0 ? ipCutLength : (mhL2 > 0 ? mhL2 : l2),
                avg_length: ipCutLength > 0 ? ipCutLength : (effMhAvg > 0 ? effMhAvg : avgLength),
                balance_to_make_mtr: isIpCutReady ? ipCutAvailMtr : ipCutFeederMtr,
                balance_to_make_pcs: isIpCutReady ? ipCutAvailPcs : ipCutFeederPcs,
                balance_to_make_mt: isIpCutReady ? ipCutAvailMt : ipCutFeederMt,
                ready_pcs: isIpCutReady ? ipCutAvailPcs : 0,
                ready_mtr: isIpCutReady ? ipCutAvailMtr : 0,
                ready_mt: isIpCutReady ? ipCutAvailMt : 0,
                feeder_pcs: ipCutFeederPcs,
                feeder_mtr: ipCutFeederMtr,
                feeder_mt: ipCutFeederMt,
                is_feeder_source: isIpCutFeeder,
                max_allowed_mtr: isIpCutReady ? ipCutAvailMtr : ipCutFeederMtr,
                max_allowed_pcs: isIpCutReady ? ipCutAvailPcs : ipCutFeederPcs,
                prev_stage_code: isAlloy ? "HOLLOW_HEAT_TREATMENT" : "HTC",
                prev_htc_ok: isAlloy ? undefined : rollHtcOkMtr,
                prev_net_output: isAlloy ? hollowHtNetMtr : rollHtcOkMtr,
                feeder_source_label: isAlloy ? "Hollow HT Qty" : "HTC OK Qty",
                feeder_stage_code: isAlloy ? "HOLLOW_HEAT_TREATMENT" : "HTC",
                is_ip_cutting: true,
                ip_cut_length: ipCutLength,
                ip_multiple: ipMultiple,
              }
            : null,
        DRAW:
          isCds && (isDrawReady || isDrawFeeder)
            ? {
                ...baseRowData,
                ...(drawDivDetails.has_diversion ? drawDivDetails : {}),
                od: woOd,
                wl: woWt,
                avg_length: effDrawLen > 0 ? effDrawLen : avgLength,
                stage_code: "DRAW",
                balance_to_make_mtr: isDrawReady ? drawAvailMtr : drawFeederMtr,
                balance_to_make_pcs: isDrawReady ? drawAvailPcs : drawFeederPcs,
                balance_to_make_mt: isDrawReady ? drawAvailMt : drawFeederMt,
                ready_pcs: isDrawReady ? drawAvailPcs : 0,
                ready_mtr: isDrawReady ? drawAvailMtr : 0,
                ready_mt: isDrawReady ? drawAvailMt : 0,
                feeder_pcs: drawFeederPcs,
                feeder_mtr: drawFeederMtr,
                feeder_mt: drawFeederMt,
                is_feeder_source: isDrawFeeder,
                max_allowed_mtr: isDrawReady ? drawAvailMtr : drawFeederMtr,
                max_allowed_pcs: isDrawReady ? drawAvailPcs : drawFeederPcs,
                prev_stage_code: isIpCutting ? "IP_CUTTING" : (isAlloy ? "HOLLOW_HEAT_TREATMENT" : "ROLLING"),
                prev_htc_ok: isIpCutting ? undefined : (isAlloy ? undefined : rollHtcOkMtr),
                prev_net_output: isIpCutting ? ipCutNetMtr : (isAlloy ? hollowHtNetMtr : undefined),
                feeder_source_label: isIpCutting ? "IP Cutting (Band Saw) OK" : (isDrawReady ? (isAlloy ? "Hollow HT Net OK" : "Rolling HTC OK") : (isAlloy ? "Hollow HT Net OK" : "Rolling Plan Issued")),
                feeder_stage_code: isIpCutting ? "IP_CUTTING" : (isAlloy ? "HOLLOW_HEAT_TREATMENT" : "ROLLING"),
                is_ip_cutting: isIpCutting,
                ip_cut_length: ipCutLength,
                ip_multiple: ipMultiple,
              }
            : null,
        PILGER:
          isSsSteel && (isPilgerReady || isPilgerFeeder)
            ? {
                ...baseRowData,
                ...(pilgerDivDetails.has_diversion ? pilgerDivDetails : {}),
                od: woOd,
                wl: woWt,
                avg_length: effPilgerLen > 0 ? effPilgerLen : avgLength,
                stage_code: "PILGER",
                balance_to_make_mtr: isPilgerReady ? pilgerAvailMtr : pilgerFeederMtr,
                balance_to_make_pcs: isPilgerReady ? pilgerAvailPcs : pilgerFeederPcs,
                balance_to_make_mt: isPilgerReady ? pilgerAvailMt : pilgerFeederMt,
                ready_pcs: isPilgerReady ? pilgerAvailPcs : 0,
                ready_mtr: isPilgerReady ? pilgerAvailMtr : 0,
                ready_mt: isPilgerReady ? pilgerAvailMt : 0,
                feeder_pcs: pilgerFeederPcs,
                feeder_mtr: pilgerFeederMtr,
                feeder_mt: pilgerFeederMt,
                is_feeder_source: isPilgerFeeder,
                max_allowed_mtr: isPilgerReady ? pilgerAvailMtr : pilgerFeederMtr,
                max_allowed_pcs: isPilgerReady ? pilgerAvailPcs : pilgerFeederPcs,
                prev_stage_code: "ROLLING",
                prev_htc_ok: rollHtcOkMtr,
                feeder_source_label: isPilgerReady ? "Rolling HTC OK" : "Rolling Plan Issued",
                feeder_stage_code: "ROLLING",
              }
            : null,
        HEAT_TREATMENT:
          (isCds || isSsSteel) && (isHtReady || isHtFeeder)
            ? {
                ...baseRowData,
                ...(htDivDetails.has_diversion ? htDivDetails : {}),
                stage_code: "HEAT_TREATMENT",
                balance_to_make_mtr: isHtReady ? htAvailMtr : htFeederMtr,
                balance_to_make_pcs: isHtReady ? htAvailPcs : htFeederPcs,
                balance_to_make_mt: isHtReady ? htAvailMt : htFeederMt,
                ready_pcs: isHtReady ? htAvailPcs : 0,
                ready_mtr: isHtReady ? htAvailMtr : 0,
                ready_mt: isHtReady ? htAvailMt : 0,
                feeder_pcs: htFeederPcs,
                feeder_mtr: htFeederMtr,
                feeder_mt: htFeederMt,
                is_feeder_source: isHtFeeder,
                max_allowed_mtr: isHtReady ? htAvailMtr : htFeederMtr,
                max_allowed_pcs: isHtReady ? htAvailPcs : htFeederPcs,
                prev_stage_code: isSsSteel ? "PILGER" : "DRAW",
                prev_net_output: isSsSteel ? pilgerNetMtr : drawNetMtr,
                feeder_source_label: isSsSteel ? "Cold Pilger Mill Qty" : "Draw Bench (DB) Qty",
                feeder_stage_code: isSsSteel ? "PILGER" : "DRAW",
              }
            : null,
        BAND_SAW:
          (isBsReady || isBsFeeder)
            ? {
                ...baseRowData,
                ...(bsDivDetails.has_diversion ? bsDivDetails : {}),
                stage_code: "BAND_SAW",
                heat_lot_no: latestHtLotNo,
                heat_lots: htLots,
                balance_to_make_mtr: isBsReady ? bandSawAvailMtr : bsFeederMtr,
                balance_to_make_pcs: isBsReady ? bandSawAvailPcs : bsFeederPcs,
                balance_to_make_mt: isBsReady ? bandSawAvailMt : bsFeederMt,
                ready_pcs: isBsReady ? bandSawAvailPcs : 0,
                ready_mtr: isBsReady ? bandSawAvailMtr : 0,
                ready_mt: isBsReady ? bandSawAvailMt : 0,
                feeder_pcs: bsFeederPcs,
                feeder_mtr: bsFeederMtr,
                feeder_mt: bsFeederMt,
                is_feeder_source: isBsFeeder,
                max_allowed_mtr: isBsReady ? bandSawAvailMtr : bsFeederMtr,
                max_allowed_pcs: isBsReady ? bandSawAvailPcs : bsFeederPcs,
                prev_stage_code: (isCds || isSsSteel) ? "HEAT_TREATMENT" : (isAlloy ? "HOLLOW_HEAT_TREATMENT" : "ROLLING"),
                prev_htc_ok: !isCds && !isAlloy && !isSsSteel ? rollHtcOkMtr : undefined,
                prev_net_output: (isCds || isSsSteel) ? htNetMtr : (isAlloy ? hollowHtNetMtr : undefined),
                feeder_source_label: (isCds || isSsSteel) ? "Heat Treatment (HT) Qty" : (isAlloy ? "Hollow HT Qty" : "Rolling HTC OK"),
                feeder_stage_code: (isCds || isSsSteel) ? "HEAT_TREATMENT" : (isAlloy ? "HOLLOW_HEAT_TREATMENT" : "ROLLING"),
              }
            : null,
        VDI:
          (isVdiReady || isVdiFeeder)
            ? {
                ...baseRowData,
                ...(vdiDivDetails.has_diversion ? vdiDivDetails : {}),
                stage_code: "VDI",
                heat_lot_no: latestBandSawLotNo,
                heat_lots: vdiLots,
                vdi_salvage_pcs: qcSalvagePcs,
                vdi_salvage_mtr: qcSalvageMtr,
                balance_to_make_mtr: isVdiReady ? vdiAvailMtr : vdiFeederMtr,
                balance_to_make_pcs: isVdiReady ? vdiAvailPcs : vdiFeederPcs,
                balance_to_make_mt: isVdiReady ? vdiAvailMt : vdiFeederMt,
                ready_pcs: isVdiReady ? vdiAvailPcs : 0,
                ready_mtr: isVdiReady ? vdiAvailMtr : 0,
                ready_mt: isVdiReady ? vdiAvailMt : 0,
                feeder_pcs: vdiFeederPcs,
                feeder_mtr: vdiFeederMtr,
                feeder_mt: vdiFeederMt,
                is_feeder_source: isVdiFeeder,
                max_allowed_mtr: isVdiReady ? vdiAvailMtr : vdiFeederMtr,
                max_allowed_pcs: isVdiReady ? vdiAvailPcs : vdiFeederPcs,
                prev_stage_code: "BAND_SAW",
                prev_htc_ok: undefined,
                prev_net_output: bandSawNetMtr,
                feeder_source_label: vdiDivIn > 0 && bandSawLogs.length === 0 ? "Diverted Material In" : "Band Saw Cut Qty",
                feeder_stage_code: "BAND_SAW",
              }
            : null,
        FINISHING:
          (isFinReady || isFinFeeder)
            ? {
                ...baseRowData,
                ...(finDivDetails.has_diversion ? finDivDetails : {}),
                stage_code: "FINISHING",
                balance_to_make_mtr: isFinReady ? finAvailMtr : finFeederMtr,
                balance_to_make_pcs: isFinReady ? finAvailPcs : finFeederPcs,
                balance_to_make_mt: isFinReady ? finAvailMt : finFeederMt,
                ready_pcs: isFinReady ? finAvailPcs : 0,
                ready_mtr: isFinReady ? finAvailMtr : 0,
                ready_mt: isFinReady ? finAvailMt : 0,
                feeder_pcs: finFeederPcs,
                feeder_mtr: finFeederMtr,
                feeder_mt: finFeederMt,
                is_feeder_source: isFinFeeder,
                max_allowed_mtr: isFinReady ? Math.min(finAvailMtr, Math.max(0, orderCappingMtr - woFinishedMtr)) : finFeederMtr,
                max_allowed_pcs: isFinReady ? (avgLength > 0 ? Math.round(Math.min(finAvailMtr, Math.max(0, orderCappingMtr - woFinishedMtr)) / avgLength) : finAvailPcs) : finFeederPcs,
                prev_stage_code: "VDI",
                prev_net_output: qcOkMtr,
                feeder_source_label: isFinReady ? (finDivIn > 0 && finIncomingPcs === 0 ? "Diverted Material In" : "VDI QC Passed") : "Heat Treatment (HT) Qty",
                feeder_stage_code: isFinReady ? "VDI" : "HEAT_TREATMENT",
              }
            : null,
      };

      // Generate individual lot rows for BAND_SAW queue (Option 2)
      const bandSawLotRows: Row[] = [];
      if (queueRows.BAND_SAW) {
        // Group bandSawLogs cut pieces by lot
        const bandSawCutByLot = new Map<string, { pcs: number; mtr: number }>();
        for (const log of allBandSawLogs) {
          const lot = (log.heat_lot_no || "").trim();
          if (!lot) continue;
          const pcs = getLogPcs(log, avgLength);
          const mtr = Number(log.output_qty || 0);
          if (!bandSawCutByLot.has(lot)) {
            bandSawCutByLot.set(lot, { pcs, mtr });
          } else {
            const ex = bandSawCutByLot.get(lot)!;
            ex.pcs += pcs;
            ex.mtr += mtr;
          }
        }

        if (htLots.length > 0) {
          for (const lot of htLots) {
            const cut = bandSawCutByLot.get(lot.lot_no) || { pcs: 0, mtr: 0 };
            const lotAvailPcs = Math.max(0, lot.pcs - cut.pcs);
            const lotAvailMtr = Math.max(0, Number((lot.mtr - cut.mtr).toFixed(3)));
            if (lotAvailPcs >= 1 || lotAvailMtr >= 1.0) {
              const lotMt = mtFromMtr(lotAvailMtr, Number(wo.size_od || 0), Number(wo.size_wt || 0));
              bandSawLotRows.push({
                ...queueRows.BAND_SAW,
                id: `${woId}_${lot.lot_no}`,
                heat_lot_no: lot.lot_no,
                heat_lots: [{ lot_no: lot.lot_no, pcs: lotAvailPcs, mtr: lotAvailMtr }],
                balance_to_make_pcs: lotAvailPcs,
                balance_to_make_mtr: lotAvailMtr,
                balance_to_make_mt: lotMt,
                max_allowed_pcs: lotAvailPcs,
                max_allowed_mtr: lotAvailMtr,
              });
            }
          }
          // Any remaining unassigned pieces
          const sumAssignedPcs = bandSawLotRows.reduce((sum, r) => sum + Number(r.balance_to_make_pcs || 0), 0);
          if (bandSawAvailPcs > sumAssignedPcs) {
            const unassignedPcs = bandSawAvailPcs - sumAssignedPcs;
            const sumAssignedMtr = bandSawLotRows.reduce((sum, r) => sum + Number(r.balance_to_make_mtr || 0), 0);
            const unassignedMtr = Math.max(0, Number((bandSawAvailMtr - sumAssignedMtr).toFixed(3)));
            if (unassignedPcs >= 1 || unassignedMtr >= 1.0) {
              bandSawLotRows.push({
                ...queueRows.BAND_SAW,
                id: `${woId}_unassigned`,
                heat_lot_no: "",
                heat_lots: undefined,
                balance_to_make_pcs: unassignedPcs,
                balance_to_make_mtr: unassignedMtr,
                balance_to_make_mt: mtFromMtr(unassignedMtr, Number(wo.size_od || 0), Number(wo.size_wt || 0)),
                max_allowed_pcs: unassignedPcs,
                max_allowed_mtr: unassignedMtr,
              });
            }
          }
        }
        if (bandSawLotRows.length === 0) {
          bandSawLotRows.push(queueRows.BAND_SAW);
        }
      }

      // Generate individual lot rows for VDI queue (Option 2)
      const vdiLotRows: Row[] = [];
      if (queueRows.VDI) {
        // Group VDI inspections by lot
        const vdiInspectedByLot = new Map<string, { pcs: number; mtr: number }>();
        for (const q of woQcList) {
          const rawLot = (q as any).heat_lot_no || (q.remarks ? q.remarks.match(/\[(?:HEAT_)?LOT:\s*([^\]]+)\]/i)?.[1] : "") || "";
          const lot = String(rawLot).trim();
          if (!lot) continue;
          const pcs = Number(q.inspected_pcs || 0) || (Number(q.vdi_ok_pcs || 0) + Number(q.vdi_salvage_pcs || 0) + Number(q.vdi_rejection_pcs || 0));
          const mtr = Number(q.inspected_mtr || 0) || (avgLength > 0 ? Number((pcs * avgLength).toFixed(3)) : 0);
          if (!vdiInspectedByLot.has(lot)) {
            vdiInspectedByLot.set(lot, { pcs, mtr });
          } else {
            const ex = vdiInspectedByLot.get(lot)!;
            ex.pcs += pcs;
            ex.mtr += mtr;
          }
        }

        if (vdiLots.length > 0) {
          for (const lot of vdiLots) {
            const insp = vdiInspectedByLot.get(lot.lot_no) || { pcs: 0, mtr: 0 };
            const lotAvailPcs = Math.max(0, lot.pcs - insp.pcs);
            const lotAvailMtr = Math.max(0, Number((lot.mtr - insp.mtr).toFixed(3)));
            if (lotAvailPcs >= 1 || lotAvailMtr >= 1.0) {
              const lotMt = mtFromMtr(lotAvailMtr, Number(wo.size_od || 0), Number(wo.size_wt || 0));
              vdiLotRows.push({
                ...queueRows.VDI,
                id: `${woId}_${lot.lot_no}`,
                heat_lot_no: lot.lot_no,
                heat_lots: [{ lot_no: lot.lot_no, pcs: lotAvailPcs, mtr: lotAvailMtr }],
                balance_to_make_pcs: lotAvailPcs,
                balance_to_make_mtr: lotAvailMtr,
                balance_to_make_mt: lotMt,
                max_allowed_pcs: lotAvailPcs,
                max_allowed_mtr: lotAvailMtr,
              });
            }
          }
          // Any remaining unassigned pieces
          const sumAssignedPcs = vdiLotRows.reduce((sum, r) => sum + Number(r.balance_to_make_pcs || 0), 0);
          if (vdiAvailPcs > sumAssignedPcs) {
            const unassignedPcs = vdiAvailPcs - sumAssignedPcs;
            const sumAssignedMtr = vdiLotRows.reduce((sum, r) => sum + Number(r.balance_to_make_mtr || 0), 0);
            const unassignedMtr = Math.max(0, Number((vdiAvailMtr - sumAssignedMtr).toFixed(3)));
            if (unassignedPcs >= 1 || unassignedMtr >= 1.0) {
              vdiLotRows.push({
                ...queueRows.VDI,
                id: `${woId}_unassigned`,
                heat_lot_no: "",
                heat_lots: undefined,
                balance_to_make_pcs: unassignedPcs,
                balance_to_make_mtr: unassignedMtr,
                balance_to_make_mt: mtFromMtr(unassignedMtr, Number(wo.size_od || 0), Number(wo.size_wt || 0)),
                max_allowed_pcs: unassignedPcs,
                max_allowed_mtr: unassignedMtr,
              });
            }
          }
        }
        if (vdiLotRows.length === 0) {
          vdiLotRows.push(queueRows.VDI);
        }
      }

      const remSalvageMtr = Math.max(0, Number((qcSalvageMtr - vdiSalvageDivOut).toFixed(3)));
      const remSalvagePcs = Math.max(0, qcSalvagePcs - vdiSalvageDivOutPcs);
      const remSalvageMt = mtFromMtr(remSalvageMtr, Number(wo.size_od || 0), Number(wo.size_wt || 0));

      const vdiSalvageRow: Row | null =
        (remSalvagePcs >= 1 || remSalvageMtr >= 1.0)
          ? {
              ...baseRowData,
              stage_code: "VDI_SALVAGE" as any,
              stage_name: "VDI Salvage",
              heat_lot_no: latestBandSawLotNo,
              balance_to_make_mtr: remSalvageMtr,
              balance_to_make_pcs: remSalvagePcs,
              balance_to_make_mt: remSalvageMt,
              ready_pcs: remSalvagePcs,
              ready_mtr: remSalvageMtr,
              ready_mt: remSalvageMt,
              vdi_salvage_pcs: remSalvagePcs,
              vdi_salvage_mtr: remSalvageMtr,
              feeder_pcs: 0,
              feeder_mtr: 0,
              feeder_mt: 0,
              is_feeder_source: false,
              max_allowed_mtr: remSalvageMtr,
              max_allowed_pcs: remSalvagePcs,
              prev_stage_code: "VDI",
              prev_net_output: qcOkMtr,
              feeder_source_label: "VDI Inspection Salvage",
              feeder_stage_code: "VDI",
            }
          : null;

      allCalculatedRows.set(woId, { queueRows, pipeline, bandSawLotRows, vdiLotRows, vdiSalvageRow });

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
            const lc = st?.lifecycle_status || (st?.issued_at ? "ISSUED" : "DRAFT");
            if (lc === "CLOSED" || lc === "SHORT_CLOSED") {
              tMtr = Number(st.closed_mtr || st.planned_mtr || pl.planned_qty || 0);
            } else {
              tMtr = Number(st.master_planned_mtr || st.planned_mtr || pl.planned_qty || 0);
            }
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
              const logDate = new Date(log.process_date || log.created_at || 0).getTime();

              // Advance to next plan if current plan is already closed or filled to its target planned quantity
              while (currentPlanIdx < sortedPlans.length - 1) {
                const currPlan = sortedPlans[currentPlanIdx];
                const currPlanId = currPlan.id;
                const target = planTargetMtr.get(currPlanId) || 0;
                const accumulated = planAccumulatedMtr.get(currPlanId) || 0;

                let isClosed = false;
                let closedDate = Infinity;
                try {
                  const st = typeof currPlan.status === "string" ? JSON.parse(currPlan.status) : currPlan.status || {};
                  const lc = st?.lifecycle_status || (st?.issued_at ? "ISSUED" : "DRAFT");
                  if (lc === "CLOSED" || lc === "SHORT_CLOSED") {
                    isClosed = true;
                    if (st.closed_at) closedDate = new Date(st.closed_at).getTime();
                  }
                } catch {}

                if ((target > 0 && accumulated >= target) || (isClosed && (accumulated >= target || logDate >= closedDate))) {
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
                  specification: child.specification || cWo?.specification || child.grade || cWo?.grade || null,
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

            // Rolling production can be entered up to 104% of Rolling Plan in Nos
            const plMaxPlannedPcs = plPlannedPcs > 0
              ? Math.round(plPlannedPcs * 1.04)
              : (effPlMhAvg > 0 ? Math.round((plPlannedMtr * 1.04) / effPlMhAvg) : 0);
            const plMaxAllowedPcs = Math.max(0, plMaxPlannedPcs - plLoggedTotalPcs);

            const plAvailMtr = plPlannedPcs > 0 && effPlMhAvg > 0
              ? Number((plAvailPcs * (plMhL1 && plMhL2 ? (plMhL1 + plMhL2) / 2 : (plMhL1 || effPlMhAvg))).toFixed(2))
              : Math.max(0, Number((plPlannedMtr - directLoggedMtr).toFixed(2)));

            const plMaxAllowedMtr = effPlMhAvg > 0
              ? Number((plMaxAllowedPcs * (plMhL1 && plMhL2 ? (plMhL1 + plMhL2) / 2 : (plMhL1 || effPlMhAvg))).toFixed(2))
              : Math.max(0, Number(((plPlannedMtr * 1.04) - directLoggedMtr).toFixed(2)));

            const plAvailMt = mtFromMtr(plAvailMtr, plMhOd, plMhWt);

            if (plAvailMtr >= 1.0 || plAvailPcs >= 1 || plMaxAllowedPcs >= 1) {
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
                ready_pcs: plAvailPcs,
                ready_mtr: plAvailMtr,
                ready_mt: plAvailMt,
                rolled_pcs: directLoggedPcs,
                rolled_mtr: directLoggedMtr,
                rolled_mt: mtFromMtr(directLoggedMtr, plMhOd, plMhWt),
                feeder_pcs: plAvailPcs,
                feeder_mtr: plAvailMtr,
                feeder_mt: plAvailMt,
                is_feeder_source: false,
                mh_od: plMhOd,
                mh_wt: plMhWt,
                mh_l1: plMhL1,
                mh_l2: plMhL2,
                mh_avg_length: effPlMhAvg,
                max_allowed_mtr: plMaxAllowedMtr,
                max_allowed_pcs: plMaxAllowedPcs,
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

      const l1 = Number(child.l1 || childWo?.l1 || 6);
      const l2 = Number(child.l2 || childWo?.l2 || 6.5);
      const avgLength = l1 > 0 && l2 > 0 ? (l1 + l2) / 2 : l1 || 6.25;

      // Child order VDI QC Inspections specifically recorded for this child order
      const childQc = qcInspections.filter((q: any) => q.work_order_id === childId);
      const childVdiOkPcs = childQc.reduce((sum: number, q: any) => sum + Number(q.vdi_ok_pcs || 0), 0);

      // Child order finishing logs
      const childFinLogs = logs.filter(
        (l) => l.work_order_id === childId && l.stage_id === finStageId
      );
      const childFinOutPcs = sumPcs(childFinLogs, avgLength);
      const childFinRejPcs = sumRejPcs(childFinLogs, avgLength);
      const childFinOutMtr = sumQty(childFinLogs, "output_qty");
      const childFinRejMtr = sumQty(childFinLogs, "rejection_qty");

      // Child order diversions in Finishing
      const childFinDivIn = getStageDivIn(childId, "FINISHING");
      const childFinDivOut = getStageDivOut(childId, "FINISHING");
      const childVdiDivOut = getStageDivOut(childId, "VDI");
      const childTotalDivOut = childFinDivOut + childVdiDivOut;
      const childFinDivInPcs = getStageDivInPcs(childId, "FINISHING", avgLength);
      const childFinDivOutPcs = getStageDivOutPcs(childId, "FINISHING", avgLength) + getStageDivOutPcs(childId, "VDI", avgLength);

      // Available WIP at Finishing for this child work order is strictly its VDI OK pcs (+ diversion) minus finished pcs
      const childAvailPcs = Math.max(0, childVdiOkPcs + childFinDivInPcs - childFinOutPcs - childFinRejPcs - childFinDivOutPcs);
      const childAvailMtr = avgLength > 0 ? Number((childAvailPcs * avgLength).toFixed(3)) : (childVdiOkPcs > 0 ? Number((childVdiOkPcs * avgLength).toFixed(3)) : 0);

      const od = Number(child.size_od || childWo?.size_od || 0);
      const wt = Number(child.size_wt || childWo?.size_wt || 0);

      const childTotalOrderMtr = Number(child.total_order_mtr || child.planned_mtr || childWo?.ordered_qty_mtr || childWo?.ordered_qty || 0);
      const childTotalOrderPcs = Number(child.total_order_pcs || child.planned_pcs || childWo?.ordered_qty_pcs || 0) || (avgLength > 0 ? Math.round(childTotalOrderMtr / avgLength) : 0);
      const childTotalOrderMt = Number(child.total_order_mt || child.planned_mt || childWo?.ordered_qty_mt || 0) || mtFromMtr(childTotalOrderMtr, od, wt);

      const childBalOrderMtr = Math.max(0, childTotalOrderMtr - childFinOutMtr);
      const childBalOrderPcs = avgLength > 0 ? Math.round(childBalOrderMtr / avgLength) : 0;
      const childBalOrderMt = mtFromMtr(childBalOrderMtr, od, wt);

      // Child order feeder from Heat Treatment (HT)
      const masterFinRow = masterCalc?.queueRows.FINISHING;
      const childFeederPcs = masterFinRow?.feeder_pcs ? Math.max(0, Math.min(childBalOrderPcs, Number(masterFinRow.feeder_pcs))) : 0;
      const childFeederMtr = avgLength > 0 ? Number((childFeederPcs * avgLength).toFixed(3)) : 0;
      const childFeederMt = mtFromMtr(childFeederMtr, od, wt);

      const isChildReady = childAvailPcs >= 1 || childAvailMtr >= 1.0;
      const isChildFeeder = !isChildReady && (childFeederPcs >= 1 || childFeederMtr >= 1.0);

      if (isChildReady || isChildFeeder) {
        const childAvailMt = mtFromMtr(childAvailMtr, od, wt);

        const childRouteId =
          child.route_id ||
          masterCalc?.queueRows.FINISHING?.route_id ||
          masterCampaignMap.get(child.master_wo_id)?.route_id ||
          routes[0]?.id ||
          "";

        const childCustomCapPcs = Number(child.order_capping_pcs || child.capping_pcs || 0);
        const childCustomCapMtr = Number(child.order_capping_mtr || child.capping_mtr || 0);
        const childCappingMtr = childCustomCapMtr > 0 ? childCustomCapMtr : Number((childTotalOrderMtr * 1.10).toFixed(2));
        const childCappingPcs = childCustomCapPcs > 0 ? childCustomCapPcs : (avgLength > 0 ? Math.round(childCappingMtr / avgLength) : 0);

        const childMaxAllowedMtr = isChildReady
          ? Math.min(childAvailMtr, Math.max(0, childCappingMtr - childFinOutMtr))
          : childFeederMtr;
        const childMaxAllowedPcs = avgLength > 0 ? Math.round(childMaxAllowedMtr / avgLength) : (isChildReady ? childAvailPcs : childFeederPcs);

        const childDivDetails = getStageDivDetails(childId, "FINISHING", avgLength);
        const childWoDivDetails = getWoDivDetails(childId);
        const childDivInfo = childDivDetails.has_diversion ? childDivDetails : childWoDivDetails;

        childFinishingRows.push({
          work_order_id: childId,
          work_order_no: child.work_order_no || childWo?.work_order_no || "Child Order",
          customer_name: child.customer_name || childWo?.customer_name || null,
          specification: child.specification || childWo?.specification || child.grade || childWo?.grade || null,
          grade: child.grade || childWo?.grade || null,
          has_diversion: childDivInfo.has_diversion,
          diversion_in_pcs: childDivInfo.diversion_in_pcs,
          diversion_in_mtr: childDivInfo.diversion_in_mtr,
          diversion_source_wo: childDivInfo.diversion_source_wo,
          diversion_remarks: childDivInfo.diversion_remarks,
          od,
          wl: wt,
          l1,
          l2,
          avg_length: avgLength,
          order_status: childWo?.status || (childBalOrderPcs === 0 ? "Completed" : "In Progress"),
          balance_qty_pcs: childWo?.balance_qty_pcs != null ? Number(childWo.balance_qty_pcs) : childBalOrderPcs,
          balance_qty_mtr: childWo?.balance_qty_mtr != null ? Number(childWo.balance_qty_mtr) : childBalOrderMtr,
          rolling_date: masterCalc?.queueRows.FINISHING?.rolling_date || null,
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
          balance_to_make_mtr: isChildReady ? childAvailMtr : childFeederMtr,
          balance_to_make_pcs: isChildReady ? childAvailPcs : childFeederPcs,
          balance_to_make_mt: isChildReady ? childAvailMt : childFeederMt,
          ready_pcs: isChildReady ? childAvailPcs : 0,
          ready_mtr: isChildReady ? childAvailMtr : 0,
          ready_mt: isChildReady ? childAvailMt : 0,
          feeder_pcs: childFeederPcs,
          feeder_mtr: childFeederMtr,
          feeder_mt: childFeederMt,
          is_feeder_source: isChildFeeder,
          max_allowed_mtr: childMaxAllowedMtr,
          max_allowed_pcs: childMaxAllowedPcs,
          feeder_source_label: isChildReady ? "VDI QC Passed" : "Heat Treatment (HT) Qty",
          feeder_stage_code: isChildReady ? "VDI" : "HEAT_TREATMENT",
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

        if (isChildReady) {
          workCenterSummary.FINISHING.availMtr += childAvailMtr;
          workCenterSummary.FINISHING.availPcs += childAvailPcs;
          workCenterSummary.FINISHING.availMt += childAvailMt;
          workCenterSummary.FINISHING.count += 1;
        }
      }
    }

    // Sync Rolling Mill summary with individual plan balances
    if (rollingPlanRows.length > 0) {
      const rollMtr = rollingPlanRows.reduce((sum, r) => sum + Number(r.balance_to_make_mtr || 0), 0);
      const rollPcs = rollingPlanRows.reduce((sum, r) => sum + Number(r.balance_to_make_pcs || 0), 0);
      const rollMt = rollingPlanRows.reduce((sum, r) => sum + Number(r.balance_to_make_mt || 0), 0);
      workCenterSummary.HOT_ROLLING.availMtr = rollMtr;
      workCenterSummary.HOT_ROLLING.availPcs = rollPcs;
      workCenterSummary.HOT_ROLLING.availMt = rollMt;
      workCenterSummary.HOT_ROLLING.count = rollingPlanRows.length;
      workCenterSummary.ROLLING.availMtr = rollMtr;
      workCenterSummary.ROLLING.availPcs = rollPcs;
      workCenterSummary.ROLLING.availMt = rollMt;
      workCenterSummary.ROLLING.count = rollingPlanRows.length;
    }

    // Save newly calculated snapshot into memory cache for subsequent instant page navigation (<15ms)
    setQueueCache({
      timestamp: Date.now(),
      allCalculatedRows,
      rollingPlanRows,
      childFinishingRows,
      workCenterSummary,
    });

    // Select the appropriate rows for the requested stage
    // (Universal Rule: Filter out any work order/plan whose available balance is less than 1 (Qty < 1 Pc or < 1.0 Mtr))
    const selectedRows: Row[] = [];
    if (isAllStages) {
      const activeStages: StageCode[] = [
        "HOT_ROLLING",
        "HTC",
        "HOLLOW_HEAT_TREATMENT",
        "IP_CUTTING",
        "DRAW",
        "PILGER",
        "HEAT_TREATMENT",
        "BAND_SAW",
        "VDI",
        "FINISHING",
      ];
      for (const { queueRows, vdiSalvageRow } of allCalculatedRows.values()) {
        for (const st of activeStages) {
          const row = queueRows[st];
          if (row) {
            if (st === "HOT_ROLLING" || st === "ROLLING") {
              if (Number(row.rolled_pcs || 0) > 0 || Number(row.rolled_mtr || 0) > 0) {
                selectedRows.push(row);
              }
            } else if (!row.is_feeder_source) {
              const readyPcs = Number(row.ready_pcs ?? 0);
              const readyMtr = Number(row.ready_mtr ?? 0);
              if (readyPcs >= 1 || readyMtr >= 1.0) {
                selectedRows.push(row);
              }
            }
          }
        }
        if (vdiSalvageRow) {
          const readyPcs = Number(vdiSalvageRow.ready_pcs ?? 0);
          const readyMtr = Number(vdiSalvageRow.ready_mtr ?? 0);
          if (readyPcs >= 1 || readyMtr >= 1.0) {
            selectedRows.push(vdiSalvageRow);
          }
        }
      }
      for (const r of childFinishingRows) {
        if (!r.is_feeder_source) {
          const readyPcs = Number(r.ready_pcs ?? 0);
          const readyMtr = Number(r.ready_mtr ?? 0);
          if (readyPcs >= 1 || readyMtr >= 1.0) {
            selectedRows.push(r);
          }
        }
      }
    } else if (targetStage === "HOT_ROLLING" || targetStage === "ROLLING") {
      selectedRows.push(
        ...rollingPlanRows.map(r => ({ ...r, stage_code: targetStage === "HOT_ROLLING" ? "HOT_ROLLING" as StageCode : "ROLLING" as StageCode })).filter(
          (r) => Number(r.balance_to_make_pcs ?? 0) >= 1 || Number(r.balance_to_make_mtr ?? 0) >= 1.0 || Number(r.max_allowed_pcs ?? 0) >= 1
        )
      );
    } else {
      for (const st of targetStages) {
        if (st === "HOT_ROLLING" || st === "ROLLING") {
          selectedRows.push(
            ...rollingPlanRows.map(r => ({ ...r, stage_code: st })).filter(
              (r) => Number(r.balance_to_make_pcs ?? 0) >= 1 || Number(r.balance_to_make_mtr ?? 0) >= 1.0 || Number(r.max_allowed_pcs ?? 0) >= 1
            )
          );
        } else if ((st as string) === "VDI_SALVAGE") {
          for (const { vdiSalvageRow } of allCalculatedRows.values()) {
            if (vdiSalvageRow) {
              const readyPcs = Number(vdiSalvageRow.ready_pcs ?? vdiSalvageRow.balance_to_make_pcs ?? 0);
              const readyMtr = Number(vdiSalvageRow.ready_mtr ?? vdiSalvageRow.balance_to_make_mtr ?? 0);
              if (readyPcs >= 1 || readyMtr >= 1.0) {
                selectedRows.push(vdiSalvageRow);
              }
            }
          }
        } else if (st === "BAND_SAW") {
          for (const { queueRows } of allCalculatedRows.values()) {
            const bsRow = queueRows.BAND_SAW;
            const ipRow = queueRows.IP_CUTTING;
            if (bsRow) {
              if (includeFeeder) {
                if (Number(bsRow.balance_to_make_pcs ?? 0) >= 1 || Number(bsRow.balance_to_make_mtr ?? 0) >= 1.0 || Number(bsRow.feeder_pcs ?? 0) >= 1) {
                  selectedRows.push(bsRow);
                }
              } else {
                if (!bsRow.is_feeder_source && (Number(bsRow.ready_pcs ?? bsRow.balance_to_make_pcs ?? 0) >= 1 || Number(bsRow.ready_mtr ?? bsRow.balance_to_make_mtr ?? 0) >= 1.0)) {
                  selectedRows.push(bsRow);
                }
              }
            }
            if (ipRow) {
              if (includeFeeder) {
                if (Number(ipRow.balance_to_make_pcs ?? 0) >= 1 || Number(ipRow.balance_to_make_mtr ?? 0) >= 1.0 || Number(ipRow.feeder_pcs ?? 0) >= 1) {
                  selectedRows.push(ipRow);
                }
              } else {
                if (!ipRow.is_feeder_source && (Number(ipRow.ready_pcs ?? ipRow.balance_to_make_pcs ?? 0) >= 1 || Number(ipRow.ready_mtr ?? ipRow.balance_to_make_mtr ?? 0) >= 1.0)) {
                  selectedRows.push(ipRow);
                }
              }
            }
          }
        } else {
          for (const { queueRows } of allCalculatedRows.values()) {
            const row = queueRows[st];
            if (row) {
              if (includeFeeder) {
                if (Number(row.balance_to_make_pcs ?? 0) >= 1 || Number(row.balance_to_make_mtr ?? 0) >= 1.0 || Number(row.feeder_pcs ?? 0) >= 1) {
                  selectedRows.push(row);
                }
              } else {
                if (!row.is_feeder_source && (Number(row.ready_pcs ?? row.balance_to_make_pcs ?? 0) >= 1 || Number(row.ready_mtr ?? row.balance_to_make_mtr ?? 0) >= 1.0)) {
                  selectedRows.push(row);
                }
              }
            }
          }
        }
        if (st === "FINISHING") {
          if (includeFeeder) {
            selectedRows.push(
              ...childFinishingRows.filter(
                (r) => Number(r.balance_to_make_pcs ?? 0) >= 1 || Number(r.balance_to_make_mtr ?? 0) >= 1.0 || Number(r.feeder_pcs ?? 0) >= 1
              )
            );
          } else {
            selectedRows.push(
              ...childFinishingRows.filter(
                (r) => !r.is_feeder_source && (Number(r.ready_pcs ?? r.balance_to_make_pcs ?? 0) >= 1 || Number(r.ready_mtr ?? r.balance_to_make_mtr ?? 0) >= 1.0)
              )
            );
          }
        }
      }
    }

    // Format workCenterSummary values nicely
    const summaryArray = Object.values(workCenterSummary).map((s) => ({
      ...s,
      availMtr: Number(s.availMtr.toFixed(2)),
      availMt: Number(s.availMt.toFixed(2)),
    }));

    // Enrich queue rows with today's daily production plan targets
    if (!isAllStages) {
      for (const st of targetStages) {
        await enrichWithDailyPlans(admin, selectedRows, st);
      }
    }

    const finalSelectedRows = selectedRows.filter((r) => !isHollowBankOrder(r));

    return NextResponse.json(
      {
        success: true,
        stage: isAllStages ? "ALL" : stagesParam ? "MULTI" : targetStage,
        count: finalSelectedRows.length,
        data: finalSelectedRows,
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
