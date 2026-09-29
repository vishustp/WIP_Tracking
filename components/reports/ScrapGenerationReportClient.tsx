// components/reports/ScrapGenerationReportClient.tsx
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Printer,
  Search,
  RefreshCw,
  Download,
  AlertTriangle,
  Factory,
  Flame,
  Wrench,
  Layers,
  Scissors,
  ClipboardCheck,
  Calendar,
  Filter,
  FileSpreadsheet,
  X,
  TrendingDown,
  Info,
  Building2,
  CheckCircle2,
  Recycle,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { ProductionEntry } from '@/types';
import {
  type ScrapRecord,
  type ScrapSummaryKpis,
  type StageScrapSummary,
  type ScrapSourceType,
  extractScrapRecordsFromEntries,
  filterScrapRecords,
  calculateScrapKpis,
  calculateStageScrapSummary,
  generateScrapReportCsv,
  SCRAP_TYPE_LABELS,
} from '@/lib/reports/scrapReportHelper';
import { toast } from 'sonner';

const STAGE_FILTERS = [
  { code: 'ALL', label: 'All Work Centers', icon: Factory },
  { code: 'ROLLING', label: 'Hot Rolling Mill', icon: Flame },
  { code: 'HOLLOW_HEAT_TREATMENT', label: 'Hollow HT', icon: Flame },
  { code: 'DRAW', label: 'Cold Draw Bench', icon: Wrench },
  { code: 'HEAT_TREATMENT', label: 'Final HT', icon: Flame },
  { code: 'BAND_SAW', label: 'Band Saw Cutting', icon: Scissors },
  { code: 'VDI', label: 'VDI / QC', icon: ClipboardCheck },
  { code: 'FINISHING', label: 'Finishing Line', icon: Factory },
];

const SCRAP_TYPE_OPTIONS: { code: string; label: string }[] = [
  { code: 'ALL', label: 'All Scrap Sources' },
  { code: 'BAND_SAW_CUTTING', label: 'Band Saw Trims / Kerf' },
  { code: 'REMNANT_UNDER_3M', label: 'Remnants <3.0m (Rule 5B)' },
  { code: 'STAGE_REJECTION', label: 'Process Rejections' },
  { code: 'QC_REJECTION', label: 'QC Condemned Rejects' },
];

const fmt = (n: number | null | undefined, digits = 2) =>
  n == null ? '—' : Number(n).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });

export default function ScrapGenerationReportClient() {
  const [loading, setLoading] = useState(true);
  const [allRecords, setAllRecords] = useState<ScrapRecord[]>([]);
  const [selectedRecordForDetail, setSelectedRecordForDetail] = useState<ScrapRecord | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedStage, setSelectedStage] = useState('ALL');
  const [selectedScrapType, setSelectedScrapType] = useState('ALL');
  const [selectedGrade, setSelectedGrade] = useState('ALL');

  // Date filters: default to last 30 days
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  // Load production entries, work orders, and QC inspections
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const s = createClient();

      const [prodRes, woRes, qcRes] = await Promise.all([
        s.rpc('get_production_entries', {
          p_search: null,
          p_stage_code: null,
          p_route_code: null,
          p_from_date: fromDate || null,
          p_to_date: toDate || null,
          p_limit: 2500,
          p_offset: 0,
        }),
        s
          .from('work_orders')
          .select('id, work_order_no, customer_name, grade, specification, size_od, size_wt')
          .limit(5000),
        s
          .from('qc_inspections')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(2000),
      ]);

      if (prodRes.error) throw prodRes.error;
      const rawEntries = (prodRes.data as ProductionEntry[]) || [];

      // Work Order Map
      const woMap = new Map<string, any>();
      (woRes.data || []).forEach((w: any) => {
        woMap.set(w.id, w);
        if (w.work_order_no) woMap.set(String(w.work_order_no).trim(), w);
      });

      // QC Inspections Map grouped by work_order_id
      const qcMap = new Map<string, any[]>();
      (qcRes.data || []).forEach((qc: any) => {
        if (!qc.work_order_id) return;
        const arr = qcMap.get(qc.work_order_id) || [];
        arr.push(qc);
        qcMap.set(qc.work_order_id, arr);
      });

      const parsed = extractScrapRecordsFromEntries(rawEntries, woMap, qcMap);
      setAllRecords(parsed);
    } catch (err: any) {
      console.error('Failed to load scrap records:', err);
      toast.error('Failed to load scrap records: ' + (err.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Unique list of grades for dropdown
  const uniqueGrades = useMemo(() => {
    const set = new Set<string>();
    allRecords.forEach((r) => {
      if (r.grade && r.grade !== '—') set.add(r.grade);
    });
    return Array.from(set).sort();
  }, [allRecords]);

  // Filtered records
  const filteredRecords = useMemo(() => {
    return filterScrapRecords(allRecords, {
      stage: selectedStage,
      scrapType: selectedScrapType,
      grade: selectedGrade,
      search: debouncedSearch,
    });
  }, [allRecords, selectedStage, selectedScrapType, selectedGrade, debouncedSearch]);

  // Aggregated KPIs
  const kpis = useMemo(() => {
    return calculateScrapKpis(filteredRecords);
  }, [filteredRecords]);

  // Stage Breakdown Summaries
  const stageSummaries = useMemo(() => {
    return calculateStageScrapSummary(filteredRecords);
  }, [filteredRecords]);

  // Export CSV handler
  const handleExportCsv = () => {
    if (filteredRecords.length === 0) {
      toast.info('No scrap records to export.');
      return;
    }
    const csvContent = generateScrapReportCsv(filteredRecords, kpis);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scrap_generation_report_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Scrap generation report exported to CSV.');
  };

  // Quick Date Range Presets
  const handlePresetDate = (days: number | 'all') => {
    if (days === 'all') {
      setFromDate('');
      setToDate('');
      return;
    }
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    setFromDate(start.toISOString().slice(0, 10));
    setToDate(end.toISOString().slice(0, 10));
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-16">
      {/* 1. Header Bar */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-xs print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-rose-50 text-rose-700 rounded-lg border border-rose-200">
              <Recycle className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-slate-900">
                  Scrap Generation & Loss Report
                </h1>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-rose-100 text-rose-800 border border-rose-200">
                  Plant Mass Loss
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Band Saw hybrid cutting trims, remnants &lt;3.0m (Rule 5B melt loss), and process stage rejections.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 shadow-xs disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={handleExportCsv}
              disabled={loading || filteredRecords.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 shadow-xs disabled:opacity-50 cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              Export CSV
            </button>
            <button
              onClick={() => window.print()}
              disabled={loading || filteredRecords.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-md hover:bg-slate-800 shadow-xs disabled:opacity-50 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              Print Report
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        {/* 2. Top KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5 print:grid-cols-5">
          {/* Card 1: Total Scrap MT */}
          <div className="bg-white p-4 rounded-xl border border-rose-200 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-rose-700">Total Scrap Generated</span>
              <span className="p-1 bg-rose-50 text-rose-700 rounded-md">
                <AlertTriangle className="w-4 h-4" />
              </span>
            </div>
            <div className="mt-2">
              <div className="text-2xl font-bold font-mono tabular-nums text-rose-700">
                {fmt(kpis.total_scrap_mt, 3)} <span className="text-sm font-normal text-rose-500">MT</span>
              </div>
              <div className="text-xs font-mono tabular-nums text-slate-500 mt-0.5">
                {fmt(kpis.total_scrap_mtr, 2)} Mtr ({kpis.total_records_count} events)
              </div>
            </div>
          </div>

          {/* Card 2: Overall Scrap Rate % */}
          <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-700">Scrap Rate %</span>
              <span className="p-1 bg-amber-50 text-amber-700 rounded-md">
                <TrendingDown className="w-4 h-4" />
              </span>
            </div>
            <div className="mt-2">
              <div className="text-2xl font-bold font-mono tabular-nums text-amber-700">
                {fmt(kpis.overall_scrap_pct, 1)}%
              </div>
              <div className="text-xs font-mono tabular-nums text-slate-500 mt-0.5">
                of {fmt(kpis.total_input_mt, 2)} MT Processed
              </div>
            </div>
          </div>

          {/* Card 3: Band Saw Cutting Scrap */}
          <div className="bg-white p-4 rounded-xl border border-blue-200 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-blue-700">Band Saw Trims / Kerf</span>
              <span className="p-1 bg-blue-50 text-blue-700 rounded-md">
                <Scissors className="w-4 h-4" />
              </span>
            </div>
            <div className="mt-2">
              <div className="text-2xl font-bold font-mono tabular-nums text-blue-700">
                {fmt(kpis.band_saw_scrap_mt, 3)} <span className="text-sm font-normal text-blue-500">MT</span>
              </div>
              <div className="text-xs font-mono tabular-nums text-slate-500 mt-0.5">
                {fmt(kpis.band_saw_scrap_mtr, 2)} Mtr cuts loss
              </div>
            </div>
          </div>

          {/* Card 4: Process Stage Rejections */}
          <div className="bg-white p-4 rounded-xl border border-indigo-200 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-indigo-700">Process Rejections</span>
              <span className="p-1 bg-indigo-50 text-indigo-700 rounded-md">
                <Wrench className="w-4 h-4" />
              </span>
            </div>
            <div className="mt-2">
              <div className="text-2xl font-bold font-mono tabular-nums text-indigo-700">
                {fmt(kpis.process_rejection_scrap_mt, 3)} <span className="text-sm font-normal text-indigo-500">MT</span>
              </div>
              <div className="text-xs font-mono tabular-nums text-slate-500 mt-0.5">
                {fmt(kpis.process_rejection_scrap_mtr, 2)} Mtr across mills
              </div>
            </div>
          </div>

          {/* Card 5: Usable Offcuts (>=3m) */}
          <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Usable Offcuts (≥3m)</span>
              <span className="p-1 bg-emerald-50 text-emerald-700 rounded-md">
                <CheckCircle2 className="w-4 h-4" />
              </span>
            </div>
            <div className="mt-2">
              <div className="text-2xl font-bold font-mono tabular-nums text-emerald-700">
                {fmt(kpis.usable_offcuts_mtr, 2)} <span className="text-sm font-normal text-emerald-500">Mtr</span>
              </div>
              <div className="text-xs font-mono tabular-nums text-slate-500 mt-0.5">
                {fmt(kpis.usable_offcuts_mt, 3)} MT eligible for diversion
              </div>
            </div>
          </div>
        </div>

        {/* 3. Filter Controls Bar */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-4 print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[260px] max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search Work Order, Customer, Grade, Heat No, Defect..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-md focus:outline-hidden focus:ring-2 focus:ring-slate-900 focus:bg-white transition-colors"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Date Range Inputs & Presets */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-200">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>From</span>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="text-xs bg-white border border-slate-300 rounded px-1.5 py-0.5"
                />
                <span>To</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="text-xs bg-white border border-slate-300 rounded px-1.5 py-0.5"
                />
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => handlePresetDate(0)}
                  className="px-2 py-1 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded cursor-pointer"
                >
                  Today
                </button>
                <button
                  onClick={() => handlePresetDate(7)}
                  className="px-2 py-1 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded cursor-pointer"
                >
                  7D
                </button>
                <button
                  onClick={() => handlePresetDate(30)}
                  className="px-2 py-1 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded cursor-pointer"
                >
                  30D
                </button>
                <button
                  onClick={() => handlePresetDate('all')}
                  className="px-2 py-1 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded cursor-pointer"
                >
                  All
                </button>
              </div>
            </div>

            {/* Grade Filter */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-slate-600">Grade:</label>
              <select
                value={selectedGrade}
                onChange={(e) => setSelectedGrade(e.target.value)}
                className="text-xs bg-white border border-slate-300 rounded-md px-2 py-1.5 text-slate-700 cursor-pointer"
              >
                <option value="ALL">All Steel Grades</option>
                {uniqueGrades.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Work Center & Scrap Category Pills */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
            {/* Stage Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium text-slate-500 mr-1 flex items-center gap-1">
                <Filter className="w-3 h-3" /> Station:
              </span>
              {STAGE_FILTERS.map((s) => {
                const active = selectedStage === s.code;
                const Icon = s.icon;
                return (
                  <button
                    key={s.code}
                    onClick={() => setSelectedStage(s.code)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                      active
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    {s.label}
                  </button>
                );
              })}
            </div>

            {/* Scrap Type Filter Pills */}
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-xs font-medium text-slate-500 mr-1">Source:</span>
              {SCRAP_TYPE_OPTIONS.map((st) => {
                const active = selectedScrapType === st.code;
                return (
                  <button
                    key={st.code}
                    onClick={() => setSelectedScrapType(st.code)}
                    className={`px-2 py-0.5 rounded text-xs font-medium transition-colors cursor-pointer ${
                      active
                        ? 'bg-rose-700 text-white font-semibold'
                        : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    {st.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* 4. Stage Breakdown Summary Section */}
        {stageSummaries.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
            <h2 className="text-sm font-semibold text-slate-900 mb-3 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Factory className="w-4 h-4 text-slate-500" />
                Work Center Scrap Generation & Yield Matrix
              </span>
              <span className="text-xs font-normal text-slate-500">
                Ranked by scrap tonnage generated
              </span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {stageSummaries.map((ss) => (
                <div
                  key={ss.stage_code}
                  className="p-3 rounded-lg border border-slate-200 bg-slate-50 hover:bg-white hover:border-slate-300 transition-colors"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-slate-900">{ss.stage_name}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full font-mono font-medium bg-rose-100 text-rose-700">
                      {fmt(ss.scrap_rate_pct, 1)}% scrap
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between font-mono tabular-nums">
                    <span className="text-lg font-bold text-rose-700">{fmt(ss.total_scrap_mt, 3)} MT</span>
                    <span className="text-xs text-slate-500">{fmt(ss.total_scrap_mtr, 1)} Mtr</span>
                  </div>
                  <div className="mt-2 text-xs text-slate-500 flex justify-between font-mono">
                    <span>Input: {fmt(ss.total_input_mt, 2)} MT</span>
                    <span>{ss.entry_count} events</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 5. Scrap Ledger Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-900">Scrap Generation Itemized Ledger</h2>
              <span className="text-xs px-2 py-0.5 rounded-md font-mono bg-slate-200 text-slate-700">
                {filteredRecords.length} records
              </span>
            </div>
            <div className="text-xs text-slate-500 font-mono">
              Mass Conservation: Input MT = Prime Output MT + Scrap MT
            </div>
          </div>

          <div className="overflow-x-auto max-h-[640px]">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-100 text-slate-600 font-medium uppercase tracking-wider sticky top-0 z-10 border-b border-slate-200 select-none">
                <tr>
                  <th className="py-2.5 px-3 whitespace-nowrap">Date</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Work Center</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Work Order & Plan</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Customer</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Size & Grade</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Heat / Lot</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Input MT</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Prime MT</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap text-rose-700">Scrap Mtr</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap text-rose-700">Scrap MT</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap text-rose-700">Scrap %</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Scrap Classification</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Defect / Reason</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap text-emerald-700">Usable Remnant (≥3m)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td colSpan={14} className="py-3 px-3 bg-slate-50/50">
                        <div className="h-4 bg-slate-200 rounded w-full"></div>
                      </td>
                    </tr>
                  ))
                ) : filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={14} className="py-12 text-center text-slate-500">
                      <div className="flex flex-col items-center justify-center">
                        <Recycle className="w-10 h-10 text-slate-300 mb-2" />
                        <span className="text-sm font-medium text-slate-700">No Scrap Records Found</span>
                        <span className="text-xs text-slate-400 mt-0.5">
                          Try adjusting date filters or search terms.
                        </span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((r) => {
                    const isBandSaw = r.stage_code === 'BAND_SAW';
                    const isRemnantUnder3m = r.scrap_type === 'REMNANT_UNDER_3M';
                    return (
                      <tr
                        key={r.id}
                        onClick={() => setSelectedRecordForDetail(r)}
                        className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                      >
                        {/* Date */}
                        <td className="py-2 px-3 whitespace-nowrap font-mono text-slate-700">
                          {r.process_date}
                        </td>

                        {/* Work Center */}
                        <td className="py-2 px-3 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 font-medium text-slate-800">
                            {r.stage_name}
                          </span>
                        </td>

                        {/* WO & Plan */}
                        <td className="py-2 px-3 whitespace-nowrap">
                          <div className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
                            {r.work_order_no}
                          </div>
                          {r.plan_no && (
                            <div className="text-[11px] text-slate-400 font-mono">
                              Plan: {r.plan_no}
                            </div>
                          )}
                        </td>

                        {/* Customer */}
                        <td className="py-2 px-3 max-w-[160px] truncate text-slate-700">
                          {r.customer_name}
                        </td>

                        {/* Size & Grade */}
                        <td className="py-2 px-3 whitespace-nowrap">
                          <div className="font-mono text-slate-900 font-medium">{r.size_display}</div>
                          <div className="text-[11px] text-slate-500">{r.grade}</div>
                        </td>

                        {/* Heat / Lot */}
                        <td className="py-2 px-3 whitespace-nowrap font-mono text-slate-600">
                          {r.heat_lot_no}
                        </td>

                        {/* Input MT */}
                        <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-600">
                          {fmt(r.input_mt, 3)}
                        </td>

                        {/* Prime MT */}
                        <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-600">
                          {fmt(r.prime_mt, 3)}
                        </td>

                        {/* Scrap Mtr */}
                        <td className="py-2 px-3 text-right font-mono tabular-nums font-bold text-rose-700">
                          {fmt(r.scrap_mtr, 2)}
                        </td>

                        {/* Scrap MT */}
                        <td className="py-2 px-3 text-right font-mono tabular-nums font-bold text-rose-700">
                          {fmt(r.scrap_mt, 3)}
                        </td>

                        {/* Scrap % */}
                        <td className="py-2 px-3 text-right font-mono tabular-nums text-rose-700 font-medium">
                          {fmt(r.scrap_pct, 1)}%
                        </td>

                        {/* Scrap Classification Badge */}
                        <td className="py-2 px-3 whitespace-nowrap">
                          <span
                            className={`inline-block px-2 py-0.5 text-[11px] rounded-full font-medium ${
                              isRemnantUnder3m
                                ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                : isBandSaw
                                ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                : 'bg-rose-100 text-rose-800 border border-rose-200'
                            }`}
                          >
                            {r.scrap_type_label}
                          </span>
                        </td>

                        {/* Defect / Reason */}
                        <td className="py-2 px-3 max-w-[200px] truncate text-slate-700">
                          {r.scrap_reason}
                        </td>

                        {/* Usable Remnant >= 3m */}
                        <td className="py-2 px-3 text-right font-mono tabular-nums text-emerald-700">
                          {r.usable_offcut_mtr > 0 ? `${fmt(r.usable_offcut_mtr, 2)} Mtr` : '—'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>

              {/* Grand Total Row */}
              <tfoot className="bg-slate-100 font-bold sticky bottom-0 border-t-2 border-slate-300 text-slate-900 font-mono tabular-nums z-10">
                <tr>
                  <td colSpan={6} className="py-2.5 px-3 uppercase tracking-wider text-xs">
                    Grand Total ({filteredRecords.length} Entries)
                  </td>
                  <td className="py-2.5 px-3 text-right">{fmt(kpis.total_input_mt, 3)}</td>
                  <td className="py-2.5 px-3 text-right">
                    {fmt(kpis.total_input_mt - kpis.total_scrap_mt, 3)}
                  </td>
                  <td className="py-2.5 px-3 text-right text-rose-700">{fmt(kpis.total_scrap_mtr, 2)}</td>
                  <td className="py-2.5 px-3 text-right text-rose-700">{fmt(kpis.total_scrap_mt, 3)}</td>
                  <td className="py-2.5 px-3 text-right text-rose-700">{fmt(kpis.overall_scrap_pct, 1)}%</td>
                  <td colSpan={2} className="py-2.5 px-3 text-slate-500 font-normal text-[11px]">
                    Total Remnants &lt;3m: {fmt(kpis.remnants_under_3m_mtr, 2)} Mtr
                  </td>
                  <td className="py-2.5 px-3 text-right text-emerald-700">
                    {fmt(kpis.usable_offcuts_mtr, 2)} Mtr
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* 6. Mill Rules & Standard Compliance Reference Footer */}
        <div className="bg-slate-100 rounded-xl p-4 border border-slate-200 text-xs text-slate-600 space-y-2 print:hidden">
          <div className="font-semibold text-slate-800 flex items-center gap-1.5">
            <Info className="w-4 h-4 text-blue-600" />
            Seamless Pipe Manufacturing Scrap Accounting Rules:
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
            <div className="bg-white p-2.5 rounded-lg border border-slate-200">
              <span className="font-semibold text-slate-900 block mb-0.5">Rule 4: Band Saw Hybrid Cut Accounting</span>
              <p className="text-[11px] text-slate-500">
                Cutting scrap is calculated as <span className="font-mono">Scrap = Mother Pipe Input Mtr − Prime Cut Mtr</span>.
                End trims, kerf loss, and crop ends are aggregated into cutting scrap.
              </p>
            </div>
            <div className="bg-white p-2.5 rounded-lg border border-slate-200">
              <span className="font-semibold text-slate-900 block mb-0.5">Rule 5B: Hard 3.0-Meter Scrap Floor</span>
              <p className="text-[11px] text-slate-500">
                Any pipe off-cut or crop remnant &lt; 3.0m cannot be diverted and is automatically classified as scrap melt loss.
              </p>
            </div>
            <div className="bg-white p-2.5 rounded-lg border border-slate-200">
              <span className="font-semibold text-slate-900 block mb-0.5">Rule 5C: Usable Off-cuts (≥ 3.0m)</span>
              <p className="text-[11px] text-slate-500">
                Off-cuts ≥ 3.0m are kept as usable inventory eligible for Diversion to other work orders or Commercial secondary sales.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 7. Detail Modal */}
      {selectedRecordForDetail && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-rose-50 text-rose-700 rounded-md">
                  <Recycle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Scrap Event: {selectedRecordForDetail.work_order_no}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {selectedRecordForDetail.stage_name} • {selectedRecordForDetail.process_date}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedRecordForDetail(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-md cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200 font-mono">
                <div>
                  <span className="text-slate-500 block text-[11px]">Customer:</span>
                  <span className="font-semibold text-slate-800">{selectedRecordForDetail.customer_name}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Size & Grade:</span>
                  <span className="font-semibold text-slate-800">
                    {selectedRecordForDetail.size_display} ({selectedRecordForDetail.grade})
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Heat / Lot No:</span>
                  <span className="font-semibold text-slate-800">{selectedRecordForDetail.heat_lot_no}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Classification:</span>
                  <span className="font-semibold text-rose-700">{selectedRecordForDetail.scrap_type_label}</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center font-mono">
                <div className="p-2.5 bg-slate-100 rounded-md">
                  <span className="text-[11px] text-slate-500 block">Input</span>
                  <span className="font-bold text-slate-800">{fmt(selectedRecordForDetail.input_mt, 3)} MT</span>
                  <span className="text-[10px] text-slate-400 block">{fmt(selectedRecordForDetail.input_mtr, 1)} Mtr</span>
                </div>
                <div className="p-2.5 bg-emerald-50 text-emerald-800 rounded-md border border-emerald-200">
                  <span className="text-[11px] text-emerald-600 block">Prime OK</span>
                  <span className="font-bold">{fmt(selectedRecordForDetail.prime_mt, 3)} MT</span>
                  <span className="text-[10px] text-emerald-600 block">{fmt(selectedRecordForDetail.prime_mtr, 1)} Mtr</span>
                </div>
                <div className="p-2.5 bg-rose-50 text-rose-800 rounded-md border border-rose-200">
                  <span className="text-[11px] text-rose-600 block">Scrap Loss</span>
                  <span className="font-bold">{fmt(selectedRecordForDetail.scrap_mt, 3)} MT</span>
                  <span className="text-[10px] text-rose-600 block">
                    {fmt(selectedRecordForDetail.scrap_mtr, 2)} Mtr ({selectedRecordForDetail.scrap_pct.toFixed(1)}%)
                  </span>
                </div>
              </div>

              <div>
                <span className="font-semibold text-slate-800 block mb-1">Scrap / Defect Reason:</span>
                <p className="p-2.5 bg-slate-50 rounded-md border border-slate-200 text-slate-700">
                  {selectedRecordForDetail.scrap_reason}
                </p>
              </div>

              {selectedRecordForDetail.remarks && (
                <div>
                  <span className="font-semibold text-slate-800 block mb-1">Full Entry Remarks:</span>
                  <pre className="p-2.5 bg-slate-50 rounded-md border border-slate-200 text-[11px] text-slate-600 whitespace-pre-wrap font-mono">
                    {selectedRecordForDetail.remarks}
                  </pre>
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                onClick={() => setSelectedRecordForDetail(null)}
                className="px-4 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-100 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. Printable Sign-off & Audit Document Footer (visible only in print) */}
      <div className="hidden print:block max-w-7xl mx-auto px-4 mt-8 pt-6 border-t-2 border-slate-400">
        <div className="flex justify-between items-end text-xs text-slate-700">
          <div>
            <p className="font-bold">SEAMLESS PIPE MANUFACTURING MILL</p>
            <p>Quality Assurance & Production Control Ledger</p>
            <p className="text-[10px] text-slate-500 mt-1">Generated: {new Date().toLocaleString()}</p>
          </div>
          <div className="flex gap-12 text-center">
            <div>
              <div className="w-36 border-b border-slate-600 h-8 mb-1"></div>
              <span className="font-medium">Shift In-Charge</span>
            </div>
            <div>
              <div className="w-36 border-b border-slate-600 h-8 mb-1"></div>
              <span className="font-medium">Quality Head</span>
            </div>
            <div>
              <div className="w-36 border-b border-slate-600 h-8 mb-1"></div>
              <span className="font-medium">Plant General Manager</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
