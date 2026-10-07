import { createClient } from '@/lib/supabase/server';
import DashboardClient from '@/components/dashboard/DashboardClient';
import { mtFromMtr, extractPcsFromRemarks } from '@/lib/productionUtils';
import { buildCampaignHierarchyMaps, reconcileCampaignWorkOrderWip } from '@/lib/campaignWipUtils';
import { computeAgingReportRows } from '@/lib/reports/agingReportHelper';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  let kpi = null;
  let wip: any[] = [];
  let pending: any[] = [];
  let recentProduction: any[] = [];
  let agingData: any[] = [];
  let trendData: any[] = [];
  let yesterdayProduction: any = null;

  try {
    const supabase = await createClient();
    const [kpiRes, wipRes, pendingRes, plansRes, woRes, qcRes, prodRes, usersRes, agingRes, routeStagesRes, stagesRes] = await Promise.all([
      supabase.from('vw_dashboard_kpis').select('*').maybeSingle(),
      supabase
        .from('vw_route_stage_wip')
        .select('*')
        .order('sequence_no', { ascending: true })
        .order('work_order_no', { ascending: true }),
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
      supabase.from('qc_inspections').select('id,work_order_id,vdi_ok_mtr,vdi_ok_pcs,vdi_ok_mt,vdi_rejection_mtr,vdi_salvage_mtr,vdi_rejection_pcs,vdi_salvage_pcs,inspection_date,created_at'),
      supabase.from('production_logs').select('id,work_order_id,stage_id,output_qty,rejection_qty,remarks,process_date,created_at,created_by,process_stages(stage_code,stage_name)'),
      supabase.from('app_users').select('id,auth_user_id,employee_name,email'),
      supabase.from('vw_wip_aging').select('*').gt('current_wip', 0).order('days_stuck', { ascending: false }).limit(50),
      supabase.from('route_stages').select('route_id,stage_id,sequence_no,process_stages(stage_code)').order('sequence_no', { ascending: true }),
      supabase.from('process_stages').select('id,stage_code,stage_name'),
    ]);

    const rawWip = (wipRes.data ?? []) as any[];
    const rollingPlans = (plansRes.data ?? []) as any[];
    const workOrders = (woRes.data ?? []) as any[];
    const qcInspections = (qcRes.data ?? []) as any[];
    const productionLogs = (prodRes.data ?? []) as any[];
    const appUsers = (usersRes.data ?? []) as any[];
    const processStages = (stagesRes?.data ?? []) as any[];
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

    // Group raw WIP by work order
    const wipByWo = new Map<string, any[]>();
    for (const r of rawWip) {
      if (!wipByWo.has(r.work_order_id)) wipByWo.set(r.work_order_id, []);
      wipByWo.get(r.work_order_id)!.push(r);
    }

    const calculatedWip: any[] = [];

    for (const [woId, rows] of wipByWo.entries()) {
      const wo = woMap.get(woId);
      const { summary, isChild, planMh } = reconcileCampaignWorkOrderWip({
        woId,
        wo,
        rows,
        qcInspections,
        productionLogs,
        hierarchyMaps,
      });

      // Add only post-rolling stages with active WIP to the dashboard
      for (const recStage of summary.stages) {
        if (recStage.is_feeder_stage) continue; // Rolling is feeder, excluded from Plant WIP
        if (isChild && recStage.stage_code !== 'FINISHING') continue; // Child orders bundled under master
        const campMembers = hierarchyMaps.campaignMembersMap.get(woId);
        if (campMembers && campMembers.size > 1 && recStage.stage_code === 'FINISHING') continue; // Finishing tracked on child orders
        if (recStage.capped_wip_pcs > 0 || recStage.capped_wip_mtr > 0) {
          const originalRow = rows.find((r) => (r.stage_code || '').toUpperCase() === recStage.stage_code) || rows[0];
          calculatedWip.push({
            ...originalRow,
            stage_code: recStage.stage_code,
            od: recStage.od,
            wt: recStage.wt,
            mh_od: planMh?.mh_od || null,
            mh_wt: planMh?.mh_wt || null,
            mh_l1: planMh?.mh_l1 || null,
            mh_l2: planMh?.mh_l2 || null,
            mh_avg_length: planMh?.mh_avg_length || null,
            current_wip: recStage.capped_wip_mtr,
            current_wip_pcs: recStage.capped_wip_pcs,
            current_wip_mt: recStage.capped_wip_mt,
          });
        }
      }
    }

    const CANONICAL_STAGE_ORDER: Record<string, number> = {
      ROLLING: 10,
      HOLLOW_HEAT_TREATMENT: 20,
      HTC: 20,
      DRAW: 30,
      HEAT_TREATMENT: 40,
      HT: 40,
      BAND_SAW: 50,
      CUTTING: 50,
      VDI: 60,
      QC: 60,
      FINISHING: 70,
    };

    calculatedWip.sort((a: any, b: any) => {
      const seqA = CANONICAL_STAGE_ORDER[(a.stage_code || '').toUpperCase()] ?? a.sequence_no ?? 99;
      const seqB = CANONICAL_STAGE_ORDER[(b.stage_code || '').toUpperCase()] ?? b.sequence_no ?? 99;
      if (seqA !== seqB) return seqA - seqB;
      return (a.work_order_no || '').localeCompare(b.work_order_no || '');
    });

    const totalWipMtr = calculatedWip.reduce((sum, r: any) => sum + (Number(r.current_wip) || 0), 0);
    const totalWipPcs = calculatedWip.reduce((sum, r: any) => sum + (Number(r.current_wip_pcs) || 0), 0);
    const totalWipMt = calculatedWip.reduce((sum, r: any) => sum + (Number(r.current_wip_mt) || 0), 0);

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

    const delayedCount = pendingRes.data?.filter((p: any) => p.target_date && new Date(p.target_date) < new Date()).length ?? kpiRes.data?.delayed_orders ?? 0;
    const activeCount = kpiRes.data?.active_orders ?? workOrders.filter((w: any) => !['Completed', 'Cancelled'].includes(w.status)).length;

    kpi = {
      ...(kpiRes.data ?? {}),
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
    pending = pendingRes.data ?? [];

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

    // WIP Aging items for dashboard
    if (agingRes?.data && agingRes.data.length > 0) {
      agingData = (agingRes.data as any[])
        .filter((r) => (r.stage_code || '').toUpperCase() !== 'ROLLING')
        .slice(0, 10)
        .map((r) => ({
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
          severity: (r.severity as 'CRITICAL' | 'WARNING' | 'NORMAL') || 'NORMAL',
          lastActivityDate: r.last_activity_date || '—',
        }));
    } else {
      // Robust calculation using shared domain engine
      const computedAging = computeAgingReportRows({
        wipRows: rawWip,
        workOrders: workOrders,
        productionLogs: productionLogs,
        qcInspections: qcInspections,
        rollingPlans: rollingPlans,
        routeStages: (routeStagesRes?.data || []) as any[],
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
    }

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
        else if (rawCode.includes('DRAW') || rawCode.includes('PILGER')) code = 'DRAW';
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

    const localYesterday = new Date(nowUtc);
    localYesterday.setDate(localYesterday.getDate() - 1);
    const localYesterdayStr = `${localYesterday.getFullYear()}-${String(localYesterday.getMonth() + 1).padStart(2, '0')}-${String(localYesterday.getDate()).padStart(2, '0')}`;
    const utcYesterdayStr = localYesterday.toISOString().slice(0, 10);

    const stationsConfig = [
      { code: 'ROLLING', name: 'Hot Rolling', shortName: 'Rolling' },
      { code: 'HOLLOW_HEAT_TREATMENT', name: 'Hollow Heat Treatment', shortName: 'Hollow HT' },
      { code: 'DRAW', name: 'Cold Draw Bench', shortName: 'Draw' },
      { code: 'HEAT_TREATMENT', name: 'Final Heat Treatment', shortName: 'Heat Treatment' },
      { code: 'BAND_SAW', name: 'Band Saw Cutting', shortName: 'Band Saw' },
      { code: 'VDI', name: 'VDI / QC Inspection', shortName: 'VDI' },
      { code: 'FINISHING', name: 'Finishing & Bundling', shortName: 'Finishing' },
    ];

    const yesterdayStationMap = new Map(
      stationsConfig.map((s) => [s.code, { ...s, pcs: 0, mt: 0, mtr: 0 }])
    );

    const yesterdayLogs = productionLogs.filter((pl) => {
      const logDate = pl.process_date
        ? String(pl.process_date).slice(0, 10)
        : pl.created_at
        ? String(pl.created_at).slice(0, 10)
        : '';
      const istCreatedAt = pl.created_at
        ? new Date(new Date(pl.created_at).getTime() + istOffsetMs).toISOString().slice(0, 10)
        : '';
      return (
        logDate === yesterdayDateStr ||
        logDate === localYesterdayStr ||
        logDate === utcYesterdayStr ||
        istCreatedAt === yesterdayDateStr
      );
    });

    for (const pl of yesterdayLogs) {
      const rawCode = (
        pl.process_stages?.stage_code ||
        pl.stage_code ||
        stageIdToCodeMap.get(pl.stage_id) ||
        ''
      ).toUpperCase();
      let code = '';
      if (rawCode.includes('ROLL')) code = 'ROLLING';
      else if (rawCode.includes('HOLLOW') || rawCode === 'HTC') code = 'HOLLOW_HEAT_TREATMENT';
      else if (rawCode.includes('DRAW') || rawCode.includes('PILGER')) code = 'DRAW';
      else if (rawCode === 'HEAT_TREATMENT' || rawCode === 'HT') code = 'HEAT_TREATMENT';
      else if (rawCode.includes('SAW') || rawCode.includes('CUT')) code = 'BAND_SAW';
      else if (rawCode.includes('VDI') || rawCode.includes('QC')) code = 'VDI';
      else if (rawCode.includes('FINISH') || rawCode.includes('BUNDL') || rawCode === 'FINISHING') code = 'FINISHING';

      const targetSt = yesterdayStationMap.get(code);
      if (!targetSt) continue;

      const wo = woMap.get(pl.work_order_id);
      const planMh = hierarchyMaps.mhMap.get(pl.work_order_id) || hierarchyMaps.mhMap.get(String(wo?.work_order_no).trim());
      const isRolling = code === 'ROLLING';
      const isDraw = code === 'DRAW';
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
        const qDate = qc.inspection_date ? String(qc.inspection_date).slice(0, 10) : '';
        const istCreatedAt = qc.created_at
          ? new Date(new Date(qc.created_at).getTime() + istOffsetMs).toISOString().slice(0, 10)
          : '';
        const utcCreatedAt = qc.created_at ? String(qc.created_at).slice(0, 10) : '';

        const isYesterday =
          qDate === yesterdayDateStr ||
          qDate === localYesterdayStr ||
          qDate === utcYesterdayStr ||
          istCreatedAt === yesterdayDateStr ||
          utcCreatedAt === yesterdayDateStr;

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

