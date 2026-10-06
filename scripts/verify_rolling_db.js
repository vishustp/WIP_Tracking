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
  const { data: stages } = await supabase.from('process_stages').select('*');
  const rollingStageId = stages.find(s => s.stage_code === 'ROLLING')?.id;

  const { data: logs } = await supabase
    .from('production_logs')
    .select('*, work_orders(id, work_order_no, customer_name)')
    .eq('stage_id', rollingStageId)
    .gte('process_date', '2026-09-27');

  console.log('Total Rolling logs >= 2026-09-27:', logs.length);
  const byWo = {};
  for (const l of logs) {
    const woNo = l.work_orders?.work_order_no || 'UNKNOWN';
    if (!byWo[woNo]) byWo[woNo] = { woNo, customer: l.work_orders?.customer_name, logs: [], totalPcs: 0, totalMtr: 0, totalHtcMtr: 0 };
    const pcsMatch = l.remarks?.match(/\[PCS:\s*(\d+)\]/i);
    const pcs = pcsMatch ? parseInt(pcsMatch[1], 10) : 0;
    byWo[woNo].totalPcs += pcs;
    byWo[woNo].totalMtr += Number(l.output_qty || 0);
    byWo[woNo].totalHtcMtr += Number(l.htc_ok || 0);
    byWo[woNo].logs.push({ date: l.process_date, out: l.output_qty, htc: l.htc_ok, pcs, rem: l.remarks });
  }

  console.log('Rolling Work Orders in DB (>= 27-Sep-2026):');
  for (const [wo, d] of Object.entries(byWo)) {
    console.log(`WO ${wo} (${d.customer}): ${d.logs.length} logs, Total PCS: ${d.totalPcs}, Total Mtr: ${d.totalMtr.toFixed(2)}, HTC OK Mtr: ${d.totalHtcMtr.toFixed(2)}`);
  }
}

main().catch(console.error);
