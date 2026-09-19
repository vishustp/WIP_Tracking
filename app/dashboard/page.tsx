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
      const planMh = mhMap.get(woId);
      const woOd = Number(wo?.size_od || rows[0]?.od || rows[0]?.size_od || 0);
      const woWt = Number(wo?.size_wt || rows[0]?.wt || rows[0]?.size_wt || 0);
      const mhOd = planMh?.mh_od || woOd;
      const mhWt = planMh?.mh_wt || woWt;
      const woLen = Number(wo?.l1 && wo?.l2 ? (Number(wo.l1) + Number(wo.l2)) / 2 : wo?.l1 || wo?.l2 || 6.0);
      const mhLen = Number(planMh?.mh_avg_length || planMh?.mh_l1 || woLen);

      // Sort stages in strict routing order
      const sorted = [...rows].sort((a, b) => getStageSeq(a.stage_code) - getStageSeq(b.stage_code));

      // Determine charged steel
      const rollRow = sorted.find((r) => (r.stage_code || '').toUpperCase() === 'ROLLING');
      let chargedMt = 0;
      if (rollRow && Number(rollRow.gross_output_mtr || 0) > 0) {
        chargedMt = mtFromMtr(Number(rollRow.gross_output_mtr), mhOd, mhWt);
      } else if (planMh?.planned_qty) {
        chargedMt = mtFromMtr(Number(planMh.planned_qty), mhOd, mhWt);
      } else if (wo?.ordered_qty_mt) {
        chargedMt = Number(wo.ordered_qty_mt);
      }

      // Finished MT and total scrap MT
      const finRow = sorted.find((r) => (r.stage_code || '').toUpperCase() === 'FINISHING');
      const finishedMt = finRow ? mtFromMtr(Number(finRow.net_output_mtr || 0), woOd, woWt) : 0;
      const totalScrapMt = sorted.reduce((sum, r) => {
        const isMh = r.stage_code === 'ROLLING' || r.stage_code === 'HOLLOW_HEAT_TREATMENT';
        return sum + mtFromMtr(Number(r.rejection_mtr || 0), isMh ? mhOd : woOd, isMh ? mhWt : woWt);
      }, 0);

      const maxPhysicalWipMt = Math.max(0, chargedMt - totalScrapMt - finishedMt);

      // Universal Downstream Deduction across stages
      const woReconciledRows: any[] = [];

      for (let i = 0; i < sorted.length; i++) {
        const cur = sorted[i];
        const sc = (cur.stage_code || '').toUpperCase();
        const isMh = sc === 'ROLLING' || sc === 'HOLLOW_HEAT_TREATMENT';
        const curOd = isMh ? mhOd : woOd;
        const curWt = isMh ? mhWt : woWt;
        const curLen = isMh ? mhLen : woLen;

        // Calculate highest downstream quantity passed past this stage
        let maxDownstreamMtr = 0;
        let maxDownstreamPcs = 0;
        let maxDownstreamMt = 0;

        for (let j = i + 1; j < sorted.length; j++) {
          const down = sorted[j];
          const downGrossMtr = Number(down.gross_output_mtr || 0);
          const downGrossPcs = Number(down.gross_output_pcs || 0);
          const downIsMh = down.stage_code === 'ROLLING' || down.stage_code === 'HOLLOW_HEAT_TREATMENT';
          const downMt = mtFromMtr(downGrossMtr, downIsMh ? mhOd : woOd, downIsMh ? mhWt : woWt);
          if (downGrossMtr > maxDownstreamMtr) maxDownstreamMtr = downGrossMtr;
          if (downGrossPcs > maxDownstreamPcs) maxDownstreamPcs = downGrossPcs;
          if (downMt > maxDownstreamMt) maxDownstreamMt = downMt;
        }

        let recWipMtr = 0;
        let recWipPcs = 0;

        if (sc === 'ROLLING') {
          const netMtr = Number(cur.net_output_mtr || cur.production_qty || 0);
          recWipMtr = Math.max(0, netMtr - maxDownstreamMtr);
          recWipPcs = curLen > 0 ? Math.round(recWipMtr / curLen) : 0;
        } else {
          const incomingMtr = Number(cur.incoming_qty || 0);
          const curGrossMtr = Number(cur.production_qty || cur.gross_output_mtr || 0);
          const passedMtr = Math.max(curGrossMtr, maxDownstreamMtr);
          recWipMtr = Math.max(0, incomingMtr - passedMtr);
          recWipPcs = curLen > 0 ? Math.round(recWipMtr / curLen) : 0;
        }

        const recWipMt = mtFromMtr(recWipMtr, curOd, curWt);

        woReconciledRows.push({
          ...cur,
          od: curOd,
          wt: curWt,
          mh_od: planMh?.mh_od || null,
          mh_wt: planMh?.mh_wt || null,
          mh_l1: planMh?.mh_l1 || null,
          mh_l2: planMh?.mh_l2 || null,
          mh_avg_length: planMh?.mh_avg_length || null,
          current_wip: recWipMtr,
          current_wip_pcs: recWipPcs,
          current_wip_mt: recWipMt,
          reconciled_wip_mt: recWipMt,
        });
      }

      // Apply mass conservation capping
      const woTotalRecMt = woReconciledRows.reduce((s, r) => s + r.reconciled_wip_mt, 0);
      if (chargedMt > 0 && woTotalRecMt > maxPhysicalWipMt && woTotalRecMt > 0) {
        const factor = maxPhysicalWipMt / woTotalRecMt;
        for (const r of woReconciledRows) {
          r.current_wip_mt = Number((r.reconciled_wip_mt * factor).toFixed(3));
          r.current_wip = Number((r.current_wip * factor).toFixed(2));
          r.current_wip_pcs = Math.round(r.current_wip_pcs * factor);
        }
      }

      for (const r of woReconciledRows) {
        if (r.current_wip > 0.1 || r.current_wip_pcs > 0) {
          calculatedWip.push(r);
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

