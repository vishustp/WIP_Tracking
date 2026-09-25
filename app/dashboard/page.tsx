import { createClient } from '@/lib/supabase/server';
import DashboardClient from '@/components/dashboard/DashboardClient';
import { mtFromMtr } from '@/lib/productionUtils';
import { buildCampaignHierarchyMaps, reconcileCampaignWorkOrderWip } from '@/lib/campaignWipUtils';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  let kpi = null;
  let wip: any[] = [];
  let pending: any[] = [];

  try {
    const supabase = await createClient();
    const [kpiRes, wipRes, pendingRes, plansRes, woRes, qcRes, prodRes] = await Promise.all([
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
        .select('id,work_order_no,ordered_qty_mt,ordered_qty_mtr,size_od,size_wt,l1,l2'),
      supabase.from('qc_inspections').select('*'),
      supabase.from('production_logs').select('work_order_id,stage_id,output_qty,rejection_qty,remarks,process_stages(stage_code)'),
    ]);

    const rawWip = (wipRes.data ?? []) as any[];
    const rollingPlans = (plansRes.data ?? []) as any[];
    const workOrders = (woRes.data ?? []) as any[];
    const qcInspections = (qcRes.data ?? []) as any[];
    const productionLogs = (prodRes.data ?? []) as any[];
    const woMap = new Map(workOrders.map((w: any) => [w.id, w]));

    // Build campaign hierarchy maps and MH info
    const hierarchyMaps = buildCampaignHierarchyMaps(rollingPlans);

    const STAGE_ORDER = ['ROLLING', 'HOLLOW_HEAT_TREATMENT', 'DRAW', 'HEAT_TREATMENT', 'BAND_SAW', 'VDI', 'FINISHING'];
    const getStageSeq = (code: string) => {
      const idx = STAGE_ORDER.indexOf((code || '').toUpperCase());
      return idx >= 0 ? idx + 1 : 99;
    };

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

    kpi = {
      ...(kpiRes.data ?? {}),
      total_wip: totalWipMtr,
      total_wip_mtr: totalWipMtr,
      total_wip_pcs: totalWipPcs,
      total_wip_mt: totalWipMt,
    };
    wip = calculatedWip;
    pending = pendingRes.data ?? [];
  } catch (err) {
    console.warn('[Dashboard] Supabase not connected or query failed:', err);
  }

  return (
    <DashboardClient
      kpi={kpi as any}
      wip={wip as any}
      pending={pending as any}
    />
  );
}

