import { describe, it, expect } from 'vitest';
import {
  sortOrdersByPriority,
  filterOrdersByDateBasis,
  buildPriorityCsvContent,
  PRIORITY_CONFIGS,
  type PriorityItem,
} from '../lib/planning/orderPriorityHelper';

describe('Order Priority Helper & Date-Based Sorting Engine', () => {
  const sampleOrders = [
    {
      id: 'wo-1',
      work_order_no: 'WO-1001',
      customer_name: 'Indian Oil Corp',
      size_od: 88.9,
      size_wt: 5.49,
      grade: 'A106 Gr B',
      ordered_qty_mtr: 500,
      balance_qty_mtr: 500,
      target_date: '2026-10-20',
      status: 'Pending Plan',
    },
    {
      id: 'wo-2',
      work_order_no: 'WO-1002',
      customer_name: 'L&T Energy',
      size_od: 60.3,
      size_wt: 3.91,
      grade: 'A335 P11',
      ordered_qty_mtr: 300,
      balance_qty_mtr: 300,
      target_date: '2026-10-05',
      status: 'Pending Plan',
    },
    {
      id: 'wo-3',
      work_order_no: 'WO-1003',
      customer_name: 'BHEL Trichy',
      size_od: 50.8,
      size_wt: 4.0,
      grade: 'A210 Gr A1',
      ordered_qty_mtr: 800,
      balance_qty_mtr: 800,
      target_date: '2026-10-01',
      status: 'Pending Plan',
    },
    {
      id: 'wo-4',
      work_order_no: 'WO-1004',
      customer_name: 'NTPC Simhadri',
      size_od: 73.0,
      size_wt: 7.01,
      grade: 'SA106 Gr C',
      ordered_qty_mtr: 250,
      balance_qty_mtr: 250,
      target_date: null,
      status: 'Pending Plan',
    },
  ];

  const samplePriorities: Record<string, PriorityItem> = {
    'wo-1': {
      work_order_id: 'wo-1',
      work_order_no: 'WO-1001',
      notes: 'Standard stock delivery',
    },
    'wo-2': {
      work_order_id: 'wo-2',
      work_order_no: 'WO-1002',
      // Manual completion date set by planner earlier than target date
      completion_date: '2026-09-28',
      notes: 'Refinery shutdown order expedited',
    },
    'wo-3': {
      work_order_id: 'wo-3',
      work_order_no: 'WO-1003',
      notes: 'Delivery penalty clause',
    },
  };

  it('correctly sorts orders by effective completion date ascending (earliest first, null dates last)', () => {
    const sorted = sortOrdersByPriority(sampleOrders, samplePriorities);

    // WO-1002 has completion_date 2026-09-28 (earliest)
    expect(sorted[0].work_order_no).toBe('WO-1002');
    // WO-1003 has target_date 2026-10-01
    expect(sorted[1].work_order_no).toBe('WO-1003');
    // WO-1001 has target_date 2026-10-20
    expect(sorted[2].work_order_no).toBe('WO-1001');
    // WO-1004 has no target date (null goes to the end)
    expect(sorted[3].work_order_no).toBe('WO-1004');
  });

  it('filters orders on date basis (OVERDUE, NO_DATE, ALL)', () => {
    const overdue = filterOrdersByDateBasis(sampleOrders, samplePriorities, 'OVERDUE');
    // WO-1002 completion_date is 2026-09-28 which is before today (2026-09-29)
    expect(overdue.some((o) => o.work_order_no === 'WO-1002')).toBe(true);

    const noDate = filterOrdersByDateBasis(sampleOrders, samplePriorities, 'NO_DATE');
    expect(noDate.length).toBe(1);
    expect(noDate[0].work_order_no).toBe('WO-1004');

    const all = filterOrdersByDateBasis(sampleOrders, samplePriorities, 'ALL');
    expect(all.length).toBe(4);
  });

  it('maintains tier config definitions for UI styling compatibility', () => {
    expect(PRIORITY_CONFIGS.CRITICAL.badgeClass).toContain('rose');
    expect(PRIORITY_CONFIGS.HIGH.badgeClass).toContain('amber');
    expect(PRIORITY_CONFIGS.NORMAL.badgeClass).toContain('blue');
    expect(PRIORITY_CONFIGS.LOW.badgeClass).toContain('slate');
  });

  it('generates formatted CSV export content with sequence, completion date, and due status', () => {
    const sorted = sortOrdersByPriority(sampleOrders, samplePriorities);
    const csv = buildPriorityCsvContent(sorted, samplePriorities);

    expect(csv).toContain('Sequence,Completion Date,Due Status,WO No,Customer,Grade,OD (mm),WT (mm),Pending (Mtr),Notes');
    expect(csv).toContain('1,2026-09-28');
    expect(csv).toContain('WO-1002');
    expect(csv).toContain('"Refinery shutdown order expedited"');
  });
});
