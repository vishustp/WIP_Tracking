'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useUserSession } from '@/contexts/UserSessionContext';
import { isPpcOrAdminUser } from '@/lib/permissions';
import { exportJsonToExcel } from '@/lib/excelUtils';
import type { PpcStockGeneration, StockPlacementType } from '@/types';
import {
  Layers,
  PackagePlus,
  FileSpreadsheet,
  Search,
  Filter,
  Calendar,
  AlertTriangle,
  RotateCcw,
  Ban,
  CheckCircle2,
  X,
  ChevronDown,
  Scale,
  Hash,
  Ruler,
  Clock,
  ArrowUpRight,
  Download,
} from 'lucide-react';
import { toast } from 'sonner';

interface StockGenerationReportClientProps {
  initialRecords: any[];
  workOrders: any[];
  processStages: any[];
}

export default function StockGenerationReportClient({
  initialRecords,
  workOrders,
  processStages,
}: StockGenerationReportClientProps) {
  const router = useRouter();
  const { user, profile, group } = useUserSession();
  const isAuthorized = isPpcOrAdminUser(profile, group);

  const [records, setRecords] = useState<any[]>(initialRecords);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStage, setSelectedStage] = useState('ALL');
  const [selectedPlacement, setSelectedPlacement] = useState<'ALL' | StockPlacementType>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<'ALL' | 'ACTIVE' | 'CANCELLED'>('ACTIVE');
  const [dateFilter, setDateFilter] = useState<'ALL' | 'TODAY' | 'YESTERDAY' | 'WEEK' | 'MONTH' | 'CUSTOM'>('ALL');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Cancellation modal state
  const [voidRecord, setVoidRecord] = useState<any | null>(null);
  const [cancellationReason, setCancellationReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Filter records
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      // Status filter
      if (selectedStatus !== 'ALL' && r.status !== selectedStatus) return false;

      // Stage filter
      if (selectedStage !== 'ALL' && (r.stage_code || '').toUpperCase() !== selectedStage.toUpperCase()) {
        return false;
      }

      // Placement filter
      if (selectedPlacement !== 'ALL' && r.stock_type !== selectedPlacement) return false;

      // Search term (WO, Gen No, Customer, Heat, Lot, Reason)
      if (searchTerm.trim()) {
        const q = searchTerm.trim().toLowerCase();
        const genNo = String(r.generation_no || '').toLowerCase();
        const woNo = String(r.work_orders?.work_order_no || r.work_order_no || '').toLowerCase();
        const cust = String(r.work_orders?.customer_name || '').toLowerCase();
        const heat = String(r.heat_no || '').toLowerCase();
        const lot = String(r.lot_no || '').toLowerCase();
        const reason = String(r.reason || '').toLowerCase();
        const creator = String(r.created_by_name || '').toLowerCase();

        const matches =
          genNo.includes(q) ||
          woNo.includes(q) ||
          cust.includes(q) ||
          heat.includes(q) ||
          lot.includes(q) ||
          reason.includes(q) ||
          creator.includes(q);
        if (!matches) return false;
      }

      // Date filtering
      if (dateFilter !== 'ALL' && r.created_at) {
        const recDate = new Date(r.created_at);
        const now = new Date();

        if (dateFilter === 'TODAY') {
          const isToday = recDate.toDateString() === now.toDateString();
          if (!isToday) return false;
        } else if (dateFilter === 'YESTERDAY') {
          const yesterday = new Date(now);
          yesterday.setDate(now.getDate() - 1);
          if (recDate.toDateString() !== yesterday.toDateString()) return false;
        } else if (dateFilter === 'WEEK') {
          const weekAgo = new Date(now);
          weekAgo.setDate(now.getDate() - 7);
          if (recDate < weekAgo) return false;
        } else if (dateFilter === 'MONTH') {
          if (recDate.getMonth() !== now.getMonth() || recDate.getFullYear() !== now.getFullYear()) {
            return false;
          }
        } else if (dateFilter === 'CUSTOM') {
          if (customStartDate && new Date(recDate.toDateString()) < new Date(customStartDate)) return false;
          if (customEndDate && new Date(recDate.toDateString()) > new Date(customEndDate)) return false;
        }
      }

      return true;
    });
  }, [records, selectedStatus, selectedStage, selectedPlacement, searchTerm, dateFilter, customStartDate, customEndDate]);

  // Active records for KPI summary
  const activeRecords = useMemo(() => {
    return records.filter((r) => r.status === 'ACTIVE');
  }, [records]);

  // Overall KPI totals
  const totals = useMemo(() => {
    const targetSet = filteredRecords;
    const totalPcs = targetSet.reduce((sum, r) => sum + Number(r.pcs || 0), 0);
    const totalMtr = targetSet.reduce((sum, r) => sum + Number(r.meters || 0), 0);
    const totalMt = targetSet.reduce((sum, r) => sum + Number(r.weight_mt || 0), 0);
    const activeCount = targetSet.filter((r) => r.status === 'ACTIVE').length;
    const cancelledCount = targetSet.filter((r) => r.status === 'CANCELLED').length;
    return { totalPcs, totalMtr, totalMt, activeCount, cancelledCount };
  }, [filteredRecords]);

  // Refresh records from backend
  const handleRefresh = async () => {
    try {
      const res = await fetch('/api/stock-generation?status=ALL');
      const json = await res.json();
      if (json.data) {
        setRecords(json.data);
        toast.success('Refreshed stock generation records.');
      }
    } catch (err: any) {
      toast.error('Failed to refresh records', { description: err.message });
    }
  };

  // Void / Cancel Stock Generation
  const handleConfirmVoid = async () => {
    if (!voidRecord || !cancellationReason.trim()) {
      toast.error('Validation Error', { description: 'Cancellation reason is mandatory.' });
      return;
    }

    setIsCancelling(true);
    try {
      const res = await fetch('/api/stock-generation/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: voidRecord.id,
          cancellation_reason: cancellationReason.trim(),
          user_id: user?.id || profile?.id,
        }),
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || 'Failed to cancel stock generation');
      }

      toast.success('Stock Generation Voided', {
        description: `Record ${voidRecord.generation_no} has been cancelled and deducted from the live WIP queue.`,
      });

      // Update local state
      setRecords((prev) =>
        prev.map((r) =>
          r.id === voidRecord.id
            ? {
                ...r,
                status: 'CANCELLED',
                cancelled_at: new Date().toISOString(),
                cancellation_reason: cancellationReason.trim(),
              }
            : r
        )
      );

      setVoidRecord(null);
      setCancellationReason('');
    } catch (err: any) {
      console.error('[StockGenerationReport] Void failed:', err);
      toast.error('Void Failed', { description: err.message });
    } finally {
      setIsCancelling(false);
    }
  };

  // Export to Excel
  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      const exportRows = filteredRecords.map((r) => ({
        'Generation No': r.generation_no,
        'Date & Time': new Date(r.created_at).toLocaleString(),
        'Work Order No': r.work_orders?.work_order_no || r.work_order_no || '—',
        Customer: r.work_orders?.customer_name || 'Generic',
        'Size (OD×WT)': r.work_orders?.size_od ? `${r.work_orders.size_od} × ${r.work_orders.size_wt}` : '—',
        Grade: r.work_orders?.grade || '—',
        Stage: r.process_stages?.stage_name || r.stage_code,
        Placement: r.stock_type === 'INCOMING_QUEUE' ? 'Incoming Queue' : 'Stage Output',
        Pieces: Number(r.pcs || 0),
        Meters: Number(Number(r.meters || 0).toFixed(2)),
        'Weight (MT)': Number(Number(r.weight_mt || 0).toFixed(3)),
        Reason: r.reason,
        'Heat No': r.heat_no || '—',
        'Lot No': r.lot_no || '—',
        Remarks: r.remarks || '—',
        Status: r.status,
        'Created By': r.created_by_name || 'PPC',
        'Cancellation Reason': r.cancellation_reason || '—',
      }));

      const dateStr = new Date().toISOString().split('T')[0];
      await exportJsonToExcel(exportRows, 'PPC Stock Generations', `ppc-stock-generations-${dateStr}.xlsx`);
      toast.success('Export Completed', { description: `Exported ${exportRows.length} stock generation records.` });
    } catch (err: any) {
      toast.error('Export Failed', { description: err.message });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-lg">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                PPC Stock Generation Audit Report
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Audit trail of physical stock inductions, live WIP additions, and administrative void logs
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleRefresh}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 shadow-2xs transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            disabled={isExporting || filteredRecords.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 shadow-2xs disabled:opacity-50 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>{isExporting ? 'Exporting...' : 'Export Excel'}</span>
          </button>

          {isAuthorized && (
            <Link
              href="/stock-generation"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-colors"
            >
              <PackagePlus className="w-3.5 h-3.5" />
              <span>Generate New Stock</span>
            </Link>
          )}
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Inducted Mass</span>
            <div className="p-1.5 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-md">
              <Scale className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-bold font-mono text-slate-900 dark:text-slate-100">
              {totals.totalMt.toFixed(3)}
            </span>
            <span className="text-xs text-slate-500">MT</span>
          </div>
          <span className="text-[11px] text-slate-400 mt-0.5 block">Across filtered records</span>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Pieces</span>
            <div className="p-1.5 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-md">
              <Hash className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-bold font-mono text-slate-900 dark:text-slate-100">
              {totals.totalPcs.toLocaleString()}
            </span>
            <span className="text-xs text-slate-500">Pcs</span>
          </div>
          <span className="text-[11px] text-slate-400 mt-0.5 block">Mother & cut pieces</span>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Length</span>
            <div className="p-1.5 bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 rounded-md">
              <Ruler className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-bold font-mono text-slate-900 dark:text-slate-100">
              {totals.totalMtr.toLocaleString(undefined, { maximumFractionDigits: 1 })}
            </span>
            <span className="text-xs text-slate-500">Mtrs</span>
          </div>
          <span className="text-[11px] text-slate-400 mt-0.5 block">Linear induction meters</span>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Active Records</span>
            <div className="p-1.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-md">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-slate-900 dark:text-slate-100">
              {totals.activeCount}
            </span>
            {totals.cancelledCount > 0 && (
              <span className="text-xs text-red-600 dark:text-red-400">({totals.cancelledCount} voided)</span>
            )}
          </div>
          <span className="text-[11px] text-slate-400 mt-0.5 block">Contributing to live queue</span>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-2xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search Input */}
          <div className="relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search WO, Gen No, Reason..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
          </div>

          {/* Stage Filter */}
          <div>
            <select
              value={selectedStage}
              onChange={(e) => setSelectedStage(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="ALL">All Stages</option>
              {processStages.map((s) => (
                <option key={s.id} value={s.stage_code}>
                  {s.stage_name} ({s.stage_code})
                </option>
              ))}
            </select>
          </div>

          {/* Placement Type Filter */}
          <div>
            <select
              value={selectedPlacement}
              onChange={(e) => setSelectedPlacement(e.target.value as any)}
              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="ALL">All Placements</option>
              <option value="INCOMING_QUEUE">Incoming Queue</option>
              <option value="STAGE_OUTPUT">Stage Output</option>
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value as any)}
              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="ACTIVE">Active Only</option>
              <option value="CANCELLED">Voided / Cancelled</option>
              <option value="ALL">All Statuses</option>
            </select>
          </div>

          {/* Date Range Preset */}
          <div>
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as any)}
              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="ALL">All Time</option>
              <option value="TODAY">Today</option>
              <option value="YESTERDAY">Yesterday</option>
              <option value="WEEK">Last 7 Days</option>
              <option value="MONTH">This Month</option>
              <option value="CUSTOM">Custom Date Range</option>
            </select>
          </div>
        </div>

        {/* Custom Date Range Row */}
        {dateFilter === 'CUSTOM' && (
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center gap-3 text-xs">
            <span className="text-slate-500">From:</span>
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            />
            <span className="text-slate-500">To:</span>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            />
          </div>
        )}
      </div>

      {/* Main Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 uppercase tracking-wider font-semibold">
              <tr>
                <th className="px-3.5 py-3">Gen ID & Date</th>
                <th className="px-3 py-3">Work Order</th>
                <th className="px-3 py-3">Customer & Size</th>
                <th className="px-3 py-3">Stage</th>
                <th className="px-3 py-3">Placement</th>
                <th className="px-3 py-3 text-right">Pcs</th>
                <th className="px-3 py-3 text-right">Meters</th>
                <th className="px-3 py-3 text-right">Weight (MT)</th>
                <th className="px-3 py-3">Reason</th>
                <th className="px-3 py-3">Created By</th>
                <th className="px-3 py-3 text-center">Status</th>
                {isAuthorized && <th className="px-3 py-3 text-right">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={isAuthorized ? 12 : 11} className="px-4 py-8 text-center text-slate-400">
                    No stock generation records match your filter criteria.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((r) => {
                  const isCancelled = r.status === 'CANCELLED';
                  return (
                    <tr
                      key={r.id}
                      className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${
                        isCancelled ? 'opacity-60 bg-slate-50/50 dark:bg-slate-900/40' : ''
                      }`}
                    >
                      <td className="px-3.5 py-3 whitespace-nowrap">
                        <span className="font-mono font-bold text-slate-900 dark:text-slate-100 block">
                          {r.generation_no}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {new Date(r.created_at).toLocaleDateString()} {new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </td>

                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className="font-bold text-slate-900 dark:text-slate-100 block">
                          {r.work_orders?.work_order_no || r.work_order_no}
                        </span>
                        {r.heat_no && (
                          <span className="text-[10px] text-slate-400 font-mono">Heat: {r.heat_no}</span>
                        )}
                      </td>

                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className="text-slate-700 dark:text-slate-300 block">
                          {r.work_orders?.customer_name || 'Generic'}
                        </span>
                        <span className="text-[11px] font-mono text-slate-400">
                          {r.work_orders?.size_od ? `${r.work_orders.size_od}×${r.work_orders.size_wt} mm | ${r.work_orders.grade || '—'}` : '—'}
                        </span>
                      </td>

                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          {r.process_stages?.stage_name || r.stage_code}
                        </span>
                      </td>

                      <td className="px-3 py-3 whitespace-nowrap">
                        {r.stock_type === 'INCOMING_QUEUE' ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 dark:text-blue-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-blue-400" />
                            Incoming Queue
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400" />
                            Stage Output
                          </span>
                        )}
                      </td>

                      <td className="px-3 py-3 whitespace-nowrap text-right font-mono font-semibold text-slate-800 dark:text-slate-200">
                        {Number(r.pcs || 0).toLocaleString()}
                      </td>

                      <td className="px-3 py-3 whitespace-nowrap text-right font-mono text-slate-800 dark:text-slate-200">
                        {Number(Number(r.meters || 0).toFixed(2)).toLocaleString()}
                      </td>

                      <td className="px-3 py-3 whitespace-nowrap text-right font-mono font-bold text-blue-600 dark:text-blue-400">
                        {Number(r.weight_mt || 0).toFixed(3)}
                      </td>

                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className="text-slate-800 dark:text-slate-200 block">{r.reason}</span>
                        {r.remarks && (
                          <span className="text-[10px] text-slate-400 italic block truncate max-w-xs" title={r.remarks}>
                            {r.remarks}
                          </span>
                        )}
                      </td>

                      <td className="px-3 py-3 whitespace-nowrap text-slate-600 dark:text-slate-400">
                        {r.created_by_name || 'PPC'}
                      </td>

                      <td className="px-3 py-3 whitespace-nowrap text-center">
                        {isCancelled ? (
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900"
                            title={`Reason: ${r.cancellation_reason || 'Voided'}`}
                          >
                            VOIDED
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900">
                            ACTIVE
                          </span>
                        )}
                      </td>

                      {isAuthorized && (
                        <td className="px-3 py-3 whitespace-nowrap text-right">
                          {!isCancelled ? (
                            <button
                              type="button"
                              onClick={() => {
                                setVoidRecord(r);
                                setCancellationReason('');
                              }}
                              className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 font-medium text-xs hover:underline"
                            >
                              Void
                            </button>
                          ) : (
                            <span className="text-slate-400 text-[11px]">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Void Modal */}
      {voidRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl max-w-md w-full overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-red-600 dark:text-red-400 flex items-center gap-2">
                <Ban className="w-4 h-4" />
                Void Stock Generation Entry
              </h3>
              <button
                type="button"
                onClick={() => setVoidRecord(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs">
              <p className="text-slate-600 dark:text-slate-300">
                You are about to void <strong className="text-slate-900 dark:text-slate-100">{voidRecord.generation_no}</strong> for Work Order <strong className="text-slate-900 dark:text-slate-100">{voidRecord.work_orders?.work_order_no || voidRecord.work_order_no}</strong>.
              </p>
              <div className="p-3 bg-red-50 dark:bg-red-950/30 rounded-lg border border-red-200 dark:border-red-900/40 text-red-800 dark:text-red-200">
                This will immediately deduct <strong>{voidRecord.pcs} pieces</strong> ({voidRecord.meters}m / {voidRecord.weight_mt} MT) from the live stage WIP queue.
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Mandatory Cancellation Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={3}
                  value={cancellationReason}
                  onChange={(e) => setCancellationReason(e.target.value)}
                  placeholder="Explain why this entry is being cancelled (e.g. entered in error, duplicate induction)..."
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-red-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setVoidRecord(null)}
                disabled={isCancelling}
                className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmVoid}
                disabled={!cancellationReason.trim() || isCancelling}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm disabled:opacity-50"
              >
                {isCancelling ? 'Voiding...' : 'Confirm Void'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
