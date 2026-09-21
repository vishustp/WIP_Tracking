// scripts/check_alloy_routes.cjs
const SUPABASE_URL = "https://dzhvbftmuwfyuaarsxtk.supabase.co/rest/v1";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6aHZiZnRtdXdmeXVhYXJzeHRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzUwOTYzNywiZXhwIjoyMTAzMDg1NjM3fQ.jtkcZxBOmgEEHvBzGIHYdPpzJf2zA5xfdJZ6XuDSmds";
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function checkReportData() {
  const [wipRes, woRes, plansRes, routesRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/vw_route_stage_wip?select=*`, { headers }).then(r => r.json()),
    fetch(`${SUPABASE_URL}/work_orders?select=id,work_order_no,grade,specification,size_od,size_wt,l1,l2`, { headers }).then(r => r.json()),
    fetch(`${SUPABASE_URL}/rolling_plans?select=work_order_id,mh_od,mh_wt,mh_l1,mh_l2,process_route_id,status,process_routes(route_code,route_name)`, { headers }).then(r => r.json()),
    fetch(`${SUPABASE_URL}/process_routes?select=id,route_code,route_name`, { headers }).then(r => r.json()),
  ]);

  const rawWip = Array.isArray(wipRes) ? wipRes : [];
  const workOrders = Array.isArray(woRes) ? woRes : [];
  const plans = Array.isArray(plansRes) ? plansRes : [];
  const routes = Array.isArray(routesRes) ? routesRes : [];

  const planMap = new Map();
  plans.forEach(p => planMap.set(p.work_order_id, p));

  const routeMap = new Map();
  routes.forEach(r => routeMap.set(r.id, r));

  const alloyWoNumbers = ['6312', '6068', '6072', '6188', '6189', '6190', '6232', '6302', '6300', '6306', '6301', '6303', '5896'];

  console.log("=== ROUTE CODES FOR 13 ALLOY WORK ORDERS ===");
  const table = [];
  alloyWoNumbers.forEach(num => {
    const wo = workOrders.find(w => w.work_order_no === num);
    if (!wo) {
      table.push({ wo_no: num, grade: 'NOT FOUND', route_code: 'N/A' });
      return;
    }
    const pl = planMap.get(wo.id);
    const rCode = pl?.process_routes?.route_code || 'NULL';
    table.push({
      wo_no: num,
      grade: wo.grade || wo.specification,
      route_code_in_plan: rCode,
    });
  });
  console.table(table);
}

checkReportData();
