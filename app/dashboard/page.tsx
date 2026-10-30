import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { GET as getProductionQueue } from '@/app/api/production/queue/route';
import { NextRequest } from 'next/server';
import DashboardClient from '@/components/dashboard/DashboardClient';
import { mtFromMtr, extractPcsFromRemarks, isStockOrHollowBankOrder, isHollowBankOrder } from '@/lib/productionUtils';
import { buildCampaignHierarchyMaps } from '@/lib/campaignWipUtils';
import { computeAgingReportRows } from '@/lib/reports/agingReportHelper';

export const dynamic = 'force-dynamic';

interface DashboardCachePayload {
  timestamp: number;
  props: {
    kpi: any;
    wip: any[];
    pending: any[];
    recentProduction: any[];
    agingData: any[];
    trendData: any[];
    yesterdayProduction: any;
  };
}

let dashboardCache: DashboardCachePayload | null = null;
const DASHBOARD_CACHE_TTL_MS = 60000; // 60s fast in-memory cache

/**
 * Helper to fetch production logs overcoming the 1,000-row PostgREST default limit.
 * Uses range pagination to ensure no historical or current-month logs are truncated.
 */
async function fetchAllDashboardProductionLogs(client: any): Promise<{ data: any[]; error: any }> {
  const PAGE_SIZE = 1000;
  const all: any[] = [];
  let from = 0;
  const MAX_LOGS = 10000; // Safeguard up to 10,000 logs
  while (from < MAX_LOGS) {
    const { data, error } = await client
      .from('production_logs')
      .select('id,work_order_id,stage_id,output_qty,rejection_qty,remarks,process_date,created_at,created_by,process_stages(stage_code,stage_name)')
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error('[Dashboard] Error fetching production_logs page:', error);
      if (all.length > 0) return { data: all, error: null };
      return { data: [], error };
    }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return { data: all, error: null };
}

export default async function Dashboard() {
  if (dashboardCache && (Date.now() - dashboardCache.timestamp) < DASHBOARD_CACHE_TTL_MS) {
    return <DashboardClient {...dashboardCache.props} />;
  }

  let kpi = null;
  let wip: any[] = [];
  let pending: any[] = [];
  let recentProduction: any[] = [];
  let agingData: any[] = [];
  let trendData: any[] = [];
  let yesterdayProduction: any = null;

  try {
    const admin = createAdminClient();
    const supabase = admin || (await createClient());
    
    // Fetch canonical queue directly so Dashboard WIP is 100% synchronized with the Size-Grade WIP Matrix
    const queueReq = new NextRequest('http://localhost:3000/api/production/queue?all_stages=true&_t=' + Date.now());
    const queuePromise = getProductionQueue(queueReq).then(async (res) => {
      if (!res.ok) return { data: [], summary: [] };
      return res.json();
    }).catch((err) => {
      console.error('[Dashboard] Error fetching production queue:', err);
      return { data: [], summary: [] };
    });

    const results = await Promise.allSettled([
      queuePromise,
      supabase
        .from('vw_work_order_summary')
        .select('*')
        .gt('total_pending', 0)
        .order('target_date', { ascending: true, nullsFirst: false })
        .limit(100),
      supabase
        .from('rolling_plans')
        .select('work_order_id,status,planned_qty,mh_od,mh_wt,mh_l1,mh_l2,plan_no')
        .not('status', 'is', null),
      supabase
        .from('work_orders')
        .select('id,work_order_no,customer_name,ordered_qty_mt,ordered_qty_mtr,size_od,size_wt,grade,target_date,status,l1,l2'),
      supabase
        .from('qc_inspections')
        .select('id,work_order_id,vdi_ok_mtr,vdi_ok_pcs,vdi_ok_mt,vdi_rejection_mtr,vdi_salvage_mtr,vdi_rejection_pcs,vdi_salvage_pcs,inspection_date,created_at'),
      fetchAllDashboardProductionLogs(supabase),
      supabase.from('app_users').select('id,auth_user_id,employee_name,email'),
      supabase.from('route_stages').select('route_id,stage_id,sequence_no,process_stages(stage_code)').order('sequence_no', { ascending: true }),
      supabase.from('process_stages').select('id,stage_code,stage_name'),
    ]);

    const getVal = <T,>(idx: number, fallback: T): T => {
      const res = results[idx];
      if (res.status === 'fulfilled' && (res.value as any)?.data !== undefined) {
        return (res.value as any).data as T;
      }
      if (res.status === 'fulfilled' && res.value !== undefined) {
        return res.value as T;
      }
      if (res.status === 'rejected') {
        console.error(`[Dashboard] Query ${idx} rejected:`, res.reason);
      } else if ((res.value as any)?.error) {
        console.error(`[Dashboard] Query ${idx} error:`, (res.value as any).error);
      }
      return fallback;
    };

    const queueResValue = results[0].status === 'fulfilled' ? results[0].value : null;
    const queueRows: any[] = Array.isArray(queueResValue?.data)
      ? queueResValue.data
      : (Array.isArray(queueResValue) ? queueResValue : []);

    const eligiblePending = getVal<any[]>(1, []);
    const rollingPlans = getVal<any[]>(2, []);
    const workOrders = getVal<any[]>(3, []);
    const qcInspections = getVal<any[]>(4, []);
    const productionLogs = getVal<any[]>(5, []);
    const appUsers = getVal<any[]>(6, []);
    const routeStages = getVal<any[]>(7, []);
    const processStages = getVal<any[]>(8, []);

    const stageIdToCodeMap = new Map<string, string>();
    processStages.forEach((s: any) => {
      if (s.id && s.stage_code) stageIdToCodeMap.set(s.id, s.stage_code);
    });
    const woMap = new Map(workOrders.map((w: any) => [w.id, w]));

    // Build user mapping for operators
    const userMap = new Map<string, string>();
    appUsers.forEach((u: any) => {
      const displayName = u.employee_name || u.email?.split('@')[0] || 'Operator';
      if (u.auth_user_id) userMap.set(u.auth_user_id, displayName);
      if (u.id) userMap.set(u.id, displayName);
      if (u.email) userMap.set(u.email.toLowerCase(), displayName);
    });

    // Build campaign hierarchy maps and MH info
    const hierarchyMaps = buildCampaignHierarchyMaps(rollingPlans);

    const CANONICAL_STAGE_ORDER: Record<string, number> = {
      HOT_ROLLING: 10,
      ROLLING: 10,
      HTC: 15,
      HOLLOW_HEAT_TREATMENT: 20,
      DRAW: 30,
      IP_CUTTING: 30,
      PILGER: 30,
      HEAT_TREATMENT: 40,
      HT: 40,
      BAND_SAW: 50,
      CUTTING: 50,
      VDI: 60,
      VDI_SALVAGE: 65,
      QC: 60,
      FINISHING: 70,
    };

    // Filter out hollow bank yard buffer orders (matching SizeGradeWipReportClient)
    const validQueueRows = queueRows.filter((r: any) => !isHollowBankOrder(r));
    const calculatedWip: any[] = [];

    for (const r of validQueueRows) {
      const stCode = (r.stage_code || '').toUpperCase();
      const isRolling = stCode === 'HOT_ROLLING' || stCode === 'ROLLING';
      if (isRolling) continue; // Rolling is feeder stage, excluded from Active Plant WIP (AGENTS.md Rule 1)

      const pcs = Math.round(Number(r.ready_pcs ?? r.current_wip_pcs ?? 0));
      const mtr = Number(Number(r.ready_mtr ?? r.current_wip ?? 0).toFixed(2));
      const mt = Number(Number(r.ready_mt ?? r.available_mt ?? 0).toFixed(2));

      if (pcs > 0 || mtr > 0) {
        calculatedWip.push({
          work_order_id: r.work_order_id || r.id,
          work_order_no: r.work_order_no || '—',
          customer_name: r.customer_name || 'Generic Customer',
          stage_code: stCode,
          stage_name: r.stage_name || (
            stCode === 'HTC' ? 'Hot Test Check' :
            stCode === 'HOLLOW_HEAT_TREATMENT' ? 'Hollow Heat Treatment' :
            stCode === 'DRAW' ? 'Cold Draw Bench' :
            stCode === 'IP_CUTTING' ? 'IP Cutting' :
            stCode === 'HEAT_TREATMENT' ? 'Final Heat Treatment' :
            stCode === 'BAND_SAW' ? 'Band Saw Cutting' :
            stCode === 'VDI' ? 'VDI / QC Inspection' :
            stCode === 'VDI_SALVAGE' ? 'VDI Salvage' :
            stCode === 'FINISHING' ? 'Finishing & Dispatch' : stCode
          ),
          route_code: r.route_code || 'CDS',
          route_name: r.route_name || 'Standard CDS',
          sequence_no: r.sequence_no ?? (CANONICAL_STAGE_ORDER[stCode] || 99),
          od: Number(r.size_od || r.wo_od || r.target_od || r.od || 0),
          wt: Number(r.size_wt || r.wo_wt || r.target_wt || r.wt || 0),
          size_od: Number(r.size_od || r.wo_od || r.target_od || r.od || 0),
          size_wt: Number(r.size_wt || r.wo_wt || r.target_wt || r.wt || 0),
          grade: r.grade || '—',
          current_wip: mtr,
          current_wip_pcs: pcs,
          current_wip_mt: mt,
        });
      }
    }

    calculatedWip.sort((a: any, b: any) => {
      const seqA = CANONICAL_STAGE_ORDER[(a.stage_code || '').toUpperCase()] ?? a.sequence_no ?? 99;
      const seqB = CANONICAL_STAGE_ORDER[(b.stage_code || '').toUpperCase()] ?? b.sequence_no ?? 99;
      if (seqA !== seqB) return seqA - seqB;
      return (a.work_order_no || '').localeCompare(b.work_order_no || '');
    });

    const totalWipMtr = Number(calculatedWip.reduce((sum, r: any) => sum + (Number(r.current_wip) || 0), 0).toFixed(2));
    const totalWipPcs = calculatedWip.reduce((sum, r: any) => sum + (Number(r.current_wip_pcs) || 0), 0);
    const totalWipMt = Number(calculatedWip.reduce((sum, r: any) => sum + (Number(r.current_wip_mt) || 0), 0).toFixed(2));

    // Calculate real production and rejection from production_logs
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const localTodayStr = `${year}-${month}-${day}`;
    const utcTodayStr = now.toISOString().slice(0, 10);
    const currentMonthStr = `${year}-${month}`;
    const utcMonthStr = utcTodayStr.slice(0, 7);
    const monthName = now.toLocaleString('en-US', { month: 'short', year: 'numeric' });

    let todayProdMt = 0;
    let todayRejMt = 0;
    let totalProdMt = 0;
    let totalRejMt = 0;

    let monthProdMt = 0;
    let monthRejMt = 0;

    let monthRollingMt = 0;
    let monthRollingPcs = 0;
    let monthDrawMt = 0;
    let monthDrawPcs = 0;
    let monthHtMt = 0;
    let monthHtPcs = 0;
    let monthFinishingMt = 0;
    let monthFinishingPcs = 0;

    let allTimeRollingMt = 0;
    let allTimeRollingPcs = 0;
    let allTimeDrawMt = 0;
    let allTimeDrawPcs = 0;
    let allTimeHtMt = 0;
    let allTimeHtPcs = 0;
    let allTimeFinishingMt = 0;
    let allTimeFinishingPcs = 0;

    for (const pl of productionLogs) {
      const wo = woMap.get(pl.work_order_id);
      const planMh = hierarchyMaps.mhMap.get(pl.work_order_id) || hierarchyMaps.mhMap.get(String(wo?.work_order_no).trim());
      const rawCode = (pl.process_stages?.stage_code || pl.stage_code || '').toUpperCase();
      const isRolling = rawCode.includes('ROLL');
      const isDraw = rawCode.includes('DRAW') || rawCode.includes('PILGER');
      const isHt = rawCode === 'HEAT_TREATMENT' || rawCode === 'HT' || rawCode.includes('HOLLOW');
      const isFin = rawCode.includes('FINISH');

      const od = isRolling && planMh?.mh_od ? Number(planMh.mh_od) : Number(wo?.size_od || 0);
      const wt = isRolling && planMh?.mh_wt ? Number(planMh.mh_wt) : Number(wo?.size_wt || 0);
      const outMtr = Number(pl.output_qty || 0);
      const rejMtr = Number(pl.rejection_qty || 0);
      let outMt = od > 0 && wt > 0 ? mtFromMtr(outMtr, od, wt) : 0;
      let rejMt = od > 0 && wt > 0 ? mtFromMtr(rejMtr, od, wt) : 0;

      const { pcs: pPcs } = extractPcsFromRemarks(pl.remarks);
      const avgLen = isRolling
        ? Number(planMh?.mh_avg_length || 4.49)
        : Number(wo?.l1 && wo?.l2 ? (Number(wo.l1) + Number(wo.l2)) / 2 : wo?.l1 || 6.0);
      const calcPcs = pPcs !== null && pPcs > 0 ? pPcs : (outMtr > 0 && avgLen > 0 ? Math.round(outMtr / avgLen) : 0);

      // Cold Drawing Elongation & Mass Conservation (AGENTS.md Rule 3):
      // Each drawn pipe conserves the full steel mass of its rolled mother hollow (Mass_In = Mass_Out).
      if (isDraw && planMh?.mh_od && planMh?.mh_wt) {
        const mhOd = Number(planMh.mh_od);
        const mhWt = Number(planMh.mh_wt);
        const mhLen = Number(planMh.mh_avg_length || (planMh.mh_l1 && planMh.mh_l2 ? (Number(planMh.mh_l1) + Number(planMh.mh_l2)) / 2 : planMh.mh_l1 || 4.49));
        if (calcPcs > 0 && mhLen > 0) {
          const drawnConservedMt = mtFromMtr(calcPcs * mhLen, mhOd, mhWt);
          if (drawnConservedMt > outMt) {
            outMt = drawnConservedMt;
          }
        }
      }

      const logDate = pl.process_date ? String(pl.process_date).slice(0, 10) : (pl.created_at ? String(pl.created_at).slice(0, 10) : '');
      const isToday = logDate === localTodayStr || logDate === utcTodayStr;
      const isCurrentMonth = logDate.startsWith(currentMonthStr) || logDate.startsWith(utcMonthStr);

      totalProdMt += outMt;
      totalRejMt += rejMt;

      if (isRolling) {
        allTimeRollingMt += outMt;
        allTimeRollingPcs += calcPcs;
        if (isCurrentMonth) {
          monthRollingMt += outMt;
          monthRollingPcs += calcPcs;
        }
      } else if (isDraw) {
        allTimeDrawMt += outMt;
        allTimeDrawPcs += calcPcs;
        if (isCurrentMonth) {
          monthDrawMt += outMt;
          monthDrawPcs += calcPcs;
        }
      } else if (isHt) {
        allTimeHtMt += outMt;
        allTimeHtPcs += calcPcs;
        if (isCurrentMonth) {
          monthHtMt += outMt;
          monthHtPcs += calcPcs;
        }
      } else if (isFin) {
        allTimeFinishingMt += outMt;
        allTimeFinishingPcs += calcPcs;
        if (isCurrentMonth) {
          monthFinishingMt += outMt;
          monthFinishingPcs += calcPcs;
        }
      }

      if (isCurrentMonth) {
        monthProdMt += outMt;
        monthRejMt += rejMt;
      }

      if (isToday) {
        todayProdMt += outMt;
        todayRejMt += rejMt;
      }
    }

    const totalThroughput = totalProdMt + totalRejMt;
    const overallRejectionPct = totalThroughput > 0 ? (totalRejMt / totalThroughput) * 100 : 0;
    const todayThroughput = todayProdMt + todayRejMt;
    const todayRejectionPct = todayThroughput > 0 ? (todayRejMt / todayThroughput) * 100 : overallRejectionPct;

    const eligiblePendingOrders = eligiblePending.filter((p: any) => !isStockOrHollowBankOrder(p));
    const delayedCount = eligiblePendingOrders.filter((p: any) => p.target_date && new Date(p.target_date) < new Date()).length;
    const activeCount = workOrders.filter((w: any) => !['Completed', 'Cancelled'].includes(w.status)).length;

    kpi = {
      total_wip: totalWipMtr,
      total_wip_mtr: totalWipMtr,
      total_wip_pcs: totalWipPcs,
      total_wip_mt: totalWipMt,
      // Monthly Production Metrics
      total_rolling_mt: monthRollingMt,
      total_rolling_pcs: monthRollingPcs,
      total_draw_mt: monthDrawMt,
      total_draw_pcs: monthDrawPcs,
      total_ht_mt: monthHtMt,
      total_ht_pcs: monthHtPcs,
      total_finishing_mt: monthFinishingMt,
      total_finishing_pcs: monthFinishingPcs,
      month_rolling_mt: monthRollingMt,
      month_rolling_pcs: monthRollingPcs,
      month_draw_mt: monthDrawMt,
      month_draw_pcs: monthDrawPcs,
      month_ht_mt: monthHtMt,
      month_ht_pcs: monthHtPcs,
      month_finishing_mt: monthFinishingMt,
      month_finishing_pcs: monthFinishingPcs,
      month_name: monthName,
      month_prod_mt: monthProdMt,
      month_rej_mt: monthRejMt,
      // All-time Metrics (for historical audits)
      all_time_rolling_mt: allTimeRollingMt,
      all_time_rolling_pcs: allTimeRollingPcs,
      all_time_draw_mt: allTimeDrawMt,
      all_time_draw_pcs: allTimeDrawPcs,
      all_time_ht_mt: allTimeHtMt,
      all_time_ht_pcs: allTimeHtPcs,
      all_time_finishing_mt: allTimeFinishingMt,
      all_time_finishing_pcs: allTimeFinishingPcs,
      today_prod_mt: todayProdMt,
      today_rej_mt: todayRejMt,
      today_rej_pct: todayRejectionPct,
      delayed_orders: delayedCount,
      active_work_orders: activeCount,
    };
    wip = calculatedWip;
    pending = eligiblePendingOrders;

    // Real recent production logs (sorted newest first)
    const sortedLogs = [...productionLogs].sort((a, b) => {
      const timeA = new Date(a.created_at || a.process_date || 0).getTime();
      const timeB = new Date(b.created_at || b.process_date || 0).getTime();
      return timeB - timeA;
    });

    recentProduction = sortedLogs.slice(0, 8).map((pl: any) => {
      const wo = woMap.get(pl.work_order_id);
      const planMh = hierarchyMaps.mhMap.get(pl.work_order_id) || hierarchyMaps.mhMap.get(String(wo?.work_order_no).trim());
      const rawCode = (pl.process_stages?.stage_code || pl.stage_code || '').toUpperCase();
      const isRolling = rawCode.includes('ROLL');
      const isDraw = rawCode.includes('DRAW') || rawCode.includes('PILGER');
      const od = isRolling && planMh?.mh_od ? Number(planMh.mh_od) : Number(wo?.size_od || 0);
      const wt = isRolling && planMh?.mh_wt ? Number(planMh.mh_wt) : Number(wo?.size_wt || 0);
      const outMtr = Number(pl.output_qty || 0);
      const rejMtr = Number(pl.rejection_qty || 0);
      let outMt = od > 0 && wt > 0 ? mtFromMtr(outMtr, od, wt) : 0;
      let rejMt = od > 0 && wt > 0 ? mtFromMtr(rejMtr, od, wt) : 0;

      const { pcs: pPcs } = extractPcsFromRemarks(pl.remarks);
      if (isDraw && pPcs !== null && pPcs > 0 && planMh?.mh_od && planMh?.mh_wt) {
        const mhLen = Number(planMh.mh_avg_length || (planMh.mh_l1 && planMh.mh_l2 ? (Number(planMh.mh_l1) + Number(planMh.mh_l2)) / 2 : planMh.mh_l1 || 4.49));
        if (mhLen > 0) {
          const drawnConservedMt = mtFromMtr(pPcs * mhLen, Number(planMh.mh_od), Number(planMh.mh_wt));
          if (drawnConservedMt > outMt) {
            outMt = drawnConservedMt;
          }
        }
      }

      const dateObj = new Date(pl.created_at || pl.process_date);
      const dateStr = !isNaN(dateObj.getTime())
        ? dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }).replace(/ /g, '-')
        : (pl.process_date || '—');

      return {
        id: pl.id,
        date: dateStr,
        stage: pl.process_stages?.stage_name || pl.process_stages?.stage_code || 'Stage',
        woNo: wo?.work_order_no || '—',
        qtyMt: outMt > 0 ? outMt.toFixed(1) : String(outMtr),
        rejMt: rejMt > 0 ? rejMt.toFixed(1) : String(rejMtr),
        operator: pl.created_by ? (userMap.get(pl.created_by) || 'Operator') : 'Operator',
      };
    });

    // WIP Aging items for dashboard computed in-memory (1ms) using shared domain engine
    const computedAging = computeAgingReportRows({
      wipRows: calculatedWip,
      workOrders: workOrders,
      productionLogs: productionLogs,
      qcInspections: qcInspections,
      rollingPlans: rollingPlans,
      routeStages: (routeStages as any[]),
      asOfDate: new Date(),
    });

    agingData = computedAging.slice(0, 10).map((r) => ({
      id: `${r.work_order_id}_${r.stage_code}`,
      woNo: r.work_order_no,
      customer: r.customer_name || 'Generic Customer',
      grade: r.grade || '—',
      od: r.od,
      wt: r.wt,
      stage: r.stage_name || r.stage_code,
      stageCode: r.stage_code,
      wipMt: Number(r.available_mt || 0).toFixed(1),
      wipPcs: Number(r.current_wip_pcs || 0),
      wipMtr: Number(r.current_wip || 0),
      daysStuck: Number(r.days_stuck || 0),
      severity: r.severity,
      lastActivityDate: r.last_activity_date || '—',
    }));

    // Real 7-day trend calculated strictly from project's 7 canonical work centers
    const last7Days: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      last7Days.push(d.toISOString().slice(0, 10));
    }

    trendData = last7Days.map((dayStr) => {
      const d = new Date(dayStr);
      const label = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      const dayLogs = productionLogs.filter(
        (pl) => pl.process_date === dayStr || (pl.created_at && String(pl.created_at).slice(0, 10) === dayStr)
      );

      const stageTotals: Record<string, number> = {
        ROLLING: 0,
        HOLLOW_HEAT_TREATMENT: 0,
        DRAW: 0,
        HEAT_TREATMENT: 0,
        BAND_SAW: 0,
        VDI: 0,
        FINISHING: 0,
      };

      for (const pl of dayLogs) {
        const rawCode = (pl.process_stages?.stage_code || '').toUpperCase();
        let code = '';
        if (rawCode.includes('ROLL')) code = 'ROLLING';
        else if (rawCode.includes('HOLLOW') || rawCode === 'HTC') code = 'HOLLOW_HEAT_TREATMENT';
        else if (rawCode.includes('DRAW') || rawCode.includes('PILGER') || rawCode === 'IP_CUTTING') code = 'DRAW';
        else if (rawCode === 'HEAT_TREATMENT' || rawCode === 'HT') code = 'HEAT_TREATMENT';
        else if (rawCode.includes('SAW') || rawCode.includes('CUT')) code = 'BAND_SAW';
        else if (rawCode.includes('VDI') || rawCode.includes('QC')) code = 'VDI';
        else if (rawCode.includes('FINISH')) code = 'FINISHING';

        if (code && stageTotals[code] !== undefined) {
          const wo = woMap.get(pl.work_order_id);
          const planMh = hierarchyMaps.mhMap.get(pl.work_order_id) || hierarchyMaps.mhMap.get(String(wo?.work_order_no).trim());
          const isRolling = code === 'ROLLING';
          const isDraw = code === 'DRAW';
          const od = isRolling && planMh?.mh_od ? Number(planMh.mh_od) : Number(wo?.size_od || 0);
          const wt = isRolling && planMh?.mh_wt ? Number(planMh.mh_wt) : Number(wo?.size_wt || 0);
          const outMtr = Number(pl.output_qty || 0);
          let outMt = od > 0 && wt > 0 ? mtFromMtr(outMtr, od, wt) : 0;
          const { pcs: pPcs } = extractPcsFromRemarks(pl.remarks);
          if (isDraw && pPcs !== null && pPcs > 0 && planMh?.mh_od && planMh?.mh_wt) {
            const mhLen = Number(planMh.mh_avg_length || (planMh.mh_l1 && planMh.mh_l2 ? (Number(planMh.mh_l1) + Number(planMh.mh_l2)) / 2 : planMh.mh_l1 || 4.49));
            if (mhLen > 0) {
              const drawnConservedMt = mtFromMtr(pPcs * mhLen, Number(planMh.mh_od), Number(planMh.mh_wt));
              if (drawnConservedMt > outMt) {
                outMt = drawnConservedMt;
              }
            }
          }
          stageTotals[code] += outMt;
        }
      }

      return {
        day: label,
        rolling: Number(stageTotals.ROLLING.toFixed(1)),
        hollowHt: Number(stageTotals.HOLLOW_HEAT_TREATMENT.toFixed(1)),
        draw: Number(stageTotals.DRAW.toFixed(1)),
        heatTreatment: Number(stageTotals.HEAT_TREATMENT.toFixed(1)),
        bandSaw: Number(stageTotals.BAND_SAW.toFixed(1)),
        vdi: Number(stageTotals.VDI.toFixed(1)),
        finishing: Number(stageTotals.FINISHING.toFixed(1)),
      };
    });

    // Calculate Yesterday's Production strictly station-wise in Nos and MT
    const nowUtc = new Date();
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(nowUtc.getTime() + (nowUtc.getTimezoneOffset() * 60 * 1000) + istOffsetMs);
    const istYesterday = new Date(istNow);
    istYesterday.setDate(istYesterday.getDate() - 1);

    const yYear = istYesterday.getFullYear();
    const yMonth = String(istYesterday.getMonth() + 1).padStart(2, '0');
    const yDay = String(istYesterday.getDate()).padStart(2, '0');
    const yesterdayDateStr = `${yYear}-${yMonth}-${yDay}`;
    const yesterdayDateLabel = istYesterday.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    const stationsConfig = [
      { code: 'HOT_ROLLING', name: 'Hot Rolling', shortName: 'Rolling' },
      { code: 'HTC', name: 'HTC Check', shortName: 'HTC' },
      { code: 'HOLLOW_HEAT_TREATMENT', name: 'Hollow Heat Treatment', shortName: 'Hollow HT' },
      { code: 'DRAW', name: 'Cold Draw Bench', shortName: 'Draw' },
      { code: 'PILGER', name: 'Cold Pilger Mill', shortName: 'Pilger' },
      { code: 'HEAT_TREATMENT', name: 'Final Heat Treatment', shortName: 'Heat Treatment' },
      { code: 'BAND_SAW', name: 'Band Saw Cutting', shortName: 'Band Saw' },
      { code: 'VDI', name: 'VDI / QC Inspection', shortName: 'VDI' },
      { code: 'FINISHING', name: 'Finishing & Bundling', shortName: 'Finishing' },
    ];

    const yesterdayStationMap = new Map(
      stationsConfig.map((s) => [s.code, { ...s, pcs: 0, mt: 0, mtr: 0 }])
    );

    const yesterdayLogs = productionLogs.filter((pl) => {
      // Strictly use process_date (operational date) to match the Production Report
      const logDate = pl.process_date
        ? String(pl.process_date).slice(0, 10)
        : pl.created_at
        ? new Date(new Date(pl.created_at).getTime() + istOffsetMs).toISOString().slice(0, 10)
        : '';
      return logDate === yesterdayDateStr;
    });

    for (const pl of yesterdayLogs) {
      const rawCode = (
        pl.process_stages?.stage_code ||
        pl.stage_code ||
        stageIdToCodeMap.get(pl.stage_id) ||
        ''
      ).toUpperCase();
      let code = '';
      if (rawCode === 'HOT_ROLLING' || rawCode === 'ROLLING') code = 'HOT_ROLLING';
      else if (rawCode === 'HTC' || rawCode.includes('HOT TEST')) code = 'HTC';
      else if (rawCode.includes('HOLLOW')) code = 'HOLLOW_HEAT_TREATMENT';
      else if (rawCode.includes('PILGER')) code = 'PILGER';
      else if (rawCode.includes('DRAW') || rawCode === 'IP_CUTTING') code = 'DRAW';
      else if (rawCode === 'HEAT_TREATMENT' || rawCode === 'HT') code = 'HEAT_TREATMENT';
      else if (rawCode.includes('SAW') || rawCode.includes('CUT')) code = 'BAND_SAW';
      else if (rawCode.includes('VDI') || rawCode.includes('QC')) code = 'VDI';
      else if (rawCode.includes('FINISH') || rawCode.includes('BUNDL') || rawCode === 'FINISHING') code = 'FINISHING';

      const targetSt = yesterdayStationMap.get(code);
      if (!targetSt) continue;

      const wo = woMap.get(pl.work_order_id);
      const planMh = hierarchyMaps.mhMap.get(pl.work_order_id) || hierarchyMaps.mhMap.get(String(wo?.work_order_no).trim());
      const isRolling = code === 'HOT_ROLLING' || code === 'HTC';
      const isDraw = code === 'DRAW' || code === 'PILGER';
      const od = isRolling && planMh?.mh_od ? Number(planMh.mh_od) : Number(wo?.size_od || 0);
      const wt = isRolling && planMh?.mh_wt ? Number(planMh.mh_wt) : Number(wo?.size_wt || 0);
      const outMtr = Number(pl.output_qty || 0);
      let outMt = od > 0 && wt > 0 ? mtFromMtr(outMtr, od, wt) : 0;
      const { pcs: pPcs } = extractPcsFromRemarks(pl.remarks);
      const avgLen = isRolling
        ? Number(planMh?.mh_avg_length || 4.49)
        : Number(wo?.l1 && wo?.l2 ? (Number(wo.l1) + Number(wo.l2)) / 2 : wo?.l1 || 6.0);
      const calcPcs = pPcs !== null && pPcs > 0 ? pPcs : (outMtr > 0 && avgLen > 0 ? Math.round(outMtr / avgLen) : 0);

      // Mass conservation for cold drawing (AGENTS.md Rule 3)
      if (isDraw && planMh?.mh_od && planMh?.mh_wt) {
        const mhLen = Number(planMh.mh_avg_length || (planMh.mh_l1 && planMh.mh_l2 ? (Number(planMh.mh_l1) + Number(planMh.mh_l2)) / 2 : planMh.mh_l1 || 4.49));
        if (calcPcs > 0 && mhLen > 0) {
          const drawnConservedMt = mtFromMtr(calcPcs * mhLen, Number(planMh.mh_od), Number(planMh.mh_wt));
          if (drawnConservedMt > outMt) {
            outMt = drawnConservedMt;
          }
        }
      }

      targetSt.pcs += calcPcs;
      targetSt.mt += outMt;
      targetSt.mtr += outMtr;
    }

    // Also reconcile VDI inspections if recorded in qc_inspections
    const vdiSt = yesterdayStationMap.get('VDI');
    if (vdiSt) {
      let qcOkPcs = 0;
      let qcOkMt = 0;
      let qcOkMtr = 0;
      for (const qc of qcInspections) {
        // Strictly use inspection_date (operational date) to match the Production Report
        const qDate = qc.inspection_date
          ? String(qc.inspection_date).slice(0, 10)
          : qc.created_at
          ? new Date(new Date(qc.created_at).getTime() + istOffsetMs).toISOString().slice(0, 10)
          : '';

        const isYesterday = qDate === yesterdayDateStr;

        if (isYesterday) {
          const okPcs = Number(qc.vdi_ok_pcs || 0);
          const okMtr = Number(qc.vdi_ok_mtr || 0);
          qcOkPcs += okPcs;
          qcOkMtr += okMtr;
          if (qc.vdi_ok_mt) {
            qcOkMt += Number(qc.vdi_ok_mt);
          } else {
            const wo = woMap.get(qc.work_order_id);
            if (wo?.size_od && wo?.size_wt) {
              qcOkMt += mtFromMtr(okMtr, Number(wo.size_od), Number(wo.size_wt));
            }
          }
        }
      }
      if (qcOkPcs > 0 || qcOkMt > 0 || qcOkMtr > 0) {
        vdiSt.pcs = Math.max(vdiSt.pcs, qcOkPcs);
        vdiSt.mt = Math.max(vdiSt.mt, qcOkMt);
        vdiSt.mtr = Math.max(vdiSt.mtr, qcOkMtr);
      }
    }

    const stationsList = Array.from(yesterdayStationMap.values()).map((s) => ({
      code: s.code,
      name: s.name,
      shortName: s.shortName,
      pcs: s.pcs,
      mt: Number(s.mt.toFixed(2)),
      mtr: Number(s.mtr.toFixed(1)),
    }));

    const yesterdayTotalPcs = stationsList.reduce((acc, s) => acc + s.pcs, 0);
    const yesterdayTotalMt = Number(stationsList.reduce((acc, s) => acc + s.mt, 0).toFixed(2));
    const yesterdayTotalMtr = Number(stationsList.reduce((acc, s) => acc + s.mtr, 0).toFixed(1));

    yesterdayProduction = {
      date: yesterdayDateStr,
      formattedDate: yesterdayDateLabel,
      totalPcs: yesterdayTotalPcs,
      totalMt: yesterdayTotalMt,
      totalMtr: yesterdayTotalMtr,
      stations: stationsList,
    };

    dashboardCache = {
      timestamp: Date.now(),
      props: {
        kpi,
        wip: calculatedWip,
        pending,
        recentProduction,
        agingData,
        trendData,
        yesterdayProduction,
      },
    };
  } catch (err) {
    console.warn('[Dashboard] Supabase query failed:', err);
  }

  return (
    <DashboardClient
      kpi={kpi as any}
      wip={wip as any}
      pending={pending as any}
      recentProduction={recentProduction}
      agingData={agingData}
      trendData={trendData}
      yesterdayProduction={yesterdayProduction}
    />
  );
}

