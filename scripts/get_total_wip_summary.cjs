const SUPABASE_URL = 'https://dzhvbftmuwfyuaarsxtk.supabase.co/rest/v1';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6aHZiZnRtdXdmeXVhYXJzeHRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzUwOTYzNywiZXhwIjoyMTAzMDg1NjM3fQ.jtkcZxBOmgEEHvBzGIHYdPpzJf2zA5xfdJZ6XuDSmds';
const headers = { apikey: KEY, Authorization: 'Bearer ' + KEY };

function mtFromMtr(mtr, od, wt) {
  if (!mtr || !od || !wt || od <= wt) return 0;
  return mtr * (od - wt) * wt * 0.0246615 * 0.001;
}

async function run() {
  const [wipRes, plansRes, woRes] = await Promise.all([
    fetch(SUPABASE_URL + '/vw_route_stage_wip?select=*', { headers }).then(r => r.json()),
    fetch(SUPABASE_URL + '/rolling_plans?select=work_order_id,status,planned_qty,mh_od,mh_wt,mh_l1,mh_l2,plan_no,multiple', { headers }).then(r => r.json()),
    fetch(SUPABASE_URL + '/work_orders?select=id,work_order_no,ordered_qty_mt,ordered_qty_mtr,size_od,size_wt,l1,l2', { headers }).then(r => r.json()),
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
      const mult = Number(p.multiple || parsed?.multiple || 1);

      if (p.work_order_id) {
        mhMap.set(p.work_order_id, { mh_od: mhOd, mh_wt: mhWt, mh_l1: mhL1, mh_l2: mhL2, mh_avg_length: mhAvg, planned_qty: p.planned_qty, multiple: mult });
      }
      if (parsed?.master_wo_id) {
        mhMap.set(parsed.master_wo_id, { mh_od: mhOd, mh_wt: mhWt, mh_l1: mhL1, mh_l2: mhL2, mh_avg_length: mhAvg, planned_qty: p.planned_qty, multiple: mult });
      }
      if (parsed?.master_wo_no) {
        mhMap.set(String(parsed.master_wo_no).trim(), { mh_od: mhOd, mh_wt: mhWt, mh_l1: mhL1, mh_l2: mhL2, mh_avg_length: mhAvg, planned_qty: p.planned_qty, multiple: mult });
      }
      if (parsed?.is_master && Array.isArray(parsed?.child_work_orders)) {
        for (const c of parsed.child_work_orders) {
          const cId = c.work_order_id || c.id;
          if (cId) {
            mhMap.set(cId, { mh_od: mhOd, mh_wt: mhWt, mh_l1: mhL1, mh_l2: mhL2, mh_avg_length: mhAvg, planned_qty: p.planned_qty, multiple: mult });
          }
        }
      }
    } catch {}
  }

  const wipByWo = new Map();
  for (const r of rawWip) {
    if (!wipByWo.has(r.work_order_id)) wipByWo.set(r.work_order_id, []);
    wipByWo.get(r.work_order_id).push(r);
  }

  const stageTotals = {
    HOLLOW_HEAT_TREATMENT: { label: 'Hollow HT (HTC)', pcs: 0, mtr: 0, mt: 0, count: 0 },
    DRAW: { label: 'Cold Draw Bench', pcs: 0, mtr: 0, mt: 0, count: 0 },
    HEAT_TREATMENT: { label: 'Final Heat Treatment', pcs: 0, mtr: 0, mt: 0, count: 0 },
    BAND_SAW: { label: 'Band Saw Cutting', pcs: 0, mtr: 0, mt: 0, count: 0 },
    VDI: { label: 'VDI / QC Inspection', pcs: 0, mtr: 0, mt: 0, count: 0 },
    FINISHING: { label: 'Finishing Line (FG)', pcs: 0, mtr: 0, mt: 0, count: 0 },
  };

  let grandTotalPcs = 0;
  let grandTotalMtr = 0;
  let grandTotalMt = 0;
  let activeWos = 0;

  for (const [woId, rows] of wipByWo.entries()) {
    const wo = woMap.get(woId);
    const planMh = mhMap.get(woId) || mhMap.get(String(wo?.work_order_no).trim());
    const routeCode = rows[0]?.route_code || 'CDS';
    const isAlloy = routeCode.includes('ALLOY');
    const isCds = routeCode.includes('CDS');

    const sortedStages = [...rows].sort((a, b) => (Number(a.sequence_no) || 0) - (Number(b.sequence_no) || 0));
    const rollStage = sortedStages.find(s => s.stage_code === 'ROLLING');
    const rollGrossPcs = rollStage ? Number(rollStage.gross_output_pcs || 0) : 0;
    const rollGrossMtr = rollStage ? Number(rollStage.gross_output_mtr || rollStage.production_qty || 0) : 0;
    const rollRejPcs = rollStage ? Number(rollStage.rejection_pcs || 0) : 0;
    const rollHtcPcs = Math.max(0, rollGrossPcs - rollRejPcs);

    // Actual physical Mother Hollow length from mill output
    const mhAvgLen = (rollGrossPcs > 0 && rollGrossMtr > 0)
      ? Number((rollGrossMtr / rollGrossPcs).toFixed(3))
      : Number(planMh?.mh_avg_length || rollStage?.mh_avg_length || rollStage?.avg_length || 6.0);
    const finalAvgLen = Number(sortedStages[sortedStages.length - 1]?.avg_length || (wo?.l1 && wo?.l2 ? (Number(wo.l1) + Number(wo.l2)) / 2 : wo?.l1 || wo?.l2 || 6.0));
    const mhOd = Number(planMh?.mh_od || rollStage?.mh_od || rollStage?.od || wo?.size_od || 0);
    const mhWt = Number(planMh?.mh_wt || rollStage?.mh_wt || rollStage?.wt || wo?.size_wt || 0);
    const finOd = Number(wo?.size_od || rows[0]?.od || rows[0]?.size_od || 0);
    const finWt = Number(wo?.size_wt || rows[0]?.wt || rows[0]?.size_wt || 0);

    const stageProdMap = new Map();
    for (const s of sortedStages) {
      const prodPcs = Number(s.gross_output_pcs || s.net_output_pcs || s.production_qty_pcs || 0);
      const rejPcs = Number(s.rejection_pcs || 0);
      const prodMtr = Number(s.gross_output_mtr || s.net_output_mtr || s.production_qty || 0);
      const rejMtr = Number(s.rejection_mtr || 0);
      stageProdMap.set(s.stage_code, { prodPcs, rejPcs, prodMtr, rejMtr });
    }

    let woHasActiveWip = false;

    for (let i = 0; i < sortedStages.length; i++) {
      const cur = sortedStages[i];
      const sc = cur.stage_code;
      if (sc === 'ROLLING') continue; // exclude rolling feeder

      let incomingPcs = 0;
      let stageLen = finalAvgLen;
      let stageOd = finOd;
      let stageWt = finWt;

      if (sc === 'HOLLOW_HEAT_TREATMENT') {
        incomingPcs = isAlloy ? rollHtcPcs : 0;
        stageLen = mhAvgLen;
        stageOd = mhOd;
        stageWt = mhWt;
      } else if (sc === 'DRAW') {
        const hhtProd = stageProdMap.get('HOLLOW_HEAT_TREATMENT');
        incomingPcs = isAlloy ? (hhtProd?.prodPcs || 0) : rollHtcPcs;
        stageLen = mhAvgLen;
        stageOd = mhOd;
        stageWt = mhWt;
      } else if (sc === 'HEAT_TREATMENT') {
        if (isCds) {
          const drawProd = stageProdMap.get('DRAW');
          incomingPcs = drawProd?.prodPcs || 0;
          const finUnitWeight = finOd > finWt && finWt > 0 ? (finOd - finWt) * finWt * 0.0246615 * 0.001 : 0;
          const mhUnitWeight = mhOd > mhWt && mhWt > 0 ? (mhOd - mhWt) * mhWt * 0.0246615 * 0.001 : 0;
          stageLen = (finUnitWeight > 0 && mhUnitWeight > 0) ? Number((mhAvgLen * (mhUnitWeight / finUnitWeight)).toFixed(3)) : finalAvgLen;
        } else {
          incomingPcs = rollHtcPcs;
          stageLen = mhAvgLen;
        }
        stageOd = finOd;
        stageWt = finWt;
      } else if (sc === 'BAND_SAW') {
        if (routeCode.includes('HFS')) {
          incomingPcs = isAlloy ? (stageProdMap.get('HOLLOW_HEAT_TREATMENT')?.prodPcs || 0) : rollHtcPcs;
          stageLen = mhAvgLen;
          stageOd = mhOd;
          stageWt = mhWt;
        } else {
          const htProd = stageProdMap.get('HEAT_TREATMENT');
          incomingPcs = htProd?.prodPcs || 0;
          const finUnitWeight = finOd > finWt && finWt > 0 ? (finOd - finWt) * finWt * 0.0246615 * 0.001 : 0;
          const mhUnitWeight = mhOd > mhWt && mhWt > 0 ? (mhOd - mhWt) * mhWt * 0.0246615 * 0.001 : 0;
          stageLen = (finUnitWeight > 0 && mhUnitWeight > 0) ? Number((mhAvgLen * (mhUnitWeight / finUnitWeight)).toFixed(3)) : finalAvgLen;
          stageOd = finOd;
          stageWt = finWt;
        }
      } else if (sc === 'VDI') {
        const bsProd = stageProdMap.get('BAND_SAW');
        incomingPcs = bsProd?.prodPcs || 0;
        stageLen = finalAvgLen;
        stageOd = finOd;
        stageWt = finWt;
      } else if (sc === 'FINISHING') {
        const vdiProd = stageProdMap.get('VDI');
        incomingPcs = vdiProd?.prodPcs || 0;
        stageLen = finalAvgLen;
        stageOd = finOd;
        stageWt = finWt;
      }

      const curData = stageProdMap.get(sc) || { prodPcs: 0, rejPcs: 0 };
      const curConsumed = curData.prodPcs + curData.rejPcs;

      let maxDownstream = 0;
      for (let j = i + 1; j < sortedStages.length; j++) {
        const down = sortedStages[j];
        const downData = stageProdMap.get(down.stage_code);
        if (downData && (downData.prodPcs + downData.rejPcs) > maxDownstream) {
          maxDownstream = downData.prodPcs + downData.rejPcs;
        }
      }

      const totalConsumedPcs = Math.max(curConsumed, maxDownstream);
      const wipPcs = Math.max(0, incomingPcs - totalConsumedPcs);
      const wipMtr = Number((wipPcs * stageLen).toFixed(2));
      const wipMt = mtFromMtr(wipMtr, stageOd, stageWt);

      if (stageTotals[sc]) {
        stageTotals[sc].pcs += wipPcs;
        stageTotals[sc].mtr += wipMtr;
        stageTotals[sc].mt += wipMt;
        if (wipPcs > 0) stageTotals[sc].count++;
      }

      if (wipPcs > 0) {
        woHasActiveWip = true;
        grandTotalPcs += wipPcs;
        grandTotalMtr += wipMtr;
        grandTotalMt += wipMt;
      }
    }

    if (woHasActiveWip) activeWos++;
  }

  console.log('=== EXACT LIVE PLANT WIP SUMMARY ===');
  console.log('Active Work Orders with WIP: ' + activeWos);
  console.log('GRAND TOTAL PLANT WIP:');
  console.log('  Mass (MT)   : ' + grandTotalMt.toFixed(3) + ' MT');
  console.log('  Length (MTR): ' + grandTotalMtr.toFixed(2) + ' MTR');
  console.log('  Pieces (PCS): ' + grandTotalPcs + ' PCS');
  console.log('\n--- BY WORK CENTER BREAKDOWN ---');
  for (const [k, v] of Object.entries(stageTotals)) {
    console.log('  ' + v.label.padEnd(24) + ': ' + v.mt.toFixed(3).padStart(10) + ' MT | ' + v.mtr.toFixed(2).padStart(12) + ' MTR | ' + String(v.pcs).padStart(6) + ' PCS (' + v.count + ' WOs)');
  }
}

run();
