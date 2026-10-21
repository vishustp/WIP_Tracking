'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Layers,
  Plus,
  RefreshCw,
  Search,
  Filter,
  Download,
  ArrowRight,
  Warehouse,
  History,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Scale,
} from 'lucide-react';
import { toast } from 'sonner';
import { fetchHollowBankLots, fetchHollowBankAllocations } from '@/lib/hollow-bank/client';
import { HollowBankLot, HollowBankAllocation, HollowBankKpis } from '@/lib/hollow-bank/types';
import DivertToBankModal from './DivertToBankModal';
import AllocateHollowModal from './AllocateHollowModal';
import { exportJsonToExcel } from '@/lib/excelUtils';

export default function HollowBankConsole() {
  const [lots, setLots] = useState<HollowBankLot[]>([]);
  const [allocations, setAllocations] = useState<HollowBankAllocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Active view tab
  const [activeTab, setActiveTab] = useState<'inventory' | 'allocations'>('inventory');

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'AVAILABLE' | 'FULLY_ALLOCATED'>('AVAILABLE');
  const [stageFilter, setStageFilter] = useState('ALL');

  // Modals
  const [isDivertModalOpen, setIsDivertModalOpen] = useState(false);
  const [allocatingLot, setAllocatingLot] = useState<HollowBankLot | null>(null);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [lotsData, allocData] = await Promise.all([
        fetchHollowBankLots({
          status: statusFilter,
          stageCode: stageFilter !== 'ALL' ? stageFilter : undefined,
          searchQuery,
        }),
        fetchHollowBankAllocations(),
      ]);
      setLots(lotsData);
      setAllocations(allocData);
    } catch (err: any) {
      toast.error('Failed to load Hollow Bank data: ' + err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter, stageFilter, searchQuery]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // KPIs
  const kpis: HollowBankKpis = useMemo(() => {
    let totalLots = lots.length;
    let availableLots = 0;
    let totalAvailablePcs = 0;
    let totalAvailableMtr = 0;
    let totalAvailableMt = 0;
    const stageBreakdown: Record<string, { count: number; pcs: number; mtr: number; mt: number }> = {};

    lots.forEach((l) => {
      const isAvail = l.status === 'AVAILABLE' || l.status === 'PARTIALLY_ALLOCATED';
      if (isAvail) {
        availableLots++;
        totalAvailablePcs += Number(l.available_pcs || 0);
        totalAvailableMtr += Number(l.available_meters || 0);
        totalAvailableMt += Number(l.available_mt || l.weight_mt || 0);

        const stg = l.source_stage_code || 'OTHER';
        if (!stageBreakdown[stg]) {
          stageBreakdown[stg] = { count: 0, pcs: 0, mtr: 0, mt: 0 };
        }
        stageBreakdown[stg].count++;
        stageBreakdown[stg].pcs += Number(l.available_pcs || 0);
        stageBreakdown[stg].mtr += Number(l.available_meters || 0);
        stageBreakdown[stg].mt += Number(l.available_mt || l.weight_mt || 0);
      }
    });

    return {
      totalLots,
      availableLots,
      totalAvailablePcs,
      totalAvailableMtr: Number(totalAvailableMtr.toFixed(2)),
      totalAvailableMt: Number(totalAvailableMt.toFixed(3)),
      stageBreakdown,
    };
  }, [lots]);

  // Export to Excel
  const handleExportExcel = async () => {
    try {
      if (activeTab === 'inventory') {
        const rowsToExport = lots.map((l) => ({
          'Lot No': l.lot_no,
          'Source WO': l.source_wo_no || l.source_wo_id,
          'Customer': l.source_customer || '',
          'Origin Stage': l.source_stage_code,
          'Heat No': l.heat_no || '',
          'OD (mm)': l.od,
          'WT (mm)': l.wt,
          'Grade': l.grade,
          'Total Pcs': l.pcs,
          'Total Meters': l.total_meters,
          'Total MT': l.weight_mt,
          'Available Pcs': l.available_pcs,
          'Available Meters': l.available_meters,
          'Available MT': l.available_mt,
          'Status': l.status,
          'Banked Date': l.banked_date,
          'Remarks': l.remarks || '',
        }));
        await exportJsonToExcel(rowsToExport, 'Hollow Bank Stock', `hollow-bank-stock-${Date.now()}.xlsx`);
      } else {
        const rowsToExport = allocations.map((a) => ({
          'Date': a.allocated_date,
          'Lot No': a.lot_no || '',
          'OD (mm)': a.od || '',
          'WT (mm)': a.wt || '',
          'Grade': a.grade || '',
          'Heat No': a.heat_no || '',
          'Origin Stage': a.source_stage_code || '',
          'Source WO': a.source_wo_no || '',
          'Target WO': a.target_wo_no || '',
          'Target Customer': a.target_customer || '',
          'Target Stage': a.target_stage_code,
          'Allocated Pcs': a.allocated_pcs,
          'Allocated Meters': a.allocated_meters,
          'Allocated MT': a.allocated_mt,
          'Remarks': a.remarks || '',
        }));
        await exportJsonToExcel(rowsToExport, 'Allocations Ledger', `hollow-bank-allocations-${Date.now()}.xlsx`);
      }
      toast.success('Export completed successfully.');
    } catch (err: any) {
      toast.error('Failed to export: ' + err.message);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'AVAILABLE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            <CheckCircle2 size={11} /> Available
          </span>
        );
      case 'PARTIALLY_ALLOCATED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
            <Clock size={11} /> Partial
          </span>
        );
      case 'FULLY_ALLOCATED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
            Fully Allocated
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-50 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-blue-600 text-white shadow-xs">
              <Warehouse size={22} />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                Hollow Bank Inventory & Buffer Yard
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Park intermediate mother hollows & pipes from any work center, maintain yard buffer, and allocate to target orders
              </p>
            </div>
          </div>
        </div>

        {/* Top Controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60 shadow-2xs cursor-pointer transition-colors"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60 shadow-2xs cursor-pointer transition-colors"
          >
            <Download size={14} />
            Excel Export
          </button>

          <button
            type="button"
            onClick={() => setIsDivertModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white shadow-xs cursor-pointer transition-colors"
          >
            <Plus size={15} />
            Divert to Bank
          </button>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Available Stock MT */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <span>Available Mass</span>
            <Scale size={14} className="text-blue-500" />
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-blue-600 dark:text-blue-400 tabular-nums">
              {kpis.totalAvailableMt.toLocaleString()}
            </span>
            <span className="text-xs font-bold uppercase text-slate-400">MT In Yard</span>
          </div>
        </div>

        {/* Available Meters */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <span>Available Length</span>
            <Layers size={14} className="text-emerald-500" />
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
              {kpis.totalAvailableMtr.toLocaleString()}
            </span>
            <span className="text-xs font-bold uppercase text-slate-400">Meters</span>
          </div>
        </div>

        {/* Available Pieces */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <span>Available Pipes</span>
            <CheckCircle2 size={14} className="text-indigo-500" />
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-slate-900 dark:text-slate-100 tabular-nums">
              {kpis.totalAvailablePcs.toLocaleString()}
            </span>
            <span className="text-xs font-bold uppercase text-slate-400">Pieces (PCS)</span>
          </div>
        </div>

        {/* Active Lots */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <span>Active Lots</span>
            <Warehouse size={14} className="text-amber-500" />
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400 tabular-nums">
              {kpis.availableLots}
            </span>
            <span className="text-xs font-bold uppercase text-slate-400">/ {kpis.totalLots} Total</span>
          </div>
        </div>
      </div>

      {/* Tabs & Filter Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80">
          <button
            type="button"
            onClick={() => setActiveTab('inventory')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'inventory'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Warehouse size={14} />
            Available Bank Stock ({kpis.availableLots})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('allocations')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'allocations'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <History size={14} />
            Allocation History ({allocations.length})
          </button>
        </div>

        {/* Filter Controls (for inventory tab) */}
        {activeTab === 'inventory' && (
          <div className="flex flex-wrap items-center gap-2">
            {/* Search Box */}
            <div className="relative min-w-[200px] flex-1 sm:flex-initial">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search Lot, WO, Grade, Heat..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-9 pl-8 pr-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="h-9 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer"
            >
              <option value="AVAILABLE">Available & Partial</option>
              <option value="FULLY_ALLOCATED">Fully Allocated</option>
              <option value="ALL">All Lots</option>
            </select>

            {/* Origin Stage Filter */}
            <select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
              className="h-9 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer"
            >
              <option value="ALL">All Origin Stages</option>
              <option value="HOT_ROLLING">Hot Rolling Mill</option>
              <option value="HTC">Hot Test Check (HTC QC)</option>
              <option value="ROLLING">Rolling Mill (Legacy)</option>
              <option value="HOLLOW_HEAT_TREATMENT">Hollow Heat Treatment</option>
              <option value="DRAW">Cold Draw Bench</option>
              <option value="PILGER">Cold Pilger Mill</option>
              <option value="HEAT_TREATMENT">Final Heat Treatment</option>
              <option value="BAND_SAW">Band Saw</option>
            </select>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-12 text-center text-sm text-slate-500 dark:text-slate-400">
          <RefreshCw size={24} className="mx-auto mb-2 animate-spin opacity-50" />
          Loading Hollow Bank ledger...
        </div>
      ) : activeTab === 'inventory' ? (
        /* Inventory Table */
        lots.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-12 text-center">
            <Warehouse size={32} className="mx-auto mb-3 text-slate-400" />
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">No material in Hollow Bank</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-4">
              Divert mother hollows or tubes from any work center to build buffer yard inventory.
            </p>
            <button
              type="button"
              onClick={() => setIsDivertModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-xs cursor-pointer"
            >
              <Plus size={14} /> Divert Material to Bank
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 uppercase tracking-wider text-[11px] font-bold border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-4 py-3">Lot No</th>
                    <th className="px-4 py-3">Source Order</th>
                    <th className="px-4 py-3">Origin Stage</th>
                    <th className="px-4 py-3">Heat No</th>
                    <th className="px-4 py-3">Dimensions (OD × WT)</th>
                    <th className="px-4 py-3">Grade</th>
                    <th className="px-4 py-3 text-right">Available Pcs</th>
                    <th className="px-4 py-3 text-right">Available Mtr</th>
                    <th className="px-4 py-3 text-right">Available MT</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-center">PPC Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {lots.map((lot) => {
                    const isAllocatable =
                      (lot.status === 'AVAILABLE' || lot.status === 'PARTIALLY_ALLOCATED') &&
                      lot.available_pcs > 0;

                    return (
                      <tr
                        key={lot.id}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors"
                      >
                        <td className="px-4 py-3 font-mono font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                          {lot.lot_no}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="font-semibold text-slate-900 dark:text-slate-100">
                            WO #{lot.source_wo_no || lot.source_wo_id}
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[150px]">
                            {lot.source_customer || '—'}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            {lot.source_stage_code}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-700 dark:text-slate-300 whitespace-nowrap">
                          {lot.heat_no || '—'}
                        </td>
                        <td className="px-4 py-3 font-mono font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                          {lot.od} × {lot.wt} mm
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                          {lot.grade}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums whitespace-nowrap">
                          {lot.available_pcs} <span className="text-[10px] text-slate-400 font-normal">/ {lot.pcs}</span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums whitespace-nowrap">
                          {lot.available_meters.toLocaleString()} m
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-blue-600 dark:text-blue-400 tabular-nums whitespace-nowrap">
                          {lot.available_mt} MT
                        </td>
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          {getStatusBadge(lot.status)}
                        </td>
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          {isAllocatable ? (
                            <button
                              type="button"
                              onClick={() => setAllocatingLot(lot)}
                              className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 shadow-2xs cursor-pointer transition-colors"
                            >
                              <ArrowRight size={13} />
                              Allocate
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400 italic">None</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : (
        /* Allocation History Ledger Table */
        allocations.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-12 text-center text-slate-500 dark:text-slate-400">
            <History size={32} className="mx-auto mb-3 opacity-40" />
            <p className="font-semibold text-slate-800 dark:text-slate-200">No allocation records yet</p>
            <p className="text-xs text-slate-400 mt-1">Material allocated from Hollow Bank to work orders will be tracked here.</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 uppercase tracking-wider text-[11px] font-bold border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Bank Lot No</th>
                    <th className="px-4 py-3">Dimensions & Grade</th>
                    <th className="px-4 py-3">Heat No</th>
                    <th className="px-4 py-3">Source WO</th>
                    <th className="px-4 py-3">Target WO</th>
                    <th className="px-4 py-3">Injected Stage</th>
                    <th className="px-4 py-3 text-right">Allocated Pcs</th>
                    <th className="px-4 py-3 text-right">Allocated Mtr</th>
                    <th className="px-4 py-3 text-right">Allocated MT</th>
                    <th className="px-4 py-3">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {allocations.map((alloc) => (
                    <tr
                      key={alloc.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {alloc.allocated_date}
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                        {alloc.lot_no}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                          {alloc.od} × {alloc.wt} mm
                        </span>{' '}
                        <span className="text-slate-500 dark:text-slate-400">({alloc.grade})</span>
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {alloc.heat_no || '—'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-700 dark:text-slate-300">
                        WO #{alloc.source_wo_no}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">
                          WO #{alloc.target_wo_no}
                        </span>
                        <div className="text-[10px] text-slate-400 truncate max-w-[120px]">
                          {alloc.target_customer}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          {alloc.target_stage_code}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums whitespace-nowrap">
                        {alloc.allocated_pcs} pcs
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums whitespace-nowrap">
                        {alloc.allocated_meters.toLocaleString()} m
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-blue-600 dark:text-blue-400 tabular-nums whitespace-nowrap">
                        {alloc.allocated_mt} MT
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">
                        {alloc.remarks || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* Inbound Divert Modal */}
      <DivertToBankModal
        isOpen={isDivertModalOpen}
        onClose={() => setIsDivertModalOpen(false)}
        onSuccess={() => loadData(true)}
      />

      {/* Outbound Allocate Modal */}
      <AllocateHollowModal
        isOpen={Boolean(allocatingLot)}
        lot={allocatingLot}
        onClose={() => setAllocatingLot(null)}
        onSuccess={() => loadData(true)}
      />
    </div>
  );
}
