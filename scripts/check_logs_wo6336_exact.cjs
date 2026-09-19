const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6aHZiZnRtdXdmeXVhYXJzeHRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzUwOTYzNywiZXhwIjoyMTAzMDg1NjM3fQ.jtkcZxBOmgEEHvBzGIHYdPpzJf2zA5xfdJZ6XuDSmds";
const headers = {
  "apikey": key,
  "Authorization": `Bearer ${key}`
};
const base = "https://dzhvbftmuwfyuaarsxtk.supabase.co/rest/v1";

async function run() {
  const fetch = globalThis.fetch;
  const woRes = await fetch(`${base}/work_orders?work_order_no=eq.6336&select=id`, { headers });
  const woId = (await woRes.json())[0].id;

  const logsRes = await fetch(`${base}/production_logs?work_order_id=eq.${woId}&select=*`, { headers });
  const logs = await logsRes.json();
  console.log('Logs for WO 6336 count:', logs.length);
  if (logs.length > 0) {
    console.log('Sample log:', logs[0]);
  }
}

run();
