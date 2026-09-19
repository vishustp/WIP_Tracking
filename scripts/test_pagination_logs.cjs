const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6aHZiZnRtdXdmeXVhYXJzeHRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzUwOTYzNywiZXhwIjoyMTAzMDg1NjM3fQ.jtkcZxBOmgEEHvBzGIHYdPpzJf2zA5xfdJZ6XuDSmds";
const headers = {
  "apikey": key,
  "Authorization": `Bearer ${key}`
};
const base = "https://dzhvbftmuwfyuaarsxtk.supabase.co/rest/v1";

async function fetchAllLogs() {
  const fetch = globalThis.fetch;
  const PAGE_SIZE = 1000;
  let allLogs = [];
  let from = 0;
  while (true) {
    const res = await fetch(`${base}/production_logs?select=id,work_order_id,rolling_plan_id,stage_id,process_route_id,process_date,input_qty,output_qty,rejection_qty,htc_ok,heat_lot_no,remarks,created_at&order=created_at.asc&offset=${from}&limit=${PAGE_SIZE}`, { headers });
    const data = await res.json();
    if (!data || data.length === 0) break;
    allLogs.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return allLogs;
}

async function run() {
  const fetch = globalThis.fetch;
  const [plansRes, stagesRes, allLogs, woRes] = await Promise.all([
    fetch(`${base}/rolling_plans?status=not.is.null&order=created_at.desc&limit=300`, { headers }).then(r => r.json()),
    fetch(`${base}/process_stages?select=id,stage_code`, { headers }).then(r => r.json()),
    fetchAllLogs(),
    fetch(`${base}/work_orders?select=id,work_order_no,customer_name,grade,size_od,size_wt,l1,l2,ordered_qty`, { headers }).then(r => r.json()),
  ]);

  console.log(`Total production logs fetched with pagination: ${allLogs.length}`);

  const rollingStageId = stagesRes.find(s => s.stage_code === 'ROLLING')?.id;

  const targetWos = ["6336", "6215", "5887", "5886", "6261", "6260", "6150", "6149"];

  targetWos.forEach(woNo => {
    const wo = woRes.find(w => w.work_order_no === woNo);
    if (!wo) return;
    const plan = plansRes.find(p => p.work_order_id === wo.id);
    let planParsed = {};
    try {
      planParsed = typeof plan?.status === 'string' ? JSON.parse(plan.status) : plan?.status || {};
    } catch {}

    const plannedMtr = Number(planParsed.master_planned_mtr || plan?.planned_qty || 0);
    const plannedPcs = Number(planParsed.master_planned_pcs || 0);

    const logs = allLogs.filter(l => l.work_order_id === wo.id && l.stage_id === rollingStageId);
    const loggedMtr = logs.reduce((s, l) => s + Number(l.output_qty || 0), 0);
    const loggedPcs = logs.reduce((s, l) => {
      const match = (l.remarks || '').match(/\[PCS:(\d+)\]/);
      return s + (match ? Number(match[1]) : 0);
    }, 0);

    const balMtr = Math.max(0, plannedMtr - loggedMtr);
    const balPcs = Math.max(0, plannedPcs - loggedPcs);

    console.log(`WO ${woNo}: Planned=${plannedPcs} PCS (${plannedMtr}m), Logged=${loggedPcs} PCS (${loggedMtr.toFixed(1)}m, ${logs.length} logs), Remaining Rolling Balance=${balPcs} PCS (${balMtr.toFixed(1)}m)`);
  });
}

run();
