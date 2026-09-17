// scripts/check_hht_compliance.cjs
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
  const [stages, logs, wos] = await Promise.all([
    fetch(`${SUPABASE_URL}/process_stages?select=*`, { headers }).then(r => r.json()),
    fetch(`${SUPABASE_URL}/production_logs?select=*&order=created_at.asc`, { headers }).then(r => r.json()),
    fetch(`${SUPABASE_URL}/work_orders?select=id,work_order_no,customer_name,grade`, { headers }).then(r => r.json()),
  ]);

  const rollingStageId = stages.find(s => s.stage_code === "ROLLING")?.id;
  const hhtStageId = stages.find(s => s.stage_code === "HOLLOW_HEAT_TREATMENT")?.id;

  const logsByWo = new Map();
  logs.forEach(l => {
    if (!logsByWo.has(l.work_order_id)) logsByWo.set(l.work_order_id, []);
    logsByWo.get(l.work_order_id).push(l);
  });

  const woMap = new Map();
  wos.forEach(w => woMap.set(w.id, w));

  console.log("=== HOLLOW HEAT TREATMENT (HHT) AUDIT ===");
  for (const [woId, woLogs] of logsByWo.entries()) {
    const hhtLogs = woLogs.filter(l => l.stage_id === hhtStageId);
    if (hhtLogs.length === 0) continue;

    const rollLogs = woLogs.filter(l => l.stage_id === rollingStageId);
    const rollHtcPcs = rollLogs.reduce((sum, l) => sum + (extractPcsFromRemarks(l.remarks).pcs || 0), 0);
    const hhtOutPcs = hhtLogs.reduce((sum, l) => sum + (extractPcsFromRemarks(l.remarks).pcs || 0), 0);

    const wo = woMap.get(woId);
    console.log(`WO ${wo?.work_order_no} (${wo?.customer_name}, ${wo?.grade}): Rolling HTC OK = ${rollHtcPcs} PCS, HHT Output = ${hhtOutPcs} PCS`);

    if (hhtOutPcs > rollHtcPcs) {
      console.log(`   -> Excess HHT: ${hhtOutPcs - rollHtcPcs} PCS. Trimming HHT log...`);
      for (const l of hhtLogs) {
        await fetch(`${SUPABASE_URL}/production_logs?id=eq.${l.id}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({
            output_qty: rollHtcPcs * 6.0,
            remarks: updateRemarksWithPcs(l.remarks, rollHtcPcs, 0),
          }),
        });
        console.log(`   -> Trimmed HHT log ${l.id} to ${rollHtcPcs} PCS (${rollHtcPcs * 6.0} MTR)`);
      }
    }
  }
}

run().catch(err => console.error(err));
