'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { exportJsonToExcel } from '@/lib/excelUtils';
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
  ArrowRight,
  TrendingUp,
  ShieldCheck,
  Check,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  type AgingRow,
  type RawWipRow,
  type RawProductionLog,
  type RawQcInspection,
  type RawRollingPlan,
  type RawWorkOrder,
  type RawRouteStage,
  type RawAcknowledgement,
  AGING_STAGES,
  computeAgingReportRows,
  computeAgingKpis,
  filterAgingRows,
} from '@/lib/reports/agingReportHelper';

const fmt = (n: number | null | undefined, digits = 2) =>
  n == null || isNaN(n) ? '—' : Number(n).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });

export default function AgingReportClient() {
  const router = useRouter();
  const [rows, setRows] = useState<AgingRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [selectedStage, setSelectedStage] = useState<string>('ALL');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('ALL');
  const [page, setPage] = useState<number>(1);
  const [acknowledgingKey, setAcknowledgingKey] = useState<string | null>(null);
  const pageSize = 50;

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const supabase = createClient();

      // Read local acknowledgements from localStorage
      const localAcks: RawAcknowledgement[] = [];
      try {
        if (typeof window !== 'undefined') {
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.startsWith('aging_ack_')) {
              const val = localStorage.getItem(key);
              if (val) {
                const parsed = JSON.parse(val);
                localAcks.push(parsed);
              }
            }
          }
        }
      } catch {}

      // 1. Try reading from database view if present
      const { data: viewData, error: viewError } = await supabase
        .from('vw_wip_aging')
        .select('*')
        .gt('current_wip', 0)
        .order('days_stuck', { ascending: false });

      if (!viewError && Array.isArray(viewData) && viewData.length > 0) {
        // Merge with local acknowledgements if any
        const rowsWithLocalAck: AgingRow[] = viewData.map((r: any) => {
          const matchLocal = localAcks.find(
            (a) => a.work_order_id === r.work_order_id && a.stage_code === r.stage_code
          );
          if (matchLocal && (!matchLocal.snooze_until || matchLocal.snooze_until >= new Date().toISOString().slice(0, 10))) {
            return {
              ...r,
              is_acknowledged: true,
              acknowledged_by: matchLocal.acknowledged_by || r.acknowledged_by,
              ack_notes: matchLocal.notes || r.ack_notes,
              ack_snooze_until: matchLocal.snooze_until || r.ack_snooze_until,
            };
          }
          return r as AgingRow;
        });

        setRows(rowsWithLocalAck);
        setLoading(false);
        return;
      }

      // 2. Comprehensive fallback with accurate domain calculations
      const [wipRes, prodRes, qcRes, plansRes, woRes, routeStagesRes, ackRes] = await Promise.all([
        supabase.from('vw_route_stage_wip').select('*').gt('current_wip', 0).order('sequence_no', { ascending: true }),
        supabase.from('production_logs').select('work_order_id, stage_id, process_date, output_qty, htc_ok').order('process_date', { ascending: false }),
        supabase.from('qc_inspections').select('work_order_id, inspection_date, vdi_ok_mtr').order('inspection_date', { ascending: false }),
        supabase.from('rolling_plans').select('work_order_id, status, mh_od, mh_wt, rolling_date, created_at').not('status', 'is', null),
        supabase.from('work_orders').select('id, work_order_no, customer_name, grade, size_od, size_wt, l1, l2, created_at'),
        supabase.from('route_stages').select('route_id, stage_id, sequence_no, process_stages(stage_code)').order('sequence_no', { ascending: true }),
        supabase.from('aging_alert_acknowledgements').select('work_order_id, stage_code, acknowledged_by, notes, snooze_until'),
      ]);

      const dbAcks: RawAcknowledgement[] = ackRes?.data || [];
      const combinedAcks = [...dbAcks, ...localAcks];

      const computed = computeAgingReportRows({
        wipRows: (wipRes.data || []) as RawWipRow[],
        workOrders: (woRes.data || []) as RawWorkOrder[],
        productionLogs: (prodRes.data || []) as RawProductionLog[],
        qcInspections: (qcRes.data || []) as RawQcInspection[],
        rollingPlans: (plansRes.data || []) as RawRollingPlan[],
        routeStages: (routeStagesRes.data || []) as RawRouteStage[],
        acknowledgements: combinedAcks,
        asOfDate: new Date(),
      });

      setRows(computed);
    } catch (err) {
      toast.error('Failed to load WIP aging data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Acknowledge / Snooze alert
  const handleAcknowledge = async (row: AgingRow) => {
    const key = `${row.work_order_id}_${row.stage_code}`;
    setAcknowledgingKey(key);
    try {
      const snoozeDate = new Date();
      snoozeDate.setDate(snoozeDate.getDate() + 2); // 2-day snooze
      const snoozeDateStr = snoozeDate.toISOString().slice(0, 10);

      const ackData: RawAcknowledgement = {
        work_order_id: row.work_order_id,
        stage_code: row.stage_code,
        acknowledged_by: 'Shop Floor Supervisor',
        notes: `Acknowledged via Aging Report Console on ${new Date().toLocaleDateString('en-GB')}`,
        snooze_until: snoozeDateStr,
      };

      // 1. Save locally to localStorage for immediate resilience
      try {
        localStorage.setItem(`aging_ack_${key}`, JSON.stringify(ackData));
      } catch {}

      // 2. Try upserting to remote DB table
      const supabase = createClient();
      await supabase.from('aging_alert_acknowledgements').upsert(
        {
          work_order_id: row.work_order_id,
          stage_code: row.stage_code,
          acknowledged_by: ackData.acknowledged_by,
          notes: ackData.notes,
          snooze_until: ackData.snooze_until,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'work_order_id,stage_code' }
      );

      // 3. Update local row state
      setRows((prev) =>
        prev.map((r) =>
          r.work_order_id === row.work_order_id && r.stage_code === row.stage_code
            ? {
                ...r,
                is_acknowledged: true,
                acknowledged_by: ackData.acknowledged_by,
                ack_notes: ackData.notes,
                ack_snooze_until: ackData.snooze_until,
              }
            : r
        )
      );

      toast.success(`WO ${row.work_order_no} at ${row.stage_name} acknowledged & snoozed for 2 days.`);
    } catch {
      toast.error('Could not save acknowledgement to server, cached locally.');
    } finally {
      setAcknowledgingKey(null);
    }
  };

  // Filtered rows
  const filteredRows = useMemo(() => {
    return filterAgingRows(rows, {
      selectedStage,
      selectedSeverity,
      search,
    });
  }, [rows, selectedStage, selectedSeverity, search]);

  // KPI Metrics
  const kpis = useMemo(() => {
    return computeAgingKpis(rows);
  }, [rows]);

  const paginatedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, page]);

  const totalPages = Math.ceil(filteredRows.length / pageSize) || 1;

  // Excel Export
  const exportExcel = async () => {
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
      'Acknowledged By': r.acknowledged_by || '—',
      'Snooze Until': r.ack_snooze_until || '—',
    }));

    await exportJsonToExcel(
      exportData,
      'WIP Aging',
      `wip-aging-bottleneck-report-${new Date().toISOString().slice(0, 10)}.xlsx`
    );
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
            Work center with most stalled lots
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
              placeholder="Search WO, customer, grade, size (e.g. 60.3)..."
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
              {AGING_STAGES.map((s) => (
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
        <div className="overflow-auto max-h-[70vh] relative">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 z-20 bg-slate-100 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px] shadow-2xs">
              <tr>
                <th className="py-2.5 px-3">Work Order</th>
                <th className="py-2.5 px-3">Customer</th>
                <th className="py-2.5 px-3">Grade & Size</th>
                <th className="py-2.5 px-3">Work Center</th>
                <th className="py-2.5 px-3 text-right">Physical WIP</th>
                <th className="py-2.5 px-3">Last Activity</th>
                <th className="py-2.5 px-3 text-center">Days Stuck</th>
                <th className="py-2.5 px-3 text-center">Severity</th>
                <th className="py-2.5 px-3 text-center">Ack / Status</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-blue-600" />
                    Calculating station dwell times and physical WIP aging...
                  </td>
                </tr>
              ) : paginatedRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
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
                  const key = `${r.work_order_id}_${r.stage_code}`;
                  const isAcking = acknowledgingKey === key;

                  return (
                    <tr
                      key={key}
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
                        <div className="text-[10px] text-slate-500 truncate font-mono">
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
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">
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

                      {/* Ack / Status */}
                      <td className="py-2.5 px-3 text-center">
                        {r.is_acknowledged ? (
                          <span
                            title={`Snoozed until ${r.ack_snooze_until || 'active'}${r.ack_notes ? ` - ${r.ack_notes}` : ''}`}
                            className="inline-flex items-center gap-1 rounded bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 font-mono"
                          >
                            <ShieldCheck className="h-3 w-3 text-emerald-600" />
                            <span>Snoozed</span>
                          </span>
                        ) : isCrit || isWarn ? (
                          <button
                            type="button"
                            onClick={() => handleAcknowledge(r)}
                            disabled={isAcking}
                            className="inline-flex items-center gap-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 text-[10px] font-medium transition cursor-pointer"
                          >
                            <Check className="h-3 w-3 text-slate-500" />
                            <span>{isAcking ? 'Snoozing...' : 'Acknowledge'}</span>
                          </button>
                        ) : (
                          <span className="text-slate-400 text-[10px]">Normal</span>
                        )}
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
