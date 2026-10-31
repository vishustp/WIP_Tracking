import { describe, it, expect } from 'vitest';
import { createAdminClient } from '@/lib/supabase/admin';

describe('WO 6485 IP Cutting Queue Availability', () => {
  it('confirms WO 6485 is available in IP_CUTTING queue with remaining mother pipes', async () => {
    const admin = createAdminClient();
    if (!admin) throw new Error('No admin');

    // Query production logs for WO 6485
    const { data: wo } = await admin
      .from('work_orders')
      .select('id, work_order_no')
      .eq('work_order_no', '6485')
      .single();

    expect(wo).toBeDefined();

    // Query queue API for IP_CUTTING
    const { GET } = await import('@/app/api/production/queue/route');
    const { NextRequest } = await import('next/server');
    const req = new NextRequest('http://localhost:3000/api/production/queue?stage=IP_CUTTING');
    const res = await GET(req);
    const json = await res.json();

    const item6485 = json.data?.find((r: any) => String(r.work_order_no).includes('6485'));
    expect(item6485).toBeDefined();
    expect(item6485.stage_code).toBe('IP_CUTTING');
    expect(item6485.ready_pcs).toBe(853);
    expect(item6485.ready_mtr).toBeGreaterThan(6000);
  });
});
