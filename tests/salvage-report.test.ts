// tests/salvage-report.test.ts
import { describe, it, expect } from 'vitest';
import { generateRejectionReportCsv, formatRejectionsForExport } from '../lib/rejections/types';

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

  it('formats declarations with complete columns for Excel export', () => {
    const mockData = [
      {
        declaration_no: 'REJ-2026-0002',
        work_order_id: 'wo-2',
        work_center: 'VDI',
        rejected_pcs: 2,
        rejected_mtr: 12,
        rejected_mt: 0.15,
        reason_category: 'SMALL_QTY_NO_REPROCESS',
        production_remarks: 'Remaining 2 pcs rejected due to surface seam',
        declared_by: 'VDI Incharge',
        status: 'PENDING_QC',
        declared_at: '2026-10-14T09:00:00Z',
        work_orders: {
          id: 'wo-2',
          work_order_no: 'WO-2002',
          customer_name: 'BHEL Haridwar',
          grade: 'SA 213 T11',
          size_od: 50.8,
          size_wt: 4.5,
        },
      },
    ];

    const exportRows = formatRejectionsForExport(mockData as any);
    expect(exportRows).toHaveLength(1);
    expect(exportRows[0]['Declaration No']).toBe('REJ-2026-0002');
    expect(exportRows[0]['Work Order #']).toBe('WO-2002');
    expect(exportRows[0]['Customer']).toBe('BHEL Haridwar');
    expect(exportRows[0]['Grade']).toBe('SA 213 T11');
    expect(exportRows[0]['Size (ODxWT mm)']).toBe('50.8 x 4.5');
    expect(exportRows[0]['Declared PCS']).toBe(2);
    expect(exportRows[0]['Declared MTR']).toBe(12);
    expect(exportRows[0]['Declared MT']).toBe(0.15);
    expect(exportRows[0]['Reason Category']).toBe('Small Quantity (Cannot Reprocess / Short Remnant)');
    expect(exportRows[0]['Status']).toBe('Pending QC Verification');
  });
});
