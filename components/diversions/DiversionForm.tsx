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
import {
  Lock,
  ArrowRight,
  Layers,
  ArrowDownRight,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Package,
  Activity,
  Calendar,
  Building2,
  Workflow,
  Factory,
} from 'lucide-react';
import { usePermissions, getFormAccess } from '@/lib/permissions';
import FormAccessBanner from '@/components/common/FormAccessBanner';

type WO = {
  id: string;
  work_order_no: string;
  customer_name: string | null;
  grade: string | null;
  specification?: string | null;
  size_od: number | null;
  size_wt: number | null;
  od?: number | null;
  wt?: number | null;
  l1: number | null;
  l2: number | null;
  ordered_qty: number;
  uom: 'Pcs' | 'Mtrs';
  balance_qty_pcs?: number;
  balance_qty_mtr?: number;
  balance_qty_mt?: number;
  status?: string;
  target_date?: string | null;
};

type Route = { id: string; route_code: string; route_name: string };

type WoWipSummary = {
  wo: WO;
  od: number;
  wt: number;
  l1: number;
  l2: number;
  avgLength: number;
  orderedMtr: number;
  orderedPcs: number;
  orderedMt: number;
  rollingGrossMtr: number;
  rollingRejMtr: number;
  rollingNetMtr: number;
  rollingHtcOkMtr: number;
  rollingHtcOkPcs: number;
  rollingHtcOkMt: number;
  divertedOutMtr: number;
  divertedOutPcs: number;
  divertedOutMt: number;
  divertedInMtr: number;
  divertedInPcs: number;
  divertedInMt: number;
  physicalAvailableMtr: number;
  unplannedOrderMtr: number;
  balanceWipMtr: number;
  balanceWipPcs: number;
  balanceWipMt: number;
  stageBreakdown: any[];
};

const fmt = (n: number | null | undefined, digits = 2) =>
  n == null || isNaN(n) ? '—' : Number(n).toLocaleString(undefined, { maximumFractionDigits: digits });

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
  const [busy, setBusy] = useState(false);

  // WIP summaries for Source and Target
  const [sourceWip, setSourceWip] = useState<WoWipSummary | null>(null);
  const [targetWip, setTargetWip] = useState<WoWipSummary | null>(null);

  const loadData = async () => {
    try {
      const s = createClient();
      const [woRes, routeRes] = await Promise.all([
        s
          .from('work_orders')
          .select(
            'id,work_order_no,customer_name,grade,specification,size_od,size_wt,l1,l2,ordered_qty,uom,balance_qty_pcs,balance_qty_mtr,balance_qty_mt,status,target_date'
          )
          .order('work_order_no'),
        s.from('process_routes').select('id,route_code,route_name').eq('active', true).order('route_code'),
      ]);

      let woList = (woRes?.data ?? []) as WO[];
      if (woRes?.error || !woList.length) woList = mockStore.workOrders as any;
      setWos(woList);

      let routeList = (routeRes?.data ?? []) as Route[];
      if (routeRes?.error || !routeList.length) routeList = mockStore.routes.filter(r => r.active) as any;
      setRoutes(routeList);
      if (routeList.length && !route) {
        setRoute(routeList[0].id);
      }
    } catch {
      setWos(mockStore.workOrders as any);
      const rList = mockStore.routes.filter(r => r.active) as any;
      setRoutes(rList);
      if (rList.length && !route) setRoute(rList[0].id);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Update Source WIP when source WO changes
  const handleSourceChange = async (id: string) => {
    setSource(id);
    if (!id) {
      setSourceWip(null);
      return;
    }

    // Try mockStore first or database summary
    const summary = mockStore.getWorkOrderWipSummary(id);
    if (summary) {
      setSourceWip(summary);
    } else {
      const sel = wos.find(w => w.id === id);
      if (sel) {
        const od = Number(sel.size_od ?? sel.od ?? 0);
        const wt = Number(sel.size_wt ?? sel.wt ?? 0);
        const l1 = Number(sel.l1 || 0);
        const l2 = Number(sel.l2 || 0);
        const avg = l1 > 0 && l2 > 0 ? (l1 + l2) / 2 : l1 > 0 ? l1 : l2 > 0 ? l2 : 6.0;
        const ordMtr = Number(sel.balance_qty_mtr ?? sel.ordered_qty ?? 0);
        setSourceWip({
          wo: sel,
          od,
          wt,
          l1,
          l2,
          avgLength: avg,
          orderedMtr: ordMtr,
          orderedPcs: avg > 0 ? ordMtr / avg : 0,
          orderedMt: od > wt ? (od - wt) * wt * 0.0246615 * 0.001 * ordMtr : 0,
          rollingGrossMtr: 0,
          rollingRejMtr: 0,
          rollingNetMtr: 0,
          rollingHtcOkMtr: 0,
          rollingHtcOkPcs: 0,
          rollingHtcOkMt: 0,
          divertedOutMtr: 0,
          divertedOutPcs: 0,
          divertedOutMt: 0,
          divertedInMtr: 0,
          divertedInPcs: 0,
          divertedInMt: 0,
          physicalAvailableMtr: 0,
          unplannedOrderMtr: ordMtr,
          balanceWipMtr: ordMtr,
          balanceWipPcs: avg > 0 ? ordMtr / avg : 0,
          balanceWipMt: od > wt ? (od - wt) * wt * 0.0246615 * 0.001 * ordMtr : 0,
          stageBreakdown: [],
        });
      }
    }
  };

  // Update Target WIP when target WO changes
  const handleTargetChange = (id: string) => {
    setTarget(id);
    if (!id) {
      setTargetWip(null);
      return;
    }
    const summary = mockStore.getWorkOrderWipSummary(id);
    if (summary) {
      setTargetWip(summary);
    } else {
      const sel = wos.find(w => w.id === id);
      if (sel) {
        const od = Number(sel.size_od ?? sel.od ?? 0);
        const wt = Number(sel.size_wt ?? sel.wt ?? 0);
        const l1 = Number(sel.l1 || 0);
        const l2 = Number(sel.l2 || 0);
        const avg = l1 > 0 && l2 > 0 ? (l1 + l2) / 2 : l1 > 0 ? l1 : l2 > 0 ? l2 : 6.0;
        const ordMtr = Number(sel.balance_qty_mtr ?? sel.ordered_qty ?? 0);
        setTargetWip({
          wo: sel,
          od,
          wt,
          l1,
          l2,
          avgLength: avg,
          orderedMtr: ordMtr,
          orderedPcs: avg > 0 ? ordMtr / avg : 0,
          orderedMt: od > wt ? (od - wt) * wt * 0.0246615 * 0.001 * ordMtr : 0,
          rollingGrossMtr: 0,
          rollingRejMtr: 0,
          rollingNetMtr: 0,
          rollingHtcOkMtr: 0,
          rollingHtcOkPcs: 0,
          rollingHtcOkMt: 0,
          divertedOutMtr: 0,
          divertedOutPcs: 0,
          divertedOutMt: 0,
          divertedInMtr: 0,
          divertedInPcs: 0,
          divertedInMt: 0,
          physicalAvailableMtr: 0,
          unplannedOrderMtr: ordMtr,
          balanceWipMtr: 0,
          balanceWipPcs: 0,
          balanceWipMt: 0,
          stageBreakdown: [],
        });
      }
    }
  };

  const selectedSource = useMemo(() => wos.find((x) => x.id === source), [wos, source]);
  const selectedTarget = useMemo(() => wos.find((x) => x.id === target), [wos, target]);
  const selectedRouteObj = useMemo(() => routes.find(r => r.id === route), [routes, route]);

  // Calculations for Transfer Impact (Rule 2)
  const diversionMtr = Number(qty) || 0;
  const numMultiple = Math.max(1, Number(multiple) || 1);

  // Source deduction metrics
  const sourceAvgLen = sourceWip?.avgLength || 6.0;
  const sourceOd = sourceWip?.od || 0;
  const sourceWt = sourceWip?.wt || 0;
  const sourceDivPcs = sourceAvgLen > 0 ? diversionMtr / sourceAvgLen : 0;
  const sourceDivMt = sourceOd > sourceWt ? (sourceOd - sourceWt) * sourceWt * 0.0246615 * 0.001 * diversionMtr : 0;

  const sourceInitialBalanceMtr = sourceWip?.balanceWipMtr || 0;
  const sourceRemainingBalanceMtr = Math.max(0, sourceInitialBalanceMtr - diversionMtr);
  const sourceRemainingBalancePcs = sourceAvgLen > 0 ? sourceRemainingBalanceMtr / sourceAvgLen : 0;
  const sourceRemainingBalanceMt =
    sourceOd > sourceWt ? (sourceOd - sourceWt) * sourceWt * 0.0246615 * 0.001 * sourceRemainingBalanceMtr : 0;

  // Target addition metrics
  const targetAvgLen = targetWip?.avgLength || 6.0;
  const targetOd = targetWip?.od || 0;
  const targetWt = targetWip?.wt || 0;
  const targetDivPcs = targetAvgLen > 0 ? diversionMtr / targetAvgLen : 0;
  const targetDivMt = targetOd > targetWt ? (targetOd - targetWt) * targetWt * 0.0246615 * 0.001 * diversionMtr : 0;

  const targetInitialWipMtr = (targetWip?.rollingHtcOkMtr || 0) + (targetWip?.divertedInMtr || 0);
  const targetPostWipMtr = targetInitialWipMtr + diversionMtr;
  const targetPostWipPcs = targetAvgLen > 0 ? targetPostWipMtr / targetAvgLen : 0;
  const targetPostWipMt = targetOd > targetWt ? (targetOd - targetWt) * targetWt * 0.0246615 * 0.001 * targetPostWipMtr : 0;

  const isExceeding = diversionMtr > sourceInitialBalanceMtr && sourceInitialBalanceMtr > 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) {
      toast.error('Permission denied: Diversion planning requires Admin or Super User group');
      return;
    }
    if (!source || !target || !route) return toast.error('Select source WO, target WO and route');
    if (source === target) return toast.error('Source and target WO must be different');
    
    if (!Number.isFinite(diversionMtr) || diversionMtr <= 0)
      return toast.error('Enter a valid diversion quantity in Mtrs');

    if (sourceInitialBalanceMtr > 0 && diversionMtr > sourceInitialBalanceMtr)
      return toast.error(`Diversion exceeds available source balance WIP (${fmt(sourceInitialBalanceMtr)} Mtrs)`);

    setBusy(true);
    let success = false;
    try {
      const { error } = await createClient().rpc('create_diversion', {
        p_source: source,
        p_target: target,
        p_qty: diversionMtr,
        p_route: route,
        p_multiple: numMultiple,
        p_reason: reason,
        p_date: date,
      });
      if (!error) success = true;
    } catch {}

    if (!success) {
      const mockResult = await createMockClient().rpc('create_diversion', {
        p_source: source,
        p_target: target,
        p_qty: diversionMtr,
        p_route: route,
        p_multiple: numMultiple,
        p_reason: reason,
        p_date: date,
      });
      if (!mockResult.error) success = true;
    }

    setBusy(false);
    if (success) {
      toast.success(`Diversion of ${fmt(diversionMtr)} Mtrs successfully transferred and deducted!`);
      setQty('');
      setReason('');
      setMultiple('1');
      // Refresh WIP summaries
      await handleSourceChange(source);
      if (target) handleTargetChange(target);
      loadData();
    } else {
      toast.error('Failed to create diversion');
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <FormAccessBanner access={formAccess} />

      <form onSubmit={submit} className="space-y-6">
        {/* Main Configuration Card */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-100">
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <Workflow className="h-5 w-5 text-indigo-600" />
                Pipe Diversion Planning
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Divert rolled mother hollows or pipe WIP from source work order to meet target order demand.
              </p>
            </div>
            {!canSubmit && (
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-amber-800 bg-amber-100 border border-amber-300 rounded-md px-2.5 py-1.5">
                <Lock size={12} /> View-Only Access
              </span>
            )}
          </div>

          {/* Work Order Selection Section */}
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-bold text-slate-700 uppercase tracking-wider">
                Source Work Order (From) <span className="text-red-500">*</span>
              </label>
              <Select
                value={source}
                onChange={(e) => void handleSourceChange(e.target.value)}
                required
                disabled={!canSubmit}
                className="font-mono text-sm"
              >
                <option value="">Select Source Work Order...</option>
                {wos.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.work_order_no} — {x.customer_name || 'Generic'} ({x.grade || 'Grade N/A'} · {x.size_od || x.od}x{x.size_wt || x.wt}mm)
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-bold text-slate-700 uppercase tracking-wider">
                Target Work Order (To) <span className="text-red-500">*</span>
              </label>
              <Select
                value={target}
                onChange={(e) => handleTargetChange(e.target.value)}
                required
                disabled={!canSubmit}
                className="font-mono text-sm"
              >
                <option value="">Select Target Work Order...</option>
                {wos
                  .filter((x) => x.id !== source)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.work_order_no} — {x.customer_name || 'Generic'} ({x.grade || 'Grade N/A'} · {x.size_od || x.od}x{x.size_wt || x.wt}mm)
                    </option>
                  ))}
              </Select>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* RULE 1: BALANCE WIP OF THE SELECTED FROM WORK ORDER TO BE DISPLAYED */}
          {/* ========================================================================= */}
          {source && sourceWip && (
            <div className="rounded-xl border-2 border-indigo-100 bg-gradient-to-br from-indigo-50/60 via-slate-50/40 to-white p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white">
                    1
                  </span>
                  <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                    Rule 1: Source Work Order Balance WIP Status
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-md bg-indigo-100 px-2.5 py-1 text-sm font-bold text-indigo-800 font-mono">
                    WO: {sourceWip.wo.work_order_no}
                  </span>
                  <span className="text-sm text-slate-600 font-medium">
                    {sourceWip.wo.customer_name || 'No Customer'}
                  </span>
                </div>
              </div>

              {/* Source Order Specs Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm bg-white/80 p-3 rounded-lg border border-indigo-100/70">
                <div>
                  <span className="text-slate-500 block">Grade / Spec:</span>
                  <span className="font-semibold text-slate-800">{sourceWip.wo.grade || sourceWip.wo.specification || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Size (OD x WT):</span>
                  <span className="font-semibold text-slate-800 font-mono">
                    {sourceWip.od > 0 ? `${sourceWip.od} x ${sourceWip.wt} mm` : '—'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Length Spec (L1 - L2):</span>
                  <span className="font-semibold text-slate-800 font-mono">
                    {sourceWip.l1 ?? 6.0} - {sourceWip.l2 ?? 6.5} m (Avg: {sourceWip.avgLength}m)
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Total Ordered:</span>
                  <span className="font-bold text-slate-900 font-mono">
                    {fmt(sourceWip.orderedMtr)} Mtrs ({fmt(sourceWip.orderedPcs, 0)} Pcs · {fmt(sourceWip.orderedMt, 3)} MT)
                  </span>
                </div>
              </div>

              {/* Prominent Balance WIP Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Available Balance WIP */}
                <div className="rounded-xl border border-indigo-200 bg-white p-4 shadow-2xs relative overflow-hidden">
                  <div className="absolute top-0 right-0 h-16 w-16 -mr-4 -mt-4 bg-indigo-500/10 rounded-full pointer-events-none" />
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-indigo-900 uppercase tracking-wider">
                      Balance WIP Available
                    </span>
                    <span className="rounded-md bg-indigo-600 text-white text-xs font-bold px-2.5 py-1">
                      Ready to Divert
                    </span>
                  </div>
                  <div className="mt-2">
                    <span className="text-2xl font-black text-indigo-950 font-mono tracking-tight">
                      {fmt(sourceWip.balanceWipMtr)}
                    </span>
                    <span className="text-sm font-semibold text-indigo-700 ml-1.5">Mtrs</span>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-sm text-slate-600 font-mono">
                    <span>{fmt(sourceWip.balanceWipPcs, 1)} Pcs</span>
                    <span>•</span>
                    <span>{fmt(sourceWip.balanceWipMt, 3)} MT</span>
                  </div>
                </div>

                {/* Rolled Production Output (HTC OK) */}
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
                  <span className="text-sm font-bold text-slate-600 uppercase tracking-wider block">
                    Rolling Produced (HTC OK)
                  </span>
                  <div className="mt-2">
                    <span className="text-2xl font-black text-slate-900 font-mono tracking-tight">
                      {fmt(sourceWip.rollingHtcOkMtr || sourceWip.rollingNetMtr)}
                    </span>
                    <span className="text-sm font-semibold text-slate-500 ml-1.5">Mtrs</span>
                  </div>
                  <div className="mt-1 text-sm text-slate-500 font-mono">
                    Gross: {fmt(sourceWip.rollingGrossMtr)} m | Rej: {fmt(sourceWip.rollingRejMtr)} m
                  </div>
                </div>

                {/* Already Diverted Out */}
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
                  <span className="text-sm font-bold text-slate-600 uppercase tracking-wider block">
                    Already Diverted Out
                  </span>
                  <div className="mt-2">
                    <span className="text-2xl font-black text-amber-900 font-mono tracking-tight">
                      {fmt(sourceWip.divertedOutMtr)}
                    </span>
                    <span className="text-sm font-semibold text-amber-700 ml-1.5">Mtrs</span>
                  </div>
                  <div className="mt-1 text-sm text-slate-500 font-mono">
                    {sourceWip.divertedOutMtr > 0 ? `${fmt(sourceWip.divertedOutPcs, 1)} Pcs previously deducted` : 'No prior diversions'}
                  </div>
                </div>
              </div>

              {/* Station-wise WIP Breakdown Pills */}
              {sourceWip.stageBreakdown && sourceWip.stageBreakdown.length > 0 && (
                <div className="bg-white/90 p-3 rounded-lg border border-slate-200/80">
                  <div className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                    <Factory className="h-3.5 w-3.5 text-slate-500" />
                    Station-Wise Work-In-Progress (WIP) Distribution:
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {sourceWip.stageBreakdown.map((stg: any, idx: number) => (
                      <div
                        key={idx}
                        className="inline-flex items-center gap-2 rounded-lg bg-slate-50 border border-slate-200 px-3 py-1.5 text-sm font-mono"
                      >
                        <span className="font-semibold text-slate-700">{stg.stage_name || stg.stage_code}:</span>
                        <span className={`font-bold ${stg.available_mtr > 0 ? 'text-indigo-700' : 'text-slate-400'}`}>
                          {fmt(stg.available_mtr)} m
                        </span>
                        <span className="text-slate-400 text-xs">({fmt(stg.available_pcs, 1)} pcs)</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Diversion Quantity & Process Settings */}
          <div className="grid gap-4 sm:grid-cols-3 pt-2">
            <div>
              <label className="mb-1.5 block text-sm font-bold text-slate-700 uppercase tracking-wider">
                Diversion Qty (Mtrs) <span className="text-red-500">*</span>
              </label>
              <Input
                type="number"
                min="0.001"
                step="0.001"
                placeholder="Enter diversion meters..."
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                required
                disabled={!canSubmit}
                className="font-mono text-base font-bold"
              />
              {sourceWip && (
                <div className="mt-1 text-sm text-slate-500 flex justify-between">
                  <span>Max Available: <strong className="font-mono text-indigo-700">{fmt(sourceWip.balanceWipMtr)} m</strong></span>
                  {diversionMtr > 0 && (
                    <span className="font-mono text-slate-700">≈ {fmt(sourceDivPcs, 1)} pcs</span>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-bold text-slate-700 uppercase tracking-wider">
                Applicable Process Route <span className="text-red-500">*</span>
              </label>
              <Select value={route} onChange={(e) => setRoute(e.target.value)} required disabled={!canSubmit}>
                <option value="">Select Route...</option>
                {routes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.route_code} — {r.route_name}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-bold text-slate-700 uppercase tracking-wider">
                Mother Pipe Multiple
              </label>
              <Input
                type="number"
                min="1"
                step="0.1"
                value={multiple}
                onChange={(e) => setMultiple(e.target.value)}
                required
                disabled={!canSubmit}
                className="font-mono"
              />
              <span className="text-sm text-slate-500 mt-1 block">
                1 Mother Hollow = {multiple} Draw/Final Pipe(s)
              </span>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-bold text-slate-700 uppercase tracking-wider">
                Diversion Date
              </label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required disabled={!canSubmit} />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-bold text-slate-700 uppercase tracking-wider">
                Reason / Engineering Justification <span className="text-red-500">*</span>
              </label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                disabled={!canSubmit}
                placeholder="e.g. Urgent customer dispatch, mother pipe size matching"
              />
            </div>
          </div>

          {/* ========================================================================= */}
          {/* RULE 2: DIVERTED QTY WIP DISPLAYED IN TARGET WO AND DEDUCTED FROM SOURCE WO */}
          {/* ========================================================================= */}
          {source && target && (
            <div className="rounded-xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50/50 via-slate-50/30 to-white p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">
                    2
                  </span>
                  <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                    Rule 2: WIP Transfer & Deduction Real-Time Preview
                  </h2>
                </div>
                {isExceeding ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-red-100 px-2.5 py-1 text-sm font-bold text-red-800">
                    <AlertTriangle size={12} /> Diversion Exceeds Source WIP
                  </span>
                ) : diversionMtr > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2.5 py-1 text-sm font-bold text-emerald-800">
                    <CheckCircle2 size={12} /> Valid Material Transfer
                  </span>
                ) : null}
              </div>

              {/* Side-by-side Transfer Flow Matrix */}
              <div className="grid grid-cols-1 md:grid-cols-11 gap-4 items-center">
                {/* SOURCE WORK ORDER (DEDUCTION) */}
                <div className="md:col-span-5 rounded-xl border border-red-200 bg-white p-4 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wider text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
                        Source (From) - Deducting WIP
                      </span>
                      <div className="font-mono font-bold text-sm text-slate-900 mt-1">
                        {selectedSource?.work_order_no}
                      </div>
                    </div>
                    <span className="text-sm text-slate-500 text-right max-w-[130px] truncate">
                      {selectedSource?.customer_name || 'No Customer'}
                    </span>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between items-center text-slate-600">
                      <span>Current Balance WIP:</span>
                      <span className="font-mono font-semibold text-slate-900">
                        {fmt(sourceInitialBalanceMtr)} Mtrs
                      </span>
                    </div>

                    <div className="flex justify-between items-center bg-red-50/80 p-2 rounded-md border border-red-100">
                      <span className="font-bold text-red-800 flex items-center gap-1">
                        <TrendingDown size={14} /> Diverted Out Qty:
                      </span>
                      <span className="font-mono font-black text-red-700 text-sm">
                        - {fmt(diversionMtr)} Mtrs
                      </span>
                    </div>

                    <div className="flex justify-between items-center pt-1 border-t border-slate-100 font-medium">
                      <span className="text-slate-800 font-bold">Remaining Source WIP:</span>
                      <span
                        className={`font-mono font-bold text-sm ${
                          isExceeding ? 'text-red-600' : 'text-emerald-700'
                        }`}
                      >
                        {fmt(sourceRemainingBalanceMtr)} Mtrs
                      </span>
                    </div>

                    <div className="text-sm text-slate-400 font-mono text-right">
                      ≈ {fmt(sourceRemainingBalancePcs, 1)} Pcs ({fmt(sourceRemainingBalanceMt, 3)} MT)
                    </div>
                  </div>
                </div>

                {/* TRANSFER FLOW CONNECTOR */}
                <div className="md:col-span-1 flex flex-col items-center justify-center py-2">
                  <div className="h-8 w-8 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-md">
                    <ArrowRight className="h-4 w-4" />
                  </div>
                  <span className="text-xs font-bold text-slate-500 font-mono mt-1 text-center">
                    {selectedRouteObj?.route_code || 'Route'}
                  </span>
                </div>

                {/* TARGET WORK ORDER (ADDITION) */}
                <div className="md:col-span-5 rounded-xl border border-emerald-200 bg-white p-4 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1">
                        Target (To) - Adding WIP
                      </span>
                      <div className="font-mono font-bold text-sm text-slate-900 mt-1">
                        {selectedTarget?.work_order_no}
                      </div>
                    </div>
                    <span className="text-sm text-slate-500 text-right max-w-[130px] truncate">
                      {selectedTarget?.customer_name || 'No Customer'}
                    </span>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between items-center text-slate-600">
                      <span>Target Spec & Size:</span>
                      <span className="font-mono font-semibold text-slate-800">
                        {selectedTarget?.size_od || selectedTarget?.od} x {selectedTarget?.size_wt || selectedTarget?.wt} mm ({selectedTarget?.grade || 'Grade N/A'})
                      </span>
                    </div>

                    <div className="flex justify-between items-center bg-emerald-50/80 p-2 rounded-md border border-emerald-100">
                      <span className="font-bold text-emerald-800 flex items-center gap-1">
                        <TrendingUp size={14} /> Incoming Diverted WIP:
                      </span>
                      <span className="font-mono font-black text-emerald-700 text-sm">
                        + {fmt(diversionMtr)} Mtrs
                      </span>
                    </div>

                    <div className="flex justify-between items-center pt-1 border-t border-slate-100 font-medium">
                      <span className="text-slate-800 font-bold">New Target Available WIP:</span>
                      <span className="font-mono font-bold text-sm text-emerald-700">
                        {fmt(targetPostWipMtr)} Mtrs
                      </span>
                    </div>

                    <div className="text-sm text-slate-400 font-mono text-right">
                      ≈ {fmt(targetPostWipPcs, 1)} Pcs ({fmt(targetPostWipMt, 3)} MT) ready for Draw / Finishing
                    </div>
                  </div>
                </div>
              </div>

              {/* Status Explanation Banner */}
              <div className="rounded-lg bg-emerald-100/50 p-3 border border-emerald-200/70 text-sm text-emerald-900 flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-700 mt-0.5 shrink-0" />
                <div>
                  <strong>Deduction & Allocation Rule Enforced:</strong> On submission, <strong>{fmt(diversionMtr)} Mtrs</strong> will be automatically deducted from <strong>{selectedSource?.work_order_no}</strong> balance WIP and credited to <strong>{selectedTarget?.work_order_no}</strong>'s processing queue across downstream stations.
                </div>
              </div>
            </div>
          )}

          {/* Form Actions */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-100">
            {!canSubmit ? (
              <span className="text-sm text-amber-700 font-medium flex items-center gap-1.5">
                <Lock size={13} />
                Diversion creation is restricted to Admin & Super User groups.
              </span>
            ) : <div />}

            <Button
              type="submit"
              disabled={busy || !canSubmit || isExceeding || !source || !target || diversionMtr <= 0}
              className={
                canSubmit && !isExceeding && diversionMtr > 0
                  ? 'bg-slate-900 text-white hover:bg-slate-800 px-6 font-semibold'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed px-6'
              }
            >
              {busy
                ? 'Processing Diversion...'
                : canSubmit
                ? 'Execute & Transfer Diversion Plan'
                : 'Execute Diversion (View-Only)'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
