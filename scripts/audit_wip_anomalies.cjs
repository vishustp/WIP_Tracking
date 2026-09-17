// scripts/audit_wip_anomalies.cjs
const fs = require('fs');

const SUPABASE_URL = "https://dzhvbftmuwfyuaarsxtk.supabase.co/rest/v1";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6aHZiZnRtdXdmeXVhYXJzeHRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzUwOTYzNywiZXhwIjoyMTAzMDg1NjM3fQ.jtkcZxBOmgEEHvBzGIHYdPpzJf2zA5xfdJZ6XuDSmds";

const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
};

function extractPcsFromRemarks(remarks) {
  if (!remarks) return { pcs: null, rejPcs: null };
  const pcsMatch = remarks.match(/\[PCS:(\d+)\]/i);
  const rejMatch = remarks.match(/\[REJ_PCS:(\d+)\]/i);
  const pcs = pcsMatch ? parseInt(pcsMatch[1], 10) : null;
  const rejPcs = rejMatch ? parseInt(rejMatch[1], 10) : null;
  return { pcs, rejPcs };
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

async function runAudit() {
  console.log("Fetching DB data...");
  const [stages, routes, wos, plans, logs, qcList, divs] = await Promise.all([
    fetchAll("process_stages?select=*"),
    fetchAll("process_routes?select=*"),
    fetchAll("work_orders?select=*"),
    fetchAll("rolling_plans?select=*&order=created_at.asc"),
    fetchAll("production_logs?select=*&order=created_at.asc"),
    fetchAll("qc_inspections?select=*"),
    fetchAll("diversion_plans?select=*"),
  ]);

  console.log(`Loaded: ${wos.length} Work Orders, ${plans.length} Rolling Plans, ${logs.length} Production Logs, ${qcList.length} QC Inspections, ${divs.length} Diversions.`);

  const stageMap = new Map();
  stages.forEach(s => stageMap.set(s.id, s.stage_code));
  const routeMap = new Map();
  routes.forEach(r => routeMap.set(r.id, r));
  const woMap = new Map();
  wos.forEach(w => woMap.set(w.id, w));

  const rollingStageId = stages.find(s => s.stage_code === "ROLLING")?.id;
  const hollowHtStageId = stages.find(s => s.stage_code === "HOLLOW_HEAT_TREATMENT")?.id;
  const drawStageId = stages.find(s => s.stage_code === "DRAW")?.id;
  const htStageId = stages.find(s => s.stage_code === "HEAT_TREATMENT")?.id;
  const bandSawStageId = stages.find(s => s.stage_code === "BAND_SAW")?.id;
  const vdiStageId = stages.find(s => s.stage_code === "VDI")?.id;
  const finStageId = stages.find(s => s.stage_code === "FINISHING")?.id;

  // Group logs by work order
  const logsByWo = new Map();
  for (const log of logs) {
    if (!logsByWo.has(log.work_order_id)) logsByWo.set(log.work_order_id, []);
    logsByWo.get(log.work_order_id).push(log);
  }

  // Group plans by work order
  const plansByWo = new Map();
  for (const pl of plans) {
    if (!plansByWo.has(pl.work_order_id)) plansByWo.set(pl.work_order_id, []);
    plansByWo.get(pl.work_order_id).push(pl);
  }

  // Findings categories
  const findings = {
    rollingOver110Plan: [],
    drawOverRolling: [],
    htOverDraw: [],
    bandSawOverFeeder: [],
    vdiOverBandSaw: [],
    finishingOverVdi: [],
  };

  for (const wo of wos) {
    const woId = wo.id;
    const woNo = wo.work_order_no;
    const woLogs = logsByWo.get(woId) || [];
    const woPlans = plansByWo.get(woId) || [];

    if (woLogs.length === 0 && woPlans.length === 0) continue;

    // Determine route
    const plWithRoute = woPlans.find(p => p.process_route_id);
    const routeId = plWithRoute?.process_route_id || routes[0]?.id;
    const route = routeMap.get(routeId);
    const routeCode = route?.route_code || "CDS";
    const isCds = routeCode === "CDS" || routeCode === "ALLOY_CDS";
    const isAlloy = routeCode.includes("ALLOY");

    const l1 = Number(wo.l1 || 6);
    const l2 = Number(wo.l2 || 6.5);
    const orderAvg = l1 > 0 && l2 > 0 ? (l1 + l2) / 2 : l1 || 6.25;

    // Find Mother Hollow specs from plans
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

    // Helper to get stage logs
    const rollLogs = woLogs.filter(l => l.stage_id === rollingStageId);
    const hollowHtLogs = woLogs.filter(l => l.stage_id === hollowHtStageId);
    const drawLogs = woLogs.filter(l => l.stage_id === drawStageId);
    const htLogs = woLogs.filter(l => l.stage_id === htStageId);
    const bandSawLogs = woLogs.filter(l => l.stage_id === bandSawStageId);
    const finLogs = woLogs.filter(l => l.stage_id === finStageId);

    // Sum functions
    const sumMtr = (list, f) => list.reduce((s, l) => s + Number(l[f] || 0), 0);
    const sumPcs = (list, avgLen) => list.reduce((s, l) => {
      const p = extractPcsFromRemarks(l.remarks);
      if (Number(l.output_pcs || 0) > 0) return s + Number(l.output_pcs);
      if (p.pcs !== null && p.pcs > 0) return s + p.pcs;
      if (avgLen > 0 && Number(l.output_qty || 0) > 0) return s + Math.round(Number(l.output_qty) / avgLen);
      return s;
    }, 0);

    const sumHtcPcs = (list, avgLen) => list.reduce((s, l) => {
      const p = extractPcsFromRemarks(l.remarks);
      if (Number(l.htc_ok || 0) > 0) {
        if (p.pcs !== null && p.pcs > 0) return s + p.pcs;
        if (avgLen > 0) return s + Math.round(Number(l.htc_ok) / avgLen);
      }
      return s;
    }, 0);

    // 1. Check: Rolling entry > 110% of Rolling plan
    let totalPlannedMtr = 0;
    let totalPlannedPcs = 0;
    const planDetails = [];

    for (const p of woPlans) {
      let pMtr = Number(p.planned_qty || 0);
      let pPcs = 0;
      let pNo = p.plan_no || "N/A";
      let pStatus = "UNKNOWN";
      if (p.status) {
        try {
          const parsed = typeof p.status === 'string' ? JSON.parse(p.status) : p.status;
          pStatus = parsed.lifecycle_status || (parsed.issued_at ? "ISSUED" : "DRAFT");
          const plannedM = Number(parsed.total_campaign_mtr || parsed.master_planned_mtr || parsed.planned_mtr || p.planned_qty || 0);
          const plannedP = Number(parsed.total_campaign_pcs || parsed.master_planned_pcs || parsed.planned_pcs || 0);
          if (plannedP > 0) pPcs = plannedP;
          if (plannedM > 0) pMtr = plannedM;
        } catch {}
      }
      if (pPcs === 0 && mhAvg > 0 && pMtr > 0) pPcs = Math.round(pMtr / mhAvg);
      totalPlannedMtr += pMtr;
      totalPlannedPcs += pPcs;
      planDetails.push({ id: p.id, plan_no: pNo, status: pStatus, planned_mtr: pMtr, planned_pcs: pPcs });
    }

    const rollOutMtr = sumMtr(rollLogs, "output_qty");
    const rollRejMtr = sumMtr(rollLogs, "rejection_qty");
    const rollTotalLoggedMtr = rollOutMtr + rollRejMtr;
    const rollHtcOkMtr = sumMtr(rollLogs, "htc_ok");
    const rollOutPcs = sumPcs(rollLogs, mhAvg);
    const rollHtcOkPcs = sumHtcPcs(rollLogs, mhAvg);

    const maxRolling110Pcs = totalPlannedPcs > 0 ? Math.round(totalPlannedPcs * 1.10) : 0;
    const maxRolling110Mtr = totalPlannedMtr > 0 ? Number((totalPlannedMtr * 1.10).toFixed(2)) : 0;

    if (woPlans.length > 0 && (rollOutPcs > (maxRolling110Pcs + 2) || rollTotalLoggedMtr > (maxRolling110Mtr * 1.05))) {
      findings.rollingOver110Plan.push({
        work_order_no: woNo,
        customer_name: wo.customer_name,
        route_code: routeCode,
        total_planned_pcs: totalPlannedPcs,
        max_110_limit_pcs: maxRolling110Pcs,
        actual_rolled_pcs: rollOutPcs,
        excess_pcs: Math.max(0, rollOutPcs - maxRolling110Pcs),
        total_planned_mtr: totalPlannedMtr,
        max_110_limit_mtr: maxRolling110Mtr,
        actual_rolled_mtr: rollTotalLoggedMtr,
        excess_mtr: Number((rollTotalLoggedMtr - maxRolling110Mtr).toFixed(2)),
      });
    }

    // 2. Check: DB > Rolling (DB Qty cannot be greater than Rolling Production Nos)
    const drawOutMtr = sumMtr(drawLogs, "output_qty");
    const drawOutPcs = sumPcs(drawLogs, orderAvg);

    const feederRollingPcs = isAlloy ? sumPcs(hollowHtLogs, mhAvg) : rollHtcOkPcs;

    if (isCds && drawLogs.length > 0 && drawOutPcs > (feederRollingPcs + 2)) {
      findings.drawOverRolling.push({
        work_order_no: woNo,
        customer_name: wo.customer_name,
        route_code: routeCode,
        rolling_htc_ok_pcs: feederRollingPcs,
        draw_output_pcs: drawOutPcs,
        excess_pcs: drawOutPcs - feederRollingPcs,
      });
    }

    // 3. Check: HT > DB (HT Qty cannot be greater than DB Nos)
    const htOutMtr = sumMtr(htLogs, "output_qty");
    const htOutPcs = sumPcs(htLogs, orderAvg);

    if (isCds && htLogs.length > 0 && htOutPcs > (drawOutPcs + 2)) {
      findings.htOverDraw.push({
        work_order_no: woNo,
        customer_name: wo.customer_name,
        route_code: routeCode,
        draw_output_pcs: drawOutPcs,
        ht_output_pcs: htOutPcs,
        excess_pcs: htOutPcs - drawOutPcs,
      });
    }

    // 4. Check: Band Saw > Feeder * Multiple (Band Saw cannot be more than HTC OK * Multiple or HT Nos * Multiple)
    const bandSawOutMtr = sumMtr(bandSawLogs, "output_qty");
    const bandSawOutPcs = sumPcs(bandSawLogs, orderAvg);

    let maxBandSawPcs = isCds ? Math.round(htOutPcs * multiple) : Math.round(rollHtcOkPcs * multiple);
    if (bandSawLogs.length > 0 && bandSawOutPcs > (maxBandSawPcs + 2)) {
      findings.bandSawOverFeeder.push({
        work_order_no: woNo,
        customer_name: wo.customer_name,
        route_code: routeCode,
        multiple,
        feeder_limit_pcs: maxBandSawPcs,
        band_saw_output_pcs: bandSawOutPcs,
        excess_pcs: bandSawOutPcs - maxBandSawPcs,
      });
    }

    // 5. Check: VDI > Band Saw (VDI cannot be greater than Band Saw Nos)
    const woQc = qcList.filter(q => q.work_order_id === woId);
    const qcInspectedPcs = woQc.reduce((s, q) => s + Number(q.inspected_pcs || 0), 0);
    const qcOkPcs = woQc.reduce((s, q) => s + Number(q.vdi_ok_pcs || 0), 0);

    const maxVdiPcs = bandSawLogs.length > 0 ? bandSawOutPcs : maxBandSawPcs;
    if (woQc.length > 0 && qcInspectedPcs > (maxVdiPcs + 2) && maxVdiPcs > 0) {
      findings.vdiOverBandSaw.push({
        work_order_no: woNo,
        customer_name: wo.customer_name,
        route_code: routeCode,
        band_saw_pcs: maxVdiPcs,
        vdi_inspected_pcs: qcInspectedPcs,
        excess_pcs: qcInspectedPcs - maxVdiPcs,
      });
    }

    // 6. Check: Finishing > VDI OK (Finishing cannot be greater than VDI OK Nos)
    const finOutMtr = sumMtr(finLogs, "output_qty");
    const finOutPcs = sumPcs(finLogs, orderAvg);

    const maxFinPcs = Math.round(qcOkPcs * multiple);
    if (finLogs.length > 0 && woQc.length > 0 && finOutPcs > (maxFinPcs + 2)) {
      findings.finishingOverVdi.push({
        work_order_no: woNo,
        customer_name: wo.customer_name,
        route_code: routeCode,
        vdi_ok_pcs: maxFinPcs,
        finishing_output_pcs: finOutPcs,
        excess_pcs: finOutPcs - maxFinPcs,
      });
    }
  }

  console.log("\n================ FULL WIP COMPLIANCE AUDIT ================");
  console.log(`1. Rolling Entry > 110% Rolling Plan:  ${findings.rollingOver110Plan.length} Work Orders`);
  console.log(`2. DB Qty > Rolling Production:        ${findings.drawOverRolling.length} Work Orders`);
  console.log(`3. HT Qty > DB Nos:                    ${findings.htOverDraw.length} Work Orders`);
  console.log(`4. Band Saw > Feeder * Multiple:       ${findings.bandSawOverFeeder.length} Work Orders`);
  console.log(`5. VDI > Band Saw Nos:                 ${findings.vdiOverBandSaw.length} Work Orders`);
  console.log(`6. Finishing > VDI OK Nos:             ${findings.finishingOverVdi.length} Work Orders`);

  fs.writeFileSync('audit_results_final.json', JSON.stringify(findings, null, 2));
}

runAudit().catch(err => console.error(err));
