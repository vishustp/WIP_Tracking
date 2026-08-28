import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import Link from 'next/link';

export default async function Dashboard(){
  const supabase=await createClient();
  const [{data:kpi},{data:wip},{data:pending}] = await Promise.all([
    supabase.from('vw_dashboard_kpis').select('*').maybeSingle(),
    supabase.from('vw_route_stage_wip').select('work_order_no,route_code,stage_name,current_wip,sequence_no').gt('current_wip',0).order('work_order_no').limit(30),
    supabase.from('vw_work_order_summary').select('*').gt('total_pending',0).order('target_date',{ascending:true}).limit(8),
  ]);
  const cards=[
    ['Active Work Orders',kpi?.active_work_orders??0],
    ['Pending Planning',kpi?.pending_planning??0],
    ['Scheduled',kpi?.scheduled_orders??0],
    ['In Progress',kpi?.in_progress_orders??0],
    ['Completed Today',kpi?.completed_today??0],
    ['Total WIP',kpi?.total_wip??0],
    ['Rejection',kpi?.rejection_qty??0],
    ['Delayed Orders',kpi?.delayed_orders??0],
  ];
  return <div className="space-y-6">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
      <div><h1 className="text-3xl font-bold">Production Dashboard</h1></div>
      <div className="flex flex-wrap gap-2">
        <Link href="/work-orders" className="rounded-lg border bg-white px-3 py-2 text-sm font-medium">Work Orders</Link>
        <Link href="/rolling-plans" className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white">Issue Rolling Plan</Link>
      </div>
    </div>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map(([n,v])=><Card key={String(n)}><CardContent><div className="text-sm text-slate-500">{n}</div><div className="mt-2 text-3xl font-bold">{String(v)}</div></CardContent></Card>)}
    </div>
    <div className="grid gap-6 xl:grid-cols-2">
      <Card><CardHeader><h2 className="font-semibold">Current Route-aware WIP</h2></CardHeader><CardContent>
        {(wip??[]).length===0?<p className="text-sm text-slate-500">No positive WIP currently available.</p>:
        <div className="overflow-auto"><table className="min-w-full text-sm"><thead><tr className="border-b text-left text-slate-500"><th className="p-2">WO</th><th className="p-2">Route</th><th className="p-2">Stage</th><th className="p-2 text-right">WIP</th></tr></thead><tbody>{wip!.map((x:any)=><tr key={`${x.work_order_no}-${x.route_code}-${x.stage_name}`} className="border-b"><td className="p-2 font-medium">{x.work_order_no}</td><td className="p-2">{x.route_code}</td><td className="p-2">{x.stage_name}</td><td className="p-2 text-right">{x.current_wip}</td></tr>)}</tbody></table></div>}
      </CardContent></Card>
      <Card><CardHeader><h2 className="font-semibold">Priority Pending Orders</h2></CardHeader><CardContent>
        {(pending??[]).length===0?<p className="text-sm text-slate-500">No pending orders.</p>:
        <div className="space-y-2">{pending!.map((x:any)=><div key={x.work_order_id} className="flex items-center justify-between rounded-lg border p-3"><div><div className="font-medium">{x.work_order_no}</div><div className="text-xs text-slate-500">{x.customer??'—'} · {x.route||'Unplanned'}</div></div><div className="text-right"><div className="font-semibold">{x.total_pending}</div><div className="text-xs text-slate-500">{x.target_date??'No target'}</div></div></div>)}</div>}
      </CardContent></Card>
    </div>
  </div>
}
