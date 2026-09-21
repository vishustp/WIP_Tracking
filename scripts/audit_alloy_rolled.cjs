// scripts/audit_alloy_rolled.cjs
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
  console.log("             COMPREHENSIVE ALLOY STEEL ROLLING PRODUCTION AUDIT                   ");
  console.log("=".repeat(105));

  let totalGrossPcs = 0;
  let totalHtcPcs = 0;
  let totalGrossMtr = 0;
  let totalHtcMtr = 0;
  let totalTonnageMt = 0;

  const woDetails = [];
  const gradeSummary = {};

  workOrders.forEach(wo => {
    const rp = rpMap.get(wo.id);
    const rCode = rp?.process_routes?.route_code || "";
    const grade = (wo.grade || wo.specification || "").toUpperCase();
    
    // Identify Alloy Steel: route code contains ALLOY or standard alloy specs
    const isAlloy = rCode.includes("ALLOY") || 
      /P11|P12|P22|P91|P9|P5|T11|T12|T22|T91|T9|T5|4130|4140|SA213|SA335|16MO3|13CRMO|10CRMO|15CRMO|12CR1MOV|A335/i.test(grade);

    if (!isAlloy) return;

    const logs = (plByWo.get(wo.id) || []).filter(l => l.process_stages?.stage_code === "ROLLING");
    if (logs.length === 0) return;

    const mhOd = Number(rp?.mh_od || wo.size_od || 0);
    const mhWt = Number(rp?.mh_wt || wo.size_wt || 0);
    const mhAvgLen = Number(rp?.mh_l1 && rp?.mh_l2 ? (Number(rp.mh_l1) + Number(rp.mh_l2)) / 2 : rp?.mh_l1 || 6.0);

    let woGrossPcs = 0;
    let woHtcPcs = 0;
    let woGrossMtr = 0;
    let woHtcMtr = 0;

    logs.forEach(l => {
      const gPcs = getLogPcs(l, mhAvgLen);
      const hPcs = getLogHtcPcs(l, mhAvgLen);
      const gMtr = Number(l.output_qty || 0);
      const hMtr = Number(l.htc_ok || l.output_qty || 0);

      woGrossPcs += gPcs;
      woHtcPcs += hPcs;
      woGrossMtr += gMtr;
      woHtcMtr += hMtr;
    });

    const effectiveMtr = woHtcMtr > 0 ? woHtcMtr : woHtcPcs * mhAvgLen;
    const woMt = mtFromMtr(effectiveMtr, mhOd, mhWt);

    totalGrossPcs += woGrossPcs;
    totalHtcPcs += woHtcPcs;
    totalGrossMtr += woGrossMtr;
    totalHtcMtr += woHtcMtr;
    totalTonnageMt += woMt;

    const cleanGrade = (wo.grade || wo.specification || "Alloy Steel").trim();
    if (!gradeSummary[cleanGrade]) {
      gradeSummary[cleanGrade] = { count_wos: 0, gross_pcs: 0, htc_pcs: 0, htc_mtr: 0, mt: 0 };
    }
    gradeSummary[cleanGrade].count_wos++;
    gradeSummary[cleanGrade].gross_pcs += woGrossPcs;
    gradeSummary[cleanGrade].htc_pcs += woHtcPcs;
    gradeSummary[cleanGrade].htc_mtr += woHtcMtr;
    gradeSummary[cleanGrade].mt += woMt;

    woDetails.push({
      wo_no: wo.work_order_no,
      customer: (wo.customer_name || "").slice(0, 24),
      grade: cleanGrade,
      mh_size: `${mhOd}x${mhWt}`,
      finish_size: `${wo.size_od}x${wo.size_wt}`,
      rolling_logs: logs.length,
      rolled_gross_pcs: woGrossPcs,
      htc_ok_pcs: woHtcPcs,
      htc_ok_mtr: woHtcMtr.toFixed(1),
      tonnage_mt: woMt.toFixed(2),
    });
  });

  console.log("\n1. SUMMARY BY MATERIAL GRADE:");
  console.log("-".repeat(105));
  console.table(
    Object.entries(gradeSummary).map(([grade, d]) => ({
      grade,
      work_orders: d.count_wos,
      gross_pcs: d.gross_pcs,
      htc_ok_pcs: d.htc_pcs,
      htc_ok_mtr: d.htc_mtr.toFixed(1),
      tonnage_mt: d.mt.toFixed(2),
    }))
  );

  console.log("\n2. DETAILED WORK ORDER BREAKDOWN:");
  console.log("-".repeat(105));
  console.table(woDetails);

  console.log("=".repeat(105));
  console.log("TOTAL ALLOY STEEL ROLLED ACROSS MILL:");
  console.log(`- Total Gross Rolled Pieces:      ${totalGrossPcs} PCS`);
  console.log(`- Total HTC OK Mother Hollows:    ${totalHtcPcs} PCS`);
  console.log(`- Total HTC OK Rolled Length:     ${totalHtcMtr.toFixed(1)} MTR`);
  console.log(`- Total Steel Rolled Tonnage:     ${totalTonnageMt.toFixed(2)} MT`);
  console.log(`- Number of Alloy Work Orders:    ${woDetails.length} Work Orders`);
  console.log("=".repeat(105));
}

run();
