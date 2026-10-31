import { describe, it, expect } from 'vitest';

describe('Verify 6034 in Queue API & Matrix', () => {
  it('confirms 6034 has 700 at Band Saw and 54 at VDI', async () => {
    const { GET } = await import('@/app/api/production/queue/route');
    const req = new Request('http://localhost:3000/api/production/queue?all_stages=true&refresh=true');
    const res = await GET(req as any);
    const json = await res.json();
    const rows6034 = json.data.filter((r: any) => String(r.work_order_no).includes('6034'));
    console.log('6034 in Queue API:', rows6034.map((r: any) => ({
      stage: r.stage_code,
      ready_pcs: r.ready_pcs,
      ready_mtr: r.ready_mtr,
      ready_mt: r.ready_mt,
    })));

    const vdi = rows6034.find((r: any) => r.stage_code === 'VDI');
    expect(vdi).toBeDefined();
    expect(vdi.ready_pcs).toBe(319);
    expect(vdi.ready_mtr).toBe(1064.69);
  });
});
