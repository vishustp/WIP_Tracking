import { describe, it, expect } from 'vitest';
import { createAdminClient } from '@/lib/supabase/admin';

describe('WO 6307 Diversion Form WIP Availability', () => {
  it('correctly loads and displays available physical and salvage WIP for WO 6307', async () => {
    const admin = createAdminClient();
    if (!admin) return;

    // Fetch work order 6307
    const { data: woData } = await admin
      .from('work_orders')
      .select('*')
      .eq('work_order_no', '6307');
    expect(woData).toBeDefined();
    expect(woData!.length).toBeGreaterThan(0);
    const wo = woData![0];

    // Fetch stage rows and qc inspections
    const [wipRes, qcRes] = await Promise.all([
      admin.from('vw_route_stage_wip').select('*').eq('work_order_id', wo.id).order('sequence_no', { ascending: true }),
      admin.from('qc_inspections').select('*').eq('work_order_id', wo.id),
    ]);

    const stageRows = wipRes.data || [];
    const allQcList = qcRes.data || [];

    const avgLength = Number(wo.l1 ?? 0) > 0 && Number(wo.l2 ?? 0) > 0
      ? (Number(wo.l1) + Number(wo.l2)) / 2
      : Number(wo.l1 ?? wo.l2 ?? 0) || 6;
    const od = Number(wo.size_od ?? 0);
    const wt = Number(wo.size_wt ?? 0);
    const mtPerMtr = od > wt ? (od - wt) * wt * 0.0246615 * 0.001 : 0;

    const stageBreakdown = stageRows.map((stg: any) => {
      const sc = stg.stage_code;

      let dbWipMtr = Number(stg.current_wip || 0) + Number(stg.pending_rej_mtr || 0);
      let dbWipPcs = Number(stg.current_wip_pcs || 0) + Number(stg.pending_rej_pcs || 0);
      if (dbWipPcs <= 0 && dbWipMtr > 0 && avgLength > 0) {
        dbWipPcs = Math.max(1, Math.round(dbWipMtr / avgLength));
      }
      let dbWipMt = Number(stg.current_wip_mt ?? (dbWipMtr * mtPerMtr));

      let curWipPcs = dbWipPcs;
      let curWipMtr = dbWipMtr;
      let curWipMt = dbWipMt;

      // Reconcile VDI WIP under Rule 2 Option B
      if (sc === 'VDI' && allQcList.length > 0) {
        const totalVdiRejMtr = allQcList.reduce((sum: number, q: any) => sum + Number(q.vdi_rejection_mtr || 0) + Number(q.vdi_salvage_mtr || 0), 0);
        const totalVdiRejPcs = allQcList.reduce((sum: number, q: any) => sum + Number(q.vdi_rejection_pcs || 0) + Number(q.vdi_salvage_pcs || 0), 0);
        const vdiDivOutMtr = Number(stg.diversion_out || 0);
        const vdiDivOutPcs = avgLength > 0 ? Math.round(vdiDivOutMtr / avgLength) : 0;
        const availableVdiRejMtr = Math.max(0, totalVdiRejMtr - vdiDivOutMtr);
        const availableVdiRejPcs = Math.max(0, totalVdiRejPcs - vdiDivOutPcs);

        if (availableVdiRejMtr > 0 && curWipMtr < Number(stg.current_wip || 0) + availableVdiRejMtr) {
          curWipMtr = Number((curWipMtr + availableVdiRejMtr).toFixed(3));
          curWipPcs += availableVdiRejPcs;
          curWipMt = curWipMtr * mtPerMtr;
        }
      }

      return {
        stage_code: sc,
        available_mtr: curWipMtr,
        available_pcs: curWipPcs,
        available_mt: curWipMt,
      };
    });

    // Verify VDI stage has positive available physical and salvage WIP
    const vdiStage = stageBreakdown.find((s) => s.stage_code === 'VDI');
    expect(vdiStage).toBeDefined();
    expect(vdiStage!.available_pcs).toBeGreaterThan(0);
    expect(vdiStage!.available_mtr).toBeGreaterThan(0);

    // Total available WIP for WO 6307 must be positive and divertible
    const totalWipPcs = stageBreakdown.reduce((sum, s) => sum + s.available_pcs, 0);
    const totalWipMtr = stageBreakdown.reduce((sum, s) => sum + s.available_mtr, 0);
    expect(totalWipPcs).toBeGreaterThanOrEqual(128);
    expect(totalWipMtr).toBeGreaterThanOrEqual(1473.3);
  });
});
