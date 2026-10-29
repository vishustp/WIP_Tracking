import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Load .env.local
try {
  const envContent = fs.readFileSync(path.resolve(process.cwd(), '.env.local'), 'utf8');
  envContent.split('\n').forEach((line) => {
    const idx = line.indexOf('=');
    if (idx > 0) {
      const k = line.slice(0, idx).trim();
      const v = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
      if (!process.env[k]) process.env[k] = v;
    }
  });
} catch {}

import { GET as getProductionQueue } from '@/app/api/production/queue/route';

describe('WO 6354 Heat Treatment Queue Availability', () => {
  it('ensures WO 6354 is available in Heat Treatment queue with 40 pieces from Draw output', async () => {
    const queueReq = new Request('http://localhost:3000/api/production/queue?stage=HEAT_TREATMENT&refresh=true');
    const queueRes = await getProductionQueue(queueReq as any);
    const queueJson = await queueRes.json();
    const rows = queueJson.data || [];

    const wo6354Row = rows.find((r: any) => r.work_order_no === '6354');
    expect(wo6354Row).toBeDefined();
    expect(Number(wo6354Row.ready_pcs ?? wo6354Row.balance_to_make_pcs)).toBe(40);
    expect(Number(wo6354Row.ready_mtr ?? wo6354Row.balance_to_make_mtr)).toBeCloseTo(520, 1);
  });
});
