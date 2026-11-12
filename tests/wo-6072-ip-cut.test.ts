import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/production/queue/route';

describe('WO 6072 IP Cutting WIP Reconciliation', () => {
  it('correctly displays 277 Nos / 2113.51 Mtr at IP Cutting (Band Saw) for WO 6072', async () => {
    const req = new NextRequest('http://localhost:3000/api/production/queue?all_stages=true&nocache=true');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);

    const rows = (json.data || []).filter((r: any) => r.work_order_no === '6072');
    console.log('WO 6072 rows after fix:', rows.map((r: any) => ({
      stage_code: r.stage_code,
      ready_pcs: r.ready_pcs,
      ready_mtr: r.ready_mtr,
      balance_to_make_pcs: r.balance_to_make_pcs,
      balance_to_make_mtr: r.balance_to_make_mtr,
      feeder_pcs: r.feeder_pcs,
      feeder_mtr: r.feeder_mtr,
      is_ip_cutting: r.is_ip_cutting,
      ip_cut_length: r.ip_cut_length,
      ip_multiple: r.ip_multiple,
    })));

    const ipRow = rows.find((r: any) => r.stage_code === 'IP_CUTTING');
    expect(ipRow).toBeDefined();

    // Must be exactly 277 PCS / 2113.51 MTR as per cutting plan in Rolling Plan 27-M2
    expect(Number(ipRow.ready_pcs)).toBe(277);
    expect(Number(ipRow.ready_mtr)).toBeCloseTo(2113.51, 1);
    expect(Number(ipRow.balance_to_make_pcs)).toBe(277);
    expect(Number(ipRow.balance_to_make_mtr)).toBeCloseTo(2113.51, 1);
    expect(Number(ipRow.feeder_pcs)).toBe(277);
    expect(Number(ipRow.feeder_mtr)).toBeCloseTo(2113.51, 1);
  });

  it('verifies Band Saw queue includes WO 6072 in IP Cutting tab with 277 Nos', async () => {
    const req = new NextRequest('http://localhost:3000/api/production/queue?stage=BAND_SAW&include_ip_cutting=true&nocache=true');
    const res = await GET(req);
    const json = await res.json();

    const rows = (json.data || []).filter((r: any) => r.work_order_no === '6072');
    const ipRow = rows.find((r: any) => r.stage_code === 'IP_CUTTING');
    expect(ipRow).toBeDefined();
    expect(Number(ipRow.balance_to_make_pcs)).toBe(277);
    expect(Number(ipRow.balance_to_make_mtr)).toBeCloseTo(2113.51, 1);
  });
});
