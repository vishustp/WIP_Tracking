import { describe, it, expect } from 'vitest';
import { GET } from '../app/api/production/queue/route';
import { transformQueueDataToAgingRows } from '../lib/reports/agingReportHelper';
import { NextRequest } from 'next/server';

describe('WO 6278 in Aging Report', () => {
  it('confirms WO 6278 is NOT in Queue API data and NOT in Aging rows', async () => {
    const req = new NextRequest('http://localhost:3000/api/production/queue?all_stages=true&nocache=true');
    const res = await GET(req);
    const json = await res.json();
    expect(json.success).toBe(true);

    const rows6278 = json.data?.filter((r: any) => r.work_order_no === '6278');
    expect(rows6278?.length).toBe(0);

    const agingRows = transformQueueDataToAgingRows(json.data);
    const aging6278 = agingRows.filter((r) => r.work_order_no === '6278');
    expect(aging6278.length).toBe(0);
  });
});
