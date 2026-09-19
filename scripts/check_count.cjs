const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6aHZiZnRtdXdmeXVhYXJzeHRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzUwOTYzNywiZXhwIjoyMTAzMDg1NjM3fQ.jtkcZxBOmgEEHvBzGIHYdPpzJf2zA5xfdJZ6XuDSmds";
const headers = {
  "apikey": key,
  "Authorization": `Bearer ${key}`
};
const base = "https://dzhvbftmuwfyuaarsxtk.supabase.co/rest/v1";

async function run() {
  const fetch = globalThis.fetch;
  const res = await fetch(`${base}/production_logs?select=id`, {
    headers: {
      ...headers,
      "Prefer": "count=exact"
    }
  });
  console.log('Total count header:', res.headers.get('content-range'));
  const data = await res.json();
  console.log('Items returned in single page:', data.length);
}

run();
