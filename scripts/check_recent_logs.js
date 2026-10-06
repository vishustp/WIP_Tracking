const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

function getEnv() {
  const content = fs.readFileSync(path.resolve('.env.local'), 'utf8');
  const env = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq !== -1) {
      const k = trimmed.substring(0, eq).trim();
      let v = trimmed.substring(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      env[k] = v;
    }
  }
  return env;
}

global.WebSocket = class DummyWebSocket {};
const env = getEnv();
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
  realtime: { createClient: () => null }
});

async function main() {
  const { data: logs } = await supabase
    .from('production_logs')
    .select('*, work_orders(work_order_no)')
    .order('created_at', { ascending: false })
    .limit(30);

  console.log('Sample recent production logs:');
  for (const l of logs || []) {
    console.log({
      id: l.id,
      wo: l.work_orders?.work_order_no,
      date: l.process_date,
      out_qty: l.output_qty,
      htc_ok: l.htc_ok,
      remarks: l.remarks
    });
  }
}

main().catch(console.error);
