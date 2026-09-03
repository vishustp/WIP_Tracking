import { createClient } from '@/lib/supabase/server';
import DashboardClient from '@/components/dashboard/DashboardClient';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  let kpi = null;
  let wip: any[] = [];
  let pending: any[] = [];

  try {
    const supabase = await createClient();
    const [kpiRes, wipRes, pendingRes] = await Promise.all([
      supabase.from('vw_dashboard_kpis').select('*').maybeSingle(),
      supabase.from('vw_route_stage_wip').select('work_order_no,route_code,stage_name,current_wip,sequence_no').gt('current_wip', 0).order('work_order_no').limit(30),
      supabase.from('vw_work_order_summary').select('*').gt('total_pending', 0).order('target_date', { ascending: true }).limit(12),
    ]);
    kpi = kpiRes.data;
    wip = wipRes.data ?? [];
    pending = pendingRes.data ?? [];
  } catch (err) {
    console.warn('[Dashboard] Supabase not connected or query failed:', err);
  }

  return (
    <DashboardClient
      kpi={kpi as any}
      wip={wip as any}
      pending={pending as any}
    />
  );
}

