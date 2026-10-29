import { describe, it, expect } from 'vitest';
import { GET, POST } from '@/app/api/work-orders/capping/route';
import { GET as getQueue } from '@/app/api/production/queue/route';
import { NextRequest } from 'next/server';
import { validateProductionEntry } from '@/lib/productionValidation';
import { createAdminClient } from '@/lib/supabase/admin';

describe('PPC Finishing Capping Management', () => {
  it('fetches capping details for a work order', async () => {
    const req = new NextRequest('http://localhost:3000/api/work-orders/capping?work_order_no=6352');
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.work_order_no).toBe('6352');
    expect(json.ordered_qty_pcs).toBe(164);
    expect(json.default_capping_pcs).toBe(180); // 164 * 1.10 = 180.4 -> 180
    expect(json.effective_capping_pcs).toBeGreaterThanOrEqual(180);
  });

  it('allows PPC to set custom capping for finishing and reflects in queue and validation', async () => {
    // 1. Set custom capping to 535 PCS (matching campaign plan)
    const setReq = new NextRequest('http://localhost:3000/api/work-orders/capping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        work_order_no: '6352',
        capping_pcs: 535,
        capping_mtr: 6955,
        updated_by: 'PPC Lead',
      }),
    });

    const setRes = await POST(setReq);
    const setJson = await setRes.json();

    expect(setRes.status).toBe(200);
    expect(setJson.success).toBe(true);
    expect(setJson.capping_pcs).toBe(535);
    expect(setJson.is_custom).toBe(true);

    // 2. Verify queue API returns the custom capping
    const queueReq = new NextRequest('http://localhost:3000/api/production/queue?stage=FINISHING&nocache=true');
    const queueRes = await getQueue(queueReq);
    const queueJson = await queueRes.json();
    const woRow = queueJson.data?.find((r: any) => r.work_order_no === '6352');

    if (woRow) {
      expect(woRow.order_capping_pcs).toBe(535);
    }

    // 3. Verify production validation allows bundling up to 535 PCS
    const mockRow = {
      work_order_id: setJson.work_order_id,
      work_order_no: '6352',
      stage_code: 'FINISHING' as const,
      size_od: 63.5,
      size_wt: 5.2,
      od: 63.5,
      wl: 5.2,
      l1: 13,
      l2: 13,
      avg_length: 13,
      total_order_pcs: 164,
      total_order_mtr: 2132,
      order_capping_pcs: 535,
      finished_output_pcs: 177,
      finished_output_mtr: 2301,
      available_pcs: 535,
      available_mtr: 6955,
      max_allowed_pcs: 535,
      balance_to_make_pcs: 358,
      rejection_pcs: '0',
      rejection_mtr: '0',
      htc_ok_pcs: '0',
      htc_ok_mtr: '0',
    };

    // Attempting to bundle 50 pcs (total 177 + 50 = 227 pcs <= 535 cap) -> passes!
    const validErrors = validateProductionEntry(
      {
        ...mockRow,
        pcs: '50',
        mtr: '650',
      } as any,
      'FINISHING'
    );
    expect(validErrors.length).toBe(0);

    // Attempting to bundle 400 pcs (total 177 + 400 = 577 pcs > 535 cap) -> blocked with clear PPC guidance!
    const invalidErrors = validateProductionEntry(
      {
        ...mockRow,
        pcs: '400',
        mtr: '5200',
      } as any,
      'FINISHING'
    );
    expect(invalidErrors.length).toBeGreaterThan(0);
    expect(invalidErrors[0].message).toContain('exceeds maximum allowed PPC custom capping limit');
    expect(invalidErrors[0].message).toContain('PPC can increase the finishing capping');

    // 4. Reset capping back to default
    const resetReq = new NextRequest('http://localhost:3000/api/work-orders/capping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        work_order_no: '6352',
        reset_default: true,
      }),
    });
    const resetRes = await POST(resetReq);
    const resetJson = await resetRes.json();
    expect(resetRes.status).toBe(200);
    expect(resetJson.success).toBe(true);
    expect(resetJson.is_custom).toBe(false);
  }, 15000);
});
