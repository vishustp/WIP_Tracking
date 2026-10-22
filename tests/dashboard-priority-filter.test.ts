import { describe, it, expect } from 'vitest';
import { isHollowBankOrder, isStockOrder, isStockOrHollowBankOrder, HOLLOW_BANK_WO_ID } from '@/lib/productionUtils';

describe('Dashboard Priority / Delayed Work Order Filter', () => {
  it('correctly identifies Hollow Bank orders across all formats', () => {
    // ID-based
    expect(isHollowBankOrder({ id: HOLLOW_BANK_WO_ID })).toBe(true);
    expect(isHollowBankOrder({ work_order_id: HOLLOW_BANK_WO_ID })).toBe(true);

    // Work order number based
    expect(isHollowBankOrder({ work_order_no: 'HB-BUFFER' })).toBe(true);
    expect(isHollowBankOrder({ work_order_no: 'HOLLOW BANK' })).toBe(true);
    expect(isHollowBankOrder({ work_order_no: 'HB BUFFER' })).toBe(true);
    expect(isHollowBankOrder({ work_order_no: 'HB-001' })).toBe(true);

    // Customer name based
    expect(isHollowBankOrder({ customer_name: 'HOLLOW BANK' })).toBe(true);
    expect(isHollowBankOrder({ customer_name: 'HB-BUFFER' })).toBe(true);
    expect(isHollowBankOrder({ customer: 'HB BUFFER' })).toBe(true);

    // Standard orders should NOT be flagged
    expect(isHollowBankOrder({ work_order_no: 'WO-1446', customer_name: 'RELIANCE' })).toBe(false);
    expect(isHollowBankOrder({ work_order_no: '6034', customer: 'L&T' })).toBe(false);
  });

  it('correctly identifies Stock orders across all formats', () => {
    // Work order number based
    expect(isStockOrder({ work_order_no: 'STOCK' })).toBe(true);
    expect(isStockOrder({ work_order_no: 'STOCK-01' })).toBe(true);
    expect(isStockOrder({ work_order_no: 'WO-STOCK-12' })).toBe(true);
    expect(isStockOrder({ work_order_no: 'STOCK_BUF' })).toBe(true);

    // Customer name based
    expect(isStockOrder({ customer_name: 'STOCK' })).toBe(true);
    expect(isStockOrder({ customer_name: 'INTERNAL STOCK' })).toBe(true);
    expect(isStockOrder({ customer_name: 'STANDARD STOCK' })).toBe(true);
    expect(isStockOrder({ customer: 'STOCK BUFFER' })).toBe(true);
    expect(isStockOrder({ customer: 'GENERIC / STOCK' })).toBe(true);
    expect(isStockOrder({ customer: 'FOR STOCK' })).toBe(true);

    // Customer names containing "stock" as part of a word should NOT be flagged
    expect(isStockOrder({ customer_name: 'WOODSTOCK INDUSTRIAL' })).toBe(false);

    // Real client orders should NOT be flagged
    expect(isStockOrder({ work_order_no: '6495', customer_name: 'BHARAT HEAVY ELECTRICALS' })).toBe(false);
    expect(isStockOrder({ work_order_no: '6034', customer_name: 'INDIAN OIL CORPORATION' })).toBe(false);
  });

  it('filters out Stock and Hollow Bank orders from dashboard priority list', () => {
    const mockPendingRows = [
      { work_order_id: '1', work_order_no: '6034', customer: 'IOCL', total_pending: 100, target_date: '2026-10-25' },
      { work_order_id: '2', work_order_no: 'HB-BUFFER', customer: 'HOLLOW BANK', total_pending: 500, target_date: '2026-10-20' },
      { work_order_id: '3', work_order_no: 'STOCK-101', customer: 'INTERNAL STOCK', total_pending: 200, target_date: '2026-10-15' },
      { work_order_id: '4', work_order_no: '6495', customer: 'BHEL', total_pending: 150, target_date: '2026-10-28' },
      { work_order_id: '5', work_order_no: '7001', customer: 'STOCK', total_pending: 80, target_date: '2026-10-10' },
      { work_order_id: '6', work_order_no: '7002', customer: 'Standard Stock', total_pending: 90, target_date: '2026-10-12' },
      { work_order_id: '7', work_order_no: '7003', customer: 'THERMAX', total_pending: 300, target_date: '2026-11-01' },
    ];

    const eligible = mockPendingRows.filter((r) => !isStockOrHollowBankOrder(r));

    expect(eligible.map((e) => e.work_order_no)).toEqual(['6034', '6495', '7003']);
    expect(eligible.some((e) => e.work_order_no === 'HB-BUFFER')).toBe(false);
    expect(eligible.some((e) => e.customer.includes('STOCK'))).toBe(false);
  });
});
