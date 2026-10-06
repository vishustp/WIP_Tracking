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

function extractPcs(remarks) {
  if (!remarks) return 0;
  const match = remarks.match(/\[PCS:\s*(\d+)\]/i) || remarks.match(/PCS:\s*(\d+)/i) || remarks.match(/(\d+)\s*PCS/i);
  return match ? parseInt(match[1], 10) : 0;
}

function excelDateToDateStr(serial) {
  if (typeof serial !== 'number') return String(serial);
  const utc_days = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;
  const date_info = new Date(utc_value * 1000);
  return date_info.toISOString().split('T')[0];
}

async function main() {
  const wb = XLSX.readFile('htc ok.xlsx');
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const allExcelRows = XLSX.utils.sheet_to_json(sheet);

  // Filter rows >= 27-Sep-2026 (serial >= 46292 or date string)
  const excelRows = allExcelRows.filter(r => {
    const d = r.DATE;
    if (typeof d === 'number') return d >= 46292;
    if (typeof d === 'string') {
      const match = d.match(/(\d{2})\.(\d{2})\.(\d{4})/);
      if (match) {
        const iso = `${match[3]}-${match[2]}-${match[1]}`;
        return iso >= '2026-09-27';
      }
      return d >= '2026-09-27';
    }
    return false;
  });

  console.log(`Excel rows since 27-Sep-2026: ${excelRows.length}`);

  // Fetch all work orders from DB
  const { data: dbWOs } = await supabase
    .from('work_orders')
    .select('id, work_order_no, customer_name, size_od, size_wt');

  const woMap = new Map();
  dbWOs.forEach(w => {
    woMap.set(w.work_order_no.toUpperCase().trim(), w);
    // Also map without prefix / suffix if needed
    const parts = w.work_order_no.split('-');
    const shortNo = parts[parts.length - 1]?.trim();
    if (shortNo) woMap.set(shortNo.toUpperCase(), w);
  });

  // Group Excel by Work Order
  const excelSummaryByWO = new Map();
  for (const r of excelRows) {
    const rawWo = String(r['W.O.NO.'] || '').trim();
    const shortWo = String(r['Work order no'] || '').trim();
    const matchedWO = woMap.get(rawWo.toUpperCase()) || woMap.get(shortWo.toUpperCase());

    const key = matchedWO ? matchedWO.work_order_no : (rawWo || shortWo);
    if (!excelSummaryByWO.has(key)) {
      excelSummaryByWO.set(key, {
        work_order_no: key,
        db_wo_id: matchedWO?.id || null,
        excel_ok_pcs: 0,
        excel_total_ok_pcs: 0,
        excel_total_mt: 0,
        excel_rec_pcs: 0,
        excel_salvage_pcs: 0,
        excel_rework_ok_pcs: 0,
        excel_reject_pcs: 0,
        dates: new Set(),
        heat_nos: new Set(),
        batches: []
      });
    }

    const item = excelSummaryByWO.get(key);
    item.excel_ok_pcs += Number(r['OK'] || 0);
    item.excel_total_ok_pcs += Number(r['TOTAL OK'] || 0);
    item.excel_total_mt += Number(r['TOTAL MT'] || 0);
    item.excel_rec_pcs += Number(r['REC.'] || 0);
    item.excel_salvage_pcs += Number(r['SALVAGE'] || 0);
    item.excel_rework_ok_pcs += Number(r['REWORK OK'] || 0);
    item.excel_reject_pcs += Number(r['Reject'] || 0);
    item.dates.add(excelDateToDateStr(r.DATE));
    if (r['HEAT NO.']) item.heat_nos.add(String(r['HEAT NO.']).trim());
    item.batches.push({
      date: excelDateToDateStr(r.DATE),
      shift: r.SHIFT,
      heat: r['HEAT NO.'],
      batch: r['B. NO.'],
      rec: r['REC.'],
      ok: r['OK'],
      total_ok: r['TOTAL OK'],
      total_mt: r['TOTAL MT']
    });
  }

  console.log(`Excel Work Orders (>= 27-Sep): ${excelSummaryByWO.size}`);

  // Fetch production logs for all these work orders
  const { data: stages } = await supabase.from('process_stages').select('*');
  const stageMap = new Map();
  stages.forEach(s => stageMap.set(s.id, s));

  const { data: dbLogs } = await supabase
    .from('production_logs')
    .select('*');

  console.log(`Total production logs in DB: ${dbLogs.length}`);

  // Group DB logs by work_order_id
  const dbLogsByWoId = new Map();
  dbLogs.forEach(l => {
    if (!dbLogsByWoId.has(l.work_order_id)) {
      dbLogsByWoId.set(l.work_order_id, []);
    }
    dbLogsByWoId.get(l.work_order_id).push(l);
  });

  // Let's inspect rolling logs vs HTC OK in DB
  const rollingStageId = stages.find(s => s.stage_code === 'ROLLING')?.id;

  // Compare for each WO
  const comparison = [];

  for (const [woNo, ex] of excelSummaryByWO.entries()) {
    const woId = ex.db_wo_id;
    const woLogs = woId ? (dbLogsByWoId.get(woId) || []) : [];

    // Filter DB logs for this WO that are on or after 2026-09-27
    const recentLogs = woLogs.filter(l => {
      const pDate = l.process_date || (l.created_at ? l.created_at.split('T')[0] : '');
      return pDate >= '2026-09-27';
    });

    // Also look at ALL logs for this WO in DB
    let dbAllRollingPcs = 0;
    let dbAllRollingMtr = 0;
    let dbAllHtcOkPcs = 0;

    let dbRecentRollingPcs = 0;
    let dbRecentRollingMtr = 0;
    let dbRecentHtcOkPcs = 0;

    for (const l of woLogs) {
      const pcs = extractPcs(l.remarks);
      const isRolling = l.stage_id === rollingStageId;
      const htcOkVal = Number(l.htc_ok || 0);

      if (isRolling) {
        dbAllRollingPcs += pcs;
        dbAllRollingMtr += Number(l.output_qty || 0);
      }
      dbAllHtcOkPcs += htcOkVal;
    }

    for (const l of recentLogs) {
      const pcs = extractPcs(l.remarks);
      const isRolling = l.stage_id === rollingStageId;
      const htcOkVal = Number(l.htc_ok || 0);

      if (isRolling) {
        dbRecentRollingPcs += pcs;
        dbRecentRollingMtr += Number(l.output_qty || 0);
      }
      dbRecentHtcOkPcs += htcOkVal;
    }

    comparison.push({
      woNo,
      db_wo_id: woId,
      excel_ok_pcs: ex.excel_ok_pcs,
      excel_total_ok_pcs: ex.excel_total_ok_pcs,
      excel_rec_pcs: ex.excel_rec_pcs,
      excel_dates: Array.from(ex.dates).sort(),
      dbRecentRollingPcs,
      dbRecentRollingMtr,
      dbRecentHtcOkPcs,
      dbAllRollingPcs,
      dbAllRollingMtr,
      dbAllHtcOkPcs,
      totalDbLogs: woLogs.length,
      recentDbLogs: recentLogs.length
    });
  }

  // Print comparison table / findings
  console.log('\n================ COMPARISON RESULTS (>= 2026-09-27) ================');
  console.log(`Found ${comparison.length} work orders in Excel.`);

  console.log('\n--- Sample 10 comparisons ---');
  console.log(JSON.stringify(comparison.slice(0, 10), null, 2));

  // Check where System > Excel or Excel > System
  // Let's see how DB stores HTC OK vs Rolling
  const withDbHtcOk = comparison.filter(c => c.dbRecentHtcOkPcs > 0 || c.dbAllHtcOkPcs > 0);
  console.log(`\nWOs with dbAllHtcOkPcs > 0: ${withDbHtcOk.length}`);

  const withDbRolling = comparison.filter(c => c.dbAllRollingPcs > 0 || c.dbRecentRollingPcs > 0);
  console.log(`WOs with dbAllRollingPcs > 0: ${withDbRolling.length}`);
}

main().catch(console.error);
