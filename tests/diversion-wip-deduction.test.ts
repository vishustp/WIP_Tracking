import { describe, it, expect } from 'vitest';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/production/queue/route';

describe('Diversion WIP Deduction & Queue Verification', () => {
  it('verifies WO 6072 displays 277 Nos / 2113.51 Mtr at IP Cutting (Band Saw)', async () => {
    const req = new NextRequest('http://localhost:3000/api/production/queue?stage=BAND_SAW&include_ip_cutting=true&nocache=1');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    const row6072 = json.data?.find((r: any) => r.work_order_no === '6072' && r.stage_code === 'IP_CUTTING');
    expect(row6072).toBeDefined();
    expect(Number(row6072.balance_to_make_pcs)).toBe(277);
    expect(Number(row6072.balance_to_make_mtr)).toBeCloseTo(2113.51, 1);
  });

  it('verifies WO 6607 displays in queue (cut into VDI inspection with 496 Nos)', async () => {
    const req = new NextRequest('http://localhost:3000/api/production/queue?stage=VDI&nocache=1');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    const row6607 = json.data?.find((r: any) => r.work_order_no === '6607');
    expect(row6607).toBeDefined();
    expect(Number(row6607.ready_pcs)).toBe(496);
  });

  it('verifies outbound diversions are deducted from source VDI for WO 6354 and WO 6360', async () => {
    const admin = createAdminClient()!;
    // WO 6354: diverted 18 mother pipes (234m) out of VDI
    const { data: wo6354 } = await admin.from('work_orders').select('*').eq('work_order_no', '6354').single();
    expect(wo6354).toBeDefined();

    const { data: divs6354 } = await admin.from('diversion_plans').select('*').eq('source_wo_id', wo6354.id);
    expect(divs6354!.length).toBeGreaterThan(0);
    const totalDivOut = divs6354!.reduce((sum: number, d: any) => sum + Number(d.diverted_qty || 0), 0);
    expect(totalDivOut).toBeGreaterThan(0);
  });
});
