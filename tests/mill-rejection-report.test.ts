// tests/mill-rejection-report.test.ts
import { describe, it, expect } from 'vitest';
import {
  generateMillRejectionCsv,
  CATEGORY_LABELS,
  MillRejectionEntry,
} from '@/lib/mill-rejections/types';

describe('Mill Rejection & Salvage Report Tests', () => {
  it('correctly maps station categories to human labels', () => {
    expect(CATEGORY_LABELS.ROLLING).toBe('Rolling Rejection');
    expect(CATEGORY_LABELS.DRAW).toBe('Draw Bench Rejection');
    expect(CATEGORY_LABELS.HEAT_TREATMENT).toBe('Heat Treatment Rejection');
    expect(CATEGORY_LABELS.VDI_SALVAGE).toBe('VDI Salvage');
    expect(CATEGORY_LABELS.VDI_REJECTION).toBe('VDI Rejection');
  });

  it('generates compliant CSV with actual logged reasons and audit fields', () => {
    const mockEntries: MillRejectionEntry[] = [
      {
        id: 'pl-1',
        source: 'PRODUCTION_LOG',
        date: '2026-10-08',
        category: 'DRAW',
        workCenterName: 'Cold Draw Bench',
        stageCode: 'DRAW',
        dispositionType: 'REJECTION',
        workOrderId: 'wo-1',
        workOrderNo: 'WO-1001',
        customerName: 'ONGC Petro',
        grade: 'ASTM A106 Gr.B',
        sizeOd: 73.0,
        sizeWt: 5.5,
        avgLength: 6.0,
        heatLotNo: 'H-9921',
        pcs: 3,
        mtr: 18.0,
        mt: 0.165,
        remarks: 'Tool chatter mark; small lot',
        loggedBy: 'operator_1',
        createdAt: '2026-10-08T10:00:00Z',
      },
      {
        id: 'qc-sal-1',
        source: 'QC_INSPECTION',
        date: '2026-10-08',
        category: 'VDI_SALVAGE',
        workCenterName: 'VDI Inspection',
        stageCode: 'VDI',
        dispositionType: 'SALVAGE',
        workOrderId: 'wo-2',
        workOrderNo: 'WO-1002',
        customerName: 'IOCL Refinery',
        grade: 'API 5L X52',
        sizeOd: 88.9,
        sizeWt: 7.0,
        avgLength: 6.25,
        pcs: 5,
        mtr: 31.25,
        mt: 0.441,
        remarks: 'Dent on end | Salvageable by cutting',
        loggedBy: 'inspector_qa',
        createdAt: '2026-10-08T11:00:00Z',
      },
    ];

    const csv = generateMillRejectionCsv(mockEntries);
    expect(csv).toContain('Date,Work Order,Customer,Grade');
    expect(csv).toContain('WO-1001');
    expect(csv).toContain('ONGC Petro');
    expect(csv).toContain('Tool chatter mark; small lot');
    expect(csv).toContain('WO-1002');
    expect(csv).toContain('VDI Salvage');
    expect(csv).toContain('Dent on end | Salvageable by cutting');
  });
});
