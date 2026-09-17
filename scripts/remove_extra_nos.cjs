// scripts/remove_extra_nos.cjs
const fs = require('fs');

const SUPABASE_URL = "https://dzhvbftmuwfyuaarsxtk.supabase.co/rest/v1";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6aHZiZnRtdXdmeXVhYXJzeHRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzUwOTYzNywiZXhwIjoyMTAzMDg1NjM3fQ.jtkcZxBOmgEEHvBzGIHYdPpzJf2zA5xfdJZ6XuDSmds";

const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
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

async function fetchAll(endpoint) {
  let allData = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const res = await fetch(`${SUPABASE_URL}/${endpoint}&limit=${limit}&offset=${offset}`, { headers });
    if (!res.ok) throw new Error(`Fetch ${endpoint} failed: ${res.statusText}`);
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;
    allData.push(...data);
    if (data.length < limit) break;
    offset += limit;
  }
  return allData;
}

async function updateLog(logId, patch) {
  const res = await fetch(`${SUPABASE_URL}/production_logs?id=eq.${logId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Failed to update log ${logId}: ${res.statusText}`);
  return res.json();
}

async function deleteLog(logId) {
  const res = await fetch(`${SUPABASE_URL}/production_logs?id=eq.${logId}`, {
    method: 'DELETE',
    headers,
  });
  if (!res.ok) throw new Error(`Failed to delete log ${logId}: ${res.statusText}`);
  return true;
}

async function executeCleanup(dryRun = true) {
  console.log(`=== RUNNING WIP EXTRA NOS CLEANUP (dryRun = ${dryRun}) ===`);

  const [stages, routes, wos, plans, logs] = await Promise.all([
    fetchAll("process_stages?select=*"),
    fetchAll("process_routes?select=*"),
    fetchAll("work_orders?select=*"),
    fetchAll("rolling_plans?select=*&order=created_at.asc"),
    fetchAll("production_logs?select=*&order=created_at.asc"),
  ]);

  const rollingStageId = stages.find(s => s.stage_code === "ROLLING")?.id;
  const hollowHtStageId = stages.find(s => s.stage_code === "HOLLOW_HEAT_TREATMENT")?.id;
  const drawStageId = stages.find(s => s.stage_code === "DRAW")?.id;
  const htStageId = stages.find(s => s.stage_code === "HEAT_TREATMENT")?.id;
  const bandSawStageId = stages.find(s => s.stage_code === "BAND_SAW")?.id;

  const logsByWo = new Map();
  for (const log of logs) {
    if (!logsByWo.has(log.work_order_id)) logsByWo.set(log.work_order_id, []);
    logsByWo.get(log.work_order_id).push(log);
  }

  const plansByWo = new Map();
  for (const pl of plans) {
    if (!plansByWo.has(pl.work_order_id)) plansByWo.set(pl.work_order_id, []);
    plansByWo.get(pl.work_order_id).push(pl);
  }

  const adjustments = [];

  for (const wo of wos) {
    const woId = wo.id;
    const woNo = wo.work_order_no;
    const woLogs = logsByWo.get(woId) || [];
    const woPlans = plansByWo.get(woId) || [];

    if (woLogs.length === 0 && woPlans.length === 0) continue;

    const l1 = Number(wo.l1 || 6);
    const l2 = Number(wo.l2 || 6.5);
    const orderAvg = l1 > 0 && l2 > 0 ? (l1 + l2) / 2 : l1 || 6.25;

    let mhOd = Number(wo.size_od || 0);
    let mhWt = Number(wo.size_wt || 0);
    let mhL1 = l1;
    let mhL2 = l2;
    let multiple = 1;

    for (const p of woPlans) {
      if (p.multiple) multiple = Number(p.multiple);
      if (p.status) {
        try {
          const parsed = typeof p.status === 'string' ? JSON.parse(p.status) : p.status;
          if (parsed.multiple) multiple = Number(parsed.multiple);
          if (parsed.mh_od || p.mh_od) mhOd = Number(parsed.mh_od || p.mh_od);
          if (parsed.mh_wt || p.mh_wt) mhWt = Number(parsed.mh_wt || p.mh_wt);
          if (parsed.mh_l1 || p.mh_l1) mhL1 = Number(parsed.mh_l1 || p.mh_l1);
          if (parsed.mh_l2 || p.mh_l2) mhL2 = Number(parsed.mh_l2 || p.mh_l2);
        } catch {}
      }
    }
    const mhAvg = mhL1 > 0 && mhL2 > 0 ? (mhL1 + mhL2) / 2 : mhL1 || orderAvg;

    // STEP 1: Adjust Rolling Logs to max 110% of plan budget (for standalone non-campaign plans)
    let totalPlannedPcs = 0;
    let totalPlannedMtr = 0;
    for (const p of woPlans) {
      let pMtr = Number(p.planned_qty || 0);
      let pPcs = 0;
      if (p.status) {
        try {
          const parsed = typeof p.status === 'string' ? JSON.parse(p.status) : p.status;
          const plannedM = Number(parsed.total_campaign_mtr || parsed.master_planned_mtr || parsed.planned_mtr || p.planned_qty || 0);
          const plannedP = Number(parsed.total_campaign_pcs || parsed.master_planned_pcs || parsed.planned_pcs || 0);
          if (plannedP > 0) pPcs = plannedP;
          if (plannedM > 0) pMtr = plannedM;
        } catch {}
      }
      if (pPcs === 0 && mhAvg > 0 && pMtr > 0) pPcs = Math.round(pMtr / mhAvg);
      totalPlannedMtr += pMtr;
      totalPlannedPcs += pPcs;
    }

    const rollLogs = woLogs.filter(l => l.stage_id === rollingStageId);
    let runningRollingPcs = 0;
    const maxRolling110Pcs = totalPlannedPcs > 0 ? Math.round(totalPlannedPcs * 1.10) : 0;

    for (const l of rollLogs) {
      const p = extractPcsFromRemarks(l.remarks);
      const lPcs = Number(l.output_pcs || 0) > 0 ? Number(l.output_pcs) : (p.pcs !== null && p.pcs > 0 ? p.pcs : (mhAvg > 0 ? Math.round(Number(l.output_qty || 0) / mhAvg) : 0));
      const lRej = Number(l.rejection_pcs || 0) > 0 ? Number(l.rejection_pcs) : (p.rejPcs !== null && p.rejPcs > 0 ? p.rejPcs : 0);

      if (maxRolling110Pcs > 0 && (runningRollingPcs + lPcs) > maxRolling110Pcs) {
        const allowedThisLogPcs = Math.max(0, maxRolling110Pcs - runningRollingPcs);
        if (allowedThisLogPcs <= 0) {
          adjustments.push({
            type: "DELETE_EXCESS_ROLLING_LOG",
            woNo,
            logId: l.id,
            reason: `Rolling total exceeds 110% of plan (${maxRolling110Pcs} PCS). Deleting surplus log of ${lPcs} PCS.`,
          });
        } else {
          const newOutMtr = Number((allowedThisLogPcs * mhAvg).toFixed(2));
          adjustments.push({
            type: "TRIM_ROLLING_LOG",
            woNo,
            logId: l.id,
            oldPcs: lPcs,
            newPcs: allowedThisLogPcs,
            oldMtr: l.output_qty,
            newMtr: newOutMtr,
            remarks: updateRemarksWithPcs(l.remarks, allowedThisLogPcs, lRej),
            reason: `Trimming rolling log from ${lPcs} to ${allowedThisLogPcs} PCS to respect 110% plan limit (${maxRolling110Pcs} PCS).`,
          });
          runningRollingPcs += allowedThisLogPcs;
        }
      } else {
        runningRollingPcs += lPcs;
      }
    }

    // Recalculate effective Rolling HTC OK pieces after adjustments
    let effectiveRollingHtcPcs = 0;
    for (const l of rollLogs) {
      const adj = adjustments.find(a => a.logId === l.id);
      if (adj?.type === "DELETE_EXCESS_ROLLING_LOG") continue;
      const pcs = adj?.newPcs !== undefined ? adj.newPcs : (extractPcsFromRemarks(l.remarks).pcs || (mhAvg > 0 ? Math.round(Number(l.output_qty || 0) / mhAvg) : 0));
      effectiveRollingHtcPcs += pcs;
    }

    // STEP 2: Adjust Draw Bench (DB) Logs to not exceed Rolling HTC OK pieces
    const drawLogs = woLogs.filter(l => l.stage_id === drawStageId);
    let runningDrawPcs = 0;
    const maxDrawPcs = effectiveRollingHtcPcs;

    for (const l of drawLogs) {
      const p = extractPcsFromRemarks(l.remarks);
      const lPcs = Number(l.output_pcs || 0) > 0 ? Number(l.output_pcs) : (p.pcs !== null && p.pcs > 0 ? p.pcs : (orderAvg > 0 ? Math.round(Number(l.output_qty || 0) / orderAvg) : 0));
      const lRej = Number(l.rejection_pcs || 0) > 0 ? Number(l.rejection_pcs) : (p.rejPcs !== null && p.rejPcs > 0 ? p.rejPcs : 0);

      if (maxDrawPcs > 0 && (runningDrawPcs + lPcs) > maxDrawPcs) {
        const allowedThisLogPcs = Math.max(0, maxDrawPcs - runningDrawPcs);
        if (allowedThisLogPcs <= 0) {
          adjustments.push({
            type: "DELETE_EXCESS_DRAW_LOG",
            woNo,
            logId: l.id,
            reason: `DB total exceeds Rolling HTC OK (${maxDrawPcs} PCS). Deleting surplus log of ${lPcs} PCS.`,
          });
        } else {
          const newOutMtr = Number((allowedThisLogPcs * orderAvg).toFixed(2));
          adjustments.push({
            type: "TRIM_DRAW_LOG",
            woNo,
            logId: l.id,
            oldPcs: lPcs,
            newPcs: allowedThisLogPcs,
            oldMtr: l.output_qty,
            newMtr: newOutMtr,
            remarks: updateRemarksWithPcs(l.remarks, allowedThisLogPcs, lRej),
            reason: `Trimming DB log from ${lPcs} to ${allowedThisLogPcs} PCS to match Rolling HTC OK (${maxDrawPcs} PCS).`,
          });
          runningDrawPcs += allowedThisLogPcs;
        }
      } else {
        runningDrawPcs += lPcs;
      }
    }

    // Recalculate effective Draw Bench output pieces
    let effectiveDrawPcs = 0;
    for (const l of drawLogs) {
      const adj = adjustments.find(a => a.logId === l.id);
      if (adj?.type === "DELETE_EXCESS_DRAW_LOG") continue;
      const pcs = adj?.newPcs !== undefined ? adj.newPcs : (extractPcsFromRemarks(l.remarks).pcs || (orderAvg > 0 ? Math.round(Number(l.output_qty || 0) / orderAvg) : 0));
      effectiveDrawPcs += pcs;
    }

    // STEP 3: Adjust Heat Treatment (HT) Logs to not exceed Draw Bench output
    const htLogs = woLogs.filter(l => l.stage_id === htStageId);
    let runningHtPcs = 0;
    const maxHtPcs = effectiveDrawPcs > 0 ? effectiveDrawPcs : effectiveRollingHtcPcs;

    for (const l of htLogs) {
      const p = extractPcsFromRemarks(l.remarks);
      const lPcs = Number(l.output_pcs || 0) > 0 ? Number(l.output_pcs) : (p.pcs !== null && p.pcs > 0 ? p.pcs : (orderAvg > 0 ? Math.round(Number(l.output_qty || 0) / orderAvg) : 0));
      const lRej = Number(l.rejection_pcs || 0) > 0 ? Number(l.rejection_pcs) : (p.rejPcs !== null && p.rejPcs > 0 ? p.rejPcs : 0);

      if (maxHtPcs > 0 && (runningHtPcs + lPcs) > maxHtPcs) {
        const allowedThisLogPcs = Math.max(0, maxHtPcs - runningHtPcs);
        if (allowedThisLogPcs <= 0) {
          adjustments.push({
            type: "DELETE_EXCESS_HT_LOG",
            woNo,
            logId: l.id,
            reason: `HT total exceeds DB output (${maxHtPcs} PCS). Deleting surplus log of ${lPcs} PCS.`,
          });
        } else {
          const newOutMtr = Number((allowedThisLogPcs * orderAvg).toFixed(2));
          adjustments.push({
            type: "TRIM_HT_LOG",
            woNo,
            logId: l.id,
            oldPcs: lPcs,
            newPcs: allowedThisLogPcs,
            oldMtr: l.output_qty,
            newMtr: newOutMtr,
            remarks: updateRemarksWithPcs(l.remarks, allowedThisLogPcs, lRej),
            reason: `Trimming HT log from ${lPcs} to ${allowedThisLogPcs} PCS to match DB output (${maxHtPcs} PCS).`,
          });
          runningHtPcs += allowedThisLogPcs;
        }
      } else {
        runningHtPcs += lPcs;
      }
    }
  }

  console.log(`\nFound ${adjustments.length} log adjustments required to enforce strict feeder limits:`);
  adjustments.forEach((a, i) => {
    console.log(`${i + 1}. [${a.type}] WO ${a.woNo} (Log ${a.logId}): ${a.reason}`);
  });

  if (!dryRun) {
    console.log("\nExecuting adjustments in Supabase database...");
    for (const a of adjustments) {
      if (a.type.startsWith("DELETE_")) {
        await deleteLog(a.logId);
        console.log(`Deleted log ${a.logId} for WO ${a.woNo}`);
      } else if (a.type.startsWith("TRIM_")) {
        await updateLog(a.logId, {
          output_qty: a.newMtr,
          htc_ok: a.newMtr,
          remarks: a.remarks,
        });
        console.log(`Trimmed log ${a.logId} for WO ${a.woNo} -> ${a.newPcs} PCS (${a.newMtr} MTR)`);
      }
    }
    console.log("Cleanup executed successfully!");
  } else {
    console.log("\n(Dry run completed. Set dryRun = false to commit to database.)");
  }

  fs.writeFileSync('cleanup_plan.json', JSON.stringify(adjustments, null, 2));
}

executeCleanup(false).catch(err => console.error(err));
