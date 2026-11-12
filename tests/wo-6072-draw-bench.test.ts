import { describe, it, expect } from 'vitest';
import { GET } from '@/app/api/production/queue/route';
import { NextRequest } from 'next/server';

describe('WO 6072 Draw Bench WIP Verification', () => {
  it('verifies WO 6072 shows exactly 277 Nos / 2113.51 Mtr at Draw Bench stage', async () => {
    const req = new NextRequest('http://localhost:3000/api/production/queue?stage=DRAW&nocache=true');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);

    const rows = (json.data || []).filter((r: any) => r.work_order_no === '6072');
    expect(rows.length).toBe(1);

    const row6072 = rows[0];
    expect(row6072.stage_code).toBe('DRAW');
    expect(Number(row6072.ready_pcs)).toBe(277);
    expect(Number(row6072.ready_mtr)).toBeCloseTo(2113.51, 1);
    expect(Number(row6072.balance_to_make_pcs)).toBe(277);
    expect(Number(row6072.balance_to_make_mtr)).toBeCloseTo(2113.51, 1);
    expect(row6072.feeder_source_label).toBe('Hollow HT Net OK');
  });

  it('verifies no IP_CUTTING row is injected into DRAW stage query', async () => {
    const req = new NextRequest('http://localhost:3000/api/production/queue?stage=DRAW&nocache=true');
    const res = await GET(req);
    const json = await res.json();
    const ipRows = (json.data || []).filter((r: any) => r.stage_code === 'IP_CUTTING');
    expect(ipRows.length).toBe(0);
  });
});
