'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type StageCode='ROLLING'|'HOLLOW_HEAT_TREATMENT'|'DRAW'|'HEAT_TREATMENT'|'FINISHING';
type QueueRow={work_order_id:string;work_order_no:string;customer_name:string|null;uom:'Pcs'|'Mtrs';route_id:string;route_code:string;route_name:string;stage_id:string;stage_code:StageCode;stage_name:string;sequence_no:number;balance_to_make:number};
type EntryRow=QueueRow&{production_qty:string;rejection_qty:string;heat_lot_no:string;remarks:string};

const stages:{code:StageCode;label:string}[]=[
 {code:'ROLLING',label:'Rolling'},
 {code:'HOLLOW_HEAT_TREATMENT',label:'Hollow Heat Treatment'},
 {code:'DRAW',label:'Draw'},
 {code:'HEAT_TREATMENT',label:'Heat Treatment'},
 {code:'FINISHING',label:'Finishing'},
];

export default function ProductionEntryGrid(){
 const supabase=createClient();
 const [stage,setStage]=useState<StageCode>('ROLLING');
 const [date,setDate]=useState(()=>new Date().toISOString().slice(0,10));
 const [rows,setRows]=useState<EntryRow[]>([]);
 const [loading,setLoading]=useState(false);
 const [saving,setSaving]=useState(false);
 const [message,setMessage]=useState('');

 async function loadQueue(){
  setLoading(true); setMessage('');
  const {data,error}=await supabase.rpc('get_production_entry_queue',{p_stage_code:stage});
  if(error){setRows([]);setMessage(error.message);}
  else setRows(((data??[]) as QueueRow[]).map(r=>({...r,production_qty:'',rejection_qty:'',heat_lot_no:'',remarks:''})));
  setLoading(false);
 }
 useEffect(()=>{void loadQueue();},[stage]);

 function update(id:string,field:'production_qty'|'rejection_qty'|'heat_lot_no'|'remarks',value:string){
  setRows(rs=>rs.map(r=>r.work_order_id+r.route_id===id?{...r,[field]:value}:r));
 }

 async function save(){
  const entries=rows.filter(r=>Number(r.production_qty)>0);
  if(!entries.length){setMessage('Enter production quantity for at least one row.');return;}
  for(const r of entries){
   const qty=Number(r.production_qty), rej=Number(r.rejection_qty||0);
   if(!Number.isFinite(qty)||qty<=0){setMessage(`Invalid production quantity for ${r.work_order_no}.`);return;}
   if(qty>Number(r.balance_to_make)){setMessage(`${r.work_order_no} (${r.route_code}): production exceeds Balance to Make ${r.balance_to_make} ${r.uom}.`);return;}
   if(rej<0||rej>qty){setMessage(`${r.work_order_no}: rejection must be between 0 and production quantity.`);return;}
  }
  setSaving(true);setMessage('');
  try{
   for(const r of entries){
    const qty=Number(r.production_qty),rej=Number(r.rejection_qty||0);
    const {error}=await supabase.rpc('record_production',{
     p_work_order_id:r.work_order_id,p_route_id:r.route_id,p_stage_code:r.stage_code,
     p_process_date:date,p_input_qty:qty,p_output_qty:qty,p_rejection_qty:rej,
     p_heat_lot_no:r.heat_lot_no.trim()||null,p_remarks:r.remarks.trim()||null
    });
    if(error)throw error;
   }
   setMessage(`${entries.length} production row(s) saved successfully.`);
   await loadQueue();
  }catch(e){setMessage(e instanceof Error?e.message:'Production entry failed.');}
  finally{setSaving(false);}
 }

 return <div className="space-y-5">
  <div className="flex flex-wrap items-end gap-4">
   <label className="text-sm font-medium">Work Center
    <select className="ml-2 h-10 rounded-md border bg-background px-3" value={stage} onChange={e=>setStage(e.target.value as StageCode)}>
     {stages.map(s=><option key={s.code} value={s.code}>{s.label}</option>)}
    </select>
   </label>
   <label className="text-sm font-medium">Production Date
    <input type="date" className="ml-2 h-10 rounded-md border bg-background px-3" value={date} onChange={e=>setDate(e.target.value)}/>
   </label>
   <div className="rounded-md border px-3 py-2 text-sm">Only <b>Balance to Make &gt; 0</b> orders</div>
  </div>

  {message&&<div className="rounded-md border p-3 text-sm">{message}</div>}

  <div className="overflow-auto rounded-xl border">
   <table className="min-w-[1150px] w-full text-sm">
    <thead className="bg-muted/50"><tr className="border-b">
     {['S.No.','Work Order','Customer','Route','UOM','Balance to Make','Production Qty','Rejection','Heat/Lot No. (Optional)','Remarks'].map(h=><th key={h} className="p-3 text-left">{h}</th>)}
    </tr></thead>
    <tbody>
     {loading?<tr><td colSpan={10} className="p-6 text-center">Loading…</td></tr>:
      rows.length===0?<tr><td colSpan={10} className="p-6 text-center">No eligible orders.</td></tr>:
      rows.map((r,i)=>{const key=r.work_order_id+r.route_id;return <tr key={key} className="border-b">
       <td className="p-3">{i+1}</td><td className="p-3 font-medium">{r.work_order_no}</td><td className="p-3">{r.customer_name||'—'}</td>
       <td className="p-3">{r.route_code}</td><td className="p-3 font-medium">{r.uom}</td>
       <td className="p-3 text-right">{Number(r.balance_to_make).toLocaleString()} {r.uom}</td>
       <td className="p-2"><input type="number" min="0" max={r.balance_to_make} step="any" className="h-9 w-32 rounded-md border px-2 text-right" value={r.production_qty} onChange={e=>update(key,'production_qty',e.target.value)}/></td>
       <td className="p-2"><input type="number" min="0" step="any" className="h-9 w-28 rounded-md border px-2 text-right" value={r.rejection_qty} onChange={e=>update(key,'rejection_qty',e.target.value)}/></td>
       <td className="p-2"><input className="h-9 w-44 rounded-md border px-2" placeholder="Optional" value={r.heat_lot_no} onChange={e=>update(key,'heat_lot_no',e.target.value)}/></td>
       <td className="p-2"><input className="h-9 w-52 rounded-md border px-2" value={r.remarks} onChange={e=>update(key,'remarks',e.target.value)}/></td>
      </tr>})}
    </tbody>
   </table>
  </div>
  <button type="button" onClick={()=>void save()} disabled={saving||loading||rows.length===0} className="rounded-md border px-5 py-2 font-medium disabled:opacity-50">
   {saving?'Saving…':'Save Production'}
  </button>
 </div>;
}
