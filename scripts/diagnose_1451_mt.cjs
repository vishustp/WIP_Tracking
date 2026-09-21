// scripts/diagnose_1451_mt.cjs
const SUPABASE_URL = "https://dzhvbftmuwfyuaarsxtk.supabase.co/rest/v1";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6aHZiZnRtdXdmeXVhYXJzeHRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzUwOTYzNywiZXhwIjoyMTAzMDg1NjM3fQ.jtkcZxBOmgEEHvBzGIHYdPpzJf2zA5xfdJZ6XuDSmds";
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };

function calcWeightPerMtr(od, wt) {
  if (!od || !wt || od <= wt) return 0;
  return (od - wt) * wt * 0.0246615 / 1000;
}

async function run() {
  const [woRes, plRes, rpRes, vwRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/work_orders?select=id,work_order_no,grade,size_od,size_wt`, { headers }).then(r => r.json()),
    fetch(`${SUPABASE_URL}/production_logs?select=id,work_order_id,stage_id,output_qty,rejection_qty,htc_ok,remarks,process_stages(stage_code)`, { headers }).then(r => r.json()),
    fetch(`${SUPABASE_URL}/rolling_plans?select=work_order_id,mh_od,mh_wt,mh_l1,mh_l2`, { headers }).then(r => r.json()),
    fetch(`${SUPABASE_URL}/vw_route_stage_wip?select=*`, { headers }).then(r => r.json())
  ]);

  const workOrders = Array.isArray(woRes) ? woRes : [];
  const prodLogs = Array.isArray(plRes) ? plRes : [];
  const rollingPlans = Array.isArray(rpRes) ? rpRes : [];
  const viewRows = Array.isArray(vwRes) ? vwRes : [];

  console.log('Total Work Orders:', workOrders.length);
  console.log('Total Prod Logs:', prodLogs.length);
  console.log('Total View Rows:', viewRows.length);

  // Check sum of viewRows
  let viewHhtMt = 0, viewDrawMt = 0, viewHtMt = 0, viewBsMt = 0, viewTotalMt = 0;
  viewRows.forEach(r => {
    const mt = Number(r.current_wip_mt || 0);
    if (r.stage_code === 'HOLLOW_HEAT_TREATMENT') viewHhtMt += mt;
    if (r.stage_code === 'DRAW') viewDrawMt += mt;
    if (r.stage_code === 'HEAT_TREATMENT') viewHtMt += mt;
    if (r.stage_code === 'BAND_SAW') viewBsMt += mt;
    if (r.stage_code !== 'ROLLING') viewTotalMt += mt;
  });

  console.log('================================================================');
  console.log('DATABASE SQL VIEW (vw_route_stage_wip) TOTALS:');
  console.log('  - Hollow HT:  ', viewHhtMt.toFixed(3), 'MT');
  console.log('  - Cold Draw:  ', viewDrawMt.toFixed(3), 'MT');
  console.log('  - Final HT:   ', viewHtMt.toFixed(3), 'MT');
  console.log('  - Band Saw:   ', viewBsMt.toFixed(3), 'MT');
  console.log('  - TOTAL VIEW: ', viewTotalMt.toFixed(3), 'MT');
  console.log('================================================================');

  // Now calculate what is happening in SizeGradeWipReportClient.tsx
  // SizeGradeWipReportClient.tsx calculates:
  // mt = mtFromMtr(mtr, targetOd, targetWt) OR uses r.current_wip_mt
  const rpMap = new Map();
  rollingPlans.forEach(rp => rpMap.set(rp.work_order_id, rp));

  let clientTotalMtUsingTargetSize = 0;
  let clientTotalMtUsingMhSize = 0;

  workOrders.forEach(wo => {
    const rp = rpMap.get(wo.id);
    const finishWtPerMtr = calcWeightPerMtr(Number(wo.size_od), Number(wo.size_wt));
    const mhWtPerMtr = calcWeightPerMtr(Number(rp?.mh_od || wo.size_od), Number(rp?.mh_wt || wo.size_wt));

    // Find all rolling logs for this WO
    const logs = prodLogs.filter(l => l.work_order_id === wo.id && l.process_stages?.stage_code === 'ROLLING');
    let htcOkMtr = 0;
    logs.forEach(l => {
      htcOkMtr += Number(l.output_qty || 0);
    });

    clientTotalMtUsingTargetSize += (htcOkMtr * finishWtPerMtr);
    clientTotalMtUsingMhSize += (htcOkMtr * mhWtPerMtr);
  });

  console.log('TOTAL TONNAGE ACROSS ALL 91 WORK ORDERS:');
  console.log('  - If computed using Target Finished Size (size_od x size_wt): ', clientTotalMtUsingTargetSize.toFixed(2), 'MT');
  console.log('  - If computed using Mother Hollow Size   (mh_od x mh_wt):     ', clientTotalMtUsingMhSize.toFixed(2), 'MT');
  console.log('================================================================');
}

run();
