import { describe, it, expect } from 'vitest';
import { GET } from '@/app/api/production/queue/route';

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
    expect(sample6558).toBeUndefined();
  });
});
