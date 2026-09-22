const SUPABASE_URL = 'https://dzhvbftmuwfyuaarsxtk.supabase.co/rest/v1';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6aHZiZnRtdXdmeXVhYXJzeHRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzUwOTYzNywiZXhwIjoyMTAzMDg1NjM3fQ.jtkcZxBOmgEEHvBzGIHYdPpzJf2zA5xfdJZ6XuDSmds';
const headers = { apikey: KEY, Authorization: 'Bearer ' + KEY };

async function main() {
  const [logs, wos, stages] = await Promise.all([
    fetch(SUPABASE_URL + '/production_logs?limit=5000', { headers }).then(r => r.json()),
    fetch(SUPABASE_URL + '/work_orders?select=id,work_order_no,customer_name,size_od,size_wt,grade', { headers }).then(r => r.json()),
    fetch(SUPABASE_URL + '/process_stages?stage_code=eq.HEAT_TREATMENT', { headers }).then(r => r.json())
  ]);

  const htStageId = stages[0]?.id;
  const woMap = new Map(wos.map(w => [w.id, w]));
  const htLogs = logs.filter(l => l.stage_id === htStageId);

  // Group by exact match of WO, process_date, output_qty, remarks
  const exactMap = new Map();
  htLogs.forEach(l => {
    const key = l.work_order_id + '|' + l.process_date + '|' + l.output_qty + '|' + (l.remarks || '');
    const list = exactMap.get(key) || [];
    list.push(l);
    exactMap.set(key, list);
  });

  const dupGroups = Array.from(exactMap.values()).filter(list => list.length > 1);

  console.log('HEAT_TREATMENT_DUPLICATES_COUNT:', dupGroups.length);

  const formatted = dupGroups.map((list, idx) => {
    const wo = woMap.get(list[0].work_order_id);
    return {
      group: idx + 1,
      wo_no: wo?.work_order_no,
      customer: wo?.customer_name,
      size: `${wo?.size_od} x ${wo?.size_wt}`,
      grade: wo?.grade,
      process_date: list[0].process_date,
      qty_per_log: list[0].output_qty,
      copies: list.length,
      excess_qty: (list.length - 1) * list[0].output_qty,
      copies_data: list.map((l, cIdx) => ({
        copy_no: cIdx + 1,
        id: l.id,
        heat_lot_no: l.heat_lot_no || 'N/A',
        lot_no: l.lot_no || 'N/A',
        remarks: l.remarks || '',
        shift: l.shift || 'N/A',
        operator_name: l.operator_name || 'N/A',
        created_at: l.created_at
      }))
    };
  });

  console.log(JSON.stringify(formatted, null, 2));
}

main().catch(console.error);
