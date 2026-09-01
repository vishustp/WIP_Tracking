'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { mockStore } from '@/lib/supabase/mock-store';
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
    size_od: '',
    size_wt: '',
    l1: '6.0',
    l2: '6.5',
    grade: '',
    ordered_qty: '',
    uom: 'Mtrs',
    target_date: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    mockStore.loadFromStorage();
    try {
      const s = createClient();
      let query = s.from('work_orders').select('*').order('target_date', { ascending: true }).limit(200);
      if (status) query = query.eq('status', status);
      const [{ data, error }, { data: wipData }] = await Promise.all([
        query,
        s.from('vw_route_stage_wip').select('*'),
      ]);

      if (!error && Array.isArray(data)) {
        setRows(data as WO[]);
      } else {
        const localWos = status ? mockStore.workOrders.filter(w => w.status === status) : mockStore.workOrders;
        setRows([...localWos] as WO[]);
      }

      const activeWip = wipData && wipData.length > 0 ? wipData : mockStore.getRouteStageWIP();
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
    } catch {
      const localWos = status ? mockStore.workOrders.filter(w => w.status === status) : mockStore.workOrders;
      setRows([...localWos] as WO[]);
      const activeWip = mockStore.getRouteStageWIP();
      const map: Record<string, WipStage[]> = {};
      (activeWip as WipStage[]).forEach((item) => {
        if (item.work_order_no) {
          if (!map[item.work_order_no]) map[item.work_order_no] = [];
          map[item.work_order_no].push(item);
        }
      });
      setWipMap(map);
    }
    setLoading(false);
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(
    () =>
      rows.filter(
        r =>
          !q ||
          [r.work_order_no, r.customer_name, r.grade, r.specification]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(q.toLowerCase())
      ),
    [rows, q]
  );

  const createWO = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      id: `wo-${Date.now()}`,
      work_order_no: form.work_order_no.trim(),
      customer_name: form.customer_name || null,
      size_od: form.size_od ? Number(form.size_od) : null,
      size_wt: form.size_wt ? Number(form.size_wt) : null,
      l1: form.l1 ? Number(form.l1) : null,
      l2: form.l2 ? Number(form.l2) : null,
      grade: form.grade || null,
      specification: form.grade || null,
      ordered_qty: Number(form.ordered_qty),
      ordered_qty_mtr: form.uom === 'Mtrs' ? Number(form.ordered_qty) : null,
      balance_qty_mtr: form.uom === 'Mtrs' ? Number(form.ordered_qty) : null,
      uom: form.uom,
      target_date: form.target_date || null,
      status: 'Pending Plan',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    try {
      const s = createClient();
      await s.from('work_orders').insert(payload);
    } catch {}

    // Guarantee local store persistence
    if (!mockStore.workOrders.some(w => w.work_order_no === payload.work_order_no)) {
      mockStore.workOrders.unshift(payload as any);
      mockStore.saveToStorage();
    }

    toast.success('Work Order created successfully');
    setForm({
      work_order_no: '',
      customer_name: '',
      size_od: '',
      size_wt: '',
      l1: '6.0',
      l2: '6.5',
      grade: '',
      ordered_qty: '',
      uom: 'Mtrs',
      target_date: '',
    });
    setShowCreate(false);
    load();
  };

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(filtered);
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
      await s.from('work_orders').delete().eq('id', wo.id);
    } catch {}

    mockStore.deleteWorkOrder(wo.id);
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
        await s.from('work_orders').delete().eq('id', r.id);
      }
    } catch {}

    mockStore.clearWorkOrders();
    toast.success('All work orders cleared. You can now import your real Excel file.');
    load();
  };

  const handleResetDemo = () => {
    if (!canCreateWO) {
      toast.error('Permission denied: Only Admin or Super User can reset sample data');
      return;
    }
    if (!confirm('Reset directory back to standard demonstration work orders?')) return;
    mockStore.resetAllData();
    toast.success('Reset to standard demo work orders.');
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
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/excel-import"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-xs hover:bg-slate-50"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Import Excel
          </Link>
          <Button
            onClick={() => setShowCreate(!showCreate)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white shadow-xs hover:bg-slate-800"
          >
            <PlusCircle className="h-4 w-4" /> {showCreate ? 'Close Form' : canCreateWO ? 'Create Work Order' : 'Create WO Form (View-Only)'}
          </Button>
        </div>
      </div>

      {/* Form Access Banner */}
      <FormAccessBanner access={formAccess} />

      {/* Collapsible Create Work Order Form */}
      {showCreate && (
        <form onSubmit={createWO} className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900">New Work Order</h2>
              {!canCreateWO && (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-800 bg-amber-100 border border-amber-300 rounded px-2.5 py-1">
                  <Lock size={10} /> View-Only Access
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="text-sm font-medium text-slate-500 hover:text-slate-900"
            >
              Cancel
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 text-sm">
            <div>
              <label className="font-semibold text-slate-700">Work Order No. *</label>
              <Input
                className="mt-1"
                placeholder="e.g. WO-2025-101"
                disabled={!canCreateWO}
                value={form.work_order_no}
                onChange={e => setForm({ ...form, work_order_no: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="font-semibold text-slate-700">Customer Name</label>
              <Input
                className="mt-1"
                placeholder="e.g. Apex Precision Tubes"
                disabled={!canCreateWO}
                value={form.customer_name}
                onChange={e => setForm({ ...form, customer_name: e.target.value })}
              />
            </div>
            <div>
              <label className="font-semibold text-slate-700">Finished OD (mm)</label>
              <Input
                type="number"
                step="0.001"
                className="mt-1"
                placeholder="e.g. 88.9"
                disabled={!canCreateWO}
                value={form.size_od}
                onChange={e => setForm({ ...form, size_od: e.target.value })}
              />
            </div>
            <div>
              <label className="font-semibold text-slate-700">Finished WT (mm)</label>
              <Input
                type="number"
                step="0.001"
                className="mt-1"
                placeholder="e.g. 7.62"
                disabled={!canCreateWO}
                value={form.size_wt}
                onChange={e => setForm({ ...form, size_wt: e.target.value })}
              />
            </div>
            <div>
              <label className="font-semibold text-slate-700">Length Range L1 - L2 (m)</label>
              <div className="mt-1 flex gap-1">
                <Input
                  type="number"
                  step="0.1"
                  placeholder="L1 (6.0)"
                  disabled={!canCreateWO}
                  value={form.l1}
                  onChange={e => setForm({ ...form, l1: e.target.value })}
                />
                <Input
                  type="number"
                  step="0.1"
                  placeholder="L2 (6.5)"
                  disabled={!canCreateWO}
                  value={form.l2}
                  onChange={e => setForm({ ...form, l2: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className="font-semibold text-slate-700">Grade / Spec</label>
              <Input
                className="mt-1"
                placeholder="e.g. ASTM A106 Gr.B"
                disabled={!canCreateWO}
                value={form.grade}
                onChange={e => setForm({ ...form, grade: e.target.value })}
              />
            </div>
            <div>
              <label className="font-semibold text-slate-700">Ordered Qty *</label>
              <Input
                type="number"
                min="0.001"
                step="0.001"
                className="mt-1"
                placeholder="Qty"
                disabled={!canCreateWO}
                value={form.ordered_qty}
                onChange={e => setForm({ ...form, ordered_qty: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="font-semibold text-slate-700">UOM</label>
              <Select className="mt-1" disabled={!canCreateWO} value={form.uom} onChange={e => setForm({ ...form, uom: e.target.value })}>
                <option>Mtrs</option>
                <option>Pcs</option>
              </Select>
            </div>
            <div>
              <label className="font-semibold text-slate-700">Target Delivery Date</label>
              <Input
                type="date"
                className="mt-1"
                disabled={!canCreateWO}
                value={form.target_date}
                onChange={e => setForm({ ...form, target_date: e.target.value })}
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

      {/* Main Table with Row Actions */}
      <div className="rounded-xl border border-slate-200/90 bg-white shadow-sm overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center justify-between">
          <div className="flex flex-1 items-center gap-3">
            <div className="relative max-w-sm w-full">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <Input
                className="pl-8 text-sm h-9"
                placeholder="Search WO No, Customer, Grade..."
                value={q}
                onChange={e => setQ(e.target.value)}
              />
            </div>
            <Select className="max-w-[180px] text-sm h-9" value={status} onChange={e => setStatus(e.target.value)}>
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
            <button
              type="button"
              onClick={handleResetDemo}
              disabled={!canCreateWO}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
              title="Reset to standard demonstration work orders"
            >
              <RotateCcw className="h-3.5 w-3.5 text-slate-500" /> Reset Demo
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
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-2.5 px-3 text-left font-semibold">WO Number</th>
                  <th className="py-2.5 px-3 text-left font-semibold">Customer</th>
                  <th className="py-2.5 px-3 text-left font-semibold">Size (OD × WT)</th>
                  <th className="py-2.5 px-3 text-left font-semibold">Grade / Spec</th>
                  <th className="py-2.5 px-3 text-right font-semibold">Ordered Qty</th>
                  <th className="py-2.5 px-3 text-left font-semibold">Work Center WIP</th>
                  <th className="py-2.5 px-3 text-left font-semibold">Delivery SLA</th>
                  <th className="py-2.5 px-3 text-center font-semibold">Status</th>
                  <th className="py-2.5 px-3 text-right font-semibold">Quick Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(w => {
                  const sla = getSLA(w.target_date);
                  const wips = wipMap[w.work_order_no] || (w.id ? wipMap[w.id] : []) || [];
                  const isWipExpanded = !!expandedWip[w.id];
                  const avg = w.l1 && w.l2 ? (w.l1 + w.l2) / 2 : w.l1 || w.l2 || 6.0;
                  const activeWips = wips.filter(wp => Number(wp.current_wip) > 0);

                  return (
                    <React.Fragment key={w.id}>
                      <tr className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-2.5 px-3 font-bold text-slate-900">
                          <div className="flex items-center gap-1.5">
                            <span>{w.work_order_no}</span>
                            {wips.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setExpandedWip(prev => ({ ...prev, [w.id]: !prev[w.id] }))}
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
                        <td className="py-2.5 px-3 font-mono text-slate-800">
                          {w.size_od ? `${w.size_od} × ${w.size_wt ?? '—'} mm` : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 max-w-[150px] truncate">{w.grade || w.specification || '—'}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-900 font-mono">
                          {w.ordered_qty} {w.uom}
                        </td>
                        {/* Work Center WIP summary badge */}
                        <td className="py-2.5 px-3">
                          {activeWips.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {activeWips.map(wp => {
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
                          <span className={`inline-flex rounded border px-2.5 py-1 text-sm font-medium ${sla.cls}`}>
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
                          <td colSpan={9} className="p-3">
                            <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                              <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                                <span className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                                  Work Center WIP Breakdown for {w.work_order_no} (Avg Length: {avg}m)
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setExpandedWip(prev => ({ ...prev, [w.id]: false }))}
                                  className="text-xs font-semibold text-slate-500 hover:text-slate-900"
                                >
                                  Close
                                </button>
                              </div>
                              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                                {wips.map(wp => {
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
