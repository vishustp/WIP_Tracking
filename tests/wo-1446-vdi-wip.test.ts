import { describe, it, expect } from 'vitest';
import { createAdminClient } from '@/lib/supabase/admin';
import { reconcileCampaignWorkOrderWip, buildCampaignHierarchyMaps } from '@/lib/campaignWipUtils';

describe('WO 1446 VDI WIP Reconciliation', () => {
  it('correctly calculates 0 WIP at VDI for WO 1446 when inspection is completed', async () => {
    const admin = createAdminClient();
    if (!admin) {
      console.log('No admin client in test environment');
      return;
    }
    const { data: wo } = await admin
      .from('work_orders')
      .select('*')
      .ilike('work_order_no', '%1446%')
      .single();

    expect(wo).toBeDefined();
    if (!wo) return;

    // Load all data exactly like SizeGradeWipReportClient
    const [wipRes, plansRes, prodRes, stagesRes, qcRes] = await Promise.all([
      admin.from('vw_route_stage_wip').select('*').limit(5000),
      admin.from('rolling_plans').select('*').not('status', 'is', null).limit(5000),
      admin.from('production_logs').select('*, process_stages(stage_name, stage_code)').limit(5000),
      admin.from('process_stages').select('*'),
      admin.from('qc_inspections').select('*').limit(5000),
    ]);

    const { campaignMembersMap, childToMasterMap, mhMap } = buildCampaignHierarchyMaps(plansRes.data || []);
    const stageCodeById = new Map<string, string>();
    (stagesRes.data || []).forEach((s: any) => {
      if (s.id && s.stage_code) stageCodeById.set(s.id, (s.stage_code || '').toUpperCase());
    });
    const finishingStageId = (stagesRes.data || []).find((s: any) => (s.stage_code || '').toUpperCase() === 'FINISHING')?.id;

    const rawRows1446 = (wipRes.data || []).filter((r: any) => r.work_order_id === wo.id);
    const { summary } = reconcileCampaignWorkOrderWip({
      woId: wo.id,
      wo,
      rows: rawRows1446,
      qcInspections: qcRes.data || [],
      productionLogs: prodRes.data || [],
      hierarchyMaps: { campaignMembersMap, childToMasterMap, mhMap },
      finishingStageId,
      stageCodeById,
    });

    const vdiStage = summary.stages.find((s) => s.stage_code === 'VDI');
    const finStage = summary.stages.find((s) => s.stage_code === 'FINISHING');
    const bsStage = summary.stages.find((s) => s.stage_code === 'BAND_SAW');

    expect(bsStage).toBeDefined();
    expect(vdiStage).toBeDefined();
    expect(finStage).toBeDefined();

    // Band Saw had 0 cuts on WO 1446; must not have ghost synthesized output
    expect(bsStage!.production_pcs).toBe(0);
    expect(bsStage!.capped_wip_pcs).toBe(0);

    // VDI had all diverted pipes inspected (728 PCS); VDI active WIP must be 0
    expect(vdiStage!.production_pcs).toBe(728);
    expect(vdiStage!.capped_wip_pcs).toBe(0);
    expect(vdiStage!.capped_wip_mtr).toBe(0);

    // Finishing had 680 PCS bundled out of 683 VDI OK pieces; Finishing WIP = 3 PCS
    expect(finStage!.production_pcs).toBe(680);
    expect(finStage!.capped_wip_pcs).toBe(3);
    expect(finStage!.capped_wip_mtr).toBe(18);
  });
});
