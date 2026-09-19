const xlsx = require('xlsx');

const file = 'C:\\Users\\Kallol Bera\\Downloads\\HTC Data UPLOAD.xlsx';
const wb = xlsx.readFile(file);
const sheet = wb.Sheets['Sheet3'];
const raw = xlsx.utils.sheet_to_json(sheet);

console.log('Testing full import simulation for', raw.length, 'rows from HTC Data UPLOAD.xlsx');

const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6aHZiZnRtdXdmeXVhYXJzeHRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzUwOTYzNywiZXhwIjoyMTAzMDg1NjM3fQ.jtkcZxBOmgEEHvBzGIHYdPpzJf2zA5xfdJZ6XuDSmds";
const headers = {
  "apikey": key,
  "Authorization": `Bearer ${key}`,
  "Content-Type": "application/json"
};
const base = "https://dzhvbftmuwfyuaarsxtk.supabase.co/rest/v1";

async function run() {
  const fetch = globalThis.fetch;

  // 1. Fetch work orders
  const woRes = await fetch(`${base}/work_orders?select=id,work_order_no&limit=2000`, { headers });
  const workOrders = await woRes.json();
  const woMap = new Map();
  workOrders.forEach(w => woMap.set(String(w.work_order_no).toLowerCase().trim(), w.id));

  // 2. Fetch stage
  const stageRes = await fetch(`${base}/process_stages?stage_code=eq.ROLLING&select=id`, { headers });
  const stages = await stageRes.json();
  const stageId = stages[0].id;

  // 3. Fetch routes
  const planRes = await fetch(`${base}/rolling_plans?select=work_order_id,process_route_id&limit=2000`, { headers });
  const plans = await planRes.json();
  const planRouteMap = new Map();
  plans.forEach(p => {
    if (p.work_order_id && p.process_route_id) planRouteMap.set(p.work_order_id, p.process_route_id);
  });

  const defaultRouteId = "782d79c8-91e1-49b9-9f8c-2432773c2c79";

  let successCount = 0;
  let failCount = 0;
  const errors = [];

  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    const woNo = String(r['WORK ORDER NO.'] || r['W.O.NO.'] || '').trim();
    const woId = woMap.get(woNo.toLowerCase());
    if (!woId) {
      failCount++;
      errors.push(`Row ${i+1} (WO ${woNo}): WO not found in DB`);
      continue;
    }

    const outPcs = Number(r['Rolled Gross (Pcs)'] || r['OK'] || 0);
    const outMtr = Number(r['Rolled Gross (MTR)'] || r['OK Mtr'] || 0);
    const htcPcs = Number(r['HTC OK PCS'] || 0);
    const htcMtr = Number(r['HTC OK MTR'] || 0);
    const rejPcs = Number(r['Reject'] || r['REJECT'] || (outPcs > htcPcs ? outPcs - htcPcs : 0));
    const rejMtr = Number(r['Reject Mtr'] || (outMtr > htcMtr ? outMtr - htcMtr : 0));
    const heatLot = r['HEAT NO.'] || r['B. NO.'] || null;
    const defect = r['Defect Reason'] ? `[Defect: ${String(r['Defect Reason']).trim()}]` : '';
    const bundle = r['B. NO.'] ? `[Bundle: ${String(r['B. NO.']).trim()}]` : '';
    const salvage = r['SALVAGE'] ? `[Salvage: ${r['SALVAGE']}]` : '';
    const finalRemarks = [defect, bundle, salvage].filter(Boolean).join(' ') + ` [PCS:${htcPcs || outPcs},REJ:${rejPcs}]`;

    const payload = {
      work_order_id: woId,
      stage_id: stageId,
      process_route_id: planRouteMap.get(woId) || defaultRouteId,
      process_date: "2026-09-19",
      input_qty: outMtr || htcMtr || 1,
      output_qty: outMtr || htcMtr || 1,
      rejection_qty: rejMtr,
      htc_ok: htcMtr || outMtr,
      heat_lot_no: heatLot,
      remarks: finalRemarks
    };

    const insRes = await fetch(`${base}/production_logs`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    if (insRes.ok) {
      successCount++;
    } else {
      const errText = await insRes.text();
      failCount++;
      errors.push(`Row ${i+1} (WO ${woNo}): ${errText}`);
    }
  }

  console.log(`\nImport Result: ${successCount} SUCCESS, ${failCount} FAILED out of ${raw.length} rows.`);
  if (errors.length > 0) {
    console.log('Errors (first 10):', errors.slice(0, 10));
  }
}

run();
