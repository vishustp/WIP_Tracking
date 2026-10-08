// tests/salvage-report.test.ts
import { describe, it, expect } from 'vitest';
import { generateRejectionReportCsv } from '../lib/rejections/types';

describe('Salvage & Rejection Report CSV Export', () => {
  it('generates valid CSV rows with remarks and audit trail', () => {
    const mockData = [
      {
        declaration_no: 'REJ-2026-0001',
        work_order_id: 'wo-1',
        work_center: 'DRAW',
        rejected_pcs: 3,
        rejected_mtr: 36,
        rejected_mt: 0.32,
        reason_category: 'SMALL_QTY_NO_REPROCESS',
        production_remarks: 'Tool chatter mark; cannot reprocess',
        declared_by: 'Operator 1',
        status: 'APPROVED',
        qc_verified_pcs: 3,
        qc_verified_mtr: 36,
        qc_verified_mt: 0.32,
        qc_remarks: 'Confirmed scrap',
        qc_verified_by: 'Inspector 1',
        ppc_approved_pcs: 3,
        ppc_approved_mtr: 36,
        ppc_approved_mt: 0.32,
        ppc_remarks: 'Authorized write-off',
        ppc_approved_by: 'PPC Head',
        declared_at: '2026-10-08T10:00:00Z',
        work_orders: {
          id: 'wo-1',
          work_order_no: 'WO-1001',
          customer_name: 'ONGC',
          grade: 'ASTM A106 Gr.B',
          size_od: 73,
          size_wt: 5.5,
        },
      },
    ];

    const csv = generateRejectionReportCsv(mockData as any);
    expect(csv).toContain('Declaration No,Date');
    expect(csv).toContain('REJ-2026-0001');
    expect(csv).toContain('Tool chatter mark; cannot reprocess');
    expect(csv).toContain('Authorized write-off');
    expect(csv).toContain('Confirmed scrap');
  });
});
