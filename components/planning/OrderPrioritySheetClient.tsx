// components/planning/OrderPrioritySheetClient.tsx
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Download,
  Printer,
  Search,
  Filter,
  AlertTriangle,
  Flame,
  Clock,
  CheckCircle2,
  FileSpreadsheet,
  RefreshCw,
  Save,
  Layers,
  Building2,
  Calendar,
  Sparkles,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import {
  type PriorityTier,
  type PriorityItem,
  PRIORITY_CONFIGS,
  sortOrdersByPriority,
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
  const [selectedTier, setSelectedTier] = useState<string>('ALL');

  // Load orders & priorities
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const s = createClient();
      const [{ data: woData, error: woError }, localPrio] = await Promise.all([
        s
          .from('work_orders')
          .select('id,work_order_no,customer_name,size_od,size_wt,l1,l2,grade,specification,ordered_qty,ordered_qty_mtr,balance_qty_mtr,target_date,status,destination,po_no')
          .order('target_date', { ascending: true })
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

  // Set tier for a specific work order
  const handleSetTier = (wo: WorkOrderItem, tier: PriorityTier) => {
    const updated: PriorityItem = {
      work_order_id: wo.id,
      work_order_no: wo.work_order_no,
      tier,
      notes: priorities[wo.id]?.notes || '',
      updated_at: new Date().toISOString(),
    };

    const newMap = { ...priorities, [wo.id]: updated };
    setPriorities(newMap);
    saveLocalPriorities(newMap);
    toast.success(`${wo.work_order_no} priority set to ${PRIORITY_CONFIGS[tier].label}`);
  };

  // Update notes
  const handleUpdateNotes = (woId: string, notes: string) => {
    setPriorities((prev) => ({
      ...prev,
      [woId]: {
        ...(prev[woId] || {
          work_order_id: woId,
          work_order_no: '',
          tier: 'NORMAL',
        }),
        notes,
        updated_at: new Date().toISOString(),
      },
    }));
  };

  // Save priorities
  const handleSaveAll = () => {
    setSaving(true);
    saveLocalPriorities(priorities);
    setTimeout(() => {
      setSaving(false);
      toast.success('Priority order sequence saved successfully.');
    }, 300);
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

  // Sorted and filtered orders
  const filteredOrders = useMemo(() => {
    let result = orders;

    // Filter by tier
    if (selectedTier !== 'ALL') {
      result = result.filter((o) => {
        const t = priorities[o.id]?.tier || 'NORMAL';
        return t === selectedTier;
      });
    }

    // Filter by search
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

    return sortOrdersByPriority(result, priorities);
  }, [orders, priorities, selectedTier, search]);

  // Statistics
  const stats = useMemo(() => {
    const now = new Date();
    let critical = 0;
    let high = 0;
    let normal = 0;
    let low = 0;
    let overdue = 0;

    orders.forEach((o) => {
      const t = priorities[o.id]?.tier || 'NORMAL';
      if (t === 'CRITICAL') critical++;
      else if (t === 'HIGH') high++;
      else if (t === 'LOW') low++;
      else normal++;

      if (o.target_date) {
        const diff = (new Date(o.target_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
        if (diff < 0) overdue++;
      }
    });

    return { total: orders.length, critical, high, normal, low, overdue };
  }, [orders, priorities]);

  return (
    <div className="w-full space-y-4">
      {/* 1. Header Toolbar (Hidden in Print) */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs print:hidden">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-blue-900 text-white rounded">
                PPC Planning Form
              </span>
              <h1 className="text-lg font-black text-slate-900 tracking-tight">
                Set Priority Order Sheet
              </h1>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Sequence production campaigns, flag expedited customer orders, and issue daily priority dispatch lists.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={saving}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-xs cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Saving...' : 'Save Sequence'}</span>
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

        {/* 2. Top Summary KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-4 pt-3 border-t border-slate-100">
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <div className="text-[11px] font-bold text-slate-500 uppercase">Open Orders</div>
            <div className="text-xl font-black text-slate-900 mt-0.5 font-mono">{stats.total}</div>
          </div>

          <div className="bg-rose-50 border border-rose-200 rounded-lg p-3">
            <div className="text-[11px] font-bold text-rose-700 uppercase flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              <span>Critical</span>
            </div>
            <div className="text-xl font-black text-rose-900 mt-0.5 font-mono">{stats.critical}</div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <div className="text-[11px] font-bold text-amber-700 uppercase">High Priority</div>
            <div className="text-xl font-black text-amber-900 mt-0.5 font-mono">{stats.high}</div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="text-[11px] font-bold text-blue-700 uppercase">Normal Schedule</div>
            <div className="text-xl font-black text-blue-900 mt-0.5 font-mono">{stats.normal}</div>
          </div>

          <div className="bg-slate-100 border border-slate-200 rounded-lg p-3">
            <div className="text-[11px] font-bold text-slate-600 uppercase">Low / Stock</div>
            <div className="text-xl font-black text-slate-700 mt-0.5 font-mono">{stats.low}</div>
          </div>

          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <div className="text-[11px] font-bold text-red-700 uppercase">Overdue Target</div>
            <div className="text-xl font-black text-red-900 mt-0.5 font-mono">{stats.overdue}</div>
          </div>
        </div>

        {/* 3. Search and Tier Filter Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mt-4 pt-3 border-t border-slate-100">
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

          {/* Tier Filter Buttons */}
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'ALL', label: 'All Orders' },
              { id: 'CRITICAL', label: 'Critical' },
              { id: 'HIGH', label: 'High' },
              { id: 'NORMAL', label: 'Normal' },
              { id: 'LOW', label: 'Low' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedTier(tab.id)}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  selectedTier === tab.id
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
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
            <span>Loading priority order queue...</span>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="p-12 text-center text-xs font-bold text-slate-500">
            No matching work orders found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 text-[11px] font-bold uppercase tracking-wider">
                  <th className="py-2.5 px-3 w-12 text-center">#</th>
                  <th className="py-2.5 px-3 w-32">Priority Tier</th>
                  <th className="py-2.5 px-3">Work Order</th>
                  <th className="py-2.5 px-3">Customer</th>
                  <th className="py-2.5 px-3">Size (OD × WT)</th>
                  <th className="py-2.5 px-3">Grade / Spec</th>
                  <th className="py-2.5 px-3 text-right">Pending Qty</th>
                  <th className="py-2.5 px-3">Target Date</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 min-w-[220px]">Planner Expedite Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOrders.map((wo, index) => {
                  const prio = priorities[wo.id] || { tier: 'NORMAL', notes: '' };
                  const cfg = PRIORITY_CONFIGS[prio.tier] || PRIORITY_CONFIGS.NORMAL;

                  // Date calculation
                  const now = new Date();
                  let dueBadge = <span className="text-slate-400 font-mono">—</span>;
                  if (wo.target_date) {
                    const diffDays = Math.ceil((new Date(wo.target_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                    if (diffDays < 0) {
                      dueBadge = (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          {Math.abs(diffDays)}d Overdue
                        </span>
                      );
                    } else if (diffDays <= 3) {
                      dueBadge = (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-300">
                          {diffDays}d Due
                        </span>
                      );
                    } else if (diffDays <= 7) {
                      dueBadge = (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                          {diffDays}d Due
                        </span>
                      );
                    } else {
                      dueBadge = (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-50 text-slate-600 border border-slate-200">
                          {diffDays}d
                        </span>
                      );
                    }
                  }

                  return (
                    <tr
                      key={wo.id}
                      className={`hover:bg-slate-50/80 transition-colors ${cfg.borderClass}`}
                    >
                      {/* Rank Index */}
                      <td className="py-2.5 px-3 text-center font-bold text-slate-500 font-mono">
                        {index + 1}
                      </td>

                      {/* Priority Tier Selector */}
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1 print:hidden">
                          {(['CRITICAL', 'HIGH', 'NORMAL', 'LOW'] as PriorityTier[]).map((t) => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => handleSetTier(wo, t)}
                              title={PRIORITY_CONFIGS[t].label}
                              className={`px-2 py-0.5 text-[10px] font-black rounded border transition-colors cursor-pointer ${
                                prio.tier === t
                                  ? PRIORITY_CONFIGS[t].badgeClass
                                  : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-100 hover:text-slate-700'
                              }`}
                            >
                              {t[0]}
                            </button>
                          ))}
                        </div>
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold border mt-1 ${cfg.badgeClass}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dotClass}`} />
                          <span>{prio.tier}</span>
                        </span>
                      </td>

                      {/* Work Order No */}
                      <td className="py-2.5 px-3 font-mono font-bold text-blue-900">
                        {wo.work_order_no}
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
                      <td className="py-2.5 px-3 font-mono font-bold text-right text-slate-900">
                        {(wo.balance_qty_mtr ?? wo.ordered_qty_mtr ?? wo.ordered_qty ?? 0).toLocaleString()} M
                      </td>

                      {/* Target Date */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="font-mono text-slate-700">{wo.target_date || '—'}</div>
                        <div className="mt-0.5">{dueBadge}</div>
                      </td>

                      {/* Status */}
                      <td className="py-2.5 px-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                          {wo.status}
                        </span>
                      </td>

                      {/* Planner Expedite Notes */}
                      <td className="py-2.5 px-3">
                        <input
                          type="text"
                          value={prio.notes || ''}
                          onChange={(e) => handleUpdateNotes(wo.id, e.target.value)}
                          placeholder="Add expedite remarks / plant note..."
                          className="w-full px-2.5 py-1 text-xs bg-slate-50 hover:bg-white focus:bg-white text-slate-800 border border-slate-200 focus:border-blue-500 rounded focus:outline-none transition-colors"
                        />
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
