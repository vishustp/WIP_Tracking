import { describe, it, expect } from 'vitest';
import { reconcileCampaignWorkOrderWip } from '@/lib/campaignWipUtils';

describe('WO 6307 Work Order Length & Diversion Piece Length Integrity', () => {
  it('correctly uses customer specification lengths (l1=11m, l2=12m => 11.5m) instead of 6.0m fallback', () => {
    // Mock WO 6307: size 38.1 x 3.5 mm, l1: 11.0, l2: 12.0
    const wo = {
      id: 'wo-6307-uuid',
      work_order_no: '6307',
      customer_name: 'TEST CUSTOMER',
      grade: 'ASTM A213 T11',
      size_od: 38.1,
      size_wt: 3.5,
      l1: 11.0,
      l2: 12.0,
      ordered_qty: 3000,
    };

    // Stage rows from vw_route_stage_wip do not have l1/l2 or avg_length columns
    const rows = [
      {
        work_order_id: wo.id,
        stage_code: 'ROLLING',
        stage_name: 'Rolling Mill',
        sequence_no: 1,
        current_wip: 0,
        current_wip_pcs: 0,
      },
      {
        work_order_id: wo.id,
        stage_code: 'HOLLOW_HEAT_TREATMENT',
        stage_name: 'Hollow Heat Treatment',
        sequence_no: 2,
        current_wip: 0,
        current_wip_pcs: 0,
      },
      {
        work_order_id: wo.id,
        stage_code: 'DRAW',
        stage_name: 'Cold Draw Bench',
        sequence_no: 3,
        current_wip: 0,
        current_wip_pcs: 0,
      },
      {
        work_order_id: wo.id,
        stage_code: 'HEAT_TREATMENT',
        stage_name: 'Final Heat Treatment',
        sequence_no: 4,
        current_wip: 0,
        current_wip_pcs: 0,
      },
      {
        work_order_id: wo.id,
        stage_code: 'BAND_SAW',
        stage_name: 'Band Saw Cutting',
        sequence_no: 5,
        current_wip: 0,
        current_wip_pcs: 0,
      },
      {
        work_order_id: wo.id,
        stage_code: 'VDI',
        stage_name: 'VDI Inspection',
        sequence_no: 6,
        current_wip: 2725.5,
        current_wip_pcs: 237,
      },
      {
        work_order_id: wo.id,
        stage_code: 'FINISHING',
        stage_name: 'Finishing Line',
        sequence_no: 7,
        current_wip: 0,
        current_wip_pcs: 0,
      },
    ];

    // Band Saw logged 237 cut pieces, VDI has not inspected them yet
    const productionLogs = [
      {
        id: 'log-bs-1',
        work_order_id: wo.id,
        process_stages: { stage_code: 'BAND_SAW', stage_name: 'Band Saw' },
        stage_code: 'BAND_SAW',
        output_pcs: 237,
        output_qty: 2725.5,
        rejection_qty: 0,
        rejection_pcs: 0,
      },
    ];

    const { summary } = reconcileCampaignWorkOrderWip({
      woId: wo.id,
      wo,
      rows,
      qcInspections: [],
      productionLogs,
      hierarchyMaps: {
        campaignMembersMap: new Map(),
        childToMasterMap: new Map(),
        mhMap: new Map(),
      },
    });

    const vdiStage = summary.stages.find((s) => s.stage_code === 'VDI');
    expect(vdiStage).toBeDefined();

    // Available pieces at VDI must be 237
    expect(vdiStage!.capped_wip_pcs).toBe(237);

    // Available meters must NOT be 1422 m (which was 237 * 6.0m)
    // It must use the work order mean length (11 + 12)/2 = 11.5m => 2725.5 m
    expect(vdiStage!.capped_wip_mtr).toBe(2725.5);
    expect(vdiStage!.capped_wip_mtr).not.toBe(1422);

    // Effective piece length for diversion
    const pieceLen = Number((vdiStage!.capped_wip_mtr / vdiStage!.capped_wip_pcs).toFixed(2));
    expect(pieceLen).toBe(11.5);
  });
});
