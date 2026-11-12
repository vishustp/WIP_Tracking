import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/production/queue/route';
import { createAdminClient } from '@/lib/supabase/admin';

describe('WO 6607 Manufacturing Progression Verification', () => {
  it('correctly calculates WO 6607 progression into VDI inspection (496 Nos)', async () => {
    // 1. Check Production Queue API
    const req = new NextRequest('http://localhost:3000/api/production/queue?all_stages=true&nocache=true');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);

    const vdiRow = json.data.find(
      (r: any) => r.work_order_no === '6607' && r.stage_code === 'VDI'
    );
    expect(vdiRow).toBeDefined();
    // Band Saw cut 124 mother pieces into 496 prime customer pieces -> waiting at VDI
    expect(Number(vdiRow.ready_pcs)).toBe(496);
  });

  it('verifies stage logs and balance for WO 6607', async () => {
    const admin = createAdminClient();
    if (!admin) return;

    const { data: woData } = await admin.from('work_orders').select('*').eq('work_order_no', '6607');
    expect(woData).toBeDefined();
    expect(woData!.length).toBeGreaterThan(0);
    const wo = woData![0];

    const { data: logs } = await admin
      .from('production_logs')
      .select('*, process_stages(stage_code)')
      .eq('work_order_id', wo.id);

    // Sum Draw Bench output pieces
    const drawLogs = logs?.filter((l: any) => l.process_stages?.stage_code === 'DRAW') || [];
    const drawPcs = drawLogs.reduce((sum: number, l: any) => {
      const match = l.remarks?.match(/\[PCS:\s*([0-9]+)\]/i);
      return sum + (match ? Number(match[1]) : Number(l.output_pcs || 0));
    }, 0);
    expect(drawPcs).toBe(127);

    // Sum Heat Treatment output pieces
    const htLogs = logs?.filter((l: any) => l.process_stages?.stage_code === 'HEAT_TREATMENT') || [];
    const htPcs = htLogs.reduce((sum: number, l: any) => {
      const match = l.remarks?.match(/\[PCS:\s*([0-9]+)\]/i);
      return sum + (match ? Number(match[1]) : Number(l.output_pcs || 0));
    }, 0);
    expect(htPcs).toBe(127);

    // WIP at Heat Treatment = Preceding (Draw) OK - Current (HT) OK
    const expectedHtWip = drawPcs - htPcs;
    expect(expectedHtWip).toBe(0);
  });
});
