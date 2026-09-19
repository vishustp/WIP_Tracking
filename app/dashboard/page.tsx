import { createClient } from '@/lib/supabase/server';
import DashboardClient from '@/components/dashboard/DashboardClient';
import { mtFromMtr } from '@/lib/productionUtils';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  let kpi = null;
  let wip: any[] = [];
  let pending: any[] = [];

  try {
    const supabase = await createClient();
    const [kpiRes, wipRes, pendingRes, plansRes] = await Promise.all([
      supabase.from('vw_dashboard_kpis').select('*').maybeSingle(),
      supabase
        .from('vw_route_stage_wip')
        .select('*')
        .gt('current_wip', 0)
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
    ]);

    const rawWip = wipRes.data ?? [];
    const rollingPlans = (plansRes.data ?? []) as any[];

    // Build Mother Hollow lookup map from rolling plans
    const mhMap = new Map<string, { mh_od?: number | null; mh_wt?: number | null; mh_l1?: number | null; mh_l2?: number | null; mh_avg_length?: number | null }>();

    for (const p of rollingPlans) {
      try {
        const parsed = typeof p.status === 'string' ? JSON.parse(p.status) : p.status;
        const mhOd = Number(p.mh_od || parsed?.mh_od || parsed?.cust_od || parsed?.sm?.cust_od || parsed?.sizing_mill?.cust_od || 0) || null;
        const mhWt = Number(p.mh_wt || parsed?.mh_wt || parsed?.cust_wt || parsed?.sm?.rolling_wt || parsed?.sm?.cust_wt || parsed?.sizing_mill?.rolling_wt || 0) || null;
        const mhL1 = Number(p.mh_l1 || parsed?.mh_l1 || parsed?.sm?.sm_len || 0) || null;
        const mhL2 = Number(p.mh_l2 || parsed?.mh_l2 || parsed?.sm?.sm_len || 0) || null;
        const mhAvg = mhL1 && mhL2 ? (mhL1 + mhL2) / 2 : mhL1 || mhL2 || null;

        if (p.work_order_id) {
          mhMap.set(p.work_order_id, { mh_od: mhOd, mh_wt: mhWt, mh_l1: mhL1, mh_l2: mhL2, mh_avg_length: mhAvg });
        }
        if (parsed?.is_master && Array.isArray(parsed?.child_work_orders)) {
          for (const c of parsed.child_work_orders) {
            const cId = c.work_order_id || c.id;
            if (cId) {
              mhMap.set(cId, { mh_od: mhOd, mh_wt: mhWt, mh_l1: mhL1, mh_l2: mhL2, mh_avg_length: mhAvg });
            }
          }
        }
      } catch {}
    }

    const calculatedWip = rawWip
      .filter((r: any) => (r.stage_code || '').toUpperCase() !== 'ROLLING')
      .map((r: any) => {
      const isMhStage = r.stage_code === 'ROLLING' || r.stage_code === 'HOLLOW_HEAT_TREATMENT' || r.stage_code === 'DRAW';
      const planMh = mhMap.get(r.work_order_id);
      const mhLen = Number(planMh?.mh_avg_length || planMh?.mh_l1 || 0);
      const woLen = Number(r.l1 && r.l2 ? (Number(r.l1) + Number(r.l2)) / 2 : r.l1 || r.l2 || 6.0);
      const effectiveLen = isMhStage && mhLen > 0 ? mhLen : woLen > 0 ? woLen : 6.0;

      const od = Number(isMhStage ? (planMh?.mh_od || r.mh_od || r.od || r.size_od || 0) : (r.od || r.size_od || 0));
      const wt = Number(isMhStage ? (planMh?.mh_wt || r.mh_wt || r.wt || r.size_wt || 0) : (r.wt || r.size_wt || 0));

      const currentWipMtr = Number(r.current_wip || 0);
      const currentWipPcs = isMhStage && mhLen > 0
        ? Math.round(currentWipMtr / mhLen)
        : (Number(r.current_wip_pcs || 0) > 0 ? Number(r.current_wip_pcs) : (effectiveLen > 0 ? Math.round(currentWipMtr / effectiveLen) : 0));

      const computedMt = od > 0 && wt > 0 ? mtFromMtr(currentWipMtr, od, wt) : 0;
      const currentWipMt = isMhStage
        ? Number(computedMt.toFixed(3))
        : (Number(r.current_wip_mt || r.available_mt || 0) > 0 ? Number(r.current_wip_mt || r.available_mt) : Number(computedMt.toFixed(3)));

      return {
        ...r,
        od,
        wt,
        mh_od: planMh?.mh_od || null,
        mh_wt: planMh?.mh_wt || null,
        mh_l1: planMh?.mh_l1 || null,
        mh_l2: planMh?.mh_l2 || null,
        mh_avg_length: planMh?.mh_avg_length || null,
        current_wip: currentWipMtr,
        current_wip_pcs: currentWipPcs,
        current_wip_mt: currentWipMt,
      };
    });

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

