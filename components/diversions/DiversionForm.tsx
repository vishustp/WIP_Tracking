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
  Lock, ArrowRight, Workflow, TrendingDown, TrendingUp, AlertTriangle,
  CheckCircle2, Factory, Search, RefreshCw, Edit2, Trash2, X, Shuffle,
  Calendar, Layers,
} from 'lucide-react';
import { usePermissions, getFormAccess } from '@/lib/permissions';
import FormAccessBanner from '@/components/common/FormAccessBanner';

type WO = {
  id: string; work_order_no: string; customer_name: string | null; grade: string | null;
  specification?: string | null; size_od: number | null; size_wt: number | null;
  od?: number | null; wt?: number | null; l1: number | null; l2: number | null;
  ordered_qty: number; uom: 'Pcs' | 'Mtrs'; balance_qty_pcs?: number;
  balance_qty_mtr?: number; balance_qty_mt?: number; status?: string; target_date?: string | null;
};

type Route = { id: string; route_code: string; route_name: string };

type DiversionPlanItem = {
  id: string; source_wo_id: string; source_wo_no: string; source_customer: string;
  source_grade: string; source_size: string; target_wo_id: string; target_wo_no: string;
  target_customer: string; target_grade: string; target_size: string; diverted_qty: number;
  diverted_pcs: number; diverted_mt: number; work_center: string; work_center_name: string;
  route_id: string; route_code: string; route_name: string; multiple: number; reason: string;
  approved_by: string; diversion_date: string; created_at: string; updated_at?: string; can_modify: boolean;
};

type WoWipSummary = {
  wo: WO; od: number; wt: number; l1: number; l2: number; avgLength: number;
  orderedMtr: number; orderedPcs: number; orderedMt: number; rollingGrossMtr: number;
  rollingRejMtr: number; rollingNetMtr: number; rollingHtcOkMtr: number; rollingHtcOkPcs: number;
  rollingHtcOkMt: number; divertedOutMtr: number; divertedOutPcs: number; divertedOutMt: number;
  divertedInMtr: number; divertedInPcs: number; divertedInMt: number; physicalAvailableMtr: number;
  unplannedOrderMtr: number; balanceWipMtr: number; balanceWipPcs: number; balanceWipMt: number;
  stageBreakdown: { stage_code: string; stage_name: string; sequence_no: number; available_mtr: number;
    available_pcs: number; available_mt: number; input_qty: number; output_qty: number;
    rejection_qty: number; net_output_qty: number; }[];
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
  const [sourceWip, setSourceWip] = useState<WoWipSummary | null>(null);
  const [targetWip, setTargetWip] = useState<WoWipSummary | null>(null);
  const [plans, setPlans] = useState<DiversionPlanItem[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterRoute, setFilterRoute] = useState('');
  const [filterWorkCenter, setFilterWorkCenter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
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
        s.from('work_orders').select('id,work_order_no,customer_name,grade,size_od,size_wt,l1,l2,ordered_qty,uom,balance_qty_pcs,balance_qty_mtr,balance_qty_mt,status,target_date').order('work_order_no'),
        s.from('process_routes').select('id,route_code,route_name').eq('active', true).order('route_code'),
      ]);
      let woList = (woRes?.data ?? []) as WO[];
      if (woRes?.error || !woList.length) woList = mockStore.workOrders as any;
      setWos(woList);
      let routeList = (routeRes?.data ?? []) as Route[];
      if (routeRes?.error || !routeList.length) routeList = mockStore.routes.filter(r => r.active) as any;
      setRoutes(routeList);
      if (routeList.length) setRoute(prev => prev || routeList[0].id);
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
        p_search: search || null, p_route_code: filterRoute || null,
        p_work_center: filterWorkCenter || null, p_from_date: fromDate || null, p_to_date: toDate || null,
      });
      if (!error && Array.isArray(data)) setPlans(data as DiversionPlanItem[]);
      else {
        const mockResult = await createMockClient().rpc('get_diversion_plans', {
          p_search: search || null, p_route_code: filterRoute || null,
          p_work_center: filterWorkCenter || null, p_from_date: fromDate || null, p_to_date: toDate || null,
        });
        if (!mockResult.error && Array.isArray(mockResult.data)) setPlans(mockResult.data as DiversionPlanItem[]);
      }
    } catch {
      const fallbackList = mockStore.getDiversionPlans({ search: search || null, route_code: filterRoute || null, work_center: filterWorkCenter || null, from_date: fromDate || null, to_date: toDate || null });
      setPlans(fallbackList as DiversionPlanItem[]);
    } finally { setPlansLoading(false); }
  }, [search, filterRoute, filterWorkCenter, fromDate, toDate]);

  useEffect(() => { void loadData(); }, [loadData]);
  useEffect(() => { void loadPlans(); }, [loadPlans]);

  // Source WO availability for diversion is TOTAL physical WIP in the entire WO.
  // The selected destination work center must never change the source availability.
  const handleSourceChange = async (id: string) => {
    setSource(id);
    if (!id) { setSourceWip(null); return; }
    const summary = mockStore.getWorkOrderWipSummary(id);
    if (summary) setSourceWip(summary as any);
    else {
      const sel = wos.find(w => w.id === id);
      if (sel) {
        const od = Number(sel.size_od ?? sel.od ?? 0), wt = Number(sel.size_wt ?? sel.wt ?? 0);
        const l1 = Number(sel.l1 || 0), l2 = Number(sel.l2 || 0);
        const avg = l1 > 0 && l2 > 0 ? (l1 + l2) / 2 : l1 > 0 ? l1 : l2 > 0 ? l2 : 6;
        const ordMtr = Number(sel.balance_qty_mtr ?? sel.ordered_qty ?? 0);
        setSourceWip({ wo: sel, od, wt, l1, l2, avgLength: avg, orderedMtr: ordMtr,
          orderedPcs: avg > 0 ? ordMtr / avg : 0,
          orderedMt: od > wt ? (od - wt) * wt * 0.0246615 * 0.001 * ordMtr : 0,
          rollingGrossMtr: 0, rollingRejMtr: 0, rollingNetMtr: 0, rollingHtcOkMtr: 0,
          rollingHtcOkPcs: 0, rollingHtcOkMt: 0, divertedOutMtr: 0, divertedOutPcs: 0, divertedOutMt: 0,
          divertedInMtr: 0, divertedInPcs: 0, divertedInMt: 0, physicalAvailableMtr: 0,
          unplannedOrderMtr: 0, balanceWipMtr: 0, balanceWipPcs: 0, balanceWipMt: 0, stageBreakdown: [],
        });
      }
    }
  };

  const handleTargetChange = (id: string) => {
    setTarget(id);
    if (!id) { setTargetWip(null); return; }
    const summary = mockStore.getWorkOrderWipSummary(id);
    if (summary) setTargetWip(summary as any);
    else {
      const sel = wos.find(w => w.id === id);
      if (sel) {
        const od = Number(sel.size_od ?? sel.od ?? 0), wt = Number(sel.size_wt ?? sel.wt ?? 0);
        const l1 = Number(sel.l1 || 0), l2 = Number(sel.l2 || 0);
        const avg = l1 > 0 && l2 > 0 ? (l1 + l2) / 2 : l1 > 0 ? l1 : l2 > 0 ? l2 : 6;
        const ordMtr = Number(sel.balance_qty_mtr ?? sel.ordered_qty ?? 0);
        setTargetWip({ wo: sel, od, wt, l1, l2, avgLength: avg, orderedMtr: ordMtr,
          orderedPcs: avg > 0 ? ordMtr / avg : 0,
          orderedMt: od > wt ? (od - wt) * wt * 0.0246615 * 0.001 * ordMtr : 0,
          rollingGrossMtr: 0, rollingRejMtr: 0, rollingNetMtr: 0, rollingHtcOkMtr: 0, rollingHtcOkPcs: 0,
          rollingHtcOkMt: 0, divertedOutMtr: 0, divertedOutPcs: 0, divertedOutMt: 0, divertedInMtr: 0,
          divertedInPcs: 0, divertedInMt: 0, physicalAvailableMtr: 0, unplannedOrderMtr: ordMtr,
          balanceWipMtr: 0, balanceWipPcs: 0, balanceWipMt: 0, stageBreakdown: [],
        });
      }
    }
  };

  const selectedSource = useMemo(() => wos.find(x => x.id === source), [wos, source]);
  const selectedTarget = useMemo(() => wos.find(x => x.id === target), [wos, target]);
  const selectedRouteObj = useMemo(() => routes.find(r => r.id === route), [routes, route]);
  const selectedWorkCenterObj = useMemo(() => WORK_CENTERS.find(w => w.code === workCenter), [workCenter]);

  // Diversion source availability is TOTAL WIP across all stages, not WIP at selected center.
  const totalSourceWipMtr = useMemo(() => {
    if (!sourceWip) return 0;
    if (sourceWip.stageBreakdown?.length) {
      return sourceWip.stageBreakdown.reduce((sum, s) => sum + Math.max(Number(s.available_mtr || 0), 0), 0);
    }
    return Math.max(Number(sourceWip.physicalAvailableMtr || sourceWip.balanceWipMtr || 0), 0);
  }, [sourceWip]);

  const totalSourceWipPcs = useMemo(() => {
    if (!sourceWip) return 0;
    if (sourceWip.stageBreakdown?.length) {
      return sourceWip.stageBreakdown.reduce((sum, s) => sum + Math.max(Number(s.available_pcs || 0), 0), 0);
    }
    const avg = sourceWip.avgLength || 6;
    return avg > 0 ? totalSourceWipMtr / avg : 0;
  }, [sourceWip, totalSourceWipMtr]);

  const totalSourceWipMt = useMemo(() => {
    if (!sourceWip) return 0;
    if (sourceWip.stageBreakdown?.length) {
      return sourceWip.stageBreakdown.reduce((sum, s) => sum + Math.max(Number(s.available_mt || 0), 0), 0);
    }
    const od = sourceWip.od || 0, wt = sourceWip.wt || 0;
    return od > wt ? (od - wt) * wt * 0.0246615 * 0.001 * totalSourceWipMtr : 0;
  }, [sourceWip, totalSourceWipMtr]);

  const diversionMtr = Number(qty) || 0;
  const numMultiple = Math.max(1, Number(multiple) || 1);
  const sourceAvgLen = sourceWip?.avgLength || 6;
  const sourceOd = sourceWip?.od || 0, sourceWt = sourceWip?.wt || 0;
  const sourceDivPcs = sourceAvgLen > 0 ? diversionMtr / sourceAvgLen : 0;
  const sourceDivMt = sourceOd > sourceWt ? (sourceOd - sourceWt) * sourceWt * 0.0246615 * 0.001 * diversionMtr : 0;
  const sourceInitialBalanceMtr = totalSourceWipMtr;
  const sourceRemainingBalanceMtr = Math.max(0, sourceInitialBalanceMtr - diversionMtr);
  const sourceRemainingBalancePcs = sourceAvgLen > 0 ? sourceRemainingBalanceMtr / sourceAvgLen : 0;
  const sourceRemainingBalanceMt = sourceOd > sourceWt ? (sourceOd - sourceWt) * sourceWt * 0.0246615 * 0.001 * sourceRemainingBalanceMtr : 0;
  const targetAvgLen = targetWip?.avgLength || 6, targetOd = targetWip?.od || 0, targetWt = targetWip?.wt || 0;
  const targetDivPcs = targetAvgLen > 0 ? diversionMtr / targetAvgLen : 0;
  const targetDivMt = targetOd > targetWt ? (targetOd - targetWt) * targetWt * 0.0246615 * 0.001 * diversionMtr : 0;
  const targetInitialWipMtr = (targetWip?.rollingHtcOkMtr || 0) + (targetWip?.divertedInMtr || 0);
  const targetPostWipMtr = targetInitialWipMtr + diversionMtr;
  const targetPostWipPcs = targetAvgLen > 0 ? targetPostWipMtr / targetAvgLen : 0;
  const targetPostWipMt = targetOd > targetWt ? (targetOd - targetWt) * targetWt * 0.0246615 * 0.001 * targetPostWipMtr : 0;
  const isExceeding = diversionMtr > sourceInitialBalanceMtr && sourceInitialBalanceMtr > 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManagePlans) return toast.error('Permission denied: Diversion planning requires Admin or Super User group');
    if (!source || !target || !route) return toast.error('Select source WO, target WO and route');
    if (source === target) return toast.error('Source and target WO must be different');
    if (!Number.isFinite(diversionMtr) || diversionMtr <= 0) return toast.error('Enter a valid diversion quantity in Mtrs');
    if (sourceInitialBalanceMtr <= 0) return toast.error('No physical WIP is available in the selected source work order');
    if (diversionMtr > sourceInitialBalanceMtr) return toast.error(`Diversion exceeds total available WIP (${fmt(sourceInitialBalanceMtr)} Mtrs)`);
    setBusy(true);
    let success = false;
    try {
      const { error } = await createClient().rpc('create_diversion', { p_source: source, p_target: target, p_qty: diversionMtr, p_work_center: workCenter, p_route: route, p_multiple: numMultiple, p_reason: reason, p_date: date });
      if (!error) success = true;
    } catch {}
    if (!success) {
      const mockResult = await createMockClient().rpc('create_diversion', { p_source: source, p_target: target, p_qty: diversionMtr, p_work_center: workCenter, p_route: route, p_multiple: numMultiple, p_reason: reason, p_date: date });
      if (!mockResult.error) success = true;
    }
    setBusy(false);
    if (success) {
      toast.success(`Diversion of ${fmt(diversionMtr)} Mtrs to ${selectedWorkCenterObj?.name || workCenter} successfully issued!`);
      setQty(''); setReason(''); setMultiple('1');
      await handleSourceChange(source); if (target) handleTargetChange(target);
      await loadData(); await loadPlans();
    } else toast.error('Failed to create diversion plan');
  };

  const startEdit = (p: DiversionPlanItem) => {
    setEditing(p); setEditQty(String(p.diverted_qty)); setEditWorkCenter(p.work_center || 'ROLLING');
    setEditRoute(p.route_id); setEditMultiple(String(p.multiple || 1)); setEditDate(p.diversion_date || new Date().toISOString().slice(0, 10)); setEditReason(p.reason || '');
  };

  const saveEdit = async () => {
    if (!editing) return;
    const qtyVal = Number(editQty), multVal = Number(editMultiple);
    if (!Number.isFinite(qtyVal) || qtyVal <= 0) return toast.error('Please enter a valid positive quantity in Mtrs.');
    if (!Number.isFinite(multVal) || multVal <= 0) return toast.error('Multiple must be a positive number.');
    setEditSaving(true); let editSuccess = false;
    try {
      const { error } = await createClient().rpc('update_diversion', { p_diversion_id: editing.id, p_qty: qtyVal, p_work_center: editWorkCenter, p_route: editRoute, p_multiple: multVal, p_date: editDate, p_reason: editReason });
      if (!error) editSuccess = true;
    } catch {}
    if (!editSuccess) {
      const mockResult = await createMockClient().rpc('update_diversion', { p_diversion_id: editing.id, p_qty: qtyVal, p_work_center: editWorkCenter, p_route: editRoute, p_multiple: multVal, p_date: editDate, p_reason: editReason });
      if (!mockResult.error) editSuccess = true;
    }
    setEditSaving(false);
    if (editSuccess) { toast.success('Diversion plan updated successfully.'); setEditing(null); await loadPlans(); }
    else toast.error('Failed to update diversion plan.');
  };

  const deletePlan = async (p: DiversionPlanItem) => {
    if (!canManagePlans) return toast.error('Permission denied.');
    if (!window.confirm(`Delete diversion plan ${p.id}?`)) return;
    let success = false;
    try { const { error } = await createClient().rpc('delete_diversion', { p_diversion_id: p.id }); if (!error) success = true; } catch {}
    if (!success) { const mockResult = await createMockClient().rpc('delete_diversion', { p_diversion_id: p.id }); if (!mockResult.error) success = true; }
    if (success) { toast.success('Diversion plan deleted.'); await loadPlans(); }
    else toast.error('Failed to delete diversion plan.');
  };

  return null;
}
