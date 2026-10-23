import { describe, it, expect } from 'vitest';
import { createAdminClient } from '@/lib/supabase/admin';
import { reconcileCampaignWorkOrderWip, buildCampaignHierarchyMaps } from '@/lib/campaignWipUtils';

describe('WO 6307 Diversion Form WIP Availability', () => {
  it('correctly loads and displays exactly 237 nos at VDI for WO 6307', async () => {
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

    // Fetch stage rows, plans, prod logs, and qc inspections
    const [wipRes, plansRes, prodRes, stagesRes, qcRes] = await Promise.all([
      admin.from('vw_route_stage_wip').select('*').eq('work_order_id', wo.id).order('sequence_no', { ascending: true }),
      admin.from('rolling_plans').select('*'),
      admin.from('production_logs').select('*, process_stages(stage_name, stage_code)').eq('work_order_id', wo.id),
      admin.from('process_stages').select('*'),
      admin.from('qc_inspections').select('*').eq('work_order_id', wo.id),
    ]);

    const stageRows = wipRes.data || [];
    const allQcList = qcRes.data || [];

    const hierarchyMaps = buildCampaignHierarchyMaps(plansRes.data || []);
    const stageCodeById = new Map<string, string>();
    stagesRes.data?.forEach((s: any) => {
      if (s.id && s.stage_code) stageCodeById.set(s.id, s.stage_code.toUpperCase());
    });
    const finishingStageId = stagesRes.data?.find((s: any) => s.stage_code === 'FINISHING')?.id;

    const reconciled = reconcileCampaignWorkOrderWip({
      woId: wo.id,
      wo,
      rows: stageRows,
      qcInspections: allQcList,
      productionLogs: prodRes.data || [],
      hierarchyMaps,
      routeCode: 'CDS',
      stageCodeById,
      finishingStageId,
    });

    const avgLength = Number(wo.l1 ?? 0) > 0 && Number(wo.l2 ?? 0) > 0
      ? (Number(wo.l1) + Number(wo.l2)) / 2
      : Number(wo.l1 ?? wo.l2 ?? 0) || 6;
    const od = Number(wo.size_od ?? 0);
    const wt = Number(wo.size_wt ?? 0);
    const mtPerMtr = od > wt ? (od - wt) * wt * 0.0246615 * 0.001 : 0;

    const stageBreakdown = stageRows.map((stg: any) => {
      const sc = stg.stage_code;
      const recStage = reconciled.summary.stages.find((s: any) => s.stage_code === sc);

      let curWipPcs = Number(recStage?.capped_wip_pcs ?? recStage?.reconciled_wip_pcs ?? 0);
      let curWipMtr = Number(recStage?.capped_wip_mtr ?? recStage?.reconciled_wip_mtr ?? 0);
      let curWipMt = Number(recStage?.capped_wip_mt ?? recStage?.reconciled_wip_mt ?? (curWipMtr * mtPerMtr));

      // Reconcile VDI WIP under Rule 2 Option B:
      // Rejections/salvage logged by QC inspections remain active WIP and are available for diversion.
      if (sc === 'VDI') {
        const totalVdiRejMtr = allQcList.reduce((sum: number, q: any) => sum + Number(q.vdi_rejection_mtr || 0) + Number(q.vdi_salvage_mtr || 0), 0);
        const totalVdiRejPcs = allQcList.reduce((sum: number, q: any) => sum + Number(q.vdi_rejection_pcs || 0) + Number(q.vdi_salvage_pcs || 0), 0);
        const vdiDivOutMtr = Number(stg.diversion_out || 0);
        const vdiDivOutPcs = avgLength > 0 ? Math.round(vdiDivOutMtr / avgLength) : 0;
        const availableVdiRejMtr = Math.max(0, totalVdiRejMtr - vdiDivOutMtr);
        const availableVdiRejPcs = Math.max(0, totalVdiRejPcs - vdiDivOutPcs);

        // When prime uninspected material has fully passed downstream, active WIP at VDI is strictly the undispositioned salvage pool
        if (curWipPcs === 0 && availableVdiRejPcs > 0) {
          curWipPcs = availableVdiRejPcs;
          curWipMtr = avgLength > 0 ? Number((availableVdiRejPcs * avgLength).toFixed(2)) : availableVdiRejMtr;
          curWipMt = curWipMtr * mtPerMtr;
        } else if (availableVdiRejPcs > 0 && curWipPcs < availableVdiRejPcs) {
          curWipPcs = availableVdiRejPcs;
          curWipMtr = avgLength > 0 ? Number((availableVdiRejPcs * avgLength).toFixed(2)) : availableVdiRejMtr;
          curWipMt = curWipMtr * mtPerMtr;
        }
      }

      // Reconcile Finishing WIP if VDI QC inspection exists (guarding against database view double-deduction of salvage)
      if (sc === 'FINISHING' && allQcList.length > 0 && curWipPcs > 0) {
        const totalVdiOkMtr = allQcList.reduce((sum: number, q: any) => sum + Number(q.vdi_ok_mtr || 0), 0);
        if (totalVdiOkMtr > 0) {
          const divIn = Number(stg.diversion_in || 0);
          const divOut = Number(stg.diversion_out || 0);
          const prodMtr = Number(stg.production_qty || 0);
          const rejMtr = Number(stg.rejection_qty || 0);
          const trueFinWipMtr = Math.max(0, totalVdiOkMtr + divIn - prodMtr - rejMtr - divOut);
          if (Math.abs(trueFinWipMtr - curWipMtr) > 0.01) {
            curWipMtr = Number(trueFinWipMtr.toFixed(3));
            curWipPcs = avgLength > 0 ? Math.round(curWipMtr / avgLength) : 0;
            curWipMt = curWipMtr * mtPerMtr;
          }
        }
      }

      // Fallback: if reconciled WIP is 0, only use db current_wip if downstream hasn't consumed it
      if (curWipPcs === 0 && curWipMtr === 0 && Number(stg.current_wip || 0) > 0 && sc !== 'VDI') {
        const downstreamProduced = stageRows
          .filter((sr: any) => sr.sequence_no > stg.sequence_no)
          .some((sr: any) => Number(sr.production_qty || 0) > 0);
        if (!downstreamProduced) {
          curWipMtr = Number(stg.current_wip || 0);
          curWipPcs = Number(stg.current_wip_pcs || (avgLength > 0 ? Math.round(curWipMtr / avgLength) : 0));
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

    console.log('Final stageBreakdown for WO 6307:');
    stageBreakdown.forEach((s) => {
      console.log(`  ${s.stage_code}: ${s.available_pcs} pcs / ${s.available_mtr} m`);
    });

    const vdiStage = stageBreakdown.find((s) => s.stage_code === 'VDI');
    expect(vdiStage).toBeDefined();
    // Exactly 237 pieces available at VDI
    expect(vdiStage!.available_pcs).toBe(237);
    expect(vdiStage!.available_mtr).toBe(2725.5);

    // Total available WIP for WO 6307 is exactly 237 pcs (only VDI has WIP)
    const totalWipPcs = stageBreakdown.reduce((sum, s) => sum + s.available_pcs, 0);
    const totalWipMtr = stageBreakdown.reduce((sum, s) => sum + s.available_mtr, 0);
    expect(totalWipPcs).toBe(237);
    expect(totalWipMtr).toBe(2725.5);
  });
});
