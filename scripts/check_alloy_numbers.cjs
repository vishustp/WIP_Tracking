// scripts/check_alloy_numbers.cjs
const SUPABASE_URL = "https://dzhvbftmuwfyuaarsxtk.supabase.co/rest/v1";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6aHZiZnRtdXdmeXVhYXJzeHRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzUwOTYzNywiZXhwIjoyMTAzMDg1NjM3fQ.jtkcZxBOmgEEHvBzGIHYdPpzJf2zA5xfdJZ6XuDSmds";
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function checkAlloyRolling() {
  const [woRes, plRes, rpRes, prRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/work_orders?select=id,work_order_no,grade,specification,ordered_qty_pcs,ordered_qty_mt,size_od,size_wt`, { headers }).then(r => r.json()),
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

  console.log("=".repeat(90));
  console.log("EXACT AUDIT OF ALLOY STEEL PRODUCTION LOGS BY WORK ORDER");
  console.log("=".repeat(90));

  let totalRolledPcs = 0;
  let totalDrawnPcs = 0;
  let totalHhtPcs = 0;
  let totalHtPcs = 0;

  const table = [];

  workOrders.forEach(wo => {
    const rp = rpMap.get(wo.id);
    const rCode = rp?.process_routes?.route_code || "";
    const grade = (wo.grade || wo.specification || "").toUpperCase();
    const isAlloy = rCode.includes("ALLOY") || /P11|P22|P91|T11|T22|T91|4130|4140|SA213|SA335|16MO3|13CRMO|10CRMO|15CRMO/i.test(grade);

    if (!isAlloy) return;

    const logs = plByWo.get(wo.id) || [];
    const rollLogs = logs.filter(l => l.process_stages?.stage_code === "ROLLING");
    const hhtLogs = logs.filter(l => l.process_stages?.stage_code === "HOLLOW_HEAT_TREATMENT");
    const drawLogs = logs.filter(l => l.process_stages?.stage_code === "DRAW");
    const htLogs = logs.filter(l => l.process_stages?.stage_code === "HEAT_TREATMENT");

    let rollPcs = 0;
    rollLogs.forEach(l => {
      const m = (l.remarks || "").match(/\[PCS:\s*(\d+)\]/i);
      if (m && m[1]) rollPcs += parseInt(m[1], 10);
      else if (Number(l.output_qty || 0) > 0) rollPcs += Math.round(Number(l.output_qty) / 6.0);
    });

    let hhtPcs = 0;
    hhtLogs.forEach(l => {
      const m = (l.remarks || "").match(/\[PCS:\s*(\d+)\]/i);
      if (m && m[1]) hhtPcs += parseInt(m[1], 10);
      else if (Number(l.output_qty || 0) > 0) hhtPcs += Math.round(Number(l.output_qty) / 6.0);
    });

    let drawPcs = 0;
    drawLogs.forEach(l => {
      const m = (l.remarks || "").match(/\[PCS:\s*(\d+)\]/i);
      if (m && m[1]) drawPcs += parseInt(m[1], 10);
      else if (Number(l.output_qty || 0) > 0) drawPcs += Math.round(Number(l.output_qty) / 10.0);
    });

    let htPcs = 0;
    htLogs.forEach(l => {
      const m = (l.remarks || "").match(/\[PCS:\s*(\d+)\]/i);
      if (m && m[1]) htPcs += parseInt(m[1], 10);
      else if (Number(l.output_qty || 0) > 0) htPcs += Math.round(Number(l.output_qty) / 6.0);
    });

    totalRolledPcs += rollPcs;
    totalHhtPcs += hhtPcs;
    totalDrawnPcs += drawPcs;
    totalHtPcs += htPcs;

    if (rollPcs > 0 || hhtPcs > 0 || drawPcs > 0 || htPcs > 0) {
      table.push({
        wo_no: wo.work_order_no,
        grade: wo.grade || wo.specification,
        ordered_pcs: wo.ordered_qty_pcs,
        rolled_pcs: rollPcs,
        hht_pcs: hhtPcs,
        drawn_pcs: drawPcs,
        ht_pcs: htPcs
      });
    }
  });

  console.table(table);
  console.log("=".repeat(90));
  console.log("TOTALS ACROSS ALL ALLOY STEEL ORDERS:");
  console.log(`- Total ROLLED Pieces:      ${totalRolledPcs} PCS`);
  console.log(`- Total HOLLOW HT Pieces:   ${totalHhtPcs} PCS`);
  console.log(`- Total DRAWN Pieces:       ${totalDrawnPcs} PCS`);
  console.log(`- Total FINAL HT Pieces:    ${totalHtPcs} PCS`);
  console.log("=".repeat(90));
}

checkAlloyRolling();
