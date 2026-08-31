'use client';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { createMockClient } from '@/lib/supabase/mock-client';
import { mockStore } from '@/lib/supabase/mock-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Lock } from 'lucide-react';
import { usePermissions, getFormAccess } from '@/lib/permissions';
import FormAccessBanner from '@/components/common/FormAccessBanner';

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
  balance_qty_pcs: number;
  balance_qty_mtr: number;
  balance_qty_mt: number;
};
type Route = { id: string; route_code: string; route_name: string };
const fmt = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString(undefined, { maximumFractionDigits: 3 });

export default function DiversionForm() {
  const { user } = usePermissions();
  const formAccess = useMemo(() => getFormAccess(user, 'diversion'), [user]);
  const canSubmit = formAccess.isAllowed;

  const [wos, setWos] = useState<WO[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [source, setSource] = useState('');
  const [target, setTarget] = useState('');
  const [qty, setQty] = useState('');
  const [route, setRoute] = useState('');
  const [multiple, setMultiple] = useState('1');
  const [reason, setReason] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [available, setAvailable] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const s = createClient();
    Promise.all([
      s
        .from('work_orders')
        .select(
          'id,work_order_no,customer_name,grade,size_od,size_wt,l1,l2,ordered_qty,uom,balance_qty_pcs,balance_qty_mtr,balance_qty_mt'
        )
        .order('work_order_no'),
      s.from('process_routes').select('id,route_code,route_name').eq('active', true).order('route_code'),
    ]).then(([a, b]) => {
      let woList = (a?.data ?? []) as WO[];
      if (a?.error || !woList.length) woList = mockStore.workOrders as any;
      setWos(woList);

      let routeList = (b?.data ?? []) as Route[];
      if (b?.error || !routeList.length) routeList = mockStore.routes.filter(r => r.active) as any;
      setRoutes(routeList);
    }).catch(() => {
      setWos(mockStore.workOrders as any);
      setRoutes(mockStore.routes.filter(r => r.active) as any);
    });
  }, []);

  const selected = useMemo(() => wos.find((x) => x.id === source), [wos, source]);

  const lookup = async (id: string) => {
    setSource(id);
    if (!id) {
      setAvailable(null);
      return;
    }
    try {
      const { data, error } = await createClient().rpc('get_unplanned_qty', { p_work_order_id: id });
      if (error || data == null) setAvailable(mockStore.getUnplannedQty(id));
      else setAvailable(Number(data ?? 0));
    } catch {
      setAvailable(mockStore.getUnplannedQty(id));
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) {
      toast.error('Permission denied: Diversion planning requires Admin or Super User group');
      return;
    }
    if (!source || !target || !route) return toast.error('Select source WO, target WO and route');
    if (source === target) return toast.error('Source and target WO must be different');
    const n = Number(qty);
    if (!Number.isFinite(n) || n <= 0)
      return toast.error(`Enter a valid diversion quantity in ${selected?.uom ?? 'UOM'}`);
    if (available !== null && n > available)
      return toast.error(`Diversion exceeds available ${fmt(available)} ${selected?.uom ?? ''}`);
    
    setBusy(true);
    let success = false;
    try {
      const { error } = await createClient().rpc('create_diversion', {
        p_source: source,
        p_target: target,
        p_qty: n,
        p_route: route,
        p_multiple: Number(multiple),
        p_reason: reason,
        p_date: date,
      });
      if (!error) success = true;
    } catch {}

    if (!success) {
      const mockResult = await createMockClient().rpc('create_diversion', {
        p_source: source,
        p_target: target,
        p_qty: n,
        p_route: route,
        p_multiple: Number(multiple),
        p_reason: reason,
        p_date: date,
      });
      if (!mockResult.error) success = true;
    }

    setBusy(false);
    if (success) {
      toast.success('Diversion created successfully');
      setQty('');
      setMultiple('1');
      setReason('');
      await lookup(source);
    } else {
      toast.error('Failed to create diversion');
    }
  };

  return (
    <div className="space-y-4 max-w-4xl">
      <FormAccessBanner access={formAccess} />

      <form onSubmit={submit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-900">Pipe Diversion Planning</h1>
          {!canSubmit && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 bg-amber-100 border border-amber-300 rounded-md px-2 py-0.5">
              <Lock size={12} /> View-Only Access
            </span>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">Source Work Order</label>
            <Select value={source} onChange={(e) => void lookup(e.target.value)} required disabled={!canSubmit}>
              <option value="">Select source WO</option>
              {wos.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.work_order_no} · {x.customer_name || 'No customer'} · {x.grade || 'No grade'}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">Target Work Order</label>
            <Select value={target} onChange={(e) => setTarget(e.target.value)} required disabled={!canSubmit}>
              <option value="">Select target WO</option>
              {wos
                .filter((x) => x.id !== source)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.work_order_no} · {x.customer_name || 'No customer'} · {x.grade || 'No grade'}
                  </option>
                ))}
            </Select>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
            <div className="text-xs text-slate-500 font-medium">Available for Diversion</div>
            <div className="text-base font-bold text-slate-900 mt-0.5">
              {available === null ? '—' : `${fmt(available)} ${selected?.uom ?? ''}`}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">
              Diversion Qty <span className="font-normal text-slate-500">({selected?.uom ?? 'UOM'})</span>
            </label>
            <Input
              type="number"
              min="0.001"
              step="0.001"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              required
              disabled={!canSubmit}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">Applicable Route</label>
            <Select value={route} onChange={(e) => setRoute(e.target.value)} required disabled={!canSubmit}>
              <option value="">Select route</option>
              {routes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.route_code} — {r.route_name}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">Diversion Date</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required disabled={!canSubmit} />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">Multiple</label>
            <Input
              type="number"
              min="0.001"
              step="0.001"
              value={multiple}
              onChange={(e) => setMultiple(e.target.value)}
              required
              disabled={!canSubmit}
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-700">Reason / Justification</label>
            <Textarea
              className="min-h-20"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              disabled={!canSubmit}
              placeholder={canSubmit ? "Provide reason for diversion..." : "View-only mode"}
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          {!canSubmit ? (
            <span className="text-xs text-amber-700 font-medium flex items-center gap-1.5">
              <Lock size={13} />
              Diversion creation is restricted to Admin & Super User groups.
            </span>
          ) : <div />}

          <Button
            type="submit"
            disabled={busy || !canSubmit}
            className={canSubmit ? "bg-slate-900 text-white hover:bg-slate-800" : "bg-slate-300 text-slate-500 cursor-not-allowed"}
          >
            {busy ? 'Submitting...' : canSubmit ? 'Create Diversion' : 'Create Diversion (View-Only)'}
          </Button>
        </div>
      </form>
    </div>
  );
}

