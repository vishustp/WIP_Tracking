import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/production/queue/route';

describe('WO 6580 & 6581 Meter Calculation Across Campaigns', () => {
  it('correctly calculates HTC queue meters and eliminates phantom draw queue for WO 6580 and 6581', async () => {
    const req = new NextRequest('http://localhost:3000/api/production/queue?all_stages=true&nocache=true');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);

    const rows = json.data || [];

    // WO 6580: Rolled 225 pcs (1228.5m) in Campaign 20 awaiting HTC
    const htc6580 = rows.find((r: any) => r.work_order_no === '6580' && r.stage_code === 'HTC');
    if (htc6580) {
      expect(htc6580.ready_pcs).toBe(225);
      expect(htc6580.ready_mtr).toBeCloseTo(1228.5, 1);
    }

    // WO 6580: October 616 pcs were HFS (already cut at Band Saw and deducted).
    // The 108 pcs from Campaign 20 (CDS) were drawn on 2026-11-04, so Draw queue is now 0 and Heat Treatment has 108 pcs ready!
    const draw6580 = rows.find((r: any) => r.work_order_no === '6580' && r.stage_code === 'DRAW');
    expect(draw6580).toBeUndefined(); // Completed draw is not in draw queue!

    const ht6580 = rows.find((r: any) => r.work_order_no === '6580' && r.stage_code === 'HEAT_TREATMENT');
    console.log('ht6580:', ht6580);
    expect(ht6580).toBeDefined();
    if (ht6580) {
      expect(ht6580.ready_pcs).toBe(13);
      expect(ht6580.ready_mtr).toBeCloseTo(83.2, 1);
    }

    // WO 6581: 40 pcs were drawn on 2026-11-04, so Draw queue is now 0 and Heat Treatment has 39 pcs ready!
    const draw6581 = rows.find((r: any) => r.work_order_no === '6581' && r.stage_code === 'DRAW');
    expect(draw6581).toBeUndefined(); // Completed draw is not in draw queue!

    const ht6581 = rows.find((r: any) => r.work_order_no === '6581' && r.stage_code === 'HEAT_TREATMENT');
    expect(ht6581).toBeDefined();
    if (ht6581) {
      expect(ht6581.ready_pcs).toBe(39);
    }
  });
});
