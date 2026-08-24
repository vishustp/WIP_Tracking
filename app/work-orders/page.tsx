'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

type WO={id:string;work_order_no:string;customer_name:string|null;size_od:number|null;size_wt:number|null;grade:string|null;ordered_qty:number;uom:string;target_date:string|null;status:string};

export default function WorkOrders(){
 const [rows,setRows]=useState<WO[]>([]); const [loading,setLoading]=useState(true);
 const [q,setQ]=useState(''); const [status,setStatus]=useState('');
 const [form,setForm]=useState({work_order_no:'',customer_name:'',size_od:'',size_wt:'',grade:'',ordered_qty:'',uom:'Mtrs',target_date:''});
 const load=async()=>{setLoading(true); const s=createClient(); let query=s.from('work_orders').select('*').order('target_date',{ascending:true}).limit(200); if(status) query=query.eq('status',status); const {data,error}=await query; if(error) toast.error(error.message); setRows((data??[]) as WO[]); setLoading(false);};
 useEffect(()=>{load()},[status]);
 const filtered=useMemo(()=>rows.filter(r=>!q || [r.work_order_no,r.customer_name,r.grade].join(' ').toLowerCase().includes(q.toLowerCase())),[rows,q]);
 const createWO=async(e:React.FormEvent)=>{e.preventDefault(); const s=createClient(); const payload={work_order_no:form.work_order_no.trim(),customer_name:form.customer_name||null,size_od:form.size_od?Number(form.size_od):null,size_wt:form.size_wt?Number(form.size_wt):null,grade:form.grade||null,ordered_qty:Number(form.ordered_qty),uom:form.uom,target_date:form.target_date||null}; const {error}=await s.from('work_orders').insert(payload); if(error) toast.error(error.message); else {toast.success('Work Order created');setForm({work_order_no:'',customer_name:'',size_od:'',size_wt:'',grade:'',ordered_qty:'',uom:'Mtrs',target_date:''});load();}};
 const exportExcel=()=>{const ws=XLSX.utils.json_to_sheet(filtered); const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'Work Orders'); XLSX.writeFile(wb,'work-orders.xlsx');};
 return <div className="space-y-6">
  <div><h1 className="text-2xl font-bold">Work Orders</h1><p className="text-sm text-slate-500">Commercial order identity. Route is assigned later during planning.</p></div>
  <form onSubmit={createWO} className="rounded-xl border bg-white p-5 shadow-sm">
   <h2 className="mb-4 font-semibold">Create Work Order</h2>
   <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
    <Input placeholder="WO No. *" value={form.work_order_no} onChange={e=>setForm({...form,work_order_no:e.target.value})} required/>
    <Input placeholder="Customer" value={form.customer_name} onChange={e=>setForm({...form,customer_name:e.target.value})}/>
    <Input type="number" step="0.001" placeholder="OD" value={form.size_od} onChange={e=>setForm({...form,size_od:e.target.value})}/>
    <Input type="number" step="0.001" placeholder="WT" value={form.size_wt} onChange={e=>setForm({...form,size_wt:e.target.value})}/>
    <Input placeholder="Grade" value={form.grade} onChange={e=>setForm({...form,grade:e.target.value})}/>
    <Input type="number" min="0.001" step="0.001" placeholder="Ordered Qty *" value={form.ordered_qty} onChange={e=>setForm({...form,ordered_qty:e.target.value})} required/>
    <Select value={form.uom} onChange={e=>setForm({...form,uom:e.target.value})}><option>Pcs</option><option>Mtrs</option></Select>
    <Input type="date" value={form.target_date} onChange={e=>setForm({...form,target_date:e.target.value})}/>
   </div>
   <div className="mt-4"><Button>Create Work Order</Button></div>
  </form>
  <div className="rounded-xl border bg-white shadow-sm">
   <div className="flex flex-col gap-3 border-b p-4 md:flex-row"><Input className="md:max-w-sm" placeholder="Search WO / customer / grade" value={q} onChange={e=>setQ(e.target.value)}/><Select className="md:max-w-xs" value={status} onChange={e=>setStatus(e.target.value)}><option value="">All statuses</option><option>Pending Plan</option><option>Scheduled</option><option>In Progress</option><option>Completed</option><option>Diverted</option></Select><Button type="button" className="md:ml-auto" onClick={exportExcel}>Export Excel</Button></div>
   <div className="overflow-auto">{loading?<div className="p-6 text-sm text-slate-500">Loading...</div>:<table className="min-w-full text-sm"><thead className="bg-slate-50"><tr>{['WO','Customer','OD','WT','Grade','Ordered','Status','Target'].map(h=><th key={h} className="p-3 text-left">{h}</th>)}</tr></thead><tbody>{filtered.map(w=><tr key={w.id} className="border-t"><td className="p-3 font-medium">{w.work_order_no}</td><td className="p-3">{w.customer_name||'—'}</td><td className="p-3">{w.size_od??'—'}</td><td className="p-3">{w.size_wt??'—'}</td><td className="p-3">{w.grade||'—'}</td><td className="p-3">{w.ordered_qty} {w.uom}</td><td className="p-3">{w.status}</td><td className="p-3">{w.target_date||'—'}</td></tr>)}</tbody></table>}</div>
  </div>
 </div>
}
