'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

type WO={id:string;work_order_no:string;customer_name:string|null;grade:string|null;ordered_qty:number;uom:'Pcs'|'Mtrs'};
type Route={id:string;route_code:string;route_name:string};

export default function DiversionForm(){
 const [wos,setWos]=useState<WO[]>([]),[routes,setRoutes]=useState<Route[]>([]);
 const [source,setSource]=useState(''),[target,setTarget]=useState(''),[qty,setQty]=useState(''),[route,setRoute]=useState(''),[multiple,setMultiple]=useState('1'),[reason,setReason]=useState(''),[date,setDate]=useState(new Date().toISOString().slice(0,10)),[available,setAvailable]=useState<number|null>(null),[busy,setBusy]=useState(false);
 useEffect(()=>{const s=createClient();Promise.all([s.from('work_orders').select('id,work_order_no,customer_name,grade,ordered_qty,uom').order('work_order_no'),s.from('process_routes').select('id,route_code,route_name').eq('active',true).order('route_code')]).then(([a,b])=>{if(a.error)toast.error(a.error.message);else setWos((a.data??[]) as WO[]);if(b.error)toast.error(b.error.message);else setRoutes((b.data??[]) as Route[]);});},[]);
 const lookup=async(id:string)=>{setSource(id);if(!id){setAvailable(null);return;}const {data,error}=await createClient().rpc('get_unplanned_qty',{p_work_order_id:id});if(error)toast.error(error.message);else setAvailable(Number(data??0));};
 const submit=async(e:React.FormEvent)=>{e.preventDefault();if(!source||!target||!route)return toast.error('Select source WO, target WO and route');if(source===target)return toast.error('Source and target WO must be different');const n=Number(qty);if(!Number.isFinite(n)||n<=0)return toast.error('Enter a valid diversion quantity');if(available!==null&&n>available)return toast.error(`Diversion exceeds available ${available}`);setBusy(true);const {error}=await createClient().rpc('create_diversion',{p_source:source,p_target:target,p_qty:n,p_route:route,p_multiple:Number(multiple),p_reason:reason,p_date:date});setBusy(false);if(error)toast.error(error.message);else{toast.success('Diversion created');setQty('');setMultiple('1');setReason('');await lookup(source);}};
 return <form onSubmit={submit} className="max-w-3xl space-y-5 rounded-xl border bg-white p-6 shadow-sm">
  <div><h1 className="text-2xl font-bold">Diversion Planning</h1><p className="text-sm text-slate-500">Select existing Work Orders from the imported master and allocate the diversion to a route.</p></div>
  <div className="grid gap-4 md:grid-cols-2">
   <div><label className="mb-1 block text-sm font-medium">Source Work Order</label><Select value={source} onChange={e=>void lookup(e.target.value)} required><option value="">Select source WO</option>{wos.map(x=><option key={x.id} value={x.id}>{x.work_order_no} · {x.customer_name||'No customer'} · {x.grade||'No grade'}</option>)}</Select></div>
   <div><label className="mb-1 block text-sm font-medium">Target Work Order</label><Select value={target} onChange={e=>setTarget(e.target.value)} required><option value="">Select target WO</option>{wos.filter(x=>x.id!==source).map(x=><option key={x.id} value={x.id}>{x.work_order_no} · {x.customer_name||'No customer'} · {x.grade||'No grade'}</option>)}</Select></div>
   <div className="rounded-lg bg-slate-50 p-3 text-sm"><div className="text-slate-500">Available Source Qty</div><div className="font-semibold">{available===null?'Select source':available}</div></div>
   <div><label className="mb-1 block text-sm font-medium">Diversion Qty</label><Input type="number" min="0.001" step="0.001" value={qty} onChange={e=>setQty(e.target.value)} required/></div>
   <div><label className="mb-1 block text-sm font-medium">Applicable Route</label><Select value={route} onChange={e=>setRoute(e.target.value)} required><option value="">Select route</option>{routes.map(r=><option key={r.id} value={r.id}>{r.route_code} — {r.route_name}</option>)}</Select></div>
   <div><label className="mb-1 block text-sm font-medium">Diversion Date</label><Input type="date" value={date} onChange={e=>setDate(e.target.value)} required/></div>
   <div><label className="mb-1 block text-sm font-medium">Multiple</label><Input type="number" min="0.001" step="0.001" value={multiple} onChange={e=>setMultiple(e.target.value)} required/></div>
   <div className="md:col-span-2"><label className="mb-1 block text-sm font-medium">Reason</label><Textarea value={reason} onChange={e=>setReason(e.target.value)} placeholder="Reason for diversion" required/></div>
  </div>
  <Button disabled={busy}>{busy?'Submitting...':'Create Diversion'}</Button>
 </form>
}
