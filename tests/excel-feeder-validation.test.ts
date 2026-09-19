import { describe, it, expect } from 'vitest';
import { computeFeederBalanceForWorkOrder } from '../lib/feederValidation';
import { StageCode } from '../types';

describe('Excel Feeder WIP Capping Validation', () => {
  const mockStageCodeToId = new Map<string, string>([
    ['ROLLING', 'stage_rolling'],
    ['HOLLOW_HEAT_TREATMENT', 'stage_hht'],
    ['DRAW', 'stage_draw'],
    ['HEAT_TREATMENT', 'stage_ht'],
    ['BAND_SAW', 'stage_band_saw'],
    ['VDI', 'stage_vdi'],
    ['FINISHING', 'stage_finishing'],
  ]);

  const mockWorkOrder = {
    id: 'wo_123',
    work_order_no: 'WO-2026-100',
    l1: 6.0,
    l2: 6.0,
  };

  describe('Heat Treatment capping at Draw Bench Net Output', () => {
    it('calculates available Heat Treatment balance from Draw Bench net output', () => {
      const logs = [
        {
          work_order_id: 'wo_123',
          stage_id: 'stage_draw',
          output_qty: 600, // 100 pcs @ 6.0m
          rejection_qty: 60, // 10 pcs rej
          remarks: 'Draw Output [PCS:100] [REJ_PCS:10]',
        },
        {
          work_order_id: 'wo_123',
          stage_id: 'stage_ht',
          output_qty: 240, // 40 pcs
          rejection_qty: 0,
          remarks: 'HT Batch 1 [PCS:40] [REJ_PCS:0]',
        },
      ];

      const balance = computeFeederBalanceForWorkOrder({
        workOrder: mockWorkOrder,
        targetStage: 'HEAT_TREATMENT' as StageCode,
        routeCode: 'CDS',
        logs,
        stageCodeToId: mockStageCodeToId,
      });

      expect(balance.feederLabel).toBe('Draw Bench Net OK');
      // Draw Net = 100 - 10 = 90 PCS. Prev HT = 40 PCS. Remaining = 50 PCS.
      expect(balance.availPcs).toBe(50);
      expect(balance.availMtr).toBe(300); // 540m - 240m = 300m
    });

    it('returns 0 available when Draw Bench has no recorded output', () => {
      const logs: any[] = [];

      const balance = computeFeederBalanceForWorkOrder({
        workOrder: mockWorkOrder,
        targetStage: 'HEAT_TREATMENT' as StageCode,
        routeCode: 'CDS',
        logs,
        stageCodeToId: mockStageCodeToId,
      });

      expect(balance.availPcs).toBe(0);
      expect(balance.availMtr).toBe(0);
      expect(balance.feederLabel).toBe('Draw Bench Net OK');
    });
  });

  describe('Draw Bench capping at Rolling HTC OK (CDS) or Hollow HT (Alloy CDS)', () => {
    it('caps standard CDS Draw at Rolling HTC OK', () => {
      const logs = [
        {
          work_order_id: 'wo_123',
          stage_id: 'stage_rolling',
          output_qty: 600,
          rejection_qty: 0,
          htc_ok: 480, // 80 pcs @ 6.0m
          remarks: 'Rolled [PCS:100] [REJ_PCS:0] HTC OK [PCS:80]',
        },
        {
          work_order_id: 'wo_123',
          stage_id: 'stage_draw',
          output_qty: 300, // 50 pcs
          rejection_qty: 0,
          remarks: 'Drawn [PCS:50] [REJ_PCS:0]',
        },
      ];

      const balance = computeFeederBalanceForWorkOrder({
        workOrder: mockWorkOrder,
        targetStage: 'DRAW' as StageCode,
        routeCode: 'CDS',
        logs,
        stageCodeToId: mockStageCodeToId,
      });

      expect(balance.feederLabel).toBe('Rolling HTC OK');
      // 80 HTC OK - 50 Drawn = 30 PCS
      expect(balance.availPcs).toBe(30);
      expect(balance.availMtr).toBe(180);
    });

    it('caps ALLOY_CDS Draw at Hollow Heat Treatment Net Output', () => {
      const logs = [
        {
          work_order_id: 'wo_123',
          stage_id: 'stage_hht',
          output_qty: 600, // 100 pcs
          rejection_qty: 30, // 5 pcs rej
          remarks: 'Hollow HT Output [PCS:100] [REJ_PCS:5]',
        },
        {
          work_order_id: 'wo_123',
          stage_id: 'stage_draw',
          output_qty: 420, // 70 pcs
          rejection_qty: 0,
          remarks: 'Drawn [PCS:70] [REJ_PCS:0]',
        },
      ];

      const balance = computeFeederBalanceForWorkOrder({
        workOrder: mockWorkOrder,
        targetStage: 'DRAW' as StageCode,
        routeCode: 'ALLOY_CDS',
        logs,
        stageCodeToId: mockStageCodeToId,
      });

      expect(balance.feederLabel).toBe('Hollow Heat Treatment Net OK');
      // HHT Net = 100 - 5 = 95 PCS. Prev Draw = 70. Avail = 25 PCS.
      expect(balance.availPcs).toBe(25);
      expect(balance.availMtr).toBe(150);
    });
  });

  describe('Rolling Mill capping at 110% of Planned Rolling Campaign', () => {
    it('caps Rolling Mill gross output at 110% of Rolling Plan', () => {
      const rollingPlans = [
        {
          work_order_id: 'wo_123',
          planned_qty: 1000, // 1000 meters
          status: 'Scheduled',
        },
      ];

      const logs = [
        {
          work_order_id: 'wo_123',
          stage_id: 'stage_rolling',
          output_qty: 800,
          rejection_qty: 50,
          remarks: 'Rolled [PCS:140] [REJ_PCS:8]',
        },
      ];

      const balance = computeFeederBalanceForWorkOrder({
        workOrder: mockWorkOrder,
        targetStage: 'ROLLING' as StageCode,
        routeCode: 'CDS',
        logs,
        stageCodeToId: mockStageCodeToId,
        rollingPlans,
      });

      // Max 110% = 1100 MTR. Prev Rolled = 800 MTR. Remaining = 300 MTR.
      expect(balance.feederLabel).toBe('Active Rolling Plan (+10% Tolerance)');
      expect(balance.availMtr).toBe(300);
      expect(balance.availPcs).toBe(50); // 300 / 6.0 = 50 pcs
    });
  });

  describe('Finishing Line capping at VDI QC OK Passed', () => {
    it('caps Finishing line output at VDI Inspection Passed quantity', () => {
      const qcInspections = [
        {
          work_order_id: 'wo_123',
          inspected_pcs: 100,
          vdi_ok_pcs: 90,
          vdi_ok_mtr: 540,
        },
      ];

      const logs = [
        {
          work_order_id: 'wo_123',
          stage_id: 'stage_finishing',
          output_qty: 360,
          remarks: 'Bundle 1 [PCS:60] [REJ_PCS:0]',
        },
      ];

      const balance = computeFeederBalanceForWorkOrder({
        workOrder: mockWorkOrder,
        targetStage: 'FINISHING' as StageCode,
        routeCode: 'CDS',
        logs,
        stageCodeToId: mockStageCodeToId,
        qcInspections,
      });

      expect(balance.feederLabel).toBe('VDI Inspection (QC Passed)');
      // VDI OK = 90 PCS. Prev Finished = 60 PCS. Remaining = 30 PCS.
      expect(balance.availPcs).toBe(30);
      expect(balance.availMtr).toBe(180);
    });
  });
});
