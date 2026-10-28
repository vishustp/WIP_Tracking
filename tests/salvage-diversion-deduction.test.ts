import { describe, it, expect } from 'vitest';
import { computeAgingReportRows, normalizeAgingRow } from '@/lib/reports/agingReportHelper';

describe('Salvage and Diversion Deduction Tests', () => {
  it('deducts outbound diversions from VDI salvage in computeAgingReportRows', () => {
    const wipRows = [
      {
        work_order_id: 'wo-salvage-1',
        work_order_no: 'WO-6418',
        stage_id: 'stg-vdi-salvage',
        stage_code: 'VDI_SALVAGE',
        stage_name: 'VDI Salvage',
        sequence_no: 8,
        current_wip: 110.0,
        current_wip_pcs: 11,
        od: 50.8,
        wt: 4.0,
        l1: 10.0,
        l2: 10.0,
      },
      {
        work_order_id: 'wo-salvage-2',
        work_order_no: 'WO-6419',
        stage_id: 'stg-vdi-salvage',
        stage_code: 'VDI_SALVAGE',
        stage_name: 'VDI Salvage',
        sequence_no: 8,
        current_wip: 50.0,
        current_wip_pcs: 5,
        od: 50.8,
        wt: 4.0,
        l1: 10.0,
        l2: 10.0,
      },
    ];

    const qcInspections = [
      {
        id: 'qc-1',
        work_order_id: 'wo-salvage-1',
        inspection_date: '2026-10-13',
        vdi_salvage_pcs: 7,
        vdi_salvage_mtr: 70.0,
      },
      {
        id: 'qc-2',
        work_order_id: 'wo-salvage-1',
        inspection_date: '2026-10-14',
        vdi_salvage_pcs: 4,
        vdi_salvage_mtr: 40.0,
      },
      {
        id: 'qc-3',
        work_order_id: 'wo-salvage-2',
        inspection_date: '2026-10-14',
        vdi_salvage_pcs: 5,
        vdi_salvage_mtr: 50.0,
      },
    ];

    // WO-6418 was fully diverted to Hollow Bank (70m + 40m = 110m, 11 pcs)
    const diversions = [
      {
        id: 'div-1',
        source_wo_id: 'wo-salvage-1',
        target_wo_id: '00000000-0000-0000-0000-00000000000b',
        diverted_qty: 70.0,
        work_center: 'VDI',
        reason: 'Diverted to Hollow Bank: HB-1 (From Mill Rejection: [LOT: 426100249]) [FROM_STAGE: VDI] [PCS: 7]',
        diversion_date: '2026-10-28',
      },
      {
        id: 'div-2',
        source_wo_id: 'wo-salvage-1',
        target_wo_id: '00000000-0000-0000-0000-00000000000b',
        diverted_qty: 40.0,
        work_center: 'VDI',
        reason: 'Diverted to Hollow Bank: HB-2 (From Mill Rejection: [LOT: 426100249]) [FROM_STAGE: VDI] [PCS: 4]',
        diversion_date: '2026-10-28',
      },
      // WO-6419 only had 20m (2 pcs) diverted to another order
      {
        id: 'div-3',
        source_wo_id: 'wo-salvage-2',
        target_wo_id: 'wo-target-99',
        diverted_qty: 20.0,
        work_center: 'DRAW',
        reason: 'Salvage transfer to WO-99 [FROM_STAGE: VDI_SALVAGE] [TO_STAGE: DRAW] [PCS: 2]',
        diversion_date: '2026-10-28',
      },
    ];

    const result = computeAgingReportRows({
      wipRows,
      qcInspections,
      diversions,
      asOfDate: new Date(),
    });

    // WO-6418: 110m was diverted out of 110m -> Remaining WIP is 0, so it must be completely excluded from aging list
    const wo6418 = result.find((r) => r.work_order_id === 'wo-salvage-1');
    expect(wo6418).toBeUndefined();

    // WO-6419: 20m diverted out of 50m -> Remaining WIP is 30m / 3 pcs
    const wo6419 = result.find((r) => r.work_order_id === 'wo-salvage-2');
    expect(wo6419).toBeDefined();
    expect(wo6419!.current_wip_pcs).toBe(3);
    expect(wo6419!.current_wip).toBe(30.0);
    expect(wo6419!.vdi_salvage_pcs).toBe(3);
    expect(wo6419!.vdi_salvage_mtr).toBe(30.0);
  });

  it('deducts outbound diversions in normalizeAgingRow', () => {
    const rawRow = {
      work_order_id: 'wo-salvage-1',
      work_order_no: 'WO-6418',
      stage_code: 'HEAT_TREATMENT',
      stage_name: 'Heat Treatment',
      current_wip: 20.0,
      current_wip_pcs: 2,
      vdi_salvage_pcs: 11,
      vdi_salvage_mtr: 110.0,
      od: 50.8,
      wt: 4.0,
      l1: 10.0,
      l2: 10.0,
    };

    const diversions = [
      {
        id: 'div-1',
        source_wo_id: 'wo-salvage-1',
        target_wo_id: '00000000-0000-0000-0000-00000000000b',
        diverted_qty: 110.0,
        diverted_pcs: 11,
        work_center: 'VDI',
        reason: 'Diverted to Hollow Bank: HB-1 [FROM_STAGE: VDI] [PCS: 11]',
      },
    ];

    const normalized = normalizeAgingRow(rawRow, [], undefined, [], diversions);

    // VDI salvage quantity must reflect net remaining (0 pcs / 0 m), not the historical 11 pcs / 110 m!
    expect(normalized.vdi_salvage_pcs).toBe(0);
    expect(normalized.vdi_salvage_mtr).toBe(0);
    expect(normalized.current_wip_pcs).toBe(2); // Heat treatment physical WIP untouched
  });

  it('deducts diverted salvage material in applyDiversionsToMillRejections', async () => {
    const { applyDiversionsToMillRejections } = await import('@/lib/mill-rejections/client');

    const entries = [
      {
        id: 'qc-sal-1',
        source: 'QC_INSPECTION' as const,
        date: '2026-10-13',
        category: 'VDI_SALVAGE' as const,
        workCenterName: 'VDI Inspection',
        stageCode: 'VDI',
        dispositionType: 'SALVAGE' as const,
        workOrderId: 'wo-6418',
        workOrderNo: '6418',
        customerName: 'BHEL',
        grade: 'ASME SA213 Gr.T11',
        sizeOd: 50.8,
        sizeWt: 4.0,
        avgLength: 10.0,
        pcs: 7,
        mtr: 70.0,
        mt: 0.323,
        remarks: '[LOT: 426100249]',
        createdAt: '2026-10-13T07:44:09Z',
      },
      {
        id: 'qc-sal-2',
        source: 'QC_INSPECTION' as const,
        date: '2026-10-14',
        category: 'VDI_SALVAGE' as const,
        workCenterName: 'VDI Inspection',
        stageCode: 'VDI',
        dispositionType: 'SALVAGE' as const,
        workOrderId: 'wo-6418',
        workOrderNo: '6418',
        customerName: 'BHEL',
        grade: 'ASME SA213 Gr.T11',
        sizeOd: 50.8,
        sizeWt: 4.0,
        avgLength: 10.0,
        pcs: 4,
        mtr: 40.0,
        mt: 0.185,
        remarks: '[LOT: 426100249]',
        createdAt: '2026-10-14T10:23:48Z',
      },
    ];

    const diversions = [
      {
        id: 'div-hb-1',
        source_wo_id: 'wo-6418',
        target_wo_id: '00000000-0000-0000-0000-00000000000b',
        diverted_qty: 70.0,
        diverted_pcs: 7,
        work_center: 'VDI',
        reason: 'Diverted to Hollow Bank: HB-1 (From Mill Rejection (VDI Inspection): [LOT: 426100249])',
      },
      {
        id: 'div-hb-2',
        source_wo_id: 'wo-6418',
        target_wo_id: '00000000-0000-0000-0000-00000000000b',
        diverted_qty: 40.0,
        diverted_pcs: 4,
        work_center: 'VDI',
        reason: 'Diverted to Hollow Bank: HB-2 (From Mill Rejection (VDI Inspection): [LOT: 426100249])',
      },
    ];

    const hollowBank = [
      {
        id: 'hb-1',
        source_wo_id: 'wo-6418',
        source_stage_code: 'VDI',
        pcs: 7,
        total_meters: 70.0,
        remarks: 'From Mill Rejection (VDI Inspection): [LOT: 426100249]',
      },
      {
        id: 'hb-2',
        source_wo_id: 'wo-6418',
        source_stage_code: 'VDI',
        pcs: 4,
        total_meters: 40.0,
        remarks: 'From Mill Rejection (VDI Inspection): [LOT: 426100249]',
      },
    ];

    const result = applyDiversionsToMillRejections(entries, diversions, hollowBank);
    expect(result.length).toBe(2);
    expect(result[0].isDiverted).toBe(true);
    expect(result[0].remainingPcs).toBe(0);
    expect(result[0].remainingMtr).toBe(0);
    expect(result[1].isDiverted).toBe(true);
    expect(result[1].remainingPcs).toBe(0);
    expect(result[1].remainingMtr).toBe(0);
  });
});
