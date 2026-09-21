// scripts/debug_wip_view.cjs
const SUPABASE_URL = "https://dzhvbftmuwfyuaarsxtk.supabase.co/rest/v1";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6aHZiZnRtdXdmeXVhYXJzeHRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzUwOTYzNywiZXhwIjoyMTAzMDg1NjM3fQ.jtkcZxBOmgEEHvBzGIHYdPpzJf2zA5xfdJZ6XuDSmds";
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function run() {
  const [woRes, wipRes, plRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/work_orders?work_order_no=in.(6312,6068,6072,6188,6189,6190)&select=id,work_order_no,grade,size_od,size_wt`, { headers }).then(r => r.json()),
    fetch(`${SUPABASE_URL}/vw_route_stage_wip?work_order_no=in.(6312,6068,6072,6188,6189,6190)&select=*`, { headers }).then(r => r.json()),
    fetch(`${SUPABASE_URL}/production_logs?select=id,work_order_id,stage_id,output_qty,rejection_qty,htc_ok,remarks,process_stages(stage_code)`, { headers }).then(r => r.json())
  ]);

  console.log("Work orders:", woRes);
  console.log("\nvw_route_stage_wip sample rows:");
  console.table(wipRes.map(r => ({
    wo_no: r.work_order_no,
    stage_code: r.stage_code,
    incoming_qty: r.incoming_qty,
    production_qty: r.production_qty,
    current_wip: r.current_wip,
    current_wip_pcs: r.current_wip_pcs,
    current_wip_mt: r.current_wip_mt,
  })));
}

run();
