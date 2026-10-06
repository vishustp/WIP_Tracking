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

function parseDate(val) {
  if (typeof val === 'number') {
    const utc_days = Math.floor(val - 25569);
    const utc_value = utc_days * 86400;
    const d = new Date(utc_value * 1000);
    return d.toISOString().split('T')[0];
  }
  if (typeof val === 'string') {
    const m = val.match(/(\d{1,2})[\.\/-](\d{1,2})[\.\/-](\d{4})/);
    if (m) {
      return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    }
    return val;
  }
  return '';
}

function extractPcs(rem) {
  if (!rem) return 0;
  const m = rem.match(/\[PCS:\s*(\d+)\]/i) || rem.match(/PCS:\s*(\d+)/i);
  return m ? parseInt(m[1], 10) : 0;
}

async function main() {
  // 1. Read Excel
  const wb = XLSX.readFile('htc ok.xlsx');
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  
  // Filter >= 2026-09-27
  const excelFiltered = rows.filter(r => {
    const d = parseDate(r.DATE);
    return d >= '2026-09-27';
  });

  console.log(`Excel filtered rows (>= 2026-09-27): ${excelFiltered.length}`);

  // Fetch DB work orders
  const { data: dbWos } = await supabase
    .from('work_orders')
    .select('id, work_order_no, customer_name, size_od, size_wt');

  const woById = new Map();
  const woByClean = new Map();
  dbWos.forEach(w => {
    woById.set(w.id, w);
    const rawDigits = w.work_order_no.replace(/[^0-9]/g, '');
    if (rawDigits) {
      const intDigits = parseInt(rawDigits, 10).toString();
      woByClean.set(intDigits, w);
      woByClean.set(rawDigits, w);
    }
  });

  // Group Excel by clean Work Order Number
  const excelSummary = new Map();
  for (const r of excelFiltered) {
    const rawWo = String(r['W.O.NO.'] || '');
    const shortWo = String(r['Work order no'] || '');
    const rawDigits = (shortWo || rawWo).replace(/[^0-9]/g, '');
    const intDigits = rawDigits ? parseInt(rawDigits, 10).toString() : '';
    const matchedWo = woByClean.get(intDigits) || woByClean.get(rawDigits);

    const woNo = matchedWo ? matchedWo.work_order_no : (shortWo || rawWo);
    const woId = matchedWo ? matchedWo.id : null;

    if (!excelSummary.has(woNo)) {
      excelSummary.set(woNo, {
        woNo,
        woId,
        customer: matchedWo?.customer_name || 'N/A',
        size: matchedWo ? `${matchedWo.size_od} x ${matchedWo.size_wt}` : 'N/A',
        excel_rec: 0,
        excel_ok: 0,
        excel_salvage: 0,
        excel_rework_ok: 0,
        excel_total_ok: 0,
        excel_reject: 0,
        excel_total_mt: 0,
        dates: new Set(),
        rows: []
      });
    }

    const ex = excelSummary.get(woNo);
    const rec = Number(r['REC.'] || 0);
    const ok = Number(r['OK'] || 0);
    const salvage = Number(r['SALVAGE'] || 0);
    const rework = Number(r['REWORK OK'] || 0);
    const totOk = Number(r['TOTAL OK'] || 0);
    const rej = Number(r['Reject'] || 0);
    const mt = Number(r['TOTAL MT'] || 0);

    ex.excel_rec += rec;
    ex.excel_ok += ok;
    ex.excel_salvage += salvage;
    ex.excel_rework_ok += rework;
    ex.excel_total_ok += totOk;
    ex.excel_reject += rej;
    ex.excel_total_mt += mt;
    ex.dates.add(parseDate(r.DATE));
    ex.rows.push({ date: parseDate(r.DATE), rec, ok, salvage, rework, totOk, rej, mt, heat: r['HEAT NO.'] });
  }

  // 2. Fetch DB Rolling logs >= 2026-09-27
  const { data: stages } = await supabase.from('process_stages').select('*');
  const rollingStageId = stages.find(s => s.stage_code === 'ROLLING')?.id;

  const { data: dbLogs } = await supabase
    .from('production_logs')
    .select('*, work_orders(id, work_order_no, customer_name, size_od, size_wt)')
    .eq('stage_id', rollingStageId)
    .gte('process_date', '2026-09-27');

  const dbSummary = new Map();
  for (const l of dbLogs) {
    const woNo = l.work_orders?.work_order_no || 'UNKNOWN';
    if (!dbSummary.has(woNo)) {
      dbSummary.set(woNo, {
        woNo,
        woId: l.work_order_id,
        customer: l.work_orders?.customer_name || 'N/A',
        size: l.work_orders ? `${l.work_orders.size_od} x ${l.work_orders.size_wt}` : 'N/A',
        db_rolling_pcs: 0,
        db_rolling_mtr: 0,
        db_htc_ok_mtr: 0,
        dates: new Set(),
        logs: []
      });
    }
    const d = dbSummary.get(woNo);
    const pcs = extractPcs(l.remarks);
    d.db_rolling_pcs += pcs;
    d.db_rolling_mtr += Number(l.output_qty || 0);
    d.db_htc_ok_mtr += Number(l.htc_ok || 0);
    d.dates.add(l.process_date);
    d.logs.push({ date: l.process_date, pcs, out_mtr: l.output_qty, htc_mtr: l.htc_ok, rem: l.remarks });
  }

  // Combine comparison
  const allWoNos = new Set([...excelSummary.keys(), ...dbSummary.keys()]);
  const comparison = [];

  for (const woNo of allWoNos) {
    const ex = excelSummary.get(woNo) || {
      woNo,
      customer: 'N/A',
      size: 'N/A',
      excel_rec: 0,
      excel_ok: 0,
      excel_salvage: 0,
      excel_rework_ok: 0,
      excel_total_ok: 0,
      excel_reject: 0,
      excel_total_mt: 0,
      dates: new Set(),
      rows: []
    };

    const db = dbSummary.get(woNo) || {
      woNo,
      customer: 'N/A',
      size: 'N/A',
      db_rolling_pcs: 0,
      db_rolling_mtr: 0,
      db_htc_ok_mtr: 0,
      dates: new Set(),
      logs: []
    };

    const customer = db.customer !== 'N/A' ? db.customer : ex.customer;
    const size = db.size !== 'N/A' ? db.size : ex.size;

    comparison.push({
      woNo,
      customer,
      size,
      excel_rec: ex.excel_rec,
      excel_ok: ex.excel_ok,
      excel_salvage: ex.excel_salvage,
      excel_rework_ok: ex.excel_rework_ok,
      excel_total_ok: ex.excel_total_ok,
      excel_dates: Array.from(ex.dates).sort(),
      db_rolling_pcs: db.db_rolling_pcs,
      db_rolling_mtr: Number(db.db_rolling_mtr.toFixed(2)),
      db_htc_ok_mtr: Number(db.db_htc_ok_mtr.toFixed(2)),
      db_dates: Array.from(db.dates).sort(),
      // Comparison metrics:
      diff_db_minus_excel_tot_ok: db.db_rolling_pcs - ex.excel_total_ok,
      diff_db_minus_excel_ok_only: db.db_rolling_pcs - ex.excel_ok,
      diff_db_minus_excel_rec: db.db_rolling_pcs - ex.excel_rec
    });
  }

  comparison.sort((a, b) => a.woNo.localeCompare(b.woNo));

  console.log('\n================================================================');
  console.log('RE-VERIFIED COMPARISON TABLE (SINCE 27-SEP-2026)');
  console.log('================================================================');

  // Check 1: In DB, any log where htc_ok > output_qty?
  const dbHtcMoreThanOut = dbLogs.filter(l => Number(l.htc_ok || 0) > Number(l.output_qty || 0));
  console.log(`Check A: DB logs where htc_ok (mtr) > output_qty (mtr): ${dbHtcMoreThanOut.length}`);

  // Check 2: In Excel, any row where TOTAL OK > REC?
  const exTotalOkMoreThanRec = excelFiltered.filter(r => Number(r['TOTAL OK'] || 0) > Number(r['REC.'] || 0));
  console.log(`Check B: Excel rows where TOTAL OK > REC: ${exTotalOkMoreThanRec.length}`);

  const matches = comparison.filter(c => c.db_rolling_pcs === c.excel_total_ok && c.excel_total_ok > 0);
  const dbMoreThanTotalOk = comparison.filter(c => c.db_rolling_pcs > c.excel_total_ok);
  const dbLessThanTotalOk = comparison.filter(c => c.db_rolling_pcs < c.excel_total_ok);

  console.log(`\nWork Orders breakdown (Total ${comparison.length}):`);
  console.log(`- Exact Match with Excel TOTAL OK: ${matches.length} WOs`);
  console.log(`- System PCS > Excel TOTAL OK: ${dbMoreThanTotalOk.length} WOs`);
  console.log(`- System PCS < Excel TOTAL OK: ${dbLessThanTotalOk.length} WOs`);

  console.log('\nDetailed list of all 33 Work Orders:');
  console.table(comparison.map(c => ({
    WO: c.woNo,
    Customer: c.customer.slice(0, 18),
    'Ex REC': c.excel_rec,
    'Ex OK': c.excel_ok,
    'Ex Salv': c.excel_salvage,
    'Ex TotOK': c.excel_total_ok,
    'Sys PCS': c.db_rolling_pcs,
    'Sys Mtr': c.db_rolling_mtr,
    'Diff (Sys - TotOK)': c.diff_db_minus_excel_tot_ok,
    Status: c.db_rolling_pcs === c.excel_total_ok ? 'EXACT MATCH' : (c.db_rolling_pcs === 0 ? 'NOT IN DB' : (c.db_rolling_pcs === c.excel_ok ? 'MATCHES OK ONLY' : 'MISMATCH'))
  })));

  console.log('\n--- 1. EXACT MATCHES ---');
  matches.forEach(c => {
    console.log(`WO ${c.woNo}: DB=${c.db_rolling_pcs} PCS | Excel Total OK=${c.excel_total_ok} (OK: ${c.excel_ok}, Salvage: ${c.excel_salvage})`);
  });

  console.log('\n--- 2. DB PCS > EXCEL TOTAL OK ---');
  dbMoreThanTotalOk.forEach(c => {
    console.log(`WO ${c.woNo} (${c.customer}): DB PCS=${c.db_rolling_pcs} > Excel Total OK=${c.excel_total_ok} (Diff: +${c.diff_db_minus_excel_tot_ok}) | Excel OK=${c.excel_ok}, Salvage=${c.excel_salvage}, Rec=${c.excel_rec}`);
  });

  console.log('\n--- 3. DB PCS < EXCEL TOTAL OK ---');
  dbLessThanTotalOk.forEach(c => {
    console.log(`WO ${c.woNo} (${c.customer}): DB PCS=${c.db_rolling_pcs} < Excel Total OK=${c.excel_total_ok} (Diff: ${c.diff_db_minus_excel_tot_ok}) | Excel OK=${c.excel_ok}, Salvage=${c.excel_salvage}, Rec=${c.excel_rec}`);
  });

  // Check also if DB PCS matches Excel OK (without salvage)
  console.log('\n--- 4. DOES DB PCS MATCH EXCEL OK ONLY (WITHOUT SALVAGE)? ---');
  const matchesOkOnly = comparison.filter(c => c.db_rolling_pcs === c.excel_ok && c.excel_ok > 0 && c.excel_salvage > 0);
  matchesOkOnly.forEach(c => {
    console.log(`WO ${c.woNo}: DB=${c.db_rolling_pcs} matches Excel OK=${c.excel_ok} exactly! (Salvage was ${c.excel_salvage}, Total OK was ${c.excel_total_ok})`);
  });
}

main().catch(console.error);
