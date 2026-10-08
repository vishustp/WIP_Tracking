// components/reports/SalvageRejectionReportClient.tsx
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Printer,
  Download,
  Search,
  RefreshCw,
  AlertTriangle,
  Factory,
  CheckCircle2,
  Calendar,
  X,
  FileSpreadsheet,
  Building2,
  Clock,
  ShieldCheck,
  TrendingDown,
  Info,
  PlusCircle,
  ExternalLink,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { RejectionDeclaration } from '@/types';
import {
  REJECTION_REASON_CATEGORIES,
  REJECTION_REASON_LABELS,
  REJECTION_STATUS_BADGES,
  REJECTION_STATUS_LABELS,
  WORK_CENTER_OPTIONS,
  generateRejectionReportCsv,
} from '@/lib/rejections/types';
import { fetchRejections } from '@/lib/rejections/client';
import DeclareRejectionModal from '@/components/rejections/DeclareRejectionModal';

const WORK_CENTER_COLOR_MAP: Record<string, string> = {
  ROLLING: 'bg-orange-100 text-orange-800 border-orange-200',
  HOLLOW_HEAT_TREATMENT: 'bg-amber-100 text-amber-800 border-amber-200',
  DRAW: 'bg-blue-100 text-blue-800 border-blue-200',
  PILGER: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  HEAT_TREATMENT: 'bg-rose-100 text-rose-800 border-rose-200',
  BAND_SAW: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  VDI: 'bg-purple-100 text-purple-800 border-purple-200',
  FINISHING: 'bg-emerald-100 text-emerald-800 border-emerald-200',
};

const fmt = (n: number | null | undefined, digits = 2) =>
  n == null ? '—' : Number(n).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });

export default function SalvageRejectionReportClient() {
  const [records, setRecords] = useState<RejectionDeclaration[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [declareModalOpen, setDeclareModalOpen] = useState(false);
  const [workCenter, setWorkCenter] = useState('ALL');
  const [status, setStatus] = useState('ALL');
  const [reasonCategory, setReasonCategory] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data, error } = await fetchRejections({
      workCenter: workCenter === 'ALL' ? undefined : workCenter,
      status: status === 'ALL' ? undefined : status,
      reasonCategory: reasonCategory === 'ALL' ? undefined : reasonCategory,
      search: searchQuery.trim() || undefined,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
    });

    if (error) {
      toast.error(`Failed to load salvage records: ${error}`);
    } else {
      setRecords(data);
    }
    setLoading(false);
  }, [workCenter, status, reasonCategory, searchQuery, fromDate, toDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Aggregated KPIs
  const summary = useMemo(() => {
    let totalDeclaredPcs = 0;
    let totalDeclaredMtr = 0;
    let totalDeclaredMt = 0;

    let totalApprovedPcs = 0;
    let totalApprovedMtr = 0;
    let totalApprovedMt = 0;

    let pendingQcCount = 0;
    let pendingPpcCount = 0;

    const causeDistribution: Record<string, { pcs: number; mt: number; count: number }> = {};
    const stageDistribution: Record<string, { pcs: number; mt: number }> = {};

    records.forEach((r) => {
      totalDeclaredPcs += Number(r.rejected_pcs || 0);
      totalDeclaredMtr += Number(r.rejected_mtr || 0);
      totalDeclaredMt += Number(r.rejected_mt || 0);

      if (r.status === 'APPROVED') {
        totalApprovedPcs += Number(r.ppc_approved_pcs ?? r.rejected_pcs ?? 0);
        totalApprovedMtr += Number(r.ppc_approved_mtr ?? r.rejected_mtr ?? 0);
        totalApprovedMt += Number(r.ppc_approved_mt ?? r.rejected_mt ?? 0);
      } else if (r.status === 'PENDING_QC') {
        pendingQcCount++;
      } else if (r.status === 'PENDING_PPC') {
        pendingPpcCount++;
      }

      // Cause breakdown
      const c = r.reason_category;
      if (!causeDistribution[c]) {
        causeDistribution[c] = { pcs: 0, mt: 0, count: 0 };
      }
      causeDistribution[c].pcs += Number(r.rejected_pcs || 0);
      causeDistribution[c].mt += Number(r.rejected_mt || 0);
      causeDistribution[c].count++;

      // Stage breakdown
      const wc = r.work_center;
      if (!stageDistribution[wc]) {
        stageDistribution[wc] = { pcs: 0, mt: 0 };
      }
      stageDistribution[wc].pcs += Number(r.rejected_pcs || 0);
      stageDistribution[wc].mt += Number(r.rejected_mt || 0);
    });

    return {
      totalDeclaredPcs,
      totalDeclaredMtr,
      totalDeclaredMt,
      totalApprovedPcs,
      totalApprovedMtr,
      totalApprovedMt,
      pendingQcCount,
      pendingPpcCount,
      causeDistribution,
      stageDistribution,
    };
  }, [records]);

  // CSV Export handler
  const handleExportCsv = () => {
    if (records.length === 0) {
      toast.error('No records available to export.');
      return;
    }
    const csvData = generateRejectionReportCsv(records);
    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Mill_Salvage_Rejection_Report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Salvage & Rejection report exported to CSV.');
  };

  const handlePrint = () => {
    window.print();
  };

  // Preset Date range helpers
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

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto p-4 sm:p-6 lg:p-8 print:p-0 print:max-w-none">
      {/* Mill Print Header (Visible in print mode only) */}
      <div className="hidden print:block border-b-2 border-slate-900 pb-4 mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-950 uppercase">
              SEAMLESS STEEL PIPE MANUFACTURING MILL
            </h1>
            <h2 className="text-sm font-semibold text-slate-700 tracking-wider mt-0.5">
              OFFICIAL SECOND & SALVAGE MATERIAL DECLARATION REPORT
            </h2>
            <div className="text-xs text-slate-500 mt-1 font-mono">
              ISO 9001:2015 & IBR Quality Audit Record • Document No: QAD-SALVAGE-01
            </div>
          </div>
          <div className="text-right text-xs font-mono text-slate-600">
            <div>Printed On: {new Date().toLocaleString()}</div>
            <div>Work Center Filter: {workCenter}</div>
            <div>Status Filter: {status}</div>
          </div>
        </div>
      </div>

      {/* Screen Title & Top Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 print:hidden">
        <div>
          <div className="flex items-center space-x-2">
            <span className="p-2 bg-rose-100 text-rose-800 rounded-lg">
              <AlertTriangle className="w-6 h-6" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                Second Declaration Report
              </h1>
              <p className="text-sm text-slate-500">
                Plant-wide audit ledger of second declarations, QC inspections, PPC write-offs, and remarks
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setDeclareModalOpen(true)}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 active:bg-amber-800 rounded-lg shadow-sm transition-colors cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Declare Second</span>
          </button>

          <Link
            href="/rejections"
            className="inline-flex items-center space-x-1.5 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 shadow-sm cursor-pointer"
            title="Open Operations Console"
          >
            <ExternalLink className="w-4 h-4 text-slate-500" />
            <span className="hidden sm:inline">Operations Board</span>
          </Link>

          <button
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center space-x-1.5 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 shadow-sm cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={handleExportCsv}
            disabled={records.length === 0}
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

      {/* Analytical Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 print:grid-cols-4">
        {/* Total Declared Loss */}
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Material Declared</div>
          <div className="text-2xl font-bold text-slate-900 font-mono mt-1">
            {summary.totalDeclaredPcs} <span className="text-sm font-normal text-slate-500">PCS</span>
          </div>
          <div className="text-xs text-slate-600 font-mono mt-0.5">
            {fmt(summary.totalDeclaredMtr, 1)}m · {fmt(summary.totalDeclaredMt, 3)} MT
          </div>
        </div>

        {/* Total Approved Deducted */}
        <div className="p-4 bg-white border border-emerald-200 rounded-xl shadow-sm bg-emerald-50/20">
          <div className="text-xs font-semibold uppercase tracking-wider text-emerald-800">PPC Approved & Deducted</div>
          <div className="text-2xl font-bold text-emerald-900 font-mono mt-1">
            {summary.totalApprovedPcs} <span className="text-sm font-normal text-slate-500">PCS</span>
          </div>
          <div className="text-xs text-emerald-700 font-mono mt-0.5">
            {fmt(summary.totalApprovedMtr, 1)}m · {fmt(summary.totalApprovedMt, 3)} MT written off
          </div>
        </div>

        {/* Pending In Pipeline */}
        <div className="p-4 bg-white border border-amber-200 rounded-xl shadow-sm bg-amber-50/20">
          <div className="text-xs font-semibold uppercase tracking-wider text-amber-800">Pending Review Queue</div>
          <div className="text-2xl font-bold text-slate-900 font-mono mt-1">
            {summary.pendingQcCount + summary.pendingPpcCount} <span className="text-sm font-normal text-slate-500">Items</span>
          </div>
          <div className="text-xs text-amber-700 mt-0.5 font-medium">
            {summary.pendingQcCount} QC • {summary.pendingPpcCount} PPC
          </div>
        </div>

        {/* Rejection Rate Indicator */}
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Records Logged</div>
          <div className="text-2xl font-bold text-slate-900 font-mono mt-1">
            {records.length} <span className="text-sm font-normal text-slate-500">Declarations</span>
          </div>
          <div className="text-xs text-slate-500 mt-0.5">Across all process routes</div>
        </div>
      </div>

      {/* Filter Toolbar (Hidden in print) */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3 print:hidden">
        {/* Preset date buttons */}
        <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-slate-100">
          <div className="flex items-center space-x-1.5 text-xs text-slate-600">
            <span className="font-semibold">Quick Date:</span>
            <button
              onClick={() => applyPreset('TODAY')}
              className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium"
            >
              Today
            </button>
            <button
              onClick={() => applyPreset('WEEK')}
              className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium"
            >
              Last 7 Days
            </button>
            <button
              onClick={() => applyPreset('MONTH')}
              className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium"
            >
              Last 30 Days
            </button>
            <button
              onClick={() => applyPreset('ALL')}
              className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium"
            >
              All Time
            </button>
          </div>

          {(workCenter !== 'ALL' || status !== 'ALL' || reasonCategory !== 'ALL' || searchQuery || fromDate || toDate) && (
            <button
              onClick={() => {
                setWorkCenter('ALL');
                setStatus('ALL');
                setReasonCategory('ALL');
                setSearchQuery('');
                setFromDate('');
                setToDate('');
              }}
              className="text-xs text-rose-600 hover:text-rose-800 font-medium underline flex items-center space-x-1"
            >
              <X className="w-3.5 h-3.5" />
              <span>Reset All Filters</span>
            </button>
          )}
        </div>

        {/* Filter controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search WO#, customer, REJ#..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Work Center */}
          <div>
            <select
              value={workCenter}
              onChange={(e) => setWorkCenter(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500"
            >
              {WORK_CENTER_OPTIONS.map((wc) => (
                <option key={wc.code} value={wc.code}>
                  {wc.label}
                </option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="APPROVED">Approved Only (WIP Deducted)</option>
              <option value="PENDING_QC">Pending QC Verification</option>
              <option value="PENDING_PPC">Pending PPC Approval</option>
              <option value="REJECTED_BY_QC">Rejected by QC</option>
              <option value="REJECTED_BY_PPC">Rejected by PPC</option>
            </select>
          </div>

          {/* Reason Category */}
          <div>
            <select
              value={reasonCategory}
              onChange={(e) => setReasonCategory(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">All Defect Reasons</option>
              {REJECTION_REASON_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {REJECTION_REASON_LABELS[c]}
                </option>
              ))}
            </select>
          </div>

          {/* Date Range Inputs */}
          <div className="flex items-center space-x-1">
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-1/2 px-2 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:bg-white"
              title="From Date"
            />
            <span className="text-slate-400 text-xs">-</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-1/2 px-2 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:bg-white"
              title="To Date"
            />
          </div>
        </div>
      </div>

      {/* Main Report Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden print:border-none print:shadow-none">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs print:text-[10px]">
            <thead>
              <tr className="bg-slate-100/90 border-b border-slate-200 text-[11px] print:text-[9px] font-bold uppercase tracking-wider text-slate-700">
                <th className="py-2.5 px-3">Declaration #</th>
                <th className="py-2.5 px-2.5">Date</th>
                <th className="py-2.5 px-2.5">Stage</th>
                <th className="py-2.5 px-2.5">Work Order #</th>
                <th className="py-2.5 px-2.5">Customer & Grade</th>
                <th className="py-2.5 px-2.5">Size (OD×WT)</th>
                <th className="py-2.5 px-2 text-right">Declared (PCS/m/MT)</th>
                <th className="py-2.5 px-2 text-right">Approved (PCS/m/MT)</th>
                <th className="py-2.5 px-3">Defect Category</th>
                <th className="py-2.5 px-3">Remarks & Audit Narrative</th>
                <th className="py-2.5 px-2.5 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-500">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-slate-400" />
                    <span>Loading salvage records...</span>
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-500">
                    <AlertTriangle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-semibold text-slate-700">No rejection / salvage records found</p>
                    <p className="text-xs text-slate-400 mt-1">No items match the current filter selection</p>
                  </td>
                </tr>
              ) : (
                records.map((r) => {
                  const badge = REJECTION_STATUS_BADGES[r.status] || {
                    label: r.status,
                    className: 'bg-slate-100 text-slate-700',
                  };
                  const wcColor = WORK_CENTER_COLOR_MAP[r.work_center] || 'bg-slate-100 text-slate-700';

                  return (
                    <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Declaration No */}
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                        {r.declaration_no}
                      </td>

                      {/* Date */}
                      <td className="py-2.5 px-2.5 font-mono text-slate-600 whitespace-nowrap">
                        {r.declared_at.slice(0, 10)}
                      </td>

                      {/* Work Center */}
                      <td className="py-2.5 px-2.5 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${wcColor}`}>
                          {r.work_center}
                        </span>
                      </td>

                      {/* Work Order */}
                      <td className="py-2.5 px-2.5 font-mono font-bold text-blue-800 whitespace-nowrap">
                        {r.work_orders?.work_order_no || '—'}
                      </td>

                      {/* Customer & Grade */}
                      <td className="py-2.5 px-2.5 whitespace-nowrap">
                        <div className="font-medium text-slate-900">{r.work_orders?.customer_name || '—'}</div>
                        <div className="text-[10px] text-slate-500">{r.work_orders?.grade || '—'}</div>
                      </td>

                      {/* Size */}
                      <td className="py-2.5 px-2.5 font-mono text-slate-700 whitespace-nowrap">
                        {r.work_orders?.size_od && r.work_orders?.size_wt
                          ? `${r.work_orders.size_od} × ${r.work_orders.size_wt}`
                          : '—'}
                      </td>

                      {/* Declared */}
                      <td className="py-2.5 px-2 text-right font-mono whitespace-nowrap">
                        <div className="font-bold text-slate-900">{r.rejected_pcs} PCS</div>
                        <div className="text-[10px] text-slate-500">{fmt(r.rejected_mtr, 1)}m · {fmt(r.rejected_mt, 3)}MT</div>
                      </td>

                      {/* Approved */}
                      <td className="py-2.5 px-2 text-right font-mono whitespace-nowrap">
                        {r.status === 'APPROVED' ? (
                          <>
                            <div className="font-bold text-emerald-800">{r.ppc_approved_pcs ?? r.rejected_pcs} PCS</div>
                            <div className="text-[10px] text-emerald-600">
                              {fmt(r.ppc_approved_mtr ?? r.rejected_mtr, 1)}m · {fmt(r.ppc_approved_mt ?? r.rejected_mt, 3)}MT
                            </div>
                          </>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Defect Category */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="font-medium text-slate-800">
                          {REJECTION_REASON_LABELS[r.reason_category] || r.reason_category}
                        </span>
                      </td>

                      {/* Full Remarks & Audit Narrative */}
                      <td className="py-2.5 px-3 max-w-sm">
                        <div className="space-y-1">
                          {/* Production note */}
                          <div className="text-slate-700">
                            <span className="font-semibold text-amber-800">Production [{r.declared_by}]:</span>{' '}
                            <span>{r.production_remarks}</span>
                          </div>

                          {/* QC note */}
                          {r.qc_remarks && (
                            <div className="text-blue-800 text-[11px] bg-blue-50/60 p-1 rounded border border-blue-200/60">
                              <span className="font-semibold">QC [{r.qc_verified_by || 'QC'}]:</span> {r.qc_remarks}
                            </div>
                          )}

                          {/* PPC note */}
                          {r.ppc_remarks && (
                            <div className="text-emerald-800 text-[11px] bg-emerald-50/60 p-1 rounded border border-emerald-200/60">
                              <span className="font-semibold">PPC [{r.ppc_approved_by || 'PPC'}]:</span> {r.ppc_remarks}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-2.5 px-2.5 text-center whitespace-nowrap">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border ${badge.className}`}>
                          {badge.label}
                        </span>
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
          <div className="text-[10px] text-slate-500">Shop Floor Declaration & Handoff</div>
        </div>
        <div className="border-t border-slate-400 pt-2">
          <div className="font-bold">HEAD OF QUALITY CONTROL (QA)</div>
          <div className="text-[10px] text-slate-500">Physical & Metallurgical Verification</div>
        </div>
        <div className="border-t border-slate-400 pt-2">
          <div className="font-bold">PLANT PLANNING & CONTROL (PPC)</div>
          <div className="text-[10px] text-slate-500">WIP Ledger Scrap Write-Off Authorized</div>
        </div>
      </div>

      {/* Declare Rejection Modal */}
      <DeclareRejectionModal
        isOpen={declareModalOpen}
        onClose={() => setDeclareModalOpen(false)}
        onSuccess={() => {
          setDeclareModalOpen(false);
          loadData();
        }}
      />
    </div>
  );
}
