'use client';
import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { createClient } from '@/lib/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

type Props={title:string;view:string;columns:{key:string;label:string}[];searchKeys:string[];dateKey?:string};
export default function DataReport({title,view,columns,searchKeys}:Props){
 const [rows,setRows]=useState<any[]>([]),[q,setQ]=useState(''),[loading,setLoading]=useState(true);
 useEffect(()=>{(async()=>{const {data,error}=await createClient().from(view).select('*').limit(2000);if(error)console.error(error);setRows(data??[]);setLoading(false);})();},[view]);
 const filtered=useMemo(()=>rows.filter(r=>!q||searchKeys.some(k=>String(r[k]??'').toLowerCase().includes(q.toLowerCase()))),[rows,q,searchKeys]);
 const exportX=()=>{const out=filtered.map(r=>Object.fromEntries(columns.map(c=>[c.label,r[c.key]])));const ws=XLSX.utils.json_to_sheet(out);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Report');XLSX.writeFile(wb,`${title.toLowerCase().replaceAll(' ','-')}.xlsx`);};
 return <div className="space-y-4"><div><h1 className="text-2xl font-bold">{title}</h1><p className="text-sm text-slate-500">{filtered.length} rows</p></div><div className="flex gap-2"><Input className="max-w-md" placeholder="Search..." value={q} onChange={e=>setQ(e.target.value)}/><Button type="button" onClick={exportX}>Export Excel</Button></div><div className="overflow-auto rounded-xl border bg-white">{loading?<div className="p-6 text-sm text-slate-500">Loading...</div>:<table className="min-w-full text-sm"><thead className="bg-slate-50"><tr>{columns.map(c=><th key={c.key} className="whitespace-nowrap p-3 text-left">{c.label}</th>)}</tr></thead><tbody>{filtered.map((r,i)=><tr key={r.id??i} className="border-t">{columns.map(c=><td key={c.key} className="whitespace-nowrap p-3">{String(r[c.key]??'—')}</td>)}</tr>)}</tbody></table>}</div></div>;
}
