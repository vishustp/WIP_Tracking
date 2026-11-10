import { describe, it, expect } from 'vitest';
import { createAdminClient } from '@/lib/supabase/admin';
import { GET as getQueue } from '@/app/api/production/queue/route';
import { NextRequest } from 'next/server';

describe('WO 6530 Draw Bench Availability Test', () => {
  it('confirms that WO 6530 is available in Draw Bench queue even if status was set to Completed', async () => {
    const admin = createAdminClient();
    if (!admin) return;

    // 1. Temporarily set WO 6530 status to 'Completed' to simulate premature Excel completion
    const { data: wo } = await admin.from('work_orders').select('*').eq('work_order_no', '6530').single();
    expect(wo).toBeDefined();

    await admin.from('work_orders').update({ status: 'Completed', excel_completed: true }).eq('id', wo.id);

    // 2. Query Draw Bench queue with nocache=true
    const req = new NextRequest('http://localhost:3000/api/production/queue?stage=DRAW&nocache=true');
    const res = await getQueue(req);
    const json = await res.json();
    const rows = (json.data || []).filter((r: any) => r.work_order_no === '6530');

    console.log('Draw Bench rows for 6530:', rows.length);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].stage_code).toBe('DRAW');
    expect(rows[0].ready_pcs).toBe(2859);
    expect(rows[0].order_status).toBe('In Progress');

    // 3. Confirm that auto-healing restored WO 6530 in DB
    // Give async update a moment to persist
    await new Promise((r) => setTimeout(r, 200));
    const { data: healedWo } = await admin.from('work_orders').select('status, excel_completed').eq('id', wo.id).single();
    expect(healedWo?.status).toBe('In Progress');
    expect(healedWo?.excel_completed).toBe(false);
  });
});
