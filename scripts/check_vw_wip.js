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
  const { data, error } = await supabase.from('vw_route_stage_wip').select('*').limit(10);
  if (error) {
    console.error('Error querying vw_route_stage_wip:', error);
    return;
  }
  console.log('Sample row from vw_route_stage_wip:', data[0]);

  // Aggregate by stage_code
  const { data: allWip } = await supabase.from('vw_route_stage_wip').select('*');
  const byStage = {};
  (allWip || []).forEach(r => {
    if (!byStage[r.stage_code]) {
      byStage[r.stage_code] = {
        incoming_qty: 0,
        current_wip: 0,
        current_wip_pcs: 0,
        current_wip_mt: 0,
        count: 0
      };
    }
    byStage[r.stage_code].incoming_qty += Number(r.incoming_qty || 0);
    byStage[r.stage_code].current_wip += Number(r.current_wip || 0);
    byStage[r.stage_code].current_wip_pcs += Number(r.current_wip_pcs || 0);
    byStage[r.stage_code].current_wip_mt += Number(r.current_wip_mt || 0);
    byStage[r.stage_code].count++;
  });
  console.log('Aggregated WIP by stage_code:');
  console.table(byStage);
}

main().catch(console.error);
