import { describe, it, expect } from 'vitest';
import { reconcileCampaignWorkOrderWip } from '@/lib/campaignWipUtils';

describe('WIP Matrix Diversion Reconciliation Suite', () => {
  it('deducts outbound diversion from source work order VDI WIP', () => {
    // Simulated work order WO 6453: 1680m incoming, 1536m inspected at VDI, 104m diverted out
    const wo = {
      id: 'wo-6453',
      work_order_no: '6453',
      size_od: 76.1,
      size_wt: 4.5,
      l1: 8,
      l2: 8,
      status: 'In Progress',
    };

    const rows = [
      {
        stage_code: 'ROLLING',
        sequence_no: 1,
        incoming_qty: 1311.5,
        production_qty: 1311.5,
      },
      {
        stage_code: 'DRAW',
        sequence_no: 2,
        incoming_qty: 1311.5,
        production_qty: 1728,
      },
      {
        stage_code: 'HEAT_TREATMENT',
        sequence_no: 3,
        incoming_qty: 1728,
        production_qty: 1223.96,
      },
      {
        stage_code: 'BAND_SAW',
        sequence_no: 4,
        incoming_qty: 1223.96,
        production_qty: 1680,
        gross_output_pcs: 210,
      },
      {
        stage_code: 'VDI',
        sequence_no: 5,
        incoming_qty: 1680,
        incoming_qty_pcs: 210,
        production_qty: 1536,
        gross_output_pcs: 192,
        diversion_out: 104,
        diversion_out_pcs: 13,
      },
      {
        stage_code: 'FINISHING',
        sequence_no: 6,
        incoming_qty: 1536,
        production_qty: 872,
      },
    ];

    const { summary } = reconcileCampaignWorkOrderWip({
      woId: 'wo-6453',
      wo,
      rows,
      qcInspections: [],
      productionLogs: [],
      hierarchyMaps: {
        campaignMembersMap: new Map(),
        childToMasterMap: new Map(),
        mhMap: new Map(),
      },
      finishingStageId: 'fin-1',
      stageCodeById: new Map(),
      routeCode: 'CDS',
    });

    const vdiStage = summary.stages.find((s) => s.stage_code === 'VDI');
    expect(vdiStage).toBeDefined();
    // 1680 - 1536 = 144m (18 pcs) before diversion. After 104m (13 pcs) diverted out: 40m (5 pcs)
    expect(vdiStage?.capped_wip_pcs).toBe(5);
    expect(vdiStage?.capped_wip_mtr).toBe(40);
  });
});
