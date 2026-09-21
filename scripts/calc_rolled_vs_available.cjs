// scripts/calc_rolled_vs_available.cjs
const SUPABASE_URL = "https://dzhvbftmuwfyuaarsxtk.supabase.co/rest/v1";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6aHZiZnRtdXdmeXVhYXJzeHRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzUwOTYzNywiZXhwIjoyMTAzMDg1NjM3fQ.jtkcZxBOmgEEHvBzGIHYdPpzJf2zA5xfdJZ6XuDSmds";
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };

function calcWeightPerMtr(od, wt) {
  if (!od || !wt || od <= wt) return 0;
  return (od - wt) * wt * 0.0246615 / 1000;
}

function getPcsFromRemarksOrQty(remarks, outputQty, avgLen) {
  if (remarks && remarks.includes('[PCS:')) {
    const m = remarks.match(/\[PCS:\s*(\d+)\]/i);
    if (m && m[1]) return parseInt(m[1], 10);
  }
  return avgLen > 0 ? Math.round(outputQty / avgLen) : 0;
}

async function run() {
  const [woRes, plRes, rpRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/work_orders?select=id,work_order_no,customer_name,grade,size_od,size_wt,l1,l2,ordered_qty_pcs,ordered_qty_mtr,ordered_qty_mt`, { headers }).then(r => r.json()),
    fetch(`${SUPABASE_URL}/production_logs?select=id,work_order_id,stage_id,output_qty,rejection_qty,htc_ok,remarks,process_stages(stage_code,stage_name)`, { headers }).then(r => r.json()),
    fetch(`${SUPABASE_URL}/rolling_plans?select=work_order_id,mh_od,mh_wt,mh_l1,mh_l2,process_routes(route_code)`, { headers }).then(r => r.json())
  ]);

  const rpMap = {};
  rpRes.forEach(rp => {
    rpMap[rp.work_order_id] = rp;
  });

  const woMap = {};
  woRes.forEach(wo => {
    const rp = rpMap[wo.id];
    let route = rp?.process_routes?.route_code || '';
    if (!route) {
      if (wo.grade?.includes('T11') || wo.grade?.includes('T12') || wo.grade?.includes('T22')) {
        route = 'ALLOY_CDS';
      } else {
        route = 'CDS';
      }
    }

    const od = Number(wo.size_od || 0);
    const wt = Number(wo.size_wt || 0);
    const wtPerMtr = calcWeightPerMtr(od, wt);

    woMap[wo.id] = {
      id: wo.id,
      wo_no: wo.work_order_no,
      grade: wo.grade || 'Unknown',
      route,
      od,
      wt,
      wtPerMtr,
      rolled_gross_pcs: 0,
      rolled_htc_ok_pcs: 0,
      rolled_meters: 0,
      rolled_mt: 0,
      hollow_ht_pcs: 0,
      draw_pcs: 0,
      ht_pcs: 0,
      band_saw_pcs: 0,
      finishing_pcs: 0
    };
  });

  plRes.forEach(log => {
    const item = woMap[log.work_order_id];
    if (!item) return;

    const stage = log.process_stages?.stage_code;
    const outputQty = Number(log.output_qty || 0);
    const rejectionQty = Number(log.rejection_qty || 0);
    const htcOk = Number(log.htc_ok || outputQty);

    if (stage === 'ROLLING') {
      let grossPcs = 0;
      let htcOkPcs = 0;
      if (log.remarks && log.remarks.includes('[PCS:')) {
        const m = log.remarks.match(/\[PCS:\s*(\d+)\]/i);
        if (m && m[1]) {
          grossPcs = parseInt(m[1], 10);
        }
      }
      if (log.remarks && log.remarks.includes('[HTC_OK:')) {
        const m = log.remarks.match(/\[HTC_OK:\s*(\d+)\]/i);
        if (m && m[1]) {
          htcOkPcs = parseInt(m[1], 10);
        }
      }
      if (!grossPcs) grossPcs = Math.round(outputQty / 6.0) || 1;
      if (!htcOkPcs) htcOkPcs = Math.round(htcOk / 6.0) || grossPcs;

      item.rolled_gross_pcs += grossPcs;
      item.rolled_htc_ok_pcs += htcOkPcs;
      item.rolled_meters += outputQty;
      item.rolled_mt += (outputQty * item.wtPerMtr);
    } else if (stage === 'HOLLOW_HEAT_TREATMENT') {
      const avgLen = item.rolled_meters > 0 && item.rolled_htc_ok_pcs > 0 ? (item.rolled_meters / item.rolled_htc_ok_pcs) : 6.0;
      item.hollow_ht_pcs += getPcsFromRemarksOrQty(log.remarks, outputQty, avgLen);
    } else if (stage === 'DRAW') {
      const avgLen = item.rolled_meters > 0 && item.rolled_htc_ok_pcs > 0 ? (item.rolled_meters / item.rolled_htc_ok_pcs) : 6.0;
      item.draw_pcs += getPcsFromRemarksOrQty(log.remarks, outputQty, avgLen);
    } else if (stage === 'HEAT_TREATMENT') {
      const avgLen = item.rolled_meters > 0 && item.rolled_htc_ok_pcs > 0 ? (item.rolled_meters / item.rolled_htc_ok_pcs) : 6.0;
      item.ht_pcs += getPcsFromRemarksOrQty(log.remarks, outputQty, avgLen);
    } else if (stage === 'BAND_SAW') {
      const avgLen = item.rolled_meters > 0 && item.rolled_htc_ok_pcs > 0 ? (item.rolled_meters / item.rolled_htc_ok_pcs) : 6.0;
      item.band_saw_pcs += getPcsFromRemarksOrQty(log.remarks, outputQty, avgLen);
    } else if (stage === 'FINISHING') {
      const avgLen = item.rolled_meters > 0 && item.rolled_htc_ok_pcs > 0 ? (item.rolled_meters / item.rolled_htc_ok_pcs) : 6.0;
      item.finishing_pcs += getPcsFromRemarksOrQty(log.remarks, outputQty, avgLen);
    }
  });

  let totalRolledChargedPcs = 0;
  let totalRolledHtcOkPcs = 0;
  let totalRolledMeters = 0;
  let totalRolledMT = 0;

  let totalAvailableWipPcs = 0;
  let totalAvailableWipMtr = 0;
  let totalAvailableWipMT = 0;

  let alloyRolledMT = 0, alloyRolledPcs = 0, alloyAvailMT = 0, alloyAvailPcs = 0;
  let carbonRolledMT = 0, carbonRolledPcs = 0, carbonAvailMT = 0, carbonAvailPcs = 0;
  let drawQueuePcs = 0, drawQueueMT = 0;
  let bandSawQueuePcs = 0, bandSawQueueMT = 0;
  let finalHtQueuePcs = 0, finalHtQueueMT = 0;

  let activeWoCount = 0;

  Object.values(woMap).forEach(w => {
    if (w.rolled_htc_ok_pcs === 0 && w.rolled_gross_pcs === 0) return;
    activeWoCount++;

    totalRolledChargedPcs += w.rolled_gross_pcs;
    totalRolledHtcOkPcs += w.rolled_htc_ok_pcs;
    totalRolledMeters += w.rolled_meters;
    totalRolledMT += w.rolled_mt;

    const isAlloy = w.grade.includes('T11') || w.grade.includes('T12') || w.grade.includes('T22') || w.route === 'ALLOY_CDS' || w.route === 'ALLOY_HFS';
    const isHfs = w.route === 'HFS' || w.route === 'ALLOY_HFS';
    const avgLen = w.rolled_meters > 0 && w.rolled_htc_ok_pcs > 0 ? (w.rolled_meters / w.rolled_htc_ok_pcs) : 6.0;

    if (isAlloy) {
      alloyRolledMT += w.rolled_mt;
      alloyRolledPcs += w.rolled_htc_ok_pcs;
    } else {
      carbonRolledMT += w.rolled_mt;
      carbonRolledPcs += w.rolled_htc_ok_pcs;
    }

    if (isHfs) {
      const availPcs = Math.max(0, w.rolled_htc_ok_pcs - w.band_saw_pcs);
      const availMtr = availPcs * avgLen;
      const availMt = availMtr * w.wtPerMtr;
      bandSawQueuePcs += availPcs;
      bandSawQueueMT += availMt;
      totalAvailableWipPcs += availPcs;
      totalAvailableWipMtr += availMtr;
      totalAvailableWipMT += availMt;
      if (isAlloy) {
        alloyAvailPcs += availPcs;
        alloyAvailMT += availMt;
      } else {
        carbonAvailPcs += availPcs;
        carbonAvailMT += availMt;
      }
    } else {
      // CDS or ALLOY_CDS
      const availPcs = Math.max(0, w.rolled_htc_ok_pcs - w.draw_pcs);
      const availMtr = availPcs * avgLen;
      const availMt = availMtr * w.wtPerMtr;
      drawQueuePcs += availPcs;
      drawQueueMT += availMt;
      totalAvailableWipPcs += availPcs;
      totalAvailableWipMtr += availMtr;
      totalAvailableWipMT += availMt;
      if (isAlloy) {
        alloyAvailPcs += availPcs;
        alloyAvailMT += availMt;
      } else {
        carbonAvailPcs += availPcs;
        carbonAvailMT += availMt;
      }

      if (w.draw_pcs > 0) {
        const htQueuePcs = Math.max(0, w.draw_pcs - w.ht_pcs);
        const htQueueMtr = htQueuePcs * avgLen;
        const htQueueMt = htQueueMtr * w.wtPerMtr;
        finalHtQueuePcs += htQueuePcs;
        finalHtQueueMT += htQueueMt;
        totalAvailableWipPcs += htQueuePcs;
        totalAvailableWipMtr += htQueueMtr;
        totalAvailableWipMT += htQueueMt;
        if (isAlloy) {
          alloyAvailPcs += htQueuePcs;
          alloyAvailMT += htQueueMt;
        } else {
          carbonAvailPcs += htQueuePcs;
          carbonAvailMT += htQueueMt;
        }
      }
    }
  });

  console.log('======================================================================');
  console.log(`TOTAL ACTIVE WORK ORDERS WITH ROLLING: ${activeWoCount}`);
  console.log('======================================================================');
  console.log('1. HOT ROLLING TONNAGE (STEEL CHARGED INTO MILL):');
  console.log(`   • Gross Rolled Pieces:      ${totalRolledChargedPcs.toLocaleString()} PCS`);
  console.log(`   • HTC OK Mother Hollows:    ${totalRolledHtcOkPcs.toLocaleString()} PCS`);
  console.log(`   • Rolled Length:            ${totalRolledMeters.toFixed(1).toLocaleString()} MTR`);
  console.log(`   • TOTAL ROLLED MASS:        ${totalRolledMT.toFixed(2)} MT`);
  console.log(`       - Carbon Steel Rolled:  ${carbonRolledMT.toFixed(2)} MT  (${carbonRolledPcs.toLocaleString()} PCS)`);
  console.log(`       - Alloy Steel Rolled:   ${alloyRolledMT.toFixed(2)} MT  (${alloyRolledPcs.toLocaleString()} PCS)`);
  console.log('----------------------------------------------------------------------');
  console.log('2. CURRENT AVAILABLE POST-ROLLING PLANT WIP:');
  console.log(`   • Total Available Pieces:   ${totalAvailableWipPcs.toLocaleString()} PCS`);
  console.log(`   • Total Available Length:   ${totalAvailableWipMtr.toFixed(1).toLocaleString()} MTR`);
  console.log(`   • TOTAL AVAILABLE WIP MASS: ${totalAvailableWipMT.toFixed(2)} MT`);
  console.log(`       - Draw Bench Queue (CDS):  ${drawQueueMT.toFixed(2)} MT  (${drawQueuePcs.toLocaleString()} PCS)`);
  console.log(`       - Band Saw Queue (HFS):    ${bandSawQueueMT.toFixed(2)} MT  (${bandSawQueuePcs.toLocaleString()} PCS)`);
  if (finalHtQueuePcs > 0) {
    console.log(`       - Final HT Queue:          ${finalHtQueueMT.toFixed(2)} MT  (${finalHtQueuePcs.toLocaleString()} PCS)`);
  }
  console.log('----------------------------------------------------------------------');
  console.log('3. AVAILABLE WIP BY MATERIAL CATEGORY:');
  console.log(`   • Carbon Steel Available:   ${carbonAvailMT.toFixed(2)} MT  (${carbonAvailPcs.toLocaleString()} PCS)`);
  console.log(`   • Alloy Steel Available:    ${alloyAvailMT.toFixed(2)} MT  (${alloyAvailPcs.toLocaleString()} PCS)`);
  console.log('======================================================================');
}

run();
