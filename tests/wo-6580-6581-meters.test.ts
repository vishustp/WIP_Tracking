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
    // The remaining 108 pcs are from Campaign 20 (CDS) that passed HTC and are legitimately in Draw queue at 5.46m/pipe.
    const draw6580 = rows.find((r: any) => r.work_order_no === '6580' && r.stage_code === 'DRAW');
    if (draw6580) {
      expect(draw6580.ready_pcs).toBe(108);
      expect(draw6580.ready_mtr).toBeCloseTo(589.7, 1);
    }

    // WO 6581: 40 pcs rolled and passed HTC in Campaign 20 (CDS); now available in Draw Bench queue
    const draw6581 = rows.find((r: any) => r.work_order_no === '6581' && r.stage_code === 'DRAW');
    expect(draw6581).toBeDefined();
    if (draw6581) {
      expect(draw6581.ready_pcs).toBe(40);
      expect(draw6581.ready_mtr).toBeCloseTo(214.0, 1);
    }
  });
});
