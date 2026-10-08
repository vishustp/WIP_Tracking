// tests/rejection-service.test.ts
import { describe, it, expect } from 'vitest';
import {
  REJECTION_REASON_CATEGORIES,
  calculateRejectionMetrics,
  REJECTION_REASON_LABELS,
  REJECTION_STATUS_LABELS,
  generateRejectionReportCsv
} from '../lib/rejections/types';

describe('Rejection Service Types & Metrics', () => {
  it('calculates weight and meters accurately from pieces and pipe specs', () => {
    const pcs = 3;
    const avgLen = 6.0;
    const od = 73.0;
    const wt = 5.5;
    
    const { mtr, mt } = calculateRejectionMetrics(pcs, avgLen, od, wt);
    expect(mtr).toBe(18.0);
    // MT factor: (73 - 5.5) * 5.5 * 0.0246615 * 0.001 * 18 = 0.1647 MT
    expect(mt).toBeCloseTo(0.165, 2);
  });

  it('validates standard reason categories and labels', () => {
    expect(REJECTION_REASON_CATEGORIES).toContain('SMALL_QTY_NO_REPROCESS');
    expect(REJECTION_REASON_CATEGORIES).toContain('SURFACE_DEFECT');
    expect(REJECTION_REASON_CATEGORIES).toContain('WALL_THICKNESS_OFF');
    expect(REJECTION_REASON_CATEGORIES).toContain('CRACK');
    expect(REJECTION_REASON_CATEGORIES).toContain('BEND');
    expect(REJECTION_REASON_CATEGORIES).toContain('DIMENSIONAL_OFF_SPEC');
    expect(REJECTION_REASON_CATEGORIES).toContain('OTHER');

    expect(REJECTION_REASON_LABELS.SMALL_QTY_NO_REPROCESS).toContain('Small Quantity');
    expect(REJECTION_STATUS_LABELS.PENDING_QC).toBe('Pending QC Verification');
  });

  it('generates well-formed CSV output for export', () => {
    const sample = [
      {
        declaration_no: 'REJ-2026-0001',
        declared_at: '2026-10-08T10:00:00Z',
        work_order_no: 'WO-1001',
        customer_name: 'ONGC',
        grade: 'ASTM A106 Gr.B',
        size_od: 73,
        size_wt: 5.5,
        work_center: 'DRAW',
        rejected_pcs: 3,
        rejected_mtr: 18,
        rejected_mt: 0.16,
        reason_category: 'SMALL_QTY_NO_REPROCESS',
        production_remarks: 'Tool chatter mark; cannot reprocess due to small quantity',
        declared_by: 'Operator 1',
        status: 'APPROVED',
        qc_verified_pcs: 3,
        qc_verified_mtr: 18,
        qc_verified_mt: 0.16,
        qc_remarks: 'Confirmed defects',
        qc_verified_by: 'QC Inspector 1',
        qc_verified_at: '2026-10-08T11:00:00Z',
        ppc_approved_pcs: 3,
        ppc_approved_mtr: 18,
        ppc_approved_mt: 0.16,
        ppc_remarks: 'Approved for salvage scrap write-off',
        ppc_approved_by: 'PPC Head',
        ppc_approved_at: '2026-10-08T12:00:00Z',
      }
    ];
    const csv = generateRejectionReportCsv(sample as any);
    expect(csv).toContain('Declaration No,Date');
    expect(csv).toContain('REJ-2026-0001');
    expect(csv).toContain('Tool chatter mark; cannot reprocess due to small quantity');
    expect(csv).toContain('Approved for salvage scrap write-off');
  });
});
