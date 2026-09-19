// scripts/test_wip_reconciliation.cjs
const SUPABASE_URL = "https://dzhvbftmuwfyuaarsxtk.supabase.co/rest/v1";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6aHZiZnRtdXdmeXVhYXJzeHRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzUwOTYzNywiZXhwIjoyMTAzMDg1NjM3fQ.jtkcZxBOmgEEHvBzGIHYdPpzJf2zA5xfdJZ6XuDSmds";

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };

function mtFromMtr(mtr, od, wt) {
  if (!mtr || !od || !wt || od <= wt) return 0;
  return mtr * (od - wt) * wt * 0.0246615 * 0.001;
}

async function run() {
  console.log("Fetching all data for WIP reconciliation...");

  // 1. Fetch Work Orders
  const woRes = await fetch(`${SUPABASE_URL}/work_orders?select=id,work_order_no,status,ordered_qty_mtr,ordered_qty_mt,size_od,size_wt,l1,l2`, { headers });
  const workOrders = await woRes.json();
  const woMap = new Map(workOrders.map(w => [w.id, w]));

  // 2. Fetch Rolling Plans
  const rpRes = await fetch(`${SUPABASE_URL}/rolling_plans?select=id,work_order_id,planned_qty,mh_od,mh_wt,mh_l1,mh_l2,process_route_id,status`, { headers });
  const rollingPlansData = await rpRes.json();
  const rollingPlans = Array.isArray(rollingPlansData) ? rollingPlansData : [];

  const rpByWo = new Map();
  rollingPlans.forEach(rp => {
    if (!rpByWo.has(rp.work_order_id)) rpByWo.set(rp.work_order_id, []);
    rpByWo.get(rp.work_order_id).push(rp);
  });

  // 3. Fetch Process Stages
  const psRes = await fetch(`${SUPABASE_URL}/process_stages?select=id,stage_code,stage_name`, { headers });
  const processStagesData = await psRes.json();
  const processStages = Array.isArray(processStagesData) ? processStagesData : [];
  const stageMap = new Map(processStages.map(s => [s.id, s]));

  // 4. Fetch Production Logs
  const plRes = await fetch(`${SUPABASE_URL}/production_logs?select=id,work_order_id,stage_id,output_qty,input_qty,rejection_qty,htc_ok`, { headers });
  const prodLogs = await plRes.json();
  const plByWo = new Map();
  prodLogs.forEach(pl => {
    if (!plByWo.has(pl.work_order_id)) plByWo.set(pl.work_order_id, []);
    plByWo.get(pl.work_order_id).push(pl);
  });

  // 5. Fetch QC Inspections
  const qcRes = await fetch(`${SUPABASE_URL}/qc_inspections?select=id,work_order_id,vdi_ok_mtr,vdi_salvage_mtr,vdi_rejection_mtr`, { headers });
  const qcInspections = await qcRes.json();
  const qcByWo = new Map();
  qcInspections.forEach(qc => {
    if (!qcByWo.has(qc.work_order_id)) qcByWo.set(qc.work_order_id, []);
    qcByWo.get(qc.work_order_id).push(qc);
  });

  console.log(`Loaded ${workOrders.length} WOs, ${rollingPlans.length} Plans, ${prodLogs.length} Logs, ${qcInspections.length} QC`);

  // Canonical stages in order
  const STAGES = ['ROLLING', 'HOLLOW_HEAT_TREATMENT', 'DRAW', 'HEAT_TREATMENT', 'BAND_SAW', 'VDI', 'FINISHING'];

  let totalPlantWipMt = 0;
  let totalCappedWipMt = 0;
  let totalChargedMillMt = 0;

  const results = [];

  for (const wo of workOrders) {
    const plans = rpByWo.get(wo.id) || [];
    const logs = plByWo.get(wo.id) || [];
    const qcs = qcByWo.get(wo.id) || [];

    if (logs.length === 0 && plans.length === 0) continue;

    // Determine Mother Hollow dimensions
    const latestPlan = plans[plans.length - 1];
    const mhOd = Number(latestPlan?.mh_od || wo.size_od || 0);
    const mhWt = Number(latestPlan?.mh_wt || wo.size_wt || 0);
    const woOd = Number(wo.size_od || 0);
    const woWt = Number(wo.size_wt || 0);

    // Calculate total steel charged for this WO
    let chargedMt = 0;
    const rollLogs = logs.filter(l => {
      const st = stageMap.get(l.stage_id);
      return st?.stage_code === 'ROLLING';
    });

    const rolledMtr = rollLogs.reduce((s, l) => s + Number(l.output_qty || 0), 0);
    const rollRejMtr = rollLogs.reduce((s, l) => s + Number(l.rejection_qty || 0), 0);
    const rollGrossMtr = rolledMtr + rollRejMtr;

    if (rollGrossMtr > 0) {
      chargedMt = mtFromMtr(rollGrossMtr, mhOd, mhWt);
    } else if (plans.length > 0) {
      const planQty = plans.reduce((s, p) => s + Number(p.planned_qty || 0), 0);
      chargedMt = mtFromMtr(planQty, mhOd, mhWt);
    }
    totalChargedMillMt += chargedMt;

    // Stage outputs
    const stageData = {};
    STAGES.forEach(sc => {
      stageData[sc] = { outMtr: 0, rejMtr: 0, outMt: 0, rejMt: 0 };
    });

    logs.forEach(l => {
      const st = stageMap.get(l.stage_id);
      const sc = st?.stage_code;
      if (sc && stageData[sc]) {
        const out = Number(l.output_qty || 0);
        const rej = Number(l.rejection_qty || 0);
        stageData[sc].outMtr += out;
        stageData[sc].rejMtr += rej;
        const isMh = sc === 'ROLLING' || sc === 'HOLLOW_HEAT_TREATMENT';
        const od = isMh ? mhOd : woOd;
        const wt = isMh ? mhWt : woWt;
        stageData[sc].outMt += mtFromMtr(out, od, wt);
        stageData[sc].rejMt += mtFromMtr(rej, od, wt);
      }
    });

    // QC Inspections at VDI / Band Saw
    qcs.forEach(q => {
      const vdiOk = Number(q.vdi_ok_mtr || 0);
      const vdiRej = Number(q.vdi_rejection_mtr || 0) + Number(q.vdi_salvage_mtr || 0);
      if (vdiOk > stageData.VDI.outMtr) {
        stageData.VDI.outMtr = vdiOk;
        stageData.VDI.outMt = mtFromMtr(vdiOk, woOd, woWt);
      }
      if (vdiRej > stageData.VDI.rejMtr) {
        stageData.VDI.rejMtr = vdiRej;
        stageData.VDI.rejMt = mtFromMtr(vdiRej, woOd, woWt);
      }
    });

    // Downstream Deduction Logic:
    // For each stage i, downstream production processed = max(production at any stage j > i)
    // WIP at stage i (waiting for next stage) = max(0, stage[i].outMt - max_downstream_Mt)
    // Plus work in progress being actively processed at stage i = max(0, stage[i-1].outMt - stage[i].outMt - stage[i].rejMt)

    // Let's compute remaining WIP across the pipeline for this WO
    // Highest downstream MT that has been finished or dispatched:
    const finishedMt = stageData.FINISHING.outMt;
    const totalRejMt = Object.values(stageData).reduce((s, d) => s + d.rejMt, 0);

    // Active in-process steel for this WO:
    // Physical conservation: Mass remaining in mill = Charged MT - Total Scrap Rejection MT - Finished/Dispatched MT
    const physicalMaxRemainingMt = Math.max(0, chargedMt - totalRejMt - finishedMt);

    // Now per stage WIP:
    // Material waiting at Stage K = max(0, Stage K Output - max(Stage K+1..N Output))
    // Let's compute for each stage:
    const stageWipMt = {};
    for (let i = 0; i < STAGES.length; i++) {
      const sc = STAGES[i];
      const curOutMt = stageData[sc].outMt;
      // Highest MT processed by any downstream stage:
      let maxDownstreamMt = 0;
      for (let j = i + 1; j < STAGES.length; j++) {
        maxDownstreamMt = Math.max(maxDownstreamMt, stageData[STAGES[j]].outMt + stageData[STAGES[j]].rejMt);
      }
      stageWipMt[sc] = Math.max(0, curOutMt - maxDownstreamMt);
    }

    const woRawWipMt = Object.values(stageWipMt).reduce((s, v) => s + v, 0);
    const woCappedWipMt = Math.min(woRawWipMt, physicalMaxRemainingMt);

    totalPlantWipMt += woRawWipMt;
    totalCappedWipMt += woCappedWipMt;

    if (woCappedWipMt > 1.0) {
      results.push({
        wo: wo.work_order_no,
        chargedMt: Number(chargedMt.toFixed(2)),
        finishedMt: Number(finishedMt.toFixed(2)),
        physicalMaxRemainingMt: Number(physicalMaxRemainingMt.toFixed(2)),
        rawWipMt: Number(woRawWipMt.toFixed(2)),
        cappedWipMt: Number(woCappedWipMt.toFixed(2)),
        stages: Object.entries(stageWipMt).filter(([_, v]) => v > 0.1).map(([k, v]) => `${k}: ${v.toFixed(1)} MT`)
      });
    }
  }

  results.sort((a, b) => b.cappedWipMt - a.cappedWipMt);

  console.log("\n=== RECONCILIATION SUMMARY ===");
  console.log(`Total Steel Charged Mill: ${totalChargedMillMt.toFixed(2)} MT`);
  console.log(`Raw Reconciled Plant WIP (with Downstream Deduction): ${totalPlantWipMt.toFixed(2)} MT`);
  console.log(`Total Capped Plant WIP (Strict Conservation of Mass): ${totalCappedWipMt.toFixed(2)} MT`);

  console.log("\nTop 15 Work Orders with Active WIP after Downstream Deduction & Capping:");
  results.slice(0, 15).forEach(r => {
    console.log(`WO ${r.wo}: Charged=${r.chargedMt} MT | Fin=${r.finishedMt} MT | CapMax=${r.physicalMaxRemainingMt} MT | CappedWIP=${r.cappedWipMt} MT | Stages: [${r.stages.join(', ')}]`);
  });
}

run();
