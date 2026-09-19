const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6aHZiZnRtdXdmeXVhYXJzeHRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzUwOTYzNywiZXhwIjoyMTAzMDg1NjM3fQ.jtkcZxBOmgEEHvBzGIHYdPpzJf2zA5xfdJZ6XuDSmds";
const headers = {
  "apikey": key,
  "Authorization": `Bearer ${key}`
};
const base = "https://dzhvbftmuwfyuaarsxtk.supabase.co/rest/v1";

async function run() {
  const fetch = globalThis.fetch;

  // Let's test the rolling plans and production logs for 6336
  const woRes = await fetch(`${base}/work_orders?work_order_no=eq.6336&select=id,work_order_no`, { headers });
  const wo = (await woRes.json())[0];
  console.log('WO 6336 ID:', wo.id);

  const stageRes = await fetch(`${base}/process_stages?stage_code=eq.ROLLING&select=id`, { headers });
  const stageId = (await stageRes.json())[0].id;
  console.log('ROLLING Stage ID:', stageId);

  const logsRes = await fetch(`${base}/production_logs?work_order_id=eq.${wo.id}&stage_id=eq.${stageId}&select=id,output_qty,htc_ok,remarks`, { headers });
  const logs = await logsRes.json();
  console.log('Total Rolling logs for 6336:', logs.length);
  const totalMtr = logs.reduce((s, l) => s + Number(l.output_qty || 0), 0);
  console.log('Total Output Mtr for 6336:', totalMtr);

  // Check rolling plans for 6336
  const plansRes = await fetch(`${base}/rolling_plans?work_order_id=eq.${wo.id}&select=*`, { headers });
  const plans = await plansRes.json();
  console.log('Rolling plans for 6336 count:', plans.length);
  if (plans.length > 0) {
    console.log('Plan planned_qty:', plans[0].planned_qty);
    console.log('Plan status field type:', typeof plans[0].status);
  }
}

run();
