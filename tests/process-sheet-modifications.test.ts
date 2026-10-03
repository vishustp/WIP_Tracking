import { describe, it, expect } from 'vitest';
import {
  autoPopulateProcessSheet,
  buildMarkingString,
} from '../lib/metallurgy/processSheetSpecHelper';
import { DEFAULT_SPEC_MASTER_RECORDS } from '../lib/specMasterDefaults';

describe('Process Sheet Modifications Plan Requirements', () => {
  const mockPlanWithRollingGrade = {
    id: 'plan-rolling-1',
    plan_no: 'RP-2026-900',
    work_order_id: 'wo-900',
    planned_rolling_date: '2026-10-15',
    planned_qty: 600,
    process_route_id: 'route-hfs',
    target_mother_size: '73.0x5.16',
    multiple: 1,
    status: {
      grade: 'SAE 1018 Rolling RM Grade',
      special_instructions: 'Customer inspection required prior to dispatch. Beveled ends 30 deg.',
    },
    mh_od: 73.0,
    mh_wt: 5.16,
    mh_l1: 6.0,
    mh_l2: 6.0,
    pass_required: 1,
    work_order_no: 'WO-6172',
    customer_name: 'Industrial Piping Corp',
    grade: 'Generic WO Grade',
    specification: 'ASTM A106 Gr B',
    size_od: 73.0,
    size_wt: 5.16,
    l1: 6.0,
    l2: 6.0,
    ordered_qty_mtr: 600,
    route_code: 'HFS',
    route_name: 'Hot Finished Seamless',
    is_diversion: false,
  };

  it('Requirement 1: Fetches steel grade from Rolling plan status if available', () => {
    const data = autoPopulateProcessSheet(mockPlanWithRollingGrade, DEFAULT_SPEC_MASTER_RECORDS);
    expect(data.steelGrade).toBe('SAE 1018 Rolling RM Grade');
  });

  it('Requirement 3: Omits chemical composition fields from ProcessSheetFormData', () => {
    const data: any = autoPopulateProcessSheet(mockPlanWithRollingGrade, DEFAULT_SPEC_MASTER_RECORDS);
    expect(data.cMin).toBeUndefined();
    expect(data.cMax).toBeUndefined();
    expect(data.mnMin).toBeUndefined();
    expect(data.pMax).toBeUndefined();
    expect(data.sMax).toBeUndefined();
  });

  it('Requirement 4: Supports a single marking field with single/triple generation', () => {
    const data = autoPopulateProcessSheet(mockPlanWithRollingGrade, DEFAULT_SPEC_MASTER_RECORDS);
    expect(data.markingText).toBeDefined();
    expect(data.markingType).toBe('single');
    expect(data.markingText).toContain('RASHMI SMLS');

    const tripleMarking = buildMarkingString('triple', {
      routeCode: 'HFS',
      specification: 'ASTM A106 Gr B',
      sizeOd: 73.0,
      sizeWt: 5.16,
    });
    expect(tripleMarking).toContain('API 5L GR B');
  });

  it('Requirement 5: Revision number starts with 0', () => {
    const data = autoPopulateProcessSheet(mockPlanWithRollingGrade, DEFAULT_SPEC_MASTER_RECORDS);
    expect(data.revNo).toBe('0');
  });

  it('Requirement 6: Supports Special Instructions field', () => {
    const data = autoPopulateProcessSheet(mockPlanWithRollingGrade, DEFAULT_SPEC_MASTER_RECORDS);
    expect(data.specialInstructions).toBe('Customer inspection required prior to dispatch. Beveled ends 30 deg.');
  });
});
