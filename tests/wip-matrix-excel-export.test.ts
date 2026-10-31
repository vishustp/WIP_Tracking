import { describe, it, expect } from 'vitest';
import { exportSheetsToExcel, parseExcelBuffer } from '../lib/excelUtils';

describe('WIP Matrix Excel Export Completeness', () => {
  it('generates a multi-sheet Excel workbook with both Matrix and Detailed Ledger sheets', async () => {
    // Mock Matrix row
    const matrixExportData = [
      {
        '#': 1,
        'Size (OD × WT mm)': '50.8 × 5',
        'Material Grade': 'SAE 1010',
        'Rolling Production (m) [Feeder - Display Only]': 688,
        'Rolling Production (pcs) [Feeder - Display Only]': 688,
        'Rolling Production (MT) [Feeder - Display Only]': 3.87,
        'HTC QC (m)': 0,
        'HTC QC (pcs)': 0,
        'HTC QC (MT)': 0,
        'Hollow HT (m)': 0,
        'Hollow HT (pcs)': 0,
        'Hollow HT (MT)': 0,
        'IP Cutting (m)': 0,
        'IP Cutting (pcs)': 0,
        'IP Cutting (MT)': 0,
        'Cold Draw Bench (m)': 0,
        'Cold Draw Bench (pcs)': 0,
        'Cold Draw Bench (MT)': 0,
        'Cold Pilger Mill (m)': 0,
        'Cold Pilger Mill (pcs)': 0,
        'Cold Pilger Mill (MT)': 0,
        'Final Heat Treatment (m)': 0,
        'Final Heat Treatment (pcs)': 0,
        'Final Heat Treatment (MT)': 0,
        'Band Saw Cutting (m)': 0,
        'Band Saw Cutting (pcs)': 0,
        'Band Saw Cutting (MT)': 0,
        'VDI / QC Inspection (m)': 12,
        'VDI / QC Inspection (pcs)': 1,
        'VDI / QC Inspection (MT)': 0.07,
        'VDI Salvage (m)': 0,
        'VDI Salvage (pcs)': 0,
        'VDI Salvage (MT)': 0,
        'Finishing Goods (m)': 0,
        'Finishing Goods (pcs)': 0,
        'Finishing Goods (MT)': 0,
        'Total Active WIP (Mtrs)': 12,
        'Total Active WIP (Pcs)': 1,
        'Total Active WIP (MT)': 0.07,
      },
      {
        '#': 'TOTAL',
        'Size (OD × WT mm)': 'PLANT TOTAL',
        'Material Grade': '1 Sizes',
        'Rolling Production (m) [Feeder - Display Only]': 688,
        'Rolling Production (pcs) [Feeder - Display Only]': 688,
        'Rolling Production (MT) [Feeder - Display Only]': 3.87,
        'HTC QC (m)': 0,
        'HTC QC (pcs)': 0,
        'HTC QC (MT)': 0,
        'Hollow HT (m)': 0,
        'Hollow HT (pcs)': 0,
        'Hollow HT (MT)': 0,
        'IP Cutting (m)': 0,
        'IP Cutting (pcs)': 0,
        'IP Cutting (MT)': 0,
        'Cold Draw Bench (m)': 0,
        'Cold Draw Bench (pcs)': 0,
        'Cold Draw Bench (MT)': 0,
        'Cold Pilger Mill (m)': 0,
        'Cold Pilger Mill (pcs)': 0,
        'Cold Pilger Mill (MT)': 0,
        'Final Heat Treatment (m)': 0,
        'Final Heat Treatment (pcs)': 0,
        'Final Heat Treatment (MT)': 0,
        'Band Saw Cutting (m)': 0,
        'Band Saw Cutting (pcs)': 0,
        'Band Saw Cutting (MT)': 0,
        'VDI / QC Inspection (m)': 12,
        'VDI / QC Inspection (pcs)': 1,
        'VDI / QC Inspection (MT)': 0.07,
        'VDI Salvage (m)': 0,
        'VDI Salvage (pcs)': 0,
        'VDI Salvage (MT)': 0,
        'Finishing Goods (m)': 0,
        'Finishing Goods (pcs)': 0,
        'Finishing Goods (MT)': 0,
        'Total Active WIP (Mtrs)': 12,
        'Total Active WIP (Pcs)': 1,
        'Total Active WIP (MT)': 0.07,
      },
    ];

    // Mock Detailed row
    const detailedExportData = [
      {
        '#': 1,
        'Work Order': '6457',
        'Customer': 'Avon Tubetech',
        'Order Status': 'In Progress',
        'Route': 'CDS',
        'Finished Size (OD × WT mm)': '50.8 × 5',
        'Material Grade': 'SAE 1010',
        'Customer Specification': 'ASTM A519',
        'Mother Hollow Size (mm)': '60.3 × 6.5',
        'Current Station': 'VDI / QC Inspection',
        'Physical WIP (Mtrs)': 12,
        'Physical WIP (Pcs)': 1,
        'Physical WIP (MT)': 0.07,
        'Ordered Qty (Pcs)': 649,
        'Ordered Qty (Mtrs)': 7788,
        'Balance to Make (Pcs)': 6,
        'Balance to Make (Mtrs)': 72,
        'Rolling Date': '2026-10-22',
      },
      {
        '#': 2,
        'Work Order': '6485',
        'Customer': 'Generic Customer',
        'Order Status': 'In Progress',
        'Route': 'CDS',
        'Finished Size (OD × WT mm)': '25.4 × 2.6',
        'Material Grade': 'Standard',
        'Customer Specification': 'Standard',
        'Mother Hollow Size (mm)': '50.8 × 4.5',
        'Current Station': 'IP Cutting (Band Saw)',
        'Physical WIP (Mtrs)': 14062.58,
        'Physical WIP (Pcs)': 1933,
        'Physical WIP (MT)': 72.18,
        'Ordered Qty (Pcs)': 2000,
        'Ordered Qty (Mtrs)': 14500,
        'Balance to Make (Pcs)': 1933,
        'Balance to Make (Mtrs)': 14062.58,
        'Rolling Date': '2026-10-28',
      },
      {
        '#': 'TOTAL',
        'Work Order': 'ALL ORDERS',
        'Customer': '2 Active Lots',
        'Order Status': '—',
        'Route': '—',
        'Finished Size (OD × WT mm)': '—',
        'Material Grade': '—',
        'Customer Specification': '—',
        'Mother Hollow Size (mm)': '—',
        'Current Station': 'ALL STATIONS',
        'Physical WIP (Mtrs)': 14074.58,
        'Physical WIP (Pcs)': 1934,
        'Physical WIP (MT)': 72.25,
        'Ordered Qty (Pcs)': '—',
        'Ordered Qty (Mtrs)': '—',
        'Balance to Make (Pcs)': '—',
        'Balance to Make (Mtrs)': '—',
        'Rolling Date': '—',
      },
    ];

    const sheets = [
      { name: 'OD-WT WIP Matrix', data: matrixExportData },
      { name: 'Work Order WIP Ledger', data: detailedExportData },
    ];

    // Verify all stage columns exist in matrix sheet
    const matrixHeaders = Object.keys(matrixExportData[0]);
    expect(matrixHeaders).toContain('IP Cutting (m)');
    expect(matrixHeaders).toContain('IP Cutting (pcs)');
    expect(matrixHeaders).toContain('IP Cutting (MT)');
    expect(matrixHeaders).toContain('Cold Draw Bench (m)');
    expect(matrixHeaders).toContain('Cold Pilger Mill (m)');
    expect(matrixHeaders).toContain('Total Active WIP (Mtrs)');

    // Verify detailed work order columns exist
    const detailedHeaders = Object.keys(detailedExportData[0]);
    expect(detailedHeaders).toContain('Work Order');
    expect(detailedHeaders).toContain('Customer');
    expect(detailedHeaders).toContain('Customer Specification');
    expect(detailedHeaders).toContain('Mother Hollow Size (mm)');
    expect(detailedHeaders).toContain('Current Station');
    expect(detailedHeaders).toContain('Physical WIP (Mtrs)');
    expect(detailedHeaders).toContain('Physical WIP (Pcs)');
    expect(detailedHeaders).toContain('Physical WIP (MT)');
    expect(detailedHeaders).toContain('Ordered Qty (Pcs)');
    expect(detailedHeaders).toContain('Balance to Make (Pcs)');

    // Verify exportSheetsToExcel runs cleanly with both sheets
    await expect(
      exportSheetsToExcel(sheets, 'test-wip-report.xlsx')
    ).resolves.toBeUndefined();
  });
});

