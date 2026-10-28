import { describe, it, expect } from 'vitest';

describe('Work Orders Directory Filter & Search', () => {
  const mockWorkOrders = [
    {
      id: 'wo-1',
      work_order_no: '6034',
      customer_name: 'Apex Pipe Systems',
      specification: 'ASTM A106 Grade B',
      grade: 'ASTM A106',
      size_od: 48.3,
      size_wt: 3.68,
      l1: 6.0,
      l2: 6.5,
      ordered_qty: 1200,
      ordered_qty_mtr: 1200,
      ordered_qty_pcs: 192,
      ordered_qty_mt: 4.87,
      balance_qty_mtr: 450,
      status: 'In Progress',
      target_date: '2026-11-15',
      po_no: 'PO-9901',
      material_code: 'MAT-48',
      destination: 'Plant 1',
    },
    {
      id: '33f3eabd-6ad6-4709-a352-601982dd4045',
      work_order_no: '6448',
      customer_name: 'Bharat Heavy Electrical Limited',
      specification: 'ASME SA 192',
      grade: 'ASME SA 192',
      size_od: 76.1,
      size_wt: 4.5,
      l1: 7.5,
      l2: 7.5,
      ordered_qty: 100,
      ordered_qty_mtr: 750,
      ordered_qty_pcs: 100,
      ordered_qty_mt: 5.96,
      balance_qty_mtr: 0,
      status: 'Completed',
      target_date: null, // Null target date
      po_no: '7100003123',
      purchase_order_no: '7100003123',
      material_code: 'CFIFP0761004500154',
      destination: 'ANDHRA PRADESH-530012',
    },
    {
      id: 'wo-3',
      work_order_no: '7003',
      customer_name: 'Larsen & Toubro Limited',
      specification: 'API 5L X52',
      grade: 'X52',
      size_od: 88.9,
      size_wt: 5.5,
      l1: 6.0,
      l2: 6.0,
      ordered_qty: 500,
      ordered_qty_mtr: 500,
      ordered_qty_pcs: 83,
      ordered_qty_mt: 5.64,
      balance_qty_mtr: 500,
      status: 'Pending Plan',
      target_date: null,
      po_no: 'PO-LT-44',
      material_code: null,
      destination: 'Yard B',
    },
  ];

  function filterWorkOrders(
    rows: typeof mockWorkOrders,
    statusFilter: string,
    searchQuery: string
  ) {
    return rows.filter((r) => {
      // Status filter
      if (statusFilter && statusFilter !== 'ALL') {
        const s = (r.status || '').trim().toLowerCase();
        if (statusFilter === 'ACTIVE') {
          if (s === 'completed' || s === 'diverted') return false;
        } else if (s !== statusFilter.trim().toLowerCase()) {
          return false;
        }
      }

      // Search query (multi-term matching)
      if (searchQuery.trim()) {
        const queryTerms = searchQuery.trim().toLowerCase().split(/\s+/);
        const searchableText = [
          r.work_order_no,
          r.customer_name,
          r.grade,
          r.specification,
          r.po_no,
          r.purchase_order_no,
          r.material_code,
          r.destination,
          r.size_od != null ? String(r.size_od) : '',
          r.size_wt != null ? String(r.size_wt) : '',
          r.l1 != null ? String(r.l1) : '',
          r.l2 != null ? String(r.l2) : '',
          r.status,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        const matchesAll = queryTerms.every((term) => searchableText.includes(term));
        if (!matchesAll) return false;
      }

      return true;
    });
  }

  it('correctly includes and finds WO 6448 with search by WO number', () => {
    const results = filterWorkOrders(mockWorkOrders, '', '6448');
    expect(results).toHaveLength(1);
    expect(results[0].work_order_no).toBe('6448');
    expect(results[0].customer_name).toBe('Bharat Heavy Electrical Limited');
  });

  it('finds WO 6448 with search by customer name', () => {
    const results = filterWorkOrders(mockWorkOrders, '', 'Bharat');
    expect(results).toHaveLength(1);
    expect(results[0].work_order_no).toBe('6448');
  });

  it('finds WO 6448 with search by PO number or material code', () => {
    const byPo = filterWorkOrders(mockWorkOrders, '', '7100003123');
    expect(byPo).toHaveLength(1);
    expect(byPo[0].work_order_no).toBe('6448');

    const byMat = filterWorkOrders(mockWorkOrders, '', 'CFIFP0761');
    expect(byMat).toHaveLength(1);
    expect(byMat[0].work_order_no).toBe('6448');
  });

  it('finds WO 6448 with multi-term query (e.g. "6448 76.1")', () => {
    const results = filterWorkOrders(mockWorkOrders, '', '6448 76.1');
    expect(results).toHaveLength(1);
    expect(results[0].work_order_no).toBe('6448');
  });

  it('correctly filters by Completed status and includes WO 6448', () => {
    const completed = filterWorkOrders(mockWorkOrders, 'Completed', '');
    expect(completed).toHaveLength(1);
    expect(completed[0].work_order_no).toBe('6448');
  });

  it('correctly excludes Completed orders when ACTIVE filter is selected', () => {
    const active = filterWorkOrders(mockWorkOrders, 'ACTIVE', '');
    expect(active).toHaveLength(2);
    expect(active.map((w) => w.work_order_no)).toEqual(['6034', '7003']);
  });

  it('sorts numerically by work_order_no', () => {
    const sortedDesc = [...mockWorkOrders].sort((a, b) => {
      const numA = Number(a.work_order_no);
      const numB = Number(b.work_order_no);
      return numB - numA;
    });
    expect(sortedDesc.map((w) => w.work_order_no)).toEqual(['7003', '6448', '6034']);

    const sortedAsc = [...mockWorkOrders].sort((a, b) => {
      const numA = Number(a.work_order_no);
      const numB = Number(b.work_order_no);
      return numA - numB;
    });
    expect(sortedAsc.map((w) => w.work_order_no)).toEqual(['6034', '6448', '7003']);
  });
});
