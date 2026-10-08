// components/reports/MillRejectionReportClient.tsx
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Printer,
  Download,
  Search,
  RefreshCw,
  AlertTriangle,
  Flame,
  Wrench,
  Thermometer,
  ShieldAlert,
  ClipboardCheck,
  Building2,
  Calendar,
  X,
  FileSpreadsheet,
  CheckCircle2,
  Layers,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  MillRejectionEntry,
  MillRejectionCategory,
  MillRejectionSummaryKpis,
  CATEGORY_LABELS,
  CATEGORY_COLORS,
  generateMillRejectionCsv,
} from '@/lib/mill-rejections/types';
import { fetchMillRejectionsAndSalvage } from '@/lib/mill-rejections/client';

const fmt = (n: number | null | undefined, digits = 2) =>
  n == null ? '—' : Number(n).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });

export default function MillRejectionReportClient() {
  const [entries, setEntries] = useState<MillRejectionEntry[]>([]);
  const [kpis, setKpis] = useState<MillRejectionSummaryKpis | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [activeCategory, setActiveCategory] = useState<MillRejectionCategory>('ALL');
  const [dispositionFilter, setDispositionFilter] = useState<'ALL' | 'REJECTION' | 'SALVAGE'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data, kpis: summaryKpis, error } = await fetchMillRejectionsAndSalvage({
      category: activeCategory,
      dispositionType: dispositionFilter,
      search: searchQuery.trim() || undefined,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
    });

    if (error) {
      toast.error(`Failed to load mill rejection logs: ${error}`);
    } else {
      setEntries(data);
      setKpis(summaryKpis);
    }
    setLoading(false);
  }, [activeCategory, dispositionFilter, searchQuery, fromDate, toDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // CSV Export
  const handleExportCsv = () => {
    if (entries.length === 0) {
      toast.error('No records available to export.');
      return;
    }
    const csv = generateMillRejectionCsv(entries);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Mill_Shop_Floor_Rejections_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Mill rejection report exported to CSV.');
  };

  const handlePrint = () => {
    window.print();
  };

  const applyPreset = (preset: 'TODAY' | 'WEEK' | 'MONTH' | 'ALL') => {
    const today = new Date().toISOString().slice(0, 10);
    if (preset === 'TODAY') {
      setFromDate(today);
      setToDate(today);
    } else if (preset === 'WEEK') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      setFromDate(d.toISOString().slice(0, 10));
      setToDate(today);
    } else if (preset === 'MONTH') {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      setFromDate(d.toISOString().slice(0, 10));
      setToDate(today);
    } else {
      setFromDate('');
      setToDate('');
    }
  };

  const CATEGORY_TABS: { key: MillRejectionCategory; label: string; icon: any }[] = [
    { key: 'ALL', label: 'All Stations', icon: Layers },
    { key: 'ROLLING', label: 'Rolling', icon: Flame },
    { key: 'DRAW', label: 'Draw Bench', icon: Wrench },
    { key: 'HEAT_TREATMENT', label: 'Heat Treatment', icon: Thermometer },
    { key: 'VDI_SALVAGE', label: 'VDI Salvage', icon: ClipboardCheck },
    { key: 'VDI_REJECTION', label: 'VDI Rejection', icon: ShieldAlert },
  ];

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto p-4 sm:p-6 lg:p-8 print:p-0 print:max-w-none">
      {/* Mill Print Header */}
      <div className="hidden print:block border-b-2 border-slate-900 pb-4 mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-950 uppercase">
              RASHMI STEEL MILL • SEAMLESS PIPE MANUFACTURING
            </h1>
            <h2 className="text-sm font-semibold text-slate-700 tracking-wider mt-0.5">
              SHOP-FLOOR REJECTION & VDI SALVAGE PRODUCTION REPORT
            </h2>
            <div className="text-xs text-slate-500 mt-1 font-mono">
              Aggregated from Operator Daily Shift Logs & QC Inspection Records • ISO 9001:2015 Audit Trail
            </div>
          </div>
          <div className="text-right text-xs font-mono text-slate-600">
            <div>Printed On: {new Date().toLocaleString()}</div>
            <div>Category Filter: {activeCategory}</div>
            <div>Records Count: {entries.length}</div>
          </div>
        </div>
      </div>

      {/* Screen Title & Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 print:hidden">
        <div>
          <div className="flex items-center space-x-2">
            <span className="p-2 bg-rose-100 text-rose-800 rounded-lg">
              <AlertTriangle className="w-6 h-6" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                Mill Rejection & Salvage Report
              </h1>
              <p className="text-sm text-slate-500">
                Shop-floor rejections and VDI salvage logged by operators and QC inspectors across Rolling, Draw, HT, and VDI
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 shadow-sm cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={handleExportCsv}
            disabled={entries.length === 0}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-300 rounded-lg hover:bg-emerald-100 shadow-sm cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={handlePrint}
            className="inline-flex items-center space-x-1.5 px-4 py-2 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-sm cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Print Report</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      {kpis && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 print:grid-cols-6">
          {/* Rolling Rejection */}
          <div className="p-3.5 bg-white border border-orange-200 rounded-xl shadow-xs bg-orange-50/20">
            <div className="flex items-center space-x-1.5 text-xs font-semibold uppercase tracking-wider text-orange-800">
              <Flame className="w-3.5 h-3.5 text-orange-600" />
              <span>Rolling Rej</span>
            </div>
            <div className="text-xl font-bold text-slate-900 font-mono mt-1">
              {kpis.totalRollingPcs} <span className="text-xs font-normal text-slate-500">PCS</span>
            </div>
            <div className="text-[11px] text-slate-500 font-mono mt-0.5">
              {fmt(kpis.totalRollingMt, 3)} MT
            </div>
          </div>

          {/* Draw Bench Rejection */}
          <div className="p-3.5 bg-white border border-blue-200 rounded-xl shadow-xs bg-blue-50/20">
            <div className="flex items-center space-x-1.5 text-xs font-semibold uppercase tracking-wider text-blue-800">
              <Wrench className="w-3.5 h-3.5 text-blue-600" />
              <span>Draw Rej</span>
            </div>
            <div className="text-xl font-bold text-slate-900 font-mono mt-1">
              {kpis.totalDrawPcs} <span className="text-xs font-normal text-slate-500">PCS</span>
            </div>
            <div className="text-[11px] text-slate-500 font-mono mt-0.5">
              {fmt(kpis.totalDrawMt, 3)} MT
            </div>
          </div>

          {/* Heat Treatment Rejection */}
          <div className="p-3.5 bg-white border border-rose-200 rounded-xl shadow-xs bg-rose-50/20">
            <div className="flex items-center space-x-1.5 text-xs font-semibold uppercase tracking-wider text-rose-800">
              <Thermometer className="w-3.5 h-3.5 text-rose-600" />
              <span>HT Rej</span>
            </div>
            <div className="text-xl font-bold text-slate-900 font-mono mt-1">
              {kpis.totalHtPcs} <span className="text-xs font-normal text-slate-500">PCS</span>
            </div>
            <div className="text-[11px] text-slate-500 font-mono mt-0.5">
              {fmt(kpis.totalHtMt, 3)} MT
            </div>
          </div>

          {/* VDI Salvage */}
          <div className="p-3.5 bg-white border border-amber-200 rounded-xl shadow-xs bg-amber-50/20">
            <div className="flex items-center space-x-1.5 text-xs font-semibold uppercase tracking-wider text-amber-800">
              <ClipboardCheck className="w-3.5 h-3.5 text-amber-600" />
              <span>VDI Salvage</span>
            </div>
            <div className="text-xl font-bold text-slate-900 font-mono mt-1">
              {kpis.totalVdiSalvagePcs} <span className="text-xs font-normal text-slate-500">PCS</span>
            </div>
            <div className="text-[11px] text-slate-500 font-mono mt-0.5">
              {fmt(kpis.totalVdiSalvageMt, 3)} MT
            </div>
          </div>

          {/* VDI Rejection */}
          <div className="p-3.5 bg-white border border-red-200 rounded-xl shadow-xs bg-red-50/20">
            <div className="flex items-center space-x-1.5 text-xs font-semibold uppercase tracking-wider text-red-800">
              <ShieldAlert className="w-3.5 h-3.5 text-red-600" />
              <span>VDI Rej</span>
            </div>
            <div className="text-xl font-bold text-slate-900 font-mono mt-1">
              {kpis.totalVdiRejPcs} <span className="text-xs font-normal text-slate-500">PCS</span>
            </div>
            <div className="text-[11px] text-slate-500 font-mono mt-0.5">
              {fmt(kpis.totalVdiRejMt, 3)} MT
            </div>
          </div>

          {/* Grand Total */}
          <div className="p-3.5 bg-white border border-slate-900 rounded-xl shadow-xs bg-slate-900 text-white">
            <div className="flex items-center space-x-1.5 text-xs font-semibold uppercase tracking-wider text-slate-300">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span>Total Defect</span>
            </div>
            <div className="text-xl font-bold text-white font-mono mt-1">
              {kpis.grandTotalPcs} <span className="text-xs font-normal text-slate-400">PCS</span>
            </div>
            <div className="text-[11px] text-slate-300 font-mono mt-0.5">
              {fmt(kpis.grandTotalMtr, 1)}m · {fmt(kpis.grandTotalMt, 3)} MT
            </div>
          </div>
        </div>
      )}

      {/* Filter Tabs & Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-4 print:hidden">
        {/* Category Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-slate-100 pb-3">
          {CATEGORY_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeCategory === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveCategory(tab.key)}
                className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  active
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Filter Inputs Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
            <input
              type="text"
              placeholder="Search WO#, Customer, Grade, Remarks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white"
            />
          </div>

          {/* Disposition Type */}
          <div>
            <select
              value={dispositionFilter}
              onChange={(e) => setDispositionFilter(e.target.value as any)}
              className="w-full py-2 px-3 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white cursor-pointer font-medium"
            >
              <option value="ALL">All Dispositions (Rejection & Salvage)</option>
              <option value="REJECTION">Only Condemned Rejection</option>
              <option value="SALVAGE">Only VDI Salvage</option>
            </select>
          </div>

          {/* Date Range Picker */}
          <div className="flex items-center space-x-1.5 col-span-1 lg:col-span-2">
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="py-1.5 px-2.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:bg-white flex-1"
              title="From Date"
            />
            <span className="text-xs text-slate-400">to</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="py-1.5 px-2.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:bg-white flex-1"
              title="To Date"
            />

            {/* Quick Presets */}
            <div className="flex items-center space-x-1 shrink-0">
              <button
                onClick={() => applyPreset('TODAY')}
                className="px-2 py-1 text-[11px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded cursor-pointer"
              >
                Today
              </button>
              <button
                onClick={() => applyPreset('WEEK')}
                className="px-2 py-1 text-[11px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded cursor-pointer"
              >
                7D
              </button>
              <button
                onClick={() => applyPreset('MONTH')}
                className="px-2 py-1 text-[11px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded cursor-pointer"
              >
                30D
              </button>
              {(fromDate || toDate) && (
                <button
                  onClick={() => applyPreset('ALL')}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
                  title="Clear dates"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Ledger Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-3">Date</th>
                <th className="py-3 px-3">Work Order</th>
                <th className="py-3 px-3">Customer / Grade</th>
                <th className="py-3 px-3">Size (OD × WT)</th>
                <th className="py-3 px-3">Station</th>
                <th className="py-3 px-3">Type</th>
                <th className="py-3 px-3 text-right">PCS</th>
                <th className="py-3 px-3 text-right">Meters</th>
                <th className="py-3 px-3 text-right">MT</th>
                <th className="py-3 px-4 min-w-[280px]">Logged Remarks & Defect Reason</th>
                <th className="py-3 px-3">Logged By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-slate-400" />
                    <span>Loading shop-floor rejection records...</span>
                  </td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-500">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                    <p className="font-semibold text-slate-800">No Rejection or Salvage Records Found</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      No matching rejection entries logged by operators or QC inspectors for the selected filters.
                    </p>
                  </td>
                </tr>
              ) : (
                entries.map((item) => {
                  const catClass = CATEGORY_COLORS[item.category] || CATEGORY_COLORS.OTHER;
                  const isSalvage = item.dispositionType === 'SALVAGE';

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      {/* Date */}
                      <td className="py-2.5 px-3 font-mono font-medium text-slate-700 whitespace-nowrap">
                        {item.date}
                      </td>

                      {/* Work Order */}
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                        {item.workOrderNo}
                      </td>

                      {/* Customer / Grade */}
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-800 max-w-[150px] truncate" title={item.customerName}>
                          {item.customerName}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate" title={item.grade}>
                          {item.grade}
                        </div>
                      </td>

                      {/* Size */}
                      <td className="py-2.5 px-3 font-mono text-slate-700 whitespace-nowrap">
                        {item.sizeOd ? `${item.sizeOd} × ${item.sizeWt}` : '—'}
                      </td>

                      {/* Station */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${catClass}`}>
                          {item.workCenterName}
                        </span>
                      </td>

                      {/* Disposition Type Badge */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            isSalvage
                              ? 'bg-amber-100 text-amber-900 border-amber-300'
                              : 'bg-rose-100 text-rose-900 border-rose-300'
                          }`}
                        >
                          {item.dispositionType}
                        </span>
                      </td>

                      {/* Pieces */}
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                        {item.pcs}
                      </td>

                      {/* Meters */}
                      <td className="py-2.5 px-3 text-right font-mono text-slate-800">
                        {fmt(item.mtr, 1)}
                      </td>

                      {/* Weight MT */}
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                        {fmt(item.mt, 3)}
                      </td>

                      {/* Remarks */}
                      <td className="py-2.5 px-4 text-slate-700">
                        <div className="text-xs font-medium text-slate-800 line-clamp-2" title={item.remarks}>
                          {item.remarks || '—'}
                        </div>
                        {item.heatLotNo && (
                          <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                            Heat/Lot: {item.heatLotNo}
                          </div>
                        )}
                      </td>

                      {/* Logged By */}
                      <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap text-[11px]">
                        {item.loggedBy}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Official Signatory Block for Mill Printouts */}
      <div className="hidden print:grid grid-cols-3 gap-8 pt-12 text-center text-xs text-slate-800">
        <div className="border-t border-slate-400 pt-2">
          <div className="font-bold">PRODUCTION INCHARGE</div>
          <div className="text-[10px] text-slate-500">Shop Floor Daily Production Verified</div>
        </div>
        <div className="border-t border-slate-400 pt-2">
          <div className="font-bold">HEAD OF QUALITY ASSURANCE (QA)</div>
          <div className="text-[10px] text-slate-500">VDI Defect Clearance & Salvage Inspection</div>
        </div>
        <div className="border-t border-slate-400 pt-2">
          <div className="font-bold">PLANT PLANNING & CONTROL (PPC)</div>
          <div className="text-[10px] text-slate-500">Mass Balance & Rejection Ledger Audit</div>
        </div>
      </div>
    </div>
  );
}
