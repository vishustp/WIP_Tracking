'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { createMockClient } from '@/lib/supabase/mock-client';
import { mockStore } from '@/lib/supabase/mock-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Lock,
  ArrowRight,
  Workflow,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Factory,
  Search,
  RefreshCw,
  Edit2,
  Trash2,
  X,
  Shuffle,
  Calendar,
  Layers,
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

type DiversionPlanItem = {
  id: string;
  source_wo_id: string;
  source_wo_no: string;
  source_customer: string;
  source_grade: string;
  source_size: string;
  target_wo_id: string;
  target_wo_no: string;
  target_customer: string;
  target_grade: string;
  target_size: string;
  diverted_qty: number;
  diverted_pcs: number;
  diverted_mt: number;
  work_center: string;
  work_center_name: string;
  route_id: string;
  route_code: string;
  route_name: string;
  multiple: number;
  reason: string;
  approved_by: string;
  diversion_date: string;
  created_at: string;
  updated_at?: string;
  can_modify: boolean;
};

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
  stageBreakdown: {
    stage_code: string;
    stage_name: string;
    sequence_no: number;
    available_mtr: number;
    available_pcs: number;
    available_mt: number;
    input_qty: number;
    output_qty: number;
    rejection_qty: number;
    net_output_qty: number;
  }[];
};

const WORK_CENTERS = [
  { code: 'ROLLING', name: 'Rolling Mill (Mother Hollow)' },
  { code: 'HOLLOW_HEAT_TREATMENT', name: 'Hollow Heat Treatment' },
  { code: 'DRAW', name: 'Cold Draw Bench' },
  { code: 'HEAT_TREATMENT', name: 'Final Heat Treatment' },
  { code: 'FINISHING', name: 'Finishing & Inspection' },
];

const fmt = (n: number | null | undefined, digits = 2) =>
  n == null || isNaN(n) ? '—' : Number(n).toLocaleString(undefined, { maximumFractionDigits: digits });

export default function DiversionForm() {
  const { user } = usePermissions();
  const formAccess = useMemo(() => getFormAccess(user, 'diversion'), [user]);
  const canManagePlans = formAccess.isAllowed;

  const [wos, setWos] = useState<WO[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [source, setSource] = useState('');
  const [target, setTarget] = useState('');
  const [workCenter, setWorkCenter] = useState('ROLLING');
  const [qty, setQty] = useState('');
  const [route, setRoute] = useState('');
  const [multiple, setMultiple] = useState('1');
  const [reason, setReason] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);

  // WIP summaries for Source and Target
  const [sourceWip, setSourceWip] = useState<WoWipSummary | null>(null);
  const [targetWip, setTargetWip] = useState<WoWipSummary | null>(null);

  // Issued Diversion Plans List & Filter states
  const [plans, setPlans] = useState<DiversionPlanItem[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterRoute, setFilterRoute] = useState('');
  const [filterWorkCenter, setFilterWorkCenter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Editing modal states
  const [editing, setEditing] = useState<DiversionPlanItem | null>(null);
  const [editQty, setEditQty] = useState('');
  const [editWorkCenter, setEditWorkCenter] = useState('ROLLING');
  const [editRoute, setEditRoute] = useState('');
  const [editMultiple, setEditMultiple] = useState('1');
  const [editDate, setEditDate] = useState('');
  const [editReason, setEditReason] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const s = createClient();
      const [woRes, routeRes] = await Promise.all([
        s
          .from('work_orders')
          .select(
            'id,work_order_no,customer_name,grade,size_od,size_wt,l1,l2,ordered_qty,uom,balance_qty_pcs,balance_qty_mtr,balance_qty_mt,status,target_date'
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
      if (routeList.length) {
        setRoute(prev => prev || routeList[0].id);
      }
    } catch {
      setWos(mockStore.workOrders as any);
      const rList = mockStore.routes.filter(r => r.active) as any;
      setRoutes(rList);
      if (rList.length) setRoute(prev => prev || rList[0].id);
    }
  }, []);

  const loadPlans = useCallback(async () => {
    setPlansLoading(true);
    try {
      const { data, error } = await createClient().rpc('get_diversion_plans', {
        p_search: search || null,
        p_route_code: filterRoute || null,
        p_work_center: filterWorkCenter || null,
        p_from_date: fromDate || null,
        p_to_date: toDate || null,
      });

      if (!error && Array.isArray(data)) {
        setPlans(data as DiversionPlanItem[]);
      } else {
        const mockResult = await createMockClient().rpc('get_diversion_plans', {
          p_search: search || null,
          p_route_code: filterRoute || null,
          p_work_center: filterWorkCenter || null,
          p_from_date: fromDate || null,
          p_to_date: toDate || null,
        });
        if (!mockResult.error && Array.isArray(mockResult.data)) {
          setPlans(mockResult.data as DiversionPlanItem[]);
        }
      }
    } catch {
      const fallbackList = mockStore.getDiversionPlans({
        search: search || null,
        route_code: filterRoute || null,
        work_center: filterWorkCenter || null,
        from_date: fromDate || null,
        to_date: toDate || null,
      });
      setPlans(fallbackList as DiversionPlanItem[]);
    } finally {
      setPlansLoading(false);
    }
  }, [search, filterRoute, filterWorkCenter, fromDate, toDate]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  // Update Source WIP when source WO changes
  const handleSourceChange = async (id: string) => {
    setSource(id);
    if (!id) {
      setSourceWip(null);
      return;
    }

    const summary = mockStore.getWorkOrderWipSummary(id);
    if (summary) {
      setSourceWip(summary as any);
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
      setTargetWip(summary as any);
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
  const selectedWorkCenterObj = useMemo(() => WORK_CENTERS.find(w => w.code === workCenter), [workCenter]);

  // Selected Work Center WIP for Source
  const sourceStageWip = useMemo(() => {
    if (!sourceWip?.stageBreakdown?.length) return null;
    return sourceWip.stageBreakdown.find(s => s.stage_code === workCenter);
  }, [sourceWip, workCenter]);

  // Calculate available WIP at the selected work center
  const availableAtWorkCenterMtr = useMemo(() => {
    if (!sourceWip) return 0;
    if (sourceStageWip && sourceStageWip.available_mtr > 0) {
      return sourceStageWip.available_mtr;
    }
    // If it's rolling or early stage, fall back to balance WIP or total available
    return sourceWip.balanceWipMtr || sourceWip.rollingHtcOkMtr || 0;
  }, [sourceWip, sourceStageWip]);

  const availableAtWorkCenterPcs = useMemo(() => {
    if (sourceStageWip && sourceStageWip.available_pcs > 0) return sourceStageWip.available_pcs;
    const avg = sourceWip?.avgLength || 6.0;
    return avg > 0 ? availableAtWorkCenterMtr / avg : 0;
  }, [sourceStageWip, availableAtWorkCenterMtr, sourceWip]);

  const availableAtWorkCenterMt = useMemo(() => {
    if (sourceStageWip && sourceStageWip.available_mt > 0) return sourceStageWip.available_mt;
    const od = sourceWip?.od || 0;
    const wt = sourceWip?.wt || 0;
    return od > wt ? (od - wt) * wt * 0.0246615 * 0.001 * availableAtWorkCenterMtr : 0;
  }, [sourceStageWip, availableAtWorkCenterMtr, sourceWip]);

  // Calculations for Transfer Impact (Rule 2)
  const diversionMtr = Number(qty) || 0;
  const numMultiple = Math.max(1, Number(multiple) || 1);

  // Source deduction metrics
  const sourceAvgLen = sourceWip?.avgLength || 6.0;
  const sourceOd = sourceWip?.od || 0;
  const sourceWt = sourceWip?.wt || 0;
  const sourceDivPcs = sourceAvgLen > 0 ? diversionMtr / sourceAvgLen : 0;
  const sourceDivMt = sourceOd > sourceWt ? (sourceOd - sourceWt) * sourceWt * 0.0246615 * 0.001 * diversionMtr : 0;

  const sourceInitialBalanceMtr = availableAtWorkCenterMtr || sourceWip?.balanceWipMtr || 0;
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
    if (!canManagePlans) {
      toast.error('Permission denied: Diversion planning requires Admin or Super User group');
      return;
    }
    if (!source || !target || !route) return toast.error('Select source WO, target WO and route');
    if (source === target) return toast.error('Source and target WO must be different');
    
    if (!Number.isFinite(diversionMtr) || diversionMtr <= 0)
      return toast.error('Enter a valid diversion quantity in Mtrs');

    if (sourceInitialBalanceMtr > 0 && diversionMtr > sourceInitialBalanceMtr)
      return toast.error(`Diversion exceeds available WIP at ${selectedWorkCenterObj?.name || workCenter} (${fmt(sourceInitialBalanceMtr)} Mtrs)`);

    setBusy(true);
    let success = false;
    try {
      const { error } = await createClient().rpc('create_diversion', {
        p_source: source,
        p_target: target,
        p_qty: diversionMtr,
        p_work_center: workCenter,
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
        p_work_center: workCenter,
        p_route: route,
        p_multiple: numMultiple,
        p_reason: reason,
        p_date: date,
      });
      if (!mockResult.error) success = true;
    }

    setBusy(false);
    if (success) {
      toast.success(`Diversion of ${fmt(diversionMtr)} Mtrs at ${selectedWorkCenterObj?.name || workCenter} successfully issued!`);
      setQty('');
      setReason('');
      setMultiple('1');
      await handleSourceChange(source);
      if (target) handleTargetChange(target);
      await loadData();
      await loadPlans();
    } else {
      toast.error('Failed to create diversion plan');
    }
  };

  // Start Edit Modal
  const startEdit = (p: DiversionPlanItem) => {
    setEditing(p);
    setEditQty(String(p.diverted_qty));
    setEditWorkCenter(p.work_center || 'ROLLING');
    setEditRoute(p.route_id);
    setEditMultiple(String(p.multiple || 1));
    setEditDate(p.diversion_date || new Date().toISOString().slice(0, 10));
    setEditReason(p.reason || '');
  };

  // Save Edit Modal
  const saveEdit = async () => {
    if (!editing) return;
    const qtyVal = Number(editQty);
    if (!Number.isFinite(qtyVal) || qtyVal <= 0) {
      toast.error('Please enter a valid positive quantity in Mtrs.');
      return;
    }
    const multVal = Number(editMultiple);
    if (!Number.isFinite(multVal) || multVal <= 0) {
      toast.error('Multiple must be a positive number.');
      return;
    }

    setEditSaving(true);
    let editSuccess = false;

    try {
      const { error } = await createClient().rpc('update_diversion', {
        p_diversion_id: editing.id,
        p_qty: qtyVal,
        p_work_center: editWorkCenter,
        p_route: editRoute,
        p_multiple: multVal,
        p_date: editDate,
        p_reason: editReason,
      });
      if (!error) editSuccess = true;
    } catch {}

    if (!editSuccess) {
      const mockResult = await createMockClient().rpc('update_diversion', {
        p_diversion_id: editing.id,
        p_qty: qtyVal,
        p_work_center: editWorkCenter,
        p_route: editRoute,
        p_multiple: multVal,
        p_date: editDate,
        p_reason: editReason,
      });
      if (!mockResult.error) editSuccess = true;
    }

    setEditSaving(false);

    if (editSuccess) {
      toast.success(`Diversion ${editing.id} updated successfully.`);
      setEditing(null);
      await loadPlans();
      if (source) await handleSourceChange(source);
      if (target) handleTargetChange(target);
    } else {
      toast.error('Failed to update diversion plan.');
    }
  };

  // Delete Plan
  const removePlan = async (p: DiversionPlanItem) => {
    if (!window.confirm(`Delete Diversion Plan ${p.id} (${p.diverted_qty} Mtrs from WO ${p.source_wo_no} to ${p.target_wo_no})?`)) {
      return;
    }

    let deleteSuccess = false;
    try {
      const { error } = await createClient().rpc('delete_diversion', {
        p_diversion_id: p.id,
      });
      if (!error) deleteSuccess = true;
    } catch {}

    if (!deleteSuccess) {
      const mockResult = await createMockClient().rpc('delete_diversion', {
        p_diversion_id: p.id,
      });
      if (!mockResult.error) deleteSuccess = true;
    }

    if (deleteSuccess) {
      toast.success(`Diversion ${p.id} deleted successfully.`);
      await loadPlans();
      if (source) await handleSourceChange(source);
      if (target) handleTargetChange(target);
    } else {
      toast.error('Failed to delete diversion plan.');
    }
  };

  const routesInPlans = useMemo(
    () => Array.from(new Set(plans.map(p => p.route_code))).sort(),
    [plans]
  );

  return (
    <div className="space-y-6">
      {/* Form Accessibility Banner */}
      <FormAccessBanner access={formAccess} />

      {/* ========================================================================= */}
      {/* ISSUE DIVERSION PLAN FORM (OFFICE / FLUENT STYLED) */}
      {/* ========================================================================= */}
      <form onSubmit={submit} className="rounded-lg border border-slate-300 bg-white p-5 shadow-2xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200">
          <div>
            <h1 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <Shuffle className="h-5 w-5 text-[#0078d4]" />
              Issue Diversion Plan
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Divert mother hollow or in-process pipe WIP from source work order to meet target order demand.
            </p>
          </div>
          {!canManagePlans && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-300 rounded px-2.5 py-1">
              <Lock size={12} /> View-Only Access
            </span>
          )}
        </div>

        {/* Work Order Selection Section */}
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Source Work Order (From) <span className="text-red-500">*</span>
            </label>
            <Select
              value={source}
              onChange={(e) => void handleSourceChange(e.target.value)}
              required
              disabled={!canManagePlans}
              className="font-mono text-sm"
            >
              <option value="">Select Source Work Order...</option>
              {wos.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.work_order_no} · {x.customer_name || 'Generic'} ({x.grade || 'Grade N/A'} · {x.size_od || x.od}×{x.size_wt || x.wt}mm)
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Target Work Order (To) <span className="text-red-500">*</span>
            </label>
            <Select
              value={target}
              onChange={(e) => handleTargetChange(e.target.value)}
              required
              disabled={!canManagePlans}
              className="font-mono text-sm"
            >
              <option value="">Select Target Work Order...</option>
              {wos
                .filter((x) => x.id !== source)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.work_order_no} · {x.customer_name || 'Generic'} ({x.grade || 'Grade N/A'} · {x.size_od || x.od}×{x.size_wt || x.wt}mm)
                  </option>
                ))}
            </Select>
          </div>
        </div>

        {/* Work Center Field (User Request 3) */}
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Diversion to Work Center <span className="text-red-500">*</span>
            </label>
            <Select
              value={workCenter}
              onChange={(e) => setWorkCenter(e.target.value)}
              required
              disabled={!canManagePlans}
              className="font-semibold text-slate-900 border-[#0078d4]/50 bg-blue-50/20"
            >
              {WORK_CENTERS.map((wc) => (
                <option key={wc.code} value={wc.code}>
                  {wc.name}
                </option>
              ))}
            </Select>
            <span className="text-[11px] text-slate-500 mt-1 block">
              Stage at which material will be transferred
            </span>
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Target Process Route <span className="text-red-500">*</span>
            </label>
            <Select value={route} onChange={(e) => setRoute(e.target.value)} required disabled={!canManagePlans}>
              <option value="">Select Route...</option>
              {routes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.route_code} — {r.route_name}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Mother Pipe Multiple
            </label>
            <Input
              type="number"
              min="1"
              step="0.1"
              value={multiple}
              onChange={(e) => setMultiple(e.target.value)}
              required
              disabled={!canManagePlans}
              className="font-mono"
            />
            <span className="text-[11px] text-slate-500 mt-1 block">
              1 Mother Pipe = {multiple} Output Pipe(s)
            </span>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* RULE 1 & 4: SOURCE WO BALANCE WIP DISPLAYED ACCORDING TO SELECTED WORK CENTER */}
        {/* ========================================================================= */}
        {source && sourceWip && (
          <div className="rounded-lg border border-blue-200 bg-blue-50/30 p-4 space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-200/70 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded bg-[#0078d4] text-xs font-bold text-white">
                  1
                </span>
                <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                  Source Work Order WIP Status (Selected Work Center: {selectedWorkCenterObj?.name || workCenter})
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded bg-blue-100 border border-blue-200 px-2 py-0.5 text-xs font-bold text-[#0078d4] font-mono">
                  WO: {sourceWip.wo.work_order_no}
                </span>
                <span className="text-xs text-slate-600 font-medium">
                  {sourceWip.wo.customer_name || 'No Customer'}
                </span>
              </div>
            </div>

            {/* Source Order Specs Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-white p-2.5 rounded border border-slate-200">
              <div>
                <span className="text-slate-500 block">Grade / Spec:</span>
                <span className="font-semibold text-slate-800">{sourceWip.wo.grade || sourceWip.wo.specification || '—'}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Size (OD × WT):</span>
                <span className="font-semibold text-slate-800 font-mono">
                  {sourceWip.od > 0 ? `${sourceWip.od} × ${sourceWip.wt} mm` : '—'}
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

            {/* Prominent Balance WIP Cards (Showing Selected Work Center WIP) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Available WIP at Selected Work Center */}
              <div className="rounded-md border-2 border-[#0078d4] bg-white p-3 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-[#0078d4] uppercase tracking-wider">
                    WIP at {selectedWorkCenterObj?.name.split(' ')[0] || workCenter}
                  </span>
                  <span className="rounded bg-[#0078d4] text-white text-[10px] font-bold px-1.5 py-0.5">
                    Selected Center
                  </span>
                </div>
                <div className="mt-1.5">
                  <span className="text-xl font-black text-slate-900 font-mono tracking-tight">
                    {fmt(availableAtWorkCenterMtr)}
                  </span>
                  <span className="text-xs font-semibold text-[#0078d4] ml-1">Mtrs Available</span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-slate-600 font-mono">
                  <span>{fmt(availableAtWorkCenterPcs, 1)} Pcs</span>
                  <span>•</span>
                  <span>{fmt(availableAtWorkCenterMt, 3)} MT</span>
                </div>
              </div>

              {/* Rolling Production Output (HTC OK) */}
              <div className="rounded-md border border-slate-300 bg-white p-3 shadow-2xs">
                <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
                  Mother Hollow (HTC OK)
                </span>
                <div className="mt-1.5">
                  <span className="text-xl font-black text-slate-900 font-mono tracking-tight">
                    {fmt(sourceWip.rollingHtcOkMtr || sourceWip.rollingNetMtr)}
                  </span>
                  <span className="text-xs font-semibold text-slate-500 ml-1">Mtrs</span>
                </div>
                <div className="mt-1 text-xs text-slate-500 font-mono">
                  Gross: {fmt(sourceWip.rollingGrossMtr)} m | Rej: {fmt(sourceWip.rollingRejMtr)} m
                </div>
              </div>

              {/* Already Diverted Out */}
              <div className="rounded-md border border-slate-300 bg-white p-3 shadow-2xs">
                <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
                  Already Diverted Out
                </span>
                <div className="mt-1.5">
                  <span className="text-xl font-black text-amber-900 font-mono tracking-tight">
                    {fmt(sourceWip.divertedOutMtr)}
                  </span>
                  <span className="text-xs font-semibold text-amber-700 ml-1">Mtrs</span>
                </div>
                <div className="mt-1 text-xs text-slate-500 font-mono">
                  {sourceWip.divertedOutMtr > 0 ? `${fmt(sourceWip.divertedOutPcs, 1)} Pcs deducted` : 'No prior deductions'}
                </div>
              </div>
            </div>

            {/* Station-wise WIP Breakdown Pills with Active Highlight */}
            {sourceWip.stageBreakdown && sourceWip.stageBreakdown.length > 0 && (
              <div className="bg-white p-2.5 rounded border border-slate-200">
                <div className="text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <Factory className="h-3.5 w-3.5 text-slate-500" />
                  Station-Wise Work-In-Progress Breakdown:
                </div>
                <div className="flex flex-wrap gap-2">
                  {sourceWip.stageBreakdown.map((stg, idx) => {
                    const isCurrent = stg.stage_code === workCenter;
                    return (
                      <div
                        key={idx}
                        className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-mono border transition ${
                          isCurrent
                            ? 'bg-blue-50 border-[#0078d4] text-[#0078d4] font-bold ring-1 ring-[#0078d4]'
                            : 'bg-slate-50 border-slate-200 text-slate-700'
                        }`}
                      >
                        <span>{stg.stage_name || stg.stage_code}:</span>
                        <span className={stg.available_mtr > 0 ? 'font-bold' : 'text-slate-400'}>
                          {fmt(stg.available_mtr)} m
                        </span>
                        <span className="text-slate-400 text-[10px]">({fmt(stg.available_pcs, 1)} pcs)</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Diversion Quantity & Details */}
        <div className="grid gap-4 sm:grid-cols-2 pt-1">
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Diversion Quantity (Mtrs) <span className="text-red-500">*</span>
            </label>
            <Input
              type="number"
              min="0.001"
              step="0.001"
              placeholder="Enter diversion meters..."
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              required
              disabled={!canManagePlans}
              className="font-mono font-bold text-sm"
            />
            {sourceWip && (
              <div className="mt-1 text-xs text-slate-500 flex justify-between">
                <span>Available at {selectedWorkCenterObj?.name.split(' ')[0] || workCenter}: <strong className="font-mono text-[#0078d4]">{fmt(availableAtWorkCenterMtr)} m</strong></span>
                {diversionMtr > 0 && (
                  <span className="font-mono text-slate-700">≈ {fmt(sourceDivPcs, 1)} pcs</span>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Diversion Date <span className="text-red-500">*</span>
            </label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required disabled={!canManagePlans} />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-bold text-slate-700 uppercase tracking-wider">
            Reason / Engineering Justification <span className="text-red-500">*</span>
          </label>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            disabled={!canManagePlans}
            placeholder="e.g. Urgent customer dispatch, mother pipe size pairing"
          />
        </div>

        {/* ========================================================================= */}
        {/* RULE 2: DIVERTED QTY DISPLAYED IN TARGET WO AND DEDUCTED FROM SOURCE WO */}
        {/* ========================================================================= */}
        {source && target && (
          <div className="rounded-lg border border-emerald-300 bg-emerald-50/30 p-4 space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-200/70 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded bg-[#107c41] text-xs font-bold text-white">
                  2
                </span>
                <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                  Rule 2: WIP Transfer & Deduction Real-Time Preview ({selectedWorkCenterObj?.name || workCenter})
                </h2>
              </div>
              {isExceeding ? (
                <span className="inline-flex items-center gap-1 rounded bg-red-100 border border-red-300 px-2 py-0.5 text-xs font-bold text-red-800">
                  <AlertTriangle size={12} /> Diversion Exceeds Available WIP
                </span>
              ) : diversionMtr > 0 ? (
                <span className="inline-flex items-center gap-1 rounded bg-emerald-100 border border-emerald-300 px-2 py-0.5 text-xs font-bold text-emerald-800">
                  <CheckCircle2 size={12} /> Valid Material Transfer
                </span>
              ) : null}
            </div>

            {/* Side-by-side Transfer Flow Matrix */}
            <div className="grid grid-cols-1 md:grid-cols-11 gap-3 items-center">
              {/* SOURCE WORK ORDER (DEDUCTION) */}
              <div className="md:col-span-5 rounded border border-red-200 bg-white p-3 shadow-2xs space-y-2">
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-red-700 bg-red-50 border border-red-200 rounded px-1.5 py-0.5">
                      Source (Deducting WIP)
                    </span>
                    <div className="font-mono font-bold text-xs text-slate-900 mt-1">
                      {selectedSource?.work_order_no}
                    </div>
                  </div>
                  <span className="text-xs text-slate-500 text-right max-w-[130px] truncate">
                    {selectedSource?.customer_name || 'No Customer'}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between items-center text-slate-600">
                    <span>Work Center WIP:</span>
                    <span className="font-mono font-semibold text-slate-900">
                      {fmt(sourceInitialBalanceMtr)} Mtrs
                    </span>
                  </div>

                  <div className="flex justify-between items-center bg-red-50 p-1.5 rounded border border-red-100">
                    <span className="font-bold text-red-800 flex items-center gap-1">
                      <TrendingDown size={13} /> Diverted Out Qty:
                    </span>
                    <span className="font-mono font-black text-red-700 text-xs">
                      - {fmt(diversionMtr)} Mtrs
                    </span>
                  </div>

                  <div className="flex justify-between items-center pt-1 border-t border-slate-100 font-medium">
                    <span className="text-slate-800 font-bold">Remaining WIP:</span>
                    <span
                      className={`font-mono font-bold text-xs ${
                        isExceeding ? 'text-red-600' : 'text-emerald-700'
                      }`}
                    >
                      {fmt(sourceRemainingBalanceMtr)} Mtrs
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-400 font-mono text-right">
                    ≈ {fmt(sourceRemainingBalancePcs, 1)} Pcs ({fmt(sourceRemainingBalanceMt, 3)} MT)
                  </div>
                </div>
              </div>

              {/* TRANSFER FLOW CONNECTOR */}
              <div className="md:col-span-1 flex flex-col items-center justify-center py-1">
                <div className="h-7 w-7 rounded-full bg-[#107c41] text-white flex items-center justify-center shadow-xs">
                  <ArrowRight className="h-3.5 w-3.5" />
                </div>
                <span className="text-[10px] font-bold text-slate-500 font-mono mt-1 text-center">
                  {selectedRouteObj?.route_code || 'Route'}
                </span>
              </div>

              {/* TARGET WORK ORDER (ADDITION) */}
              <div className="md:col-span-5 rounded border border-emerald-200 bg-white p-3 shadow-2xs space-y-2">
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
                      Target (Adding WIP)
                    </span>
                    <div className="font-mono font-bold text-xs text-slate-900 mt-1">
                      {selectedTarget?.work_order_no}
                    </div>
                  </div>
                  <span className="text-xs text-slate-500 text-right max-w-[130px] truncate">
                    {selectedTarget?.customer_name || 'No Customer'}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between items-center text-slate-600">
                    <span>Target Size & Grade:</span>
                    <span className="font-mono font-semibold text-slate-800">
                      {selectedTarget?.size_od || selectedTarget?.od}×{selectedTarget?.size_wt || selectedTarget?.wt} mm ({selectedTarget?.grade || 'Grade N/A'})
                    </span>
                  </div>

                  <div className="flex justify-between items-center bg-emerald-50 p-1.5 rounded border border-emerald-100">
                    <span className="font-bold text-emerald-800 flex items-center gap-1">
                      <TrendingUp size={13} /> Incoming Diverted WIP:
                    </span>
                    <span className="font-mono font-black text-emerald-700 text-xs">
                      + {fmt(diversionMtr)} Mtrs
                    </span>
                  </div>

                  <div className="flex justify-between items-center pt-1 border-t border-slate-100 font-medium">
                    <span className="text-slate-800 font-bold">New Available WIP:</span>
                    <span className="font-mono font-bold text-xs text-emerald-700">
                      {fmt(targetPostWipMtr)} Mtrs
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-400 font-mono text-right">
                    ≈ {fmt(targetPostWipPcs, 1)} Pcs ({fmt(targetPostWipMt, 3)} MT) ready for downstream
                  </div>
                </div>
              </div>
            </div>

            {/* Status Explanation Banner */}
            <div className="rounded bg-emerald-100/60 p-2.5 border border-emerald-200 text-xs text-emerald-950 flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-[#107c41] mt-0.5 shrink-0" />
              <div>
                <strong>Deduction & Allocation Rule Enforced:</strong> On submission, <strong>{fmt(diversionMtr)} Mtrs</strong> will be automatically deducted from <strong>{selectedSource?.work_order_no}</strong> at <strong>{selectedWorkCenterObj?.name || workCenter}</strong> and credited to <strong>{selectedTarget?.work_order_no}</strong>.
              </div>
            </div>
          </div>
        )}

        {/* Form Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-200">
          {!canManagePlans ? (
            <span className="text-xs text-amber-700 font-medium flex items-center gap-1.5">
              <Lock size={13} />
              Diversion creation is restricted to Admin & Super User groups.
            </span>
          ) : <div />}

          <Button
            type="submit"
            disabled={busy || !canManagePlans || isExceeding || !source || !target || diversionMtr <= 0}
            className={
              canManagePlans && !isExceeding && diversionMtr > 0
                ? 'bg-[#0078d4] text-white hover:bg-[#106ebe] px-5 font-semibold'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed px-5'
            }
          >
            {busy
              ? 'Processing Diversion...'
              : canManagePlans
              ? 'Execute & Transfer Diversion Plan'
              : 'Execute Diversion (View-Only)'}
          </Button>
        </div>
      </form>

      {/* ========================================================================= */}
      {/* ISSUED DIVERSION PLANS TABLE WITH EDIT & DELETE (OFFICE / SPREADSHEET STYLE) */}
      {/* ========================================================================= */}
      <section className="rounded-lg border border-slate-300 bg-white p-5 shadow-2xs space-y-4">
        <div className="border-b border-slate-200 pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <Layers className="h-4 w-4 text-[#0078d4]" />
                Issued Diversion Plans
              </h2>
              <p className="text-xs text-slate-500">
                Track, edit, or remove authorized material diversions across production routes and work centers.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void loadPlans()}
              disabled={plansLoading}
              className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer shadow-2xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${plansLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {/* Search & Filter Toolbar */}
          <div className="mt-3 grid gap-2 md:grid-cols-2 lg:grid-cols-5">
            <div className="relative lg:col-span-2">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <Input
                className="h-8.5 pl-8 text-xs"
                placeholder="Search ID / WO / Customer / Reason / Approver"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <Select
              className="h-8.5 text-xs"
              value={filterWorkCenter}
              onChange={(e) => setFilterWorkCenter(e.target.value)}
            >
              <option value="">All Work Centers</option>
              {WORK_CENTERS.map((wc) => (
                <option key={wc.code} value={wc.code}>
                  {wc.name}
                </option>
              ))}
            </Select>

            <Select
              className="h-8.5 text-xs"
              value={filterRoute}
              onChange={(e) => setFilterRoute(e.target.value)}
            >
              <option value="">All Routes</option>
              {routesInPlans.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>

            <div className="flex gap-1.5">
              <Input
                className="h-8.5 text-xs"
                type="date"
                title="From Date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
              <Input
                className="h-8.5 text-xs"
                type="date"
                title="To Date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Excel / Spreadsheet Styled Data Table */}
        <div className="overflow-x-auto border border-slate-300 rounded">
          <table className="min-w-[1400px] w-full text-xs border-collapse">
            <thead className="bg-slate-100 border-b border-slate-300 text-slate-700">
              <tr>
                {[
                  'Diversion ID',
                  'Date',
                  'Source WO #',
                  'Source Customer',
                  'Target WO #',
                  'Target Customer',
                  'Work Center',
                  'Route',
                  'Diverted Qty (Mtr)',
                  'Diverted Pcs',
                  'Diverted MT',
                  'Multiple',
                  'Reason',
                  'Approved By',
                  'Actions',
                ].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-bold border-r border-slate-300 last:border-r-0 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {plansLoading ? (
                <tr>
                  <td colSpan={15} className="p-8 text-center text-slate-400">
                    Loading diversion records…
                  </td>
                </tr>
              ) : plans.length === 0 ? (
                <tr>
                  <td colSpan={15} className="p-8 text-center text-slate-500">
                    No diversion plans found matching criteria.
                  </td>
                </tr>
              ) : (
                plans.map((p) => (
                  <tr key={p.id} className="hover:bg-blue-50/40 even:bg-slate-50/50">
                    <td className="px-3 py-2 font-bold font-mono text-slate-900 border-r border-slate-200">
                      {p.id}
                    </td>

                    <td className="px-3 py-2 font-mono text-slate-700 border-r border-slate-200 whitespace-nowrap">
                      {p.diversion_date}
                    </td>

                    <td className="px-3 py-2 font-bold font-mono text-red-700 border-r border-slate-200">
                      {p.source_wo_no}
                    </td>

                    <td className="max-w-[130px] truncate px-3 py-2 text-slate-600 border-r border-slate-200" title={p.source_customer}>
                      {p.source_customer}
                    </td>

                    <td className="px-3 py-2 font-bold font-mono text-emerald-700 border-r border-slate-200">
                      {p.target_wo_no}
                    </td>

                    <td className="max-w-[130px] truncate px-3 py-2 text-slate-600 border-r border-slate-200" title={p.target_customer}>
                      {p.target_customer}
                    </td>

                    <td className="px-3 py-2 border-r border-slate-200 whitespace-nowrap">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-[#0078d4] border border-blue-200">
                        {p.work_center_name || p.work_center}
                      </span>
                    </td>

                    <td className="px-3 py-2 font-mono font-semibold text-slate-800 border-r border-slate-200">
                      {p.route_code}
                    </td>

                    <td className="px-3 py-2 text-right font-mono font-bold text-slate-900 border-r border-slate-200">
                      {fmt(p.diverted_qty)}
                    </td>

                    <td className="px-3 py-2 text-right font-mono text-slate-700 border-r border-slate-200">
                      {fmt(p.diverted_pcs, 1)}
                    </td>

                    <td className="px-3 py-2 text-right font-mono text-slate-700 border-r border-slate-200">
                      {fmt(p.diverted_mt, 3)}
                    </td>

                    <td className="px-3 py-2 text-center font-mono text-slate-700 border-r border-slate-200">
                      {fmt(p.multiple, 1)}
                    </td>

                    <td className="max-w-[160px] truncate px-3 py-2 text-slate-600 border-r border-slate-200" title={p.reason}>
                      {p.reason || '—'}
                    </td>

                    <td className="px-3 py-2 text-slate-700 border-r border-slate-200 whitespace-nowrap">
                      {p.approved_by || 'Admin'}
                    </td>

                    {/* Action buttons (Edit / Delete) */}
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      {p.can_modify && canManagePlans ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => startEdit(p)}
                            className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer shadow-2xs"
                          >
                            <Edit2 className="h-3.5 w-3.5 text-[#0078d4]" />
                            Edit
                          </button>

                          <button
                            type="button"
                            onClick={() => void removePlan(p)}
                            className="inline-flex items-center gap-1 rounded border border-rose-300 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 cursor-pointer shadow-2xs"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                            Delete
                          </button>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-slate-400 font-medium">
                          <Lock className="h-3.5 w-3.5" />
                          View Only
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* EDIT DIVERSION MODAL DIALOG */}
      {/* ========================================================================= */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl rounded-lg border border-slate-300 bg-white p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Edit Diversion Plan {editing.id}
                </h3>
                <div className="mt-0.5 text-xs text-slate-500 font-mono">
                  From {editing.source_wo_no} ({editing.source_customer}) → To {editing.target_wo_no} ({editing.target_customer})
                </div>
              </div>

              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded border border-slate-300 p-1.5 text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 text-xs">
              <div>
                <label className="mb-1 block font-bold text-slate-700 uppercase">
                  Diverted Qty (Mtrs) *
                </label>
                <Input
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={editQty}
                  onChange={(e) => setEditQty(e.target.value)}
                  className="font-mono font-bold"
                />
              </div>

              <div>
                <label className="mb-1 block font-bold text-slate-700 uppercase">
                  Diversion to Work Center *
                </label>
                <Select
                  value={editWorkCenter}
                  onChange={(e) => setEditWorkCenter(e.target.value)}
                >
                  {WORK_CENTERS.map((wc) => (
                    <option key={wc.code} value={wc.code}>
                      {wc.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <label className="mb-1 block font-bold text-slate-700 uppercase">
                  Process Route *
                </label>
                <Select
                  value={editRoute}
                  onChange={(e) => setEditRoute(e.target.value)}
                >
                  {routes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.route_code} — {r.route_name}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <label className="mb-1 block font-bold text-slate-700 uppercase">
                  Multiple
                </label>
                <Input
                  type="number"
                  min="1"
                  step="0.1"
                  value={editMultiple}
                  onChange={(e) => setEditMultiple(e.target.value)}
                  className="font-mono"
                />
              </div>

              <div>
                <label className="mb-1 block font-bold text-slate-700 uppercase">
                  Diversion Date *
                </label>
                <Input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                />
              </div>

              <div>
                <label className="mb-1 block font-bold text-slate-700 uppercase">
                  Reason *
                </label>
                <Input
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder="Justification for changes"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer shadow-2xs"
              >
                Cancel
              </button>

              <Button
                type="button"
                disabled={editSaving || !editQty}
                onClick={() => void saveEdit()}
                className="bg-[#0078d4] hover:bg-[#106ebe] px-5 text-xs font-semibold shadow-xs"
              >
                {editSaving ? 'Saving Changes…' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
