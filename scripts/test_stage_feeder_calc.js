const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

function getEnv() {
  const content = fs.readFileSync(path.resolve('.env.local'), 'utf8');
  const env = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq !== -1) {
      const k = trimmed.substring(0, eq).trim();
      let v = trimmed.substring(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      env[k] = v;
    }
  }
  return env;
}

global.WebSocket = class DummyWebSocket {};
const env = getEnv();
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
  realtime: { createClient: () => null }
});

function mtFromMtr(mtr, od, wt) {
  if (!mtr || !od || !wt) return 0;
  return Number((((od - wt) * wt * 0.0246615 * mtr) / 1000).toFixed(3));
}

async function main() {
  const { data: wipRows } = await supabase.from('vw_route_stage_wip').select('*');
  const { data: plans } = await supabase.from('rolling_plans').select('id, work_order_id, planned_qty, status');
  const { data: rollingLogs } = await supabase.from('production_logs').select('work_order_id, output_qty, remarks, stages:stage_id(code:id)');

  // Test for each stage code:
  const stageCodes = ['ROLLING', 'HOLLOW_HEAT_TREATMENT', 'DRAW', 'HEAT_TREATMENT', 'BAND_SAW', 'VDI', 'FINISHING'];

  const lastWcNameMap = {
    ROLLING: 'PPC Rolling Plan',
    HOLLOW_HEAT_TREATMENT: 'Hot Rolling Mill',
    DRAW: 'Rolling / Hollow HT',
    HEAT_TREATMENT: 'Cold Draw Bench',
    BAND_SAW: 'Final Heat Treatment',
    VDI: 'Band Saw Cutting',
    FINISHING: 'VDI',
    ALL: 'Upstream Feed / Plan'
  };

  const results = {};

  for (const sc of stageCodes) {
    const lastWcName = lastWcNameMap[sc];

    if (sc === 'ROLLING') {
      let totalPlanMtr = 0;
      let totalPlanPcs = 0;
      let totalPlanMt = 0;

      let rolledMtr = 0;
      let rolledPcs = 0;

      plans.forEach(p => {
        const st = typeof p.status === 'object' && p.status !== null ? p.status : {};
        const pMtr = Number(p.planned_qty || st.planned_mtr || 0);
        const pPcs = Number(st.planned_pcs || st.plan_qty?.nos || (pMtr > 0 ? Math.round(pMtr / 6) : 0));
        const od = Number(st.mh_od || st.cust_od || 60);
        const wt = Number(st.mh_wt || st.cust_wt || 4);
        totalPlanMtr += pMtr;
        totalPlanPcs += pPcs;
        totalPlanMt += mtFromMtr(pMtr, od, wt);
      });

      rollingLogs.forEach(l => {
        rolledMtr += Number(l.output_qty || 0);
        const m = l.remarks?.match(/\[PCS:\s*(\d+)\]/i);
        if (m) rolledPcs += parseInt(m[1], 10);
      });

      const balMtr = Math.max(0, totalPlanMtr - rolledMtr);
      const balPcs = Math.max(0, totalPlanPcs - rolledPcs);
      const balMt = Math.max(0, totalPlanMt - mtFromMtr(rolledMtr, 60, 4));

      results[sc] = {
        lastWcName,
        receivedPcs: totalPlanPcs,
        receivedMtr: totalPlanMtr,
        receivedMt: Number(totalPlanMt.toFixed(2)),
        balancePcs: balPcs,
        balanceMtr: balMtr,
        balanceMt: Number(balMt.toFixed(2))
      };
    } else {
      const rows = wipRows.filter(r => r.stage_code === sc);
      let recMtr = 0;
      let recPcs = 0;
      let recMt = 0;

      let balMtr = 0;
      let balPcs = 0;
      let balMt = 0;

      rows.forEach(r => {
        const inMtr = Number(r.incoming_qty || 0);
        const curWipMtr = Number(r.current_wip || 0);
        const curWipPcs = Number(r.current_wip_pcs || 0);
        const curWipMt = Number(r.current_wip_mt || 0);

        const avgLen = curWipPcs > 0 && curWipMtr > 0 ? curWipMtr / curWipPcs : 6.0;
        const inPcs = avgLen > 0 ? Math.round(inMtr / avgLen) : 0;
        const inMt = mtFromMtr(inMtr, Number(r.size_od || 60), Number(r.size_wt || 4));

        recMtr += inMtr;
        recPcs += inPcs;
        recMt += inMt;

        balMtr += curWipMtr;
        balPcs += curWipPcs;
        balMt += curWipMt;
      });

      results[sc] = {
        lastWcName,
        receivedPcs: recPcs,
        receivedMtr: Number(recMtr.toFixed(1)),
        receivedMt: Number(recMt.toFixed(2)),
        balancePcs: balPcs,
        balanceMtr: Number(balMtr.toFixed(1)),
        balanceMt: Number(balMt.toFixed(2))
      };
    }
  }

  console.table(results);
}

main().catch(console.error);
