import { describe, it, expect } from 'vitest';
import { Row, emptyRow } from '@/types';

// Helper matching function mirroring ProductionEntryGrid.tsx filteredRows logic
function filterQueueRows(
  rows: Row[],
  woFilter: string,
  campaignChildOrdersMap: Map<string, any[]> = new Map()
): Row[] {
  if (!woFilter.trim()) return rows;
  const q = woFilter.toLowerCase().trim();
  const cleanQ = q.replace(/[^a-z0-9]/g, '');

  const textMatches = (val?: string | null) => {
    if (!val) return false;
    const str = String(val).toLowerCase();
    if (str.includes(q)) return true;
    if (cleanQ.length > 0 && str.replace(/[^a-z0-9]/g, '').includes(cleanQ)) return true;
    return false;
  };

  return rows.filter((r) => {
    // 1. Direct row checks
    if (
      textMatches(r.work_order_no) ||
      textMatches(r.customer_name) ||
      textMatches(r.specification) ||
      textMatches(r.master_plan_no) ||
      textMatches(r.plan_no) ||
      textMatches(r.master_wo_no)
    ) {
      return true;
    }

    // 2. Child work orders check
    const children: any[] =
      r.child_work_orders && r.child_work_orders.length > 0
        ? r.child_work_orders
        : campaignChildOrdersMap.get(r.work_order_id) ||
          (r.work_order_no ? campaignChildOrdersMap.get(r.work_order_no) : null) ||
          (r.plan_id ? campaignChildOrdersMap.get(r.plan_id) : null) ||
          [];

    if (
      children.some((c: any) =>
        textMatches(c.work_order_no) ||
        textMatches(c.wo_no) ||
        textMatches(c.order_no) ||
        textMatches(c.customer_name) ||
        textMatches(c.grade) ||
        textMatches(c.specification) ||
        textMatches(c.finish_size)
      )
    ) {
      return true;
    }

    return false;
  });
}

describe('Production Entry Queue Filter: Child Work Order Search', () => {
  const masterRowWithChildren: Row = emptyRow({
    id: 'row-1',
    work_order_id: 'wo-master-100',
    work_order_no: 'WO-1000',
    customer_name: 'BHEL Power',
    specification: 'SA213-T11',
    route_id: 'route-cds',
    route_code: 'CDS',
    route_name: 'Cold Drawn Seamless',
    stage_code: 'ROLLING',
    balance_to_make_mtr: 500,
    balance_to_make_pcs: 100,
    balance_to_make_mt: 5.2,
    multiple: 1,
    is_master: true,
    master_plan_no: 'PLN-2026-001',
    plan_no: 'PLN-2026-001',
    plan_id: 'plan-100',
    child_work_orders: [
      {
        id: 'child-1',
        work_order_id: 'wo-child-1446',
        work_order_no: 'WO-1446',
        customer_name: 'L&T Heavy Engineering',
        grade: 'SA213-T22',
        size_od: 60.3,
        size_wt: 4.5,
        planned_pcs: 50,
        planned_mtr: 250,
      },
      {
        id: 'child-2',
        work_order_id: 'wo-child-6539',
        work_order_no: 'WO-6539',
        customer_name: 'Thermax Ltd',
        grade: 'SA213-T12',
        size_od: 50.8,
        size_wt: 3.6,
        planned_pcs: 50,
        planned_mtr: 250,
      },
    ],
  } as any);

  const standardRow: Row = emptyRow({
    id: 'row-2',
    work_order_id: 'wo-single-200',
    work_order_no: 'WO-2000',
    customer_name: 'Tata Steel',
    specification: 'ASTM A106 Gr B',
    route_id: 'route-hfs',
    route_code: 'HFS',
    route_name: 'Hot Finished Seamless',
    stage_code: 'ROLLING',
    balance_to_make_mtr: 300,
    balance_to_make_pcs: 60,
    balance_to_make_mt: 3.5,
    multiple: 1,
  } as any);

  const childRowInFinishing: Row = emptyRow({
    id: 'row-3',
    work_order_id: 'wo-child-1446',
    work_order_no: 'WO-1446',
    customer_name: 'L&T Heavy Engineering',
    specification: 'SA213-T22',
    route_id: 'route-cds',
    route_code: 'CDS',
    route_name: 'Cold Drawn Seamless',
    stage_code: 'FINISHING',
    balance_to_make_mtr: 120,
    balance_to_make_pcs: 24,
    balance_to_make_mt: 1.2,
    multiple: 1,
    is_child: true,
    master_wo_id: 'wo-master-100',
    master_wo_no: 'WO-1000',
    master_plan_no: 'PLN-2026-001',
  } as any);

  const sampleRows: Row[] = [masterRowWithChildren, standardRow, childRowInFinishing];

  it('returns all rows when filter is empty or whitespace', () => {
    expect(filterQueueRows(sampleRows, '')).toHaveLength(3);
    expect(filterQueueRows(sampleRows, '   ')).toHaveLength(3);
  });

  it('matches master campaign row when searching by Child WO number directly ("WO-1446")', () => {
    const results = filterQueueRows(sampleRows, 'WO-1446');
    expect(results).toHaveLength(2); // master campaign containing WO-1446 + direct child row WO-1446
    expect(results.some((r) => r.work_order_no === 'WO-1000')).toBe(true);
    expect(results.some((r) => r.work_order_no === 'WO-1446')).toBe(true);
  });

  it('matches master campaign row when searching by numeric portion only ("1446")', () => {
    const results = filterQueueRows(sampleRows, '1446');
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.work_order_no)).toContain('WO-1000');
  });

  it('matches master campaign row when searching by second child WO ("6539")', () => {
    const results = filterQueueRows(sampleRows, '6539');
    expect(results).toHaveLength(1);
    expect(results[0].work_order_no).toBe('WO-1000');
  });

  it('matches master campaign row when searching by Child customer name ("Thermax")', () => {
    const results = filterQueueRows(sampleRows, 'Thermax');
    expect(results).toHaveLength(1);
    expect(results[0].work_order_no).toBe('WO-1000');
  });

  it('matches master campaign row when searching by Child grade ("SA213-T22")', () => {
    const results = filterQueueRows(sampleRows, 'SA213-T22');
    expect(results).toHaveLength(2); // master row with child T22, and finishing child row T22
    expect(results.map((r) => r.work_order_no)).toContain('WO-1000');
    expect(results.map((r) => r.work_order_no)).toContain('WO-1446');
  });

  it('matches child row in Finishing when searching by Master WO No ("WO-1000" or "1000")', () => {
    const results = filterQueueRows(sampleRows, '1000');
    expect(results).toHaveLength(2); // Master row WO-1000 and Child row WO-1446 (which has master_wo_no: WO-1000)
    expect(results.map((r) => r.work_order_no)).toContain('WO-1000');
    expect(results.map((r) => r.work_order_no)).toContain('WO-1446');
  });

  it('matches master row using fallback campaignChildOrdersMap when child_work_orders is omitted from row', () => {
    const masterWithoutChildrenProp: Row = {
      ...masterRowWithChildren,
      child_work_orders: undefined,
    };

    const campaignMap = new Map<string, any[]>();
    campaignMap.set('wo-master-100', masterRowWithChildren.child_work_orders!);
    campaignMap.set('WO-1000', masterRowWithChildren.child_work_orders!);

    const results = filterQueueRows([masterWithoutChildrenProp, standardRow], '1446', campaignMap);
    expect(results).toHaveLength(1);
    expect(results[0].work_order_no).toBe('WO-1000');
  });

  it('excludes rows that do not match the query', () => {
    const results = filterQueueRows(sampleRows, 'NonExistentWO-9999');
    expect(results).toHaveLength(0);
  });
});
