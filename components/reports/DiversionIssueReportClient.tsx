'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Printer,
  Search,
  RefreshCw,
  Download,
  Shuffle,
  ArrowRight,
  X,
  FileText,
  BadgeCheck,
  Building2,
  Calendar,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

export type DiversionPlanItem = {
  id: string;
  source_wo_id: string;
  source_wo_no: string;
  source_customer: string;
  source_grade: string;
  source_size: string;
  target_wo_id: string;
  target_wo_no: string;
  target_customer: string;
  target_grade: string;
  target_size: string;
  diverted_qty: number;
  diverted_pcs: number;
  diverted_mt: number;
  work_center: string;
  work_center_name: string;
  route_id: string;
  route_code: string;
  route_name: string;
  multiple: number;
  reason: string;
  approved_by: string;
  diversion_date: string;
  created_at: string;
  updated_at?: string;
  can_modify: boolean;
};

const WORK_CENTER_LABELS: Record<string, { label: string; color: string }> = {
  ROLLING: { label: 'Hot Rolling Mill', color: 'bg-amber-100 text-amber-800 border-amber-200' },
  HOLLOW_HEAT_TREATMENT: { label: 'Hollow Heat Treatment', color: 'bg-orange-100 text-orange-800 border-orange-200' },
  DRAW: { label: 'Cold Draw Bench', color: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  HEAT_TREATMENT: { label: 'Final Heat Treatment', color: 'bg-rose-100 text-rose-800 border-rose-200' },
  FINISHING: { label: 'Finishing & Inspection', color: 'bg-teal-100 text-teal-800 border-teal-200' },
};

const fmt = (n: number | null | undefined, digits = 2) =>
  n == null ? '—' : Number(n).toLocaleString(undefined, { maximumFractionDigits: digits });

export default function DiversionIssueReportClient() {
  const [plans, setPlans] = useState<DiversionPlanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [workCenterFilter, setWorkCenterFilter] = useState('ALL');
  const [routeFilter, setRouteFilter] = useState('ALL');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [routes, setRoutes] = useState<{ id: string; route_code: string; route_name: string }[]>([]);

  const [selectedPlanForSlip, setSelectedPlanForSlip] = useState<DiversionPlanItem | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const s = createClient();
      const [divRes, routesRes] = await Promise.all([
        s.rpc('get_diversion_plans', {
          p_search: search.trim() || null,
          p_route_code: routeFilter === 'ALL' ? null : routeFilter,
          p_work_center: workCenterFilter === 'ALL' ? null : workCenterFilter,
          p_from_date: fromDate || null,
          p_to_date: toDate || null,
          p_limit: 2000,
          p_offset: 0,
        }),
        s.from('process_routes').select('id,route_code,route_name').eq('active', true).order('route_code'),
      ]);

      if (divRes.error) throw divRes.error;
      setPlans((divRes.data ?? []) as DiversionPlanItem[]);

      if (routesRes.data) {
        setRoutes(routesRes.data);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load diversion plans.');
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }, [search, routeFilter, workCenterFilter, fromDate, toDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Summary Metrics
  const summary = useMemo(() => {
    let totalMtr = 0;
    let totalPcs = 0;
    let totalMt = 0;
    const stageCounts: Record<string, number> = {};

    plans.forEach((p) => {
      totalMtr += Number(p.diverted_qty || 0);
      totalPcs += Number(p.diverted_pcs || 0);
      totalMt += Number(p.diverted_mt || 0);
      stageCounts[p.work_center] = (stageCounts[p.work_center] || 0) + 1;
    });

    return {
      count: plans.length,
      totalMtr,
      totalPcs,
      totalMt,
      stageCounts,
    };
  }, [plans]);

  const exportCSV = () => {
    if (!plans.length) {
      toast.error('No diversion data to export.');
      return;
    }

    const headers = [
      'Diversion Date',
      'Work Center',
      'Source WO #',
      'Source Customer',
      'Source Grade',
      'Source Size',
      'Target WO #',
      'Target Customer',
      'Target Grade',
      'Target Size',
      'Diverted MTR',
      'Diverted PCS',
      'Diverted MT',
      'Multiple',
      'Route',
      'Reason',
      'Approved By',
    ];

    const rows = plans.map((p) => [
      p.diversion_date,
      p.work_center_name || p.work_center,
      p.source_wo_no,
      `"${(p.source_customer || '').replace(/"/g, '""')}"`,
      p.source_grade || '',
      `"${p.source_size || ''}"`,
      p.target_wo_no,
      `"${(p.target_customer || '').replace(/"/g, '""')}"`,
      p.target_grade || '',
      `"${p.target_size || ''}"`,
      p.diverted_qty ?? 0,
      p.diverted_pcs ?? 0,
      p.diverted_mt ?? 0,
      p.multiple ?? 1,
      p.route_code || '',
      `"${(p.reason || '').replace(/"/g, '""')}"`,
      `"${(p.approved_by || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Material_Diversion_Issue_Schedule_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Diversion plans exported to CSV.');
  };

  return (
    <div className="space-y-6 print:space-y-4 print:p-0">
      {/* Screen Toolbar / Actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-purple-100 px-2.5 py-0.5 text-xs font-bold text-purple-800 border border-purple-200">
              <Shuffle className="h-3.5 w-3.5 text-purple-700" />
              MATERIAL DIVERSION CONTROL
            </span>
            <span className="text-xs font-semibold text-slate-500">Document Ref: STP/PPC/DIV-02 (Rev 03)</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">
            Material Diversion Issue Order & Circulation Report
          </h1>
          <p className="text-xs text-slate-500">
            Official shop floor material transfer authorizations between work orders across rolling, drawing, annealing, and finishing stations.
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
            Print / PDF Circulation Sheet
          </button>
        </div>
      </div>

      {/* Printable Formal Header */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs print:border-black print:p-3 print:shadow-none">
        <div className="flex items-start justify-between border-b border-slate-200 pb-4 print:border-black print:pb-2">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-purple-700 text-white flex items-center justify-center font-black text-lg print:border print:border-black">
              STP
            </div>
            <div>
              <h2 className="text-base font-black uppercase tracking-wide text-slate-900 print:text-black">
                SEAMLESS TUBULAR PRODUCTS LTD.
              </h2>
              <div className="text-xs font-bold text-slate-600 print:text-black">
                Material Transfer & Diversion Control · Production Planning & Control (PPC)
              </div>
              <div className="text-[11px] text-slate-400 print:text-black">
                Material Diversion Issue Authorization & Transfer Memo Schedule
              </div>
            </div>
          </div>

          <div className="text-right text-xs space-y-0.5 print:text-black">
            <div className="font-mono font-bold text-slate-900">DOC: STP/PPC/DIV-02</div>
            <div className="text-slate-500">Rev: 03 · Approved</div>
            <div className="text-slate-500 font-mono">Date: {new Date().toLocaleDateString('en-GB')}</div>
            <div className="text-slate-500">Status: Legally Authorized</div>
          </div>
        </div>

        {/* Filter controls (hidden when printing) */}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-5 print:hidden">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Search WO # / Reason / Approver
            </label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search orders, approver..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-hidden"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Transferred Work Center
            </label>
            <select
              value={workCenterFilter}
              onChange={(e) => setWorkCenterFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-hidden"
            >
              <option value="ALL">All Work Centers</option>
              <option value="ROLLING">Hot Rolling Mill</option>
              <option value="HOLLOW_HEAT_TREATMENT">Hollow Heat Treatment</option>
              <option value="DRAW">Cold Draw Bench</option>
              <option value="HEAT_TREATMENT">Final Heat Treatment</option>
              <option value="FINISHING">Finishing & Inspection</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Process Route
            </label>
            <select
              value={routeFilter}
              onChange={(e) => setRouteFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-hidden"
            >
              <option value="ALL">All Process Routes</option>
              {routes.map((r) => (
                <option key={r.id} value={r.route_code}>
                  {r.route_code} — {r.route_name}
                </option>
              ))}
            </select>
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

        {/* Summary Metric KPI Badges - Focus on PCS and MT */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 border-t border-slate-100 pt-4 print:border-black print:pt-2">
          <div className="rounded-xl bg-slate-50 p-3 border border-slate-200 print:bg-white print:border-black">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 print:text-black">
              Total Diversion Orders
            </span>
            <span className="text-lg font-black text-slate-900 font-mono print:text-black">{summary.count}</span>
            <span className="text-[10px] text-purple-600 block print:hidden">PPC Authorized Transfers</span>
          </div>

          {/* Primary Focus Card 1: Total Diverted Pieces (PCS) */}
          <div className="rounded-xl bg-indigo-50/50 p-3 border-2 border-indigo-200 shadow-2xs print:bg-white print:border-black">
            <span className="block text-[10px] font-black uppercase tracking-wider text-indigo-900 print:text-black">
              Total Diverted Pieces (PCS) ★
            </span>
            <div className="mt-1">
              <span className="inline-block px-2.5 py-0.5 rounded-md text-base sm:text-lg font-black font-mono bg-indigo-100 text-indigo-950 border border-indigo-300 print:border-black print:bg-white print:text-black">
                {fmt(summary.totalPcs, 0)} PCS
              </span>
            </div>
            <span className="text-[10px] text-indigo-700 block font-semibold mt-1 print:text-black">
              Total Mother Hollows / Tubes
            </span>
          </div>

          {/* Primary Focus Card 2: Total Diverted Tonnage (MT) */}
          <div className="rounded-xl bg-emerald-50/50 p-3 border-2 border-emerald-200 shadow-2xs print:bg-white print:border-black">
            <span className="block text-[10px] font-black uppercase tracking-wider text-emerald-900 print:text-black">
              Total Diverted Tonnage (MT) ★
            </span>
            <div className="mt-1">
              <span className="inline-block px-2.5 py-0.5 rounded-md text-base sm:text-lg font-black font-mono bg-emerald-100 text-emerald-950 border border-emerald-300 print:border-black print:bg-white print:text-black">
                {fmt(summary.totalMt)} MT
              </span>
            </div>
            <span className="text-[10px] text-emerald-700 block font-semibold mt-1 print:text-black">
              Total Weight Diverted
            </span>
          </div>

          <div className="rounded-xl bg-slate-50 p-3 border border-slate-200 print:bg-white print:border-black">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 print:text-black">
              Total Diverted Meters
            </span>
            <span className="text-lg font-black text-purple-700 font-mono print:text-black">{fmt(summary.totalMtr)} MTR</span>
            <span className="text-[10px] text-slate-500 block mt-1">Linear transfer schedule</span>
          </div>
        </div>
      </div>

      {/* Diversions Schedule Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden print:border-black print:shadow-none">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-100/90 font-bold uppercase tracking-wider text-slate-700 print:bg-slate-200 print:border-black print:text-black">
                <th className="px-3 py-2.5 whitespace-nowrap">Issue Date</th>
                <th className="px-3 py-2.5 whitespace-nowrap">Transfer Work Center</th>
                <th className="px-3 py-2.5">Source Work Order (From)</th>
                <th className="px-3 py-2.5">Target Work Order (To)</th>

                {/* Primary Focus Columns: PCS and MT */}
                <th className="px-3 py-2.5 text-right whitespace-nowrap font-black text-indigo-950 bg-indigo-100/90 border-l border-indigo-300 print:border-black print:bg-white print:text-black">
                  DIVERTED PCS ★
                </th>
                <th className="px-3 py-2.5 text-right whitespace-nowrap font-black text-emerald-950 bg-emerald-100/90 border-r border-emerald-300 print:border-black print:bg-white print:text-black">
                  WEIGHT (MT) ★
                </th>

                <th className="px-3 py-2.5 text-right whitespace-nowrap">Diverted MTR</th>
                <th className="px-3 py-2.5 text-center whitespace-nowrap">Mult</th>
                <th className="px-3 py-2.5">Technical Reason</th>
                <th className="px-3 py-2.5 whitespace-nowrap">Approved By</th>
                <th className="px-3 py-2.5 text-center whitespace-nowrap print:hidden">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 print:divide-black">
              {loading ? (
                <tr>
                  <td colSpan={11} className="p-8 text-center text-slate-500">
                    <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-purple-600" />
                    Loading material diversion orders...
                  </td>
                </tr>
              ) : plans.length === 0 ? (
                <tr>
                  <td colSpan={11} className="p-8 text-center text-slate-500">
                    No material diversion orders found for the selected criteria.
                  </td>
                </tr>
              ) : (
                plans.map((p) => {
                  const wcCfg = WORK_CENTER_LABELS[p.work_center] || {
                    label: p.work_center_name || p.work_center,
                    color: 'bg-slate-100 text-slate-800 border-slate-200',
                  };

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/50 print:text-black">
                      <td className="px-3 py-2 font-mono whitespace-nowrap font-medium text-slate-900 print:text-black">
                        {p.diversion_date}
                      </td>

                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={`inline-block rounded-md border px-2 py-0.5 text-[11px] font-bold ${wcCfg.color} print:border-black print:text-black`}>
                          {wcCfg.label}
                        </span>
                      </td>

                      <td className="px-3 py-2">
                        <div className="font-bold text-rose-800 font-mono print:text-black">{p.source_wo_no}</div>
                        <div className="text-[11px] text-slate-700 print:text-black font-semibold">{p.source_customer || 'Standard Stock'}</div>
                        <div className="text-[10px] text-slate-500 print:text-black font-mono">
                          {p.source_size} · {p.source_grade}
                        </div>
                      </td>

                      <td className="px-3 py-2">
                        <div className="font-bold text-emerald-800 font-mono print:text-black">{p.target_wo_no}</div>
                        <div className="text-[11px] text-slate-700 print:text-black font-semibold">{p.target_customer || 'Standard Stock'}</div>
                        <div className="text-[10px] text-slate-500 print:text-black font-mono">
                          {p.target_size} · {p.target_grade}
                        </div>
                      </td>

                      {/* Primary Focus Cells: Diverted Pcs (Highlighted, Bold) */}
                      <td className="px-3 py-2 text-right font-mono bg-indigo-50/60 border-l border-indigo-200 print:bg-white print:border-black">
                        <span className="inline-block px-2 py-0.5 rounded-md font-black text-xs sm:text-sm text-indigo-950 bg-indigo-100/90 border border-indigo-300 print:bg-white print:border-black print:text-black">
                          {fmt(p.diverted_pcs, 0)}
                        </span>
                      </td>

                      {/* Primary Focus Cells: Weight MT (Highlighted, Bold) */}
                      <td className="px-3 py-2 text-right font-mono bg-emerald-50/60 border-r border-emerald-200 print:bg-white print:border-black">
                        <span className="inline-block px-2 py-0.5 rounded-md font-black text-xs sm:text-sm text-emerald-950 bg-emerald-100/90 border border-emerald-300 print:bg-white print:border-black print:text-black">
                          {fmt(p.diverted_mt)}
                        </span>
                      </td>

                      <td className="px-3 py-2 text-right font-mono font-bold text-purple-700 print:text-black">
                        {fmt(p.diverted_qty)}
                      </td>

                      <td className="px-3 py-2 text-center font-mono text-slate-600 print:text-black">
                        {p.multiple || 1}
                      </td>

                      <td className="px-3 py-2 max-w-[200px]">
                        <div className="text-slate-800 text-xs line-clamp-2 print:line-clamp-none print:text-black font-medium">
                          {p.reason || 'Compatibility allocation'}
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono block print:hidden">
                          Route: {p.route_code}
                        </span>
                      </td>

                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="font-semibold text-slate-800 print:text-black">{p.approved_by || 'PPC Authorization'}</span>
                      </td>

                      <td className="px-3 py-2 text-center whitespace-nowrap print:hidden">
                        <button
                          type="button"
                          onClick={() => setSelectedPlanForSlip(p)}
                          className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-purple-700 hover:bg-purple-50 transition cursor-pointer"
                        >
                          Transfer Memo
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer with highlighted PCS and MT */}
        <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs flex flex-wrap items-center justify-between font-bold text-slate-800 print:bg-slate-100 print:border-black gap-2">
          <div>
            Total Material Diversions: <span className="font-mono">{plans.length}</span> orders
          </div>
          <div className="flex flex-wrap items-center gap-3 font-mono">
            <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-indigo-100 text-indigo-950 font-black text-xs sm:text-sm border border-indigo-300 print:border-black print:bg-white print:text-black">
              TOTAL: {fmt(summary.totalPcs, 0)} PCS
            </span>
            <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-950 font-black text-xs sm:text-sm border border-emerald-300 print:border-black print:bg-white print:text-black">
              TOTAL: {fmt(summary.totalMt)} MT
            </span>
            <span className="text-purple-700 font-semibold">Total Length: {fmt(summary.totalMtr)} MTR</span>
          </div>
        </div>
      </div>

      {/* Formal Shop Floor Circulation Sign-Off Block */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs print:border-black print:shadow-none break-inside-avoid">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-4 print:text-black">
          Material Handover & Takeover Shop Floor Sign-Off
        </h3>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 text-xs">
          <div className="rounded-lg border border-slate-200 p-3 bg-slate-50/50 print:bg-white print:border-black">
            <div className="font-bold text-slate-800 print:text-black">Transfer Initiated By</div>
            <div className="text-[11px] text-slate-500 mb-8 print:text-black">PPC Production Planning</div>
            <div className="border-t border-dashed border-slate-300 pt-1 text-[11px] text-slate-400 print:text-black print:border-black">
              Signature & Date
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-3 bg-slate-50/50 print:bg-white print:border-black">
            <div className="font-bold text-slate-800 print:text-black">Material Released By</div>
            <div className="text-[11px] text-slate-500 mb-8 print:text-black">Source Station Supervisor</div>
            <div className="border-t border-dashed border-slate-300 pt-1 text-[11px] text-slate-400 print:text-black print:border-black">
              Signature & Date
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-3 bg-slate-50/50 print:bg-white print:border-black">
            <div className="font-bold text-slate-800 print:text-black">Material Received By</div>
            <div className="text-[11px] text-slate-500 mb-8 print:text-black">Target Station Supervisor</div>
            <div className="border-t border-dashed border-slate-300 pt-1 text-[11px] text-slate-400 print:text-black print:border-black">
              Signature & Date
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-3 bg-slate-50/50 print:bg-white print:border-black">
            <div className="font-bold text-slate-800 print:text-black">QA Metallurgical Clearance</div>
            <div className="text-[11px] text-slate-500 mb-8 print:text-black">Quality Assurance & Lab</div>
            <div className="border-t border-dashed border-slate-300 pt-1 text-[11px] text-slate-400 print:text-black print:border-black">
              Signature & Date
            </div>
          </div>
        </div>
      </div>

      {/* Individual Transfer Memo Modal */}
      {selectedPlanForSlip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 print:p-0 print:static print:bg-white">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 print:border-black print:shadow-none print:p-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 print:hidden">
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-purple-100 text-purple-800 px-2 py-0.5 text-xs font-bold">
                  MATERIAL TRANSFER MEMO
                </span>
                <span className="font-mono font-bold text-slate-900">
                  {selectedPlanForSlip.source_wo_no} → {selectedPlanForSlip.target_wo_no}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPlanForSlip(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Memo Content */}
            <div className="mt-4 space-y-4 text-xs">
              <div className="flex items-start justify-between border-b border-slate-200 pb-3 print:border-black">
                <div>
                  <h4 className="font-black text-sm uppercase text-slate-900">
                    MATERIAL DIVERSION & INTER-ORDER TRANSFER MEMO
                  </h4>
                  <div className="text-slate-500">Seamless Tubular Products Ltd. · Shop Floor Circulation Slip</div>
                </div>
                <div className="text-right font-mono">
                  <div className="font-bold text-slate-900">DATE: {selectedPlanForSlip.diversion_date}</div>
                  <div className="text-slate-500">Station: {selectedPlanForSlip.work_center_name || selectedPlanForSlip.work_center}</div>
                </div>
              </div>

              {/* Source & Target Comparison */}
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-3 print:bg-white print:border-black">
                  <div className="text-xs font-bold text-rose-900 uppercase tracking-wider mb-2">
                    Source Work Order (Debit)
                  </div>
                  <div className="space-y-1">
                    <div>
                      <span className="text-slate-500">WO Number: </span>
                      <span className="font-mono font-bold text-slate-900">{selectedPlanForSlip.source_wo_no}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Customer: </span>
                      <span className="font-semibold text-slate-800">{selectedPlanForSlip.source_customer || 'Standard Stock'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Grade / Size: </span>
                      <span className="font-mono text-slate-800">{selectedPlanForSlip.source_grade} · {selectedPlanForSlip.source_size}</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 print:bg-white print:border-black">
                  <div className="text-xs font-bold text-emerald-900 uppercase tracking-wider mb-2">
                    Target Work Order (Credit)
                  </div>
                  <div className="space-y-1">
                    <div>
                      <span className="text-slate-500">WO Number: </span>
                      <span className="font-mono font-bold text-slate-900">{selectedPlanForSlip.target_wo_no}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Customer: </span>
                      <span className="font-semibold text-slate-800">{selectedPlanForSlip.target_customer || 'Standard Stock'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Grade / Size: </span>
                      <span className="font-mono text-slate-800">{selectedPlanForSlip.target_grade} · {selectedPlanForSlip.target_size}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Transferred Quantities - Focus on PCS and MT */}
              <div className="grid grid-cols-4 gap-3 rounded-lg border border-slate-200 p-3 bg-slate-50 print:bg-white print:border-black font-mono text-center">
                <div className="rounded-md bg-indigo-50 border border-indigo-200 p-2 print:bg-white print:border-black">
                  <span className="text-indigo-900 text-[10px] block uppercase font-bold print:text-black">Transferred Pcs ★</span>
                  <span className="text-lg font-black text-indigo-950 print:text-black">{fmt(selectedPlanForSlip.diverted_pcs, 0)} PCS</span>
                </div>
                <div className="rounded-md bg-emerald-50 border border-emerald-200 p-2 print:bg-white print:border-black">
                  <span className="text-emerald-900 text-[10px] block uppercase font-bold print:text-black">Transferred MT ★</span>
                  <span className="text-lg font-black text-emerald-950 print:text-black">{fmt(selectedPlanForSlip.diverted_mt)} MT</span>
                </div>
                <div className="rounded-md bg-white border border-slate-200 p-2 print:bg-white print:border-black">
                  <span className="text-slate-500 text-[10px] block uppercase font-bold">Transferred MTR</span>
                  <span className="text-base font-black text-purple-700">{fmt(selectedPlanForSlip.diverted_qty)} M</span>
                </div>
                <div className="rounded-md bg-white border border-slate-200 p-2 print:bg-white print:border-black">
                  <span className="text-slate-500 text-[10px] block uppercase font-bold">Multiple Ratio</span>
                  <span className="text-base font-black text-slate-900">{selectedPlanForSlip.multiple || 1}</span>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 p-3 bg-white print:border-black">
                <span className="text-slate-500 block text-[11px] font-bold uppercase mb-1">
                  Reason & Engineering Justification:
                </span>
                <p className="text-slate-800 text-xs font-medium">
                  {selectedPlanForSlip.reason || 'Immediate delivery prioritization / compatible steel chemistry.'}
                </p>
                <div className="mt-2 text-[11px] text-slate-500 font-mono">
                  Authorized By: <span className="font-bold text-slate-900">{selectedPlanForSlip.approved_by || 'PPC In-Charge'}</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 pt-3 border-t border-slate-200 print:border-black">
                <div>
                  <div className="text-slate-500 text-[10px]">Material Handover (Source):</div>
                  <div className="border-b border-slate-300 mt-6 print:border-black"></div>
                </div>
                <div>
                  <div className="text-slate-500 text-[10px]">Material Takeover (Target):</div>
                  <div className="border-b border-slate-300 mt-6 print:border-black"></div>
                </div>
                <div>
                  <div className="text-slate-500 text-[10px]">QA Inspector Clearance:</div>
                  <div className="border-b border-slate-300 mt-6 print:border-black"></div>
                </div>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2 print:hidden border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setSelectedPlanForSlip(null)}
                className="rounded-lg border border-slate-300 px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-blue-500 transition cursor-pointer"
              >
                <Printer className="h-3.5 w-3.5" />
                Print Transfer Memo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
