import { describe, it, expect } from 'vitest';
import {
  sortOrdersByPriority,
  buildPriorityCsvContent,
  PRIORITY_CONFIGS,
  type PriorityItem,
} from '../lib/planning/orderPriorityHelper';

describe('Order Priority Helper & Sorting Engine', () => {
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
  ];

  const samplePriorities: Record<string, PriorityItem> = {
    'wo-1': {
      work_order_id: 'wo-1',
      work_order_no: 'WO-1001',
      tier: 'LOW',
      rank: 3,
      notes: 'Stock replenishment',
    },
    'wo-2': {
      work_order_id: 'wo-2',
      work_order_no: 'WO-1002',
      tier: 'CRITICAL',
      rank: 1,
      notes: 'Refinery shutdown order',
    },
    'wo-3': {
      work_order_id: 'wo-3',
      work_order_no: 'WO-1003',
      tier: 'HIGH',
      rank: 2,
      notes: 'Delivery penalty clause',
    },
  };

  it('correctly sorts orders by priority tier: CRITICAL -> HIGH -> NORMAL -> LOW', () => {
    const sorted = sortOrdersByPriority(sampleOrders, samplePriorities);

    expect(sorted[0].work_order_no).toBe('WO-1002'); // CRITICAL
    expect(sorted[1].work_order_no).toBe('WO-1003'); // HIGH
    expect(sorted[2].work_order_no).toBe('WO-1001'); // LOW
  });

  it('provides color configuration and badges for all 4 priority tiers', () => {
    expect(PRIORITY_CONFIGS.CRITICAL.badgeClass).toContain('rose');
    expect(PRIORITY_CONFIGS.HIGH.badgeClass).toContain('amber');
    expect(PRIORITY_CONFIGS.NORMAL.badgeClass).toContain('blue');
    expect(PRIORITY_CONFIGS.LOW.badgeClass).toContain('slate');
  });

  it('generates formatted CSV export content for plant morning meeting', () => {
    const sorted = sortOrdersByPriority(sampleOrders, samplePriorities);
    const csv = buildPriorityCsvContent(sorted, samplePriorities);

    expect(csv).toContain('Priority,WO No,Customer,Grade,OD (mm),WT (mm),Pending (Mtr),Target Date,Notes');
    expect(csv).toContain('CRITICAL,WO-1002,"L&T Energy","A335 P11",60.3,3.91,300,2026-10-05,"Refinery shutdown order"');
  });
});
