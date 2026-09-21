// scripts/audit_alloy_wip.cjs
const SUPABASE_URL = "https://dzhvbftmuwfyuaarsxtk.supabase.co/rest/v1";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6aHZiZnRtdXdmeXVhYXJzeHRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzUwOTYzNywiZXhwIjoyMTAzMDg1NjM3fQ.jtkcZxBOmgEEHvBzGIHYdPpzJf2zA5xfdJZ6XuDSmds";
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };

function mtFromMtr(mtr, od, wt) {
  if (!mtr || !od || !wt || od <= wt) return 0;
  return mtr * (od - wt) * wt * 0.0246615 * 0.001;
}

function getLogPcs(log, avgLen) {
  if (log.remarks && log.remarks.includes('[PCS:')) {
    const m = log.remarks.match(/\[PCS:\s*(\d+)\]/i);
    if (m && m[1]) return parseInt(m[1], 10);
  }
  const out = Number(log.output_qty || 0);
  return avgLen > 0 ? Math.round(out / avgLen) : 0;
}

async function auditAlloy() {
  const [woRes, plRes, rpRes, prRes, wipRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/work_orders?select=id,work_order_no,customer_name,grade,specification,ordered_qty_mt,ordered_qty_mtr,size_od,size_wt,l1,l2`, { headers }).then(r => r.json()),
    fetch(`${SUPABASE_URL}/production_logs?select=id,work_order_id,stage_id,output_qty,rejection_qty,htc_ok,remarks,process_stages(stage_code,stage_name)`, { headers }).then(r => r.json()),
    fetch(`${SUPABASE_URL}/rolling_plans?select=work_order_id,planned_qty,mh_od,mh_wt,mh_l1,mh_l2,process_route_id,status,process_routes(route_code,route_name)`, { headers }).then(r => r.json()),
    fetch(`${SUPABASE_URL}/process_routes?select=id,route_code,route_name`, { headers }).then(r => r.json()),
    fetch(`${SUPABASE_URL}/vw_route_stage_wip?select=work_order_id,stage_code,current_wip,current_wip_pcs,current_wip_mt,available_mt`, { headers }).then(r => r.json())
  ]);

  const workOrders = Array.isArray(woRes) ? woRes : [];
  const prodLogs = Array.isArray(plRes) ? plRes : [];
  const rollingPlans = Array.isArray(rpRes) ? rpRes : [];
  const processRoutes = Array.isArray(prRes) ? prRes : [];
  const rawWipRows = Array.isArray(wipRes) ? wipRes : [];

  const routeMap = new Map();
  processRoutes.forEach(r => routeMap.set(r.id, r));

  const rpMap = new Map();
  rollingPlans.forEach(rp => {
    if (!rpMap.has(rp.work_order_id)) rpMap.set(rp.work_order_id, rp);
  });

  const plByWo = new Map();
  prodLogs.forEach(pl => {
    if (!plByWo.has(pl.work_order_id)) plByWo.set(pl.work_order_id, []);
    plByWo.get(pl.work_order_id).push(pl);
  });

  const rawWipByWo = new Map();
  rawWipRows.forEach(w => {
    if (!rawWipByWo.has(w.work_order_id)) rawWipByWo.set(w.work_order_id, []);
    rawWipByWo.get(w.work_order_id).push(w);
  });

  console.log('='.repeat(95));
  console.log('ALLOY STEEL WIP AUDIT: OLD UNRECONCILED WIP vs CORRECTED PCS ROUTE-AWARE WIP');
  console.log('='.repeat(95));

  let totalOldMt = 0;
  let totalCorrectMt = 0;
  let totalCorrectPcs = 0;
  let totalChargedMt = 0;

  const alloyWos = [];

  workOrders.forEach(wo => {
    const rp = rpMap.get(wo.id);
    const rCode = rp?.process_routes?.route_code || (wo.process_route_id && routeMap.get(wo.process_route_id)?.route_code) || '';
    const grade = (wo.grade || wo.specification || '').toUpperCase();
    const isAlloy = rCode.includes('ALLOY') || /P11|P22|P91|T11|T22|T91|4130|4140|SA213|SA335|16MO3|13CRMO|10CRMO|15CRMO/i.test(grade);

    if (!isAlloy) return;

    const logs = plByWo.get(wo.id) || [];
    const rollLogs = logs.filter(l => l.process_stages?.stage_code === 'ROLLING');
    const hhtLogs = logs.filter(l => l.process_stages?.stage_code === 'HOLLOW_HEAT_TREATMENT');
    const drawLogs = logs.filter(l => l.process_stages?.stage_code === 'DRAW');
    const htLogs = logs.filter(l => l.process_stages?.stage_code === 'HEAT_TREATMENT');

    const mhOd = Number(rp?.mh_od || wo.size_od || 0);
    const mhWt = Number(rp?.mh_wt || wo.size_wt || 0);
    const mhAvgLen = Number(rp?.mh_l1 && rp?.mh_l2 ? (Number(rp.mh_l1) + Number(rp.mh_l2)) / 2 : rp?.mh_l1 || 6.0);

    const orderOd = Number(wo.size_od || 0);
    const orderWt = Number(wo.size_wt || 0);
    const orderAvgLen = Number(wo.l1 && wo.l2 ? (Number(wo.l1) + Number(wo.l2)) / 2 : wo.l1 || 6.0);

    let rollPcs = 0, rollMtr = 0;
    rollLogs.forEach(l => {
      rollMtr += Number(l.output_qty || 0);
      rollPcs += getLogPcs(l, mhAvgLen);
    });

    let hhtPcs = 0;
    hhtLogs.forEach(l => {
      hhtPcs += getLogPcs(l, mhAvgLen);
    });

    let drawPcs = 0, drawMtr = 0;
    drawLogs.forEach(l => {
      drawMtr += Number(l.output_qty || 0);
      drawPcs += getLogPcs(l, orderAvgLen * 1.8);
    });
    if (drawPcs === 0 && drawMtr > 0) {
      drawPcs = Math.round(drawMtr / (orderAvgLen * 1.8));
    }

    let htPcs = 0;
    htLogs.forEach(l => {
      htPcs += getLogPcs(l, orderAvgLen);
    });

    // Old Unreconciled WIP (sum of raw current_wip_mt or current_wip including rolling)
    const rawWipRows = rawWipByWo.get(wo.id) || [];
    let oldWoMt = 0;
    rawWipRows.forEach(r => {
      oldWoMt += Number(r.current_wip_mt || r.available_mt || 0);
    });

    const unitWtMother = (mhOd - mhWt) * mhWt * 0.0246615 * 0.001;
    const unitWtFinish = (orderOd - orderWt) * orderWt * 0.0246615 * 0.001;

    // Charged Billet MT from Rolling
    const chargedMt = rollMtr > 0 ? rollMtr * unitWtMother : rollPcs * mhAvgLen * unitWtMother;

    // Correct Route-Aware WIP for ALLOY_CDS:
    // Route: ROLLING (Feeder: 0 WIP) -> HOLLOW_HEAT_TREATMENT -> DRAW -> FINAL_HT -> BAND_SAW -> VDI -> FINISHING
    // 1. Hollow HT Queue: rollPcs - hhtPcs
    const hhtQueuePcs = Math.max(0, rollPcs - hhtPcs);
    const hhtQueueMt = hhtQueuePcs * mhAvgLen * unitWtMother;

    // 2. Draw Bench Queue: hhtPcs - drawPcs
    const drawQueuePcs = Math.max(0, hhtPcs - drawPcs);
    const drawQueueMt = drawQueuePcs * mhAvgLen * unitWtMother;

    // 3. Final HT Queue: drawPcs - htPcs
    const htQueuePcs = Math.max(0, drawPcs - htPcs);
    const htQueueMt = htQueuePcs * (orderAvgLen * 1.8) * unitWtFinish;

    // 4. Band Saw Queue: htPcs
    const bsQueuePcs = htPcs;
    const bsQueueMt = bsQueuePcs * orderAvgLen * unitWtFinish;

    let correctWoPcs = hhtQueuePcs + drawQueuePcs + htQueuePcs + bsQueuePcs;
    let correctWoMt = hhtQueueMt + drawQueueMt + htQueueMt + bsQueueMt;
    if (chargedMt > 0 && correctWoMt > chargedMt) {
      correctWoMt = chargedMt;
    }

    totalOldMt += oldWoMt;
    totalCorrectMt += correctWoMt;
    totalCorrectPcs += correctWoPcs;
    totalChargedMt += chargedMt;

    if (rollPcs > 0 || drawPcs > 0 || hhtPcs > 0 || oldWoMt > 0) {
      alloyWos.push({
        wo_no: wo.work_order_no,
        grade: wo.grade || wo.specification || 'Alloy',
        route: rCode || 'ALLOY_CDS',
        finish_size: `${orderOd}x${orderWt}`,
        mh_size: `${mhOd}x${mhWt}`,
        rolled_pcs: rollPcs,
        charged_mt: chargedMt.toFixed(2),
        hht_q_pcs: hhtQueuePcs,
        draw_q_pcs: drawQueuePcs,
        ht_q_pcs: htQueuePcs,
        correct_pcs: correctWoPcs,
        old_wip_mt: oldWoMt.toFixed(2),
        correct_wip_mt: correctWoMt.toFixed(2),
        diff_mt: (oldWoMt - correctWoMt).toFixed(2)
      });
    }
  });

  console.log(`Found ${alloyWos.length} active Alloy Steel Work Orders.\n`);
  console.table(alloyWos);

  console.log('\n' + '='.repeat(95));
  console.log('ALLOY STEEL SUMMARY COMPARISON:');
  console.log('-'.repeat(95));
  console.log(`Total Steel Charged into Mill (Hot Rolling):       ${totalChargedMt.toFixed(2)} MT`);
  console.log(`Old Unreconciled WIP (with double-count & rolling): ${totalOldMt.toFixed(2)} MT`);
  console.log(`Correct Route-Aware Plant WIP (Post-Rolling only):   ${totalCorrectMt.toFixed(2)} MT | ${totalCorrectPcs} PCS`);
  console.log(`Phantom Inflation Removed:                          ${(totalOldMt - totalCorrectMt).toFixed(2)} MT`);
  console.log('='.repeat(95));
}

auditAlloy();
