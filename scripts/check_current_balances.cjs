const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6aHZiZnRtdXdmeXVhYXJzeHRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzUwOTYzNywiZXhwIjoyMTAzMDg1NjM3fQ.jtkcZxBOmgEEHvBzGIHYdPpzJf2zA5xfdJZ6XuDSmds";
const headers = {
  "apikey": key,
  "Authorization": `Bearer ${key}`
};
const base = "https://dzhvbftmuwfyuaarsxtk.supabase.co/rest/v1";

async function run() {
  const fetch = globalThis.fetch;

  // Let's test what /api/production/queue logic outputs for ROLLING
  const [plansRes, stagesRes, logsRes, woRes] = await Promise.all([
    fetch(`${base}/rolling_plans?status=not.is.null&order=created_at.desc&limit=300`, { headers }).then(r => r.json()),
    fetch(`${base}/process_stages?select=id,stage_code`, { headers }).then(r => r.json()),
    fetch(`${base}/production_logs?select=work_order_id,stage_id,output_qty,rejection_qty,htc_ok,remarks&limit=50000`, { headers }).then(r => r.json()),
    fetch(`${base}/work_orders?select=id,work_order_no,customer_name,grade,size_od,size_wt,l1,l2,ordered_qty`, { headers }).then(r => r.json()),
  ]);

  const rollingStageId = stagesRes.find(s => s.stage_code === 'ROLLING')?.id;

  const targetWos = ["6336", "6215", "5887", "5886", "6261"];

  targetWos.forEach(woNo => {
    const wo = woRes.find(w => w.work_order_no === woNo);
    if (!wo) {
      console.log(`WO ${woNo}: Not found in work_orders`);
      return;
    }
    const plan = plansRes.find(p => p.work_order_id === wo.id);
    let planParsed = {};
    try {
      planParsed = typeof plan?.status === 'string' ? JSON.parse(plan.status) : plan?.status || {};
    } catch {}

    const plannedMtr = Number(planParsed.master_planned_mtr || plan?.planned_qty || 0);
    const plannedPcs = Number(planParsed.master_planned_pcs || 0);

    const logs = logsRes.filter(l => l.work_order_id === wo.id && l.stage_id === rollingStageId);
    const loggedMtr = logs.reduce((s, l) => s + Number(l.output_qty || 0), 0);
    const loggedPcs = logs.reduce((s, l) => {
      const match = (l.remarks || '').match(/\[PCS:(\d+)\]/);
      return s + (match ? Number(match[1]) : 0);
    }, 0);

    const balMtr = Math.max(0, plannedMtr - loggedMtr);
    const balPcs = Math.max(0, plannedPcs - loggedPcs);

    console.log(`WO ${woNo}: Planned=${plannedPcs} PCS (${plannedMtr}m), Logged=${loggedPcs} PCS (${loggedMtr.toFixed(1)}m), Remaining Rolling Balance=${balPcs} PCS (${balMtr.toFixed(1)}m)`);
  });
}

run();
