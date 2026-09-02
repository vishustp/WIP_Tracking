'use client';

import { ReactNode, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { mockStore } from '@/lib/supabase/mock-store';

type WipRow = {
  work_order_id: string; route_id: string; stage_id: string; sequence_no: number;
  incoming_qty: number | null; diversion_in: number | null; diversion_out: number | null;
  production_qty: number | null; rejection_qty: number | null;
  current_wip: number | null; current_wip_pcs: number | null; current_wip_mt: number | null;
  net_output_mtr: number | null; net_output_pcs: number | null; net_output_mt: number | null;
};

type WorkOrderRow = {
  id: string; work_order_no: string; customer_name: string | null; grade: string | null;
  specification?: string | null; size_od: number | null; size_wt: number | null;
  l1: number | null; l2: number | null; ordered_qty: number; uom: 'Pcs' | 'Mtrs';
  target_date: string | null; status: string; created_at: string; updated_at: string;
};

/** Loads the dedicated physical-WIP ledger before DiversionForm is rendered. */
export default function DiversionWipBootstrap({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const supabase = createClient();
      const [wipRes, woRes] = await Promise.all([
        supabase.from('work_order_wip').select('work_order_id,route_id,stage_id,sequence_no,incoming_qty,diversion_in,diversion_out,production_qty,rejection_qty,current_wip,current_wip_pcs,current_wip_mt,net_output_mtr,net_output_pcs,net_output_mt').order('sequence_no'),
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
        const stageRows = byWo.get(woId) ?? [];
        const wo = woMap.get(woId);
        if (!wo) return original(woId);

        const avgLength = Number(wo.l1 ?? 0) > 0 && Number(wo.l2 ?? 0) > 0
          ? (Number(wo.l1) + Number(wo.l2)) / 2 : Number(wo.l1 ?? wo.l2 ?? 0) || 6;
        const orderedMtr = wo.uom === 'Mtrs' ? Number(wo.ordered_qty || 0) : Number(wo.ordered_qty || 0) * avgLength;
        const od = Number(wo.size_od ?? 0);
        const wt = Number(wo.size_wt ?? 0);
        const mtPerMtr = od > wt ? (od - wt) * wt * 0.0246615 * 0.001 : 0;

        // Physical WIP only. Ordered quantity is shown separately and is never a WIP fallback.
        const ledgerMtr = stageRows.reduce((s, r) => s + Math.max(Number(r.current_wip ?? 0), 0), 0);
        const ledgerPcs = stageRows.reduce((s, r) => s + Math.max(Number(r.current_wip_pcs ?? 0), 0), 0);
        const ledgerMt = stageRows.reduce((s, r) => s + Math.max(Number(r.current_wip_mt ?? 0), 0), 0);
        const sourceDivertedMtr = stageRows.reduce((s, r) => s + Math.max(Number(r.diversion_out ?? 0), 0), 0);
        const totalWipMtr = Math.max(0, ledgerMtr - sourceDivertedMtr);
        const totalWipPcs = Math.max(0, ledgerPcs - (avgLength > 0 ? sourceDivertedMtr / avgLength : 0));
        const totalWipMt = Math.max(0, ledgerMt - sourceDivertedMtr * mtPerMtr);
        const rolling = stageRows.find((r) => r.stage_id && r.sequence_no === 1);
        const divertedIn = stageRows.reduce((s, r) => s + Number(r.diversion_in ?? 0), 0);

        return {
          wo: { ...wo, balance_qty_pcs: totalWipPcs, balance_qty_mtr: totalWipMtr, balance_qty_mt: totalWipMt },
          od, wt, l1: Number(wo.l1 ?? 0), l2: Number(wo.l2 ?? 0), avgLength,
          orderedMtr, orderedPcs: avgLength > 0 ? orderedMtr / avgLength : 0, orderedMt: orderedMtr * mtPerMtr,
          rollingGrossMtr: Number(rolling?.production_qty ?? 0), rollingRejMtr: Number(rolling?.rejection_qty ?? 0),
          rollingNetMtr: Number(rolling?.net_output_mtr ?? 0), rollingHtcOkMtr: Number(rolling?.net_output_mtr ?? 0),
          rollingHtcOkPcs: Number(rolling?.net_output_pcs ?? 0), rollingHtcOkMt: Number(rolling?.net_output_mt ?? 0),
          divertedOutMtr: sourceDivertedMtr, divertedOutPcs: avgLength > 0 ? sourceDivertedMtr / avgLength : 0, divertedOutMt: sourceDivertedMtr * mtPerMtr,
          divertedInMtr: divertedIn, divertedInPcs: avgLength > 0 ? divertedIn / avgLength : 0, divertedInMt: divertedIn * mtPerMtr,
          physicalAvailableMtr: totalWipMtr, unplannedOrderMtr: 0,
          balanceWipMtr: totalWipMtr, balanceWipPcs: totalWipPcs, balanceWipMt: totalWipMt,
          stageBreakdown: stageRows.map((r) => ({
            stage_code: '', stage_name: '', sequence_no: Number(r.sequence_no),
            available_mtr: Number(r.current_wip ?? 0), available_pcs: Number(r.current_wip_pcs ?? 0), available_mt: Number(r.current_wip_mt ?? 0),
            input_qty: Number(r.incoming_qty ?? 0), output_qty: Number(r.production_qty ?? 0), rejection_qty: Number(r.rejection_qty ?? 0), net_output_qty: Number(r.net_output_mtr ?? 0),
          })),
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
