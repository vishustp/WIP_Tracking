'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { toast } from 'sonner';

type WO = {
  id: string;
  work_order_no: string;
  customer_name: string | null;
  grade: string | null;
  size_od: number | null;
  size_wt: number | null;
  l1: number | null;
  l2: number | null;
  ordered_qty: number;
  uom: 'Pcs' | 'Mtrs';
  balance_qty_mtr: number;
};

type Route = { id: string; route_code: string; route_name: string; material_category: string };

type Plan = {
  id: string;
  plan_no: string;
  work_order_id: string;
  work_order_no: string;
  customer_name: string | null;
  grade: string | null;
  od: number | null;
  wt: number | null;
  l1: number | null;
  l2: number | null;
  avg_length: number | null;
  route_id: string;
  route_code: string;
  route_name: string;
  planned_rolling_date: string;
  planned_mtr: number;
  planned_pcs: number;
  planned_mt: number;
  target_mother_size: string | null;
  multiple: number;
  status: string;
  created_at: string;
  updated_at: string;
  can_modify: boolean;
};

const fmt = (n: number | null | undefined) => n == null ? '—' : Number(n).toLocaleString(undefined, { maximumFractionDigits: 3 });

export default function RollingPlanForm() {
  const [wos, setWos] = useState<WO[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [wo, setWo] = useState('');
  const [qtyMtr, setQtyMtr] = useState('');
  const [route, setRoute] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [mother, setMother] = useState('');
  const [multiple, setMultiple] = useState('1');
  const [availableMtr, setAvailableMtr] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const [plans, setPlans] = useState<Plan[]>([]);
  const [search, setSearch] = useState('');
  const [filterRoute, setFilterRoute] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [plansLoading, setPlansLoading] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [editQty, setEditQty] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editRoute, setEditRoute] = useState('');
  const [editMother, setEditMother] = useState('');
  const [editMultiple, setEditMultiple] = useState('1');
  const [editSaving, setEditSaving] = useState(false);

  const loadPlans = useCallback(async () => {
    setPlansLoading(true);
    const s = createClient();
    const { data, error } = await s.rpc('get_rolling_plans', {
      p_search: search.trim() || null,
      p_route_code: filterRoute || null,
      p_from_date: fromDate || null,
      p_to_date: toDate || null,
      p_limit: 2000,
      p_offset: 0,
    });
    if (error) toast.error(error.message);
    else setPlans((data ?? []) as Plan[]);
    setPlansLoading(false);
  }, [filterRoute, fromDate, search, toDate]);

  useEffect(() => {
    const s = createClient();
    Promise.all([
      s.from('work_orders').select('id,work_order_no,customer_name,grade,size_od,size_wt,l1,l2,ordered_qty,uom,balance_qty_mtr').gt('balance_qty_mtr', 5).order('work_order_no'),
      s.from('process_routes').select('id,route_code,route_name,material_category').eq('active', true).order('route_code'),
    ]).then(([a, b]) => {
      if (a.error) toast.error(a.error.message); else setWos((a.data ?? []) as WO[]);
      if (b.error) toast.error(b.error.message); else setRoutes((b.data ?? []) as Route[]);
    });
  }, []);

  useEffect(() => { void loadPlans(); }, [loadPlans]);

  const selected = useMemo(() => wos.find((x) => x.id === wo), [wos, wo]);

  const derived = useMemo(() => {
    if (!selected) return null;
    const l1 = Number(selected.l1 || 0);
    const l2 = Number(selected.l2 || 0);
    const avg = l1 > 0 && l2 > 0 ? (l1 + l2) / 2 : l1 > 0 ? l1 : l2 > 0 ? l2 : 0;
    const mtr = Number(qtyMtr || 0);
    const pcs = avg > 0 ? mtr / avg : 0;
    const mt = (Number(selected.size_od || 0) - Number(selected.size_wt || 0)) * Number(selected.size_wt || 0) * 0.0246615 * 0.001 * mtr;
    return { avg, mtr, pcs, mt };
  }, [selected, qtyMtr]);

  const lookup = async (id: string) => {
    setWo(id);
    setQtyMtr('');
    if (!id) {
      setAvailableMtr(null);
      return;
    }
    const { data, error } = await createClient().rpc('get_unplanned_qty', { p_work_order_id: id });
    if (error) toast.error(error.message);
    else setAvailableMtr(Number(data ?? 0));
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!wo || !route) return toast.error('Select Work Order and route');
    const mtr = Number(qtyMtr);
    if (!Number.isFinite(mtr) || mtr <= 0) return toast.error('Enter a valid Planned MTR.');
    if (availableMtr !== null && mtr > availableMtr) return toast.error(`Planned MTR exceeds available ${fmt(availableMtr)} MTR`);
    setLoading(true);
    const { data, error } = await createClient().rpc('create_rolling_plan', {
      p_work_order_id: wo, p_planned_qty: mtr, p_rolling_date: date, p_route_id: route,
      p_target_mother_size: mother.trim() || null, p_multiple: Number(multiple),
    });
    setLoading(false);
    if (error) toast.error(error.message);
    else {
      toast.success(`Rolling plan ${data} created for ${fmt(mtr)} MTR`);
      setQtyMtr(''); setMother(''); setMultiple('1');
      await Promise.all([lookup(wo), loadPlans()]);
    }
  }

  function startEdit(p: Plan) {
    setEditing(p);
    setEditQty(String(p.planned_mtr));
    setEditDate(p.planned_rolling_date);
    setEditRoute(p.route_id);
    setEditMother(p.target_mother_size ?? '');
    setEditMultiple(String(p.multiple ?? 1));
  }

  async function saveEdit() {
    if (!editing) return;
    const mtr = Number(editQty);
    if (!Number.isFinite(mtr) || mtr <= 0) return toast.error('Enter a valid Planned MTR.');
    const mult = Number(editMultiple);
    if (!Number.isFinite(mult) || mult <= 0) return toast.error('Multiple must be positive.');
    setEditSaving(true);
    const { error } = await createClient().rpc('update_rolling_plan', {
      p_plan_id: editing.id,
      p_planned_qty: mtr,
      p_rolling_date: editDate,
      p_route_id: editRoute,
      p_target_mother_size: editMother.trim() || null,
      p_multiple: mult,
    });
    setEditSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success('Rolling plan updated successfully.');
      setEditing(null);
      await loadPlans();
    }
  }

  async function removePlan(p: Plan) {
    if (!window.confirm(`Delete Rolling Plan ${p.plan_no} for WO ${p.work_order_no}?`)) return;
    const { error } = await createClient().rpc('delete_rolling_plan', { p_plan_id: p.id });
    if (error) toast.error(error.message);
    else {
      toast.success('Rolling plan deleted successfully.');
      await loadPlans();
    }
  }

  const routesInPlans = useMemo(() => Array.from(new Set(plans.map((p) => p.route_code))).sort(), [plans]);

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="space-y-5 rounded-xl border bg-white p-6 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold">Issue Rolling Plan</h1>
          <p className="text-sm text-slate-500">Planning is done in MTR. PCS and MT are calculated from planned MTR.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div><label className="mb-1 block text-sm font-medium">Work Order</label><Select value={wo} onChange={(e) => void lookup(e.target.value)} required><option value="">Select Work Order</option>{wos.map((x) => <option key={x.id} value={x.id}>{x.work_order_no} · {x.customer_name || 'No customer'} · {x.grade || 'No grade'}</option>)}</Select></div>
          <div><label className="mb-1 block text-sm font-medium">Process Route</label><Select value={route} onChange={(e) => setRoute(e.target.value)} required><option value="">Select Route</option>{routes.map((r) => <option key={r.id} value={r.id}>{r.route_code} — {r.route_name}</option>)}</Select></div>
          <div className="rounded-lg bg-slate-50 p-3 text-sm"><div className="text-slate-500">Work Order Details</div><div className="font-semibold">{selected ? `${selected.size_od ?? '—'} OD × ${selected.size_wt ?? '—'} WT · L1 ${fmt(selected.l1)} · L2 ${fmt(selected.l2)}` : 'Select a WO'}</div></div>
          <div className="rounded-lg bg-slate-50 p-3 text-sm"><div className="text-slate-500">Remaining Unplanned MTR</div><div className="font-semibold">{availableMtr === null ? 'Select a WO' : `${fmt(availableMtr)} MTR`}</div></div>
          {selected && derived && <div className="md:col-span-2 grid gap-3 md:grid-cols-4"><div className="rounded-lg border p-3"><div className="text-xs text-slate-500">Average L1/L2</div><div className="font-semibold">{fmt(derived.avg)} m</div></div><div className="rounded-lg border p-3"><div className="text-xs text-slate-500">Balance MTR</div><div className="font-semibold">{fmt(selected.balance_qty_mtr)} MTR</div></div><div className="rounded-lg border p-3"><div className="text-xs text-slate-500">Planned MTR → PCS</div><div className="font-semibold">{fmt(derived.pcs)} PCS</div></div><div className="rounded-lg border p-3"><div className="text-xs text-slate-500">Planned MTR → MT</div><div className="font-semibold">{fmt(derived.mt)} MT</div></div></div>}
          <div><label className="mb-1 block text-sm font-medium">Planned Qty (MTR)</label><Input type="number" min="0.001" step="0.001" max={availableMtr ?? undefined} value={qtyMtr} onChange={(e) => setQtyMtr(e.target.value)} required />{derived && <p className="mt-1 text-xs text-slate-500">Calculated: {fmt(derived.pcs)} PCS · {fmt(derived.mt)} MT</p>}</div>
          <div><label className="mb-1 block text-sm font-medium">Rolling Date</label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></div>
          <div className="md:col-span-2"><label className="mb-1 block text-sm font-medium">Target Mother Size</label><Input placeholder="e.g. 8 inch / 219.1 x 12.7" value={mother} onChange={(e) => setMother(e.target.value)} /></div>
          <div><label className="mb-1 block text-sm font-medium">Multiple</label><Input type="number" min="0.001" step="0.001" value={multiple} onChange={(e) => setMultiple(e.target.value)} required /></div>
        </div>
        <div className="rounded-lg border bg-slate-50 p-3 text-xs text-slate-600"><b>PCS = MTR ÷ Average(L1,L2)</b> &nbsp; | &nbsp; <b>MT = (OD−WT) × WT × 0.0246615 × 0.001 × MTR</b></div>
        <Button disabled={loading}>{loading ? 'Creating...' : 'Create Rolling Plan'}</Button>
      </form>

      <section className="overflow-hidden rounded-xl border bg-white">
        <div className="border-b p-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-semibold">All Rolling Plan Entries</h2><p className="text-sm text-slate-500">Search, filter, edit or delete existing plans. Plans with production recorded are locked.</p></div><button type="button" onClick={() => void loadPlans()} disabled={plansLoading} className="rounded-md border px-3 py-2 text-sm">{plansLoading ? 'Loading…' : 'Refresh'}</button></div><div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4"><Input placeholder="Search Plan / WO / Customer / Grade" value={search} onChange={(e) => setSearch(e.target.value)} /><Select value={filterRoute} onChange={(e) => setFilterRoute(e.target.value)}><option value="">All Routes</option>{routesInPlans.map((r) => <option key={r} value={r}>{r}</option>)}</Select><Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /><Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} /></div></div>
        <div className="overflow-auto"><table className="min-w-[1750px] w-full text-sm"><thead className="bg-slate-50"><tr className="border-b">{['Plan No','Date','Work Order','Customer','Grade','OD','WT','L1','L2','Avg','Route','Planned MTR','Planned PCS','Planned MT','Mother Size','Multiple','Status','Actions'].map((h) => <th key={h} className="p-3 text-left font-medium">{h}</th>)}</tr></thead><tbody>{plansLoading ? <tr><td colSpan={18} className="p-8 text-center">Loading plans…</td></tr> : plans.length === 0 ? <tr><td colSpan={18} className="p-8 text-center text-slate-500">No rolling plans found.</td></tr> : plans.map((p) => <tr key={p.id} className="border-b"><td className="p-3 font-medium">{p.plan_no}</td><td className="p-3">{p.planned_rolling_date}</td><td className="p-3 font-medium">{p.work_order_no}</td><td className="p-3">{p.customer_name || '—'}</td><td className="p-3">{p.grade || '—'}</td><td className="p-3">{fmt(p.od)}</td><td className="p-3">{fmt(p.wt)}</td><td className="p-3">{fmt(p.l1)}</td><td className="p-3">{fmt(p.l2)}</td><td className="p-3">{fmt(p.avg_length)}</td><td className="p-3 font-medium">{p.route_code}</td><td className="p-3 text-right">{fmt(p.planned_mtr)} MTR</td><td className="p-3 text-right">{fmt(p.planned_pcs)} PCS</td><td className="p-3 text-right">{fmt(p.planned_mt)} MT</td><td className="p-3">{p.target_mother_size || '—'}</td><td className="p-3">{fmt(p.multiple)}</td><td className="p-3">{p.status}</td><td className="p-3">{p.can_modify ? <div className="flex gap-2"><button type="button" onClick={() => startEdit(p)} className="rounded-md border px-3 py-1.5 text-xs">Edit</button><button type="button" onClick={() => void removePlan(p)} className="rounded-md border border-red-300 px-3 py-1.5 text-xs text-red-700">Delete</button></div> : <span className="text-xs text-slate-500">Locked — production exists</span>}</td></tr>)}</tbody></table></div><div className="border-t p-3 text-xs text-slate-500">Showing up to 2,000 plans.</div>
      </section>

      {editing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl"><div className="flex items-start justify-between"><div><h3 className="text-lg font-semibold">Edit Rolling Plan</h3><p className="text-sm text-slate-500">{editing.plan_no} · {editing.work_order_no}</p></div><button type="button" onClick={() => setEditing(null)} className="rounded-md border px-3 py-1.5 text-sm">Close</button></div><div className="mt-5 grid gap-4 md:grid-cols-2"><label className="text-sm font-medium">Planned MTR<Input className="mt-1" type="number" min="0.001" step="0.001" value={editQty} onChange={(e) => setEditQty(e.target.value)} /></label><label className="text-sm font-medium">Rolling Date<Input className="mt-1" type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} /></label><label className="text-sm font-medium">Process Route<Select className="mt-1" value={editRoute} onChange={(e) => setEditRoute(e.target.value)}>{routes.map((r) => <option key={r.id} value={r.id}>{r.route_code} — {r.route_name}</option>)}</Select></label><label className="text-sm font-medium">Multiple<Input className="mt-1" type="number" min="0.001" step="0.001" value={editMultiple} onChange={(e) => setEditMultiple(e.target.value)} /></label><label className="text-sm font-medium md:col-span-2">Target Mother Size<Input className="mt-1" value={editMother} onChange={(e) => setEditMother(e.target.value)} /></label><div className="rounded-lg border p-3 text-sm"><div className="text-slate-500">Calculated PCS</div><b>{editing.avg_length && Number(editQty) > 0 ? fmt(Number(editQty) / Number(editing.avg_length)) : '—'} PCS</b></div><div className="rounded-lg border p-3 text-sm"><div className="text-slate-500">Calculated MT</div><b>{editing.od != null && editing.wt != null && Number(editQty) > 0 ? fmt((Number(editing.od)-Number(editing.wt))*Number(editing.wt)*0.0246615*0.001*Number(editQty)) : '—'} MT</b></div></div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setEditing(null)} className="rounded-md border px-4 py-2">Cancel</button><button type="button" onClick={() => void saveEdit()} disabled={editSaving} className="rounded-md border px-4 py-2 font-medium disabled:opacity-50">{editSaving ? 'Updating…' : 'Update Plan'}</button></div></div></div>}
    </div>
  );
}
