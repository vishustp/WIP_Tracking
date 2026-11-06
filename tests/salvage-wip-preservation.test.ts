import { describe, it, expect } from 'vitest';
import { GET } from '@/app/api/production/queue/route';

describe('VDI Salvage WIP Preservation', () => {
  it('confirms VDI Salvage remains in WIP and is available in queue API and reporting', async () => {
    const req = new Request('http://localhost:3000/api/production/queue?all_stages=true&refresh=true');
    const res = await GET(req as any);
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);

    // 1. Verify VDI_SALVAGE rows exist with positive pieces and meters
    const salvageRows = json.data.filter((r: any) => (r.stage_code || '').toUpperCase() === 'VDI_SALVAGE');
    expect(salvageRows.length).toBeGreaterThan(0);

    for (const sRow of salvageRows) {
      expect(Number(sRow.ready_pcs ?? sRow.balance_to_make_pcs ?? 0)).toBeGreaterThan(0);
      expect(Number(sRow.ready_mtr ?? sRow.balance_to_make_mtr ?? 0)).toBeGreaterThan(0);
      expect(Number(sRow.vdi_salvage_pcs ?? 0)).toBeGreaterThan(0);
    }

    // 2. WO 6355 has 161 pcs salvage across its campaign at VDI, not yet diverted or second declared
    const salvage6355 = json.data.find((r: any) => r.work_order_no === '6355' && r.stage_code === 'VDI_SALVAGE');
    expect(salvage6355).toBeDefined();
    expect(Number(salvage6355.ready_pcs)).toBe(161);

    // 3. WO 1456 had 6 pcs salvage with a rejection declaration awaiting approval (PENDING_QC)
    // Pending declarations must NOT deduct salvage from WIP
    const salvage1456 = json.data.find((r: any) => r.work_order_no === '1456' && r.stage_code === 'VDI_SALVAGE');
    expect(salvage1456).toBeDefined();
    expect(Number(salvage1456.ready_pcs)).toBe(6);
    expect(Number(salvage1456.pending_rejection_pcs)).toBe(6);

    // 4. WO 6457 (if still active in queue)
    const salvage6457 = json.data.find((r: any) => r.work_order_no === '6457' && r.stage_code === 'VDI_SALVAGE');
    if (salvage6457) {
      expect(Number(salvage6457.ready_pcs)).toBe(22);
    }
  });
});
