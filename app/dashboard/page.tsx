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
      supabase
        .from('vw_route_stage_wip')
        .select('work_order_id,work_order_no,customer_name,route_id,route_code,route_name,stage_id,stage_code,stage_name,sequence_no,incoming_qty,current_wip,current_wip_pcs,current_wip_mt,size_od,size_wt,l1,l2')
        .gt('current_wip', 0)
        .order('sequence_no', { ascending: true })
        .order('work_order_no', { ascending: true }),
      supabase
        .from('vw_work_order_summary')
        .select('*')
        .gt('total_pending', 0)
        .order('target_date', { ascending: true, nullsFirst: false })
        .limit(20),
    ]);

    const rawWip = wipRes.data ?? [];
    const totalWipMtr = rawWip.reduce((sum, r: any) => sum + (Number(r.current_wip) || 0), 0);
    const totalWipPcs = rawWip.reduce((sum, r: any) => sum + (Number(r.current_wip_pcs) || 0), 0);
    const totalWipMt = rawWip.reduce((sum, r: any) => sum + (Number(r.current_wip_mt) || 0), 0);

    kpi = {
      ...(kpiRes.data ?? {}),
      total_wip: kpiRes.data?.total_wip ?? totalWipMtr,
      total_wip_mtr: totalWipMtr,
      total_wip_pcs: totalWipPcs,
      total_wip_mt: totalWipMt,
    };
    wip = rawWip;
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

