// scripts/finalize_cleanup.cjs
const fs = require('fs');

const SUPABASE_URL = "https://dzhvbftmuwfyuaarsxtk.supabase.co/rest/v1";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6aHZiZnRtdXdmeXVhYXJzeHRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzUwOTYzNywiZXhwIjoyMTAzMDg1NjM3fQ.jtkcZxBOmgEEHvBzGIHYdPpzJf2zA5xfdJZ6XuDSmds";

const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
};

function extractPcsFromRemarks(remarks) {
  if (!remarks) return { pcs: null, rejPcs: null, clean: "" };
  const pcsMatch = remarks.match(/\[PCS:(\d+)\]/i);
  const rejMatch = remarks.match(/\[REJ_PCS:(\d+)\]/i);
  const pcs = pcsMatch ? parseInt(pcsMatch[1], 10) : null;
  const rejPcs = rejMatch ? parseInt(rejMatch[1], 10) : null;
  const clean = remarks.replace(/\[PCS:\d+\]/gi, '').replace(/\[REJ_PCS:\d+\]/gi, '').trim();
  return { pcs, rejPcs, clean };
}

function updateRemarksWithPcs(remarks, newPcs, newRejPcs) {
  const { clean } = extractPcsFromRemarks(remarks);
  const tags = [];
  if (newPcs !== null && newPcs !== undefined) tags.push(`[PCS:${Math.round(newPcs)}]`);
  if (newRejPcs !== null && newRejPcs !== undefined && Number(newRejPcs) > 0) tags.push(`[REJ_PCS:${Math.round(newRejPcs)}]`);
  return clean ? `${clean} ${tags.join(' ')}` : tags.join(' ');
}

async function updateLog(logId, patch) {
  const res = await fetch(`${SUPABASE_URL}/production_logs?id=eq.${logId}`, {
    method: 'PATCH',
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Failed to update log ${logId}: ${res.statusText}`);
  return true;
}

async function updateQc(qcId, patch) {
  const res = await fetch(`${SUPABASE_URL}/qc_inspections?id=eq.${qcId}`, {
    method: 'PATCH',
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Failed to update QC ${qcId}: ${res.statusText}`);
  return true;
}

async function run() {
  console.log("Applying final adjustments...");

  // 1. Meterage corrections for Rolling:
  // WO 6214 (Log 4268e0e7-3f3a-4eb0-8025-b4618776b3f7): set output_qty = 1914 (319 * 6m)
  await updateLog("4268e0e7-3f3a-4eb0-8025-b4618776b3f7", { output_qty: 1914.0, htc_ok: 1914.0 });
  console.log("Updated rolling log for WO 6214 -> 1914.0 MTR");

  // WO 6297 (Log 5121f3de-d223-4b8e-87ea-5d9b931f8f3e): 102 pcs * 4.805m = 490.11 Mtr -> total = 2246.31 Mtr
  await updateLog("5121f3de-d223-4b8e-87ea-5d9b931f8f3e", { output_qty: 490.11, htc_ok: 490.11 });
  console.log("Updated rolling log for WO 6297 -> 490.11 MTR");

  // WO 6207 (Log 6808dfbe-a6ca-43eb-8d26-ff7d3e09fb58): 140 pcs * 4.8m = 672.0 Mtr
  await updateLog("6808dfbe-a6ca-43eb-8d26-ff7d3e09fb58", { output_qty: 672.0, htc_ok: 672.0 });
  console.log("Updated rolling log for WO 6207 -> 672.0 MTR");

  // WO 6183 (Log a3e5f01f-d872-4fed-8cd1-e0624f24047a): 2142 pcs * 4.13m = 8846.46 Mtr -> total = 12811.26 Mtr
  await updateLog("a3e5f01f-d872-4fed-8cd1-e0624f24047a", { output_qty: 8846.46, htc_ok: 8846.46 });
  console.log("Updated rolling log for WO 6183 -> 8846.46 MTR");

  // 2. VDI adjustments to match Band Saw:
  // WO 6204 QC (ba7e8dc8-1be2-44ca-8798-75c1dd8618e4): trim to 533 pcs
  const qc6204Res = await fetch(`${SUPABASE_URL}/qc_inspections?work_order_id=eq.74415fa9-e58f-4aa7-920f-074092b704ea`, { headers });
  const qc6204List = await qc6204Res.json();
  if (qc6204List[0]) {
    await updateQc(qc6204List[0].id, { inspected_pcs: 533, vdi_ok_pcs: 533 });
    console.log("Updated QC for WO 6204 -> 533 PCS");
  }

  // WO 6242 QC (f7c4b76c-8717-4af3-a157-c585720234db): trim to 604 pcs
  const qc6242Res = await fetch(`${SUPABASE_URL}/qc_inspections?work_order_id=eq.b8e8f85d-24fc-4b5a-939e-4ff6c8bb82d3`, { headers });
  const qc6242List = await qc6242Res.json();
  if (qc6242List[0]) {
    await updateQc(qc6242List[0].id, { inspected_pcs: 604, vdi_ok_pcs: 576 });
    console.log("Updated QC for WO 6242 -> 604 PCS");
  }

  // 3. Finishing adjustments to match VDI OK:
  // WO 6290 Finishing log: trim to 157 pcs (157 * 6m = 942.0 Mtr)
  const fin6290Res = await fetch(`${SUPABASE_URL}/production_logs?work_order_id=eq.16d234a6-4279-4d33-bc59-cfa2aee3e606&stage_id=eq.5e6820b3-dbe7-4b25-b715-255620f01955`, { headers });
  const fin6290Logs = await fin6290Res.json();
  if (fin6290Logs[0]) {
    await updateLog(fin6290Logs[0].id, {
      output_qty: 942.0,
      remarks: updateRemarksWithPcs(fin6290Logs[0].remarks, 157, 0),
    });
    console.log("Updated Finishing log for WO 6290 -> 157 PCS (942.0 MTR)");
  }

  // WO 6104 Finishing log: trim to 15 pcs (15 * 6m = 90.0 Mtr)
  const fin6104Res = await fetch(`${SUPABASE_URL}/production_logs?work_order_id=eq.ff526b1b-9f93-41bb-a75d-3522f51f385c&stage_id=eq.5e6820b3-dbe7-4b25-b715-255620f01955`, { headers });
  const fin6104Logs = await fin6104Res.json();
  if (fin6104Logs[0]) {
    await updateLog(fin6104Logs[0].id, {
      output_qty: 90.0,
      remarks: updateRemarksWithPcs(fin6104Logs[0].remarks, 15, 0),
    });
    console.log("Updated Finishing log for WO 6104 -> 15 PCS (90.0 MTR)");
  }

  console.log("\nAll final adjustments applied successfully!");
}

run().catch(err => console.error(err));
