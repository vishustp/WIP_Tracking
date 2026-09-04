'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Printer,
  Search,
  RefreshCw,
  Download,
  Factory,
  Flame,
  Layers,
  Wrench,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Calendar,
  Filter,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { ProductionEntry, StageCode } from '@/types';
import { toast } from 'sonner';

interface WorkCenterTabConfig {
  code: string;
  label: string;
  shortLabel: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

const WORK_CENTERS: WorkCenterTabConfig[] = [
  {
    code: 'ROLLING',
    label: 'Hot Rolling Mill',
    shortLabel: 'Rolling',
    description: 'Hot billet piercing, mother hollow rolling, and initial hot sizing.',
    icon: Flame,
    color: 'border-amber-500 text-amber-700 bg-amber-50',
  },
  {
    code: 'HOLLOW_HEAT_TREATMENT',
    label: 'Hollow Heat Treatment',
    shortLabel: 'Hollow HT',
    description: 'Mother hollow annealing and stress relieving prior to pilgering/draw.',
    icon: Flame,
    color: 'border-orange-500 text-orange-700 bg-orange-50',
  },
  {
    code: 'DRAW',
    label: 'Cold Draw Bench & Pilger',
    shortLabel: 'Cold Draw',
    description: 'Cold drawing, plug drawing, and cold pilger reduction to final dimensions.',
    icon: Wrench,
    color: 'border-indigo-500 text-indigo-700 bg-indigo-50',
  },
  {
    code: 'HEAT_TREATMENT',
    label: 'Final Heat Treatment',
    shortLabel: 'Final HT',
    description: 'Quench, temper, normalizing, and final metallurgical property conditioning.',
    icon: Flame,
    color: 'border-rose-500 text-rose-700 bg-rose-50',
  },
  {
    code: 'FINISHING',
    label: 'Finishing, NDT & Dispatch',
    shortLabel: 'Finishing',
    description: 'Rotary straightening, ultrasonic/eddy current NDT, hydro-testing, and bundling.',
    icon: Factory,
    color: 'border-teal-500 text-teal-700 bg-teal-50',
  },
  {
    code: 'ALL',
    label: 'All Work Centers Combined',
    shortLabel: 'Plant Summary',
    description: 'Consolidated plant-wide cross-station throughput and yield overview.',
    icon: Layers,
    color: 'border-blue-500 text-blue-700 bg-blue-50',
  },
];

const fmt = (n: number | null | undefined, digits = 2) =>
  n == null ? '—' : Number(n).toLocaleString(undefined, { maximumFractionDigits: digits });

export default function WorkCenterProductionReportClient() {
  const [selectedWc, setSelectedWc] = useState<string>('ROLLING');
  const [entries, setEntries] = useState<ProductionEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [shiftFilter, setShiftFilter] = useState('ALL');
  const [fromDate, setFromDate] = useState(() => {
    // Default to last 7 days
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const s = createClient();
      const stageArg = selectedWc === 'ALL' ? null : selectedWc;

      const { data, error } = await s.rpc('get_production_entries', {
        p_search: search.trim() || null,
        p_stage_code: stageArg,
        p_route_code: null,
        p_from_date: fromDate || null,
        p_to_date: toDate || null,
        p_limit: 2500,
        p_offset: 0,
      });

      if (error) throw error;
      setEntries((data as ProductionEntry[]) || []);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load production entries.');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [selectedWc, search, fromDate, toDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filter entries further by shift (parsed from remarks or created_at timestamp hour)
  const filteredEntries = useMemo(() => {
    if (shiftFilter === 'ALL') return entries;

    return entries.filter((e) => {
      const rem = (e.remarks || '').toUpperCase();
      if (shiftFilter === 'SHIFT_A') {
        if (rem.includes('SHIFT A') || rem.includes('SHIFT-A')) return true;
        const hour = new Date(e.created_at).getHours();
        return hour >= 6 && hour < 14;
      }
      if (shiftFilter === 'SHIFT_B') {
        if (rem.includes('SHIFT B') || rem.includes('SHIFT-B')) return true;
        const hour = new Date(e.created_at).getHours();
        return hour >= 14 && hour < 22;
      }
      if (shiftFilter === 'SHIFT_C') {
        if (rem.includes('SHIFT C') || rem.includes('SHIFT-C')) return true;
        const hour = new Date(e.created_at).getHours();
        return hour >= 22 || hour < 6;
      }
      return true;
    });
  }, [entries, shiftFilter]);

  // Work Center Metrics Calculations
  const metrics = useMemo(() => {
    let inputMtr = 0;
    let inputPcs = 0;
    let inputMt = 0;

    let outputMtr = 0;
    let outputPcs = 0;
    let outputMt = 0;

    let rejMtr = 0;
    let rejPcs = 0;
    let rejMt = 0;

    let htcOkMtr = 0;

    filteredEntries.forEach((e) => {
      inputMtr += Number(e.input_mtr || 0);
      inputPcs += Number(e.input_pcs || 0);
      inputMt += Number(e.input_mt || 0);

      outputMtr += Number(e.output_mtr || 0);
      outputPcs += Number(e.output_pcs || 0);
      outputMt += Number(e.output_mt || 0);

      rejMtr += Number(e.rejection_mtr || 0);
      rejPcs += Number(e.rejection_pcs || 0);
      rejMt += Number(e.rejection_mt || 0);

      htcOkMtr += Number(e.htc_ok_mtr || 0);
    });

    const netMtr = Math.max(outputMtr - rejMtr, 0);
    const netMt = Math.max(outputMt - rejMt, 0);
    const rejRatePct = outputMtr > 0 ? (rejMtr / outputMtr) * 100 : 0;
    const yieldPct = inputMtr > 0 ? (netMtr / inputMtr) * 100 : outputMtr > 0 ? ((outputMtr - rejMtr) / outputMtr) * 100 : 100;

    return {
      count: filteredEntries.length,
      inputMtr,
      inputPcs,
      inputMt,
      outputMtr,
      outputPcs,
      outputMt,
      rejMtr,
      rejPcs,
      rejMt,
      htcOkMtr,
      netMtr,
      netMt,
      rejRatePct,
      yieldPct,
    };
  }, [filteredEntries]);

  const activeWcConfig = useMemo(() => {
    return WORK_CENTERS.find((w) => w.code === selectedWc) || WORK_CENTERS[0];
  }, [selectedWc]);

  const setQuickDate = (preset: 'today' | 'yesterday' | '7days' | 'month') => {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    if (preset === 'today') {
      setFromDate(todayStr);
      setToDate(todayStr);
    } else if (preset === 'yesterday') {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      const yStr = y.toISOString().slice(0, 10);
      setFromDate(yStr);
      setToDate(yStr);
    } else if (preset === '7days') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      setFromDate(d.toISOString().slice(0, 10));
      setToDate(todayStr);
    } else if (preset === 'month') {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      setFromDate(first.toISOString().slice(0, 10));
      setToDate(todayStr);
    }
  };

  const exportCSV = () => {
    if (!filteredEntries.length) {
      toast.error('No production logs to export.');
      return;
    }

    const headers = [
      'Process Date',
      'Work Center',
      'Work Order No',
      'Customer',
      'Heat/Lot No',
      'Pipe OD (mm)',
      'Pipe WT (mm)',
      'Route Code',
      'Input MTR',
      'Input PCS',
      'Output MTR',
      'Output PCS',
      'Output MT',
      'Rejection MTR',
      'Rejection PCS',
      'HTC OK MTR',
      'Yield %',
      'Remarks',
    ];

    const rows = filteredEntries.map((e) => [
      e.process_date,
      e.stage_code,
      e.work_order_no,
      `"${(e.customer_name || '').replace(/"/g, '""')}"`,
      e.heat_lot_no || '',
      e.od ?? '',
      e.wl ?? '',
      e.route_code,
      e.input_mtr ?? 0,
      e.input_pcs ?? 0,
      e.output_mtr ?? 0,
      e.output_pcs ?? 0,
      e.output_mt ?? 0,
      e.rejection_mtr ?? 0,
      e.rejection_pcs ?? 0,
      e.htc_ok_mtr ?? 0,
      e.input_mtr > 0 ? (((e.output_mtr - e.rejection_mtr) / e.input_mtr) * 100).toFixed(1) : '100',
      `"${(e.remarks || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${selectedWc}_Production_Report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Production report exported to CSV.');
  };

  return (
    <div className="space-y-6 print:space-y-4 print:p-0">
      {/* Screen Toolbar / Header Actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-800 border border-blue-200">
              <Factory className="h-3.5 w-3.5 text-blue-700" />
              SHOP FLOOR CIRCULATION
            </span>
            <span className="text-xs font-semibold text-slate-500">Document Ref: STP/PRD-SOP-03</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">
            Work Center Shift Production Report
          </h1>
          <p className="text-xs text-slate-500">
            Dedicated station-by-station production tracking, gross output, rejections, yield, and supervisor sign-offs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={loadData}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-blue-600' : 'text-slate-500'}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={exportCSV}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition cursor-pointer"
          >
            <Download className="h-3.5 w-3.5 text-slate-500" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-500 transition cursor-pointer"
          >
            <Printer className="h-4 w-4" />
            Print Shift Sheet
          </button>
        </div>
      </div>

      {/* Dedicated Work Center Tabs Selector (hidden on print) */}
      <div className="print:hidden">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-slate-200">
          {WORK_CENTERS.map((wc) => {
            const isSelected = selectedWc === wc.code;
            const Icon = wc.icon;
            return (
              <button
                key={wc.code}
                type="button"
                onClick={() => setSelectedWc(wc.code)}
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap cursor-pointer border ${
                  isSelected
                    ? `${wc.color} shadow-xs border-current ring-1 ring-current/20`
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{wc.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Printable Formal Header */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs print:border-black print:p-3 print:shadow-none">
        <div className="flex items-start justify-between border-b border-slate-200 pb-4 print:border-black print:pb-2">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-blue-800 text-white flex items-center justify-center font-black text-lg print:border print:border-black">
              STP
            </div>
            <div>
              <h2 className="text-base font-black uppercase tracking-wide text-slate-900 print:text-black">
                SEAMLESS TUBULAR PRODUCTS LTD.
              </h2>
              <div className="text-xs font-bold text-blue-700 print:text-black uppercase">
                {activeWcConfig.label} · Daily Shift Production Log
              </div>
              <div className="text-[11px] text-slate-500 print:text-black">
                {activeWcConfig.description}
              </div>
            </div>
          </div>

          <div className="text-right text-xs space-y-0.5 print:text-black">
            <div className="font-mono font-bold text-slate-900">DOC: STP/PRD-LOG/03</div>
            <div className="text-slate-500">Work Center Code: {activeWcConfig.code}</div>
            <div className="text-slate-500 font-mono">
              Period: {fromDate} to {toDate}
            </div>
            <div className="text-slate-500">
              Shift: {shiftFilter === 'ALL' ? 'All Shifts (A, B, C)' : shiftFilter.replace('_', ' ')}
            </div>
          </div>
        </div>

        {/* Filter Controls (hidden when printing) */}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-5 print:hidden">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Search WO # / Heat / Remarks
            </label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="e.g. WO-101 or HT-98"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-hidden"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Shift Selector
            </label>
            <select
              value={shiftFilter}
              onChange={(e) => setShiftFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-hidden"
            >
              <option value="ALL">All Shifts Combined</option>
              <option value="SHIFT_A">Shift A (06:00 - 14:00)</option>
              <option value="SHIFT_B">Shift B (14:00 - 22:00)</option>
              <option value="SHIFT_C">Shift C (22:00 - 06:00)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Quick Date Filter
            </label>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setQuickDate('today')}
                className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-[11px] font-semibold text-slate-700 cursor-pointer"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setQuickDate('yesterday')}
                className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-[11px] font-semibold text-slate-700 cursor-pointer"
              >
                Yesterday
              </button>
              <button
                type="button"
                onClick={() => setQuickDate('7days')}
                className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-[11px] font-semibold text-slate-700 cursor-pointer"
              >
                7 Days
              </button>
              <button
                type="button"
                onClick={() => setQuickDate('month')}
                className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-[11px] font-semibold text-slate-700 cursor-pointer"
              >
                Month
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              From Date
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              To Date
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-hidden"
            />
          </div>
        </div>

        {/* Tailored Station KPI Summary Cards - Main focus on PCS and MT */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5 border-t border-slate-100 pt-4 print:border-black print:pt-2">
          {/* Card 1: Total Input */}
          <div className="rounded-xl bg-slate-50 p-3 border-2 border-slate-200 print:bg-white print:border-black shadow-2xs">
            <span className="block text-[10px] font-black uppercase tracking-wider text-slate-500 print:text-black">
              Total Input (Pcs & MT)
            </span>
            <div className="flex flex-wrap items-baseline gap-1.5 mt-1.5">
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-sm sm:text-base font-black font-mono bg-indigo-100 text-indigo-950 border border-indigo-300 print:border-black print:bg-white print:text-black">
                {fmt(metrics.inputPcs, 0)} PCS
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-sm sm:text-base font-black font-mono bg-emerald-100 text-emerald-950 border border-emerald-300 print:border-black print:bg-white print:text-black">
                {fmt(metrics.inputMt)} MT
              </span>
            </div>
            <span className="text-[11px] text-slate-500 block font-mono mt-1 font-semibold print:text-black">
              Length: {fmt(metrics.inputMtr)} MTR
            </span>
          </div>

          {/* Card 2: Gross Output */}
          <div className="rounded-xl bg-blue-50/40 p-3 border-2 border-blue-200 print:bg-white print:border-black shadow-2xs">
            <span className="block text-[10px] font-black uppercase tracking-wider text-blue-900 print:text-black">
              Gross Output (Pcs & MT)
            </span>
            <div className="flex flex-wrap items-baseline gap-1.5 mt-1.5">
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-sm sm:text-base font-black font-mono bg-blue-100 text-blue-950 border border-blue-300 print:border-black print:bg-white print:text-black">
                {fmt(metrics.outputPcs, 0)} PCS
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-sm sm:text-base font-black font-mono bg-emerald-100 text-emerald-950 border border-emerald-300 print:border-black print:bg-white print:text-black">
                {fmt(metrics.outputMt)} MT
              </span>
            </div>
            <span className="text-[11px] text-blue-800 block font-mono mt-1 font-semibold print:text-black">
              Length: {fmt(metrics.outputMtr)} MTR
            </span>
          </div>

          {/* Card 3: Scrap & Rejection */}
          <div className="rounded-xl bg-rose-50/40 p-3 border-2 border-rose-200 print:bg-white print:border-black shadow-2xs">
            <span className="block text-[10px] font-black uppercase tracking-wider text-rose-900 print:text-black">
              Scrap & Rejection (Pcs & MT)
            </span>
            <div className="flex flex-wrap items-baseline gap-1.5 mt-1.5">
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-sm sm:text-base font-black font-mono bg-rose-100 text-rose-950 border border-rose-300 print:border-black print:bg-white print:text-black">
                {fmt(metrics.rejPcs, 0)} PCS
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-sm sm:text-base font-black font-mono bg-rose-100 text-rose-950 border border-rose-300 print:border-black print:bg-white print:text-black">
                {fmt(metrics.rejMt)} MT
              </span>
            </div>
            <span className="text-[11px] text-rose-700 block font-semibold mt-1 print:text-black">
              Rate: {fmt(metrics.rejRatePct, 1)}% ({fmt(metrics.rejMtr)} MTR)
            </span>
          </div>

          {/* Card 4: Prime / Net Accepted / HTC OK */}
          <div className="rounded-xl bg-emerald-50/40 p-3 border-2 border-emerald-200 print:bg-white print:border-black shadow-2xs">
            <span className="block text-[10px] font-black uppercase tracking-wider text-emerald-900 print:text-black">
              {selectedWc === 'ROLLING' ? 'HTC OK / Prime Output' : 'Prime / Net Accepted'}
            </span>
            <div className="flex flex-wrap items-baseline gap-1.5 mt-1.5">
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-sm sm:text-base font-black font-mono bg-emerald-100 text-emerald-950 border border-emerald-300 print:border-black print:bg-white print:text-black">
                {fmt(Math.max(metrics.outputPcs - metrics.rejPcs, 0), 0)} PCS
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-sm sm:text-base font-black font-mono bg-emerald-100 text-emerald-950 border border-emerald-300 print:border-black print:bg-white print:text-black">
                {fmt(metrics.netMt)} MT
              </span>
            </div>
            <span className="text-[11px] text-emerald-800 block font-bold mt-1 font-mono print:text-black">
              {selectedWc === 'ROLLING' ? `HTC OK: ${fmt(metrics.htcOkMtr)} MTR` : `Net MTR: ${fmt(metrics.netMtr)} MTR`}
            </span>
          </div>

          {/* Card 5: Station Yield Efficiency */}
          <div className="rounded-xl bg-indigo-50/40 p-3 border-2 border-indigo-200 print:bg-white print:border-black shadow-2xs">
            <span className="block text-[10px] font-black uppercase tracking-wider text-indigo-900 print:text-black">
              Station Yield Efficiency
            </span>
            <div className="mt-1.5">
              <span className="text-xl font-black text-indigo-950 font-mono print:text-black">
                {fmt(metrics.yieldPct, 1)}%
              </span>
            </div>
            <span className="text-[11px] text-slate-500 block mt-1 font-medium print:text-black">
              {metrics.count} shift batches logged
            </span>
          </div>
        </div>
      </div>

      {/* Production Log Detailed Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden print:border-black print:shadow-none">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-100/90 font-bold uppercase tracking-wider text-slate-700 print:bg-slate-200 print:border-black print:text-black">
                <th className="px-3 py-2.5 whitespace-nowrap">Date & Time</th>
                <th className="px-3 py-2.5 whitespace-nowrap">Work Order #</th>
                <th className="px-3 py-2.5">Customer & Grade</th>
                <th className="px-3 py-2.5 whitespace-nowrap">Heat / Lot No</th>
                <th className="px-3 py-2.5 whitespace-nowrap">Pipe Size (OD × WT)</th>

                {/* Primary Focus Columns: PCS and MT prominently highlighted */}
                <th className="px-3 py-2.5 text-right whitespace-nowrap font-black text-indigo-950 bg-indigo-100/90 border-l border-indigo-300 print:border-black print:bg-white print:text-black">
                  OUTPUT (PCS) ★
                </th>
                <th className="px-3 py-2.5 text-right whitespace-nowrap font-black text-emerald-950 bg-emerald-100/90 border-r border-emerald-300 print:border-black print:bg-white print:text-black">
                  WEIGHT (MT) ★
                </th>

                <th className="px-3 py-2.5 text-right whitespace-nowrap">Input MTR</th>
                <th className="px-3 py-2.5 text-right whitespace-nowrap">Output MTR</th>
                <th className="px-3 py-2.5 text-right whitespace-nowrap">Rej MTR</th>
                {selectedWc === 'ROLLING' && (
                  <th className="px-3 py-2.5 text-right whitespace-nowrap">HTC OK</th>
                )}
                <th className="px-3 py-2.5 text-center whitespace-nowrap">Yield %</th>
                <th className="px-3 py-2.5">Operator Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 print:divide-black">
              {loading ? (
                <tr>
                  <td colSpan={selectedWc === 'ROLLING' ? 13 : 12} className="p-8 text-center text-slate-500">
                    <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-blue-600" />
                    Loading shift production records...
                  </td>
                </tr>
              ) : filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={selectedWc === 'ROLLING' ? 13 : 12} className="p-8 text-center text-slate-500">
                    No production entries logged for {activeWcConfig.label} during this time frame.
                  </td>
                </tr>
              ) : (
                filteredEntries.map((e) => {
                  const net = Math.max(e.output_mtr - e.rejection_mtr, 0);
                  const entryYield =
                    e.input_mtr > 0
                      ? (net / e.input_mtr) * 100
                      : e.output_mtr > 0
                      ? (net / e.output_mtr) * 100
                      : 100;

                  return (
                    <tr key={e.id} className="hover:bg-slate-50/50 print:text-black">
                      <td className="px-3 py-2 font-mono whitespace-nowrap text-slate-800 print:text-black">
                        <div>{e.process_date}</div>
                        <div className="text-[10px] text-slate-400 print:text-black">
                          {new Date(e.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>

                      <td className="px-3 py-2 font-mono font-bold text-slate-900 whitespace-nowrap print:text-black">
                        {e.work_order_no}
                      </td>

                      <td className="px-3 py-2 max-w-[150px] truncate">
                        <div className="font-semibold text-slate-800 print:text-black">{e.customer_name || 'Standard Stock'}</div>
                        <div className="text-[10px] font-mono text-slate-500 print:text-black">Route: {e.route_code}</div>
                      </td>

                      <td className="px-3 py-2 font-mono font-bold text-slate-800 whitespace-nowrap print:text-black">
                        {e.heat_lot_no ? (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-800 print:border print:border-black font-black">
                            {e.heat_lot_no}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      <td className="px-3 py-2 font-mono text-slate-700 whitespace-nowrap print:text-black">
                        {e.od && e.wl ? `${fmt(e.od)} × ${fmt(e.wl)} mm` : '—'}
                      </td>

                      {/* Primary Focus Cells: Output PCS (Highlighted, Bold) */}
                      <td className="px-3 py-2 text-right font-mono bg-indigo-50/60 border-l border-indigo-200 print:bg-white print:border-black">
                        <span className="inline-block px-2 py-0.5 rounded-md font-black text-xs sm:text-sm text-indigo-950 bg-indigo-100/90 border border-indigo-300 print:bg-white print:border-black print:text-black">
                          {fmt(e.output_pcs, 0)}
                        </span>
                      </td>

                      {/* Primary Focus Cells: Output MT (Highlighted, Bold) */}
                      <td className="px-3 py-2 text-right font-mono bg-emerald-50/60 border-r border-emerald-200 print:bg-white print:border-black">
                        <span className="inline-block px-2 py-0.5 rounded-md font-black text-xs sm:text-sm text-emerald-950 bg-emerald-100/90 border border-emerald-300 print:bg-white print:border-black print:text-black">
                          {fmt(e.output_mt)}
                        </span>
                      </td>

                      <td className="px-3 py-2 text-right font-mono text-slate-700 print:text-black">
                        {fmt(e.input_mtr)}
                      </td>

                      <td className="px-3 py-2 text-right font-mono font-bold text-blue-700 print:text-black">
                        {fmt(e.output_mtr)}
                      </td>

                      <td className="px-3 py-2 text-right font-mono font-semibold text-rose-600 print:text-black">
                        {e.rejection_mtr > 0 ? fmt(e.rejection_mtr) : '0'}
                      </td>

                      {selectedWc === 'ROLLING' && (
                        <td className="px-3 py-2 text-right font-mono font-bold text-emerald-700 print:text-black">
                          {fmt(e.htc_ok_mtr)}
                        </td>
                      )}

                      <td className="px-3 py-2 text-center font-mono font-bold print:text-black">
                        <span
                          className={`rounded px-1.5 py-0.2 text-[11px] ${
                            entryYield >= 90
                              ? 'bg-emerald-100 text-emerald-800'
                              : entryYield >= 80
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-rose-100 text-rose-800'
                          } print:border print:border-black print:bg-white print:text-black`}
                        >
                          {fmt(entryYield, 1)}%
                        </span>
                      </td>

                      <td className="px-3 py-2 text-slate-600 max-w-[180px] truncate text-xs print:text-black">
                        {e.remarks || '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Summary Footer with highlighted PCS and MT */}
        <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs flex flex-wrap items-center justify-between font-bold text-slate-800 print:bg-slate-100 print:border-black gap-2">
          <div>
            Total Shift Logs: <span className="font-mono">{filteredEntries.length}</span> entries
          </div>
          <div className="flex flex-wrap items-center gap-3 font-mono">
            <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-indigo-100 text-indigo-950 font-black text-xs sm:text-sm border border-indigo-300 print:border-black print:bg-white print:text-black">
              TOTAL: {fmt(metrics.outputPcs, 0)} PCS
            </span>
            <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-950 font-black text-xs sm:text-sm border border-emerald-300 print:border-black print:bg-white print:text-black">
              TOTAL: {fmt(metrics.outputMt)} MT
            </span>
            <span className="text-blue-700 font-semibold">Length: {fmt(metrics.outputMtr)} MTR</span>
            <span className="text-rose-600 font-semibold">Rej: {fmt(metrics.rejMtr)} MTR</span>
            <span className="text-emerald-700 font-semibold">Prime: {fmt(metrics.netMtr)} MTR</span>
            <span className="text-indigo-700 font-semibold">Yield: {fmt(metrics.yieldPct, 1)}%</span>
          </div>
        </div>
      </div>

      {/* Formal 4-Part Shop Floor Shift Sign-Off Block */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs print:border-black print:shadow-none break-inside-avoid">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-4 print:text-black">
          Shop Floor Shift Verification & Authorization Sign-Off ({activeWcConfig.label})
        </h3>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 text-xs">
          <div className="rounded-lg border border-slate-200 p-3 bg-slate-50/50 print:bg-white print:border-black">
            <div className="font-bold text-slate-800 print:text-black">Machine Operator</div>
            <div className="text-[11px] text-slate-500 mb-8 print:text-black">{activeWcConfig.shortLabel} Line Operator</div>
            <div className="border-t border-dashed border-slate-300 pt-1 text-[11px] text-slate-400 print:text-black print:border-black">
              Signature & Employee ID
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-3 bg-slate-50/50 print:bg-white print:border-black">
            <div className="font-bold text-slate-800 print:text-black">Shift In-Charge</div>
            <div className="text-[11px] text-slate-500 mb-8 print:text-black">Work Center Shift Supervisor</div>
            <div className="border-t border-dashed border-slate-300 pt-1 text-[11px] text-slate-400 print:text-black print:border-black">
              Signature & Date
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-3 bg-slate-50/50 print:bg-white print:border-black">
            <div className="font-bold text-slate-800 print:text-black">Quality & NDT Inspector</div>
            <div className="text-[11px] text-slate-500 mb-8 print:text-black">QA / Metallurgical Lab</div>
            <div className="border-t border-dashed border-slate-300 pt-1 text-[11px] text-slate-400 print:text-black print:border-black">
              Signature & Clearance Stamp
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-3 bg-slate-50/50 print:bg-white print:border-black">
            <div className="font-bold text-slate-800 print:text-black">Department Head</div>
            <div className="text-[11px] text-slate-500 mb-8 print:text-black">Production Manager / GM Works</div>
            <div className="border-t border-dashed border-slate-300 pt-1 text-[11px] text-slate-400 print:text-black print:border-black">
              Signature & Approval
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
