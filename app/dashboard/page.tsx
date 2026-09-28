import { createClient } from '@/lib/supabase/server';
import DashboardClient from '@/components/dashboard/DashboardClient';
import { mtFromMtr } from '@/lib/productionUtils';
import { buildCampaignHierarchyMaps, reconcileCampaignWorkOrderWip } from '@/lib/campaignWipUtils';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  let kpi = null;
  let wip: any[] = [];
  let pending: any[] = [];
  let recentProduction: any[] = [];
  let trendData: any[] = [];

  try {
    const supabase = await createClient();
    const [kpiRes, wipRes, pendingRes, plansRes, woRes, qcRes, prodRes, usersRes] = await Promise.all([
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
        .limit(20),
      supabase
        .from('rolling_plans')
        .select('work_order_id,status,planned_qty,mh_od,mh_wt,mh_l1,mh_l2,plan_no')
        .not('status', 'is', null),
      supabase
        .from('work_orders')
        .select('id,work_order_no,customer_name,ordered_qty_mt,ordered_qty_mtr,size_od,size_wt,grade,target_date,status,l1,l2'),
      supabase.from('qc_inspections').select('work_order_id,vdi_ok_mtr,vdi_ok_pcs,vdi_rejection_mtr,vdi_salvage_mtr,vdi_rejection_pcs,vdi_salvage_pcs'),
      supabase.from('production_logs').select('id,work_order_id,stage_id,output_qty,rejection_qty,remarks,process_date,created_at,created_by,process_stages(stage_code,stage_name)'),
      supabase.from('app_users').select('id,auth_user_id,employee_name,email'),
    ]);

    const rawWip = (wipRes.data ?? []) as any[];
    const rollingPlans = (plansRes.data ?? []) as any[];
    const workOrders = (woRes.data ?? []) as any[];
    const qcInspections = (qcRes.data ?? []) as any[];
    const productionLogs = (prodRes.data ?? []) as any[];
    const appUsers = (usersRes.data ?? []) as any[];
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
    const todayStr = new Date().toISOString().slice(0, 10);
    let todayProdMt = 0;
    let todayRejMt = 0;
    let totalProdMt = 0;
    let totalRejMt = 0;

    for (const pl of productionLogs) {
      const wo = woMap.get(pl.work_order_id);
      const od = Number(wo?.size_od || 0);
      const wt = Number(wo?.size_wt || 0);
      const outMtr = Number(pl.output_qty || 0);
      const rejMtr = Number(pl.rejection_qty || 0);
      const outMt = od > 0 && wt > 0 ? mtFromMtr(outMtr, od, wt) : 0;
      const rejMt = od > 0 && wt > 0 ? mtFromMtr(rejMtr, od, wt) : 0;

      totalProdMt += outMt;
      totalRejMt += rejMt;

      const isToday = pl.process_date === todayStr || (pl.created_at && String(pl.created_at).slice(0, 10) === todayStr);
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
      const od = Number(wo?.size_od || 0);
      const wt = Number(wo?.size_wt || 0);
      const outMtr = Number(pl.output_qty || 0);
      const rejMtr = Number(pl.rejection_qty || 0);
      const outMt = od > 0 && wt > 0 ? mtFromMtr(outMtr, od, wt) : 0;
      const rejMt = od > 0 && wt > 0 ? mtFromMtr(rejMtr, od, wt) : 0;

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
          const od = Number(wo?.size_od || 0);
          const wt = Number(wo?.size_wt || 0);
          const outMtr = Number(pl.output_qty || 0);
          const outMt = od > 0 && wt > 0 ? mtFromMtr(outMtr, od, wt) : 0;
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

  } catch (err) {
    console.warn('[Dashboard] Supabase query failed:', err);
  }

  return (
    <DashboardClient
      kpi={kpi as any}
      wip={wip as any}
      pending={pending as any}
      recentProduction={recentProduction}
      trendData={trendData}
    />
  );
}

