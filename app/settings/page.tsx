import { createClient } from '@/lib/supabase/server';
export default async function Page(){
 const s=await createClient();
 const [{data:routes},{data:stages}]=await Promise.all([s.from('process_routes').select('id,route_code,route_name,material_category,active').order('route_code'),s.from('process_stages').select('id,stage_code,stage_name,active').order('stage_code')]);
 return <div className="space-y-6"><div><h1 className="text-2xl font-bold">Settings</h1><p className="text-sm text-slate-500">Database-driven route and stage configuration.</p></div>
 <div className="grid gap-6 lg:grid-cols-2">
 <section className="rounded-xl border bg-white"><div className="border-b p-4 font-semibold">Process Routes</div><div className="divide-y">{(routes??[]).map((r: any)=><div className="flex justify-between p-4" key={r.id}><div><div className="font-medium">{r.route_code}</div><div className="text-sm text-slate-500">{r.route_name} · {r.material_category}</div></div><span className="text-sm">{r.active?'Active':'Inactive'}</span></div>)}</div></section>
 <section className="rounded-xl border bg-white"><div className="border-b p-4 font-semibold">Process Stages</div><div className="divide-y">{(stages??[]).map((r: any)=><div className="flex justify-between p-4" key={r.id}><div><div className="font-medium">{r.stage_name}</div><div className="text-sm text-slate-500">{r.stage_code}</div></div><span className="text-sm">{r.active?'Active':'Inactive'}</span></div>)}</div></section>
 </div></div>
}
