// scripts/test_dashboard_reconciliation.cjs
const SUPABASE_URL = "https://dzhvbftmuwfyuaarsxtk.supabase.co/rest/v1";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6aHZiZnRtdXdmeXVhYXJzeHRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzUwOTYzNywiZXhwIjoyMTAzMDg1NjM3fQ.jtkcZxBOmgEEHvBzGIHYdPpzJf2zA5xfdJZ6XuDSmds";

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };

function mtFromMtr(mtr, od, wt) {
  if (!mtr || !od || !wt || od <= wt) return 0;
  return mtr * (od - wt) * wt * 0.0246615 * 0.001;
}

async function run() {
  console.log("Testing dashboard reconciliation...");

  const [wipRes, plansRes, woRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/vw_route_stage_wip?select=*`, { headers }).then(r => r.json()),
    fetch(`${SUPABASE_URL}/rolling_plans?select=work_order_id,status,planned_qty,mh_od,mh_wt,mh_l1,mh_l2,plan_no`, { headers }).then(r => r.json()),
    fetch(`${SUPABASE_URL}/work_orders?select=id,work_order_no,ordered_qty_mt,ordered_qty_mtr,size_od,size_wt,l1,l2`, { headers }).then(r => r.json()),
  ]);

  const rawWip = Array.isArray(wipRes) ? wipRes : [];
  const rollingPlans = Array.isArray(plansRes) ? plansRes : [];
  const workOrders = Array.isArray(woRes) ? woRes : [];
  const woMap = new Map(workOrders.map(w => [w.id, w]));

  const mhMap = new Map();
  for (const p of rollingPlans) {
    try {
      const parsed = typeof p.status === 'string' ? JSON.parse(p.status) : p.status;
      const mhOd = Number(p.mh_od || parsed?.mh_od || parsed?.cust_od || 0) || null;
      const mhWt = Number(p.mh_wt || parsed?.mh_wt || parsed?.cust_wt || 0) || null;
      const mhL1 = Number(p.mh_l1 || parsed?.mh_l1 || 0) || null;
      const mhL2 = Number(p.mh_l2 || parsed?.mh_l2 || 0) || null;
      const mhAvg = mhL1 && mhL2 ? (mhL1 + mhL2) / 2 : mhL1 || mhL2 || null;

      if (p.work_order_id) {
        mhMap.set(p.work_order_id, { mh_od: mhOd, mh_wt: mhWt, mh_l1: mhL1, mh_l2: mhL2, mh_avg_length: mhAvg, planned_qty: p.planned_qty });
      }
      if (parsed?.is_master && Array.isArray(parsed?.child_work_orders)) {
        for (const c of parsed.child_work_orders) {
          const cId = c.work_order_id || c.id;
          if (cId) {
            mhMap.set(cId, { mh_od: mhOd, mh_wt: mhWt, mh_l1: mhL1, mh_l2: mhL2, mh_avg_length: mhAvg, planned_qty: p.planned_qty });
          }
        }
      }
    } catch {}
  }

  // Group raw WIP by work order
  const wipByWo = new Map();
  for (const r of rawWip) {
    if (!wipByWo.has(r.work_order_id)) wipByWo.set(r.work_order_id, []);
    wipByWo.get(r.work_order_id).push(r);
  }

  const STAGE_ORDER = ['ROLLING', 'HOLLOW_HEAT_TREATMENT', 'DRAW', 'HEAT_TREATMENT', 'BAND_SAW', 'VDI', 'FINISHING'];
  const getStageSeq = (code) => {
    const idx = STAGE_ORDER.indexOf((code || '').toUpperCase());
    return idx >= 0 ? idx + 1 : 99;
  };

  const reconciledWip = [];
  let plantTotalWipMt = 0;
  let plantTotalWipMtr = 0;
  let plantTotalWipPcs = 0;

  const stageBreakdown = {};

  for (const [woId, rows] of wipByWo.entries()) {
    const wo = woMap.get(woId);
    const planMh = mhMap.get(woId);
    const woOd = Number(wo?.size_od || rows[0]?.od || rows[0]?.size_od || 0);
    const woWt = Number(wo?.size_wt || rows[0]?.wt || rows[0]?.size_wt || 0);
    const mhOd = planMh?.mh_od || woOd;
    const mhWt = planMh?.mh_wt || woWt;
    const woLen = Number(wo?.l1 && wo?.l2 ? (Number(wo.l1) + Number(wo.l2)) / 2 : wo?.l1 || wo?.l2 || 6.0);
    const mhLen = Number(planMh?.mh_avg_length || planMh?.mh_l1 || woLen);

    // Sort stages by sequence
    const sorted = [...rows].sort((a, b) => getStageSeq(a.stage_code) - getStageSeq(b.stage_code));

    // Determine charged steel
    const rollRow = sorted.find(r => (r.stage_code || '').toUpperCase() === 'ROLLING');
    let chargedMt = 0;
    if (rollRow && Number(rollRow.gross_output_mtr || 0) > 0) {
      chargedMt = mtFromMtr(Number(rollRow.gross_output_mtr), mhOd, mhWt);
    } else if (planMh?.planned_qty) {
      chargedMt = mtFromMtr(Number(planMh.planned_qty), mhOd, mhWt);
    } else if (wo?.ordered_qty_mt) {
      chargedMt = Number(wo.ordered_qty_mt);
    }

    // Determine finished MT and scrap MT
    const finRow = sorted.find(r => (r.stage_code || '').toUpperCase() === 'FINISHING');
    const finishedMt = finRow ? mtFromMtr(Number(finRow.net_output_mtr || 0), woOd, woWt) : 0;
    const finishedPcs = finRow ? Number(finRow.net_output_pcs || 0) : 0;
    const finishedMtr = finRow ? Number(finRow.net_output_mtr || 0) : 0;

    const totalScrapMt = sorted.reduce((sum, r) => {
      const isMh = r.stage_code === 'ROLLING' || r.stage_code === 'HOLLOW_HEAT_TREATMENT';
      return sum + mtFromMtr(Number(r.rejection_mtr || 0), isMh ? mhOd : woOd, isMh ? mhWt : woWt);
    }, 0);

    const maxPhysicalWipMt = Math.max(0, chargedMt - totalScrapMt - finishedMt);

    // Downstream deduction:
    // For each stage i, calculate maximum passed downstream
    const woReconciledRows = [];

    for (let i = 0; i < sorted.length; i++) {
      const cur = sorted[i];
      const sc = (cur.stage_code || '').toUpperCase();
      const isMh = sc === 'ROLLING' || sc === 'HOLLOW_HEAT_TREATMENT';
      const curOd = isMh ? mhOd : woOd;
      const curWt = isMh ? mhWt : woWt;
      const curLen = isMh ? mhLen : woLen;

      // Highest downstream passed
      let maxDownstreamMtr = 0;
      let maxDownstreamPcs = 0;
      let maxDownstreamMt = 0;

      for (let j = i + 1; j < sorted.length; j++) {
        const down = sorted[j];
        const downGrossMtr = Number(down.gross_output_mtr || 0);
        const downGrossPcs = Number(down.gross_output_pcs || 0);
        const downIsMh = down.stage_code === 'ROLLING' || down.stage_code === 'HOLLOW_HEAT_TREATMENT';
        const downMt = mtFromMtr(downGrossMtr, downIsMh ? mhOd : woOd, downIsMh ? mhWt : woWt);
        if (downGrossMtr > maxDownstreamMtr) maxDownstreamMtr = downGrossMtr;
        if (downGrossPcs > maxDownstreamPcs) maxDownstreamPcs = downGrossPcs;
        if (downMt > maxDownstreamMt) maxDownstreamMt = downMt;
      }

      // Reconciled WIP
      let recWipMtr = 0;
      let recWipPcs = 0;

      if (sc === 'ROLLING') {
        // Rolled HTC OK minus downstream processed
        const netMtr = Number(cur.net_output_mtr || cur.production_qty || 0);
        recWipMtr = Math.max(0, netMtr - maxDownstreamMtr);
        recWipPcs = curLen > 0 ? Math.round(recWipMtr / curLen) : 0;
      } else {
        const incomingMtr = Number(cur.incoming_qty || 0);
        const curGrossMtr = Number(cur.production_qty || cur.gross_output_mtr || 0);
        const passedMtr = Math.max(curGrossMtr, maxDownstreamMtr);
        recWipMtr = Math.max(0, incomingMtr - passedMtr);
        recWipPcs = curLen > 0 ? Math.round(recWipMtr / curLen) : 0;
      }

      const recWipMt = mtFromMtr(recWipMtr, curOd, curWt);

      woReconciledRows.push({
        ...cur,
        od: curOd,
        wt: curWt,
        mh_od: mhOd,
        mh_wt: mhWt,
        reconciled_wip: recWipMtr,
        reconciled_wip_pcs: recWipPcs,
        reconciled_wip_mt: recWipMt,
        capped_wip_mt: recWipMt,
        capped_wip: recWipMtr,
        capped_wip_pcs: recWipPcs,
      });
    }

    // Apply mass conservation capping
    const woTotalRecMt = woReconciledRows.reduce((s, r) => s + r.reconciled_wip_mt, 0);
    if (chargedMt > 0 && woTotalRecMt > maxPhysicalWipMt && woTotalRecMt > 0) {
      const factor = maxPhysicalWipMt / woTotalRecMt;
      for (const r of woReconciledRows) {
        r.capped_wip_mt = Number((r.reconciled_wip_mt * factor).toFixed(3));
        r.capped_wip = Number((r.reconciled_wip * factor).toFixed(2));
        r.capped_wip_pcs = Math.round(r.reconciled_wip_pcs * factor);
      }
    }

    for (const r of woReconciledRows) {
      // We only include stages with active capped WIP > 0
      if (r.capped_wip > 0.1 || r.capped_wip_pcs > 0) {
        reconciledWip.push(r);
        plantTotalWipMt += r.capped_wip_mt;
        plantTotalWipMtr += r.capped_wip;
        plantTotalWipPcs += r.capped_wip_pcs;

        const sc = (r.stage_code || '').toUpperCase();
        if (!stageBreakdown[sc]) stageBreakdown[sc] = { mtr: 0, pcs: 0, mt: 0, count: 0 };
        stageBreakdown[sc].mtr += r.capped_wip;
        stageBreakdown[sc].pcs += r.capped_wip_pcs;
        stageBreakdown[sc].mt += r.capped_wip_mt;
        stageBreakdown[sc].count++;
      }
    }
  }

  console.log("\n=== RECONCILED DASHBOARD PLANT WIP ===");
  console.log(`Total Plant WIP: ${plantTotalWipMt.toFixed(2)} MT | ${plantTotalWipMtr.toFixed(1)} MTR | ${plantTotalWipPcs} PCS`);
  console.log("\nStage Breakdown:");
  Object.entries(stageBreakdown).forEach(([sc, data]) => {
    console.log(`  ${sc.padEnd(25)}: ${data.mt.toFixed(2).padStart(8)} MT | ${Math.round(data.mtr).toString().padStart(8)} MTR | ${data.pcs.toString().padStart(6)} PCS | ${data.count} WOs`);
  });
}

run();
