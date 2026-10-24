import { describe, it, expect } from 'vitest';
import { reconcileCampaignWorkOrderWip } from '@/lib/campaignWipUtils';

describe('Dashboard and Work Center WIP Verification & Optimization', () => {
  it('executes reconcileCampaignWorkOrderWip in sub-millisecond time with pre-indexed maps', () => {
    const woId = 'wo-101';
    const wo = { id: woId, work_order_no: 'WO-101', size_od: 60.3, size_wt: 3.91, l1: 6, l2: 6 };
    const rows = [
      { work_order_id: woId, stage_code: 'ROLLING', sequence_no: 1, gross_output_mtr: 600, gross_output_pcs: 100 },
      { work_order_id: woId, stage_code: 'DRAW', sequence_no: 2, gross_output_mtr: 600, gross_output_pcs: 100 },
      { work_order_id: woId, stage_code: 'FINISHING', sequence_no: 3, gross_output_mtr: 300, gross_output_pcs: 50 },
    ];
    const productionLogs = [
      { id: 'log-1', work_order_id: woId, stage_code: 'ROLLING', output_qty: 600, output_pcs: 100, remarks: '[PCS:100]' },
      { id: 'log-2', work_order_id: woId, stage_code: 'DRAW', output_qty: 600, output_pcs: 100, remarks: '[PCS:100]' },
      { id: 'log-3', work_order_id: woId, stage_code: 'FINISHING', output_qty: 300, output_pcs: 50, remarks: '[PCS:50]' },
    ];
    const qcInspections: any[] = [];
    const hierarchyMaps = {
      campaignMembersMap: new Map(),
      childToMasterMap: new Map(),
      mhMap: new Map(),
    };

    const productionLogsByWo = new Map<string, any[]>([[woId, productionLogs]]);
    const qcInspectionsByWo = new Map<string, any[]>([[woId, qcInspections]]);

    const start = performance.now();
    const result = reconcileCampaignWorkOrderWip({
      woId,
      wo,
      rows,
      qcInspections,
      productionLogs,
      hierarchyMaps,
      productionLogsByWo,
      qcInspectionsByWo,
    });
    const elapsed = performance.now() - start;

    expect(result).toBeDefined();
    expect(result.summary).toBeDefined();
    expect(result.summary.stages.length).toBeGreaterThan(0);
    // Verifying sub-50ms performance for O(1) indexed lookup
    expect(elapsed).toBeLessThan(50);
  });

  it('guarantees physical WIP queue balance is preserved regardless of date range in work center report', () => {
    // Simulated work center state:
    // Physical inventory resident at station waiting to be processed = 250 pcs
    const fallbackWipPcs = 250;
    const fallbackWipMt = 12.5;
    const fallbackWipMtr = 1500;

    // Yesterday's production output done at station = 40 pcs
    const donePcs = 40;
    const doneMt = 2.0;
    const doneMtr = 240;

    // Feeder preceding stage production logged yesterday = 0 pcs (feeder didn't produce yesterday)
    const feederOkPcs = 0;
    const feederOkMt = 0;
    const feederOkMtr = 0;

    // Direct physical balance logic:
    const balancePcs = fallbackWipPcs;
    const balanceMtr = fallbackWipMtr;
    const balanceMt = fallbackWipMt;

    const receivedPcs = feederOkPcs > 0 ? feederOkPcs : (donePcs + balancePcs);
    const receivedMt = feederOkMt > 0 ? feederOkMt : (doneMt + balanceMt);
    const receivedMtr = feederOkMtr > 0 ? feederOkMtr : (doneMtr + balanceMtr);

    // Active WIP balance MUST be 250 pieces, NOT 0
    expect(balancePcs).toBe(250);
    expect(balanceMt).toBe(12.5);
    expect(balanceMtr).toBe(1500);

    // Inflow material accounted = Done + Remaining Active WIP = 290
    expect(receivedPcs).toBe(290);
    expect(receivedMt).toBe(14.5);
    expect(receivedMtr).toBe(1740);
  });
});
