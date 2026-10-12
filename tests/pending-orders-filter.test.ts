import { describe, it, expect } from 'vitest';

describe('Pending Orders Status Filter and DataReport logic', () => {
  const sampleRows = [
    {
      work_order_no: 'WO-101',
      customer: 'BHEL',
      od: 50.8,
      wt: 4.5,
      grade: 'SA 213 T11',
      ordered_qty: 1200,
      planned_qty: 1200,
      produced_qty: 600,
      route: 'ALLOY_CDS',
      total_pending: 600,
      target_date: '2026-10-30',
      status: 'In Progress',
    },
    {
      work_order_no: 'WO-102',
      customer: 'L&T',
      od: 60.3,
      wt: 5.5,
      grade: 'SA 106 Gr B',
      ordered_qty: 2500,
      planned_qty: 0,
      produced_qty: 0,
      route: 'CDS',
      total_pending: 2500,
      target_date: '2026-11-15',
      status: 'Pending Plan',
    },
    {
      work_order_no: 'WO-103',
      customer: 'Thermax',
      od: 38.1,
      wt: 3.6,
      grade: 'ASTM A312 TP304',
      ordered_qty: 800,
      planned_qty: 800,
      produced_qty: 0,
      route: 'SS_STEEL',
      total_pending: 800,
      target_date: '2026-10-25',
      status: 'Scheduled',
    },
    {
      work_order_no: 'WO-104',
      customer: 'ISGEC',
      od: 44.5,
      wt: 4.0,
      grade: 'SA 210 Gr A1',
      ordered_qty: 1500,
      planned_qty: 1500,
      produced_qty: 1500,
      route: 'CDS',
      total_pending: 0,
      target_date: '2026-10-05',
      status: 'Completed',
    },
  ];

  const STANDARD_STATUSES = ['Pending Plan', 'Scheduled', 'In Progress', 'Completed'];

  function extractStatuses(rows: typeof sampleRows, statusKey: string) {
    const found = new Set<string>();
    for (const r of rows) {
      const val = (r as any)[statusKey];
      if (val && typeof val === 'string' && val.trim()) {
        found.add(val.trim());
      }
    }
    const ordered: string[] = [];
    for (const st of STANDARD_STATUSES) {
      if (found.has(st)) {
        ordered.push(st);
        found.delete(st);
      }
    }
    const remaining = Array.from(found).sort();
    return [...ordered, ...remaining];
  }

  function tallyCounts(rows: typeof sampleRows, statusKey: string) {
    const counts: Record<string, number> = { ALL: rows.length };
    for (const r of rows) {
      const val = (r as any)[statusKey];
      if (val) {
        const s = String(val).trim();
        counts[s] = (counts[s] || 0) + 1;
      }
    }
    return counts;
  }

  function filterRows(
    rows: typeof sampleRows,
    statusKey: string,
    selectedStatus: string,
    q: string,
    searchKeys: string[]
  ) {
    return rows.filter((r) => {
      if (statusKey && selectedStatus !== 'ALL') {
        const val = String((r as any)[statusKey] ?? '').trim().toLowerCase();
        if (val !== selectedStatus.toLowerCase()) {
          return false;
        }
      }
      if (q) {
        const qLower = q.toLowerCase();
        const matches = searchKeys.some((k) =>
          String((r as any)[k] ?? '')
            .toLowerCase()
            .includes(qLower)
        );
        if (!matches) return false;
      }
      return true;
    });
  }

  it('correctly extracts and logically orders statuses', () => {
    const statuses = extractStatuses(sampleRows, 'status');
    expect(statuses).toEqual(['Pending Plan', 'Scheduled', 'In Progress', 'Completed']);
  });

  it('tallies accurate status counts including ALL', () => {
    const counts = tallyCounts(sampleRows, 'status');
    expect(counts['ALL']).toBe(4);
    expect(counts['Pending Plan']).toBe(1);
    expect(counts['Scheduled']).toBe(1);
    expect(counts['In Progress']).toBe(1);
    expect(counts['Completed']).toBe(1);
  });

  it('filters rows when a specific status is selected', () => {
    const searchKeys = ['work_order_no', 'customer', 'grade', 'status'];

    const pendingPlanRows = filterRows(sampleRows, 'status', 'Pending Plan', '', searchKeys);
    expect(pendingPlanRows).toHaveLength(1);
    expect(pendingPlanRows[0].work_order_no).toBe('WO-102');

    const inProgressRows = filterRows(sampleRows, 'status', 'In Progress', '', searchKeys);
    expect(inProgressRows).toHaveLength(1);
    expect(inProgressRows[0].work_order_no).toBe('WO-101');

    const allRows = filterRows(sampleRows, 'status', 'ALL', '', searchKeys);
    expect(allRows).toHaveLength(4);
  });

  it('supports combined status filter and text query', () => {
    const searchKeys = ['work_order_no', 'customer', 'grade', 'status'];

    // Search 'BHEL' with status 'In Progress' -> matches
    const match = filterRows(sampleRows, 'status', 'In Progress', 'BHEL', searchKeys);
    expect(match).toHaveLength(1);
    expect(match[0].work_order_no).toBe('WO-101');

    // Search 'L&T' with status 'In Progress' -> does not match
    const noMatch = filterRows(sampleRows, 'status', 'In Progress', 'L&T', searchKeys);
    expect(noMatch).toHaveLength(0);
  });
});
