const SUPABASE_URL = 'https://dzhvbftmuwfyuaarsxtk.supabase.co/rest/v1';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6aHZiZnRtdXdmeXVhYXJzeHRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzUwOTYzNywiZXhwIjoyMTAzMDg1NjM3fQ.jtkcZxBOmgEEHvBzGIHYdPpzJf2zA5xfdJZ6XuDSmds';
const headers = { apikey: KEY, Authorization: 'Bearer ' + KEY };

async function main() {
  const [logs, wos, stages] = await Promise.all([
    fetch(SUPABASE_URL + '/production_logs?select=id,work_order_id,stage_id,output_qty,rejection_qty,htc_ok,remarks,process_date,created_at&limit=5000', { headers }).then(r => r.json()),
    fetch(SUPABASE_URL + '/work_orders?select=id,work_order_no,customer_name', { headers }).then(r => r.json()),
    fetch(SUPABASE_URL + '/process_stages?select=id,stage_code', { headers }).then(r => r.json())
  ]);

  const woMap = new Map(wos.map(w => [w.id, w.work_order_no]));
  const stageMap = new Map(stages.map(s => [s.id, s.stage_code]));

  console.log('Total production logs:', logs.length);

  // 1. Check for Duplicate Bundle Numbers in remarks
  const bundleMap = new Map();
  logs.forEach(l => {
    const m = l.remarks?.match(/\[Bundle:\s*([^\]]+)\]/i);
    if (m) {
      const bundleNo = m[1].trim();
      const list = bundleMap.get(bundleNo) || [];
      list.push(l);
      bundleMap.set(bundleNo, list);
    }
  });

  const dupBundles = Array.from(bundleMap.entries()).filter(([k, list]) => list.length > 1);
  console.log('\n======================================================');
  console.log('1. DUPLICATE BUNDLE NUMBERS IN REMARKS (count: ' + dupBundles.length + ')');
  console.log('======================================================');
  dupBundles.forEach(([bundleNo, list]) => {
    console.log(`Bundle: ${bundleNo} (appears ${list.length} times):`);
    list.forEach(l => {
      console.log(`  id: ${l.id}, WO: ${woMap.get(l.work_order_id)}, Stage: ${stageMap.get(l.stage_id)}, Date: ${l.process_date}, Out: ${l.output_qty}, Created: ${l.created_at}`);
    });
  });

  // 2. Check for Exact Duplicate Rows (same WO, stage, date, output_qty, remarks)
  const exactMap = new Map();
  logs.forEach(l => {
    const key = `${l.work_order_id}_${l.stage_id}_${l.process_date}_${l.output_qty}_${l.remarks}`;
    const list = exactMap.get(key) || [];
    list.push(l);
    exactMap.set(key, list);
  });

  const exactDups = Array.from(exactMap.entries()).filter(([k, list]) => list.length > 1);
  console.log('\n======================================================');
  console.log('2. EXACT DUPLICATE LOG ENTRIES (count: ' + exactDups.length + ')');
  console.log('======================================================');
  let exactDupMtr = 0;
  exactDups.forEach(([key, list]) => {
    const sample = list[0];
    const extraCopies = list.length - 1;
    exactDupMtr += extraCopies * Number(sample.output_qty || 0);
    console.log(`WO: ${woMap.get(sample.work_order_id)}, Stage: ${stageMap.get(sample.stage_id)}, Date: ${sample.process_date}, Qty: ${sample.output_qty}, Remarks: ${sample.remarks} (Copies: ${list.length})`);
    list.forEach(l => console.log(`  -> id: ${l.id}, created_at: ${l.created_at}`));
  });
  console.log('Total excess meters from exact duplicates:', exactDupMtr.toFixed(2));

  // 3. Inspect Rolling Mill near-duplicates or rapid imports
  const rollStageId = stages.find(s => s.stage_code === 'ROLLING')?.id;
  const rollLogs = logs.filter(l => l.stage_id === rollStageId);
  console.log('\n======================================================');
  console.log('3. ROLLING LOGS NEAR-DUPLICATES CHECK (Total: ' + rollLogs.length + ')');
  console.log('======================================================');
  const suspicious = [];
  for (let i = 0; i < rollLogs.length; i++) {
    for (let j = i + 1; j < rollLogs.length; j++) {
      const a = rollLogs[i];
      const b = rollLogs[j];
      if (a.work_order_id === b.work_order_id && Math.abs(a.output_qty - b.output_qty) < 0.01) {
        const tA = new Date(a.created_at).getTime();
        const tB = new Date(b.created_at).getTime();
        if (Math.abs(tA - tB) < 5000) {
          suspicious.push({ a, b, diffSec: Math.abs(tA - tB) / 1000 });
        }
      }
    }
  }
  console.log('Rolling logs with same WO and same Qty created within 5s:', suspicious.length);
  suspicious.slice(0, 15).forEach(({ a, b, diffSec }) => {
    console.log(`WO: ${woMap.get(a.work_order_id)}, Date: ${a.process_date}, Qty: ${a.output_qty}, DiffSec: ${diffSec}s`);
    console.log(`  Log A: ${a.id}, remarks: "${a.remarks}", created: ${a.created_at}`);
    console.log(`  Log B: ${b.id}, remarks: "${b.remarks}", created: ${b.created_at}`);
  });

  // 4. Inspect the top over-rolled work orders specifically (6141, 6311, 6337, 6244, etc.)
  const targetWos = ['6141', '6311', '6337', '6244', '6070', '6214', '6207', '6291', '6215', '6270'];
  console.log('\n======================================================');
  console.log('4. DETAILED LOGS FOR TOP OVER-ROLLED ORDERS');
  console.log('======================================================');
  targetWos.forEach(woNo => {
    const woId = wos.find(w => w.work_order_no === woNo)?.id;
    if (!woId) return;
    const wLogs = logs.filter(l => l.work_order_id === woId && stageMap.get(l.stage_id) === 'ROLLING');
    console.log(`\nWO ${woNo} - Rolling Logs: ${wLogs.length}, Total Mtr: ${wLogs.reduce((s, l) => s + Number(l.output_qty), 0)}:`);
    wLogs.forEach((l, idx) => {
      console.log(`  [${idx + 1}] id: ${l.id}, date: ${l.process_date}, qty: ${l.output_qty}, remarks: ${l.remarks}, created: ${l.created_at}`);
    });
  });
}

main().catch(console.error);
