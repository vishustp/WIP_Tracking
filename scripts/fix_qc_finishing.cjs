// scripts/fix_qc_finishing.cjs
const fs = require('fs');

const SUPABASE_URL = "https://dzhvbftmuwfyuaarsxtk.supabase.co/rest/v1";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6aHZiZnRtdXdmeXVhYXJzeHRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzUwOTYzNywiZXhwIjoyMTAzMDg1NjM3fQ.jtkcZxBOmgEEHvBzGIHYdPpzJf2zA5xfdJZ6XuDSmds";

const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=minimal",
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

async function run() {
  const wosRes = await fetch(`${SUPABASE_URL}/work_orders?work_order_no=in.(6204,6242,6290,6104)&select=id,work_order_no`, { headers });
  const wos = await wosRes.json();
  const woMap = new Map();
  wos.forEach(w => woMap.set(w.work_order_no, w.id));

  // 1. Update QC for 6204 -> 533 pcs
  const id6204 = woMap.get('6204');
  if (id6204) {
    const qcRes = await fetch(`${SUPABASE_URL}/qc_inspections?work_order_id=eq.${id6204}`, { headers });
    const qcList = await qcRes.json();
    for (const q of qcList) {
      await fetch(`${SUPABASE_URL}/qc_inspections?id=eq.${q.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ inspected_pcs: 533, vdi_ok_pcs: 533 }),
      });
      console.log(`Updated QC ${q.id} for WO 6204 -> 533 PCS`);
    }
  }

  // 2. Update QC for 6242 -> 604 pcs
  const id6242 = woMap.get('6242');
  if (id6242) {
    const qcRes = await fetch(`${SUPABASE_URL}/qc_inspections?work_order_id=eq.${id6242}`, { headers });
    const qcList = await qcRes.json();
    for (const q of qcList) {
      await fetch(`${SUPABASE_URL}/qc_inspections?id=eq.${q.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ inspected_pcs: 604, vdi_ok_pcs: 576 }),
        });
      console.log(`Updated QC ${q.id} for WO 6242 -> 604 PCS`);
    }
  }

  // 3. Update Finishing for 6290 -> 157 pcs
  const id6290 = woMap.get('6290');
  if (id6290) {
    const finRes = await fetch(`${SUPABASE_URL}/production_logs?work_order_id=eq.${id6290}&stage_id=eq.5e6820b3-dbe7-4b25-b715-255620f01955`, { headers });
    const finList = await finRes.json();
    for (const l of finList) {
      await fetch(`${SUPABASE_URL}/production_logs?id=eq.${l.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          output_qty: 942.0,
          remarks: updateRemarksWithPcs(l.remarks, 157, 0),
        }),
      });
      console.log(`Updated Finishing log ${l.id} for WO 6290 -> 157 PCS (942.0 MTR)`);
    }
  }

  // 4. Update Finishing for 6104 -> 15 pcs
  const id6104 = woMap.get('6104');
  if (id6104) {
    const finRes = await fetch(`${SUPABASE_URL}/production_logs?work_order_id=eq.${id6104}&stage_id=eq.5e6820b3-dbe7-4b25-b715-255620f01955`, { headers });
    const finList = await finRes.json();
    for (const l of finList) {
      await fetch(`${SUPABASE_URL}/production_logs?id=eq.${l.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          output_qty: 90.0,
          remarks: updateRemarksWithPcs(l.remarks, 15, 0),
        }),
      });
      console.log(`Updated Finishing log ${l.id} for WO 6104 -> 15 PCS (90.0 MTR)`);
    }
  }

  // 5. Check remaining Rolling meterage on 6257, 6358
  // WO 6257 Plan 03-M1 + Plan 05-M3 -> 8566 pcs rolled <= 8916 planned pcs. Correct meterage = 8566 * 6.835m = 58548.61 Mtr <= 60552.69 Mtr
  const id6257 = (await (await fetch(`${SUPABASE_URL}/work_orders?work_order_no=eq.6257&select=id`, { headers })).json())[0]?.id;
  if (id6257) {
    // Log c8e9406a-364c-4bd2-93a3-9dce03f9ad1d: set output_qty = 9589.51 (1403 pcs * 6.835m)
    await fetch(`${SUPABASE_URL}/production_logs?id=eq.c8e9406a-364c-4bd2-93a3-9dce03f9ad1d`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ output_qty: 9589.51 }),
    });
    console.log("Corrected log c8e9406a on WO 6257 to 9589.51 MTR");
  }

  // WO 6358: 1940 pcs rolled * 7.08m = 13735.2 Mtr <= 17629.2 Mtr planned
  const id6358 = (await (await fetch(`${SUPABASE_URL}/work_orders?work_order_no=eq.6358&select=id`, { headers })).json())[0]?.id;
  if (id6358) {
    // Log a0bc3b93-56da-4924-a8e5-80e0c4c8df14: set output_qty = 13735.2 Mtr
    await fetch(`${SUPABASE_URL}/production_logs?id=eq.a0bc3b93-56da-4924-a8e5-80e0c4c8df14`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ output_qty: 13735.2 }),
    });
    console.log("Corrected log a0bc3b93 on WO 6358 to 13735.2 MTR");
  }

  console.log("All QC and Finishing logs aligned successfully!");
}

run().catch(err => console.error(err));
