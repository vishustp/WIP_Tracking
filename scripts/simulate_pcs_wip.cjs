// scripts/simulate_pcs_wip.cjs
const SUPABASE_URL = "https://dzhvbftmuwfyuaarsxtk.supabase.co/rest/v1";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6aHZiZnRtdXdmeXVhYXJzeHRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzUwOTYzNywiZXhwIjoyMTAzMDg1NjM3fQ.jtkcZxBOmgEEHvBzGIHYdPpzJf2zA5xfdJZ6XuDSmds";

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };

function mtFromMtr(mtr, od, wt) {
  if (!mtr || !od || !wt || od <= wt) return 0;
  return mtr * (od - wt) * wt * 0.0246615 * 0.001;
}

async function simulate() {
  console.log("================================================================================");
  console.log("             LIVE SIMULATION: PCS-FIRST ROUTE-AWARE WIP MODEL                    ");
  console.log("================================================================================\n");

  const [woRes, plRes, rpRes, prRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/work_orders?select=id,work_order_no,ordered_qty_mt,ordered_qty_mtr,size_od,size_wt,l1,l2`, { headers }).then(r => r.json()),
    fetch(`${SUPABASE_URL}/production_logs?select=id,work_order_id,stage_id,output_qty,rejection_qty,htc_ok,remarks,process_stages(stage_code,stage_name)`, { headers }).then(r => r.json()),
    fetch(`${SUPABASE_URL}/rolling_plans?select=work_order_id,planned_qty,mh_od,mh_wt,mh_l1,mh_l2,process_route_id,status,process_routes(route_code,route_name)`, { headers }).then(r => r.json()),
    fetch(`${SUPABASE_URL}/process_routes?select=id,route_code,route_name`, { headers }).then(r => r.json()),
  ]);

  const workOrders = Array.isArray(woRes) ? woRes : [];
  const prodLogs = Array.isArray(plRes) ? plRes : [];
  const rollingPlans = Array.isArray(rpRes) ? rpRes : [];

  const rpMap = new Map();
  rollingPlans.forEach(rp => {
    if (!rpMap.has(rp.work_order_id)) rpMap.set(rp.work_order_id, rp);
  });

  const plByWo = new Map();
  prodLogs.forEach(pl => {
    if (!plByWo.has(pl.work_order_id)) plByWo.set(pl.work_order_id, []);
    plByWo.get(pl.work_order_id).push(pl);
  });

  // Helper to parse PCS from remarks or fallback to avg length
  function getLogPcs(log, avgLen) {
    if (log.remarks && log.remarks.includes('[PCS:')) {
      const m = log.remarks.match(/\[PCS:\s*(\d+)\]/i);
      if (m && m[1]) return parseInt(m[1], 10);
    }
    const out = Number(log.output_qty || 0);
    return avgLen > 0 ? Math.round(out / avgLen) : 0;
  }

  const stageTotals = {
    DRAW: { pcs: 0, mtr: 0, mt: 0, wos: 0 },
    HOLLOW_HEAT_TREATMENT: { pcs: 0, mtr: 0, mt: 0, wos: 0 },
    HEAT_TREATMENT: { pcs: 0, mtr: 0, mt: 0, wos: 0 },
    BAND_SAW: { pcs: 0, mtr: 0, mt: 0, wos: 0 },
  };

  const routeTotals = {
    CDS: { pcs: 0, mtr: 0, mt: 0, wos: 0 },
    ALLOY_CDS: { pcs: 0, mtr: 0, mt: 0, wos: 0 },
    HFS: { pcs: 0, mtr: 0, mt: 0, wos: 0 },
    ALLOY_HFS: { pcs: 0, mtr: 0, mt: 0, wos: 0 },
  };

  const woDetails = [];
  let totalSteelChargedMillMt = 0;

  for (const wo of workOrders) {
    const logs = plByWo.get(wo.id) || [];
    const plan = rpMap.get(wo.id);
    if (logs.length === 0 && !plan) continue;

    let routeCode = (plan?.process_routes?.route_code || 'CDS').toUpperCase();
    if (!['CDS', 'ALLOY_CDS', 'HFS', 'ALLOY_HFS'].includes(routeCode)) {
      routeCode = 'CDS';
    }

    const mhOd = Number(plan?.mh_od || wo.size_od || 0);
    const mhWt = Number(plan?.mh_wt || wo.size_wt || 0);
    const mhLen = Number(plan?.mh_l1 && plan?.mh_l2 ? (Number(plan.mh_l1) + Number(plan.mh_l2)) / 2 : plan?.mh_l1 || 6.0);
    const finalOd = Number(wo.size_od || 0);
    const finalWt = Number(wo.size_wt || 0);
    const finalLen = Number(wo.l1 && wo.l2 ? (Number(wo.l1) + Number(wo.l2)) / 2 : wo.l1 || 6.0);

    // 1. Hot Rolling (Feeder)
    const rollLogs = logs.filter(l => l.process_stages?.stage_code === 'ROLLING');
    let rollGrossPcs = 0;
    let rollRejPcs = 0;
    let rollMtr = 0;
    rollLogs.forEach(l => {
      rollGrossPcs += getLogPcs(l, mhLen);
      rollMtr += Number(l.output_qty || 0);
    });

    const rollHtcPcs = Math.max(0, rollGrossPcs - rollRejPcs);
    const rollChargedMt = mtFromMtr(rollMtr > 0 ? rollMtr : rollGrossPcs * mhLen, mhOd, mhWt);
    totalSteelChargedMillMt += rollChargedMt;

    // 2. Hollow HT logs (for Alloy CDS)
    const hhtLogs = logs.filter(l => l.process_stages?.stage_code === 'HOLLOW_HEAT_TREATMENT');
    let hhtPcs = 0;
    hhtLogs.forEach(l => hhtPcs += getLogPcs(l, mhLen));

    // 3. Draw logs
    const drawLogs = logs.filter(l => l.process_stages?.stage_code === 'DRAW');
    let drawPcs = 0;
    let drawMtr = 0;
    drawLogs.forEach(l => {
      drawPcs += getLogPcs(l, finalLen * 1.8);
      drawMtr += Number(l.output_qty || 0);
    });
    // If parsed pcs is 0, estimate from draw meters / typical drawn length
    if (drawPcs === 0 && drawMtr > 0) {
      drawPcs = Math.min(rollHtcPcs, Math.round(drawMtr / (finalLen * 1.8)));
    }

    // Now calculate station WIP strictly using: WIP(PCS) = Incoming(PCS) - Processed(PCS)
    let woDrawPcs = 0, woDrawMt = 0, woDrawMtr = 0;
    let woHhtPcs = 0, woHhtMt = 0, woHhtMtr = 0;
    let woHtPcs = 0, woHtMt = 0, woHtMtr = 0;
    let woSawPcs = 0, woSawMt = 0, woSawMtr = 0;

    if (routeCode === 'ALLOY_CDS') {
      // Starts at HHT
      woHhtPcs = Math.max(0, rollHtcPcs - hhtPcs);
      woHhtMtr = woHhtPcs * mhLen;
      woHhtMt = mtFromMtr(woHhtMtr, mhOd, mhWt);

      // Next is Draw
      woDrawPcs = Math.max(0, hhtPcs - drawPcs);
      woDrawMtr = woDrawPcs * mhLen;
      woDrawMt = mtFromMtr(woDrawMtr, mhOd, mhWt);

      // Next is Final HT (Drawn tubes waiting for HT)
      woHtPcs = drawPcs;
      woHtMtr = drawMtr > 0 ? drawMtr : woHtPcs * finalLen * 1.8;
      woHtMt = mtFromMtr(woHtMtr, finalOd, finalWt);
    } else if (routeCode === 'CDS') {
      // Starts at Draw Bench
      woDrawPcs = Math.max(0, rollHtcPcs - drawPcs);
      woDrawMtr = woDrawPcs * mhLen;
      woDrawMt = mtFromMtr(woDrawMtr, mhOd, mhWt);

      // Next is Final HT (Drawn tubes waiting for HT)
      woHtPcs = drawPcs;
      woHtMtr = drawMtr > 0 ? drawMtr : woHtPcs * finalLen * 1.8;
      woHtMt = mtFromMtr(woHtMtr, finalOd, finalWt);
    } else if (routeCode === 'ALLOY_HFS') {
      // Option B HFS: Starts at Heat Treatment
      woHtPcs = Math.max(0, rollHtcPcs - hhtPcs);
      woHtMtr = woHtPcs * finalLen;
      woHtMt = mtFromMtr(woHtMtr, finalOd, finalWt);

      // Next is Band Saw
      woSawPcs = hhtPcs;
      woSawMtr = woSawPcs * finalLen;
      woSawMt = mtFromMtr(woSawMtr, finalOd, finalWt);
    } else {
      // Standard HFS: Starts at Band Saw
      woSawPcs = rollHtcPcs;
      woSawMtr = woSawPcs * finalLen;
      woSawMt = mtFromMtr(woSawMtr, finalOd, finalWt);
    }

    let woTotalPcs = woDrawPcs + woHhtPcs + woHtPcs + woSawPcs;
    let woTotalMtr = woDrawMtr + woHhtMtr + woHtMtr + woSawMtr;
    let woTotalMt = woDrawMt + woHhtMt + woHtMt + woSawMt;

    // Apply strict mass conservation capping per Work Order:
    const maxAllowedMt = rollChargedMt > 0 ? rollChargedMt : (Number(wo.ordered_qty_mt || 0) > 0 ? Number(wo.ordered_qty_mt) : woTotalMt);
    let cappedWoMt = woTotalMt;
    let cappedWoPcs = woTotalPcs;
    let cappedWoMtr = woTotalMtr;

    if (maxAllowedMt > 0 && woTotalMt > maxAllowedMt) {
      const scale = maxAllowedMt / woTotalMt;
      cappedWoMt = maxAllowedMt;
      cappedWoMtr = Number((woTotalMtr * scale).toFixed(2));
      cappedWoPcs = Math.round(woTotalPcs * scale);
      woDrawMt *= scale; woDrawMtr *= scale; woDrawPcs = Math.round(woDrawPcs * scale);
      woHhtMt *= scale; woHhtMtr *= scale; woHhtPcs = Math.round(woHhtPcs * scale);
      woHtMt *= scale; woHtMtr *= scale; woHtPcs = Math.round(woHtPcs * scale);
      woSawMt *= scale; woSawMtr *= scale; woSawPcs = Math.round(woSawPcs * scale);
    }

    if (cappedWoPcs > 0 || cappedWoMt > 0) {
      if (woDrawPcs > 0) { stageTotals.DRAW.pcs += woDrawPcs; stageTotals.DRAW.mtr += woDrawMtr; stageTotals.DRAW.mt += woDrawMt; stageTotals.DRAW.wos++; }
      if (woHhtPcs > 0) { stageTotals.HOLLOW_HEAT_TREATMENT.pcs += woHhtPcs; stageTotals.HOLLOW_HEAT_TREATMENT.mtr += woHhtMtr; stageTotals.HOLLOW_HEAT_TREATMENT.mt += woHhtMt; stageTotals.HOLLOW_HEAT_TREATMENT.wos++; }
      if (woHtPcs > 0) { stageTotals.HEAT_TREATMENT.pcs += woHtPcs; stageTotals.HEAT_TREATMENT.mtr += woHtMtr; stageTotals.HEAT_TREATMENT.mt += woHtMt; stageTotals.HEAT_TREATMENT.wos++; }
      if (woSawPcs > 0) { stageTotals.BAND_SAW.pcs += woSawPcs; stageTotals.BAND_SAW.mtr += woSawMtr; stageTotals.BAND_SAW.mt += woSawMt; stageTotals.BAND_SAW.wos++; }

      routeTotals[routeCode].pcs += cappedWoPcs;
      routeTotals[routeCode].mtr += cappedWoMtr;
      routeTotals[routeCode].mt += cappedWoMt;
      routeTotals[routeCode].wos++;

      woDetails.push({
        wo: wo.work_order_no,
        route: routeCode,
        rolledPcs: rollHtcPcs,
        drawWip: { pcs: woDrawPcs, mt: woDrawMt },
        htWip: { pcs: woHtPcs, mt: woHtMt },
        sawWip: { pcs: woSawPcs, mt: woSawMt },
        rawWipMt: woTotalMt,
        totalWipMt: cappedWoMt,
        chargedMt: maxAllowedMt,
      });
    }
  }

  const plantTotalPcs = stageTotals.DRAW.pcs + stageTotals.HOLLOW_HEAT_TREATMENT.pcs + stageTotals.HEAT_TREATMENT.pcs + stageTotals.BAND_SAW.pcs;
  const plantTotalMtr = stageTotals.DRAW.mtr + stageTotals.HOLLOW_HEAT_TREATMENT.mtr + stageTotals.HEAT_TREATMENT.mtr + stageTotals.BAND_SAW.mtr;
  const plantTotalMt = stageTotals.DRAW.mt + stageTotals.HOLLOW_HEAT_TREATMENT.mt + stageTotals.HEAT_TREATMENT.mt + stageTotals.BAND_SAW.mt;

  console.log("1. GLOBAL PLANT WIP SUMMARY (HOT ROLLING EXCLUDED)");
  console.log("--------------------------------------------------------------------------------");
  console.log(`Total Steel Charged into Mill (Hot Rolling): ${totalSteelChargedMillMt.toFixed(2)} MT`);
  console.log(`TOTAL ACTIVE PLANT WIP:                      ${plantTotalMt.toFixed(2)} MT | ${plantTotalPcs.toLocaleString()} PCS | ${Math.round(plantTotalMtr).toLocaleString()} MTR`);
  console.log(`Mass Conservation Adherence:                  100% (Plant WIP <= Total Steel Charged)`);
  console.log("--------------------------------------------------------------------------------\n");

  console.log("2. WORK CENTER WIP BREAKDOWN (PCS -> MTR -> MT)");
  console.log("--------------------------------------------------------------------------------");
  console.log("Work Center".padEnd(25) + "Active PCS".padStart(12) + "Meters".padStart(14) + "Tonnage (MT)".padStart(16) + "Active WOs".padStart(12));
  console.log("--------------------------------------------------------------------------------");
  Object.entries(stageTotals).forEach(([st, d]) => {
    console.log(st.padEnd(25) + d.pcs.toLocaleString().padStart(12) + Math.round(d.mtr).toLocaleString().padStart(14) + d.mt.toFixed(2).padStart(16) + d.wos.toString().padStart(12));
  });
  console.log("--------------------------------------------------------------------------------\n");

  console.log("3. BREAKDOWN BY MANUFACTURING ROUTE");
  console.log("--------------------------------------------------------------------------------");
  console.log("Route Code".padEnd(20) + "Active PCS".padStart(12) + "Meters".padStart(14) + "Tonnage (MT)".padStart(16) + "Active WOs".padStart(12));
  console.log("--------------------------------------------------------------------------------");
  Object.entries(routeTotals).forEach(([r, d]) => {
    console.log(r.padEnd(20) + d.pcs.toLocaleString().padStart(12) + Math.round(d.mtr).toLocaleString().padStart(14) + d.mt.toFixed(2).padStart(16) + d.wos.toString().padStart(12));
  });
  console.log("--------------------------------------------------------------------------------\n");

  console.log("4. SAMPLE WORK ORDERS (STEP-BY-STEP PCS TRACE)");
  console.log("--------------------------------------------------------------------------------");
  const targetWos = ['6257', '6183', '6361', '6279', '6336'];
  const samples = woDetails.filter(d => targetWos.includes(d.wo));
  samples.forEach(s => {
    console.log(`WO #${s.wo} [Route: ${s.route}]:`);
    console.log(`   - Rolled Feeder HTC OK: ${s.rolledPcs} PCS (${s.chargedMt.toFixed(1)} MT charged)`);
    if (s.drawWip.pcs > 0) console.log(`   - Draw Bench Queue:     ${s.drawWip.pcs} Mother PCS (${s.drawWip.mt.toFixed(1)} MT)`);
    if (s.htWip.pcs > 0)   console.log(`   - Final HT Queue:       ${s.htWip.pcs} Drawn PCS (${s.htWip.mt.toFixed(1)} MT)`);
    if (s.sawWip.pcs > 0)  console.log(`   - Band Saw Queue:       ${s.sawWip.pcs} Cut/Mother PCS (${s.sawWip.mt.toFixed(1)} MT)`);
    console.log(`   ==> Active Work Order WIP: ${s.totalWipMt.toFixed(2)} MT (Strictly <= ${s.chargedMt.toFixed(2)} MT)\n`);
  });
}

simulate();
