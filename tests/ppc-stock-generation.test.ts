import { describe, it, expect } from 'vitest';
import { calculatePipeWeightMt } from '@/lib/productionUtils';
import type { PpcStockGeneration, StockPlacementType } from '@/types';

describe('PPC Stock Generation Domain & Formulas', () => {
  it('calculates pipe weight in MT accurately using OD, WT, and meters', () => {
    // 88.9 mm OD x 6.45 mm WT, 100 meters
    // Nominal weight per meter = (88.9 - 6.45) * 6.45 * 0.0246615 = 13.1147 kg/m
    // For 100m = 1311.47 kg = 1.311 MT
    const weightMt = calculatePipeWeightMt(88.9, 6.45, 100);
    expect(weightMt).toBeCloseTo(1.311, 2);
  });

  it('validates stock placement types', () => {
    const validIncoming: StockPlacementType = 'INCOMING_QUEUE';
    const validOutput: StockPlacementType = 'STAGE_OUTPUT';
    expect(['INCOMING_QUEUE', 'STAGE_OUTPUT']).toContain(validIncoming);
    expect(['INCOMING_QUEUE', 'STAGE_OUTPUT']).toContain(validOutput);
  });
});

describe('PPC Stock Generation Queue & Balance Integration', () => {
  it('applies INCOMING_QUEUE stock directly to target stage ready queue', () => {
    const rawQueue = { ready_pcs: 50, ready_mtr: 500 };
    const stockGenerations: PpcStockGeneration[] = [
      {
        id: '1',
        generation_no: 'STK-GEN-202610-0001',
        work_order_id: 'wo-1',
        stage_id: 's-1',
        stage_code: 'DRAW',
        stock_type: 'INCOMING_QUEUE',
        pcs: 20,
        meters: 200,
        weight_mt: 1.5,
        reason: 'Opening Balance',
        status: 'ACTIVE',
        created_at: new Date().toISOString(),
      },
    ];

    const targetGen = stockGenerations.filter(
      (g) => g.status === 'ACTIVE' && g.work_order_id === 'wo-1' && g.stage_code === 'DRAW' && g.stock_type === 'INCOMING_QUEUE'
    );
    const addedPcs = targetGen.reduce((acc, g) => acc + g.pcs, 0);
    const addedMtr = targetGen.reduce((acc, g) => acc + g.meters, 0);

    expect(rawQueue.ready_pcs + addedPcs).toBe(70);
    expect(rawQueue.ready_mtr + addedMtr).toBe(700);
  });

  it('excludes CANCELLED stock generations from queue calculations', () => {
    const stockGenerations: PpcStockGeneration[] = [
      {
        id: '2',
        generation_no: 'STK-GEN-202610-0002',
        work_order_id: 'wo-1',
        stage_id: 's-1',
        stage_code: 'DRAW',
        stock_type: 'INCOMING_QUEUE',
        pcs: 20,
        meters: 200,
        weight_mt: 1.5,
        reason: 'Opening Balance',
        status: 'CANCELLED',
        created_at: new Date().toISOString(),
      },
    ];

    const activeGen = stockGenerations.filter(
      (g) => g.status === 'ACTIVE' && g.work_order_id === 'wo-1' && g.stage_code === 'DRAW'
    );
    expect(activeGen.length).toBe(0);
  });
});
