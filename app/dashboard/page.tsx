import { createClient } from '@/lib/supabase/server';
import DashboardClient from '@/components/dashboard/DashboardClient';
import { mtFromMtr } from '@/lib/productionUtils';
import { reconcileWorkOrderWip } from '@/lib/wipReconciliation';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  let kpi = null;
  let wip: any[] = [];
  let pending: any[] = [];

  try {
    const supabase = await createClient();
    const [kpiRes, wipRes, pendingRes, plansRes, woRes] = await Promise.all([
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
    ]);

    const rawWip = (wipRes.data ?? []) as any[];
    const rollingPlans = (plansRes.data ?? []) as any[];
    const workOrders = (woRes.data ?? []) as any[];
    const woMap = new Map(workOrders.map((w: any) => [w.id, w]));

    // Build Mother Hollow lookup map from rolling plans
    const mhMap = new Map<string, { mh_od?: number | null; mh_wt?: number | null; mh_l1?: number | null; mh_l2?: number | null; mh_avg_length?: number | null; planned_qty?: number | null }>();

    for (const p of rollingPlans) {
      try {
        const parsed = typeof p.status === 'string' ? JSON.parse(p.status) : p.status;
        const mhOd = Number(p.mh_od || parsed?.mh_od || parsed?.cust_od || parsed?.sm?.cust_od || parsed?.sizing_mill?.cust_od || 0) || null;
        const mhWt = Number(p.mh_wt || parsed?.mh_wt || parsed?.cust_wt || parsed?.sm?.rolling_wt || parsed?.sm?.cust_wt || parsed?.sizing_mill?.rolling_wt || 0) || null;
        const mhL1 = Number(p.mh_l1 || parsed?.mh_l1 || parsed?.sm?.sm_len || 0) || null;
        const mhL2 = Number(p.mh_l2 || parsed?.mh_l2 || parsed?.sm?.sm_len || 0) || null;
        const mhAvg = mhL1 && mhL2 ? (mhL1 + mhL2) / 2 : mhL1 || mhL2 || null;

        if (p.work_order_id) {
          mhMap.set(p.work_order_id, { mh_od: mhOd, mh_wt: mhWt, mh_l1: mhL1, mh_l2: mhL2, mh_avg_length: mhAvg, planned_qty: p.planned_qty });
        }
        if (parsed?.master_wo_id) {
          mhMap.set(parsed.master_wo_id, { mh_od: mhOd, mh_wt: mhWt, mh_l1: mhL1, mh_l2: mhL2, mh_avg_length: mhAvg, planned_qty: p.planned_qty });
        }
        if (parsed?.master_wo_no) {
          mhMap.set(String(parsed.master_wo_no).trim(), { mh_od: mhOd, mh_wt: mhWt, mh_l1: mhL1, mh_l2: mhL2, mh_avg_length: mhAvg, planned_qty: p.planned_qty });
        }
        if (parsed?.is_master && Array.isArray(parsed?.child_work_orders)) {
          for (const c of parsed.child_work_orders) {
            const cId = c.work_order_id || c.id;
            if (cId) {
              mhMap.set(cId, { mh_od: mhOd, mh_wt: mhWt, mh_l1: mhL1, mh_l2: mhL2, mh_avg_length: mhAvg, planned_qty: p.planned_qty });
            }
          }
        }
      } catch {}
    }

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
      const planMh = mhMap.get(woId) || mhMap.get(String(wo?.work_order_no).trim());
      const routeCode = rows[0]?.route_code || 'CDS';

      const rollStage = rows.find((r: any) => (r.stage_code || '').toUpperCase() === 'ROLLING');
      const rollPcs = Number(rollStage?.gross_output_pcs || 0);
      const rollMtr = Number(rollStage?.gross_output_mtr || rollStage?.production_qty || 0);
      const actualMhLen = (rollPcs > 0 && rollMtr > 0)
        ? Number((rollMtr / rollPcs).toFixed(3))
        : Number(planMh?.mh_avg_length || 6.0);

      const mhOd = Number(planMh?.mh_od || rollStage?.mh_od || rollStage?.od || wo?.size_od || 0);
      const mhWt = Number(planMh?.mh_wt || rollStage?.mh_wt || rollStage?.wt || wo?.size_wt || 0);

      const summary = reconcileWorkOrderWip(
        rows.map((r: any) => {
          const isRoll = (r.stage_code || '').toUpperCase() === 'ROLLING';
          return {
            stage_code: (r.stage_code || '').toUpperCase(),
            sequence_no: Number(r.sequence_no || 0),
            gross_output_mtr: isRoll && rollMtr > 0 ? rollMtr : Number(r.production_qty || r.gross_output_mtr || 0),
            gross_output_pcs: isRoll && rollPcs > 0 ? rollPcs : Number(r.gross_output_pcs || 0),
            rejection_mtr: Number(r.rejection_mtr || 0),
            rejection_pcs: Number(r.rejection_pcs || 0),
            net_output_mtr: Number(r.net_output_mtr || 0),
            net_output_pcs: Number(r.net_output_pcs || 0),
            incoming_mtr: Number(r.incoming_qty || 0),
            od: Number(r.od || r.size_od || wo?.size_od || 0),
            wt: Number(r.wt || r.size_wt || wo?.size_wt || 0),
            avg_length: Number(r.l1 && r.l2 ? (Number(r.l1) + Number(r.l2)) / 2 : r.l1 || r.l2 || 6.0),
            mh_od: mhOd > 0 ? mhOd : undefined,
            mh_wt: mhWt > 0 ? mhWt : undefined,
            mh_avg_length: actualMhLen > 0 ? actualMhLen : undefined,
          };
        }),
        {
          route_code: routeCode,
          ordered_qty_mt: Number(wo?.ordered_qty_mt || 0),
          rolling_plan_qty_mtr: Number(planMh?.planned_qty || 0),
          mh_od: mhOd > 0 ? mhOd : undefined,
          mh_wt: mhWt > 0 ? mhWt : undefined,
          mh_avg_length: actualMhLen > 0 ? actualMhLen : undefined,
        }
      );

      // Add only post-rolling stages with active WIP to the dashboard
      for (const recStage of summary.stages) {
        if (recStage.is_feeder_stage) continue; // Rolling is feeder, excluded from Plant WIP
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

