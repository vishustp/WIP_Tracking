import { describe, it, expect } from 'vitest';
import { validateProductionEntry } from '@/lib/productionValidation';
import { Row } from '@/types';

const baseRow: Row = {
  work_order_id: 'wo-test-104',
  work_order_no: 'WO-104-ROLL',
  customer_name: 'TEST CUSTOMER',
  specification: 'ASTM A106 Grade B',
  od: 60.3,
  wl: 3.91,
  l1: 6.0,
  l2: 6.5,
  avg_length: 6.25,
  route_id: 'r-cds',
  route_code: 'CDS',
  route_name: 'Cold Drawn Seamless',
  stage_code: 'ROLLING',
  balance_to_make_mtr: 625,
  balance_to_make_pcs: 100,
  balance_to_make_mt: 3.4,
  multiple: 1,
  ht_nos: 100,
  ht_input_nos: '',
  mtr: '0',
  pcs: '0',
  rejection_pcs: '0',
  rejection_mtr: '0',
  htc_ok_pcs: '0',
  htc_ok_mtr: '0',
  heat_lot_no: '',
  remarks: '',
};

describe('Rolling Production 104% Plan Capping in Nos', () => {
  it('allows rolling production up to exactly 100% of plan', () => {
    const row: Row = {
      ...baseRow,
      planned_pcs: 100,
      balance_to_make_pcs: 100,
      max_allowed_pcs: 104,
      pcs: '100',
      mtr: '625',
      htc_ok_pcs: '100',
      htc_ok_mtr: '625',
    };
    const errors = validateProductionEntry(row, 'ROLLING');
    expect(errors).toHaveLength(0);
  });

  it('allows rolling production up to 104% of Rolling Plan in Nos', () => {
    const row: Row = {
      ...baseRow,
      planned_pcs: 100,
      balance_to_make_pcs: 100,
      max_allowed_pcs: 104,
      pcs: '104',
      mtr: '650',
      htc_ok_pcs: '104',
      htc_ok_mtr: '650',
    };
    const errors = validateProductionEntry(row, 'ROLLING');
    expect(errors).toHaveLength(0);
  });

  it('blocks rolling production exceeding 104% of Rolling Plan in Nos', () => {
    const row: Row = {
      ...baseRow,
      planned_pcs: 100,
      balance_to_make_pcs: 100,
      max_allowed_pcs: 104,
      pcs: '105',
      mtr: '656.25',
      htc_ok_pcs: '105',
      htc_ok_mtr: '656.25',
    };
    const errors = validateProductionEntry(row, 'ROLLING');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain('exceeds remaining Rolling Plan Quantity balance (104% limit: 104 PCS)');
  });

  it('automatically calculates 104% cap when only balance_to_make_pcs or planned_pcs is supplied', () => {
    // 50 planned pieces -> 104% is 52 pieces
    const row52: Row = {
      ...baseRow,
      planned_pcs: 50,
      balance_to_make_pcs: 50,
      pcs: '52',
      mtr: '325',
      htc_ok_pcs: '52',
      htc_ok_mtr: '325',
    };
    expect(validateProductionEntry(row52, 'ROLLING')).toHaveLength(0);

    const row53: Row = {
      ...baseRow,
      planned_pcs: 50,
      balance_to_make_pcs: 50,
      pcs: '53',
      mtr: '331.25',
      htc_ok_pcs: '53',
      htc_ok_mtr: '331.25',
    };
    const errors53 = validateProductionEntry(row53, 'ROLLING');
    expect(errors53.length).toBeGreaterThan(0);
    expect(errors53[0].message).toContain('104% limit: 52 PCS');
  });

  it('handles partial balance rolling when 100% already rolled (remaining 4% over-rolling)', () => {
    // 100 planned pieces, 100 already rolled, remaining 104% allowance is 4 pieces
    const rowRemaining4: Row = {
      ...baseRow,
      planned_pcs: 100,
      balance_to_make_pcs: 0,
      max_allowed_pcs: 4,
      pcs: '4',
      mtr: '25',
      htc_ok_pcs: '4',
      htc_ok_mtr: '25',
    };
    expect(validateProductionEntry(rowRemaining4, 'ROLLING')).toHaveLength(0);

    const rowExcessRemaining: Row = {
      ...baseRow,
      planned_pcs: 100,
      balance_to_make_pcs: 0,
      max_allowed_pcs: 4,
      pcs: '5',
      mtr: '31.25',
      htc_ok_pcs: '5',
      htc_ok_mtr: '31.25',
    };
    const errors = validateProductionEntry(rowExcessRemaining, 'ROLLING');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain('104% limit: 4 PCS');
  });

  it('blocks production when plan is completely rolled to 104% (0 remaining)', () => {
    const fullyRolledRow: Row = {
      ...baseRow,
      planned_pcs: 100,
      balance_to_make_pcs: 0,
      max_allowed_pcs: 0,
      pcs: '1',
      mtr: '6.25',
      htc_ok_pcs: '1',
      htc_ok_mtr: '6.25',
    };
    const errors = validateProductionEntry(fullyRolledRow, 'ROLLING');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain('fully rolled');
  });
});
