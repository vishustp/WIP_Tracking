import { describe, it, expect } from 'vitest';
import { GET } from '@/app/api/production/queue/route';
import { computeAgingReportRows, normalizeAgingRow } from '@/lib/reports/agingReportHelper';

describe('Aging VDI and Zero Nos Integration', () => {
  it('ensures VDI rows in queue API always have positive piece count and no 0-piece phantom rows', async () => {
    const req = new Request('http://localhost:3000/api/production/queue?all_stages=true&refresh=true');
    const res = await GET(req as any);
    const json = await res.json();
    
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);

    const vdiRows = json.data?.filter((r: any) => (r.stage_code || '').toUpperCase() === 'VDI');
    expect(vdiRows.length).toBeGreaterThan(0);

    // Every VDI row must have positive piece count
    for (const row of vdiRows) {
      const pcs = Number(row.ready_pcs ?? row.current_wip_pcs ?? row.balance_to_make_pcs ?? 0);
      expect(pcs).toBeGreaterThan(0);
      expect(Number(row.ready_mtr ?? 0)).toBeGreaterThan(0);
    }

    // WO 6576 and WO 6558 had 0 pieces left at VDI (all pieces inspected); they must not exist as phantom 0-pcs VDI queue rows
    const sample6576 = json.data?.find((r: any) => r.work_order_no === '6576' && r.stage_code === 'VDI');
    expect(sample6576).toBeUndefined();

    const sample6558 = json.data?.find((r: any) => r.work_order_no === '6558' && r.stage_code === 'VDI');
    if (sample6558) {
      expect(Number(sample6558.ready_pcs)).toBeGreaterThan(0);
    }

    const salvageRows = json.data?.filter((r: any) => (r.stage_code || '').toUpperCase() === 'VDI_SALVAGE');
    expect(salvageRows.length).toBeGreaterThan(0);
    for (const sRow of salvageRows) {
      expect(Number(sRow.vdi_salvage_pcs ?? 0)).toBeGreaterThan(0);
      expect(Number(sRow.vdi_salvage_mtr ?? 0)).toBeGreaterThan(0);
    }
  });

  it('verifies HT and DB seconds declaration deduction in queue API and aging report', async () => {
    const req = new Request('http://localhost:3000/api/production/queue?all_stages=true&refresh=true');
    const res = await GET(req as any);
    const json = await res.json();

    expect(json.success).toBe(true);
    // WO 6278 had 1 PC / 11.8m declared as seconds at HEAT_TREATMENT; it must be deducted to 0 and not appear as available WIP
    const ht6278 = json.data?.find((r: any) => r.work_order_no === '6278' && r.stage_code === 'HEAT_TREATMENT');
    expect(ht6278).toBeUndefined();

    // Verify L1 and L2 are present on rows for Aging Report display
    const rowsWithL1 = json.data?.filter((r: any) => r.l1 != null);
    expect(rowsWithL1.length).toBeGreaterThan(0);

    // WO 6349: Finishing row must have 0 salvage pcs (not 71), and ready_pcs === 4
    const fin6349 = json.data?.find((r: any) => r.work_order_no === '6349' && r.stage_code === 'FINISHING');
    expect(fin6349).toBeDefined();
    expect(Number(fin6349.ready_pcs)).toBe(4);
    expect(Number(fin6349.vdi_salvage_pcs || 0)).toBe(0);

    // WO 6349: VDI_SALVAGE row must have 71 salvage pieces
    const salvage6349 = json.data?.find((r: any) => r.work_order_no === '6349' && r.stage_code === 'VDI_SALVAGE');
    expect(salvage6349).toBeDefined();
    expect(Number(salvage6349.ready_pcs)).toBe(71);
    expect(Number(salvage6349.vdi_salvage_pcs)).toBe(71);
  });

  it('verifies computeAgingReportRows deducts rejection_declarations for HT and DB', () => {
    const wipRows = [
      {
        work_order_id: 'wo-1',
        work_order_no: 'WO-6278',
        stage_id: 'stg-ht',
        stage_code: 'HEAT_TREATMENT',
        stage_name: 'Heat Treatment',
        sequence_no: 3,
        current_wip: 11.8,
        current_wip_pcs: 1,
        od: 60.3,
        wt: 3.91,
        l1: 6.0,
        l2: 6.5,
      },
      {
        work_order_id: 'wo-2',
        work_order_no: 'WO-6435',
        stage_id: 'stg-db',
        stage_code: 'DRAW',
        stage_name: 'Draw Bench',
        sequence_no: 2,
        current_wip: 6.1,
        current_wip_pcs: 1,
        od: 50.8,
        wt: 3.2,
        l1: 6.0,
        l2: 6.2,
      },
      {
        work_order_id: 'wo-3',
        work_order_no: 'WO-9999',
        stage_id: 'stg-ht',
        stage_code: 'HEAT_TREATMENT',
        stage_name: 'Heat Treatment',
        sequence_no: 3,
        current_wip: 24.0,
        current_wip_pcs: 4,
        od: 60.3,
        wt: 3.91,
        l1: 6.0,
        l2: 6.0,
      },
    ];

    const rejectionDeclarations = [
      {
        work_order_id: 'wo-1',
        work_center: 'HEAT_TREATMENT',
        rejected_pcs: 1,
        rejected_mtr: 11.8,
        status: 'APPROVED',
      },
      {
        work_order_id: 'wo-2',
        work_center: 'DRAW',
        rejected_pcs: 1,
        rejected_mtr: 6.1,
        status: 'PENDING_QC',
      },
    ];

    const result = computeAgingReportRows({
      wipRows,
      rejectionDeclarations,
      asOfDate: new Date(),
    });

    // wo-1 and wo-2 should be deducted to 0 and filtered out
    expect(result.find((r: any) => r.work_order_id === 'wo-1')).toBeUndefined();
    expect(result.find((r: any) => r.work_order_id === 'wo-2')).toBeUndefined();

    // wo-3 should remain active with L1 and L2 preserved
    const remaining = result.find((r: any) => r.work_order_id === 'wo-3');
    expect(remaining).toBeDefined();
    expect(remaining.current_wip_pcs).toBe(4);
    expect(remaining.l1).toBe(6.0);
    expect(remaining.l2).toBe(6.0);

    // Test normalizeAgingRow
    const normalizedWo1 = normalizeAgingRow(wipRows[0], [], undefined, rejectionDeclarations);
    expect(normalizedWo1.current_wip_pcs).toBe(0);
    expect(normalizedWo1.current_wip).toBe(0);
    expect(normalizedWo1.l1).toBe(6.0);
    expect(normalizedWo1.l2).toBe(6.5);
  });
});
