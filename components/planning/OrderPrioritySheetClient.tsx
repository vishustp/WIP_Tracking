// components/planning/OrderPrioritySheetClient.tsx
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  Download,
  Printer,
  Search,
  Calendar,
  AlertTriangle,
  Clock,
  CheckCircle2,
  RefreshCw,
  Save,
  ExternalLink,
  X,
  Filter,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import {
  type PriorityItem,
  type DateFilterType,
  DATE_FILTER_OPTIONS,
  sortOrdersByPriority,
  filterOrdersByDateBasis,
  getEffectiveOrderDate,
  buildPriorityCsvContent,
  loadLocalPriorities,
  saveLocalPriorities,
} from '@/lib/planning/orderPriorityHelper';

interface WorkOrderItem {
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
  ordered_qty_mtr?: number | null;
  balance_qty_mtr?: number | null;
  target_date: string | null;
  status: string;
  destination?: string | null;
  po_no?: string | null;
  route?: string | null;
}

export default function OrderPrioritySheetClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [orders, setOrders] = useState<WorkOrderItem[]>([]);
  const [priorities, setPriorities] = useState<Record<string, PriorityItem>>({});
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilterType>('ALL');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  // Load orders & priorities
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const s = createClient();
      const [{ data: woData, error: woError }, localPrio] = await Promise.all([
        s
          .from('work_orders')
          .select('id,work_order_no,customer_name,size_od,size_wt,l1,l2,grade,specification,ordered_qty,ordered_qty_mtr,balance_qty_mtr,target_date,status,destination,po_no')
          .order('target_date', { ascending: true, nullsFirst: false })
          .limit(500),
        Promise.resolve(loadLocalPriorities()),
      ]);

      if (woError) throw new Error(woError.message);

      setOrders((woData || []) as WorkOrderItem[]);
      setPriorities(localPrio || {});
    } catch (err: any) {
      console.error('Failed to load work orders for priority sheet:', err);
      toast.error('Failed to load open work orders.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Update target completion date for an order
  const handleUpdateCompletionDate = async (wo: WorkOrderItem, newDate: string) => {
    const cleanDate = newDate.trim() ? newDate.trim() : null;

    // Update orders state
    setOrders((prev) =>
      prev.map((o) => (o.id === wo.id ? { ...o, target_date: cleanDate } : o))
    );

    // Update priorities map
    const updated: PriorityItem = {
      ...(priorities[wo.id] || {
        work_order_id: wo.id,
        work_order_no: wo.work_order_no,
      }),
      work_order_id: wo.id,
      work_order_no: wo.work_order_no,
      completion_date: cleanDate,
      updated_at: new Date().toISOString(),
    };

    const newMap = { ...priorities, [wo.id]: updated };
    setPriorities(newMap);
    saveLocalPriorities(newMap);

    // Asynchronously sync to Supabase work_orders table
    try {
      const s = createClient();
      await s.from('work_orders').update({ target_date: cleanDate }).eq('id', wo.id);
    } catch (err) {
      console.warn('Failed to sync target_date to Supabase work_orders:', err);
    }

    toast.success(
      cleanDate
        ? `${wo.work_order_no}: Target date set to ${cleanDate}`
        : `${wo.work_order_no}: Target date cleared`
    );
  };

  // Update notes
  const handleUpdateNotes = (wo: WorkOrderItem, notes: string) => {
    setPriorities((prev) => {
      const updatedMap = {
        ...prev,
        [wo.id]: {
          ...(prev[wo.id] || {
            work_order_id: wo.id,
            work_order_no: wo.work_order_no,
          }),
          notes,
          updated_at: new Date().toISOString(),
        },
      };
      saveLocalPriorities(updatedMap);
      return updatedMap;
    });
  };

  // Save all priorities to localStorage and DB
  const handleSaveAll = async () => {
    setSaving(true);
    saveLocalPriorities(priorities);

    try {
      const s = createClient();
      const updates = Object.entries(priorities)
        .filter(([_, item]) => item.completion_date !== undefined)
        .map(([woId, item]) =>
          s.from('work_orders').update({ target_date: item.completion_date }).eq('id', woId)
        );

      await Promise.all(updates);
      toast.success('Priority dates and expediting notes saved successfully.');
    } catch (err: any) {
      console.error('Failed to sync priority dates:', err);
      toast.success('Priority dates saved to browser storage.');
    } finally {
      setSaving(false);
    }
  };

  // Export to CSV
  const handleExportCsv = () => {
    const sorted = sortOrdersByPriority(filteredOrders, priorities);
    const csvContent = buildPriorityCsvContent(sorted, priorities);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Order_Priority_Sheet_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Priority Sheet exported to CSV.');
  };

  // Filter and sort orders
  const filteredOrders = useMemo(() => {
    // 1. Date-based filtering
    let result = filterOrdersByDateBasis(orders, priorities, dateFilter, {
      from: customFrom || undefined,
      to: customTo || undefined,
    });

    // 2. Search filter
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(
        (o) =>
          o.work_order_no.toLowerCase().includes(q) ||
          (o.customer_name && o.customer_name.toLowerCase().includes(q)) ||
          (o.grade && o.grade.toLowerCase().includes(q)) ||
          (o.specification && o.specification.toLowerCase().includes(q))
      );
    }

    // 3. Date-based primary sorting (earliest completion date first)
    return sortOrdersByPriority(result, priorities);
  }, [orders, priorities, dateFilter, customFrom, customTo, search]);

  // Date statistics for KPI cards
  const stats = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayStart = new Date(todayStr).getTime();
    const dayMs = 24 * 60 * 60 * 1000;

    let overdue = 0;
    let today = 0;
    let due7 = 0;
    let due15 = 0;
    let due30 = 0;
    let noDate = 0;

    orders.forEach((o) => {
      const d = getEffectiveOrderDate(o, priorities);
      if (!d) {
        noDate++;
        return;
      }

      const itemTime = new Date(d).getTime();
      if (itemTime < todayStart) {
        overdue++;
      } else if (d === todayStr) {
        today++;
      }

      if (itemTime >= todayStart && itemTime <= todayStart + 7 * dayMs) {
        due7++;
      }
      if (itemTime >= todayStart && itemTime <= todayStart + 15 * dayMs) {
        due15++;
      }
      if (itemTime >= todayStart && itemTime <= todayStart + 30 * dayMs) {
        due30++;
      }
    });

    return { total: orders.length, overdue, today, due7, due15, due30, noDate };
  }, [orders, priorities]);

  return (
    <div className="w-full space-y-4">
      {/* 1. Header Toolbar (Hidden in Print) */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs print:hidden">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-blue-900 text-white rounded">
                PPC Planning Console
              </span>
              <h1 className="text-lg font-black text-slate-900 tracking-tight">
                Order Priority & Dispatch Sheet
              </h1>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Set target completion dates, sequence shop-floor dispatch deadlines, and expedite open work orders.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={saving}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-xs cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Saving...' : 'Save Dates & Notes'}</span>
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors shadow-xs cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Export CSV</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold bg-slate-800 hover:bg-slate-900 text-white rounded-lg transition-colors shadow-xs cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Print Sheet</span>
            </button>
          </div>
        </div>

        {/* 2. Top Summary KPI Cards (Date Basis) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-4 pt-3 border-t border-slate-100">
          {/* Total Open Orders */}
          <div
            onClick={() => setDateFilter('ALL')}
            className={`border rounded-lg p-3 cursor-pointer transition-all ${
              dateFilter === 'ALL' && !customFrom && !customTo
                ? 'bg-blue-50/70 border-blue-400 ring-2 ring-blue-500/20'
                : 'bg-slate-50 border-slate-200 hover:bg-slate-100/70'
            }`}
          >
            <div className="text-[11px] font-bold text-slate-500 uppercase">Open Orders</div>
            <div className="text-xl font-black text-slate-900 mt-0.5 font-mono">{stats.total}</div>
          </div>

          {/* Overdue */}
          <div
            onClick={() => setDateFilter('OVERDUE')}
            className={`border rounded-lg p-3 cursor-pointer transition-all ${
              dateFilter === 'OVERDUE'
                ? 'bg-rose-100/70 border-rose-400 ring-2 ring-rose-500/20'
                : 'bg-rose-50 border-rose-200 hover:bg-rose-100/50'
            }`}
          >
            <div className="text-[11px] font-bold text-rose-700 uppercase flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              <span>Overdue</span>
            </div>
            <div className="text-xl font-black text-rose-900 mt-0.5 font-mono">{stats.overdue}</div>
          </div>

          {/* Due Today */}
          <div
            onClick={() => setDateFilter('TODAY')}
            className={`border rounded-lg p-3 cursor-pointer transition-all ${
              dateFilter === 'TODAY'
                ? 'bg-amber-100/70 border-amber-400 ring-2 ring-amber-500/20'
                : 'bg-amber-50 border-amber-200 hover:bg-amber-100/50'
            }`}
          >
            <div className="text-[11px] font-bold text-amber-700 uppercase">Due Today</div>
            <div className="text-xl font-black text-amber-900 mt-0.5 font-mono">{stats.today}</div>
          </div>

          {/* Due Next 7 Days */}
          <div
            onClick={() => setDateFilter('NEXT_7_DAYS')}
            className={`border rounded-lg p-3 cursor-pointer transition-all ${
              dateFilter === 'NEXT_7_DAYS'
                ? 'bg-blue-100/70 border-blue-400 ring-2 ring-blue-500/20'
                : 'bg-blue-50 border-blue-200 hover:bg-blue-100/50'
            }`}
          >
            <div className="text-[11px] font-bold text-blue-700 uppercase">Next 7 Days</div>
            <div className="text-xl font-black text-blue-900 mt-0.5 font-mono">{stats.due7}</div>
          </div>

          {/* Due Next 30 Days */}
          <div
            onClick={() => setDateFilter('NEXT_30_DAYS')}
            className={`border rounded-lg p-3 cursor-pointer transition-all ${
              dateFilter === 'NEXT_30_DAYS'
                ? 'bg-indigo-100/70 border-indigo-400 ring-2 ring-indigo-500/20'
                : 'bg-indigo-50 border-indigo-200 hover:bg-indigo-100/50'
            }`}
          >
            <div className="text-[11px] font-bold text-indigo-700 uppercase">Next 30 Days</div>
            <div className="text-xl font-black text-indigo-900 mt-0.5 font-mono">{stats.due30}</div>
          </div>

          {/* No Date Set */}
          <div
            onClick={() => setDateFilter('NO_DATE')}
            className={`border rounded-lg p-3 cursor-pointer transition-all ${
              dateFilter === 'NO_DATE'
                ? 'bg-slate-200 border-slate-400 ring-2 ring-slate-500/20'
                : 'bg-slate-100 border-slate-200 hover:bg-slate-200/70'
            }`}
          >
            <div className="text-[11px] font-bold text-slate-600 uppercase">No Date Set</div>
            <div className="text-xl font-black text-slate-700 mt-0.5 font-mono">{stats.noDate}</div>
          </div>
        </div>

        {/* 3. Search and Date-Based Filter Bar */}
        <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3 mt-4 pt-3 border-t border-slate-100">
          {/* Search box */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search WO No, Customer, Grade, Size..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs font-bold text-slate-800 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Date Filter Buttons */}
          <div className="flex flex-wrap items-center gap-1.5">
            {DATE_FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setDateFilter(opt.id);
                  setCustomFrom('');
                  setCustomTo('');
                }}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  dateFilter === opt.id && !customFrom && !customTo
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Custom Date Range Filter */}
          <div className="flex items-center gap-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1">
            <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="text-[11px] font-bold text-slate-500">From:</span>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => {
                setCustomFrom(e.target.value);
                setDateFilter('ALL');
              }}
              className="bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <span className="text-[11px] font-bold text-slate-500">To:</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => {
                setCustomTo(e.target.value);
                setDateFilter('ALL');
              }}
              className="bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {(customFrom || customTo) && (
              <button
                type="button"
                onClick={() => {
                  setCustomFrom('');
                  setCustomTo('');
                }}
                title="Clear custom date filter"
                className="text-slate-400 hover:text-rose-600 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 4. Priority Order Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        {/* Printable Meeting Header */}
        <div className="hidden print:block p-4 border-b border-black text-center">
          <h1 className="text-base font-black tracking-wide uppercase">RASHMI METALIKS LIMITED — SEAMLESS PIPE DIVISION</h1>
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 mt-0.5">
            DAILY ORDER DISPATCH & ROLLING PRIORITY SHEET
          </h2>
          <div className="text-[10px] text-slate-600 mt-0.5">
            Generated on: {new Date().toLocaleDateString('en-GB')} · Total Orders: {filteredOrders.length}
          </div>
        </div>

        {loading ? (
          <div className="flex h-64 items-center justify-center text-xs font-bold text-slate-500 gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
            <span>Loading priority orders...</span>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="p-12 text-center text-xs font-bold text-slate-500">
            No matching work orders found for the selected date criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 text-[11px] font-bold uppercase tracking-wider">
                  <th className="py-2.5 px-3 w-12 text-center">#</th>
                  <th className="py-2.5 px-3">Work Order</th>
                  <th className="py-2.5 px-3">Customer</th>
                  <th className="py-2.5 px-3">Size (OD × WT)</th>
                  <th className="py-2.5 px-3">Grade / Spec</th>
                  <th className="py-2.5 px-3 text-right">Pending Qty</th>
                  <th className="py-2.5 px-3 min-w-[200px]">Target Completion Date</th>
                  <th className="py-2.5 px-3 text-center">Due Status</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 min-w-[220px]">Planner Expedite Notes</th>
                  <th className="py-2.5 px-3 text-center print:hidden">Link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOrders.map((wo, index) => {
                  const prio = priorities[wo.id] || { notes: '' };
                  const effectiveDate = getEffectiveOrderDate(wo, priorities);

                  // Date calculation
                  const todayStr = new Date().toISOString().slice(0, 10);
                  const todayTime = new Date(todayStr).getTime();
                  let statusBadge = (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-500 border border-slate-200">
                      No Date Set
                    </span>
                  );
                  let rowBorder = 'border-l-4 border-l-slate-300';

                  if (effectiveDate) {
                    const itemTime = new Date(effectiveDate).getTime();
                    const diffDays = Math.ceil((itemTime - todayTime) / (1000 * 60 * 60 * 24));

                    if (diffDays < 0) {
                      rowBorder = 'border-l-4 border-l-rose-600 bg-rose-50/20';
                      statusBadge = (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse" />
                          <span>{Math.abs(diffDays)}d Overdue</span>
                        </span>
                      );
                    } else if (diffDays === 0) {
                      rowBorder = 'border-l-4 border-l-amber-500 bg-amber-50/20';
                      statusBadge = (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                          <span>Due Today</span>
                        </span>
                      );
                    } else if (diffDays <= 3) {
                      rowBorder = 'border-l-4 border-l-amber-400';
                      statusBadge = (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                          {diffDays}d Due (Urgent)
                        </span>
                      );
                    } else if (diffDays <= 7) {
                      rowBorder = 'border-l-4 border-l-blue-400';
                      statusBadge = (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                          {diffDays}d Due (This Wk)
                        </span>
                      );
                    } else if (diffDays <= 30) {
                      rowBorder = 'border-l-4 border-l-indigo-300';
                      statusBadge = (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                          {diffDays}d Due
                        </span>
                      );
                    } else {
                      rowBorder = 'border-l-4 border-l-slate-300';
                      statusBadge = (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-50 text-slate-600 border border-slate-200">
                          {diffDays}d Due
                        </span>
                      );
                    }
                  }

                  return (
                    <tr
                      key={wo.id}
                      className={`hover:bg-slate-50/80 transition-colors ${rowBorder}`}
                    >
                      {/* Priority Sequence Rank */}
                      <td className="py-2.5 px-3 text-center font-bold text-slate-500 font-mono">
                        {index + 1}
                      </td>

                      {/* Work Order No */}
                      <td className="py-2.5 px-3 font-mono font-bold text-blue-900 whitespace-nowrap">
                        <Link
                          href={`/reports/tracking?search=${encodeURIComponent(wo.work_order_no)}`}
                          className="hover:underline"
                        >
                          {wo.work_order_no}
                        </Link>
                      </td>

                      {/* Customer Name */}
                      <td className="py-2.5 px-3 font-bold text-slate-900 max-w-[180px] truncate" title={wo.customer_name || ''}>
                        {wo.customer_name || 'Generic / Stock'}
                      </td>

                      {/* Size */}
                      <td className="py-2.5 px-3 font-mono font-semibold text-slate-800 whitespace-nowrap">
                        {wo.size_od} × {wo.size_wt} mm
                      </td>

                      {/* Grade / Spec */}
                      <td className="py-2.5 px-3 font-semibold text-slate-700 truncate max-w-[140px]" title={wo.specification || wo.grade || ''}>
                        {wo.specification || wo.grade || '—'}
                      </td>

                      {/* Balance Pending Qty */}
                      <td className="py-2.5 px-3 font-mono font-bold text-right text-slate-900 whitespace-nowrap">
                        {(wo.balance_qty_mtr ?? wo.ordered_qty_mtr ?? wo.ordered_qty ?? 0).toLocaleString()} M
                      </td>

                      {/* Target Completion Date Input */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="date"
                            value={effectiveDate || ''}
                            onChange={(e) => handleUpdateCompletionDate(wo, e.target.value)}
                            className="px-2 py-1 text-xs font-mono font-bold text-slate-800 bg-slate-50 hover:bg-white focus:bg-white border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                          />
                          {effectiveDate && (
                            <button
                              type="button"
                              onClick={() => handleUpdateCompletionDate(wo, '')}
                              title="Clear completion date"
                              className="text-slate-400 hover:text-rose-600 p-0.5 print:hidden"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Due Status Badge */}
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        {statusBadge}
                      </td>

                      {/* Work Order Stage Status */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                          {wo.status}
                        </span>
                      </td>

                      {/* Planner Expedite Notes */}
                      <td className="py-2.5 px-3">
                        <input
                          type="text"
                          value={prio.notes || ''}
                          onChange={(e) => handleUpdateNotes(wo, e.target.value)}
                          placeholder="Add expedite remarks / plant note..."
                          className="w-full px-2.5 py-1 text-xs bg-slate-50 hover:bg-white focus:bg-white text-slate-800 border border-slate-200 focus:border-blue-500 rounded focus:outline-none transition-colors"
                        />
                      </td>

                      {/* Quick Link to Tracking */}
                      <td className="py-2.5 px-3 text-center print:hidden">
                        <Link
                          href={`/reports/tracking?search=${encodeURIComponent(wo.work_order_no)}`}
                          title="Open WO Tracking"
                          className="text-slate-400 hover:text-blue-600 inline-flex items-center"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
