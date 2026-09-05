'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Printer,
  Search,
  RefreshCw,
  Crown,
  Link2,
  ChevronDown,
  ChevronUp,
  Download,
  Flame,
  X,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

export type Plan = {
  id: string;
  plan_no: string;
  work_order_id: string;
  work_order_no: string;
  customer_name: string | null;
  grade: string | null;
  od: number | null;
  wt: number | null;
  l1: number | null;
  l2: number | null;
  avg_length: number | null;
  route_id: string;
  route_code: string;
  route_name: string;
  planned_rolling_date: string;
  planned_mtr: number;
  planned_pcs: number;
  planned_mt: number;
  planned_qty?: number;
  mh_od: number | null;
  mh_wt: number | null;
  mh_l1: number | null;
  mh_l2: number | null;
  pass_required: number;
  multiple: number;
  status: string;
  created_at: string;
  updated_at: string;
  can_modify: boolean;
};

const fmt = (n: number | null | undefined, digits = 2) =>
  n == null ? '—' : Number(n).toLocaleString(undefined, { maximumFractionDigits: digits });

const formatFinalSizeLength = (p: { l1?: number | null; l2?: number | null; avg_length?: number | null }) => {
  const hl1 = Number(p.l1 || 0);
  const hl2 = Number(p.l2 || 0);
  if (hl1 > 0 && hl2 > 0) {
    if (hl1 === hl2) return `L: ${fmt(hl1)} m`;
    return `L: ${fmt(hl1)} - ${fmt(hl2)} m`;
  }
  if (hl1 > 0) return `L: ${fmt(hl1)} m`;
  if (hl2 > 0) return `L: ${fmt(hl2)} m`;
  const avg = Number(p.avg_length || 0);
  if (avg > 0) return `L: ~${fmt(avg)} m (avg)`;
  return null;
};

export default function RollingPlanIssueReportClient() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [routeFilter, setRouteFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [routes, setRoutes] = useState<{ id: string; route_code: string; route_name: string }[]>([]);

  const [expandedMasters, setExpandedMasters] = useState<Record<string, boolean>>({});
  const [selectedPlanForSlip, setSelectedPlanForSlip] = useState<Plan | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const s = createClient();
      const [plansRes, routesRes] = await Promise.all([
        s.rpc('get_rolling_plans', {
          p_search: search.trim() || null,
          p_route_code: routeFilter === 'ALL' ? null : routeFilter,
          p_from_date: fromDate || null,
          p_to_date: toDate || null,
          p_limit: 2000,
          p_offset: 0,
        }),
        s.from('process_routes').select('id,route_code,route_name').eq('active', true).order('route_code'),
      ]);

      if (plansRes.error) throw plansRes.error;
      const rawPlans = (plansRes.data ?? []) as Plan[];

      // Fetch actual Mother Hollow specs & status directly from rolling_plans table
      const planIds = rawPlans.map((x) => x.id);
      const woIds = Array.from(new Set(rawPlans.map((x) => x.work_order_id).filter(Boolean)));
      let mhMap: Record<string, any> = {};
      let woMap: Record<string, any> = {};

      const [rpDetailsRes, woDetailsRes] = await Promise.all([
        planIds.length > 0
          ? s.from('rolling_plans').select('id, mh_od, mh_wt, mh_l1, mh_l2, pass_required, multiple, status, planned_qty').in('id', planIds)
          : Promise.resolve({ data: [] }),
        woIds.length > 0
          ? s.from('work_orders').select('id, size_od, size_wt, l1, l2, ordered_qty_pcs, ordered_qty_mtr').in('id', woIds)
          : Promise.resolve({ data: [] }),
      ]);

      if (rpDetailsRes.data) {
        for (const d of rpDetailsRes.data) mhMap[d.id] = d;
      }
      if (woDetailsRes.data) {
        for (const w of woDetailsRes.data) woMap[w.id] = w;
      }

      const enrichedPlans: Plan[] = rawPlans.map((p) => {
        const detail = mhMap[p.id];
        const wo = woMap[p.work_order_id];
        let parsedSt: any = {};
        try {
          parsedSt = typeof detail?.status === 'string'
            ? JSON.parse(detail.status)
            : detail?.status || (typeof p.status === 'string' ? JSON.parse(p.status) : p.status || {});
        } catch { }

        // Final Size Specifications
        const finalOd = wo?.size_od ?? p.od ?? parsedSt?.master_od ?? null;
        const finalWt = wo?.size_wt ?? p.wt ?? parsedSt?.master_wt ?? null;
        const finalL1 = wo?.l1 ?? p.l1 ?? null;
        const finalL2 = wo?.l2 ?? p.l2 ?? null;

        let computedAvgLen: number | null = p.avg_length ?? null;
        if (!computedAvgLen && finalL1 && finalL2) {
          computedAvgLen = (Number(finalL1) + Number(finalL2)) / 2;
        } else if (!computedAvgLen && (finalL1 || finalL2)) {
          computedAvgLen = Number(finalL1 || finalL2);
        } else if (!computedAvgLen && wo && Number(wo.ordered_qty_pcs) > 0 && Number(wo.ordered_qty_mtr) > 0) {
          computedAvgLen = Number((Number(wo.ordered_qty_mtr) / Number(wo.ordered_qty_pcs)).toFixed(2));
        }

        const mhOd = detail?.mh_od ?? p.mh_od ?? null;
        const mhWt = detail?.mh_wt ?? p.mh_wt ?? null;
        const mhL1 = detail?.mh_l1 ?? p.mh_l1 ?? null;
        const mhL2 = detail?.mh_l2 ?? p.mh_l2 ?? null;
        const passReq = detail?.pass_required ?? p.pass_required ?? 1;
        const mult = detail?.multiple ?? p.multiple ?? 1;

        let pcs = 0;
        if (parsedSt?.is_master && Number(parsedSt?.master_planned_pcs) > 0) {
          pcs = Number(parsedSt.master_planned_pcs);
        } else if (Number(parsedSt?.planned_pcs) > 0) {
          pcs = Number(parsedSt.planned_pcs);
        } else if (Number(p.planned_pcs) > 0) {
          pcs = Number(p.planned_pcs);
        }

        const hl1 = Number(mhL1 || 0);
        const hl2 = Number(mhL2 || 0);
        const mhAvgLen = (hl1 > 0 && hl2 > 0)
          ? (hl1 + hl2) / 2
          : (hl1 > 0 ? hl1 : (hl2 > 0 ? hl2 : Number(computedAvgLen || 6.0)));

        const rawMtr = Number(detail?.planned_qty ?? p.planned_qty ?? p.planned_mtr ?? 0);
        if (pcs === 0 && rawMtr > 0 && mhAvgLen > 0) {
          pcs = Math.round(rawMtr / mhAvgLen);
        }

        const mtr = pcs > 0
          ? Number((pcs * mhAvgLen).toFixed(2))
          : (Number(parsedSt?.master_planned_mtr || parsedSt?.planned_mtr || rawMtr) || 0);

        const hod = Number(mhOd || 0) > 0 ? Number(mhOd) : Number(finalOd || 0);
        const hwt = Number(mhWt || 0) > 0 ? Number(mhWt) : Number(finalWt || 0);
        const mt = (hod > 0 && hwt > 0 && hod > hwt)
          ? Number(((hod - hwt) * hwt * 0.0246615 * 0.001 * mtr).toFixed(3))
          : (Number(parsedSt?.master_planned_mt || parsedSt?.planned_mt || p.planned_mt) || 0);

        return {
          ...p,
          od: finalOd,
          wt: finalWt,
          l1: finalL1,
          l2: finalL2,
          avg_length: computedAvgLen,
          mh_od: mhOd,
          mh_wt: mhWt,
          mh_l1: mhL1,
          mh_l2: mhL2,
          pass_required: passReq,
          multiple: mult,
          planned_pcs: pcs,
          planned_mtr: mtr,
          planned_mt: mt,
          status: detail?.status ?? p.status,
        };
      });

      setPlans(enrichedPlans);

      if (routesRes.data) {
        setRoutes(routesRes.data);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load rolling plans.');
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }, [search, routeFilter, fromDate, toDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filter plans based on type (Master, Child, Standard)
  const filteredPlans = useMemo(() => {
    return plans.filter((p) => {
      let parsedStatus: any = {};
      try {
        parsedStatus = typeof p.status === 'string' ? JSON.parse(p.status) : p.status;
      } catch { }

      const isMaster = !!parsedStatus?.is_master;
      const isChild = !!parsedStatus?.is_child;

      if (typeFilter === 'MASTER' && !isMaster) return false;
      if (typeFilter === 'CHILD' && !isChild) return false;
      if (typeFilter === 'STANDARD' && (isMaster || isChild)) return false;

      return true;
    });
  }, [plans, typeFilter]);

  // Summary Metrics
  const summary = useMemo(() => {
    let totalMtr = 0;
    let totalPcs = 0;
    let totalMt = 0;
    let masterCount = 0;

    filteredPlans.forEach((p) => {
      let parsedStatus: any = {};
      try {
        parsedStatus = typeof p.status === 'string' ? JSON.parse(p.status) : p.status;
      } catch { }
      if (parsedStatus?.is_master) masterCount++;

      totalMtr += Number(p.planned_mtr || 0);
      totalPcs += Number(p.planned_pcs || 0);
      totalMt += Number(p.planned_mt || 0);
    });

    return {
      count: filteredPlans.length,
      totalMtr,
      totalPcs,
      totalMt,
      masterCount,
    };
  }, [filteredPlans]);

  const toggleExpand = (id: string) => {
    setExpandedMasters((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const exportCSV = () => {
    if (!filteredPlans.length) {
      toast.error('No data available to export.');
      return;
    }

    const headers = [
      'Plan No',
      'Rolling Date',
      'Work Order No',
      'Customer',
      'Grade',
      'Finished OD (mm)',
      'Finished WT (mm)',
      'MH OD (mm)',
      'MH WT (mm)',
      'Route Code',
      'Pass Req',
      'Multiple',
      'Planned Pcs',
      'Planned Mtr',
      'Planned MT',
    ];

    const rows = filteredPlans.map((p) => [
      p.plan_no,
      p.planned_rolling_date,
      p.work_order_no,
      `"${(p.customer_name || '').replace(/"/g, '""')}"`,
      p.grade || '',
      p.od ?? '',
      p.wt ?? '',
      p.mh_od ?? '',
      p.mh_wt ?? '',
      p.route_code || '',
      p.pass_required ?? '',
      p.multiple ?? '',
      p.planned_pcs ?? 0,
      p.planned_mtr ?? 0,
      p.planned_mt ?? 0,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Rolling_Plan_Issue_Schedule_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Rolling plans exported to CSV.');
  };

  return (
    <div className="space-y-6 print:space-y-4 print:p-0">
      {/* Screen Toolbar / Header Actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800 border border-amber-200">
              <Flame className="h-3.5 w-3.5 text-amber-700" />
              HOT ROLLING MILL
            </span>
            <span className="text-xs font-semibold text-slate-500">Document Ref: STP/PPC/RP-01 (Rev 04)</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">
            Rolling Plan Issue Schedule & Circulation Report
          </h1>
          <p className="text-xs text-slate-500">
            Official shop floor rolling allocation schedule for billet charging, mother hollow piercing, and mill campaign planning.
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
            <div className="h-11 w-11 rounded-xl bg-blue-700 text-white flex items-center justify-center font-black text-lg print:border print:border-black">
              STP
            </div>
            <div>
              <h2 className="text-base font-black uppercase tracking-wide text-slate-900 print:text-black">
                Rashmi Green Hydrogen Limited.
              </h2>
              <div className="text-xs font-bold text-slate-600 print:text-black">
                Production Planning & Control (PPC)
              </div>
              <div className="text-[11px] text-slate-400 print:text-black">
                Rolling Mill Issue Schedule & Campaign Allocation Sheet
              </div>
            </div>
          </div>

          <div className="text-right text-xs space-y-0.5 print:text-black">
            <div className="font-mono font-bold text-slate-900">DOC: STP/PPC/RP-01</div>
            <div className="text-slate-500">Rev: 04 · Approved</div>
            <div className="text-slate-500 font-mono">Date: {new Date().toLocaleDateString('en-GB')}</div>
            <div className="text-slate-500">Target Mill: Hot Assel / Mandrel Mill</div>
          </div>
        </div>

        {/* Filter controls (hidden when printing) */}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-5 print:hidden">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Search Order / Plan / Customer
            </label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="e.g. RP-2026 or WO-102"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-hidden"
              />
            </div>
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
              Plan Type
            </label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-hidden"
            >
              <option value="ALL">All Plan Types</option>
              <option value="MASTER">Master Multi-WO Campaigns</option>
              <option value="CHILD">Child Linked Orders</option>
              <option value="STANDARD">Standard Single Orders</option>
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
              Total Plans Issued
            </span>
            <span className="text-lg font-black text-slate-900 font-mono print:text-black">{summary.count}</span>
            <span className="text-[10px] text-indigo-600 block print:hidden">({summary.masterCount} Master Campaigns)</span>
          </div>

          {/* Primary Focus Card 1: Total Planned Pieces (PCS) */}
          <div className="rounded-xl bg-indigo-50/50 p-3 border-2 border-indigo-200 shadow-2xs print:bg-white print:border-black">
            <span className="block text-[10px] font-black uppercase tracking-wider text-indigo-900 print:text-black">
              Total Planned Pieces (PCS) ★
            </span>
            <div className="mt-1">
              <span className="inline-block px-2.5 py-0.5 rounded-md text-base sm:text-lg font-black font-mono bg-indigo-100 text-indigo-950 border border-indigo-300 print:border-black print:bg-white print:text-black">
                {fmt(summary.totalPcs, 0)} PCS
              </span>
            </div>
            <span className="text-[10px] text-indigo-700 block font-semibold mt-1 print:text-black">
              Billets / Tubes Allocated
            </span>
          </div>

          {/* Primary Focus Card 2: Total Billet Tonnage (MT) */}
          <div className="rounded-xl bg-emerald-50/50 p-3 border-2 border-emerald-200 shadow-2xs print:bg-white print:border-black">
            <span className="block text-[10px] font-black uppercase tracking-wider text-emerald-900 print:text-black">
              Total Billet Tonnage (MT) ★
            </span>
            <div className="mt-1">
              <span className="inline-block px-2.5 py-0.5 rounded-md text-base sm:text-lg font-black font-mono bg-emerald-100 text-emerald-950 border border-emerald-300 print:border-black print:bg-white print:text-black">
                {fmt(summary.totalMt)} MT
              </span>
            </div>
            <span className="text-[10px] text-emerald-700 block font-semibold mt-1 print:text-black">
              Gross Rolling Campaign Mass
            </span>
          </div>

          <div className="rounded-xl bg-slate-50 p-3 border border-slate-200 print:bg-white print:border-black">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 print:text-black">
              Total Planned Meters
            </span>
            <span className="text-lg font-black text-blue-700 font-mono print:text-black">{fmt(summary.totalMtr)} MTR</span>
            <span className="text-[10px] text-slate-500 block mt-1">Linear rolling schedule</span>
          </div>
        </div>
      </div>

      {/* Rolling Plans Schedule Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden print:border-black print:shadow-none">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-100/90 font-bold uppercase tracking-wider text-slate-700 print:bg-slate-200 print:border-black print:text-black">
                <th className="px-3 py-2.5 whitespace-nowrap">Plan No</th>
                <th className="px-3 py-2.5 whitespace-nowrap">Rolling Date</th>
                <th className="px-3 py-2.5 whitespace-nowrap">Work Order #</th>
                <th className="px-3 py-2.5">Customer & Grade</th>
                <th className="px-3 py-2.5 whitespace-nowrap font-bold">Mother Hollow Size (OD × WT × Len)</th>
                <th className="px-3 py-2.5 whitespace-nowrap font-bold">Final Size (OD × WT × Len)</th>
                <th className="px-3 py-2.5 whitespace-nowrap">Route</th>

                {/* Primary Focus Columns: PCS and MT */}
                <th className="px-3 py-2.5 text-right whitespace-nowrap font-black text-indigo-950 bg-indigo-100/90 border-l border-indigo-300 print:border-black print:bg-white print:text-black">
                  PLANNED PCS ★
                </th>
                <th className="px-3 py-2.5 text-right whitespace-nowrap font-black text-emerald-950 bg-emerald-100/90 border-r border-emerald-300 print:border-black print:bg-white print:text-black">
                  TONNAGE (MT) ★
                </th>

                <th className="px-3 py-2.5 text-right whitespace-nowrap">Meters</th>
                <th className="px-3 py-2.5 text-center whitespace-nowrap print:hidden">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 print:divide-black">
              {loading ? (
                <tr>
                  <td colSpan={11} className="p-8 text-center text-slate-500">
                    <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-blue-600" />
                    Loading rolling plan issue schedule...
                  </td>
                </tr>
              ) : filteredPlans.length === 0 ? (
                <tr>
                  <td colSpan={11} className="p-8 text-center text-slate-500">
                    No rolling plan records found for the selected criteria.
                  </td>
                </tr>
              ) : (
                filteredPlans.map((p) => {
                  let parsedStatus: any = {};
                  try {
                    parsedStatus = typeof p.status === 'string' ? JSON.parse(p.status) : p.status;
                  } catch { }

                  const isMaster = !!parsedStatus?.is_master;
                  const isChild = !!parsedStatus?.is_child;
                  const childOrders: any[] = parsedStatus?.child_work_orders || [];
                  const isExpanded = expandedMasters[p.id];

                  return (
                    <React.Fragment key={p.id}>
                      <tr
                        className={`transition-colors ${isMaster ? 'bg-indigo-50/30' : isChild ? 'bg-slate-50/40' : 'hover:bg-slate-50/50'
                          } print:text-black`}
                      >
                        <td className="px-3 py-2 font-mono font-bold text-slate-900 whitespace-nowrap print:text-black">
                          {p.plan_no}
                          {isMaster && (
                            <span className="ml-1.5 inline-flex items-center rounded-full bg-indigo-100 text-indigo-800 px-1.5 py-0.2 text-[10px] font-bold print:border print:border-black">
                              <Crown className="h-2.5 w-2.5 mr-0.5" />
                              Master
                            </span>
                          )}
                        </td>

                        <td className="px-3 py-2 font-mono text-slate-600 whitespace-nowrap print:text-black">
                          {p.planned_rolling_date}
                        </td>

                        <td className="px-3 py-2 font-bold text-slate-900 whitespace-nowrap print:text-black">
                          {p.work_order_no}
                          {isChild && (
                            <span className="block text-[10px] text-teal-700 font-medium">
                              Child of {parsedStatus.master_wo_no || 'Master'}
                            </span>
                          )}
                        </td>

                        <td className="px-3 py-2 max-w-[170px] truncate">
                          <div className="font-semibold text-slate-800 print:text-black">{p.customer_name || 'Standard Stock'}</div>
                          <div className="text-[11px] font-mono text-slate-500 print:text-black">{p.grade}</div>
                        </td>

                        <td className="px-3 py-2 font-mono font-semibold text-slate-800 whitespace-nowrap print:text-black">
                          {p.mh_od && p.mh_wt ? (
                            <span>
                              {fmt(p.mh_od)} × {fmt(p.mh_wt)} mm
                              <span className="text-[10px] text-slate-500 block">
                                L: {fmt(p.mh_l1)} - {fmt(p.mh_l2)} m (Pass: {p.pass_required || 1}, Mult: {p.multiple || 1})
                              </span>
                            </span>
                          ) : (
                            <span className="text-slate-400">Direct Rolling</span>
                          )}
                        </td>

                        <td className="px-3 py-2 font-mono text-slate-700 whitespace-nowrap print:text-black">
                          <div className="font-bold text-slate-800 print:text-black">
                            {p.od && p.wt ? `${fmt(p.od)} × ${fmt(p.wt)} mm` : <span className="text-slate-400 font-normal">—</span>}
                          </div>
                          {(() => {
                            const lenStr = formatFinalSizeLength(p);
                            return lenStr ? (
                              <span className="text-[10px] text-slate-500 block print:text-black">
                                {lenStr}
                              </span>
                            ) : null;
                          })()}
                        </td>

                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono font-semibold text-slate-700 print:border print:border-black print:text-black">
                            {p.route_code}
                          </span>
                        </td>

                        {/* Primary Focus Cells: Planned Pcs (Highlighted, Bold) */}
                        <td className="px-3 py-2 text-right font-mono bg-indigo-50/60 border-l border-indigo-200 print:bg-white print:border-black">
                          <span className="inline-block px-2 py-0.5 rounded-md font-black text-xs sm:text-sm text-indigo-950 bg-indigo-100/90 border border-indigo-300 print:bg-white print:border-black print:text-black">
                            {fmt(p.planned_pcs, 0)}
                          </span>
                        </td>

                        {/* Primary Focus Cells: Tonnage MT (Highlighted, Bold) */}
                        <td className="px-3 py-2 text-right font-mono bg-emerald-50/60 border-r border-emerald-200 print:bg-white print:border-black">
                          <span className="inline-block px-2 py-0.5 rounded-md font-black text-xs sm:text-sm text-emerald-950 bg-emerald-100/90 border border-emerald-300 print:bg-white print:border-black print:text-black">
                            {fmt(p.planned_mt)}
                          </span>
                        </td>

                        <td className="px-3 py-2 text-right font-mono font-bold text-blue-700 print:text-black">
                          {fmt(p.planned_mtr)}
                        </td>

                        <td className="px-3 py-2 text-center whitespace-nowrap print:hidden">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setSelectedPlanForSlip(p)}
                              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-blue-600 hover:bg-blue-50 transition cursor-pointer"
                              title="View and print Mill Issue Slip"
                            >
                              Issue Slip
                            </button>
                            {isMaster && childOrders.length > 0 && (
                              <button
                                type="button"
                                onClick={() => toggleExpand(p.id)}
                                className="rounded-md border border-indigo-200 bg-indigo-50 px-1.5 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100 transition cursor-pointer inline-flex items-center gap-0.5"
                                title="Toggle Child Work Orders"
                              >
                                {childOrders.length} Child
                                {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Expandable Child Work Orders for Master Campaign */}
                      {isMaster && isExpanded && childOrders.length > 0 && (
                        <tr className="bg-indigo-50/40 print:bg-slate-100">
                          <td colSpan={11} className="px-6 py-3">
                            <div className="rounded-lg border border-indigo-200 bg-white p-3 shadow-2xs print:border-black">
                              <div className="text-xs font-bold text-indigo-900 mb-2 flex items-center gap-1.5">
                                <Link2 className="h-3.5 w-3.5 text-indigo-600" />
                                Linked Child Work Orders in Campaign (Bundled Piercing Batch)
                              </div>
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-slate-500 font-semibold border-b border-indigo-100">
                                    <th className="py-1 text-left">Child WO #</th>
                                    <th className="py-1 text-left">Customer</th>
                                    <th className="py-1 text-left">Grade</th>
                                    <th className="py-1 text-left">Final Size (OD × WT × Len)</th>
                                    <th className="py-1 text-right font-black text-indigo-900">Planned Pcs ★</th>
                                    <th className="py-1 text-right font-black text-emerald-900">Planned MT ★</th>
                                    <th className="py-1 text-right">Planned Mtr</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-indigo-50 font-mono">
                                  {childOrders.map((c: any, idx: number) => (
                                    <tr key={idx} className="hover:bg-indigo-50/30">
                                      <td className="py-1 text-slate-800 font-bold">{c.work_order_no}</td>
                                      <td className="py-1 text-slate-600 font-sans">{c.customer_name || '—'}</td>
                                      <td className="py-1 text-slate-600">{c.grade || p.grade}</td>
                                      <td className="py-1 text-slate-700">
                                        <div className="font-semibold">{fmt(c.size_od ?? p.od)} × {fmt(c.size_wt ?? p.wt)} mm</div>
                                        {(() => {
                                          const childLenStr = formatFinalSizeLength({
                                            l1: c.l1,
                                            l2: c.l2,
                                            avg_length: (c.l1 && c.l2) ? (Number(c.l1) + Number(c.l2)) / 2 : (c.l1 || c.l2 || p.avg_length),
                                          });
                                          return childLenStr ? (
                                            <span className="text-[10px] text-slate-500 block">
                                              {childLenStr}
                                            </span>
                                          ) : null;
                                        })()}
                                      </td>
                                      <td className="py-1 text-right font-black text-indigo-950">
                                        <span className="px-1.5 py-0.5 rounded bg-indigo-100/90 border border-indigo-200">
                                          {fmt(c.planned_pcs ?? 0, 0)}
                                        </span>
                                      </td>
                                      <td className="py-1 text-right font-black text-emerald-950">
                                        <span className="px-1.5 py-0.5 rounded bg-emerald-100/90 border border-emerald-200">
                                          {fmt(c.planned_mt ?? 0)}
                                        </span>
                                      </td>
                                      <td className="py-1 text-right font-bold text-slate-700">
                                        {fmt(c.planned_mtr ?? 0)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Total Summary Footer with highlighted PCS and MT */}
        <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs flex flex-wrap items-center justify-between font-bold text-slate-800 print:bg-slate-100 print:border-black gap-2">
          <div>
            Showing <span className="font-mono">{filteredPlans.length}</span> Rolling Plan{filteredPlans.length === 1 ? '' : 's'}
          </div>
          <div className="flex flex-wrap items-center gap-3 font-mono">
            <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-indigo-100 text-indigo-950 font-black text-xs sm:text-sm border border-indigo-300 print:border-black print:bg-white print:text-black">
              TOTAL: {fmt(summary.totalPcs, 0)} PCS
            </span>
            <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-950 font-black text-xs sm:text-sm border border-emerald-300 print:border-black print:bg-white print:text-black">
              TOTAL: {fmt(summary.totalMt)} MT
            </span>
            <span className="text-blue-700 font-semibold">Total Length: {fmt(summary.totalMtr)} MTR</span>
          </div>
        </div>
      </div>

      {/* Formal Shop Floor Circulation Sign-Off Block */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs print:border-black print:shadow-none break-inside-avoid">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-4 print:text-black">
          Shop Floor Circulation & Authorization Sign-Off
        </h3>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 text-xs">
          <div className="rounded-lg border border-slate-200 p-3 bg-slate-50/50 print:bg-white print:border-black">
            <div className="font-bold text-slate-800 print:text-black">Prepared & Issued By</div>
            <div className="text-[11px] text-slate-500 mb-8 print:text-black">PPC Production Planning</div>
            <div className="border-t border-dashed border-slate-300 pt-1 text-[11px] text-slate-400 print:text-black print:border-black">
              Signature & Date
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-3 bg-slate-50/50 print:bg-white print:border-black">
            <div className="font-bold text-slate-800 print:text-black">Verified & Accepted By</div>
            <div className="text-[11px] text-slate-500 mb-8 print:text-black">Hot Rolling Shift In-Charge</div>
            <div className="border-t border-dashed border-slate-300 pt-1 text-[11px] text-slate-400 print:text-black print:border-black">
              Signature & Date
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-3 bg-slate-50/50 print:bg-white print:border-black">
            <div className="font-bold text-slate-800 print:text-black">Metallurgical Clearance</div>
            <div className="text-[11px] text-slate-500 mb-8 print:text-black">Quality Assurance & Lab</div>
            <div className="border-t border-dashed border-slate-300 pt-1 text-[11px] text-slate-400 print:text-black print:border-black">
              Signature & Date
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-3 bg-slate-50/50 print:bg-white print:border-black">
            <div className="font-bold text-slate-800 print:text-black">Approved for Rolling</div>
            <div className="text-[11px] text-slate-500 mb-8 print:text-black">Plant Operations Head</div>
            <div className="border-t border-dashed border-slate-300 pt-1 text-[11px] text-slate-400 print:text-black print:border-black">
              Signature & Date
            </div>
          </div>
        </div>
      </div>

      {/* Individual Plan Issue Slip Modal */}
      {selectedPlanForSlip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 print:p-0 print:static print:bg-white">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 print:border-black print:shadow-none print:p-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 print:hidden">
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-amber-100 text-amber-800 px-2 py-0.5 text-xs font-bold">
                  HOT ROLLING SLIP
                </span>
                <span className="font-mono font-bold text-slate-900">{selectedPlanForSlip.plan_no}</span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPlanForSlip(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Slip Content */}
            <div className="mt-4 space-y-4 text-xs">
              <div className="flex items-start justify-between border-b border-slate-200 pb-3 print:border-black">
                <div>
                  <h4 className="font-black text-sm uppercase text-slate-900">HOT ROLLING MILL ISSUE SLIP</h4>
                  <div className="text-slate-500">Seamless Tubular Products Ltd. · Mill Floor Copy</div>
                </div>
                <div className="text-right font-mono">
                  <div className="font-bold text-slate-900">PLAN: {selectedPlanForSlip.plan_no}</div>
                  <div className="text-slate-500">Date: {selectedPlanForSlip.planned_rolling_date}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 border border-slate-200 rounded-lg p-3 bg-slate-50 print:bg-white print:border-black">
                <div>
                  <span className="text-slate-500 block">Work Order Number:</span>
                  <span className="font-bold text-slate-900 text-sm font-mono">{selectedPlanForSlip.work_order_no}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Customer Name:</span>
                  <span className="font-bold text-slate-800">{selectedPlanForSlip.customer_name || 'Standard Stock'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Material Grade / Spec:</span>
                  <span className="font-bold text-slate-900 font-mono">{selectedPlanForSlip.grade || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Target Process Route:</span>
                  <span className="font-bold text-slate-900 font-mono">{selectedPlanForSlip.route_code}</span>
                </div>
              </div>

              <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 print:bg-white print:border-black">
                <div className="font-bold text-amber-950 mb-1.5 flex items-center gap-1.5">
                  <Flame className="h-4 w-4 text-amber-700" />
                  Mother Hollow (MH) Rolling Dimensions & Setup:
                </div>
                <div className="grid grid-cols-3 gap-2 font-mono">
                  <div>
                    <span className="text-slate-500 text-[10px] block">MH OD × WT:</span>
                    <span className="font-bold text-slate-900">
                      {fmt(selectedPlanForSlip.mh_od)} × {fmt(selectedPlanForSlip.mh_wt)} mm
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[10px] block">MH Length (L1 - L2):</span>
                    <span className="font-bold text-slate-900">
                      {fmt(selectedPlanForSlip.mh_l1)} - {fmt(selectedPlanForSlip.mh_l2)} m
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[10px] block">Pass & Multiple:</span>
                    <span className="font-bold text-slate-900">
                      Pass: {selectedPlanForSlip.pass_required || 1} · Mult: {selectedPlanForSlip.multiple || 1}
                    </span>
                  </div>
                </div>
              </div>

              {/* Final / Finished Tube Size (Target Dimensions) */}
              <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 print:bg-white print:border-black">
                <div className="font-bold text-blue-950 mb-1.5 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-blue-600"></span>
                  Final / Finished Tube Size (Target Delivery Dimensions):
                </div>
                <div className="grid grid-cols-3 gap-2 font-mono">
                  <div>
                    <span className="text-slate-500 text-[10px] block">Final OD × WT:</span>
                    <span className="font-bold text-slate-900">
                      {selectedPlanForSlip.od && selectedPlanForSlip.wt
                        ? `${fmt(selectedPlanForSlip.od)} × ${fmt(selectedPlanForSlip.wt)} mm`
                        : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[10px] block">Finished Length:</span>
                    <span className="font-bold text-slate-900">
                      {formatFinalSizeLength(selectedPlanForSlip) || 'Standard Length'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[10px] block">Process Route:</span>
                    <span className="font-bold text-slate-900">
                      {selectedPlanForSlip.route_code}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 rounded-lg border border-slate-200 p-3 bg-slate-50 print:bg-white print:border-black font-mono text-center">
                <div className="rounded-md bg-indigo-50 border border-indigo-200 p-2 print:bg-white print:border-black">
                  <span className="text-indigo-900 text-[10px] block uppercase font-bold print:text-black">Planned Pcs / Billets ★</span>
                  <span className="text-lg font-black text-indigo-950 print:text-black">{fmt(selectedPlanForSlip.planned_pcs, 0)} PCS</span>
                </div>
                <div className="rounded-md bg-emerald-50 border border-emerald-200 p-2 print:bg-white print:border-black">
                  <span className="text-emerald-900 text-[10px] block uppercase font-bold print:text-black">Planned Weight (MT) ★</span>
                  <span className="text-lg font-black text-emerald-950 print:text-black">{fmt(selectedPlanForSlip.planned_mt)} MT</span>
                </div>
                <div className="rounded-md bg-white border border-slate-200 p-2 print:bg-white print:border-black">
                  <span className="text-slate-500 text-[10px] block uppercase font-bold">Planned Length</span>
                  <span className="text-base font-black text-blue-700">{fmt(selectedPlanForSlip.planned_mtr)} M</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-200 print:border-black">
                <div>
                  <div className="text-slate-500 text-[10px]">PPC Planning Signature:</div>
                  <div className="border-b border-slate-300 mt-6 print:border-black"></div>
                </div>
                <div>
                  <div className="text-slate-500 text-[10px]">Rolling Mill Pulpit In-Charge:</div>
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
                Print Slip
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
