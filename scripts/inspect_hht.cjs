// scripts/inspect_hht.cjs
const SUPABASE_URL = "https://dzhvbftmuwfyuaarsxtk.supabase.co/rest/v1";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6aHZiZnRtdXdmeXVhYXJzeHRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzUwOTYzNywiZXhwIjoyMTAzMDg1NjM3fQ.jtkcZxBOmgEEHvBzGIHYdPpzJf2zA5xfdJZ6XuDSmds";

const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
};

async function run() {
  const [stages, logs, wos] = await Promise.all([
    fetch(`${SUPABASE_URL}/process_stages?select=*`, { headers }).then(r => r.json()),
    fetch(`${SUPABASE_URL}/production_logs?select=*,process_stages(stage_code)&order=created_at.asc`, { headers }).then(r => r.json()),
    fetch(`${SUPABASE_URL}/work_orders?select=id,work_order_no,customer_name,grade`, { headers }).then(r => r.json()),
  ]);

  const hhtStageId = stages.find(s => s.stage_code === "HOLLOW_HEAT_TREATMENT")?.id;
  const hhtLogs = logs.filter(l => l.stage_id === hhtStageId);
  const woMap = new Map();
  wos.forEach(w => woMap.set(w.id, w));

  console.log(`Total Hollow Heat Treatment (HHT) Logs in DB: ${hhtLogs.length}`);
  hhtLogs.forEach(l => {
    const wo = woMap.get(l.work_order_id);
    console.log(`WO ${wo?.work_order_no} (${wo?.customer_name}, ${wo?.grade}): Date=${l.process_date}, Out=${l.output_qty}, Rej=${l.rejection_qty}, Remarks=${l.remarks}`);
  });
}

run().catch(err => console.error(err));
