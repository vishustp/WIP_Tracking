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

function extractPcsFromRemarks(remarks) {
  if (!remarks) return { pcs: 0, htcOk: null };
  const pcsMatch = remarks.match(/\[PCS:\s*(\d+)\]/i) || remarks.match(/PCS:\s*(\d+)/i);
  const htcMatch = remarks.match(/\[HTC_OK:\s*(\d+)\]/i) || remarks.match(/HTC_OK:\s*(\d+)/i);
  return {
    pcs: pcsMatch ? parseInt(pcsMatch[1], 10) : 0,
    htcOk: htcMatch ? parseInt(htcMatch[1], 10) : null
  };
}

function parseExcelDate(val) {
  if (typeof val === 'number') {
    const utc_days = Math.floor(val - 25569);
    const utc_value = utc_days * 86400;
    const date_info = new Date(utc_value * 1000);
    return date_info.toISOString().split('T')[0];
  }
  if (typeof val === 'string') {
    const m = val.match(/(\d{1,2})[\.\/-](\d{1,2})[\.\/-](\d{4})/);
    if (m) {
      const day = m[1].padStart(2, '0');
      const month = m[2].padStart(2, '0');
      return `${m[3]}-${month}-${day}`;
    }
    return val;
  }
  return '';
}

async function run() {
  console.log('Loading Excel data...');
  const wb = XLSX.readFile('htc ok.xlsx');
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const allRows = XLSX.utils.sheet_to_json(sheet);

  // Filter >= 2026-09-27
  const recentExcelRows = allRows.filter(r => {
    const dStr = parseExcelDate(r.DATE);
    return dStr >= '2026-09-27' && dStr <= '2026-10-31';
  });

  console.log(`Filtered ${recentExcelRows.length} rows from 2026-09-27 onwards.`);

  // Load Work Orders from DB
  const { data: dbWOs, error: woErr } = await supabase
    .from('work_orders')
    .select('id, work_order_no, customer_name, size_od, size_wt, l1, l2');
  if (woErr) throw woErr;

  // Normalize WO numbers
  function normalizeWo(str) {
    if (!str) return '';
    const s = String(str).trim();
    // Try to extract pure digits
    const digitMatch = s.match(/(\d+)/g);
    const lastDigits = digitMatch ? parseInt(digitMatch[digitMatch.length - 1], 10).toString() : '';
    const cleanStr = s.toUpperCase().replace(/[\s\-_]/g, '');
    return { cleanStr, lastDigits, raw: s };
  }

  // Build mapping for work orders
  const woMap = new Map();
  const woByDigits = new Map();
  dbWOs.forEach(w => {
    const norm = normalizeWo(w.work_order_no);
    woMap.set(norm.cleanStr, w);
    woMap.set(w.work_order_no.toUpperCase().trim(), w);
    if (norm.lastDigits) {
      woByDigits.set(norm.lastDigits, w);
    }
  });

  function findDbWo(rawWo, shortWo) {
    const n1 = normalizeWo(rawWo);
    const n2 = normalizeWo(shortWo);

    return woMap.get(n1.cleanStr) ||
           woMap.get(n2.cleanStr) ||
           (n2.lastDigits && woByDigits.get(n2.lastDigits)) ||
           (n1.lastDigits && woByDigits.get(n1.lastDigits)) ||
           null;
  }

  // Load Process Stages
  const { data: stages } = await supabase.from('process_stages').select('*');
  const rollingStageId = stages.find(s => s.stage_code === 'ROLLING')?.id;

  // Load DB Production Logs >= 2026-09-27
  const { data: dbLogs, error: logErr } = await supabase
    .from('production_logs')
    .select('*')
    .gte('process_date', '2026-09-27');
  if (logErr) throw logErr;

  // Group DB logs by work_order_id
  const dbLogsByWoId = new Map();
  (dbLogs || []).forEach(l => {
    if (!dbLogsByWoId.has(l.work_order_id)) {
      dbLogsByWoId.set(l.work_order_id, []);
    }
    dbLogsByWoId.get(l.work_order_id).push(l);
  });

  // Group Excel by Work Order
  const excelByWo = new Map();
  for (const r of recentExcelRows) {
    const rawWo = String(r['W.O.NO.'] || '').trim();
    const shortWo = String(r['Work order no'] || '').trim();
    const dbWo = findDbWo(rawWo, shortWo);

    const key = dbWo ? dbWo.work_order_no : (shortWo || rawWo);
    if (!excelByWo.has(key)) {
      excelByWo.set(key, {
        work_order_no: key,
        db_wo: dbWo || null,
        excel_rec_pcs: 0,
        excel_ok_pcs: 0,
        excel_salvage_pcs: 0,
        excel_rework_ok: 0,
        excel_total_ok: 0,
        excel_reject_pcs: 0,
        excel_total_mt: 0,
        dates: new Set(),
        heat_nos: new Set(),
        raw_rows_count: 0
      });
    }
    const item = excelByWo.get(key);
    item.excel_rec_pcs += Number(r['REC.'] || 0);
    item.excel_ok_pcs += Number(r['OK'] || 0);
    item.excel_salvage_pcs += Number(r['SALVAGE'] || 0);
    item.excel_rework_ok += Number(r['REWORK OK'] || 0);
    item.excel_total_ok += Number(r['TOTAL OK'] || 0);
    item.excel_reject_pcs += Number(r['Reject'] || 0);
    item.excel_total_mt += Number(r['TOTAL MT'] || 0);
    item.dates.add(parseExcelDate(r.DATE));
    if (r['HEAT NO.']) item.heat_nos.add(String(r['HEAT NO.']).trim());
    item.raw_rows_count++;
  }

  // Also gather all WOs that have DB logs >= 2026-09-27
  const allWoKeys = new Set([...excelByWo.keys()]);
  dbLogsByWoId.forEach((logs, woId) => {
    const woObj = dbWOs.find(w => w.id === woId);
    if (woObj) allWoKeys.add(woObj.work_order_no);
  });

  const results = [];
  for (const woKey of allWoKeys) {
    const ex = excelByWo.get(woKey) || {
      work_order_no: woKey,
      db_wo: null,
      excel_rec_pcs: 0,
      excel_ok_pcs: 0,
      excel_salvage_pcs: 0,
      excel_rework_ok: 0,
      excel_total_ok: 0,
      excel_reject_pcs: 0,
      excel_total_mt: 0,
      dates: new Set(),
      heat_nos: new Set(),
      raw_rows_count: 0
    };

    const dbWo = ex.db_wo || woMap.get(woKey.toUpperCase()) || null;
    const woId = dbWo?.id;
    const logs = woId ? (dbLogsByWoId.get(woId) || []) : [];

    // Rolling logs in DB
    const rollingLogs = logs.filter(l => l.stage_id === rollingStageId);
    let dbRollingPcs = 0;
    let dbRollingMtr = 0;
    let dbHtcOkMtr = 0;
    let dbHtcOkPcs = 0;
    const dbDates = new Set();
    const dbHeats = new Set();

    rollingLogs.forEach(l => {
      const pInfo = extractPcsFromRemarks(l.remarks);
      dbRollingPcs += pInfo.pcs;
      dbRollingMtr += Number(l.output_qty || 0);
      dbHtcOkMtr += Number(l.htc_ok || 0);
      if (pInfo.htcOk !== null) {
        dbHtcOkPcs += pInfo.htcOk;
      } else {
        // If not explicit in remarks, check if htc_ok column is populated or default to rolling pcs
        dbHtcOkPcs += pInfo.pcs;
      }
      if (l.process_date) dbDates.add(l.process_date);
      if (l.heat_lot_no) dbHeats.add(l.heat_lot_no);
    });

    results.push({
      work_order_no: woKey,
      customer: dbWo?.customer_name || 'N/A',
      size: dbWo ? `${dbWo.size_od} x ${dbWo.size_wt}` : 'N/A',
      excel_rec_pcs: ex.excel_rec_pcs,
      excel_ok_pcs: ex.excel_ok_pcs,
      excel_salvage_pcs: ex.excel_salvage_pcs,
      excel_rework_ok: ex.excel_rework_ok,
      excel_total_ok: ex.excel_total_ok,
      excel_total_mt: Number(ex.excel_total_mt.toFixed(3)),
      excel_dates: Array.from(ex.dates).sort(),
      dbRollingPcs,
      dbRollingMtr: Number(dbRollingMtr.toFixed(2)),
      dbHtcOkMtr: Number(dbHtcOkMtr.toFixed(2)),
      dbHtcOkPcs,
      dbDates: Array.from(dbDates).sort(),
      dbLogsCount: rollingLogs.length
    });
  }

  // Sort by work order
  results.sort((a, b) => a.work_order_no.localeCompare(b.work_order_no));

  console.log(`\n========================================================================================`);
  console.log(`DETAILED COMPARISON FOR ALL WORK ORDERS (27-Sep-2026 onwards)`);
  console.log(`Total Work Orders analyzed: ${results.length}`);
  console.log(`========================================================================================\n`);

  // Category 1: System Rolling/HTC PCS > Excel Total OK
  const systemMore = results.filter(r => r.dbRollingPcs > r.excel_total_ok);
  console.log(`>>> 1. Work Orders where SYSTEM PCS > EXCEL TOTAL OK (${systemMore.length} WOs):`);
  systemMore.forEach(r => {
    console.log(`   WO: ${r.work_order_no} (${r.customer}) | Size: ${r.size}`);
    console.log(`      System Rolling PCS: ${r.dbRollingPcs} (Mtr: ${r.dbRollingMtr}) | DB HTC OK Mtr: ${r.dbHtcOkMtr}`);
    console.log(`      Excel Total OK PCS: ${r.excel_total_ok} (OK: ${r.excel_ok_pcs}, Salvage: ${r.excel_salvage_pcs}, Rec: ${r.excel_rec_pcs})`);
    console.log(`      Diff (System - Excel): +${r.dbRollingPcs - r.excel_total_ok} PCS`);
    console.log(`      Excel Dates: ${r.excel_dates.join(', ')} | System Dates: ${r.dbDates.join(', ')}`);
  });

  // Category 2: Excel Total OK > System Rolling/HTC PCS
  const excelMore = results.filter(r => r.excel_total_ok > r.dbRollingPcs);
  console.log(`\n>>> 2. Work Orders where EXCEL TOTAL OK > SYSTEM PCS (${excelMore.length} WOs):`);
  excelMore.forEach(r => {
    console.log(`   WO: ${r.work_order_no} (${r.customer}) | Size: ${r.size}`);
    console.log(`      Excel Total OK PCS: ${r.excel_total_ok} (OK: ${r.excel_ok_pcs}, Salvage: ${r.excel_salvage_pcs}, Rec: ${r.excel_rec_pcs})`);
    console.log(`      System Rolling PCS: ${r.dbRollingPcs} (Mtr: ${r.dbRollingMtr}) | DB HTC OK Mtr: ${r.dbHtcOkMtr}`);
    console.log(`      Diff (Excel - System): +${r.excel_total_ok - r.dbRollingPcs} PCS`);
    console.log(`      Excel Dates: ${r.excel_dates.join(', ')} | System Dates: ${r.dbDates.join(', ')}`);
  });

  // Category 3: Exact Match
  const exactMatch = results.filter(r => r.dbRollingPcs === r.excel_total_ok && r.excel_total_ok > 0);
  console.log(`\n>>> 3. Work Orders where SYSTEM PCS === EXCEL TOTAL OK (${exactMatch.length} WOs):`);
  exactMatch.forEach(r => {
    console.log(`   WO: ${r.work_order_no} | PCS: ${r.dbRollingPcs} | Excel OK: ${r.excel_ok_pcs}, Salvage: ${r.excel_salvage_pcs}`);
  });

  // Save full json artifact for reference
  fs.writeFileSync('scripts/htc_comparison_summary.json', JSON.stringify({ systemMore, excelMore, exactMatch }, null, 2));
  console.log(`\nSaved summary to scripts/htc_comparison_summary.json`);
}

run().catch(console.error);
