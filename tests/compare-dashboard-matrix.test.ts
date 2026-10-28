import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

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

import { GET } from '@/app/api/production/queue/route';
import Dashboard from '@/app/dashboard/page';

describe('Compare Dashboard vs Matrix WIP', () => {
  it('confirms 100% parity between Dashboard and Size-Grade WIP Matrix totals', async () => {
    // 1. Matrix logic via Queue API:
    const req = new Request('http://localhost:3000/api/production/queue?all_stages=true&refresh=true');
    const res = await GET(req as any);
    const json = await res.json();
    const queueRows = json.data || [];

    let matrixTotalMtr = 0;
    let matrixTotalPcs = 0;
    let matrixTotalMt = 0;

    for (const r of queueRows) {
      const st = (r.stage_code || '').toUpperCase();
      const isRolling = st === 'HOT_ROLLING' || st === 'ROLLING';
      const pcs = isRolling ? Math.round(Number(r.rolled_pcs ?? 0)) : Math.round(Number(r.ready_pcs ?? r.current_wip_pcs ?? 0));
      const mtr = isRolling ? Number(r.rolled_mtr ?? 0) : Number(r.ready_mtr ?? r.current_wip ?? 0);
      const mt = isRolling ? Number(r.rolled_mt ?? 0) : Number(r.ready_mt ?? r.available_mt ?? 0);

      if (!isRolling) {
        matrixTotalPcs += pcs;
        matrixTotalMtr += mtr;
        matrixTotalMt += mt;
      }
    }

    // 2. Dashboard logic via Dashboard component:
    const dashboardElement = await Dashboard();
    const dashboardProps = dashboardElement.props;
    const dashKpi = dashboardProps.kpi;
    const dashWip = dashboardProps.wip;

    let dashTotalPcs = 0;
    let dashTotalMtr = 0;
    let dashTotalMt = 0;

    for (const r of dashWip) {
      const st = (r.stage_code || '').toUpperCase();
      const pcs = Number(r.current_wip_pcs || 0);
      const mtr = Number(r.current_wip || 0);
      const mt = Number(r.current_wip_mt || 0);

      if (st !== 'HOT_ROLLING' && st !== 'ROLLING') {
        dashTotalPcs += pcs;
        dashTotalMtr += mtr;
        dashTotalMt += mt;
      }
    }

    // Assert exact match between Dashboard and Matrix
    expect(dashKpi?.total_wip_pcs).toBe(matrixTotalPcs);
    expect(dashKpi?.total_wip_mtr).toBeCloseTo(matrixTotalMtr, 1);
    expect(dashKpi?.total_wip_mt).toBeCloseTo(matrixTotalMt, 1);
    expect(dashTotalPcs).toBe(matrixTotalPcs);
    expect(dashTotalMtr).toBeCloseTo(matrixTotalMtr, 1);
    expect(dashTotalMt).toBeCloseTo(matrixTotalMt, 1);
  }, 30000);
});
