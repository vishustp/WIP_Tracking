import { describe, it, expect, vi } from 'vitest';
import { computeAgingReportRows } from '@/lib/reports/agingReportHelper';
import { approveDiversion, rejectDiversion } from '@/lib/diversions/client';

describe('Draw Bench Diversion PPC Approval Logic', () => {
  const baseWipRows = [
    {
      work_order_id: 'wo-source-101',
      work_order_no: 'WO-101',
      customer_name: 'Source Client',
      stage_id: 'stg-ht-101',
      stage_code: 'HEAT_TREATMENT',
      stage_name: 'Heat Treatment',
      sequence_no: 3,
      current_wip: 100.0,
      current_wip_pcs: 10,
      od: 60.3,
      wt: 5.0,
      l1: 10.0,
      l2: 10.0,
    },
    {
      work_order_id: 'wo-target-202',
      work_order_no: 'WO-202',
      customer_name: 'Target Client',
      stage_id: 'stg-draw-202',
      stage_code: 'DRAW',
      stage_name: 'Cold Draw Bench',
      sequence_no: 2,
      current_wip: 50.0,
      current_wip_pcs: 5,
      od: 50.8,
      wt: 4.0,
      l1: 10.0,
      l2: 10.0,
    },
  ];

  it('Scenario 1: Pending PPC Draw Bench diversion does NOT deduct from source WO WIP or credit target WO', () => {
    const diversions = [
      {
        id: 'div-pending-draw',
        source_wo_id: 'wo-source-101',
        target_wo_id: 'wo-target-202',
        diverted_qty: 40.0,
        diverted_pcs: 4,
        work_center: 'DRAW',
        target_work_center: 'DRAW',
        reason: 'Draw bench diversion awaiting PPC approval [FROM_STAGE: HEAT_TREATMENT] [TO_STAGE: DRAW] [PCS: 4]',
        status: 'PENDING_PPC',
        diversion_date: '2026-10-28',
      },
    ];

    const result = computeAgingReportRows({
      wipRows: baseWipRows,
      qcInspections: [],
      diversions,
      asOfDate: new Date('2026-10-28'),
    });

    // Source WO must retain its full 100m WIP (not reduced to 60m)
    const sourceRow = result.find((r) => r.work_order_id === 'wo-source-101');
    expect(sourceRow).toBeDefined();
    expect(sourceRow!.current_wip).toBe(100.0);
    expect(sourceRow!.current_wip_pcs).toBe(10);

    // Target WO must NOT have any unapproved WIP credited (has_diversion remains false)
    const targetRow = result.find((r) => r.work_order_id === 'wo-target-202');
    expect(targetRow).toBeDefined();
    expect(targetRow!.has_diversion).toBe(false);
    expect(targetRow!.diversion_in_mtr).toBe(0);
  });

  it('Scenario 2: Approved Draw Bench diversion DOES deduct from source WO and credit target WO', () => {
    const diversions = [
      {
        id: 'div-approved-draw',
        source_wo_id: 'wo-source-101',
        target_wo_id: 'wo-target-202',
        diverted_qty: 40.0,
        diverted_pcs: 4,
        work_center: 'DRAW',
        target_work_center: 'DRAW',
        reason: 'PPC Approved draw bench diversion [FROM_STAGE: HEAT_TREATMENT] [TO_STAGE: DRAW] [PCS: 4]',
        status: 'APPROVED',
        diversion_date: '2026-10-28',
      },
    ];

    const result = computeAgingReportRows({
      wipRows: baseWipRows,
      qcInspections: [],
      diversions,
      asOfDate: new Date('2026-10-28'),
    });

    // Source WO must have 40m deducted (100 - 40 = 60m remaining)
    const sourceRow = result.find((r) => r.work_order_id === 'wo-source-101');
    expect(sourceRow).toBeDefined();
    expect(sourceRow!.current_wip).toBe(60.0);
    expect(sourceRow!.current_wip_pcs).toBe(6);

    // Target WO must have approved diversion flagged and details recorded
    const targetRow = result.find((r) => r.work_order_id === 'wo-target-202');
    expect(targetRow).toBeDefined();
    expect(targetRow!.has_diversion).toBe(true);
    expect(targetRow!.diversion_in_mtr).toBe(40.0);
    expect(targetRow!.diversion_in_pcs).toBe(4);
  });

  it('Scenario 3: Rejected by PPC Draw Bench diversion leaves source WIP intact and provides zero credit', () => {
    const diversions = [
      {
        id: 'div-rejected-draw',
        source_wo_id: 'wo-source-101',
        target_wo_id: 'wo-target-202',
        diverted_qty: 40.0,
        diverted_pcs: 4,
        work_center: 'DRAW',
        target_work_center: 'DRAW',
        reason: 'PPC Rejected draw bench diversion [FROM_STAGE: HEAT_TREATMENT] [TO_STAGE: DRAW] [PCS: 4]',
        status: 'REJECTED_BY_PPC',
        diversion_date: '2026-10-28',
      },
    ];

    const result = computeAgingReportRows({
      wipRows: baseWipRows,
      qcInspections: [],
      diversions,
      asOfDate: new Date('2026-10-28'),
    });

    const sourceRow = result.find((r) => r.work_order_id === 'wo-source-101');
    expect(sourceRow).toBeDefined();
    expect(sourceRow!.current_wip).toBe(100.0);

    const targetRow = result.find((r) => r.work_order_id === 'wo-target-202');
    expect(targetRow).toBeDefined();
    expect(targetRow!.has_diversion).toBe(false);
  });

  it('Scenario 4: Non-Draw Bench diversions (e.g. BAND_SAW) take effect when APPROVED', () => {
    const diversions = [
      {
        id: 'div-bandsaw',
        source_wo_id: 'wo-source-101',
        target_wo_id: 'wo-target-202',
        diverted_qty: 25.0,
        diverted_pcs: 2,
        work_center: 'BAND_SAW',
        target_work_center: 'BAND_SAW',
        reason: 'Band saw cut diversion [FROM_STAGE: HEAT_TREATMENT] [TO_STAGE: BAND_SAW] [PCS: 2]',
        status: 'APPROVED',
        diversion_date: '2026-10-28',
      },
    ];

    const result = computeAgingReportRows({
      wipRows: baseWipRows,
      qcInspections: [],
      diversions,
      asOfDate: new Date('2026-10-28'),
    });

    const sourceRow = result.find((r) => r.work_order_id === 'wo-source-101');
    expect(sourceRow).toBeDefined();
    expect(sourceRow!.current_wip).toBe(75.0);
    expect(sourceRow!.current_wip_pcs).toBe(8);
  });
});

describe('Diversion Client Helper RPC Tests', () => {
  it('approveDiversion calls stored procedure approve_diversion', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null });
    const mockFrom = vi.fn();
    const mockSupabase = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'usr-1' } } }) },
      rpc: mockRpc,
      from: mockFrom,
    } as any;

    const result = await approveDiversion(
      {
        id: 'plan-123',
        remarks: 'Authorized per schedule',
      },
      mockSupabase
    );

    expect(result.success).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith('approve_diversion', {
      p_id: 'plan-123',
      p_remarks: 'Authorized per schedule',
    });
  });

  it('rejectDiversion calls stored procedure reject_diversion', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null });
    const mockFrom = vi.fn();
    const mockSupabase = {
      rpc: mockRpc,
      from: mockFrom,
    } as any;

    const result = await rejectDiversion(
      {
        id: 'plan-123',
        reason: 'Grade incompatibility',
      },
      mockSupabase
    );

    expect(result.success).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith('reject_diversion', {
      p_id: 'plan-123',
      p_reason: 'Grade incompatibility',
    });
  });
});
