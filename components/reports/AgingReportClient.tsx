'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';
import { createClient } from '@/lib/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import {
  Clock,
  AlertTriangle,
  CheckCircle2,
  Download,
  Search,
  RefreshCw,
  Factory,
  Layers,
  ArrowRight,
  TrendingUp,
  Filter,
  Check,
} from 'lucide-react';
import { toast } from 'sonner';

type AgingRow = {
  work_order_id: string;
  work_order_no: string;
  customer_name: string | null;
  grade: string | null;
  od: number;
  wt: number;
  l1: number | null;
  l2: number | null;
  stage_code: string;
  stage_name: string;
  current_wip: number;
  current_wip_pcs: number;
  available_mt: number;
  last_activity_date: string;
  days_stuck: number;
  severity: 'NORMAL' | 'WARNING' | 'CRITICAL';
  is_acknowledged?: boolean;
  acknowledged_by?: string | null;
  ack_notes?: string | null;
  ack_snooze_until?: string | null;
};

const STAGES = [
  { code: 'ALL', name: 'All Work Centers' },
  { code: 'ROLLING', name: 'Rolling Mill (Mother Hollow)' },
  { code: 'HOLLOW_HEAT_TREATMENT', name: 'Hollow Heat Treatment (HTC)' },
  { code: 'DRAW', name: 'Cold Draw Bench' },
  { code: 'HEAT_TREATMENT', name: 'Final Heat Treatment' },
  { code: 'FINISHING', name: 'Finishing & Inspection' },
];

const fmt = (n: number | null | undefined, digits = 2) =>
  n == null || isNaN(n) ? '—' : Number(n).toLocaleString(undefined, { maximumFractionDigits: digits });

export default function AgingReportClient() {
  const router = useRouter();
  const [rows, setRows] = useState<AgingRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [selectedStage, setSelectedStage] = useState<string>('ALL');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('ALL');
  const [page, setPage] = useState<number>(1);
  const pageSize = 50;

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const supabase = createClient();

      // Try reading from view
      const { data, error } = await supabase
        .from('vw_wip_aging')
        .select('*')
        .gt('current_wip', 0)
        .order('days_stuck', { ascending: false });

      if (!error && data) {
        setRows(data as AgingRow[]);
        setLoading(false);
        return;
      }

      // Fallback if view not yet applied to database
      const [wipRes, prodRes] = await Promise.all([
        supabase.from('vw_route_stage_wip').select('*').gt('current_wip', 0),
        supabase.from('production_logs').select('work_order_id, stage_id, process_date').order('process_date', { ascending: false }),
      ]);

      if (wipRes.data) {
        const today = new Date();
        const computed: AgingRow[] = wipRes.data.map((r: any) => {
          const matchLog = (prodRes.data || []).find(
            (p: any) => p.work_order_id === r.work_order_id && p.stage_id === r.stage_id
          );
          const actDateStr = matchLog?.process_date || r.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10);
          const actDate = new Date(actDateStr);
          const diffDays = Math.max(0, Math.floor((today.getTime() - actDate.getTime()) / (1000 * 60 * 60 * 24)));
          const sev: 'NORMAL' | 'WARNING' | 'CRITICAL' =
            diffDays > 5 ? 'CRITICAL' : diffDays >= 3 ? 'WARNING' : 'NORMAL';

          return {
            work_order_id: r.work_order_id,
            work_order_no: r.work_order_no,
            customer_name: r.customer_name,
            grade: r.grade || 'ASTM A106 Gr.B',
            od: Number(r.od) || 0,
            wt: Number(r.wt) || 0,
            l1: r.l1,
            l2: r.l2,
            stage_code: r.stage_code,
            stage_name: r.stage_name || r.stage_code,
            current_wip: Number(r.current_wip) || 0,
            current_wip_pcs: Number(r.current_wip_pcs) || 0,
            available_mt: Number(r.available_mt) || 0,
            last_activity_date: actDateStr,
            days_stuck: diffDays,
            severity: sev,
            is_acknowledged: false,
          };
        });

        setRows(computed.filter(x => x.current_wip > 0));
      }
    } catch (err) {
      toast.error('Failed to load WIP aging data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filtering
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      // Stage filter
      if (selectedStage !== 'ALL' && r.stage_code !== selectedStage) return false;
      // Severity filter
      if (selectedSeverity !== 'ALL' && r.severity !== selectedSeverity) return false;
      // Search filter
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesWo = r.work_order_no.toLowerCase().includes(q);
        const matchesCust = (r.customer_name || '').toLowerCase().includes(q);
        const matchesGrade = (r.grade || '').toLowerCase().includes(q);
        const matchesStage = (r.stage_name || '').toLowerCase().includes(q);
        const matchesSize = `${r.od}x${r.wt}`.includes(q);
        if (!matchesWo && !matchesCust && !matchesGrade && !matchesStage && !matchesSize) return false;
      }
      return true;
    });
  }, [rows, selectedStage, selectedSeverity, search]);

  // KPI Metrics
  const kpis = useMemo(() => {
    const totalLots = rows.length;
    const criticalLots = rows.filter(r => r.severity === 'CRITICAL').length;
    const warningLots = rows.filter(r => r.severity === 'WARNING').length;
    const normalLots = rows.filter(r => r.severity === 'NORMAL').length;

    const criticalMtr = rows.filter(r => r.severity === 'CRITICAL').reduce((sum, r) => sum + r.current_wip, 0);
    const criticalMt = rows.filter(r => r.severity === 'CRITICAL').reduce((sum, r) => sum + r.available_mt, 0);
    const totalWipMtr = rows.reduce((sum, r) => sum + r.current_wip, 0);
    const totalWipMt = rows.reduce((sum, r) => sum + r.available_mt, 0);

    const avgDays = totalLots > 0 ? rows.reduce((sum, r) => sum + r.days_stuck, 0) / totalLots : 0;

    // Work center with highest critical count
    const stageCounts: Record<string, number> = {};
    rows.filter(r => r.severity === 'CRITICAL').forEach(r => {
      stageCounts[r.stage_name] = (stageCounts[r.stage_name] || 0) + 1;
    });
    let topStage = 'None';
    let topCount = 0;
    Object.entries(stageCounts).forEach(([stg, cnt]) => {
      if (cnt > topCount) {
        topCount = cnt;
        topStage = stg;
      }
    });

    return {
      totalLots,
      criticalLots,
      warningLots,
      normalLots,
      criticalMtr,
      criticalMt,
      totalWipMtr,
      totalWipMt,
      avgDays,
      topBottleneck: topCount > 0 ? `${topStage} (${topCount} lots)` : 'None (Fluid)',
    };
  }, [rows]);

  const paginatedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, page]);

  const totalPages = Math.ceil(filteredRows.length / pageSize) || 1;

  // Excel Export
  const exportExcel = () => {
    const exportData = filteredRows.map((r, i) => ({
      '#': i + 1,
      'Work Order No': r.work_order_no,
      'Customer': r.customer_name || '—',
      'Grade': r.grade || '—',
      'Size (ODxWT mm)': `${r.od} × ${r.wt}`,
      'Work Center': r.stage_name,
      'Physical WIP (Mtrs)': r.current_wip,
      'Physical WIP (Pcs)': r.current_wip_pcs,
      'Physical WIP (MT)': r.available_mt,
      'Last Activity Date': r.last_activity_date,
      'Days Stuck': r.days_stuck,
      'Aging Severity': r.severity,
      'Acknowledged': r.is_acknowledged ? 'Yes' : 'No',
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'WIP Aging');
    XLSX.writeFile(wb, `wip-aging-bottleneck-report-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              <Clock className="h-6 w-6 text-[#0078d4]" />
              WIP Aging & Bottlenecks Analysis
            </h1>
            <span className="rounded-md bg-blue-50 border border-blue-200 px-2.5 py-0.5 text-xs font-bold text-[#0078d4] font-mono">
              {filteredRows.length} Lots
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Real-time material stagnation tracking across plant work centers. Alerts highlight lots exceeding dwell time thresholds.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={loadData}
            disabled={loading}
            className="text-xs h-9 border-slate-300"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin text-blue-600' : ''}`} />
            Refresh
          </Button>

          <Button
            type="button"
            onClick={exportExcel}
            className="text-xs h-9 bg-[#107c41] hover:bg-[#0b5a2f] text-white font-semibold flex items-center gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            Export Excel
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        {/* Critical Stagnation Card */}
        <div className="rounded-lg border border-red-200 bg-red-50/40 p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-red-900 uppercase tracking-wider">Critical Stagnant (&gt;5 Days)</span>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-red-700 font-mono tracking-tight">{kpis.criticalLots}</span>
            <span className="text-xs text-red-600 font-medium">Lots</span>
          </div>
          <div className="mt-1 text-xs text-red-800 font-mono">
            {fmt(kpis.criticalMtr)} Mtrs ({fmt(kpis.criticalMt, 2)} MT)
          </div>
        </div>

        {/* Warning Attention Card */}
        <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-900 uppercase tracking-wider">Attention (3–5 Days)</span>
            <Clock className="h-4 w-4 text-amber-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-amber-700 font-mono tracking-tight">{kpis.warningLots}</span>
            <span className="text-xs text-amber-600 font-medium">Lots</span>
          </div>
          <div className="mt-1 text-xs text-amber-800 font-medium">
            Approaching stagnation limit
          </div>
        </div>

        {/* Primary Bottleneck Work Center */}
        <div className="rounded-lg border border-slate-200 bg-white p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Primary Bottleneck</span>
            <Factory className="h-4 w-4 text-[#0078d4]" />
          </div>
          <div className="mt-2">
            <span className="text-sm font-black text-slate-900 truncate block">
              {kpis.topBottleneck}
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Work center with most stuck lots
          </div>
        </div>

        {/* Average Factory Dwell Time */}
        <div className="rounded-lg border border-slate-200 bg-white p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Avg Plant Dwell Time</span>
            <TrendingUp className="h-4 w-4 text-slate-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-slate-900 font-mono tracking-tight">{fmt(kpis.avgDays, 1)}</span>
            <span className="text-xs text-slate-600 font-medium">Days / Station</span>
          </div>
          <div className="mt-1 text-xs text-slate-500 font-mono">
            Total WIP: {fmt(kpis.totalWipMtr)} m ({fmt(kpis.totalWipMt, 1)} MT)
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-2xs">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              type="text"
              placeholder="Search WO, customer, grade, size..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 text-xs h-9"
            />
          </div>

          {/* Work Center Filter */}
          <div>
            <Select
              value={selectedStage}
              onChange={(e) => setSelectedStage(e.target.value)}
              className="text-xs h-9"
            >
              {STAGES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>

          {/* Severity Filter */}
          <div>
            <Select
              value={selectedSeverity}
              onChange={(e) => setSelectedSeverity(e.target.value)}
              className="text-xs h-9 font-semibold"
            >
              <option value="ALL">All Severity Tiers</option>
              <option value="CRITICAL">Critical Stagnant (&gt; 5 Days)</option>
              <option value="WARNING">Warning / Attention (3–5 Days)</option>
              <option value="NORMAL">Normal Flow (≤ 2 Days)</option>
            </Select>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="rounded-lg border border-slate-200 bg-white shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-2.5 px-3">Work Order</th>
                <th className="py-2.5 px-3">Customer</th>
                <th className="py-2.5 px-3">Grade & Size</th>
                <th className="py-2.5 px-3">Work Center</th>
                <th className="py-2.5 px-3 text-right">Physical WIP</th>
                <th className="py-2.5 px-3">Last Activity</th>
                <th className="py-2.5 px-3 text-center">Days Stuck</th>
                <th className="py-2.5 px-3 text-center">Severity</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-blue-600" />
                    Calculating station dwell times and physical WIP aging...
                  </td>
                </tr>
              ) : paginatedRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                    <div className="font-semibold text-slate-700">No stagnant material found</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      All physical work orders are within normal inter-stage production cycles.
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedRows.map((r) => {
                  const isCrit = r.severity === 'CRITICAL';
                  const isWarn = r.severity === 'WARNING';

                  return (
                    <tr
                      key={`${r.work_order_id}_${r.stage_code}`}
                      className={`transition hover:bg-blue-50/30 ${
                        isCrit ? 'bg-red-50/15' : isWarn ? 'bg-amber-50/10' : ''
                      }`}
                    >
                      {/* WO */}
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                        <button
                          type="button"
                          onClick={() => router.push(`/reports/tracking?wo=${encodeURIComponent(r.work_order_no)}`)}
                          className="hover:text-[#0078d4] hover:underline flex items-center gap-1 text-left"
                        >
                          {r.work_order_no}
                        </button>
                      </td>

                      {/* Customer */}
                      <td className="py-2.5 px-3 text-slate-600 max-w-[150px] truncate">
                        {r.customer_name || 'Generic Customer'}
                      </td>

                      {/* Grade & Size */}
                      <td className="py-2.5 px-3">
                        <div className="font-mono font-semibold text-slate-800">
                          {r.od} × {r.wt} mm
                        </div>
                        <div className="text-[10px] text-slate-400 truncate">
                          {r.grade}
                        </div>
                      </td>

                      {/* Work Center */}
                      <td className="py-2.5 px-3">
                        <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
                          <Factory className="h-3 w-3 text-slate-400" />
                          {r.stage_name}
                        </span>
                      </td>

                      {/* Physical WIP */}
                      <td className="py-2.5 px-3 text-right font-mono">
                        <div className="font-bold text-slate-900">{fmt(r.current_wip)} m</div>
                        <div className="text-[10px] text-slate-500">
                          {fmt(r.current_wip_pcs, 0)} pcs · {fmt(r.available_mt, 2)} MT
                        </div>
                      </td>

                      {/* Last Activity */}
                      <td className="py-2.5 px-3 font-mono text-slate-600">
                        {r.last_activity_date}
                      </td>

                      {/* Days Stuck */}
                      <td className="py-2.5 px-3 text-center">
                        <span className="font-mono font-black text-sm text-slate-900">
                          {r.days_stuck}
                        </span>
                        <span className="text-[10px] text-slate-500 block">Days</span>
                      </td>

                      {/* Severity Badge */}
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider font-mono border ${
                            isCrit
                              ? 'bg-red-100 text-red-800 border-red-300 animate-pulse'
                              : isWarn
                              ? 'bg-amber-100 text-amber-800 border-amber-300'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          }`}
                        >
                          {r.severity}
                        </span>
                      </td>

                      {/* Action Button */}
                      <td className="py-2.5 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => router.push(`/reports/tracking?wo=${encodeURIComponent(r.work_order_no)}`)}
                          className="inline-flex items-center gap-1 rounded bg-[#0078d4]/10 hover:bg-[#0078d4]/20 text-[#0078d4] font-semibold px-2.5 py-1 text-[11px] transition cursor-pointer"
                        >
                          <span>Track</span>
                          <ArrowRight className="h-3 w-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-2 text-xs">
            <span className="text-slate-500">
              Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, filteredRows.length)} of {filteredRows.length} lots
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded border border-slate-300 px-2.5 py-1 text-slate-700 disabled:opacity-40"
              >
                Previous
              </button>
              <span className="font-mono text-slate-700">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded border border-slate-300 px-2.5 py-1 text-slate-700 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
