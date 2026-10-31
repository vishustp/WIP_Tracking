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
