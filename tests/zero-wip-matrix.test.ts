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

describe('Verify 0 WIP filtering in Size-Grade WIP Matrix', () => {
  it('verifies matrix groups with total_pcs > 0 || total_mtr > 0 eliminate all 0-WIP rows', async () => {
    const req = new Request('http://localhost:3000/api/production/queue?all_stages=true&refresh=true');
    const res = await GET(req as any);
    const json = await res.json();
    const queueRows = json.data || [];

    // Simulate SizeGradeWipReportClient matrixGroups
    const groups = new Map<string, any>();
    for (const r of queueRows) {
      const od = Number(r.od || 0);
      const wt = Number(r.wall_thickness || r.wt || 0);
      const grade = r.grade || 'Unknown';
      const key = `${od}-${wt}-${grade}`;
      if (!groups.has(key)) {
        groups.set(key, { od, wt, grade, total_pcs: 0, total_mtr: 0, total_mt: 0, rolling_pcs: 0, rowCount: 0 });
      }
      const g = groups.get(key)!;
      const st = (r.stage_code || '').toUpperCase();
      const isRolling = st === 'HOT_ROLLING' || st === 'ROLLING';
      const pcs = isRolling ? Math.round(Number(r.rolled_pcs ?? 0)) : Math.round(Number(r.ready_pcs ?? r.current_wip_pcs ?? 0));
      const mtr = isRolling ? Number(r.rolled_mtr ?? 0) : Number(r.ready_mtr ?? r.current_wip ?? 0);
      const mt = isRolling ? Number(r.rolled_mt ?? 0) : Number(r.ready_mt ?? r.available_mt ?? 0);

      g.rowCount++;
      if (isRolling) {
        g.rolling_pcs += pcs;
      } else {
        g.total_pcs += pcs;
        g.total_mtr += mtr;
        g.total_mt += mt;
      }
    }

    const allGroups = Array.from(groups.values());
    const filteredGroups = allGroups.filter((g) => g.total_pcs > 0 || g.total_mtr > 0);

    console.log(`Original total groups: ${allGroups.length}`);
    console.log(`Filtered active WIP groups: ${filteredGroups.length}`);
    console.log(`Removed 0-WIP groups: ${allGroups.length - filteredGroups.length}`);

    // Every filtered group must have positive active WIP
    for (const g of filteredGroups) {
      expect(g.total_pcs > 0 || g.total_mtr > 0).toBe(true);
    }

    // Verify sum of filtered groups still exactly equals Dashboard total WIP
    let filteredTotalPcs = 0;
    let filteredTotalMtr = 0;
    let filteredTotalMt = 0;
    for (const g of filteredGroups) {
      filteredTotalPcs += g.total_pcs;
      filteredTotalMtr += g.total_mtr;
      filteredTotalMt += g.total_mt;
    }

    const dashboardElement = await Dashboard();
    const dashKpi = dashboardElement.props.kpi;

    expect(filteredTotalPcs).toBe(dashKpi.total_wip_pcs);
    expect(filteredTotalMtr).toBeCloseTo(dashKpi.total_wip_mtr, 1);
    expect(filteredTotalMt).toBeCloseTo(dashKpi.total_wip_mt, 1);
  }, 30000);
});
