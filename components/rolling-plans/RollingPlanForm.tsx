'use client';

import { useEffect, useMemo, useState } from 'react';
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

const fmt = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString(undefined, { maximumFractionDigits: 3 });

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

  useEffect(() => {
    const s = createClient();
    Promise.all([
      s
        .from('work_orders')
        .select('id,work_order_no,customer_name,grade,size_od,size_wt,l1,l2,ordered_qty,uom,balance_qty_mtr')
        .gt('balance_qty_mtr', 5)
        .order('work_order_no'),
      s.from('process_routes').select('id,route_code,route_name,material_category').eq('active', true).order('route_code'),
    ]).then(([a, b]) => {
      if (a.error) toast.error(a.error.message);
      else setWos((a.data ?? []) as WO[]);
      if (b.error) toast.error(b.error.message);
      else setRoutes((b.data ?? []) as Route[]);
    });
  }, []);

  const selected = useMemo(() => wos.find((x) => x.id === wo), [wos, wo]);

  const derived = useMemo(() => {
    if (!selected) return null;
    const l1 = Number(selected.l1 || 0);
    const l2 = Number(selected.l2 || 0);
    const avg = l1 > 0 && l2 > 0 ? (l1 + l2) / 2 : l1 > 0 ? l1 : l2 > 0 ? l2 : 0;
    const mtr = Number(qtyMtr || 0);
    const pcs = avg > 0 ? mtr / avg : 0;
    const mt =
      (Number(selected.size_od || 0) - Number(selected.size_wt || 0)) *
      Number(selected.size_wt || 0) *
      0.0246615 *
      0.001 *
      mtr;
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
    if (availableMtr !== null && mtr > availableMtr)
      return toast.error(`Planned MTR exceeds available ${fmt(availableMtr)} MTR`);
    setLoading(true);
    const { data, error } = await createClient().rpc('create_rolling_plan', {
      p_work_order_id: wo,
      p_planned_qty: mtr,
      p_rolling_date: date,
      p_route_id: route,
      p_target_mother_size: mother.trim() || null,
      p_multiple: Number(multiple),
    });
    setLoading(false);
    if (error) toast.error(error.message);
    else {
      toast.success(`Rolling plan ${data} created for ${fmt(mtr)} MTR`);
      setQtyMtr('');
      setMother('');
      setMultiple('1');
      await lookup(wo);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5 rounded-xl border bg-white p-6 shadow-sm">
      <div>
        <h1 className="text-2xl font-bold">Issue Rolling Plan</h1>
        <p className="text-sm text-slate-500">
          Planning is done in MTR. PCS and MT are calculated from the planned MTR using L1/L2 and OD/WT.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium">Work Order</label>
          <Select value={wo} onChange={(e) => void lookup(e.target.value)} required>
            <option value="">Select Work Order</option>
            {wos.map((x) => (
              <option key={x.id} value={x.id}>
                {x.work_order_no} · {x.customer_name || 'No customer'} · {x.grade || 'No grade'}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Process Route</label>
          <Select value={route} onChange={(e) => setRoute(e.target.value)} required>
            <option value="">Select Route</option>
            {routes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.route_code} — {r.route_name}
              </option>
            ))}
          </Select>
        </div>

        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          <div className="text-slate-500">Work Order Details</div>
          <div className="font-semibold">
            {selected
              ? `${selected.size_od ?? '—'} OD × ${selected.size_wt ?? '—'} WT · L1 ${fmt(selected.l1)} · L2 ${fmt(selected.l2)}`
              : 'Select a WO'}
          </div>
        </div>

        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          <div className="text-slate-500">Remaining Unplanned MTR</div>
          <div className="font-semibold">{availableMtr === null ? 'Select a WO' : `${fmt(availableMtr)} MTR`}</div>
        </div>

        {selected && derived && (
          <div className="md:col-span-2 grid gap-3 md:grid-cols-4">
            <div className="rounded-lg border p-3">
              <div className="text-xs text-slate-500">Average L1/L2</div>
              <div className="font-semibold">{fmt(derived.avg)} m</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-slate-500">Balance MTR</div>
              <div className="font-semibold">{fmt(selected.balance_qty_mtr)} MTR</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-slate-500">Planned MTR → PCS</div>
              <div className="font-semibold">{fmt(derived.pcs)} PCS</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-slate-500">Planned MTR → MT</div>
              <div className="font-semibold">{fmt(derived.mt)} MT</div>
            </div>
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium">Planned Qty (MTR)</label>
          <Input
            type="number"
            min="0.001"
            step="0.001"
            max={availableMtr ?? undefined}
            value={qtyMtr}
            onChange={(e) => setQtyMtr(e.target.value)}
            required
          />
          {derived && <p className="mt-1 text-xs text-slate-500">Calculated: {fmt(derived.pcs)} PCS · {fmt(derived.mt)} MT</p>}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Rolling Date</label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>

        <div className="md:col-span-2">
          <label className="mb-1 block text-sm font-medium">Target Mother Size</label>
          <Input placeholder="e.g. 8 inch / 219.1 x 12.7" value={mother} onChange={(e) => setMother(e.target.value)} />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Multiple</label>
          <Input type="number" min="0.001" step="0.001" value={multiple} onChange={(e) => setMultiple(e.target.value)} required />
        </div>
      </div>

      <div className="rounded-lg border bg-slate-50 p-3 text-xs text-slate-600">
        <b>PCS = MTR ÷ Average(L1,L2)</b> &nbsp; | &nbsp; <b>MT = (OD−WT) × WT × 0.0246615 × 0.001 × MTR</b>
      </div>

      <Button disabled={loading}>{loading ? 'Creating...' : 'Create Rolling Plan'}</Button>
    </form>
  );
}
