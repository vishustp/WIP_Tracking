'use client';

import { ReactNode, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { mockStore } from '@/lib/supabase/mock-store';

type WipRow = {
  work_order_id: string; route_id: string; stage_id: string; sequence_no: number;
  stage_code: string; stage_name: string; route_code: string; route_name: string;
  incoming_qty: number | null; diversion_in: number | null; diversion_out: number | null;
  production_qty: number | null; rejection_qty: number | null;
  current_wip: number | null; current_rejection?: number | null;
  current_wip_pcs: number | null; current_wip_mt: number | null;
  net_output_mtr: number | null; net_output_pcs: number | null; net_output_mt: number | null;
  total_wip_mtr: number | null; total_wip_pcs: number | null; total_wip_mt: number | null;
};

type WorkOrderRow = {
  id: string; work_order_no: string; customer_name: string | null; grade: string | null;
  specification?: string | null; size_od: number | null; size_wt: number | null;
  l1: number | null; l2: number | null; ordered_qty: number; uom: 'Pcs' | 'Mtrs';
  target_date: string | null; status: string; created_at: string; updated_at: string;
};

/** Physical WIP is read from the dedicated ledger; order metadata is read from work_orders. */
export default function DiversionWipBootstrap({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const supabase = createClient();
      const [wipRes, woRes] = await Promise.all([
        supabase.from('vw_work_order_wip').select('work_order_id,route_id,stage_id,sequence_no,stage_code,stage_name,route_code,route_name,incoming_qty,diversion_in,diversion_out,production_qty,rejection_qty,current_wip,current_rejection,current_wip_pcs,current_wip_mt,net_output_mtr,net_output_pcs,net_output_mt,total_wip_mtr,total_wip_pcs,total_wip_mt'),
        supabase.from('work_orders').select('id,work_order_no,customer_name,grade,specification,size_od,size_wt,l1,l2,ordered_qty,uom,target_date,status,created_at,updated_at'),
      ]);
      if (cancelled) return;

      const workOrders = (woRes.data ?? []) as WorkOrderRow[];
      const woMap = new Map(workOrders.map((wo) => [wo.id, wo]));
      const rows = (!wipRes.error && Array.isArray(wipRes.data) ? wipRes.data : []) as WipRow[];
      const byWo = new Map<string, WipRow[]>();
      rows.forEach((row) => byWo.set(row.work_order_id, [...(byWo.get(row.work_order_id) ?? []), row]));
      const original = mockStore.getWorkOrderWipSummary.bind(mockStore);

      mockStore.getWorkOrderWipSummary = (woId: string) => {
        const stageRows = [...(byWo.get(woId) ?? [])].sort((a, b) => Number(a.sequence_no) - Number(b.sequence_no));
        const wo = woMap.get(woId);
        if (!wo) return original(woId);

        const avgLength = Number(wo.l1 ?? 0) > 0 && Number(wo.l2 ?? 0) > 0
          ? (Number(wo.l1) + Number(wo.l2)) / 2 : Number(wo.l1 ?? wo.l2 ?? 0) || 6;
        const orderedMtr = wo.uom === 'Mtrs' ? Number(wo.ordered_qty || 0) : Number(wo.ordered_qty || 0) * avgLength;
        const od = Number(wo.size_od ?? 0);
        const wt = Number(wo.size_wt ?? 0);
        const mtPerMtr = od > wt ? (od - wt) * wt * 0.0246615 * 0.001 : 0;
        const first = stageRows[0];
        const totalWipMtr = Number(first?.total_wip_mtr ?? 0);
        const totalWipPcs = Number(first?.total_wip_pcs ?? 0);
        const totalWipMt = Number(first?.total_wip_mt ?? 0);
        const divertedIn = stageRows.reduce((s, r) => s + Number(r.diversion_in ?? 0), 0);
        const divertedOut = stageRows.reduce((s, r) => s + Number(r.diversion_out ?? 0), 0);

        // Diversion has no source-stage field. For display, consume already-diverted
        // quantity from the stage availability in route order. This prevents the
        // original Rolling WIP from reappearing after the WO has been fully diverted,
        // while still showing each work center's normal WIP and rejection separately.
        const totalAlreadyDiverted = Math.max(0, divertedOut);
        let remainingDiversion = totalAlreadyDiverted;
        const displayStages = stageRows.map((r) => {
          const normal = Math.max(0, Number(r.current_wip ?? 0));
          const rejection = Math.max(0, Number(r.current_rejection ?? r.rejection_qty ?? 0));
          const grossAvailable = normal + rejection;
          const consumed = Math.min(grossAvailable, remainingDiversion);
          remainingDiversion = Math.max(0, remainingDiversion - consumed);
          const available = Math.max(0, grossAvailable - consumed);
          const availablePcs = avgLength > 0 ? available / avgLength : 0;
          const availableMt = available * mtPerMtr;
          return {
            stage_code: r.stage_code, stage_name: r.stage_name, sequence_no: Number(r.sequence_no),
            available_mtr: available, available_pcs: availablePcs, available_mt: availableMt,
            input_qty: Number(r.incoming_qty ?? 0), output_qty: Number(r.production_qty ?? 0),
            rejection_qty: rejection, rejection_wip_mtr: Math.max(0, rejection - Math.min(rejection, Math.max(0, consumed - normal))),
            net_output_qty: Number(r.net_output_mtr ?? 0),
          };
        });

        return {
          wo: { ...wo, balance_qty_pcs: totalWipPcs, balance_qty_mtr: totalWipMtr, balance_qty_mt: totalWipMt },
          od, wt, l1: Number(wo.l1 ?? 0), l2: Number(wo.l2 ?? 0), avgLength,
          orderedMtr, orderedPcs: avgLength > 0 ? orderedMtr / avgLength : 0, orderedMt: orderedMtr * mtPerMtr,
          rollingGrossMtr: Number(stageRows.find(r => r.stage_code === 'ROLLING')?.production_qty ?? 0),
          rollingRejMtr: Number(stageRows.find(r => r.stage_code === 'ROLLING')?.rejection_qty ?? 0),
          rollingNetMtr: Number(stageRows.find(r => r.stage_code === 'ROLLING')?.net_output_mtr ?? 0),
          rollingHtcOkMtr: Number(stageRows.find(r => r.stage_code === 'ROLLING')?.net_output_mtr ?? 0),
          rollingHtcOkPcs: Number(stageRows.find(r => r.stage_code === 'ROLLING')?.net_output_pcs ?? 0),
          rollingHtcOkMt: Number(stageRows.find(r => r.stage_code === 'ROLLING')?.net_output_mt ?? 0),
          divertedOutMtr: divertedOut, divertedOutPcs: avgLength > 0 ? divertedOut / avgLength : 0, divertedOutMt: divertedOut * mtPerMtr,
          divertedInMtr: divertedIn, divertedInPcs: avgLength > 0 ? divertedIn / avgLength : 0, divertedInMt: divertedIn * mtPerMtr,
          physicalAvailableMtr: totalWipMtr, unplannedOrderMtr: 0,
          balanceWipMtr: totalWipMtr, balanceWipPcs: totalWipPcs, balanceWipMt: totalWipMt,
          stageBreakdown: displayStages,
        };
      };
      setReady(true);
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  if (!ready) return <div className="p-4 text-xs text-slate-500">Loading physical WIP...</div>;
  return <>{children}</>;
}
