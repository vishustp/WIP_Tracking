import { describe, it, expect } from 'vitest';
import { GET } from '@/app/api/production/queue/route';
import { NextRequest } from 'next/server';

describe('WO 6072 IP Cutting & Draw Bench Routing Verification', () => {
  it('verifies WO 6072 is queued at IP Cutting (Band Saw) with exactly 277 Nos / 2113.51 Mtr before Draw Bench', async () => {
    const req = new NextRequest('http://localhost:3000/api/production/queue?stage=BAND_SAW&include_ip_cutting=true&nocache=true');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);

    const rows = (json.data || []).filter((r: any) => r.work_order_no === '6072');
    const ipRow = rows.find((r: any) => r.stage_code === 'IP_CUTTING');
    expect(ipRow).toBeDefined();

    expect(Number(ipRow.ready_pcs)).toBe(277);
    expect(Number(ipRow.ready_mtr)).toBeCloseTo(2113.51, 1);
    expect(Number(ipRow.balance_to_make_pcs)).toBe(277);
    expect(Number(ipRow.balance_to_make_mtr)).toBeCloseTo(2113.51, 1);
    expect(ipRow.feeder_source_label).toBe('Hollow HT Qty');
  });

  it('verifies no IP_CUTTING row is injected into DRAW stage query', async () => {
    const req = new NextRequest('http://localhost:3000/api/production/queue?stage=DRAW&nocache=true');
    const res = await GET(req);
    const json = await res.json();
    const ipRows = (json.data || []).filter((r: any) => r.stage_code === 'IP_CUTTING');
    expect(ipRows.length).toBe(0);
  });
});
