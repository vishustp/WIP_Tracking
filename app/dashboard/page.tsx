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
    const [kpiRes, wipRes, pendingRes, logsRes, plansRes] = await Promise.all([
      supabase.from('vw_dashboard_kpis').select('*').maybeSingle(),
      supabase
        .from('vw_route_stage_wip')
        .select('work_order_id,work_order_no,customer_name,route_id,route_code,route_name,stage_id,stage_code,stage_name,sequence_no,incoming_qty,current_wip,current_wip_pcs,current_wip_mt,size_od,size_wt,l1,l2')
        .order('sequence_no', { ascending: true })
        .order('work_order_no', { ascending: true }),
      supabase
        .from('vw_work_order_summary')
        .select('*')
        .gt('total_pending', 0)
        .order('target_date', { ascending: true, nullsFirst: false })
        .limit(20),
      supabase
        .from('production_logs')
        .select('work_order_id,stage_id,output_qty,output_pcs,rejection_qty,rejection_pcs,htc_ok,process_stages(stage_code)'),
      supabase
        .from('rolling_plans')
        .select('work_order_id,status,planned_qty,mh_od,mh_wt,plan_no'),
    ]);

    const rawWip = wipRes.data ?? [];
    const prodLogs = (logsRes.data ?? []) as any[];
    const rollingPlans = (plansRes.data ?? []) as any[];

    // Parse multi-work-order rolling campaign metadata
    const masterMap = new Map<string, any>();
    const childMap = new Map<string, { master_wo_id: string; master_wo_no: string; planned_mtr?: number }>();

    for (const p of rollingPlans) {
      try {
        const parsed = typeof p.status === 'string' ? JSON.parse(p.status) : p.status;
        if (parsed?.is_master && Array.isArray(parsed?.child_work_orders)) {
          masterMap.set(p.work_order_id, {
            ...p,
            parsed,
            child_work_orders: parsed.child_work_orders,
          });
          for (const c of parsed.child_work_orders) {
            const childId = c.work_order_id || c.id;
            if (childId) {
              childMap.set(childId, {
                master_wo_id: p.work_order_id,
                master_wo_no: parsed.master_wo_no || '',
                planned_mtr: Number(c.planned_mtr || 0),
              });
            }
          }
        } else if (parsed?.is_child) {
          childMap.set(p.work_order_id, {
            master_wo_id: parsed.master_wo_id,
            master_wo_no: parsed.master_wo_no || '',
            planned_mtr: Number(parsed.planned_mtr || p.planned_qty || 0),
          });
        }
      } catch {}
    }

    // Helper to get production logs for a work order (or master campaign if child)
    const getLogsForWo = (woId: string) => {
      const child = childMap.get(woId);
      const effectiveId = child ? child.master_wo_id : woId;
      return prodLogs.filter((l: any) => l.work_order_id === effectiveId);
    };

    // STRICT STEEL PLANT WIP CALCULATION:
    // 1. Physical WIP is strictly calculated AFTER Rolling Production is done.
    // 2. Physical WIP is strictly generated ONLY from Rolling HTC OK quantity.
    // 3. Prior to Rolling production, physical mother hollow pipe stock is 0.
    // 4. In multi-order campaigns, child orders have no independent pre-finishing WIP (bundled in Master).
    const calculatedWip = rawWip
      .map((r: any) => {
        const stageCode = (r.stage_code || '').toUpperCase();
        const childInfo = childMap.get(r.work_order_id);

        // Child orders in campaigns are bundled under master for pre-finishing stages
        if (childInfo && stageCode !== 'FINISHING') {
          return null;
        }

        const masterLogs = getLogsForWo(r.work_order_id);
        const rollLogs = masterLogs.filter((l: any) => (l.process_stages?.stage_code || l.stage_code) === 'ROLLING');
        const rollingOutMtr = rollLogs.reduce((sum: number, l: any) => sum + Number(l.output_qty || 0), 0);
        const rollingHtcOkMtr = rollLogs.reduce((sum: number, l: any) => sum + Number(l.htc_ok || 0), 0);

        // If rolling production is not done, physical WIP is strictly 0 across all stages
        if (rollingOutMtr <= 0) {
          return null;
        }

        // Hollow Heat Treatment (HTC)
        const htcLogs = masterLogs.filter(
          (l: any) => (l.process_stages?.stage_code || l.stage_code) === 'HOLLOW_HEAT_TREATMENT'
        );
        const htcOutMtr = htcLogs.reduce((sum: number, l: any) => sum + Number(l.output_qty || 0), 0);
        const htcRejMtr = htcLogs.reduce((sum: number, l: any) => sum + Number(l.rejection_qty || 0), 0);

        // Draw Bench
        const drawLogs = masterLogs.filter((l: any) => (l.process_stages?.stage_code || l.stage_code) === 'DRAW');
        const drawOutMtr = drawLogs.reduce((sum: number, l: any) => sum + Number(l.output_qty || 0), 0);
        const drawRejMtr = drawLogs.reduce((sum: number, l: any) => sum + Number(l.rejection_qty || 0), 0);

        // Heat Treatment
        const htLogs = masterLogs.filter((l: any) => (l.process_stages?.stage_code || l.stage_code) === 'HEAT_TREATMENT');
        const htOutMtr = htLogs.reduce((sum: number, l: any) => sum + Number(l.output_qty || 0), 0);
        const htRejMtr = htLogs.reduce((sum: number, l: any) => sum + Number(l.rejection_qty || 0), 0);

        // Finishing (tracked per work order)
        const woLogs = prodLogs.filter((l: any) => l.work_order_id === r.work_order_id);
        const finLogs = woLogs.filter((l: any) => (l.process_stages?.stage_code || l.stage_code) === 'FINISHING');
        const finOutMtr = finLogs.reduce((sum: number, l: any) => sum + Number(l.output_qty || 0), 0);
        const finRejMtr = finLogs.reduce((sum: number, l: any) => sum + Number(l.rejection_qty || 0), 0);

        let wipMtr = 0;

        if (stageCode === 'ROLLING') {
          // Rolling WIP: HTC OK minus material consumed downstream
          const downstreamConsumed = htcOutMtr + htcRejMtr > 0 ? htcOutMtr + htcRejMtr : drawOutMtr + drawRejMtr;
          wipMtr = Math.max(0, rollingHtcOkMtr - downstreamConsumed);
        } else if (stageCode === 'HOLLOW_HEAT_TREATMENT') {
          wipMtr = Math.max(0, rollingHtcOkMtr - htcOutMtr - htcRejMtr);
        } else if (stageCode === 'DRAW') {
          const incoming = htcOutMtr > 0 ? htcOutMtr : rollingHtcOkMtr;
          wipMtr = Math.max(0, incoming - drawOutMtr - drawRejMtr);
        } else if (stageCode === 'HEAT_TREATMENT') {
          wipMtr = drawOutMtr > 0 ? Math.max(0, drawOutMtr - htOutMtr - htRejMtr) : 0;
        } else if (stageCode === 'FINISHING') {
          const precedingOutMtr = htOutMtr > 0 ? htOutMtr : drawOutMtr;
          const targetMtr = childInfo
            ? Number(childInfo.planned_mtr || r.incoming_qty || 0)
            : Number(r.incoming_qty || 0);
          wipMtr =
            precedingOutMtr > 0 ? Math.max(0, Math.min(targetMtr, precedingOutMtr) - finOutMtr - finRejMtr) : 0;
        } else {
          // General fallback for other stages if present
          wipMtr = Math.max(0, Number(r.current_wip || 0));
        }

        if (wipMtr <= 0) return null;

        const avgLen = r.l1 && r.l2 ? (Number(r.l1) + Number(r.l2)) / 2 : Number(r.l1) || Number(r.l2) || 6.0;
        const wipPcs = avgLen > 0 ? Math.round(wipMtr / avgLen) : 0;
        const od = Number(r.size_od) || 0;
        const wt = Number(r.size_wt) || 0;
        const wipMt = od > 0 && wt > 0 ? mtFromMtr(wipMtr, od, wt) : 0;

        return {
          ...r,
          current_wip: wipMtr,
          current_wip_pcs: wipPcs,
          current_wip_mt: wipMt,
        };
      })
      .filter(Boolean);

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

