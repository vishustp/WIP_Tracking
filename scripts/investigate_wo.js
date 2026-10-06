const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const XLSX = require('xlsx');

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
  const { data: wo } = await supabase.from('work_orders').select('*').ilike('work_order_no', '%4069%');
  console.log('WO 4069:', wo[0]);
  const { data: logs } = await supabase.from('production_logs').select('*, process_stages(stage_name, stage_code)').eq('work_order_id', wo[0].id);
  console.log('Logs for 4069 (total ' + logs.length + '):');
  for (const l of logs) {
    console.log({
      id: l.id,
      stage: l.process_stages?.stage_code,
      date: l.process_date,
      out: l.output_qty,
      htc: l.htc_ok,
      rem: l.remarks
    });
  }
}

main().catch(console.error);
