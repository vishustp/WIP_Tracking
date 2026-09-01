'use client';

import { ReactNode, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { mockStore } from '@/lib/supabase/mock-store';

type WipRow = {
  work_order_id: string; work_order_no: string; customer_name: string | null;
  route_id: string; route_code: string; route_name: string; stage_id: string;
  stage_code: string; stage_name: string; sequence_no: number;
  incoming_qty: number | null; diversion_in: number | null; diversion_out: number | null;
  production_qty: number | null; rejection_qty: number | null;
  current_wip: number | null; current_wip_pcs: number | null; current_wip_mt: number | null;
  net_output_mtr: number | null; net_output_pcs: number | null; net_output_mt: number | null;
  size_od: number | null; size_wt: number | null; l1: number | null; l2: number | null;
};

type WorkOrderRow = {
  id: string; work_order_no: string; customer_name: string | null; grade: string | null;
  specification?: string | null; size_od: number | null; size_wt: number | null;
  l1: number | null; l2: number | null; ordered_qty: number; uom: 'Pcs' | 'Mtrs';
};

/** Loads the real route-stage WIP before DiversionForm is rendered. */
export default function DiversionWipBootstrap({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const supabase = createClient();
      const [wipRes, woRes] = await Promise.all([
        supabase.from('vw_route_stage_wip').select(
          'work_order_id,work_order_no,customer_name,route_id,route_code,route_name,stage_id,stage_code,stage_name,sequence_no,incoming_qty,diversion_in,diversion_out,production_qty,rejection_qty,current_wip,current_wip_pcs,current_wip_mt,net_output_mtr,net_output_pcs,net_output_mt,size_od,size_wt,l1,l2'
        ).order('work_order_no').order('sequence_no'),
        supabase.from('work_orders').select(
          'id,work_order_no,customer_name,grade,specification,size_od,size_wt,l1,l2,ordered_qty,uom'
        ),
      ]);

      if (cancelled) return;
      if (wipRes.error || !Array.isArray(wipRes.data)) {
        setReady(true);
        return;
      }

      const rows = wipRes.data as WipRow[];
      const workOrders = (woRes.data ?? []) as WorkOrderRow[];
      const woMap = new Map(workOrders.map((wo) => [wo.id, wo]));
      const byWo = new Map<string, WipRow[]>();
      rows.forEach((row) => byWo.set(row.work_order_id, [...(byWo.get(row.work_order_id) ?? []), row]));
      const original = mockStore.getWorkOrderWipSummary.bind(mockStore);

      mockStore.getWorkOrderWipSummary = (woId: string) => {
        const stageRows = byWo.get(woId);
        const wo = woMap.get(woId);
        if (!stageRows?.length || !wo) return original(woId);

        const first = stageRows[0];
        const rolling = stageRows.find((r) => r.stage_code === 'ROLLING');
        const avgLength = Number(wo.l1 ?? 0) > 0 && Number(wo.l2 ?? 0) > 0
          ? (Number(wo.l1) + Number(wo.l2)) / 2
          : Number(wo.l1 ?? wo.l2 ?? 0) || 6;
        const orderedMtr = wo.uom === 'Mtrs' ? Number(wo.ordered_qty || 0) : Number(wo.ordered_qty || 0) * avgLength;
        const orderedPcs = avgLength > 0 ? orderedMtr / avgLength : 0;
        const od = Number(wo.size_od ?? first.size_od ?? 0);
        const wt = Number(wo.size_wt ?? first.size_wt ?? 0);
        const mtPerMtr = od > wt ? (od - wt) * wt * 0.0246615 * 0.001 : 0;
        const divertedOut = stageRows.reduce((s, r) => s + Number(r.diversion_out ?? 0), 0);
        const divertedIn = stageRows.reduce((s, r) => s + Number(r.diversion_in ?? 0), 0);

        return {
          wo: { ...wo, status: 'WIP', target_date: null, balance_qty_pcs: orderedPcs, balance_qty_mtr: orderedMtr, balance_qty_mt: orderedMtr * mtPerMtr },
          od, wt, l1: Number(wo.l1 ?? first.l1 ?? 0), l2: Number(wo.l2 ?? first.l2 ?? 0), avgLength,
          orderedMtr, orderedPcs, orderedMt: orderedMtr * mtPerMtr,
          rollingGrossMtr: Number(rolling?.production_qty ?? 0), rollingRejMtr: Number(rolling?.rejection_qty ?? 0),
          rollingNetMtr: Number(rolling?.net_output_mtr ?? 0), rollingHtcOkMtr: Number(rolling?.net_output_mtr ?? 0),
          rollingHtcOkPcs: Number(rolling?.net_output_pcs ?? 0), rollingHtcOkMt: Number(rolling?.net_output_mt ?? 0),
          divertedOutMtr: divertedOut, divertedOutPcs: avgLength > 0 ? divertedOut / avgLength : 0, divertedOutMt: divertedOut * mtPerMtr,
          divertedInMtr: divertedIn, divertedInPcs: avgLength > 0 ? divertedIn / avgLength : 0, divertedInMt: divertedIn * mtPerMtr,
          physicalAvailableMtr: Number(first.current_wip ?? 0), unplannedOrderMtr: 0,
          balanceWipMtr: Number(first.current_wip ?? 0), balanceWipPcs: Number(first.current_wip_pcs ?? 0), balanceWipMt: Number(first.current_wip_mt ?? 0),
          stageBreakdown: stageRows.map((r) => ({
            stage_code: r.stage_code, stage_name: r.stage_name, sequence_no: Number(r.sequence_no),
            available_mtr: Number(r.current_wip ?? 0), available_pcs: Number(r.current_wip_pcs ?? 0), available_mt: Number(r.current_wip_mt ?? 0),
            input_qty: Number(r.incoming_qty ?? 0), output_qty: Number(r.production_qty ?? 0), rejection_qty: Number(r.rejection_qty ?? 0),
            net_output_qty: Number(r.net_output_mtr ?? 0),
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
