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

  it('Fetches route from Rolling plan when specified in status or plan properties', () => {
    const planWithCdsStatus = {
      ...mockPlanWithRollingGrade,
      route_code: 'HFS',
      status: {
        ...mockPlanWithRollingGrade.status,
        route_code: 'CDS',
      },
    };
    const data1 = autoPopulateProcessSheet(planWithCdsStatus, DEFAULT_SPEC_MASTER_RECORDS);
    expect(data1.routeType).toBe('CDS');
    expect(data1.orderType).toBe('CDS');

    const planWithAlloyCds = {
      ...mockPlanWithRollingGrade,
      route_code: 'ALLOY_CDS',
      status: {},
    };
    const data2 = autoPopulateProcessSheet(planWithAlloyCds, DEFAULT_SPEC_MASTER_RECORDS);
    expect(data2.routeType).toBe('ALLOY_CDS');
    expect(data2.orderType).toBe('ALLOY_CDS');
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

  it('WO 6299 Test Case: DIN 2391 ST 52 automatically fetches CDS route, mechanical properties & precision tolerances', () => {
    const mockWo6299 = {
      id: 'wo-d0323be2-2782-4aa8-9fda-8aa108f49034',
      work_order_no: '6299',
      customer_name: 'Uniparts India LTD',
      size_od: 60.3,
      size_wt: 6.35,
      grade: 'DIN 2391 ST 52',
      specification: 'DIN 2391 ST 52',
      l1: 5,
      l2: 7,
      material_code: 'CFNSP060306350020',
      status: 'Pending Plan',
    };

    const data = autoPopulateProcessSheet(mockWo6299, DEFAULT_SPEC_MASTER_RECORDS);

    // 1. Route auto-detection (Cold Finished material_code / DIN 2391 spec -> CDS)
    expect(data.routeType).toBe('CDS');
    expect(data.orderType).toBe('CDS');

    // 2. Mechanical properties per DIN 2391 ST 52 / EN 10305-1 E355
    expect(data.ystMin).toBe('355');
    expect(data.utsMin).toBe('520');
    expect(data.elongationMin).toBe('22');
    expect(data.hardness).toBe('85 HRB MAX');

    // 3. Dimensional tolerances per DIN 2391 Table 2 precision cold drawn seamless tubes
    // OD 60.3 mm -> ±0.20 mm (60.10 mm to 60.50 mm)
    expect(data.finalTolOdMin).toBe('60.10');
    expect(data.finalTolOdMax).toBe('60.50');
    // WT 6.35 mm -> ±10% (5.72 mm to 6.99 mm)
    expect(Number(data.finalTolWtMin)).toBeCloseTo(5.72, 1);
    expect(Number(data.finalTolWtMax)).toBeCloseTo(6.98, 1);
  });
});

