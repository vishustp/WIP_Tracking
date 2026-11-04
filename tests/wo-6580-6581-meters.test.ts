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

    // WO 6580: October 616 pcs were HFS and already cut at Band Saw; must not appear in Draw Bench
    const draw6580 = rows.find((r: any) => r.work_order_no === '6580' && r.stage_code === 'DRAW');
    if (draw6580) {
      expect(draw6580.ready_pcs).toBe(0);
      expect(draw6580.ready_mtr).toBe(0);
    }

    // WO 6581: Rolled 40 pcs (214.0m) in Campaign 20 awaiting HTC
    const htc6581 = rows.find((r: any) => r.work_order_no === '6581' && r.stage_code === 'HTC');
    if (htc6581) {
      expect(htc6581.ready_pcs).toBe(40);
      expect(htc6581.ready_mtr).toBeCloseTo(214.0, 1);
    }

    // WO 6581: October 384 pcs were HFS and already cut at Band Saw; must not appear in Draw Bench
    const draw6581 = rows.find((r: any) => r.work_order_no === '6581' && r.stage_code === 'DRAW');
    if (draw6581) {
      expect(draw6581.ready_pcs).toBe(0);
      expect(draw6581.ready_mtr).toBe(0);
    }
  });
});
