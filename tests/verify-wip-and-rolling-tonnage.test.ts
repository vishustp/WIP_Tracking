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

import { createClient } from '@supabase/supabase-js';
import { GET as getProductionQueue } from '@/app/api/production/queue/route';
import Dashboard from '@/app/dashboard/page';
import { mtFromMtr, extractPcsFromRemarks } from '@/lib/productionUtils';

describe('Audit: WIP Reconciliation Across Reports & Rolling Production Tonnage', () => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  it('1. Verifies 100% WIP consistency across Dashboard and Size-Grade WIP Matrix', async () => {
    // 1. Fetch Queue API (used by Size-Grade WIP Matrix)
    const queueReq = new Request('http://localhost:3000/api/production/queue?all_stages=true&refresh=true');
    const queueRes = await getProductionQueue(queueReq as any);
    const queueJson = await queueRes.json();
    const queueRows = queueJson.data || [];

    // Filter out hollow bank & rolling display-only rows for active WIP
    const activeQueueRows = queueRows.filter((r: any) => {
      const st = (r.stage_code || '').toUpperCase();
      return st !== 'HOT_ROLLING' && st !== 'ROLLING';
    });

    const matrixByStage: Record<string, { pcs: number; mtr: number; mt: number }> = {};
    let matrixTotalPcs = 0;
    let matrixTotalMtr = 0;
    let matrixTotalMt = 0;

    for (const r of activeQueueRows) {
      const st = (r.stage_code || '').toUpperCase();
      const pcs = Math.round(Number(r.ready_pcs ?? r.current_wip_pcs ?? 0));
      const mtr = Number(Number(r.ready_mtr ?? r.current_wip ?? 0).toFixed(2));
      const mt = Number(Number(r.ready_mt ?? r.available_mt ?? 0).toFixed(2));

      if (!matrixByStage[st]) matrixByStage[st] = { pcs: 0, mtr: 0, mt: 0 };
      matrixByStage[st].pcs += pcs;
      matrixByStage[st].mtr += mtr;
      matrixByStage[st].mt += mt;

      matrixTotalPcs += pcs;
      matrixTotalMtr += mtr;
      matrixTotalMt += mt;
    }

    // 2. Fetch Dashboard data
    const dashboardElement = await Dashboard();
    const dashboardProps = dashboardElement.props;
    const dashKpi = dashboardProps.kpi;
    const dashWip = dashboardProps.wip || [];

    const dashByStage: Record<string, { pcs: number; mtr: number; mt: number }> = {};
    let dashTotalPcs = 0;
    let dashTotalMtr = 0;
    let dashTotalMt = 0;

    for (const r of dashWip) {
      const st = (r.stage_code || '').toUpperCase();
      if (st === 'HOT_ROLLING' || st === 'ROLLING') continue;
      const pcs = Number(r.current_wip_pcs || 0);
      const mtr = Number(r.current_wip || 0);
      const mt = Number(r.current_wip_mt || 0);

      if (!dashByStage[st]) dashByStage[st] = { pcs: 0, mtr: 0, mt: 0 };
      dashByStage[st].pcs += pcs;
      dashByStage[st].mtr += mtr;
      dashByStage[st].mt += mt;

      dashTotalPcs += pcs;
      dashTotalMtr += mtr;
      dashTotalMt += mt;
    }

    console.log('--- Matrix by Stage ---', matrixByStage);
    console.log('--- Dashboard by Stage ---', dashByStage);
    console.log(`Totals -> Matrix: ${matrixTotalPcs} pcs, ${matrixTotalMtr.toFixed(1)}m, ${matrixTotalMt.toFixed(1)} MT | Dashboard: ${dashTotalPcs} pcs, ${dashTotalMtr.toFixed(1)}m, ${dashTotalMt.toFixed(1)} MT | KPI: ${dashKpi?.total_wip_pcs} pcs, ${dashKpi?.total_wip_mtr}m, ${dashKpi?.total_wip_mt} MT`);

    // Verify 100% parity between Dashboard and Matrix
    expect(dashTotalPcs).toBe(matrixTotalPcs);
    expect(dashTotalMtr).toBeCloseTo(matrixTotalMtr, 1);
    expect(dashTotalMt).toBeCloseTo(matrixTotalMt, 1);
    expect(dashKpi?.total_wip_pcs).toBe(matrixTotalPcs);
    expect(dashKpi?.total_wip_mtr).toBeCloseTo(matrixTotalMtr, 1);
    expect(dashKpi?.total_wip_mt).toBeCloseTo(matrixTotalMt, 1);
  }, 30000);

  it('2. Verifies Rolling Production Tonnage calculation using Mother Hollow dimensions', async () => {
    // Fetch production logs for Hot Rolling and Rolling
    const { data: logs, error } = await supabase
      .from('production_logs')
      .select('*, process_stages(stage_code, stage_name)')
      .order('process_date', { ascending: false });

    expect(error).toBeNull();
    expect(logs).toBeDefined();

    const rollingLogs = (logs || []).filter((l: any) => {
      const code = (l.process_stages?.stage_code || l.stage_code || '').toUpperCase();
      return code === 'HOT_ROLLING' || code === 'ROLLING';
    });

    // Fetch work orders and rolling plans for mother hollow specifications
    const { data: wos } = await supabase.from('work_orders').select('*');
    const { data: plans } = await supabase.from('rolling_plans').select('*');

    const woMap = new Map<string, any>((wos || []).map((w: any) => [w.id, w]));
    const planMap = new Map<string, any>();
    (plans || []).forEach((p: any) => {
      if (p.work_order_id) planMap.set(p.work_order_id, p);
    });

    let totalRolledMtr = 0;
    let totalRolledPcs = 0;
    let totalRolledMtWithMh = 0;
    let totalRolledMtWithFinished = 0;
    let countUsingMh = 0;
    let countUsingFinished = 0;

    for (const log of rollingLogs) {
      const wo = woMap.get(log.work_order_id);
      const plan = planMap.get(log.work_order_id);

      let mhOd = Number(plan?.mh_od || 0);
      let mhWt = Number(plan?.mh_wt || 0);
      if (!mhOd || !mhWt) {
        try {
          const parsed = typeof plan?.status === 'string' ? JSON.parse(plan.status) : plan?.status;
          mhOd = Number(parsed?.mh_od || parsed?.cust_od || parsed?.sm?.cust_od || 0);
          mhWt = Number(parsed?.mh_wt || parsed?.cust_wt || parsed?.sm?.rolling_wt || 0);
        } catch {}
      }

      const finOd = Number(wo?.size_od || 0);
      const finWt = Number(wo?.size_wt || 0);

      const effectiveOd = mhOd > 0 ? mhOd : finOd;
      const effectiveWt = mhWt > 0 ? mhWt : finWt;

      if (mhOd > 0 && mhWt > 0) {
        countUsingMh++;
      } else {
        countUsingFinished++;
      }

      const mtr = Number(log.output_qty || 0);
      const { pcs: pPcs } = extractPcsFromRemarks(log.remarks);
      const pcs = pPcs ?? Number(log.output_pcs || 0);

      totalRolledMtr += mtr;
      totalRolledPcs += pcs;

      const mtMh = mtFromMtr(mtr, effectiveOd, effectiveWt);
      const mtFin = mtFromMtr(mtr, finOd, finWt);

      totalRolledMtWithMh += mtMh;
      totalRolledMtWithFinished += mtFin;
    }

    console.log(`Rolling Production Summary across ${rollingLogs.length} logs:`);
    console.log(`  Total Rolled Meters: ${totalRolledMtr.toFixed(2)} m`);
    console.log(`  Total Rolled Pieces: ${totalRolledPcs} pcs`);
    console.log(`  Total Rolled MT (Mother Hollow Size): ${totalRolledMtWithMh.toFixed(2)} MT (used in ${countUsingMh} logs)`);
    console.log(`  Total Rolled MT (Finished Customer Size): ${totalRolledMtWithFinished.toFixed(2)} MT`);

    expect(totalRolledMtr).toBeGreaterThan(0);
    expect(totalRolledMtWithMh).toBeGreaterThan(0);
    expect(countUsingMh).toBeGreaterThan(0);
  }, 30000);

  it('3. Verifies Band Saw WIP in Queue API matches physical uncut mother pipes for WO 6579, 6625, 6626', async () => {
    const queueReq = new Request('http://localhost:3000/api/production/queue?all_stages=true&refresh=true');
    const queueRes = await getProductionQueue(queueReq as any);
    const queueJson = await queueRes.json();
    const queueRows = queueJson.data || [];

    // WO 6579: 1754 HTC OK - 1576 cut = 178 mother pipes at Band Saw
    const bs6579 = queueRows.find((r: any) => String(r.work_order_no).includes('6579') && r.stage_code === 'BAND_SAW');
    expect(bs6579).toBeDefined();
    expect(bs6579.ready_pcs).toBe(128);

    // WO 6625: 149 HTC OK - 0 cut = 149 mother pipes at Band Saw
    const bs6625 = queueRows.find((r: any) => String(r.work_order_no).includes('6625') && r.stage_code === 'BAND_SAW');
    expect(bs6625).toBeDefined();
    expect(bs6625.ready_pcs).toBe(149);

    // WO 6626: 223 HTC OK - 223 cut = 0 mother pipes at Band Saw (fully cut)
    const bs6626 = queueRows.find((r: any) => String(r.work_order_no).includes('6626') && r.stage_code === 'BAND_SAW');
    expect(bs6626 === undefined || bs6626.ready_pcs === 0).toBe(true);

    // WO 6579 at VDI: 1576 cut - inspected: if pending inspection, <= 60 pcs at VDI
    const vdi6579 = queueRows.find((r: any) => String(r.work_order_no).includes('6579') && r.stage_code === 'VDI');
    if (vdi6579) {
      expect(vdi6579.ready_pcs).toBeLessThanOrEqual(60);
    }
  });
});
