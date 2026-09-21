// scripts/analyze_import_exclusions.cjs
const fs = require('fs');
const path = require('path');
const SUPABASE_URL = "https://dzhvbftmuwfyuaarsxtk.supabase.co/rest/v1";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6aHZiZnRtdXdmeXVhYXJzeHRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzUwOTYzNywiZXhwIjoyMTAzMDg1NjM3fQ.jtkcZxBOmgEEHvBzGIHYdPpzJf2zA5xfdJZ6XuDSmds";
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function analyzeExclusions() {
  const [woRes, plRes, rpRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/work_orders?select=id,work_order_no,customer_name,grade,specification,ordered_qty_pcs,ordered_qty_mtr,ordered_qty_mt,status`, { headers }).then(r => r.json()),
    fetch(`${SUPABASE_URL}/production_logs?select=id,work_order_id,stage_id,output_qty,rejection_qty,remarks,process_stages(stage_code)`, { headers }).then(r => r.json()),
    fetch(`${SUPABASE_URL}/rolling_plans?select=work_order_id,plan_no,status,planned_qty`, { headers }).then(r => r.json()),
  ]);

  const workOrders = Array.isArray(woRes) ? woRes : [];
  const prodLogs = Array.isArray(plRes) ? plRes : [];
  const rollingPlans = Array.isArray(rpRes) ? rpRes : [];

  const woMap = new Map();
  workOrders.forEach(w => woMap.set(w.id, w));

  // Rolling work orders
  const rolledWoIds = new Set();
  prodLogs.forEach(l => {
    if (l.process_stages?.stage_code === 'ROLLING') {
      rolledWoIds.add(l.work_order_id);
    }
  });

  // Load backups
  let backupDrawLogs = [];
  let backupHtLogs = [];
  let backupHhtLogs = [];

  if (fs.existsSync('scratch/backup_draw_and_heat_treatment.json')) {
    const d = JSON.parse(fs.readFileSync('scratch/backup_draw_and_heat_treatment.json', 'utf8'));
    backupDrawLogs = d.draw_logs || [];
    backupHtLogs = d.heat_treatment_logs || [];
  }

  if (fs.existsSync('scratch/backup_hollow_heat_treatment.json')) {
    const d = JSON.parse(fs.readFileSync('scratch/backup_hollow_heat_treatment.json', 'utf8'));
    backupHhtLogs = d.hollow_heat_treatment_logs || [];
  }

  const drawWoIds = new Set(backupDrawLogs.map(l => l.work_order_id));
  const htWoIds = new Set(backupHtLogs.map(l => l.work_order_id));
  const hhtWoIds = new Set(backupHhtLogs.map(l => l.work_order_id));

  console.log("=".repeat(95));
  console.log("WORK ORDER RECONCILIATION & IMPORT COVERAGE AUDIT");
  console.log("=".repeat(95));
  console.log(`Total Master Work Orders in Database:    ${workOrders.length}`);
  console.log(`Work Orders with Rolling Mill Logs:      ${rolledWoIds.size}`);
  console.log(`Work Orders with Draw Bench Logs:        ${drawWoIds.size}`);
  console.log(`Work Orders with Final HT Logs:          ${htWoIds.size}`);
  console.log(`Work Orders with Hollow HT Logs:         ${hhtWoIds.size}`);

  // 1. Work Orders in Master Book with NO Production Logs at all
  const noProdWos = [];
  workOrders.forEach(wo => {
    if (!rolledWoIds.has(wo.id) && !drawWoIds.has(wo.id) && !htWoIds.has(wo.id)) {
      noProdWos.push(wo);
    }
  });

  // 2. Work Orders with Rolling BUT NO Draw logs
  const rolledNoDraw = [];
  rolledWoIds.forEach(id => {
    if (!drawWoIds.has(id)) {
      const wo = woMap.get(id);
      if (wo) rolledNoDraw.push(wo);
    }
  });

  // 3. Work Orders with Draw logs BUT NO Rolling logs (Potential un-rolled or un-linked WOs)
  const drawNoRoll = [];
  drawWoIds.forEach(id => {
    if (!rolledWoIds.has(id)) {
      const wo = woMap.get(id);
      if (wo) drawNoRoll.push(wo);
    }
  });

  // 4. Work Orders with HT logs BUT NO Draw logs
  const htNoDraw = [];
  htWoIds.forEach(id => {
    if (!drawWoIds.has(id)) {
      const wo = woMap.get(id);
      if (wo) htNoDraw.push(wo);
    }
  });

  console.log(`\n--- 1. MASTER WORK ORDERS NOT YET STARTED (0 PRODUCTION) (${noProdWos.length} WOs) ---`);
  console.table(noProdWos.slice(0, 10).map(w => ({
    wo_no: w.work_order_no,
    customer: (w.customer_name || '').slice(0, 25),
    grade: w.grade || w.specification,
    ordered_pcs: w.ordered_qty_pcs,
    status: w.status
  })));

  console.log(`\n--- 2. ROLLED WORK ORDERS NOT IMPORTED/LOGGED IN DRAW BENCH (${rolledNoDraw.length} WOs) ---`);
  console.table(rolledNoDraw.slice(0, 15).map(w => ({
    wo_no: w.work_order_no,
    customer: (w.customer_name || '').slice(0, 25),
    grade: w.grade || w.specification,
    ordered_pcs: w.ordered_qty_pcs,
    ordered_mt: w.ordered_qty_mt
  })));

  console.log(`\n--- 3. DRAW BENCH WORK ORDERS MISSING ROLLING LOGS (${drawNoRoll.length} WOs) ---`);
  console.table(drawNoRoll.map(w => ({
    wo_no: w.work_order_no,
    customer: (w.customer_name || '').slice(0, 25),
    grade: w.grade || w.specification,
    ordered_pcs: w.ordered_qty_pcs
  })));

  console.log(`\n--- 4. HEAT TREATMENT WORK ORDERS MISSING DRAW LOGS (${htNoDraw.length} WOs) ---`);
  console.table(htNoDraw.map(w => ({
    wo_no: w.work_order_no,
    customer: (w.customer_name || '').slice(0, 25),
    grade: w.grade || w.specification,
    ordered_pcs: w.ordered_qty_pcs
  })));

  // Write detailed report to JSON
  const reportPath = path.resolve('scratch/excluded_work_orders_report.json');
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        total_master_work_orders: workOrders.length,
        total_rolled_work_orders: rolledWoIds.size,
        total_draw_work_orders: drawWoIds.size,
        total_ht_work_orders: htWoIds.size,
        unstarted_work_orders: noProdWos.map(w => ({ wo_no: w.work_order_no, customer: w.customer_name, grade: w.grade || w.specification })),
        rolled_without_draw: rolledNoDraw.map(w => ({ wo_no: w.work_order_no, customer: w.customer_name, grade: w.grade || w.specification })),
        drawn_without_rolling: drawNoRoll.map(w => ({ wo_no: w.work_order_no, customer: w.customer_name, grade: w.grade || w.specification })),
        ht_without_draw: htNoDraw.map(w => ({ wo_no: w.work_order_no, customer: w.customer_name, grade: w.grade || w.specification })),
      },
      null,
      2
    ),
    'utf8'
  );
  console.log(`\nDetailed JSON report saved to: ${reportPath}`);
}

analyzeExclusions();
