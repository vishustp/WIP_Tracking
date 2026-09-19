// scripts/clean_draw_and_ht.cjs
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

async function cleanDrawAndHt() {
  console.log("================================================================================");
  console.log("           BACKUP & CLEAN DRAW AND HEAT TREATMENT PRODUCTION LOGS               ");
  console.log("================================================================================\n");

  // 1. Fetch process stages to get stage IDs for DRAW and HEAT_TREATMENT
  const stagesRes = await fetch(`${SUPABASE_URL}/process_stages?select=id,stage_code,stage_name`, { headers }).then(r => r.json());
  const stages = Array.isArray(stagesRes) ? stagesRes : [];
  
  const drawStage = stages.find(s => s.stage_code === 'DRAW');
  const htStage = stages.find(s => s.stage_code === 'HEAT_TREATMENT');

  if (!drawStage || !htStage) {
    console.error("Could not find DRAW or HEAT_TREATMENT in process_stages.");
    return;
  }

  console.log(`DRAW Stage ID:           ${drawStage.id}`);
  console.log(`HEAT_TREATMENT Stage ID: ${htStage.id}`);

  // 2. Fetch all DRAW and HEAT_TREATMENT logs
  const [drawLogs, htLogs] = await Promise.all([
    fetch(`${SUPABASE_URL}/production_logs?stage_id=eq.${drawStage.id}&select=*`, { headers }).then(r => r.json()),
    fetch(`${SUPABASE_URL}/production_logs?stage_id=eq.${htStage.id}&select=*`, { headers }).then(r => r.json()),
  ]);

  const drawList = Array.isArray(drawLogs) ? drawLogs : [];
  const htList = Array.isArray(htLogs) ? htLogs : [];

  console.log(`\nFound ${drawList.length} DRAW production logs.`);
  console.log(`Found ${htList.length} HEAT_TREATMENT production logs.`);

  // 3. Save backup
  const backupDir = path.resolve('scratch');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const backupData = {
    timestamp: new Date().toISOString(),
    draw_count: drawList.length,
    heat_treatment_count: htList.length,
    draw_logs: drawList,
    heat_treatment_logs: htList,
  };

  const backupPath = path.join(backupDir, 'backup_draw_and_heat_treatment.json');
  fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2), 'utf8');
  console.log(`\nBackup successfully written to: ${backupPath}`);

  // 4. Permanently delete DRAW logs
  if (drawList.length > 0) {
    console.log(`\nDeleting ${drawList.length} DRAW logs...`);
    const delDrawRes = await fetch(`${SUPABASE_URL}/production_logs?stage_id=eq.${drawStage.id}`, {
      method: 'DELETE',
      headers: { ...headers, Prefer: 'return=representation' }
    });
    console.log(`DRAW delete response status: ${delDrawRes.status}`);
  }

  // 5. Permanently delete HEAT_TREATMENT logs
  if (htList.length > 0) {
    console.log(`\nDeleting ${htList.length} HEAT_TREATMENT logs...`);
    const delHtRes = await fetch(`${SUPABASE_URL}/production_logs?stage_id=eq.${htStage.id}`, {
      method: 'DELETE',
      headers: { ...headers, Prefer: 'return=representation' }
    });
    console.log(`HEAT_TREATMENT delete response status: ${delHtRes.status}`);
  }

  // 6. Verify Database State
  const [checkDraw, checkHt, checkRoll, checkHht] = await Promise.all([
    fetch(`${SUPABASE_URL}/production_logs?stage_id=eq.${drawStage.id}&select=id`, { headers }).then(r => r.json()),
    fetch(`${SUPABASE_URL}/production_logs?stage_id=eq.${htStage.id}&select=id`, { headers }).then(r => r.json()),
    fetch(`${SUPABASE_URL}/production_logs?select=id,process_stages!inner(stage_code)&process_stages.stage_code=eq.ROLLING`, { headers }).then(r => r.json()),
    fetch(`${SUPABASE_URL}/production_logs?select=id,process_stages!inner(stage_code)&process_stages.stage_code=eq.HOLLOW_HEAT_TREATMENT`, { headers }).then(r => r.json()),
  ]);

  console.log("\n================================================================================");
  console.log("                        DATABASE STATE VERIFICATION                             ");
  console.log("================================================================================");
  console.log(`- DRAW Logs in DB:             ${Array.isArray(checkDraw) ? checkDraw.length : 'N/A'} (Expected: 0)`);
  console.log(`- HEAT_TREATMENT Logs in DB:   ${Array.isArray(checkHt) ? checkHt.length : 'N/A'} (Expected: 0)`);
  console.log(`- ROLLING Logs in DB:          ${Array.isArray(checkRoll) ? checkRoll.length : 'N/A'} (Intact)`);
  console.log(`- HOLLOW_HT Logs in DB:        ${Array.isArray(checkHht) ? checkHht.length : 'N/A'} (Intact)`);
  console.log("================================================================================\n");
}

cleanDrawAndHt();
