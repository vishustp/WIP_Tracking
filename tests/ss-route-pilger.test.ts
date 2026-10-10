import { describe, it, expect } from 'vitest';
import { computeFeederBalanceForWorkOrder } from '@/lib/feederValidation';
import { validateProductionEntry } from '@/lib/productionValidation';
import { inferRouteFromMaterialOrSpec } from '@/lib/metallurgy/processSheetSpecHelper';
import { Row } from '@/types';

describe('Stainless Steel (SS_STEEL) Route & PILGER Work Center Feeder Validation', () => {
  const stageCodeToId = new Map<string, string>([
    ['ROLLING', 'stage-1'],
    ['PILGER', 'stage-2'],
    ['HEAT_TREATMENT', 'stage-3'],
    ['BAND_SAW', 'stage-4'],
    ['VDI', 'stage-5'],
    ['FINISHING', 'stage-6'],
  ]);

  const workOrder = {
    id: 'wo-ss-101',
    work_order_no: 'WO-SS-101',
    l1: 6.0,
    l2: 6.0,
  };

  it('correctly calculates Pilger feeder balance from Rolling HTC OK output', () => {
    const logs = [
      {
        work_order_id: 'wo-ss-101',
        stage_id: 'stage-1', // ROLLING
        output_qty: 120, // 20 pcs
        rejection_qty: 0,
        htc_ok: 120, // 20 pcs
        remarks: '[PCS: 20]',
      },
    ];

    const balance = computeFeederBalanceForWorkOrder({
      workOrder,
      targetStage: 'PILGER',
      routeCode: 'SS_STEEL',
      logs,
      stageCodeToId,
    });

    expect(balance.feederStageCode).toBe('ROLLING');
    expect(balance.feederLabel).toBe('Rolling HTC OK');
    expect(balance.availPcs).toBe(20);
    expect(balance.availMtr).toBe(120);
  });

  it('correctly calculates Heat Treatment feeder balance from Cold Pilger Mill Net OK output', () => {
    const logs = [
      {
        work_order_id: 'wo-ss-101',
        stage_id: 'stage-1', // ROLLING
        output_qty: 120,
        rejection_qty: 0,
        htc_ok: 120,
        remarks: '[PCS: 20]',
      },
      {
        work_order_id: 'wo-ss-101',
        stage_id: 'stage-2', // PILGER
        output_qty: 120,
        rejection_qty: 12, // 2 pcs rej
        remarks: '[PCS: 20] [REJ: 2]',
      },
    ];

    const balance = computeFeederBalanceForWorkOrder({
      workOrder,
      targetStage: 'HEAT_TREATMENT',
      routeCode: 'SS_STEEL',
      logs,
      stageCodeToId,
    });

    expect(balance.feederStageCode).toBe('PILGER');
    expect(balance.feederLabel).toBe('Cold Pilger Mill Net OK');
    expect(balance.availPcs).toBe(18); // 20 out - 2 rej
    expect(balance.availMtr).toBe(108); // 120 out - 12 rej
  });

  it('correctly calculates Band Saw feeder balance from Heat Treatment Net OK under SS_STEEL', () => {
    const logs = [
      {
        work_order_id: 'wo-ss-101',
        stage_id: 'stage-2', // PILGER
        output_qty: 120,
        rejection_qty: 0,
        remarks: '[PCS: 20]',
      },
      {
        work_order_id: 'wo-ss-101',
        stage_id: 'stage-3', // HEAT_TREATMENT
        output_qty: 120,
        rejection_qty: 6, // 1 pc rej
        remarks: '[PCS: 20] [REJ: 1]',
      },
    ];

    const balance = computeFeederBalanceForWorkOrder({
      workOrder,
      targetStage: 'BAND_SAW',
      routeCode: 'SS_STEEL',
      logs,
      stageCodeToId,
    });

    expect(balance.feederStageCode).toBe('HEAT_TREATMENT');
    expect(balance.feederLabel).toBe('Heat Treatment Net OK');
    expect(balance.availPcs).toBe(19);
    expect(balance.availMtr).toBe(114);
  });

  it('validates production entry blocks Heat Treatment when exceeding Cold Pilger Mill feeder balance', () => {
    const row = {
      work_order_id: 'wo-ss-101',
      route_id: 'route-ss',
      work_order_no: 'WO-SS-101',
      route_code: 'SS_STEEL',
      l1: 6,
      l2: 6,
      pcs: '15',
      mtr: '90',
      balance_to_make_pcs: 10, // only 10 available from Pilger
      balance_to_make_mtr: 60,
    } as unknown as Row;

    const errors = validateProductionEntry(row, 'HEAT_TREATMENT');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain('Cold Pilger Mill Net OK');
    expect(errors[0].message).toContain('10');
  });

  it('infers SS_STEEL route for stainless steel material codes and specifications', () => {
    expect(inferRouteFromMaterialOrSpec('SS304', 'ASTM A312', 'TP304').route_code).toBe('SS_STEEL');
    expect(inferRouteFromMaterialOrSpec('SS316L', 'ASTM A213', '316L').route_code).toBe('SS_STEEL');
    expect(inferRouteFromMaterialOrSpec('', 'STAINLESS STEEL TUBE', '304').route_code).toBe('SS_STEEL');
  });
});
