import { describe, it, expect } from 'vitest';

describe('WO 6355 Draw Bench WIP & Master Campaign Queue', () => {
  it('confirms WO 6355 Draw Bench WIP is available in Queue API', async () => {
    const { GET } = await import('@/app/api/production/queue/route');
    const req = new Request('http://localhost:3000/api/production/queue?stage=DRAW&refresh=true');
    const res = await GET(req as any);
    const json = await res.json();
    const rows = json.data || json.rows || [];
    const row6355 = rows.find((r: any) => String(r.work_order_no).includes('6355'));

    expect(row6355).toBeDefined();
    expect(row6355.ready_pcs).toBeGreaterThan(0);
    expect(row6355.rolled_pcs).toBe(1376);
  });
});
