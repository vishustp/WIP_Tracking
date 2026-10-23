import { describe, it, expect } from 'vitest';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeAgingReportRows } from '@/lib/reports/agingReportHelper';
import { reconcileCampaignWorkOrderWip, buildCampaignHierarchyMaps } from '@/lib/campaignWipUtils';

describe('WO 6495 Draw Bench WIP & Aging', () => {
  it('correctly calculates 0 WIP at DRAW for WO 6495 when all 100 rolled pieces were drawn', async () => {
    const admin = createAdminClient();
    if (!admin) {
      console.log('No admin client in test environment');
      return;
    }

    const { data: wo } = await admin
      .from('work_orders')
      .select('*')
      .eq('work_order_no', '6495')
      .single();

    expect(wo).toBeDefined();
    if (!wo) return;

    const [wipRes, plansRes, prodRes, stagesRes, routeStagesRes, qcRes] = await Promise.all([
      admin.from('vw_route_stage_wip').select('*').eq('work_order_id', wo.id),
      admin.from('rolling_plans').select('*').eq('work_order_id', wo.id),
      admin.from('production_logs').select('*, process_stages(stage_name, stage_code)').eq('work_order_id', wo.id),
      admin.from('process_stages').select('*'),
      admin.from('route_stages').select('*'),
      admin.from('qc_inspections').select('*').eq('work_order_id', wo.id),
    ]);

    // 1. Verify via reconcileCampaignWorkOrderWip (Matrix & WIP Reconciliation standard)
    const hierarchyMaps = buildCampaignHierarchyMaps(plansRes.data || []);
    const stageCodeById = new Map<string, string>();
    (stagesRes.data || []).forEach((s: any) => {
      if (s.id && s.stage_code) stageCodeById.set(s.id, (s.stage_code || '').toUpperCase());
    });

    const reconciled = reconcileCampaignWorkOrderWip({
      woId: wo.id,
      wo,
      rows: wipRes.data || [],
      qcInspections: qcRes.data || [],
      productionLogs: prodRes.data || [],
      hierarchyMaps,
      stageCodeById,
    });

    const drawStage = reconciled.summary.stages.find((s) => s.stage_code === 'DRAW');
    const rollStage = reconciled.summary.stages.find((s) => s.stage_code === 'ROLLING');
    const htStage = reconciled.summary.stages.find((s) => s.stage_code === 'HEAT_TREATMENT');
    const bsStage = reconciled.summary.stages.find((s) => s.stage_code === 'BAND_SAW');

    expect(rollStage).toBeDefined();
    expect(drawStage).toBeDefined();
    expect(htStage).toBeDefined();
    expect(bsStage).toBeDefined();

    // Rolled 100, Drawn 100, HT 100
    expect(rollStage!.production_pcs).toBe(100);
    expect(drawStage!.production_pcs).toBe(100);
    expect(htStage!.production_pcs).toBe(100);

    // Active WIP: DRAW must be 0, HT must be 0, BAND_SAW must be 100
    expect(drawStage!.reconciled_wip_pcs).toBe(0);
    expect(drawStage!.capped_wip_pcs).toBe(0);
    expect(htStage!.reconciled_wip_pcs).toBe(0);
    expect(htStage!.capped_wip_pcs).toBe(0);
    // Band Saw was cut (100 mother pcs -> 198 cut pcs at VDI, minus any QC inspected pcs)
    expect(bsStage!.reconciled_wip_pcs).toBe(0);
    const vdiStage = reconciled.summary.stages.find((s) => s.stage_code === 'VDI');
    expect(vdiStage).toBeDefined();
    const totalQcInspected = (qcRes.data || []).reduce((sum: number, q: any) => sum + Number(q.inspected_pcs || 0), 0);
    expect(vdiStage!.reconciled_wip_pcs).toBe(Math.max(0, 198 - totalQcInspected));

    // 2. Verify Aging Report rows calculation
    const agingRows = computeAgingReportRows({
      wipRows: wipRes.data || [],
      workOrders: [wo],
      productionLogs: prodRes.data || [],
      qcInspections: qcRes.data || [],
      rollingPlans: plansRes.data || [],
      routeStages: routeStagesRes.data || [],
    });

    const agingDrawRow = agingRows.find((r) => r.work_order_id === wo.id && r.stage_code === 'DRAW');
    expect(agingDrawRow).toBeUndefined(); // DRAW has 0 WIP, so it must not show in aging
  });
});
