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
  console.log('1. Checking Process Stages in DB...');
  const { data: stages, error: stErr } = await supabase.from('process_stages').select('*');
  if (stErr) console.error('Stages error:', stErr);
  else console.log('Stages:', stages.map(s => ({ id: s.id, name: s.stage_name, code: s.stage_code })));

  console.log('\n2. Reading Excel file...');
  const wb = XLSX.readFile('htc ok.xlsx');
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);
  console.log('Total rows in Excel:', rows.length);

  // Filter rows from 27-Sep-2026 (serial >= 46292)
  const rowsFrom27Sep = rows.filter(r => {
    const d = r.DATE;
    if (typeof d === 'number') return d >= 46292;
    if (typeof d === 'string') {
      return d.includes('27.09') || d.includes('28.09') || d.includes('29.09') || d.includes('30.09') || d.includes('10.2026') || d.includes('09.2026');
    }
    return false;
  });
  console.log('Rows from 27-Sep-2026 in Excel:', rowsFrom27Sep.length);

  // Group Excel by work order
  // Note: in Excel, columns might be 'W.O.NO.' or 'Work order no'
  const excelByWo = {};
  for (const r of rowsFrom27Sep) {
    const rawWo = String(r['W.O.NO.'] || '').trim();
    const shortWo = String(r['Work order no'] || '').trim();
    const woKey = (rawWo || shortWo).toUpperCase();
    if (!woKey) continue;

    if (!excelByWo[woKey]) {
      excelByWo[woKey] = {
        rawWo,
        shortWo,
        excel_ok_pcs: 0,
        excel_total_ok_pcs: 0,
        excel_total_mt: 0,
        excel_rec_pcs: 0,
        excel_salvage_pcs: 0,
        excel_rework_ok: 0,
        excel_reject_pcs: 0,
        count: 0
      };
    }
    excelByWo[woKey].excel_ok_pcs += Number(r['OK'] || 0);
    excelByWo[woKey].excel_total_ok_pcs += Number(r['TOTAL OK'] || 0);
    excelByWo[woKey].excel_total_mt += Number(r['TOTAL MT'] || 0);
    excelByWo[woKey].excel_rec_pcs += Number(r['REC.'] || 0);
    excelByWo[woKey].excel_salvage_pcs += Number(r['SALVAGE'] || 0);
    excelByWo[woKey].excel_rework_ok += Number(r['REWORK OK'] || 0);
    excelByWo[woKey].excel_reject_pcs += Number(r['Reject'] || 0);
    excelByWo[woKey].count++;
  }

  console.log(`Unique work orders in Excel (>= 27-Sep): ${Object.keys(excelByWo).length}`);

  // Fetch all Work Orders from DB
  const { data: sampleWO, error: sampleErr } = await supabase
    .from('work_orders')
    .select('*')
    .limit(1);

  if (sampleErr) {
    console.error('Error fetching sample WO:', sampleErr);
    return;
  }
  console.log('Work order columns:', Object.keys(sampleWO[0] || {}));

  const { data: dbWOs, error: woErr } = await supabase
    .from('work_orders')
    .select('id, work_order_no, customer_name, status');

  if (woErr) {
    console.error('Error fetching work orders:', woErr);
    return;
  }
  console.log(`Total work orders in DB: ${dbWOs.length}`);

  // Also fetch all production logs with stage info
  const { data: sampleLog, error: sampleLogErr } = await supabase
    .from('production_logs')
    .select('*')
    .limit(1);

  if (sampleLogErr) {
    console.error('Error fetching sample log:', sampleLogErr);
    return;
  }
  console.log('Production log columns:', Object.keys(sampleLog[0] || {}));

  // Inspect what columns and values exist in production_logs for Rolling or HTC
  const rollingStage = stages.find(s => s.stage_code === 'ROLLING');
  console.log('Rolling stage ID:', rollingStage?.id);

  // Group DB logs by work_order_id and stage
  const logsByWo = {};
  for (const log of dbLogs) {
    if (!logsByWo[log.work_order_id]) logsByWo[log.work_order_id] = [];
    logsByWo[log.work_order_id].push(log);
  }

  // Let's inspect some production logs of ROLLING stage
  const rollingLogs = dbLogs.filter(l => l.stage_id === rollingStage?.id);
  console.log(`Total Rolling logs in DB: ${rollingLogs.length}`);
  if (rollingLogs.length > 0) {
    console.log('Sample rolling log in DB:', rollingLogs[0]);
  }

  // Also check if any log has htc_ok populated
  const logsWithHtcOk = dbLogs.filter(l => l.htc_ok !== null && l.htc_ok !== undefined && l.htc_ok !== 0);
  console.log(`Logs with non-zero htc_ok: ${logsWithHtcOk.length}`);
  if (logsWithHtcOk.length > 0) {
    console.log('Sample log with htc_ok:', logsWithHtcOk[0]);
  }
}

main().catch(console.error);
