import { describe, it, expect } from 'vitest';
import {
  findMatchingSpecMaster,
  autoPopulateProcessSheet,
  buildMarkingString,
} from '../lib/metallurgy/processSheetSpecHelper';
import { DEFAULT_SPEC_MASTER_RECORDS } from '../lib/specMasterDefaults';

describe('Process Sheet Spec Helper & Auto-Population Engine', () => {
  const samplePlanA106 = {
    id: 'plan-101',
    plan_no: 'RP-2026-001',
    work_order_id: 'wo-101',
    planned_rolling_date: '2026-10-15',
    planned_qty: 500,
    process_route_id: 'route-hfs',
    target_mother_size: '88.90x5.49',
    multiple: 2,
    status: {},
    mh_od: 88.9,
    mh_wt: 5.49,
    mh_l1: 6.0,
    mh_l2: 6.0,
    pass_required: 1,
    work_order_no: 'WO-8890',
    customer_name: 'Bharat Petroleum',
    grade: 'A106 Gr B',
    specification: 'ASTM A106 Gr B',
    size_od: 88.9,
    size_wt: 5.49,
    l1: 6.0,
    l2: 6.0,
    ordered_qty: 500,
    ordered_qty_pcs: 83,
    ordered_qty_mtr: 500,
    route_code: 'HFS',
    route_name: 'Hot Finished Seamless',
    po_no: 'PO-BPCL-99',
    po_date: '2026-09-01',
    material_code: 'MAT-PIPE-01',
    destination: 'Mumbai Refinery',
    is_diversion: false,
    display_label: 'WO-8890',
  };

  const samplePlanA210MinWall = {
    ...samplePlanA106,
    id: 'plan-102',
    work_order_no: 'WO-5080',
    grade: 'A210 Gr A1',
    specification: 'ASTM A210 Gr A1 (MIN WALL)',
    size_od: 50.8,
    size_wt: 4.0,
    l1: 12.0,
    l2: 12.0,
    route_code: 'CDS',
    route_name: 'Cold Drawn Seamless',
  };

  it('matches ASTM A106 Gr B against Spec Master records', () => {
    const matched = findMatchingSpecMaster('ASTM A106 Gr B', DEFAULT_SPEC_MASTER_RECORDS);
    expect(matched).toBeDefined();
    expect(matched?.spec_key).toBe('A106');
    expect(matched?.smys_mpa).toBe(240);
    expect(matched?.uts_mpa).toBe(415);
  });

  it('auto-populates thermal, mechanical, Barlow hydro, and tolerance specs for ASTM A106 Gr B', () => {
    const data = autoPopulateProcessSheet(samplePlanA106, DEFAULT_SPEC_MASTER_RECORDS);

    expect(data.woNo).toBe('WO-8890');
    expect(data.customer).toBe('Bharat Petroleum');
    expect(data.destination).toBe('Mumbai Refinery');
    expect(data.poNo).toBe('PO-BPCL-99');
    expect(data.custOd).toBe('88.90');
    expect(data.custWt).toBe('5.49');

    // Mechanical properties pre-fill
    expect(data.ystMin).toBe('240');
    expect(data.utsMin).toBe('415');
    expect(data.elongationMin).toBe('21');

    // Furnace temperatures
    expect(data.whfTemp).toContain('1220');
    expect(data.sizingOutletTemp).toContain('880');

    // Barlow hydro calculation
    expect(Number(data.hydroPressurePsi)).toBeGreaterThanOrEqual(1000);
    expect(Number(data.hydroPressurePsi)).toBeLessThanOrEqual(2500);

    // Stencil marking string
    expect(data.markingSingle).toContain('RASHMI SMLS');
    expect(data.markingSingle).toContain('OD 88.90 MM X WT 5.49 MM');
    expect(data.markingTriple).toContain('ASTM A106 Gr B');
  });

  it('correctly applies Minimum Wall (+20% / -0%) tolerances for ASTM A210/A213 CDS orders', () => {
    const data = autoPopulateProcessSheet(samplePlanA210MinWall, DEFAULT_SPEC_MASTER_RECORDS);

    expect(data.isMinWall).toBe(true);
    // Process wall for min-wall is target WT * 1.05
    expect(Number(data.processWt)).toBeCloseTo(4.20, 2);
    // Min tolerance is 0% minus (4.00 mm), max tolerance is +20% (4.80 mm)
    expect(Number(data.finalTolWtMin)).toBe(4.0);
    expect(Number(data.finalTolWtMax)).toBeCloseTo(4.8, 1);
  });

  it('generates standard single and triple marking strings', () => {
    const single = buildMarkingString('single', {
      routeCode: 'HFS',
      specification: 'ASTM A106 Gr B',
      sizeOd: 88.9,
      sizeWt: 5.49,
      hydroPsi: '2500',
    });
    expect(single).toContain('(IBR) RASHMI SMLS');
    expect(single).toContain('HFS');
    expect(single).toContain('HYDRO TESTED 2500 PSI');

    const triple = buildMarkingString('triple', {
      routeCode: 'CDS',
      sizeOd: 50.8,
      sizeWt: 4.0,
      hydroPsi: '2200',
    });
    expect(triple).toContain('CDS');
    expect(triple).toContain('API 5L GR B/ NACE MR0103/MR0175');
  });
});
