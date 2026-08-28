'use client';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

type WO={id:string;work_order_no:string;customer_name:string|null;grade:string|null;size_od:number|null;size_wt:number|null;l1:number|null;l2:number|null;ordered_qty:number;uom:'Pcs'|'Mtrs';balance_qty_pcs:number;balance_qty_mtr:number;balance_qty_mt:number};
type Route={id:string;route_code:string;route_name:string};
const fmt=(n:number|null|undefined)=>n==null?'—':n.toLocaleString(undefined,{maximumFractionDigits:3});

export default function DiversionForm(){
 const [wos,setWos]=useState<WO[]>([]),[routes,setRoutes]=useState<Route[]>([]);
 const [source,setSource]=useState(''),[target,setTarget]=useState(''),[qty,setQty]=useState(''),[route,setRoute]=useState(''),[multiple,setMultiple]=useState('1'),[reason,setReason]=useState(''),[date,setDate]=useState(new Date().toISOString().slice(0,10)),[available,setAvailable]=useState<number|null>(null),[busy,setBusy]=useState(false);
 useEffect(()=>{const s=createClient();Promise.all([s.from('work_orders').select('id,work_order_no,customer_name,grade,size_od,size_wt,l1,l2,ordered_qty,uom,balance_qty_pcs,balance_qty_mtr,balance_qty_mt').order('work_order_no'),s.from('process_routes').select('id,route_code,route_name').eq('active',true).order('route_code')]).then(([a,b])=>{if(a.error)toast.error(a.error.message);else setWos((a.data??[]) as WO[]);if(b.error)toast.error(b.error.message);else setRoutes((b.data??[]) as Route[]);});},[]);
 const selected=useMemo(()=>wos.find(x=>x.id===source),[wos,source]);
 const lookup=async(id:string)=>{setSource(id);if(!id){setAvailable(null);return;}const {data,error}=await createClient().rpc('get_unplanned_qty',{p_work_order_id:id});if(error)toast.error(error.message);else setAvailable(Number(data??0));};
 const submit=async(e:React.FormEvent)=>{e.preventDefault();if(!source||!target||!route)return toast.error('Select source WO, target WO and route');if(source===target)return toast.error('Source and target WO must be different');const n=Number(qty);if(!Number.isFinite(n)||n<=0)return toast.error(`Enter a valid diversion quantity in ${selected?.uom??'UOM'}`);if(available!==null&&n>available)return toast.error(`Diversion exceeds available ${fmt(available)} ${selected?.uom??''}`);setBusy(true);const {error}=await createClient().rpc('create_diversion',{p_source:source,p_target:target,p_qty:n,p_route:route,p_multiple:Number(multiple),p_reason:reason,p_date:date});setBusy(false);if(error)toast.error(error.message);else{toast.success('Diversion created');setQty('');setMultiple('1');setReason('');await lookup(source);}};
 return <form onSubmit={submit} className="max-w-4xl space-y-4 rounded-xl border bg-white p-5 shadow-sm">
  <h1 className="text-xl font-semibold">Diversion Planning</h1>
  <div className="grid gap-3 md:grid-cols-2">
   <div><label className="mb-1 block text-sm font-medium">Source Work Order</label><Select value={source} onChange={e=>void lookup(e.target.value)} required><option value="">Select source WO</option>{wos.map(x=><option key={x.id} value={x.id}>{x.work_order_no} · {x.customer_name||'No customer'} · {x.grade||'No grade'}</option>)}</Select></div>
   <div><label className="mb-1 block text-sm font-medium">Target Work Order</label><Select value={target} onChange={e=>setTarget(e.target.value)} required><option value="">Select target WO</option>{wos.filter(x=>x.id!==source).map(x=><option key={x.id} value={x.id}>{x.work_order_no} · {x.customer_name||'No customer'} · {x.grade||'No grade'}</option>)}</Select></div>
   <div className="rounded-lg border p-3"><div className="text-xs text-slate-500">Available</div><div className="font-semibold">{available===null?'—':`${fmt(available)} ${selected?.uom??''}`}</div></div>
   <div><label className="mb-1 block text-sm font-medium">Diversion Qty <span className="font-normal text-slate-500">({selected?.uom??'UOM'})</span></label><Input type="number" min="0.001" step="0.001" value={qty} onChange={e=>setQty(e.target.value)} required/></div>
   <div><label className="mb-1 block text-sm font-medium">Applicable Route</label><Select value={route} onChange={e=>setRoute(e.target.value)} required><option value="">Select route</option>{routes.map(r=><option key={r.id} value={r.id}>{r.route_code} — {r.route_name}</option>)}</Select></div>
   <div><label className="mb-1 block text-sm font-medium">Diversion Date</label><Input type="date" value={date} onChange={e=>setDate(e.target.value)} required/></div>
   <div><label className="mb-1 block text-sm font-medium">Multiple</label><Input type="number" min="0.001" step="0.001" value={multiple} onChange={e=>setMultiple(e.target.value)} required/></div>
   <div className="md:col-span-2"><label className="mb-1 block text-sm font-medium">Reason</label><Textarea className="min-h-20" value={reason} onChange={e=>setReason(e.target.value)} required/></div>
  </div>
  <Button disabled={busy}>{busy?'Submitting...':'Create Diversion'}</Button>
 </form>
}
