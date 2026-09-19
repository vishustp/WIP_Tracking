// scripts/clean_hollow_ht.cjs
const fs = require('fs');
const path = require('path');
const SUPABASE_URL = "https://dzhvbftmuwfyuaarsxtk.supabase.co/rest/v1";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6aHZiZnRtdXdmeXVhYXJzeHRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzUwOTYzNywiZXhwIjoyMTAzMDg1NjM3fQ.jtkcZxBOmgEEHvBzGIHYdPpzJf2zA5xfdJZ6XuDSmds";
const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=representation"
};

async function cleanHollowHt() {
  console.log("================================================================================");
  console.log("           BACKUP & CLEAN HOLLOW HEAT TREATMENT PRODUCTION LOGS                 ");
  console.log("================================================================================\n");

  // 1. Fetch process stage for HOLLOW_HEAT_TREATMENT
  const stagesRes = await fetch(`${SUPABASE_URL}/process_stages?stage_code=eq.HOLLOW_HEAT_TREATMENT&select=id,stage_code,stage_name`, { headers }).then(r => r.json());
  const hhtStage = Array.isArray(stagesRes) && stagesRes.length > 0 ? stagesRes[0] : null;

  if (!hhtStage) {
    console.error("Could not find HOLLOW_HEAT_TREATMENT in process_stages.");
    return;
  }

  console.log(`HOLLOW_HEAT_TREATMENT Stage ID: ${hhtStage.id}`);

  // 2. Fetch all HOLLOW_HEAT_TREATMENT logs
  const hhtLogs = await fetch(`${SUPABASE_URL}/production_logs?stage_id=eq.${hhtStage.id}&select=*`, { headers }).then(r => r.json());
  const hhtList = Array.isArray(hhtLogs) ? hhtLogs : [];

  console.log(`Found ${hhtList.length} HOLLOW_HEAT_TREATMENT production logs.`);

  // 3. Save backup
  const backupDir = path.resolve('scratch');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const backupData = {
    timestamp: new Date().toISOString(),
    hollow_heat_treatment_count: hhtList.length,
    hollow_heat_treatment_logs: hhtList,
  };

  const backupPath = path.join(backupDir, 'backup_hollow_heat_treatment.json');
  fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2), 'utf8');
  console.log(`Backup successfully written to: ${backupPath}`);

  // 4. Delete HOLLOW_HEAT_TREATMENT logs
  if (hhtList.length > 0) {
    console.log(`\nDeleting ${hhtList.length} HOLLOW_HEAT_TREATMENT logs...`);
    const delRes = await fetch(`${SUPABASE_URL}/production_logs?stage_id=eq.${hhtStage.id}`, {
      method: 'DELETE',
      headers: { ...headers, Prefer: 'return=representation' }
    });
    console.log(`HOLLOW_HEAT_TREATMENT delete response status: ${delRes.status}`);
  }

  // 5. Verify Database State
  const [checkHht, checkDraw, checkHt, checkRoll] = await Promise.all([
    fetch(`${SUPABASE_URL}/production_logs?stage_id=eq.${hhtStage.id}&select=id`, { headers }).then(r => r.json()),
    fetch(`${SUPABASE_URL}/production_logs?select=id,process_stages!inner(stage_code)&process_stages.stage_code=eq.DRAW`, { headers }).then(r => r.json()),
    fetch(`${SUPABASE_URL}/production_logs?select=id,process_stages!inner(stage_code)&process_stages.stage_code=eq.HEAT_TREATMENT`, { headers }).then(r => r.json()),
    fetch(`${SUPABASE_URL}/production_logs?select=id,process_stages!inner(stage_code)&process_stages.stage_code=eq.ROLLING`, { headers }).then(r => r.json()),
  ]);

  console.log("\n================================================================================");
  console.log("                        DATABASE STATE VERIFICATION                             ");
  console.log("================================================================================");
  console.log(`- HOLLOW_HT Logs in DB:        ${Array.isArray(checkHht) ? checkHht.length : 'N/A'} (Expected: 0)`);
  console.log(`- DRAW Logs in DB:             ${Array.isArray(checkDraw) ? checkDraw.length : 'N/A'} (Expected: 0)`);
  console.log(`- HEAT_TREATMENT Logs in DB:   ${Array.isArray(checkHt) ? checkHt.length : 'N/A'} (Expected: 0)`);
  console.log(`- ROLLING Mill Logs in DB:     ${Array.isArray(checkRoll) ? checkRoll.length : 'N/A'} (Intact)`);
  console.log("================================================================================\n");
}

cleanHollowHt();
