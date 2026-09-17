// scripts/inspect_excess_logs.cjs
const fs = require('fs');

const audit = JSON.parse(fs.readFileSync('audit_results.json', 'utf8'));

console.log("=== 1. ROLLING OVER 110% OF PLAN ===");
audit.rollingOverPlan.forEach(wo => {
  const plan110Pcs = Math.round(wo.total_planned_pcs * 1.10);
  const plan110Mtr = Number((wo.total_planned_mtr * 1.10).toFixed(2));
  if (wo.actual_rolled_pcs > plan110Pcs || wo.actual_rolled_mtr > plan110Mtr) {
    console.log(`WO ${wo.work_order_no} (${wo.customer_name}): Plan=${wo.total_planned_pcs} PCS (${wo.total_planned_mtr}m), 110% Limit=${plan110Pcs} PCS (${plan110Mtr}m), Rolled=${wo.actual_rolled_pcs} PCS (${wo.actual_rolled_mtr}m), Excess=${wo.actual_rolled_pcs - plan110Pcs} PCS`);
    wo.logs.forEach(l => console.log(`   Log ${l.id} Date:${l.date} Out:${l.out_qty} Rej:${l.rej_qty} HTC:${l.htc_ok} Remarks:${l.remarks}`));
  }
});

console.log("\n=== 2. DRAW OVER ROLLING HTC OK ===");
audit.drawOverRolling.forEach(wo => {
  console.log(`WO ${wo.work_order_no} (${wo.customer_name}): Feeder Rolling HTC OK=${wo.rolling_htc_ok_pcs} PCS (${wo.rolling_htc_ok_mtr}m), DB Logged=${wo.draw_output_pcs} PCS (${wo.draw_output_mtr}m), Excess=${wo.excess_pcs} PCS`);
  wo.draw_logs.forEach(l => console.log(`   Log ${l.id} Date:${l.date} Out:${l.out_qty} Remarks:${l.remarks}`));
});

console.log("\n=== 3. HT OVER DRAW ===");
audit.htOverDraw.forEach(wo => {
  console.log(`WO ${wo.work_order_no} (${wo.customer_name}): DB Output=${wo.draw_output_pcs} PCS (${wo.draw_output_mtr}m), HT Logged=${wo.ht_output_pcs} PCS (${wo.ht_output_mtr}m), Excess=${wo.excess_pcs} PCS`);
  wo.ht_logs.forEach(l => console.log(`   Log ${l.id} Date:${l.date} Out:${l.out_qty} Remarks:${l.remarks}`));
});

console.log("\n=== 4. CUTTING OVER FEEDER * MULTIPLE ===");
audit.cuttingOverFeeder.forEach(wo => {
  console.log(`WO ${wo.work_order_no} (${wo.customer_name}): Feeder Allowed=${wo.feeder_available_pcs} PCS (${wo.feeder_rule}), Effective Cutting=${wo.total_effective_cutting_pcs} PCS, Excess=${wo.excess_pcs} PCS`);
  wo.cutting_logs.forEach(l => console.log(`   Cut Log ${l.id} Date:${l.date} Out:${l.out_qty} Remarks:${l.remarks}`));
  wo.qc_inspections.forEach(q => console.log(`   QC ID ${q.id} Inspected:${q.inspected_pcs} OK:${q.vdi_ok_pcs}`));
});
