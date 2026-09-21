// scripts/test_alloy_wip_fix.cjs
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

async function run() {
  const [woRes, plRes, rpRes, prRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/work_orders?select=id,work_order_no,customer_name,grade,specification,ordered_qty_pcs,ordered_qty_mtr,ordered_qty_mt,size_od,size_wt,l1,l2`, { headers }).then(r => r.json()),
    fetch(`${SUPABASE_URL}/production_logs?select=id,work_order_id,stage_id,output_qty,rejection_qty,htc_ok,remarks,created_at,process_date,process_stages(stage_code,stage_name)`, { headers }).then(r => r.json()),
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
  console.log("        ALLOY STEEL WIP CALCULATION AUDIT (ROLLING -> DRAW BENCH QUEUE)          ");
  console.log("=".repeat(105));

  let totalDrawQueuePcs = 0;
  let totalDrawQueueMt = 0;
  const table = [];

  workOrders.forEach(wo => {
    const rp = rpMap.get(wo.id);
    const rCode = rp?.process_routes?.route_code || "";
    const grade = (wo.grade || wo.specification || "").toUpperCase();
    
    const isAlloy = rCode.includes("ALLOY") || 
      /P11|P12|P22|P91|P9|P5|T11|T12|T22|T91|T9|T5|4130|4140|SA213|SA335|16MO3|13CRMO|10CRMO|15CRMO|12CR1MOV|A335/i.test(grade);

    if (!isAlloy) return;

    const logs = plByWo.get(wo.id) || [];
    const rollLogs = logs.filter(l => l.process_stages?.stage_code === "ROLLING");
    if (rollLogs.length === 0) return;

    const mhOd = Number(rp?.mh_od || wo.size_od || 0);
    const mhWt = Number(rp?.mh_wt || wo.size_wt || 0);
    const mhAvgLen = Number(rp?.mh_l1 && rp?.mh_l2 ? (Number(rp.mh_l1) + Number(rp.mh_l2)) / 2 : rp?.mh_l1 || 6.0);

    let rollGrossPcs = 0;
    let rollHtcPcs = 0;
    let rollHtcMtr = 0;

    rollLogs.forEach(l => {
      const g = getLogPcs(l, mhAvgLen);
      rollGrossPcs += g;
      const m = (l.remarks || "").match(/\[PCS:\s*(\d+)(?:,\s*REJ:\s*(\d+))?\]/i);
      if (m && m[1]) {
        const rej = m[2] ? parseInt(m[2], 10) : 0;
        rollHtcPcs += Math.max(0, parseInt(m[1], 10) - rej);
      } else {
        rollHtcPcs += g;
      }
      rollHtcMtr += Number(l.htc_ok || l.output_qty || 0);
    });

    const drawLogs = logs.filter(l => l.process_stages?.stage_code === "DRAW");
    let drawPcs = 0;
    drawLogs.forEach(l => drawPcs += getLogPcs(l, mhAvgLen));

    // When Hollow HT is removed, all rolled mother hollows go directly into the Draw Bench Queue:
    const drawQueuePcs = Math.max(0, rollHtcPcs - drawPcs);
    const drawQueueMtr = drawQueuePcs * mhAvgLen;
    const drawQueueMt = mtFromMtr(drawQueueMtr, mhOd, mhWt);

    totalDrawQueuePcs += drawQueuePcs;
    totalDrawQueueMt += drawQueueMt;

    table.push({
      wo_no: wo.work_order_no,
      grade: wo.grade || wo.specification,
      rolled_htc_pcs: rollHtcPcs,
      drawn_pcs: drawPcs,
      draw_queue_pcs: drawQueuePcs,
      draw_queue_mtr: drawQueueMtr.toFixed(1),
      draw_queue_mt: drawQueueMt.toFixed(2),
    });
  });

  console.table(table);
  console.log("=".repeat(105));
  console.log(`TOTAL ALLOY STEEL CURRENTLY IN DRAW BENCH QUEUE: ${totalDrawQueuePcs} PCS | ${totalDrawQueueMt.toFixed(2)} MT`);
  console.log("=".repeat(105));
}

run();
