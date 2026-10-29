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

  it('ensures fully diverted work orders at DRAW, BAND_SAW, or VDI do not show in Aging Report', () => {
    const wipRows = [
      {
        work_order_id: 'wo-draw-diverted',
        work_order_no: 'WO-DRAW-1',
        stage_id: 'stg-draw',
        stage_code: 'DRAW',
        stage_name: 'Cold Draw Bench',
        sequence_no: 4,
        current_wip: 60.0,
        current_wip_pcs: 10,
        od: 60.3,
        wt: 4.5,
        l1: 6.0,
        l2: 6.0,
      },
    ];

    const diversions = [
      {
        id: 'div-draw-full',
        source_wo_id: 'wo-draw-diverted',
        target_wo_id: 'wo-target-client',
        diverted_qty: 60.0,
        diverted_pcs: 10,
        work_center: 'DRAW',
        reason: 'Fully diverted to target [FROM_STAGE: DRAW] [TO_STAGE: DRAW] [PCS: 10]',
        status: 'APPROVED',
        diversion_date: '2026-10-29',
      },
    ];

    const result = computeAgingReportRows({
      wipRows,
      diversions,
      asOfDate: new Date('2026-10-29'),
    });

    // Since all 60m / 10 pcs were diverted out, WO-DRAW-1 has 0 WIP and must not appear in Aging Report
    const row = result.find((r) => r.work_order_id === 'wo-draw-diverted');
    expect(row).toBeUndefined();
    expect(result).toHaveLength(0);
  });

  it('ensures mother pipes cut & diverted from VDI salvage do not leave phantom rows in Aging Report', () => {
    // 40 mother pipes (436m) at VDI salvage cut and diverted into 80 pcs @ 5.3m = 424m with 12m remnant scrap (< 3.0m)
    const wipRows = [
      {
        work_order_id: 'wo-vdi-cut-divert',
        work_order_no: 'WO-6307',
        stage_id: 'stg-vdi-salvage',
        stage_code: 'VDI_SALVAGE',
        stage_name: 'VDI Salvage',
        sequence_no: 8,
        current_wip: 436.0,
        current_wip_pcs: 40,
        od: 60.3,
        wt: 4.5,
        l1: 10.9,
        l2: 10.9,
      },
    ];

    const qcInspections = [
      {
        id: 'qc-salvage-40',
        work_order_id: 'wo-vdi-cut-divert',
        inspection_date: '2026-10-28',
        vdi_salvage_pcs: 40,
        vdi_salvage_mtr: 436.0,
      },
    ];

    const diversions = [
      {
        id: 'div-cut-divert-1',
        source_wo_id: 'wo-vdi-cut-divert',
        target_wo_id: 'wo-target-client-2',
        diverted_qty: 424.0, // 80 pcs @ 5.3m = 424m
        diverted_pcs: 80,
        work_center: 'FINISHING',
        reason: 'Cut & Divert: 40 mother pipes @ 10.9m cut into 80 pcs @ 5.3m = 424.00m [FROM_STAGE: VDI] [SCRAP_REMNANT: 12m]',
        status: 'APPROVED',
        diversion_date: '2026-10-28',
      },
    ];

    const result = computeAgingReportRows({
      wipRows,
      qcInspections,
      diversions,
      asOfDate: new Date('2026-10-29'),
    });

    // All 40 mother pipes were consumed in the cut & divert. The remaining 12m remnant is melt scrap (< 3m).
    // WO-6307 has 0 active WIP and must be completely removed from the Aging Report.
    const row = result.find((r) => r.work_order_id === 'wo-vdi-cut-divert');
    expect(row).toBeUndefined();
    expect(result).toHaveLength(0);
  });

  it('preserves source and target work order numbers in PPC diversion approval filter states', () => {
    const plans = [
      {
        id: 101,
        source_wo_id: 'wo-src-1',
        source_wo_no: 'WO-6307',
        target_wo_id: 'wo-tgt-1',
        target_wo_no: 'WO-6401',
        diverted_qty: 250.0,
        diverted_pcs: 25,
        work_center: 'DRAW',
        target_work_center: 'DRAW',
        status: 'APPROVED',
        ppc_approved_at: '2026-10-29T10:00:00Z',
        reason: 'Draw bench transfer [TO_STAGE: DRAW]',
      },
      {
        id: 102,
        source_wo_id: 'wo-src-2',
        source_wo_no: 'WO-6419',
        target_wo_id: 'wo-tgt-2',
        target_wo_no: 'WO-6495',
        diverted_qty: 150.0,
        diverted_pcs: 15,
        work_center: 'DRAW',
        target_work_center: 'DRAW',
        status: 'PENDING_PPC',
        ppc_approved_at: null,
        reason: 'Pending PPC transfer [TO_STAGE: DRAW]',
      },
    ];

    // Simulate DiversionForm filter logic
    const drawBenchPlans = plans.filter((p) => p.work_center === 'DRAW' || p.target_work_center === 'DRAW');
    const pendingPlans = drawBenchPlans.filter((p) => p.status === 'PENDING_PPC' || (!p.ppc_approved_at && p.status !== 'APPROVED'));
    const approvedPlans = drawBenchPlans.filter((p) => p.status === 'APPROVED' || Boolean(p.ppc_approved_at));

    // 1. Pending view contains only pending request
    expect(pendingPlans).toHaveLength(1);
    expect(pendingPlans[0].source_wo_no).toBe('WO-6419');
    expect(pendingPlans[0].target_wo_no).toBe('WO-6495');

    // 2. Approved view retains the approved work order number and target work order number
    expect(approvedPlans).toHaveLength(1);
    expect(approvedPlans[0].source_wo_no).toBe('WO-6307');
    expect(approvedPlans[0].target_wo_no).toBe('WO-6401');
    expect(approvedPlans[0].status).toBe('APPROVED');

    // 3. All view shows both, without removing approved WO from the list
    expect(drawBenchPlans).toHaveLength(2);
    expect(drawBenchPlans.map((p) => p.source_wo_no)).toContain('WO-6307');
    expect(drawBenchPlans.map((p) => p.source_wo_no)).toContain('WO-6419');
  });
});

