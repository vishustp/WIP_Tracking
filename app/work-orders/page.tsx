'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import Link from 'next/link';
import { mtFromMtr, fmt } from '@/lib/productionUtils';
import { usePermissions, getFormAccess } from '@/lib/permissions';
import FormAccessBanner from '@/components/common/FormAccessBanner';
import RouteAccessGuard from '@/components/common/RouteAccessGuard';
import {
  Calendar,
  Layers,
  PlusCircle,
  FileSpreadsheet,
  ArrowRight,
  TrendingUp,
  GitFork,
  MoreVertical,
  CheckCircle2,
  Clock,
  Search,
  Filter,
  Lock,
  Trash2,
  RotateCcw,
  Calculator,
} from 'lucide-react';

type WO = {
  id: string;
  work_order_no: string;
  customer_name: string | null;
  size_od: number | null;
  size_wt: number | null;
  l1?: number | null;
  l2?: number | null;
  grade: string | null;
  specification?: string | null;
  ordered_qty: number;
  uom: string;
  ordered_qty_pcs?: number | null;
  ordered_qty_mtr?: number | null;
  ordered_qty_mt?: number | null;
  balance_qty_pcs?: number | null;
  balance_qty_mtr?: number | null;
  balance_qty_mt?: number | null;
  target_date: string | null;
  status: string;
};

type WipStage = {
  work_order_id?: string;
  work_order_no: string;
  route_code: string;
  stage_name: string;
  sequence_no: number;
  input_qty: number;
  input_pcs?: number;
  input_mt?: number;
  output_qty: number;
  output_pcs?: number;
  output_mt?: number;
  rejection_qty: number;
  rejection_pcs?: number;
  rejection_mt?: number;
  net_output_qty?: number;
  net_output_pcs?: number;
  net_output_mt?: number;
  htc_ok_qty?: number;
  htc_ok_pcs?: number;
  htc_ok_mt?: number;
  current_wip: number;
  current_wip_pcs?: number;
  available_mt?: number;
};

export default function WorkOrders() {
  const { user } = usePermissions();
  const formAccess = useMemo(() => getFormAccess(user, 'work_order'), [user]);
  const canCreateWO = formAccess.isAllowed;

  const [rows, setRows] = useState<WO[]>([]);
  const [wipMap, setWipMap] = useState<Record<string, WipStage[]>>({});
  const [expandedWip, setExpandedWip] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [activeActionMenu, setActiveActionMenu] = useState<string | null>(null);

  const [form, setForm] = useState({
    work_order_no: '',
    customer_name: '',
    specification: '',
    grade: '',
    size_od: '',
    size_wt: '',
    l1: '6.0',
    l2: '6.5',
    ordered_qty_pcs: '',
    ordered_qty_mtr: '',
    ordered_qty_mt: '',
    balance_qty_pcs: '',
    balance_qty_mtr: '',
    balance_qty_mt: '',
    target_date: '',
    status: 'Pending Plan',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = createClient();
      let query = s.from('work_orders').select('*').order('target_date', { ascending: true }).limit(200);
      if (status) query = query.eq('status', status);
      const [{ data, error }, { data: wipData }] = await Promise.all([
        query,
        s.from('vw_route_stage_wip').select('*'),
      ]);

      if (error) throw new Error(error.message);
      setRows((data ?? []) as WO[]);

      const activeWip = wipData ?? [];
      if (activeWip) {
        const map: Record<string, WipStage[]> = {};
        (activeWip as WipStage[]).forEach((item) => {
          if (item.work_order_no) {
            if (!map[item.work_order_no]) map[item.work_order_no] = [];
            map[item.work_order_no].push(item);
          }
          if (item.work_order_id && item.work_order_id !== item.work_order_no) {
            if (!map[item.work_order_id]) map[item.work_order_id] = [];
            map[item.work_order_id].push(item);
          }
        });
        setWipMap(map);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load work orders.');
      setRows([]);
      setWipMap({});
    }
    setLoading(false);
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(
    () =>
      rows.filter(
        (r: WO) =>
          !q ||
          [r.work_order_no, r.customer_name, r.grade, r.specification]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(q.toLowerCase())
      ),
    [rows, q]
  );

  // Auto-calculation helper: dynamically calculate PCS and MT when MTR, OD, WT, L1, L2 change
  const handleMtrChange = (mtrVal: string) => {
    const mtr = parseFloat(mtrVal) || 0;
    const od = parseFloat(form.size_od) || 0;
    const wt = parseFloat(form.size_wt) || 0;
    const l1 = parseFloat(form.l1) || 6.0;
    const l2 = parseFloat(form.l2) || 6.5;
    const avg = (l1 + l2) / 2 || 6.0;

    const calcPcs = mtr > 0 && avg > 0 ? Math.round(mtr / avg) : 0;
    const calcMt = mtr > 0 && od > 0 && wt > 0 ? Number(mtFromMtr(mtr, od, wt).toFixed(3)) : 0;

    setForm((prev) => ({
      ...prev,
      ordered_qty_mtr: mtrVal,
      ordered_qty_pcs: calcPcs > 0 ? String(calcPcs) : prev.ordered_qty_pcs,
      ordered_qty_mt: calcMt > 0 ? String(calcMt) : prev.ordered_qty_mt,
      balance_qty_mtr: prev.balance_qty_mtr === '' || prev.balance_qty_mtr === prev.ordered_qty_mtr ? mtrVal : prev.balance_qty_mtr,
      balance_qty_pcs: prev.balance_qty_pcs === '' || prev.balance_qty_pcs === prev.ordered_qty_pcs ? (calcPcs > 0 ? String(calcPcs) : '') : prev.balance_qty_pcs,
      balance_qty_mt: prev.balance_qty_mt === '' || prev.balance_qty_mt === prev.ordered_qty_mt ? (calcMt > 0 ? String(calcMt) : '') : prev.balance_qty_mt,
    }));
  };

  const handlePcsChange = (pcsVal: string) => {
    const pcs = parseFloat(pcsVal) || 0;
    const od = parseFloat(form.size_od) || 0;
    const wt = parseFloat(form.size_wt) || 0;
    const l1 = parseFloat(form.l1) || 6.0;
    const l2 = parseFloat(form.l2) || 6.5;
    const avg = (l1 + l2) / 2 || 6.0;

    const calcMtr = pcs > 0 && avg > 0 ? Number((pcs * avg).toFixed(2)) : 0;
    const calcMt = calcMtr > 0 && od > 0 && wt > 0 ? Number(mtFromMtr(calcMtr, od, wt).toFixed(3)) : 0;

    setForm((prev) => ({
      ...prev,
      ordered_qty_pcs: pcsVal,
      ordered_qty_mtr: calcMtr > 0 ? String(calcMtr) : prev.ordered_qty_mtr,
      ordered_qty_mt: calcMt > 0 ? String(calcMt) : prev.ordered_qty_mt,
      balance_qty_pcs: prev.balance_qty_pcs === '' || prev.balance_qty_pcs === prev.ordered_qty_pcs ? pcsVal : prev.balance_qty_pcs,
      balance_qty_mtr: prev.balance_qty_mtr === '' || prev.balance_qty_mtr === prev.ordered_qty_mtr ? (calcMtr > 0 ? String(calcMtr) : '') : prev.balance_qty_mtr,
      balance_qty_mt: prev.balance_qty_mt === '' || prev.balance_qty_mt === prev.ordered_qty_mt ? (calcMt > 0 ? String(calcMt) : '') : prev.balance_qty_mt,
    }));
  };

  const recalculateQuantities = () => {
    const od = parseFloat(form.size_od) || 0;
    const wt = parseFloat(form.size_wt) || 0;
    const l1 = parseFloat(form.l1) || 6.0;
    const l2 = parseFloat(form.l2) || 6.5;
    const avg = (l1 + l2) / 2 || 6.0;

    let mtr = parseFloat(form.ordered_qty_mtr) || 0;
    let pcs = parseFloat(form.ordered_qty_pcs) || 0;

    if (mtr > 0 && (!pcs || pcs === 0)) {
      pcs = avg > 0 ? Math.round(mtr / avg) : 0;
    } else if (pcs > 0 && (!mtr || mtr === 0)) {
      mtr = Number((pcs * avg).toFixed(2));
    }

    const mt = mtr > 0 && od > 0 && wt > 0 ? Number(mtFromMtr(mtr, od, wt).toFixed(3)) : parseFloat(form.ordered_qty_mt) || 0;

    setForm((prev) => ({
      ...prev,
      ordered_qty_mtr: mtr > 0 ? String(mtr) : prev.ordered_qty_mtr,
      ordered_qty_pcs: pcs > 0 ? String(pcs) : prev.ordered_qty_pcs,
      ordered_qty_mt: mt > 0 ? String(mt) : prev.ordered_qty_mt,
      balance_qty_mtr: prev.balance_qty_mtr || (mtr > 0 ? String(mtr) : ''),
      balance_qty_pcs: prev.balance_qty_pcs || (pcs > 0 ? String(pcs) : ''),
      balance_qty_mt: prev.balance_qty_mt || (mt > 0 ? String(mt) : ''),
    }));
    toast.success('PCS and MT units recalculated from dimensions & length');
  };

  const createWO = async (e: React.FormEvent) => {
    e.preventDefault();
    const od = form.size_od ? Number(form.size_od) : null;
    const wt = form.size_wt ? Number(form.size_wt) : null;
    const l1 = form.l1 ? Number(form.l1) : 6.0;
    const l2 = form.l2 ? Number(form.l2) : 6.5;
    const avg = (l1 + l2) / 2 || 6.0;

    let mtr = form.ordered_qty_mtr ? Number(form.ordered_qty_mtr) : 0;
    let pcs = form.ordered_qty_pcs ? Number(form.ordered_qty_pcs) : 0;
    if (mtr === 0 && pcs > 0) mtr = Number((pcs * avg).toFixed(2));
    if (pcs === 0 && mtr > 0 && avg > 0) pcs = Math.round(mtr / avg);

    const mt = form.ordered_qty_mt ? Number(form.ordered_qty_mt) : (mtr > 0 && od && wt ? Number(mtFromMtr(mtr, od, wt).toFixed(3)) : 0);
    const balMtr = form.balance_qty_mtr !== '' ? Number(form.balance_qty_mtr) : mtr;
    const balPcs = form.balance_qty_pcs !== '' ? Number(form.balance_qty_pcs) : pcs;
    const balMt = form.balance_qty_mt !== '' ? Number(form.balance_qty_mt) : mt;

    const spec = form.specification.trim() || form.grade.trim() || null;

    const payload = {
      work_order_no: form.work_order_no.trim(),
      customer_name: form.customer_name.trim() || null,
      size_od: od,
      size_wt: wt,
      l1,
      l2,
      grade: spec,
      specification: spec,
      ordered_qty: mtr > 0 ? mtr : (pcs > 0 ? pcs : mt),
      uom: mtr > 0 ? 'Mtrs' : (pcs > 0 ? 'Pcs' : 'MT'),
      ordered_qty_pcs: pcs,
      ordered_qty_mtr: mtr,
      ordered_qty_mt: mt,
      balance_qty_pcs: balPcs,
      balance_qty_mtr: balMtr,
      balance_qty_mt: balMt,
      target_date: form.target_date || null,
      status: form.status || 'Pending Plan',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    try {
      const s = createClient();
      const { error } = await s.from('work_orders').insert(payload);
      if (error) throw new Error(error.message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create work order.');
      return;
    }

    toast.success('Work Order created successfully');
    setForm({
      work_order_no: '',
      customer_name: '',
      specification: '',
      grade: '',
      size_od: '',
      size_wt: '',
      l1: '6.0',
      l2: '6.5',
      ordered_qty_pcs: '',
      ordered_qty_mtr: '',
      ordered_qty_mt: '',
      balance_qty_pcs: '',
      balance_qty_mtr: '',
      balance_qty_mt: '',
      target_date: '',
      status: 'Pending Plan',
    });
    setShowCreate(false);
    load();
  };

  const exportExcel = () => {
    const data = filtered.map((w: WO) => {
      const avg = w.l1 && w.l2 ? (w.l1 + w.l2) / 2 : w.l1 || w.l2 || 6.0;
      const od = w.size_od || 0;
      const wt = w.size_wt || 0;
      const orderMtr = w.ordered_qty_mtr != null && w.ordered_qty_mtr > 0 ? w.ordered_qty_mtr : (w.uom === 'Mtrs' ? w.ordered_qty : (avg > 0 ? Number((w.ordered_qty * avg).toFixed(2)) : 0));
      const orderPcs = w.ordered_qty_pcs != null && w.ordered_qty_pcs > 0 ? w.ordered_qty_pcs : (w.uom === 'Pcs' ? w.ordered_qty : (avg > 0 && orderMtr > 0 ? Math.round(orderMtr / avg) : 0));
      const orderMt = w.ordered_qty_mt != null && w.ordered_qty_mt > 0 ? w.ordered_qty_mt : (orderMtr > 0 && od > 0 && wt > 0 ? Number(mtFromMtr(orderMtr, od, wt).toFixed(3)) : 0);
      const balMtr = w.balance_qty_mtr != null ? w.balance_qty_mtr : (w.status === 'Completed' ? 0 : orderMtr);
      const balPcs = w.balance_qty_pcs != null ? w.balance_qty_pcs : (w.status === 'Completed' ? 0 : (avg > 0 && balMtr > 0 ? Math.round(balMtr / avg) : 0));
      const balMt = w.balance_qty_mt != null ? w.balance_qty_mt : (w.status === 'Completed' ? 0 : (balMtr > 0 && od > 0 && wt > 0 ? Number(mtFromMtr(balMtr, od, wt).toFixed(3)) : 0));

      return {
        'W.no': w.work_order_no,
        'Customer': w.customer_name || '',
        'SPECIFICATION': w.specification || w.grade || '',
        'OD': w.size_od ?? '',
        'WL': w.size_wt ?? '',
        'L1': w.l1 ?? 6.0,
        'L2': w.l2 ?? 6.5,
        'Order Pcs': orderPcs,
        'Order Metre': orderMtr,
        'Order MT': orderMt,
        'Balance Qty (Pcs) FOR BUNDLING': balPcs,
        'Balance Qty (Mtr) FOR BUNDLING': balMtr,
        'Balance Qty (MT) FOR BUNDLING': balMt,
        'Bal to Make Mtr.': balMtr,
        'Target Date': w.target_date || '',
        'Current Status': w.status,
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Work Orders');
    XLSX.writeFile(wb, 'work-orders.xlsx');
  };

  const handleDeleteWO = async (wo: WO) => {
    if (!canCreateWO) {
      toast.error('Permission denied: Only Admin or Super User can delete work orders');
      return;
    }
    if (!confirm(`Are you sure you want to delete work order ${wo.work_order_no}?`)) return;

    try {
      const s = createClient();
      const { error } = await s.from('work_orders').delete().eq('id', wo.id);
      if (error) throw new Error(error.message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete work order.');
      return;
    }
    toast.success(`Work Order ${wo.work_order_no} deleted`);
    load();
  };

  const handleClearAll = async () => {
    if (!canCreateWO) {
      toast.error('Permission denied: Only Admin or Super User can clear work orders');
      return;
    }
    if (!confirm('Are you sure you want to remove ALL sample/imported work orders and start fresh with an empty directory?')) return;

    try {
      const s = createClient();
      for (const r of rows) {
        const { error } = await s.from('work_orders').delete().eq('id', r.id);
        if (error) throw new Error(error.message);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to clear work orders.');
      return;
    }
    toast.success('All work orders cleared. You can now import your real Excel file.');
    load();
  };

  const getSLA = (targetDate?: string | null) => {
    if (!targetDate) return { label: 'No Target', cls: 'bg-slate-100 text-slate-600' };
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const target = new Date(targetDate);
    const diff = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diff < 0) return { label: `Overdue ${Math.abs(diff)}d`, cls: 'bg-red-50 text-red-700 border-red-200' };
    if (diff <= 7) return { label: `Due in ${diff}d`, cls: 'bg-amber-50 text-amber-800 border-amber-200' };
    return { label: `Target: ${targetDate}`, cls: 'bg-slate-50 text-slate-600 border-slate-200' };
  };

  const getStatusBadge = (st: string) => {
    switch (st) {
      case 'Pending Plan':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'Scheduled':
        return 'bg-blue-50 text-blue-800 border-blue-200';
      case 'In Progress':
        return 'bg-indigo-50 text-indigo-800 border-indigo-200';
      case 'Completed':
        return 'bg-emerald-50 text-emerald-800 border-emerald-200';
      case 'Diverted':
        return 'bg-purple-50 text-purple-800 border-purple-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <RouteAccessGuard allowedGroups={['admin', 'super_user']} formTitle="Work Orders Directory">
      <div className="space-y-5">
      {/* Top Header */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">Work Orders Directory</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Directory fields and columns matched with Excel Import schedule (W.no, Specs, Dimensions, Pcs, Mtr, MT, Bal to Make)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/excel-import"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition cursor-pointer"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Import Excel
          </Link>
          <button
            type="button"
            onClick={() => setShowCreate(!showCreate)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:from-blue-700 hover:to-indigo-700 transition cursor-pointer"
          >
            <PlusCircle className="h-4 w-4" /> {showCreate ? 'Close Form' : canCreateWO ? 'Create Work Order' : 'Create WO Form (View-Only)'}
          </button>
        </div>
      </div>

      {/* Form Access Banner */}
      <FormAccessBanner access={formAccess} />

      {/* Collapsible Create Work Order Form - Matched with Excel Import */}
      {showCreate && (
        <form onSubmit={createWO} className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <div>
                <h2 className="text-sm font-bold text-slate-900">New Work Order (Manual Form Entry)</h2>
                <p className="text-xs text-slate-500">Fields and calculated units match Excel Import format</p>
              </div>
              {!canCreateWO && (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-800 bg-amber-100 border border-amber-300 rounded px-2.5 py-1">
                  <Lock size={10} /> View-Only Access
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={recalculateQuantities}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                title="Recalculate PCS and MT using OD, WT, and Length"
              >
                <Calculator className="h-3.5 w-3.5 text-blue-600" /> Recalculate Units
              </button>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="text-sm font-medium text-slate-500 hover:text-slate-900"
              >
                Cancel
              </button>
            </div>
          </div>

          {/* Section 1: Order Identification & Customer */}
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Order & Customer</div>
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 text-sm">
              <div>
                <label className="font-semibold text-slate-700">Work Order No. (W.no) *</label>
                <Input
                  className="mt-1"
                  placeholder="e.g. WO-2026-101"
                  disabled={!canCreateWO}
                  value={form.work_order_no}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, work_order_no: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700">Customer Name</label>
                <Input
                  className="mt-1"
                  placeholder="e.g. Bharat Heavy Electricals"
                  disabled={!canCreateWO}
                  value={form.customer_name}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, customer_name: e.target.value })}
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700">Specification / Grade</label>
                <Input
                  className="mt-1"
                  placeholder="e.g. ASTM A335 P11 / Alloy Steel"
                  disabled={!canCreateWO}
                  value={form.specification}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, specification: e.target.value, grade: e.target.value })}
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700">Status</label>
                <Select
                  className="mt-1"
                  disabled={!canCreateWO}
                  value={form.status}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setForm({ ...form, status: e.target.value })}
                >
                  <option value="Pending Plan">Pending Plan</option>
                  <option value="Scheduled">Scheduled</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Completed">Completed</option>
                  <option value="Diverted">Diverted</option>
                </Select>
              </div>
            </div>
          </div>

          {/* Section 2: Pipe Dimensions & Cut Length Range */}
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Pipe Geometry & Length</div>
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 text-sm">
              <div>
                <label className="font-semibold text-slate-700">Finished OD (mm) *</label>
                <Input
                  type="number"
                  step="0.001"
                  className="mt-1 font-mono"
                  placeholder="e.g. 73.0"
                  disabled={!canCreateWO}
                  value={form.size_od}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, size_od: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700">Finished WT / WL (mm) *</label>
                <Input
                  type="number"
                  step="0.001"
                  className="mt-1 font-mono"
                  placeholder="e.g. 5.16"
                  disabled={!canCreateWO}
                  value={form.size_wt}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, size_wt: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700">Min Length L1 (m)</label>
                <Input
                  type="number"
                  step="0.1"
                  className="mt-1 font-mono"
                  placeholder="6.0"
                  disabled={!canCreateWO}
                  value={form.l1}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, l1: e.target.value })}
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700">Max Length L2 (m)</label>
                <Input
                  type="number"
                  step="0.1"
                  className="mt-1 font-mono"
                  placeholder="6.5"
                  disabled={!canCreateWO}
                  value={form.l2}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, l2: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* Section 3: Ordered Quantities (PCS, MTR, MT) */}
          <div className="rounded-lg bg-slate-50/70 border border-slate-200/80 p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Ordered Quantities (Excel Format: Order Pcs · Order Metre · Order MT)
              </span>
              <span className="text-xs text-slate-500">
                Typing Metres auto-calculates Pieces & MT using pipe formula
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 text-sm">
              <div>
                <label className="font-semibold text-slate-700">Order Metres (MTR) *</label>
                <Input
                  type="number"
                  step="0.001"
                  min="0.001"
                  className="mt-1 font-mono font-bold"
                  placeholder="e.g. 1200"
                  disabled={!canCreateWO}
                  value={form.ordered_qty_mtr}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleMtrChange(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700">Order Pieces (PCS)</label>
                <Input
                  type="number"
                  step="1"
                  min="0"
                  className="mt-1 font-mono"
                  placeholder="e.g. 192"
                  disabled={!canCreateWO}
                  value={form.ordered_qty_pcs}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => handlePcsChange(e.target.value)}
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700">Order Weight (MT)</label>
                <Input
                  type="number"
                  step="0.001"
                  min="0"
                  className="mt-1 font-mono"
                  placeholder="Auto-computed MT"
                  disabled={!canCreateWO}
                  value={form.ordered_qty_mt}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, ordered_qty_mt: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* Section 4: Balance Quantities (For Bundling / Balance to Make) */}
          <div className="rounded-lg bg-slate-50/70 border border-slate-200/80 p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Balance Quantities (Excel: Bal to Make Mtr. · Balance Pcs · Balance MT)
              </span>
              <span className="text-xs text-slate-500">Initializes to order quantities</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 text-sm">
              <div>
                <label className="font-semibold text-slate-700">Bal to Make (MTR)</label>
                <Input
                  type="number"
                  step="0.001"
                  min="0"
                  className="mt-1 font-mono"
                  placeholder="Balance Mtr"
                  disabled={!canCreateWO}
                  value={form.balance_qty_mtr}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, balance_qty_mtr: e.target.value })}
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700">Balance Qty (PCS)</label>
                <Input
                  type="number"
                  step="1"
                  min="0"
                  className="mt-1 font-mono"
                  placeholder="Balance Pcs"
                  disabled={!canCreateWO}
                  value={form.balance_qty_pcs}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, balance_qty_pcs: e.target.value })}
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700">Balance Qty (MT)</label>
                <Input
                  type="number"
                  step="0.001"
                  min="0"
                  className="mt-1 font-mono"
                  placeholder="Balance MT"
                  disabled={!canCreateWO}
                  value={form.balance_qty_mt}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, balance_qty_mt: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* Section 5: Delivery SLA */}
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 text-sm">
            <div>
              <label className="font-semibold text-slate-700">Target Delivery Date</label>
              <Input
                type="date"
                className="mt-1"
                disabled={!canCreateWO}
                value={form.target_date}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, target_date: e.target.value })}
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
            {!canCreateWO ? (
              <span className="text-sm text-amber-700 font-medium flex items-center gap-1.5">
                <Lock size={13} />
                Work order creation is restricted to Admin and Super User groups.
              </span>
            ) : <div />}
            <Button
              type="submit"
              disabled={!canCreateWO}
              className={canCreateWO ? "bg-slate-900 text-white hover:bg-slate-800" : "bg-slate-300 text-slate-500 cursor-not-allowed"}
            >
              {canCreateWO ? 'Save Work Order' : 'Save Work Order (View-Only)'}
            </Button>
          </div>
        </form>
      )}

      {/* Main Table with Columns Matched to Excel Import */}
      <div className="rounded-xl border border-slate-200/90 bg-white shadow-sm overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center justify-between">
          <div className="flex flex-1 items-center gap-3">
            <div className="relative max-w-sm w-full">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <Input
                className="pl-8 text-sm h-9"
                placeholder="Search WO No, Customer, Grade/Spec..."
                value={q}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQ(e.target.value)}
              />
            </div>
            <Select className="max-w-[180px] text-sm h-9" value={status} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setStatus(e.target.value)}>
              <option value="">All Statuses</option>
              <option>Pending Plan</option>
              <option>Scheduled</option>
              <option>In Progress</option>
              <option>Completed</option>
              <option>Diverted</option>
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleClearAll}
              disabled={!canCreateWO}
              className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50/50 px-2.5 py-1.5 text-sm font-semibold text-rose-700 hover:bg-rose-100 hover:text-rose-900 transition-colors disabled:opacity-50"
              title="Clear all sample/mock work orders to start fresh"
            >
              <Trash2 className="h-3.5 w-3.5 text-rose-600" /> Clear Directory
            </button>
            <Button type="button" onClick={exportExcel} className="border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 text-sm h-8">
              Export Excel
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center text-sm text-slate-500">Loading work orders...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">No work orders match the criteria.</div>
          ) : (
            <table className="min-w-[1400px] w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-2.5 px-3 text-left font-semibold">Work Order</th>
                  <th className="py-2.5 px-3 text-left font-semibold">Customer</th>
                  <th className="py-2.5 px-3 text-left font-semibold">Specification</th>
                  <th className="py-2.5 px-3 text-right font-semibold">OD (mm)</th>
                  <th className="py-2.5 px-3 text-right font-semibold">WT (mm)</th>
                  <th className="py-2.5 px-3 text-right font-semibold">L1 - L2 (m)</th>
                  <th className="py-2.5 px-3 text-right font-semibold">Order PCS</th>
                  <th className="py-2.5 px-3 text-right font-semibold">Order MTR</th>
                  <th className="py-2.5 px-3 text-right font-semibold">Order MT</th>
                  <th className="py-2.5 px-3 text-right font-semibold">Bal to Make (MTR)</th>
                  <th className="py-2.5 px-3 text-left font-semibold">Work Center WIP</th>
                  <th className="py-2.5 px-3 text-left font-semibold">Target Date / SLA</th>
                  <th className="py-2.5 px-3 text-center font-semibold">Status</th>
                  <th className="py-2.5 px-3 text-right font-semibold">Quick Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((w: WO) => {
                  const sla = getSLA(w.target_date);
                  const wips = wipMap[w.work_order_no] || (w.id ? wipMap[w.id] : []) || [];
                  const isWipExpanded = !!expandedWip[w.id];
                  const avg = w.l1 && w.l2 ? (w.l1 + w.l2) / 2 : w.l1 || w.l2 || 6.0;
                  const activeWips = wips.filter((wp: WipStage) => Number(wp.current_wip) > 0);
                  const od = w.size_od || 0;
                  const wt = w.size_wt || 0;

                  // Quantities with robust fallbacks
                  const orderMtr = w.ordered_qty_mtr != null && w.ordered_qty_mtr > 0
                    ? w.ordered_qty_mtr
                    : (w.uom === 'Mtrs' ? w.ordered_qty : (avg > 0 ? Number((w.ordered_qty * avg).toFixed(1)) : 0));

                  const orderPcs = w.ordered_qty_pcs != null && w.ordered_qty_pcs > 0
                    ? w.ordered_qty_pcs
                    : (w.uom === 'Pcs' ? w.ordered_qty : (avg > 0 && orderMtr > 0 ? Math.round(orderMtr / avg) : 0));

                  const orderMt = w.ordered_qty_mt != null && w.ordered_qty_mt > 0
                    ? w.ordered_qty_mt
                    : (orderMtr > 0 && od > 0 && wt > 0 ? Number(mtFromMtr(orderMtr, od, wt).toFixed(3)) : 0);

                  const balMtr = w.balance_qty_mtr != null
                    ? w.balance_qty_mtr
                    : (w.status === 'Completed' ? 0 : orderMtr);

                  const balPcs = w.balance_qty_pcs != null
                    ? w.balance_qty_pcs
                    : (w.status === 'Completed' ? 0 : (avg > 0 && balMtr > 0 ? Math.round(balMtr / avg) : 0));

                  const balMt = w.balance_qty_mt != null
                    ? w.balance_qty_mt
                    : (w.status === 'Completed' ? 0 : (balMtr > 0 && od > 0 && wt > 0 ? Number(mtFromMtr(balMtr, od, wt).toFixed(3)) : 0));

                  return (
                    <React.Fragment key={w.id}>
                      <tr className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-2.5 px-3 font-bold text-slate-900">
                          <div className="flex items-center gap-1.5">
                            <span>{w.work_order_no}</span>
                            {wips.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setExpandedWip((prev: Record<string, boolean>) => ({ ...prev, [w.id]: !prev[w.id] }))}
                                className="inline-flex items-center gap-0.5 rounded px-2 py-1 text-xs font-semibold border border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200"
                                title="Toggle Work Center WIP Pipeline"
                              >
                                <Layers size={10} />
                                {wips.length} WC
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-slate-700 max-w-[150px] truncate">{w.customer_name || '—'}</td>
                        <td className="py-2.5 px-3 text-slate-600 max-w-[150px] truncate" title={w.specification || w.grade || '—'}>
                          {w.specification || w.grade || '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-800">
                          {w.size_od ?? '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-800">
                          {w.size_wt ?? '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                          {w.l1 ?? 6.0} - {w.l2 ?? 6.5}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-800">
                          {orderPcs || '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-medium text-slate-900">
                          {orderMtr || '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                          {orderMt ? fmt(orderMt, ' MT') : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold">
                          <span className={balMtr <= 5 ? 'text-amber-700' : 'text-slate-900'}>
                            {balMtr}
                          </span>
                          <div className="text-[11px] font-normal text-slate-400">
                            {balPcs} pcs · {fmt(balMt, ' MT')}
                          </div>
                        </td>
                        {/* Work Center WIP summary badge */}
                        <td className="py-2.5 px-3">
                          {activeWips.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {activeWips.map((wp: WipStage) => {
                                const pcsVal = wp.current_wip_pcs ?? (avg > 0 ? Number((wp.current_wip / avg).toFixed(1)) : 0);
                                const wpMt = wp.available_mt ?? mtFromMtr(wp.current_wip, w.size_od || 0, w.size_wt || 0);
                                return (
                                  <span
                                    key={wp.stage_name}
                                    className="inline-flex items-center gap-1 rounded bg-blue-50 border border-blue-200 px-2 py-1 text-xs font-bold text-blue-800 font-mono"
                                    title={`${wp.stage_name}: ${wp.current_wip} MTR (${pcsVal} PCS · ${fmt(wpMt, ' MT')})`}
                                  >
                                    {wp.stage_name.replace(' Stage', '')}: {pcsVal} PCS ({wp.current_wip}m · {fmt(wpMt, ' MT')})
                                  </span>
                                );
                              })}
                            </div>
                          ) : wips.length > 0 ? (
                            <span className="text-sm text-slate-400">Route clear / Ready</span>
                          ) : (
                            <span className="text-sm text-slate-400">No active WIP</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={`inline-flex rounded border px-2.5 py-1 text-xs font-medium ${sla.cls}`}>
                            {sla.label}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusBadge(w.status)}`}>
                            {w.status}
                          </span>
                        </td>
                        {/* Row Action Trigger Menu */}
                        <td className="py-2 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Link
                              href={`/rolling-plans?wo=${w.id}`}
                              className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                              title="Issue Rolling Plan"
                            >
                              <Calendar className="h-3 w-3 text-blue-600" /> Plan
                            </Link>
                            <Link
                              href="/production"
                              className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                              title="Record Production"
                            >
                              <TrendingUp className="h-3 w-3 text-emerald-600" /> Prod
                            </Link>
                            <Link
                              href={`/diversions?source=${w.id}`}
                              className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                              title="Divert Stock"
                            >
                              <GitFork className="h-3 w-3 text-purple-600" /> Divert
                            </Link>
                            {canCreateWO && (
                              <button
                                type="button"
                                onClick={() => handleDeleteWO(w)}
                                className="inline-flex items-center rounded border border-slate-200 bg-white p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-colors"
                                title={`Delete ${w.work_order_no}`}
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Expandable Work Center WIP Details */}
                      {isWipExpanded && (
                        <tr className="bg-slate-50/70 border-b border-slate-200">
                          <td colSpan={14} className="p-3">
                            <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                              <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                                <span className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                                  Work Center WIP Breakdown for {w.work_order_no} (Avg Length: {avg}m)
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setExpandedWip((prev: Record<string, boolean>) => ({ ...prev, [w.id]: false }))}
                                  className="text-xs font-semibold text-slate-500 hover:text-slate-900"
                                >
                                  Close
                                </button>
                              </div>
                              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                                {wips.map((wp: WipStage) => {
                                  const wipPcs = wp.current_wip_pcs ?? (avg > 0 ? (wp.current_wip / avg).toFixed(2) : '0');
                                  const inPcs = wp.input_pcs ?? (avg > 0 ? (wp.input_qty / avg).toFixed(2) : '0');
                                  const outPcs = wp.output_pcs ?? (avg > 0 ? (wp.output_qty / avg).toFixed(2) : '0');
                                  const rejPcs = wp.rejection_pcs ?? (avg > 0 ? (wp.rejection_qty / avg).toFixed(2) : '0');

                                  const wipMt = wp.available_mt ?? mtFromMtr(wp.current_wip, w.size_od || 0, w.size_wt || 0);
                                  const inMt = wp.input_mt ?? mtFromMtr(wp.input_qty, w.size_od || 0, w.size_wt || 0);
                                  const outMt = wp.output_mt ?? mtFromMtr(wp.output_qty, w.size_od || 0, w.size_wt || 0);
                                  const rejMt = wp.rejection_mt ?? mtFromMtr(wp.rejection_qty, w.size_od || 0, w.size_wt || 0);
                                  const htcMt = wp.htc_ok_mt ?? mtFromMtr(wp.htc_ok_qty || 0, w.size_od || 0, w.size_wt || 0);

                                  return (
                                    <div key={wp.stage_name} className="rounded-md border border-slate-200 bg-slate-50/50 p-2 text-sm space-y-1">
                                      <div className="font-bold text-slate-900 flex justify-between">
                                        <span>{wp.stage_name}</span>
                                        <span className="text-xs text-blue-700 font-mono">Seq {wp.sequence_no}</span>
                                      </div>
                                      <div className="flex justify-between text-sm">
                                        <span className="text-slate-500 font-medium">Available WIP:</span>
                                        <span className="font-bold font-mono text-blue-800">{wipPcs} PCS ({wp.current_wip}m · {fmt(wipMt, ' MT')})</span>
                                      </div>
                                      <div className="flex justify-between text-xs text-slate-600">
                                        <span>Input / Output:</span>
                                        <span className="font-mono">{inPcs} / {outPcs} PCS ({wp.input_qty} / {wp.output_qty}m · {fmt(outMt, ' MT')})</span>
                                      </div>
                                      <div className="flex justify-between text-xs text-rose-600">
                                        <span>Rejection:</span>
                                        <span className="font-mono">{rejPcs} PCS ({wp.rejection_qty}m · {fmt(rejMt, ' MT')})</span>
                                      </div>
                                      {wp.htc_ok_qty !== undefined && wp.htc_ok_qty > 0 && (
                                        <div className="flex justify-between text-xs text-emerald-700 font-medium">
                                          <span>HTC OK:</span>
                                          <span className="font-mono">{wp.htc_ok_pcs ?? (avg > 0 ? (wp.htc_ok_qty / avg).toFixed(1) : 0)} PCS ({wp.htc_ok_qty}m · {fmt(htcMt, ' MT')})</span>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
    </RouteAccessGuard>
  );
}
