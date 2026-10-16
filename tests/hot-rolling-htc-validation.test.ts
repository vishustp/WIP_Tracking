import { describe, it, expect } from 'vitest';
import { calc } from '@/lib/productionUtils';
import { validateProductionEntry } from '@/lib/productionValidation';

describe('HOT_ROLLING and HTC Calculations & Validation', () => {
  it('calculates HOT_ROLLING tonnage using Mother Hollow dimensions', () => {
    const result = calc({
      stage_code: 'HOT_ROLLING',
      pcs: '10',
      mtr: '100',
      rejection_pcs: '1',
      rejection_mtr: '10',
      htc_ok_pcs: '0',
      htc_ok_mtr: '0',
      od: 25.4,
      wl: 2.11,
      mh_od: 88.9,
      mh_wt: 6.35,
      mh_avg_length: 10,
      avg_length: 10,
    });
    // Net MTR = 90. Weight factor for 88.9x6.35 = (88.9-6.35)*6.35*0.0246615*0.001 = 0.012928 MT/m.
    // 90 * 0.012928 = ~1.16 MT
    expect(result.net_output_mtr).toBe(90);
    expect(result.net_output_mt).toBeGreaterThan(1.1);
  });

  it('enforces rolling plan balance capping at HOT_ROLLING', () => {
    const error = validateProductionEntry({
      stage_code: 'HOT_ROLLING',
      work_order_no: 'WO-101',
      pcs: 50,
      mtr: 500,
      rejection_pcs: 0,
      rejection_mtr: 0,
      avg_length: 10,
      balance_to_make_pcs: 30, // Plan balance is 30 PCS
    } as any);
    const messages = error.map(e => e.message).join(' ');
    expect(messages).toContain('exceeds remaining Rolling Plan');
  });

  it('enforces available queue limit at HTC', () => {
    const error = validateProductionEntry({
      stage_code: 'HTC',
      work_order_no: 'WO-101',
      pcs: 40,
      mtr: 400,
      rejection_pcs: 0,
      rejection_mtr: 0,
      avg_length: 10,
      available_pcs: 25, // Only 25 PCS rolled by Hot Mill
    } as any);
    const messages = error.map(e => e.message).join(' ');
    expect(messages).toContain('exceeds available queue');
  });
});
