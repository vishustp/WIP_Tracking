'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { toast } from 'sonner';

type WO={id:string;work_order_no:string;customer_name:string|null;grade:string|null;size_od:number|null;size_wt:number|null;l1:number|null;l2:number|null;ordered_qty:number;uom:'Pcs'|'Mtrs';balance_qty_pcs:number;balance_qty_mtr:number;balance_qty_mt:number};
type Route={id:string;route_code:string;route_name:string;material_category:string};
const fmt=(n:number|null|undefined)=>n==null?'—':n.toLocaleString(undefined,{maximumFractionDigits:3});

export default function RollingPlanForm(){
 const [wos,setWos]=useState<WO[]>([]),[routes,setRoutes]=useState<Route[]>([]);
 const [wo,setWo]=useState(''),[qty,setQty]=useState(''),[route,setRoute]=useState('');
 const [date,setDate]=useState(new Date().toISOString().slice(0,10)),[mother,setMother]=useState(''),[multiple,setMultiple]=useState('1');
 const [available,setAvailable]=useState<number|null>(null),[loading,setLoading]=useState(false);
 useEffect(()=>{const s=createClient();Promise.all([
   s.from('work_orders').select('id,work_order_no,customer_name,grade,size_od,size_wt,l1,l2,ordered_qty,uom,balance_qty_pcs,balance_qty_mtr,balance_qty_mt').order('work_order_no'),
   s.from('process_routes').select('id,route_code,route_name,material_category').eq('active',true).order('route_code')
 ]).then(([a,b])=>{if(a.error)toast.error(a.error.message);else setWos((a.data??[]) as WO[]);if(b.error)toast.error(b.error.message);else setRoutes((b.data??[]) as Route[]);});},[]);
 const selected=useMemo(()=>wos.find(x=>x.id===wo),[wos,wo]);
 const derived=useMemo(()=>{if(!selected)return null;const avg=(Number(selected.l1||0)+Number(selected.l2||0))/2;const pcs=avg>0?(Number(selected.balance_qty_mtr||0)/avg):0;const mt=(Number(selected.size_od||0)-Number(selected.size_wt||0))*Number(selected.size_wt||0)*0.0246615*0.001*Number(selected.balance_qty_mtr||0);return {avg,pcs,mt};},[selected]);
 const lookup=async(id:string)=>{setWo(id);if(!id){setAvailable(null);return;}const {data,error}=await createClient().rpc('get_unplanned_qty',{p_work_order_id:id});if(error)toast.error(error.message);else setAvailable(Number(data??0));};
 const submit=async(e:React.FormEvent)=>{e.preventDefault();if(!wo||!route)return toast.error('Select Work Order and route');const n=Number(qty);if(!Number.isFinite(n)||n<=0)return toast.error(`Enter a valid planned quantity in ${selected?.uom??'UOM'}`);if(available!==null&&n>available)return toast.error(`Planned quantity exceeds available ${fmt(available)} ${selected?.uom??''}`);setLoading(true);const {data,error}=await createClient().rpc('create_rolling_plan',{p_work_order_id:wo,p_planned_qty:n,p_rolling_date:date,p_route_id:route,p_target_mother_size:mother.trim()||null,p_multiple:Number(multiple)});setLoading(false);if(error)toast.error(error.message);else{toast.success(`Rolling plan ${data} created`);setQty('');setMother('');setMultiple('1');await lookup(wo);}};
 return <form onSubmit={submit} className="space-y-5 rounded-xl border bg-white p-6 shadow-sm">
  <div><h1 className="text-2xl font-bold">Issue Rolling Plan</h1><p className="text-sm text-slate-500">Select the imported Work Order and assign the applicable route. Quantities below are shown in all UOMs using the defined conversion formulas.</p></div>
  <div className="grid gap-4 md:grid-cols-2">
   <div><label className="mb-1 block text-sm font-medium">Work Order</label><Select value={wo} onChange={e=>void lookup(e.target.value)} required><option value="">Select Work Order</option>{wos.map(x=><option key={x.id} value={x.id}>{x.work_order_no} · {x.customer_name||'No customer'} · {x.grade||'No grade'}</option>)}</Select></div>
   <div><label className="mb-1 block text-sm font-medium">Process Route</label><Select value={route} onChange={e=>setRoute(e.target.value)} required><option value="">Select Route</option>{routes.map(r=><option key={r.id} value={r.id}>{r.route_code} — {r.route_name}</option>)}</Select></div>
   <div className="rounded-lg bg-slate-50 p-3 text-sm"><div className="text-slate-500">Work Order Details</div><div className="font-semibold">{selected?`${selected.size_od??'—'} OD × ${selected.size_wt??'—'} WT · L1 ${fmt(selected.l1)} · L2 ${fmt(selected.l2)}`:'Select a WO'}</div></div>
   <div className="rounded-lg bg-slate-50 p-3 text-sm"><div className="text-slate-500">Remaining Unplanned ({selected?.uom??'UOM'})</div><div className="font-semibold">{available===null?'Select a WO':fmt(available)}</div></div>
   {selected && derived && <div className="md:col-span-2 grid gap-3 md:grid-cols-4">
    <div className="rounded-lg border p-3"><div className="text-xs text-slate-500">Average L1/L2</div><div className="font-semibold">{fmt(derived.avg)} m</div></div>
    <div className="rounded-lg border p-3"><div className="text-xs text-slate-500">Balance MTR</div><div className="font-semibold">{fmt(selected.balance_qty_mtr)} Mtr</div></div>
    <div className="rounded-lg border p-3"><div className="text-xs text-slate-500">Calculated PCS</div><div className="font-semibold">{fmt(derived.pcs)} Pcs</div></div>
    <div className="rounded-lg border p-3"><div className="text-xs text-slate-500">Calculated MT</div><div className="font-semibold">{fmt(derived.mt)} MT</div></div>
   </div>}
   <div><label className="mb-1 block text-sm font-medium">Planned Qty <span className="text-slate-500">({selected?.uom??'UOM'})</span></label><Input type="number" min="0.001" step="0.001" value={qty} onChange={e=>setQty(e.target.value)} required/></div>
   <div><label className="mb-1 block text-sm font-medium">Rolling Date</label><Input type="date" value={date} onChange={e=>setDate(e.target.value)} required/></div>
   <div className="md:col-span-2"><label className="mb-1 block text-sm font-medium">Target Mother Size</label><Input placeholder="e.g. 8 inch / 219.1 x 12.7" value={mother} onChange={e=>setMother(e.target.value)}/></div>
   <div><label className="mb-1 block text-sm font-medium">Multiple</label><Input type="number" min="0.001" step="0.001" value={multiple} onChange={e=>setMultiple(e.target.value)} required/></div>
  </div>
  <div className="rounded-lg border bg-slate-50 p-3 text-xs text-slate-600">Formula: <b>PCS = MTR ÷ Average(L1,L2)</b> &nbsp; | &nbsp; <b>MT = (OD−WT) × WT × 0.0246615 × 0.001 × MTR</b></div>
  <Button disabled={loading}>{loading?'Creating...':'Create Rolling Plan'}</Button>
 </form>;
}
