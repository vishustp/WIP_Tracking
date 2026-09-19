// scripts/analyze_wip.cjs
const SUPABASE_URL = "https://dzhvbftmuwfyuaarsxtk.supabase.co/rest/v1";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6aHZiZnRtdXdmeXVhYXJzeHRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzUwOTYzNywiZXhwIjoyMTAzMDg1NjM3fQ.jtkcZxBOmgEEHvBzGIHYdPpzJf2zA5xfdJZ6XuDSmds";

const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
};

async function check() {
  const res = await fetch(`${SUPABASE_URL}/vw_route_stage_wip?current_wip=gt.0&select=work_order_no,stage_code,sequence_no,incoming_qty,production_qty,rejection_qty,current_wip,current_wip_mt,size_od,size_wt`, { headers });
  const data = await res.json();
  
  const wos = {};
  data.forEach(r => {
    if (!wos[r.work_order_no]) wos[r.work_order_no] = [];
    wos[r.work_order_no].push(r);
  });
  
  console.log('Total WOs with WIP:', Object.keys(wos).length);
  
  const summary = Object.entries(wos).map(([wo, rows]) => {
    const totalMt = rows.reduce((s, r) => s + (Number(r.current_wip_mt) || 0), 0);
    return {
      wo,
      totalMt,
      stages: rows.map(r => `${r.stage_code}(seq ${r.sequence_no}): wip=${Math.round(r.current_wip)}m (${(Number(r.current_wip_mt)||0).toFixed(1)} MT) [in=${Math.round(r.incoming_qty)}, out=${Math.round(r.production_qty)}]`)
    };
  }).sort((a,b) => b.totalMt - a.totalMt);
  
  console.log('\nTop 15 WOs with highest WIP:');
  summary.slice(0, 15).forEach(s => {
    console.log(`WO ${s.wo}: Total WIP = ${s.totalMt.toFixed(2)} MT`);
    s.stages.forEach(st => console.log(`   - ${st}`));
  });

  const topWoNos = summary.slice(0, 10).map(s => s.wo);
  const woRes = await fetch(`${SUPABASE_URL}/work_orders?work_order_no=in.(${topWoNos.join(',')})&select=id,work_order_no,status,planned_quantity_meters,planned_quantity_pcs`, { headers });
  const woData = await woRes.json();
  
  console.log('\nWork Order master details:');
  woData.forEach(w => {
    console.log(`WO ${w.work_order_no} (Status: ${w.status}): Planned ${w.planned_quantity_meters} m (${w.planned_quantity_pcs} pcs)`);
  });
}

check();
