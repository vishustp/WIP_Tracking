'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

type WO={id:string;work_order_no:string;ordered_qty:number};
type Route={id:string;route_code:string;route_name:string};

export default function DiversionForm(){
 const [wos,setWos]=useState<WO[]>([]),[routes,setRoutes]=useState<Route[]>([]);
 const [source,setSource]=useState(''),[target,setTarget]=useState(''),[qty,setQty]=useState(''),[route,setRoute]=useState(''),[reason,setReason]=useState(''),[date,setDate]=useState(new Date().toISOString().slice(0,10)),[available,setAvailable]=useState<number|null>(null),[busy,setBusy]=useState(false);
 useEffect(()=>{const s=createClient();Promise.all([s.from('work_orders').select('id,work_order_no,ordered_qty').order('work_order_no'),s.from('process_routes').select('id,route_code,route_name').eq('active',true).order('route_code')]).then(([a,b])=>{setWos((a.data??[]) as WO[]);setRoutes((b.data??[]) as Route[]);});},[]);
 const lookup=async(id:string)=>{setSource(id);if(!id){setAvailable(null);return;}const {data,error}=await createClient().rpc('get_unplanned_qty',{p_work_order_id:id});if(error)toast.error(error.message);else setAvailable(Number(data??0));};
 const submit=async(e:React.FormEvent)=>{e.preventDefault();if(source===target)return toast.error('Source and target WO must be different');if(available!==null&&Number(qty)>available)return toast.error('Diversion exceeds available source quantity');setBusy(true);const {error}=await createClient().rpc('create_diversion',{p_source:source,p_target:target,p_qty:Number(qty),p_route:route,p_reason:reason,p_date:date});setBusy(false);if(error)toast.error(error.message);else{toast.success('Diversion created');setQty('');setReason('');lookup(source);}};
 return <form onSubmit={submit} className="max-w-3xl space-y-5 rounded-xl border bg-white p-6 shadow-sm">
  <div><h1 className="text-2xl font-bold">Diversion Planning</h1><p className="text-sm text-slate-500">The diverted quantity receives its own target WO + route allocation.</p></div>
  <div className="grid gap-4 md:grid-cols-2">
   <div><label className="mb-1 block text-sm font-medium">Source Work Order</label><Select value={source} onChange={e=>lookup(e.target.value)} required><option value="">Select source WO</option>{wos.map(x=><option key={x.id} value={x.id}>{x.work_order_no}</option>)}</Select></div>
   <div><label className="mb-1 block text-sm font-medium">Target Work Order</label><Select value={target} onChange={e=>setTarget(e.target.value)} required><option value="">Select target WO</option>{wos.filter(x=>x.id!==source).map(x=><option key={x.id} value={x.id}>{x.work_order_no}</option>)}</Select></div>
   <div className="rounded-lg bg-slate-50 p-3 text-sm"><div className="text-slate-500">Available Source Qty</div><div className="font-semibold">{available===null?'Select source':available}</div></div>
   <div><label className="mb-1 block text-sm font-medium">Diversion Qty</label><Input type="number" min="0.001" step="0.001" value={qty} onChange={e=>setQty(e.target.value)} required/></div>
   <div><label className="mb-1 block text-sm font-medium">Applicable Route</label><Select value={route} onChange={e=>setRoute(e.target.value)} required><option value="">Select route</option>{routes.map(r=><option key={r.id} value={r.id}>{r.route_code} — {r.route_name}</option>)}</Select></div>
   <div><label className="mb-1 block text-sm font-medium">Diversion Date</label><Input type="date" value={date} onChange={e=>setDate(e.target.value)} required/></div>
   <div className="md:col-span-2"><label className="mb-1 block text-sm font-medium">Reason</label><Textarea value={reason} onChange={e=>setReason(e.target.value)} placeholder="Reason for diversion" required/></div>
  </div>
  <Button disabled={busy}>{busy?'Submitting...':'Create Diversion'}</Button>
 </form>
}
