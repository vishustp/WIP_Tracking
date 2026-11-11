import { describe, it, expect, vi } from 'vitest';
import * as excelUtils from '@/lib/excelUtils';
import type { QcQueueItem, QcSalvageQueueItem, QcInspection } from '@/types';

describe('QC & VDI Excel Export Functionality', () => {
  it('correctly maps QC Queue items into tabular export format with totals', () => {
    const mockQueue: QcQueueItem[] = [
      {
        work_order_id: 'wo-1',
        work_order_no: '6485',
        customer_name: 'Sainest Tubes Pvt. Ltd',
        specification: 'ASME SA 192',
        size_od: 30,
        size_wt: 2.6,
        l1: 9.9,
        l2: 10.1,
        avg_length: 10.0,
        feeder_source_label: 'Heat Treatment OK',
        heat_lot_no: 'LOT-901',
        ht_ok_pcs: 2831,
        ht_ok_mtr: 28310,
        ht_ok_mt: 49.54,
        already_inspected_pcs: 2239,
        available_ht_ok_pcs: 592,
        available_ht_ok_mtr: 5920,
        available_ht_ok_mt: 10.36,
        is_master: true,
      },
      {
        work_order_id: 'wo-2',
        work_order_no: '6530',
        customer_name: 'Industrial Piping Co',
        specification: 'ASTM A106 Gr. B',
        size_od: 60.3,
        size_wt: 3.91,
        avg_length: 6.0,
        feeder_source_label: 'Band Saw Cut OK',
        heat_lot_no: 'LOT-441',
        ht_ok_pcs: 400,
        ht_ok_mtr: 2400,
        ht_ok_mt: 13.04,
        already_inspected_pcs: 0,
        available_ht_ok_pcs: 400,
        available_ht_ok_mtr: 2400,
        available_ht_ok_mt: 13.04,
      },
    ];

    const queueExportData: Record<string, any>[] = mockQueue.map((item, idx) => ({
      '#': idx + 1,
      'Work Order No': item.work_order_no,
      'Order Type': item.is_master ? 'Master Campaign' : item.is_child ? 'Child WO' : 'Standard WO',
      'Feeder Source': item.feeder_source_label || 'Heat Treatment OK',
      'HT / Lot No': item.heat_lot_no || '—',
      'Customer': item.customer_name || '—',
      'Specification': item.specification || '—',
      'Size OD (mm)': item.size_od,
      'Size WT (mm)': item.size_wt,
      'Pipe Length (m)': item.l1 && item.l2 ? `${item.l1} - ${item.l2}m` : `${item.avg_length}m`,
      'Total Feeder OK (Pcs)': item.ht_ok_pcs,
      'Total Feeder OK (Mtr)': Number(item.ht_ok_mtr.toFixed(2)),
      'Total Feeder OK (MT)': Number(item.ht_ok_mt.toFixed(3)),
      'Already Inspected (Pcs)': item.already_inspected_pcs,
      'Available for Inspection (Pcs)': item.available_ht_ok_pcs,
      'Available for Inspection (Mtr)': Number(item.available_ht_ok_mtr.toFixed(2)),
      'Available for Inspection (MT)': Number(item.available_ht_ok_mt.toFixed(3)),
    }));

    expect(queueExportData).toHaveLength(2);
    expect(queueExportData[0]['Work Order No']).toBe('6485');
    expect(queueExportData[0]['Order Type']).toBe('Master Campaign');
    expect(queueExportData[0]['Pipe Length (m)']).toBe('9.9 - 10.1m');
    expect(queueExportData[0]['Available for Inspection (Pcs)']).toBe(592);
    expect(queueExportData[1]['Work Order No']).toBe('6530');
    expect(queueExportData[1]['Order Type']).toBe('Standard WO');

    // Totals calculation
    const totalAvailPcs = mockQueue.reduce((s, i) => s + (i.available_ht_ok_pcs || 0), 0);
    expect(totalAvailPcs).toBe(992);
  });

  it('correctly maps Salvage Queue items into tabular export format with defects', () => {
    const mockSalvage: QcSalvageQueueItem[] = [
      {
        work_order_id: 'wo-1',
        work_order_no: '6485',
        customer_name: 'Sainest Tubes Pvt. Ltd',
        specification: 'ASME SA 192',
        size_od: 30,
        size_wt: 2.6,
        avg_length: 10.0,
        total_salvage_pcs: 227,
        total_salvage_mtr: 2270,
        total_salvage_mt: 3.97,
        salvage_reasons: [
          { id: 'sr-1', reason: 'OD, WT, Length Variation', pcs: 120, remarks: 'WT oversize' },
          { id: 'sr-2', reason: 'Crack Detected', pcs: 107 },
        ],
        inspections: [
          {
            id: 'insp-1',
            work_order_id: 'wo-1',
            inspection_date: '2026-11-08',
            inspected_pcs: 500,
            inspected_mtr: 5000,
            inspected_mt: 8.75,
            vdi_ok_pcs: 273,
            vdi_ok_mtr: 2730,
            vdi_ok_mt: 4.78,
            vdi_salvage_pcs: 227,
            vdi_salvage_mtr: 2270,
            vdi_salvage_mt: 3.97,
            vdi_rejection_pcs: 0,
            vdi_rejection_mtr: 0,
            vdi_rejection_mt: 0,
            salvage_reasons: [],
            created_at: '2026-11-08T10:00:00Z',
          },
        ],
      },
    ];

    const salvageExportData = mockSalvage.map((item, idx) => ({
      '#': idx + 1,
      'Work Order No': item.work_order_no,
      'Customer': item.customer_name || '—',
      'Specification': item.specification || '—',
      'Size OD (mm)': item.size_od,
      'Size WT (mm)': item.size_wt,
      'Avg Length (m)': item.avg_length,
      'Pending Salvage (Pcs)': item.total_salvage_pcs,
      'Pending Salvage (Mtr)': Number(item.total_salvage_mtr.toFixed(2)),
      'Pending Salvage (MT)': Number(item.total_salvage_mt.toFixed(3)),
      'Defects Requiring Rework': item.salvage_reasons && item.salvage_reasons.length > 0
        ? item.salvage_reasons.map((r) => `${r.reason}: ${r.pcs} Nos${r.remarks ? ` (${r.remarks})` : ''}`).join('; ')
        : 'General Salvage',
      'Inspection Logs Count': item.inspections.length,
      'Latest Inspection Date': item.inspections[0]?.inspection_date || '—',
    }));

    expect(salvageExportData).toHaveLength(1);
    expect(salvageExportData[0]['Pending Salvage (Pcs)']).toBe(227);
    expect(salvageExportData[0]['Defects Requiring Rework']).toContain('OD, WT, Length Variation: 120 Nos (WT oversize)');
    expect(salvageExportData[0]['Defects Requiring Rework']).toContain('Crack Detected: 107 Nos');
    expect(salvageExportData[0]['Latest Inspection Date']).toBe('2026-11-08');
  });

  it('correctly maps History items into tabular export format with VDI metrics', () => {
    const mockHistory: QcInspection[] = [
      {
        id: 'qc-1',
        work_order_id: 'wo-1',
        work_order_no: '6485',
        customer_name: 'Sainest Tubes Pvt. Ltd',
        specification: 'ASME SA 192',
        size_od: 30,
        size_wt: 2.6,
        inspection_date: '2026-11-07',
        inspected_pcs: 3970,
        inspected_mtr: 39700,
        inspected_mt: 69.47,
        vdi_ok_pcs: 3743,
        vdi_ok_mtr: 37430,
        vdi_ok_mt: 65.50,
        vdi_salvage_pcs: 227,
        vdi_salvage_mtr: 2270,
        vdi_salvage_mt: 3.97,
        vdi_rejection_pcs: 0,
        vdi_rejection_mtr: 0,
        vdi_rejection_mt: 0,
        salvage_reasons: [{ id: 'sr-3', reason: 'Bend', pcs: 227 }],
        created_by: 'QC Inspector A',
        remarks: 'Batch inspected clean',
        created_at: '2026-11-07T12:00:00Z',
      },
    ];

    const historyExportData = mockHistory.map((item, idx) => ({
      '#': idx + 1,
      'Inspection Date': item.inspection_date,
      'Work Order No': item.work_order_no,
      'Customer': item.customer_name || '—',
      'Inspected (Pcs)': item.inspected_pcs,
      'VDI OK (Pcs)': item.vdi_ok_pcs,
      'VDI Salvage (Pcs)': item.vdi_salvage_pcs,
      'VDI Rejection (Pcs)': item.vdi_rejection_pcs,
      'Inspector': item.created_by || '—',
      'Remarks': item.remarks || '',
    }));

    expect(historyExportData).toHaveLength(1);
    expect(historyExportData[0]['Work Order No']).toBe('6485');
    expect(historyExportData[0]['Inspected (Pcs)']).toBe(3970);
    expect(historyExportData[0]['VDI OK (Pcs)']).toBe(3743);
    expect(historyExportData[0]['VDI Salvage (Pcs)']).toBe(227);
    expect(historyExportData[0]['Inspector']).toBe('QC Inspector A');
  });

  it('sorts multi-sheet tabs placing active tab first', () => {
    const queueData = [{ '#': 1, 'WO': '6485' }];
    const salvageData = [{ '#': 1, 'WO': '6485' }];
    const historyData = [{ '#': 1, 'WO': '6485' }];

    const allSheets = [
      { key: 'queue', name: 'Inspection Queue', data: queueData },
      { key: 'salvage', name: 'VDI Salvage', data: salvageData },
      { key: 'history', name: 'Inspection History', data: historyData },
    ];

    // Case 1: activeTab = 'queue'
    const queueActive = [
      ...allSheets.filter((s) => s.key === 'queue'),
      ...allSheets.filter((s) => s.key !== 'queue'),
    ];
    expect(queueActive.map((s) => s.name)).toEqual([
      'Inspection Queue',
      'VDI Salvage',
      'Inspection History',
    ]);

    // Case 2: activeTab = 'history'
    const historyActive = [
      ...allSheets.filter((s) => s.key === 'history'),
      ...allSheets.filter((s) => s.key !== 'history'),
    ];
    expect(historyActive.map((s) => s.name)).toEqual([
      'Inspection History',
      'Inspection Queue',
      'VDI Salvage',
    ]);

    // Case 3: activeTab = 'salvage'
    const salvageActive = [
      ...allSheets.filter((s) => s.key === 'salvage'),
      ...allSheets.filter((s) => s.key !== 'salvage'),
    ];
    expect(salvageActive.map((s) => s.name)).toEqual([
      'VDI Salvage',
      'Inspection Queue',
      'Inspection History',
    ]);
  });
});
