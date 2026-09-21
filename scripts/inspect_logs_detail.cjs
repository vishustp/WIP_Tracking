// scripts/inspect_logs_detail.cjs
const SUPABASE_URL = "https://dzhvbftmuwfyuaarsxtk.supabase.co/rest/v1";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6aHZiZnRtdXdmeXVhYXJzeHRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzUwOTYzNywiZXhwIjoyMTAzMDg1NjM3fQ.jtkcZxBOmgEEHvBzGIHYdPpzJf2zA5xfdJZ6XuDSmds";
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function run() {
  const [woRes, plRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/work_orders?select=id,work_order_no,grade,specification,ordered_qty_pcs,ordered_qty_mtr,size_od,size_wt,l1,l2`, { headers }).then(r => r.json()),
    fetch(`${SUPABASE_URL}/production_logs?select=id,work_order_id,stage_id,output_qty,rejection_qty,htc_ok,remarks,created_at,process_date,process_stages(stage_code,stage_name)&order=created_at.desc`, { headers }).then(r => r.json()),
  ]);

  const workOrders = Array.isArray(woRes) ? woRes : [];
  const prodLogs = Array.isArray(plRes) ? plRes : [];

  const woMap = new Map();
  workOrders.forEach(w => woMap.set(w.id, w));

  console.log("Total Production Logs fetched:", prodLogs.length);

  // Group by stage
  const stageSummary = {};
  prodLogs.forEach(l => {
    const sc = l.process_stages?.stage_code || "UNKNOWN";
    if (!stageSummary[sc]) {
      stageSummary[sc] = { count: 0, mtr: 0, pcs: 0, sampleRemarks: [] };
    }
    stageSummary[sc].count++;
    stageSummary[sc].mtr += Number(l.output_qty || 0);

    const m = (l.remarks || "").match(/\[PCS:\s*(\d+)\]/i);
    if (m && m[1]) {
      stageSummary[sc].pcs += parseInt(m[1], 10);
    }
    if (stageSummary[sc].sampleRemarks.length < 3 && l.remarks) {
      stageSummary[sc].sampleRemarks.push(l.remarks);
    }
  });

  console.log("\n=== SUMMARY BY WORK CENTER IN PRODUCTION_LOGS ===");
  console.table(
    Object.entries(stageSummary).map(([stage, d]) => ({
      stage,
      log_count: d.count,
      total_mtr: d.mtr.toFixed(1),
      parsed_pcs: d.pcs,
      sample_remarks: d.sampleRemarks[0] || "None",
    }))
  );

  // Let's filter specifically for Alloy work orders
  const alloyWoIds = new Set();
  workOrders.forEach(w => {
    const g = (w.grade || w.specification || "").toUpperCase();
    if (/P11|P22|P91|T11|T22|T91|4130|4140|SA213|SA335|16MO3|13CRMO|10CRMO|15CRMO/i.test(g)) {
      alloyWoIds.add(w.id);
    }
  });

  console.log(`\n=== ALLOY STEEL ORDERS LOGS ONLY (${alloyWoIds.size} Alloy WOs) ===`);
  const alloyLogs = prodLogs.filter(l => alloyWoIds.has(l.work_order_id));
  const alloySummary = {};
  alloyLogs.forEach(l => {
    const sc = l.process_stages?.stage_code || "UNKNOWN";
    if (!alloySummary[sc]) alloySummary[sc] = { count: 0, mtr: 0, pcs: 0 };
    alloySummary[sc].count++;
    alloySummary[sc].mtr += Number(l.output_qty || 0);
    const m = (l.remarks || "").match(/\[PCS:\s*(\d+)\]/i);
    if (m && m[1]) alloySummary[sc].pcs += parseInt(m[1], 10);
  });

  console.table(alloySummary);

  // Work order wise breakdown for Alloy
  const woBreakdown = {};
  alloyLogs.forEach(l => {
    const wo = woMap.get(l.work_order_id);
    const woNo = wo?.work_order_no || l.work_order_id;
    if (!woBreakdown[woNo]) {
      woBreakdown[woNo] = {
        grade: wo?.grade || wo?.specification,
        rolling_pcs: 0,
        hht_pcs: 0,
        draw_pcs: 0,
        ht_pcs: 0,
        draw_logs_count: 0,
        ht_logs_count: 0
      };
    }
    const sc = l.process_stages?.stage_code;
    const m = (l.remarks || "").match(/\[PCS:\s*(\d+)\]/i);
    const pcs = m && m[1] ? parseInt(m[1], 10) : 0;

    if (sc === 'ROLLING') woBreakdown[woNo].rolling_pcs += pcs;
    if (sc === 'HOLLOW_HEAT_TREATMENT') woBreakdown[woNo].hht_pcs += pcs;
    if (sc === 'DRAW') {
      woBreakdown[woNo].draw_pcs += pcs;
      woBreakdown[woNo].draw_logs_count++;
    }
    if (sc === 'HEAT_TREATMENT') {
      woBreakdown[woNo].ht_pcs += pcs;
      woBreakdown[woNo].ht_logs_count++;
    }
  });

  console.log("\n=== ALLOY STEEL WORK ORDER BREAKDOWN ===");
  console.table(woBreakdown);
}

run();
