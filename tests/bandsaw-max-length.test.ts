import { describe, it, expect } from 'vitest';
import { validateProductionEntry } from '@/lib/productionValidation';
import { attachBandSawCutsToRemarks } from '@/lib/productionUtils';
import { Row } from '@/types';

const baseBandSawRow: Row = {
  work_order_id: 'wo-bs-test',
  work_order_no: 'WO-BS-15M',
  customer_name: 'TEST PIPE CLIENT',
  specification: 'ASTM A106 Grade B',
  od: 88.9,
  wl: 5.49,
  l1: 6.0,
  l2: 6.0,
  avg_length: 6.0,
  route_id: 'r-hfs',
  route_code: 'HFS',
  route_name: 'Hot Finished Seamless',
  stage_code: 'BAND_SAW',
  balance_to_make_mtr: 120,
  balance_to_make_pcs: 20,
  balance_to_make_mt: 1.35,
  multiple: 2,
  ht_nos: 10,
  ht_input_nos: '',
  available_pcs: 20,
  available_mtr: 120,
  mtr: '60',
  pcs: '10',
  rejection_pcs: '0',
  rejection_mtr: '0',
  htc_ok_pcs: '0',
  htc_ok_mtr: '0',
  heat_lot_no: 'HEAT-01',
  remarks: '',
};

describe('Band Saw Maximum Pipe Length Cap (15.00 MTR)', () => {
  it('allows Band Saw production entries with pipe length <= 15.00 MTR', () => {
    const row: Row = {
      ...baseBandSawRow,
      pcs: '10',
      mtr: '150', // 15.0 m per pipe
    };
    const errors = validateProductionEntry(row, 'BAND_SAW');
    const lengthErrors = errors.filter((e) => e.message.includes('15.00 MTR'));
    expect(lengthErrors).toHaveLength(0);
  });

  it('rejects Band Saw production entry if average pipe length exceeds 15.00 MTR', () => {
    const row: Row = {
      ...baseBandSawRow,
      pcs: '10',
      mtr: '160', // 16.0 m per pipe (> 15.0 m)
    };
    const errors = validateProductionEntry(row, 'BAND_SAW');
    const lengthErrors = errors.filter((e) => e.message.includes('15.00 MTR'));
    expect(lengthErrors.length).toBeGreaterThan(0);
    expect(lengthErrors[0].message).toContain('Maximum allowable pipe length at Band Saw is 15.00 MTR');
  });

  it('allows multi-cut entries where all cuts are <= 15.00 MTR', () => {
    const cuts = [
      { id: '1', length_mtr: 6.0, cut_pcs: 5, cut_category: 'PRIME' as const },
      { id: '2', length_mtr: 15.0, cut_pcs: 2, cut_category: 'PRIME' as const },
    ];
    const remarks = attachBandSawCutsToRemarks('', cuts, 5, 95.0, 0, 2.0, 0.05, 5.0);

    const row: Row = {
      ...baseBandSawRow,
      pcs: '7',
      mtr: '60',
      remarks,
    };
    const errors = validateProductionEntry(row, 'BAND_SAW');
    const lengthErrors = errors.filter((e) => e.message.includes('15.00 MTR'));
    expect(lengthErrors).toHaveLength(0);
  });

  it('rejects multi-cut entries where any cut length exceeds 15.00 MTR', () => {
    const cuts = [
      { id: '1', length_mtr: 6.0, cut_pcs: 5, cut_category: 'PRIME' as const },
      { id: '2', length_mtr: 15.5, cut_pcs: 2, cut_category: 'PRIME' as const }, // 15.5m exceeds 15.0m
    ];
    const remarks = attachBandSawCutsToRemarks('', cuts, 5, 95.0, 0, 2.0, 0.05, 5.0);

    const row: Row = {
      ...baseBandSawRow,
      pcs: '7',
      mtr: '61',
      remarks,
    };
    const errors = validateProductionEntry(row, 'BAND_SAW');
    const lengthErrors = errors.filter((e) => e.message.includes('15.00 MTR'));
    expect(lengthErrors.length).toBeGreaterThan(0);
    expect(lengthErrors[0].message).toContain('Maximum allowable pipe cut length at Band Saw is 15.00 MTR');
  });

  it('applies the 15.00 MTR cap to IP_CUTTING stage as well', () => {
    const cuts = [
      { id: '1', length_mtr: 16.2, cut_pcs: 2, cut_category: 'PRIME' as const }, // 16.2m exceeds 15m
    ];
    const remarks = attachBandSawCutsToRemarks('', cuts, 2, 90.0, 0, 2.0, 0.05, 10.0);

    const row: Row = {
      ...baseBandSawRow,
      stage_code: 'IP_CUTTING',
      pcs: '2',
      mtr: '32.4',
      remarks,
    };
    const errors = validateProductionEntry(row, 'IP_CUTTING');
    const lengthErrors = errors.filter((e) => e.message.includes('15.00 MTR'));
    expect(lengthErrors.length).toBeGreaterThan(0);
  });
});

