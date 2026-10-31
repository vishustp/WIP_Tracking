import { describe, it, expect } from 'vitest';
import type { PpcStockGeneration } from '@/types';

describe('PPC Stock Generation Report Filtering & Totals', () => {
  const mockRows: PpcStockGeneration[] = [
    {
      id: '1',
      generation_no: 'STK-GEN-202610-0001',
      work_order_id: 'wo-1',
      stage_id: 's-1',
      stage_code: 'DRAW',
      stock_type: 'INCOMING_QUEUE',
      pcs: 50,
      meters: 600,
      weight_mt: 3.45,
      reason: 'Physical Stock Audit',
      status: 'ACTIVE',
      created_at: '2026-10-31T10:00:00Z',
    },
    {
      id: '2',
      generation_no: 'STK-GEN-202610-0002',
      work_order_id: 'wo-2',
      stage_id: 's-2',
      stage_code: 'BAND_SAW',
      stock_type: 'STAGE_OUTPUT',
      pcs: 100,
      meters: 1200,
      weight_mt: 6.9,
      reason: 'Opening Balance Induction',
      status: 'ACTIVE',
      created_at: '2026-10-31T11:00:00Z',
    },
    {
      id: '3',
      generation_no: 'STK-GEN-202610-0003',
      work_order_id: 'wo-1',
      stage_id: 's-1',
      stage_code: 'DRAW',
      stock_type: 'INCOMING_QUEUE',
      pcs: 10,
      meters: 120,
      weight_mt: 0.69,
      reason: 'Mistake',
      status: 'CANCELLED',
      created_at: '2026-10-31T12:00:00Z',
    },
  ];

  it('calculates active summary totals correctly', () => {
    const active = mockRows.filter((r) => r.status === 'ACTIVE');
    const totalPcs = active.reduce((acc, r) => acc + r.pcs, 0);
    const totalMtr = active.reduce((acc, r) => acc + r.meters, 0);
    const totalMt = active.reduce((acc, r) => acc + r.weight_mt, 0);

    expect(totalPcs).toBe(150);
    expect(totalMtr).toBe(1800);
    expect(totalMt).toBeCloseTo(10.35, 2);
    expect(active.length).toBe(2);
  });

  it('filters rows by stage and status', () => {
    const drawRows = mockRows.filter((r) => r.stage_code === 'DRAW' && r.status === 'ACTIVE');
    expect(drawRows.length).toBe(1);
    expect(drawRows[0].generation_no).toBe('STK-GEN-202610-0001');

    const cancelledRows = mockRows.filter((r) => r.status === 'CANCELLED');
    expect(cancelledRows.length).toBe(1);
    expect(cancelledRows[0].generation_no).toBe('STK-GEN-202610-0003');
  });
});
