import { describe, it, expect } from 'vitest';
import { computeAgingReportRows, normalizeAgingRow } from '@/lib/reports/agingReportHelper';
import { applyDiversionsToMillRejections } from '@/lib/mill-rejections/client';
import { HOLLOW_BANK_WO_ID } from '@/lib/productionUtils';

describe('Hollow Bank Removal from Salvage and Aging', () => {
  const baseWipRows = [
    {
      work_order_id: 'wo-salvage-100',
      work_order_no: 'WO-6500',
      customer_name: 'Industrial Piping Corp',
      stage_id: 'stg-vdi-salvage',
      stage_code: 'VDI_SALVAGE',
      stage_name: 'VDI Salvage',
      sequence_no: 8,
      current_wip: 120.0,
      current_wip_pcs: 20,
      od: 60.3,
      wt: 4.5,
      l1: 6.0,
      l2: 6.0,
    },
    {
      work_order_id: 'wo-salvage-200',
      work_order_no: 'WO-6501',
      customer_name: 'Energy Systems Ltd',
      stage_id: 'stg-vdi-salvage',
      stage_code: 'VDI_SALVAGE',
      stage_name: 'VDI Salvage',
      sequence_no: 8,
      current_wip: 60.0,
      current_wip_pcs: 10,
      od: 60.3,
      wt: 4.5,
      l1: 6.0,
      l2: 6.0,
    },
    // Virtual Hollow Bank buffer order
    {
      work_order_id: HOLLOW_BANK_WO_ID,
      work_order_no: 'HB-BUFFER',
      customer_name: 'Hollow Bank',
      stage_id: 'stg-vdi-salvage',
      stage_code: 'VDI_SALVAGE',
      stage_name: 'VDI Salvage',
      sequence_no: 8,
      current_wip: 300.0,
      current_wip_pcs: 50,
      od: 60.3,
      wt: 4.5,
      l1: 6.0,
      l2: 6.0,
    },
  ];

  const baseQcInspections = [
    {
      id: 'qc-100',
      work_order_id: 'wo-salvage-100',
      inspection_date: '2026-10-20',
      vdi_salvage_pcs: 20,
      vdi_salvage_mtr: 120.0,
    },
    {
      id: 'qc-200',
      work_order_id: 'wo-salvage-200',
      inspection_date: '2026-10-20',
      vdi_salvage_pcs: 10,
      vdi_salvage_mtr: 60.0,
    },
    {
      id: 'qc-hb',
      work_order_id: HOLLOW_BANK_WO_ID,
      inspection_date: '2026-10-20',
      vdi_salvage_pcs: 50,
      vdi_salvage_mtr: 300.0,
    },
  ];

  it('completely removes work order from Aging when its salvage is diverted to Hollow Bank', () => {
    const diversions = [
      {
        id: 'div-hb-100',
        source_wo_id: 'wo-salvage-100',
        target_wo_id: HOLLOW_BANK_WO_ID,
        diverted_qty: 120.0,
        work_center: 'VDI',
        reason: '[FROM_STAGE: VDI_SALVAGE] [TO_STAGE: HOLLOW_BANK] [PCS: 20] Diverted to Hollow Bank: LOT-991',
        diversion_date: '2026-10-25',
      },
    ];

    const result = computeAgingReportRows({
      wipRows: baseWipRows,
      qcInspections: baseQcInspections,
      diversions,
      asOfDate: new Date(),
    });

    // 1. Virtual Hollow Bank order must NEVER be in Aging
    const hbRow = result.find((r) => r.work_order_id === HOLLOW_BANK_WO_ID);
    expect(hbRow).toBeUndefined();

    // 2. WO-6500 (fully banked into Hollow Bank) must be completely excluded
    const wo6500 = result.find((r) => r.work_order_id === 'wo-salvage-100');
    expect(wo6500).toBeUndefined();

    // 3. WO-6501 (not banked) remains with full 10 pcs / 60m
    const wo6501 = result.find((r) => r.work_order_id === 'wo-salvage-200');
    expect(wo6501).toBeDefined();
    expect(wo6501!.current_wip_pcs).toBe(10);
    expect(wo6501!.current_wip).toBe(60.0);
    expect(wo6501!.vdi_salvage_pcs).toBe(10);
    expect(wo6501!.vdi_salvage_mtr).toBe(60.0);
  });

  it('deducts direct hollow_bank_inventory from salvage in computeAgingReportRows even without a diversion record', () => {
    // WO-6500 has 120m/20pcs. 12 pcs / 72m was banked into Hollow Bank directly in hollow_bank_inventory
    const hollowBankInventory = [
      {
        id: 'hb-lot-1',
        source_wo_id: 'wo-salvage-100',
        source_stage_code: 'VDI_SALVAGE',
        pcs: 12,
        total_meters: 72.0,
      },
    ];

    const result = computeAgingReportRows({
      wipRows: baseWipRows,
      qcInspections: baseQcInspections,
      hollowBankInventory,
      asOfDate: new Date(),
    });

    const wo6500 = result.find((r) => r.work_order_id === 'wo-salvage-100');
    expect(wo6500).toBeDefined();
    // 20 pcs - 12 pcs banked = 8 pcs remaining
    expect(wo6500!.vdi_salvage_pcs).toBe(8);
    // 120m - 72m banked = 48m remaining
    expect(wo6500!.vdi_salvage_mtr).toBe(48.0);
  });

  it('normalizes aging rows deducting hollow bank inventory in normalizeAgingRow', () => {
    const rawSalvageRow = {
      work_order_id: 'wo-salvage-100',
      work_order_no: 'WO-6500',
      customer_name: 'Industrial Piping Corp',
      stage_code: 'VDI_SALVAGE',
      stage_name: 'VDI Salvage',
      current_wip: 120.0,
      current_wip_pcs: 20,
      vdi_salvage_pcs: 20,
      vdi_salvage_mtr: 120.0,
      l1: 6.0,
      l2: 6.0,
    };

    // Bank all 20 pcs into Hollow Bank
    const hollowBankInventory = [
      {
        source_wo_id: 'wo-salvage-100',
        source_stage_code: 'VDI_SALVAGE',
        pcs: 20,
        total_meters: 120.0,
      },
    ];

    const normalized = normalizeAgingRow(
      rawSalvageRow,
      [],
      '2026-10-31',
      [],
      [],
      hollowBankInventory
    );

    // Salvage pcs and mtr must drop to 0, clearing current_wip
    expect(normalized.vdi_salvage_pcs).toBe(0);
    expect(normalized.vdi_salvage_mtr).toBe(0);
    expect(normalized.current_wip_pcs).toBe(0);
    expect(normalized.current_wip).toBe(0);
  });

  it('deducts hollow bank material and marks entries as diverted in applyDiversionsToMillRejections', () => {
    const entries = [
      {
        id: 'qc-sal-1',
        source: 'QC_INSPECTION' as const,
        date: '2026-10-15',
        category: 'VDI_SALVAGE' as const,
        workCenterName: 'VDI Inspection',
        stageCode: 'VDI',
        dispositionType: 'SALVAGE' as const,
        workOrderId: 'wo-101',
        workOrderNo: 'WO-6510',
        customerName: 'Client Alpha',
        grade: 'ASTM A106 Gr B',
        sizeOd: 73.0,
        sizeWt: 5.5,
        avgLength: 6.0,
        heatLotNo: '',
        pcs: 15,
        mtr: 90.0,
        mt: 0.825,
        remarks: 'Salvage held for disposition',
        loggedBy: 'QC Inspector',
        createdAt: '2026-10-15T10:00:00Z',
      },
    ];

    // Bank 15 pcs into Hollow Bank
    const hollowBankEntries = [
      {
        id: 'hb-101',
        lot_no: 'HB-LOT-101',
        source_wo_id: 'wo-101',
        source_stage_code: 'VDI',
        pcs: 15,
        total_meters: 90.0,
        remarks: 'Transferred to Hollow Bank yard',
      },
    ];

    const reconciled = applyDiversionsToMillRejections(entries, [], hollowBankEntries as any);

    expect(reconciled).toHaveLength(1);
    const item = reconciled[0];
    expect(item.remainingPcs).toBe(0);
    expect(item.remainingMtr).toBe(0);
    expect(item.isDiverted).toBe(true);
    expect(item.divertedPcs).toBe(15);
    expect(item.divertedMtr).toBe(90.0);
  });
});
