import { describe, it, expect } from 'vitest';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/production/queue/route';

describe('WO 6072 Hollow Heat Treatment Queue Verification', () => {
  it('correctly displays 277 Nos / 2113.51 Mtr at Hollow Heat Treatment for WO 6072', async () => {
    const req = new NextRequest('http://localhost:3000/api/production/queue?all_stages=true&nocache=true');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);

    const rows = (json.data || []).filter((r: any) => r.work_order_no === '6072');
    const hhtRow = rows.find((r: any) => r.stage_code === 'HOLLOW_HEAT_TREATMENT');
    expect(hhtRow).toBeDefined();

    // Must be exactly 277 PCS / 2113.51 MTR from today's HTC production
    expect(Number(hhtRow.ready_pcs)).toBe(277);
    expect(Number(hhtRow.ready_mtr)).toBeCloseTo(2113.51, 1);
    expect(Number(hhtRow.balance_to_make_pcs)).toBe(277);
    expect(Number(hhtRow.balance_to_make_mtr)).toBeCloseTo(2113.51, 1);
  });

  it('verifies cumulative HTC and Hollow HT balance for multi-campaign WO 6072', async () => {
    const admin = createAdminClient();
    if (!admin) return;

    const { data: woData } = await admin.from('work_orders').select('*').eq('work_order_no', '6072');
    expect(woData).toBeDefined();
    expect(woData!.length).toBeGreaterThan(0);
    const wo = woData![0];

    const { data: logs } = await admin
      .from('production_logs')
      .select('*, process_stages(stage_code)')
      .eq('work_order_id', wo.id);

    // Sum HTC logs + Legacy ROLLING htc_ok
    const legacyRollLogs = logs?.filter((l: any) => l.process_stages?.stage_code === 'ROLLING') || [];
    const legacyHtcOkPcs = legacyRollLogs.reduce((sum: number, l: any) => {
      const match = l.remarks?.match(/\[PCS:\s*([0-9]+)\]/i);
      return sum + (match ? Number(match[1]) : Number(l.output_pcs || 0));
    }, 0);
    expect(legacyHtcOkPcs).toBe(101); // October Campaign

    const htcStageLogs = logs?.filter((l: any) => l.process_stages?.stage_code === 'HTC') || [];
    const newHtcOkPcs = htcStageLogs.reduce((sum: number, l: any) => {
      const match = l.remarks?.match(/\[PCS:\s*([0-9]+)\]/i);
      return sum + (match ? Number(match[1]) : Number(l.output_pcs || 0));
    }, 0);
    expect(newHtcOkPcs).toBe(277); // November Campaign

    const totalHtcOkPcs = legacyHtcOkPcs + newHtcOkPcs;
    expect(totalHtcOkPcs).toBe(378);

    // Sum Hollow HT output logs across campaigns
    const hhtLogs = logs?.filter((l: any) => l.process_stages?.stage_code === 'HOLLOW_HEAT_TREATMENT') || [];
    const totalHhtOutPcs = hhtLogs.reduce((sum: number, l: any) => {
      const match = l.remarks?.match(/\[PCS:\s*([0-9]+)\]/i);
      return sum + (match ? Number(match[1]) : Number(l.output_pcs || 0));
    }, 0);
    expect(totalHhtOutPcs).toBe(101); // Only October campaign has been hollow-heat-treated so far

    // Hollow HT Queue = Total HTC OK (378) - Total Hollow HT Out (101) = 277 PCS
    const expectedHhtQueuePcs = totalHtcOkPcs - totalHhtOutPcs;
    expect(expectedHhtQueuePcs).toBe(277);
  });
});
