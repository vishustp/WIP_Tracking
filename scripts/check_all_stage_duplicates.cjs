const SUPABASE_URL = 'https://dzhvbftmuwfyuaarsxtk.supabase.co/rest/v1';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6aHZiZnRtdXdmeXVhYXJzeHRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzUwOTYzNywiZXhwIjoyMTAzMDg1NjM3fQ.jtkcZxBOmgEEHvBzGIHYdPpzJf2zA5xfdJZ6XuDSmds';
const headers = { apikey: KEY, Authorization: 'Bearer ' + KEY };

async function main() {
  const [logs, wos, stages] = await Promise.all([
    fetch(SUPABASE_URL + '/production_logs?select=id,work_order_id,stage_id,output_qty,rejection_qty,remarks,process_date,created_at&limit=5000', { headers }).then(r => r.json()),
    fetch(SUPABASE_URL + '/work_orders?select=id,work_order_no', { headers }).then(r => r.json()),
    fetch(SUPABASE_URL + '/process_stages?select=id,stage_code', { headers }).then(r => r.json())
  ]);

  const woMap = new Map(wos.map(w => [w.id, w.work_order_no]));
  const stageMap = new Map(stages.map(s => [s.id, s.stage_code]));

  const stageDups = {};
  const exactMap = new Map();
  logs.forEach(l => {
    const key = l.work_order_id + '|' + l.stage_id + '|' + l.process_date + '|' + l.output_qty;
    const list = exactMap.get(key) || [];
    list.push(l);
    exactMap.set(key, list);
  });

  exactMap.forEach((list, k) => {
    if (list.length > 1) {
      const stg = stageMap.get(list[0].stage_id) || 'UNKNOWN';
      const copies = list.length - 1;
      const extraMtr = copies * Number(list[0].output_qty || 0);
      if (!stageDups[stg]) stageDups[stg] = { groups: 0, extraCopies: 0, extraMtr: 0, details: [] };
      stageDups[stg].groups++;
      stageDups[stg].extraCopies += copies;
      stageDups[stg].extraMtr += extraMtr;
      stageDups[stg].details.push({
        wo: woMap.get(list[0].work_order_id),
        date: list[0].process_date,
        qty: list[0].output_qty,
        copies: list.length,
        ids: list.map(l => l.id)
      });
    }
  });

  console.log('=== DUPLICATE SUMMARY ACROSS ALL PRODUCTION STAGES ===');
  let grandTotalExtraMtr = 0;
  for (const [stg, info] of Object.entries(stageDups)) {
    grandTotalExtraMtr += info.extraMtr;
    console.log(`\nStage: ${stg}`);
    console.log(`  Duplicate groups: ${info.groups}, Extra duplicated rows: ${info.extraCopies}, Extra Quantity: ${info.extraMtr.toFixed(2)} m`);
    info.details.forEach(d => {
      console.log(`    WO ${d.wo} on ${d.date}: ${d.qty}m (${d.copies} copies)`);
    });
  }
  console.log(`\nGRAND TOTAL EXCESS DUPLICATE METERS ACROSS FACTORY: ${grandTotalExtraMtr.toFixed(2)} m`);
}

main().catch(console.error);
