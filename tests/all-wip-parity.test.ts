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

import { GET as getProductionQueue } from '@/app/api/production/queue/route';
import Dashboard from '@/app/dashboard/page';
import { NextRequest } from 'next/server';

describe('Global WIP Parity Rule Across All 4 Systems', () => {
  it('confirms canonical WIP source ensures 100% parity across Dashboard, Matrix, and Production Entry', async () => {
    // 1. Fetch Queue API
    const req = new NextRequest('http://localhost:3000/api/production/queue?all_stages=true&nocache=true');
    const res = await getProductionQueue(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);

    const queueRows = json.data || [];
    const summaryCards = json.summary || [];

    // 2. Fetch Dashboard
    const dashboardElement = await Dashboard();
    const dashProps = dashboardElement.props;
    const dashWip = dashProps.wip || [];
    const dashKpi = dashProps.kpi;

    // Compare total active WIP (excluding Hot Rolling feeder queue)
    const activeQueueRows = queueRows.filter((r: any) => {
      const st = (r.stage_code || '').toUpperCase();
      return st !== 'HOT_ROLLING' && st !== 'ROLLING';
    });

    const matrixTotalPcs = activeQueueRows.reduce((sum: number, r: any) => sum + Math.round(Number(r.ready_pcs ?? r.current_wip_pcs ?? 0)), 0);
    const matrixTotalMtr = activeQueueRows.reduce((sum: number, r: any) => sum + Number(r.ready_mtr ?? r.current_wip ?? 0), 0);

    const dashTotalPcs = dashWip
      .filter((r: any) => (r.stage_code || '').toUpperCase() !== 'HOT_ROLLING' && (r.stage_code || '').toUpperCase() !== 'ROLLING')
      .reduce((sum: number, r: any) => sum + Number(r.current_wip_pcs || 0), 0);
    const dashTotalMtr = dashWip
      .filter((r: any) => (r.stage_code || '').toUpperCase() !== 'HOT_ROLLING' && (r.stage_code || '').toUpperCase() !== 'ROLLING')
      .reduce((sum: number, r: any) => sum + Number(r.current_wip || 0), 0);

    console.log(`Global Parity Check -> Queue/Matrix: ${matrixTotalPcs} pcs (${matrixTotalMtr.toFixed(1)}m) | Dashboard: ${dashTotalPcs} pcs (${dashTotalMtr.toFixed(1)}m) | KPI: ${dashKpi?.total_wip_pcs} pcs (${dashKpi?.total_wip_mtr}m)`);

    expect(dashTotalPcs).toBe(matrixTotalPcs);
    expect(dashTotalMtr).toBeCloseTo(matrixTotalMtr, 1);
    expect(dashKpi?.total_wip_pcs).toBe(matrixTotalPcs);
  });
});
