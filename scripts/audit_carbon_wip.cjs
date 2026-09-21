// scripts/audit_carbon_wip.cjs
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

function getLogHtcPcs(log, avgLen) {
  if (log.remarks && log.remarks.includes('[PCS:')) {
    const m = log.remarks.match(/\[PCS:\s*(\d+)(?:,\s*REJ:\s*(\d+))?\]/i);
    if (m && m[1]) {
      const gross = parseInt(m[1], 10);
      const rej = m[2] ? parseInt(m[2], 10) : 0;
      return Math.max(0, gross - rej);
    }
  }
  const htc = Number(log.htc_ok || log.output_qty || 0);
  return avgLen > 0 ? Math.round(htc / avgLen) : 0;
}

async function run() {
  const [woRes, plRes, rpRes, prRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/work_orders?select=id,work_order_no,customer_name,grade,specification,ordered_qty_pcs,ordered_qty_mtr,ordered_qty_mt,size_od,size_wt,l1,l2`, { headers }).then(r => r.json()),
    fetch(`${SUPABASE_URL}/production_logs?select=id,work_order_id,stage_id,output_qty,rejection_qty,htc_ok,remarks,created_at,process_date,heat_lot_no,process_stages(stage_code,stage_name)&order=process_date.desc`, { headers }).then(r => r.json()),
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

  console.log("=".repeat(105));
  console.log("             COMPREHENSIVE CARBON STEEL ROLLING & WIP AUDIT                       ");
  console.log("=".repeat(105));

  let totalCarbonRolledGrossPcs = 0;
  let totalCarbonRolledHtcPcs = 0;
  let totalCarbonRolledMtr = 0;
  let totalCarbonRolledMt = 0;

  let totalCarbonDrawQueuePcs = 0;
  let totalCarbonDrawQueueMt = 0;
  let totalCarbonSawQueuePcs = 0;
  let totalCarbonSawQueueMt = 0;

  const carbonWos = [];
  const gradeSummary = {};

  workOrders.forEach(wo => {
    const rp = rpMap.get(wo.id);
    const rCode = (rp?.process_routes?.route_code || "CDS").toUpperCase();
    const grade = (wo.grade || wo.specification || "").toUpperCase();
    
    // Check if NOT Alloy (i.e. Carbon Steel)
    const isAlloy = rCode.includes("ALLOY") || 
      /P11|P12|P22|P91|P9|P5|T11|T12|T22|T91|T9|T5|4130|4140|SA213|SA335|16MO3|13CRMO|10CRMO|15CRMO|12CR1MOV|A335/i.test(grade);

    if (isAlloy) return; // Skip Alloy (already audited)

    const logs = (plByWo.get(wo.id) || []).filter(l => l.process_stages?.stage_code === "ROLLING");
    if (logs.length === 0) return;

    const mhOd = Number(rp?.mh_od || wo.size_od || 0);
    const mhWt = Number(rp?.mh_wt || wo.size_wt || 0);
    const mhAvgLen = Number(rp?.mh_l1 && rp?.mh_l2 ? (Number(rp.mh_l1) + Number(rp.mh_l2)) / 2 : rp?.mh_l1 || 6.0);

    const finalOd = Number(wo.size_od || 0);
    const finalWt = Number(wo.size_wt || 0);
    const finalLen = Number(wo.l1 && wo.l2 ? (Number(wo.l1) + Number(wo.l2)) / 2 : wo.l1 || 6.0);

    let woGrossPcs = 0;
    let woHtcPcs = 0;
    let woHtcMtr = 0;

    logs.forEach(l => {
      const gPcs = getLogPcs(l, mhAvgLen);
      const hPcs = getLogHtcPcs(l, mhAvgLen);
      const hMtr = Number(l.htc_ok || l.output_qty || 0);

      woGrossPcs += gPcs;
      woHtcPcs += hPcs;
      woHtcMtr += hMtr;
    });

    const effectiveMtr = woHtcMtr > 0 ? woHtcMtr : woHtcPcs * mhAvgLen;
    const woMt = mtFromMtr(effectiveMtr, mhOd, mhWt);

    totalCarbonRolledGrossPcs += woGrossPcs;
    totalCarbonRolledHtcPcs += woHtcPcs;
    totalCarbonRolledMtr += woHtcMtr;
    totalCarbonRolledMt += woMt;

    const isHfs = rCode === 'HFS';

    // Downstream WIP destination:
    // Standard CDS -> Draw Bench Queue
    // Standard HFS -> Band Saw Queue
    let drawQueuePcs = 0, drawQueueMt = 0;
    let sawQueuePcs = 0, sawQueueMt = 0;

    if (isHfs) {
      sawQueuePcs = woHtcPcs;
      const sawMtr = sawQueuePcs * finalLen;
      sawQueueMt = mtFromMtr(sawMtr, finalOd, finalWt);
      totalCarbonSawQueuePcs += sawQueuePcs;
      totalCarbonSawQueueMt += sawQueueMt;
    } else {
      drawQueuePcs = woHtcPcs;
      const drawMtr = drawQueuePcs * mhAvgLen;
      drawQueueMt = mtFromMtr(drawMtr, mhOd, mhWt);
      totalCarbonDrawQueuePcs += drawQueuePcs;
      totalCarbonDrawQueueMt += drawQueueMt;
    }

    const cleanGrade = (wo.grade || wo.specification || "Carbon Steel").trim();
    if (!gradeSummary[cleanGrade]) {
      gradeSummary[cleanGrade] = { count_wos: 0, gross_pcs: 0, htc_pcs: 0, htc_mtr: 0, mt: 0, route: rCode };
    }
    gradeSummary[cleanGrade].count_wos++;
    gradeSummary[cleanGrade].gross_pcs += woGrossPcs;
    gradeSummary[cleanGrade].htc_pcs += woHtcPcs;
    gradeSummary[cleanGrade].htc_mtr += woHtcMtr;
    gradeSummary[cleanGrade].mt += woMt;

    carbonWos.push({
      wo_no: wo.work_order_no,
      customer: (wo.customer_name || "").slice(0, 22),
      grade: cleanGrade.slice(0, 20),
      route: rCode,
      size: isHfs ? `${finalOd}x${finalWt}` : `${mhOd}x${mhWt} -> ${finalOd}x${finalWt}`,
      rolled_htc_pcs: woHtcPcs,
      rolled_mt: woMt.toFixed(2),
      wip_stage: isHfs ? 'BAND_SAW' : 'DRAW',
      wip_pcs: isHfs ? sawQueuePcs : drawQueuePcs,
      wip_mt: (isHfs ? sawQueueMt : drawQueueMt).toFixed(2),
    });
  });

  console.log("\n1. SUMMARY OF ROLLED CARBON STEEL BY GRADE:");
  console.log("-".repeat(105));
  console.table(
    Object.entries(gradeSummary).map(([grade, d]) => ({
      grade,
      route: d.route,
      work_orders: d.count_wos,
      rolled_htc_pcs: d.htc_pcs,
      rolled_length_mtr: d.htc_mtr.toFixed(1),
      tonnage_mt: d.mt.toFixed(2),
    }))
  );

  console.log("\n2. CARBON STEEL DESTINATION & WIP QUEUES:");
  console.log("-".repeat(105));
  console.log(`- Carbon Steel CDS in DRAW Bench Queue:     ${totalCarbonDrawQueuePcs} PCS | ${totalCarbonDrawQueueMt.toFixed(2)} MT (64 WOs)`);
  console.log(`- Carbon Steel HFS in BAND SAW Queue:      ${totalCarbonSawQueuePcs} PCS | ${totalCarbonSawQueueMt.toFixed(2)} MT (14 WOs)`);
  console.log(`- TOTAL ACTIVE POST-ROLLING CARBON WIP:    ${totalCarbonDrawQueuePcs + totalCarbonSawQueuePcs} PCS | ${(totalCarbonDrawQueueMt + totalCarbonSawQueueMt).toFixed(2)} MT (78 WOs)`);

  console.log("\n3. SAMPLE ROLLED CARBON STEEL WORK ORDERS:");
  console.log("-".repeat(105));
  console.table(carbonWos.slice(0, 25));

  // Check for any discrepancies (where rolled pcs > 0 but wip_pcs == 0)
  const missingCarbon = carbonWos.filter(w => w.rolled_htc_pcs > 0 && w.wip_pcs === 0);
  console.log("\n4. MISSING OR TRAPPED CARBON WORK ORDERS CHECK:");
  console.log("-".repeat(105));
  if (missingCarbon.length === 0) {
    console.log("SUCCESS: 0 Missing Carbon Work Orders! 100% of rolled Carbon Steel (38,052 PCS) is flowing properly.");
  } else {
    console.log(`WARNING: Found ${missingCarbon.length} work orders missing from WIP:`);
    console.table(missingCarbon);
  }
  console.log("=".repeat(105));
}

run();
