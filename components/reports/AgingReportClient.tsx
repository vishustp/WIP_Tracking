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
import { isHollowBankOrder, extractPcsFromRemarks, extractBandSawCutsFromRemarks } from '@/lib/productionUtils';
import {
  type AgingRow,
  type AgingSeverity,
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
  normalizeAgingRow,
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

      // 1. Live Production Queue Engine (100% unified with WIP Matrix & Production Stations)
      let queueLoaded = false;
      try {
        const queueRes = await fetch(`/api/production/queue?all_stages=true&_t=${Date.now()}`);
        if (queueRes.ok) {
          const queueJson = await queueRes.json();
          if (queueJson?.success && Array.isArray(queueJson.data) && queueJson.data.length > 0) {
            const now = Date.now();
            const validRows: AgingRow[] = (queueJson.data as any[])
              .map((r: any) => {
                if (isHollowBankOrder(r)) return null;
                const sc = (r.stage_code || '').toUpperCase();
                if (sc === 'HOT_ROLLING' || sc === 'ROLLING') return null;

                const l1 = r.l1 != null ? Number(r.l1) : null;
                const l2 = r.l2 != null ? Number(r.l2) : null;
                const avgLen = Number(
                  r.avg_length ||
                  (l1 && l2 ? (l1 + l2) / 2 : l1 || l2 || 6.0)
                );

                const rawPcs = Number(
                  r.ready_pcs != null && Number(r.ready_pcs) > 0
                    ? r.ready_pcs
                    : (r.current_wip_pcs != null && Number(r.current_wip_pcs) > 0
                        ? r.current_wip_pcs
                        : (r.balance_to_make_pcs != null && Number(r.balance_to_make_pcs) > 0 ? r.balance_to_make_pcs : 0))
                );

                const rawMtr = Number(
                  r.ready_mtr != null && Number(r.ready_mtr) > 0
                    ? r.ready_mtr
                    : (r.current_wip != null && Number(r.current_wip) > 0
                        ? r.current_wip
                        : (r.balance_to_make_mtr != null && Number(r.balance_to_make_mtr) > 0 ? r.balance_to_make_mtr : 0))
                );

                let pcs = Math.round(rawPcs);
                let mtr = Number(rawMtr.toFixed(2));

                // If pieces is 0 but meters > 0, derive pieces from average pipe length
                if (pcs <= 0 && mtr > 0 && avgLen > 0) {
                  pcs = Math.max(1, Math.round(mtr / avgLen));
                }

                // If meters is 0 but pieces > 0, derive meters from pieces * average pipe length
                if (mtr <= 0 && pcs > 0 && avgLen > 0) {
                  mtr = Number((pcs * avgLen).toFixed(2));
                }

                // Strictly filter out any zero-piece or zero-meter rows (eliminates "0 nos" in Aging Report)
                if (pcs <= 0 || mtr <= 0) {
                  return null;
                }

                const mt = Number(Number(r.ready_mt ?? r.available_mt ?? 0).toFixed(2));
                const effectiveDate = r.last_activity_date || r.rolling_date || r.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10);
                const diffMs = now - new Date(effectiveDate).getTime();
                const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
                const severity: AgingSeverity = diffDays >= 15 ? 'CRITICAL' : diffDays >= 7 ? 'WARNING' : 'NORMAL';

                const woId = r.work_order_id || r.id;
                const ackObj = localAcks.find((a) => a.work_order_id === woId && a.stage_code === sc);

                const isSalvage = sc === 'VDI_SALVAGE' || (r.stage_name || '').toUpperCase().includes('SALVAGE');
                const isVdi = sc === 'VDI';
                const salvagePcs = (isSalvage || isVdi)
                  ? (Number(r.vdi_salvage_pcs || 0) > 0 ? Number(r.vdi_salvage_pcs) : (isSalvage ? pcs : 0))
                  : 0;
                const salvageMtr = (isSalvage || isVdi)
                  ? (Number(r.vdi_salvage_mtr || 0) > 0 ? Number(r.vdi_salvage_mtr) : (isSalvage ? mtr : 0))
                  : 0;

                  return {
                    work_order_id: woId,
                    work_order_no: r.work_order_no,
                    customer_name: r.customer_name || null,
                    grade: r.specification || r.grade || null,
                    od: Number(r.final_od || r.size_od || r.wo_od || r.od || 0),
                    wt: Number(r.final_wt || r.size_wt || r.wo_wt || r.wt || 0),
                    l1,
                    l2,
                    stage_id: r.stage_id,
                    stage_code: sc,
                    stage_name: r.stage_name || sc,
                    sequence_no: Number(r.sequence_no || 0),
                    current_wip: mtr,
                    current_wip_pcs: pcs,
                    available_mt: mt,
                    vdi_salvage_pcs: salvagePcs,
                    vdi_salvage_mtr: salvageMtr,
                    last_activity_date: effectiveDate,
                    days_stuck: diffDays,
                    severity,
                  is_acknowledged: Boolean(ackObj),
                  acknowledged_by: ackObj?.acknowledged_by || null,
                  ack_notes: ackObj?.notes || null,
                  ack_snooze_until: ackObj?.snooze_until || null,
                } as AgingRow;
              })
              .filter((r): r is AgingRow => r !== null)
              .sort((a: AgingRow, b: AgingRow) => b.days_stuck - a.days_stuck);

            setRows(validRows);
            setLoading(false);
            queueLoaded = true;
          }
        }
      } catch (queueErr) {
        console.warn('Queue API fetch failed in Aging Report, falling back to database view:', queueErr);
      }

      if (queueLoaded) {
        return;
      }

      // 2. Try reading from database view if present
      const { data: viewData, error: viewError } = await supabase
        .from('vw_wip_aging')
        .select('*')
        .gt('current_wip', 0)
        .order('days_stuck', { ascending: false });

      if (!viewError && Array.isArray(viewData) && viewData.length > 0) {
        // Query production logs and rejection declarations to eliminate phantom WIP and seconds
        const [{ data: prodLogs }, { data: rejDecls }] = await Promise.all([
          supabase
            .from('production_logs')
            .select('work_order_id, stage_id, output_qty, htc_ok, remarks, process_stages(stage_code)'),
          supabase
            .from('rejection_declarations')
            .select('work_order_id, work_center, rejected_pcs, rejected_mtr, qc_verified_pcs, qc_verified_mtr, ppc_approved_pcs, ppc_approved_mtr, status')
            .not('status', 'in', '("REJECTED_BY_QC","REJECTED_BY_PPC")'),
        ]);

        // Robust normalization merging database columns & local acknowledgements
        const normalizedRows: AgingRow[] = viewData
          .filter((r: any) => !isHollowBankOrder(r))
          .map((r: any) => normalizeAgingRow(r, localAcks, undefined, (rejDecls || []) as any))
          .filter((r: AgingRow) => !isHollowBankOrder(r) && r.current_wip_pcs > 0 && r.current_wip > 0)
          .filter((r: AgingRow) => {
            const sc = (r.stage_code || '').toUpperCase();
            if ((sc === 'DRAW' || sc === 'PILGER' || sc === 'HEAT_TREATMENT' || sc === 'HOLLOW_HEAT_TREATMENT') && Array.isArray(prodLogs)) {
              const woLogs = prodLogs.filter((l: any) => l.work_order_id === r.work_order_id);
              const curLogs = woLogs.filter((l: any) => (l.process_stages?.stage_code || '').toUpperCase() === sc || l.stage_id === r.stage_id);
              const curPcs = curLogs.reduce((acc: number, l: any) => {
                const { pcs } = extractPcsFromRemarks(l.remarks);
                return acc + (pcs || (r.l1 ? Math.round(Number(l.output_qty || 0) / Number(r.l1)) : 0));
              }, 0);

              const rollLogs = woLogs.filter((l: any) => (l.process_stages?.stage_code || '').toUpperCase() === 'ROLLING');
              const rollPcs = rollLogs.reduce((acc: number, l: any) => {
                const { pcs } = extractPcsFromRemarks(l.remarks);
                return acc + (pcs || 0);
              }, 0);

              const downLogs = woLogs.filter((l: any) => {
                const lsc = (l.process_stages?.stage_code || '').toUpperCase();
                if (sc === 'DRAW' || sc === 'PILGER') {
                  return lsc === 'HEAT_TREATMENT' || lsc === 'BAND_SAW' || lsc === 'VDI' || lsc === 'FINISHING';
                }
                if (sc === 'HEAT_TREATMENT') {
                  return lsc === 'BAND_SAW' || lsc === 'VDI' || lsc === 'FINISHING';
                }
                if (sc === 'HOLLOW_HEAT_TREATMENT') {
                  return lsc === 'DRAW' || lsc === 'PILGER' || lsc === 'HEAT_TREATMENT' || lsc === 'BAND_SAW' || lsc === 'VDI' || lsc === 'FINISHING';
                }
                return false;
              });
              const downPcs = downLogs.reduce((acc: number, l: any) => {
                const { pcs } = extractPcsFromRemarks(l.remarks);
                const { motherPcs } = extractBandSawCutsFromRemarks(l.remarks);
                return Math.max(acc, motherPcs || pcs || 0);
              }, 0);

              if (rollPcs > 0 && (curPcs >= rollPcs || downPcs >= rollPcs)) {
                return false;
              }
            }
            return true;
          });

        setRows(normalizedRows);
        setLoading(false);
        return;
      }

      // 2. Comprehensive fallback with accurate domain calculations
      const [wipRes, prodRes, qcRes, plansRes, woRes, routeStagesRes, ackRes, rejDeclRes] = await Promise.all([
        supabase.from('vw_route_stage_wip').select('*').gt('current_wip', 0).order('sequence_no', { ascending: true }),
        supabase.from('production_logs').select('work_order_id, stage_id, process_date, output_qty, htc_ok, remarks, process_stages(stage_code)').order('process_date', { ascending: false }),
        supabase.from('qc_inspections').select('work_order_id, inspection_date, vdi_ok_mtr, vdi_salvage_pcs, vdi_salvage_mtr').order('inspection_date', { ascending: false }),
        supabase.from('rolling_plans').select('work_order_id, status, mh_od, mh_wt, planned_rolling_date, created_at').not('status', 'is', null),
        supabase.from('work_orders').select('id, work_order_no, customer_name, grade, size_od, size_wt, l1, l2, created_at'),
        supabase.from('route_stages').select('route_id, stage_id, sequence_no, process_stages(stage_code)').order('sequence_no', { ascending: true }),
        supabase.from('aging_alert_acknowledgements').select('work_order_id, stage_code, acknowledged_by, notes, snooze_until'),
        supabase.from('rejection_declarations').select('work_order_id, work_center, rejected_pcs, rejected_mtr, qc_verified_pcs, qc_verified_mtr, ppc_approved_pcs, ppc_approved_mtr, status').not('status', 'in', '("REJECTED_BY_QC","REJECTED_BY_PPC")'),
      ]);

      const dbAcks: RawAcknowledgement[] = ackRes?.data || [];
      const combinedAcks = [...dbAcks, ...localAcks];

      const computed = computeAgingReportRows({
        wipRows: ((wipRes.data || []) as RawWipRow[]).filter((r) => !isHollowBankOrder(r)),
        workOrders: ((woRes.data || []) as RawWorkOrder[]).filter((w) => !isHollowBankOrder(w)),
        productionLogs: (prodRes.data || []) as RawProductionLog[],
        qcInspections: (qcRes.data || []) as RawQcInspection[],
        rollingPlans: (plansRes.data || []) as RawRollingPlan[],
        routeStages: (routeStagesRes.data || []) as RawRouteStage[],
        acknowledgements: combinedAcks,
        rejectionDeclarations: (rejDeclRes?.data || []) as any[],
        asOfDate: new Date(),
      });

      setRows(computed.filter((r) => !isHollowBankOrder(r) && r.current_wip_pcs > 0 && r.current_wip > 0));
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
      'L1 (m)': r.l1 ?? '—',
      'L2 (m)': r.l2 ?? '—',
      'Length Range (m)': r.l1 && r.l2 && r.l1 !== r.l2 ? `${r.l1} – ${r.l2}` : (r.l1 || r.l2 || '—'),
      'Work Center': r.stage_name,
      'VDI Salvage (Pcs)': r.vdi_salvage_pcs || 0,
      'VDI Salvage (Mtrs)': r.vdi_salvage_mtr || 0,
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Clock className="h-6 w-6 text-[#0078d4] dark:text-blue-400" />
              WIP Aging & Bottlenecks Analysis
            </h1>
            <span className="rounded-md bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 px-2.5 py-0.5 text-xs font-bold text-[#0078d4] dark:text-blue-400 font-mono">
              {filteredRows.length} Lots
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Real-time material stagnation tracking across plant work centers. Alerts highlight lots exceeding dwell time thresholds.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={loadData}
            disabled={loading}
            className="text-xs h-9 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
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
        <div className="rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50/40 dark:bg-red-950/20 p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-red-900 dark:text-red-200 uppercase tracking-wider">Critical Stagnant (&gt;5 Days)</span>
            <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-red-700 dark:text-red-400 font-mono tracking-tight">{kpis.criticalLots}</span>
            <span className="text-xs text-red-600 dark:text-red-400 font-medium">Lots</span>
          </div>
          <div className="mt-1 text-xs text-red-800 dark:text-red-300 font-mono font-medium">
            <span className="font-bold text-red-900 dark:text-red-100">{fmt(kpis.criticalPcs, 0)} PCS</span> · {fmt(kpis.criticalMtr)} m ({fmt(kpis.criticalMt, 2)} MT)
          </div>
        </div>

        {/* Warning Attention Card */}
        <div className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/20 p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-900 dark:text-amber-200 uppercase tracking-wider">Attention (3–5 Days)</span>
            <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-amber-700 dark:text-amber-400 font-mono tracking-tight">{kpis.warningLots}</span>
            <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">Lots</span>
          </div>
          <div className="mt-1 text-xs text-amber-800 dark:text-amber-300 font-medium">
            Approaching stagnation limit
          </div>
        </div>

        {/* Primary Bottleneck Work Center */}
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Primary Bottleneck</span>
            <Factory className="h-4 w-4 text-[#0078d4] dark:text-blue-400" />
          </div>
          <div className="mt-2">
            <span className="text-sm font-black text-slate-900 dark:text-slate-100 truncate block">
              {kpis.topBottleneck}
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Work center with most stalled lots
          </div>
        </div>

        {/* Average Factory Dwell Time */}
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Avg Plant Dwell Time</span>
            <TrendingUp className="h-4 w-4 text-slate-500 dark:text-slate-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-slate-900 dark:text-slate-100 font-mono tracking-tight">{fmt(kpis.avgDays, 1)}</span>
            <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">Days / Station</span>
          </div>
          <div className="mt-1 text-xs text-slate-600 dark:text-slate-300 font-mono">
            Total WIP: <span className="font-bold text-slate-900 dark:text-slate-100">{fmt(kpis.totalWipPcs, 0)} PCS</span> · {fmt(kpis.totalWipMtr)} m ({fmt(kpis.totalWipMt, 1)} MT)
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white dark:bg-slate-900 p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 shadow-2xs">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              type="text"
              placeholder="Search WO, customer, grade, size (e.g. 60.3)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 text-xs h-9 bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100"
            />
          </div>

          {/* Work Center Filter */}
          <div>
            <Select
              value={selectedStage}
              onChange={(e) => setSelectedStage(e.target.value)}
              className="text-xs h-9 bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100"
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
              className="text-xs h-9 font-semibold bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100"
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
      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs overflow-hidden">
        <div className="overflow-auto max-h-[70vh] relative">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[11px] shadow-2xs">
              <tr>
                <th className="py-2.5 px-3">Work Order</th>
                <th className="py-2.5 px-3">Customer</th>
                <th className="py-2.5 px-3">Grade & Size</th>
                <th className="py-2.5 px-3 text-center">Length (L1 / L2)</th>
                <th className="py-2.5 px-3">Work Center</th>
                <th className="py-2.5 px-3 text-right">VDI Salvage QTY</th>
                <th className="py-2.5 px-3 text-right">Physical WIP (PCS / MTR)</th>
                <th className="py-2.5 px-3">Last Activity</th>
                <th className="py-2.5 px-3 text-center">Days Stuck</th>
                <th className="py-2.5 px-3 text-center">Severity</th>
                <th className="py-2.5 px-3 text-center">Ack / Status</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-slate-400 dark:text-slate-500">
                    <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-blue-600" />
                    Calculating station dwell times and physical WIP aging...
                  </td>
                </tr>
              ) : paginatedRows.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-slate-400 dark:text-slate-500">
                    <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                    <div className="font-semibold text-slate-700 dark:text-slate-300">No stagnant material found</div>
                    <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
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
                      className={`transition hover:bg-blue-50/30 dark:hover:bg-slate-800/50 ${
                        isCrit ? 'bg-red-50/15 dark:bg-red-950/20' : isWarn ? 'bg-amber-50/10 dark:bg-amber-950/15' : ''
                      }`}
                    >
                      {/* WO */}
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900 dark:text-slate-100">
                        <button
                          type="button"
                          onClick={() => router.push(`/reports/tracking?wo=${encodeURIComponent(r.work_order_no)}`)}
                          className="hover:text-[#0078d4] dark:hover:text-blue-400 hover:underline flex items-center gap-1 text-left"
                        >
                          {r.work_order_no}
                        </button>
                      </td>

                      {/* Customer */}
                      <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300 max-w-[150px] truncate">
                        {r.customer_name || 'Generic Customer'}
                      </td>

                      {/* Grade & Size */}
                      <td className="py-2.5 px-3">
                        <div className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                          {r.od} × {r.wt} mm
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate font-mono">
                          {r.grade}
                        </div>
                        {(r.l1 || r.l2) && (
                          <div className="text-[10px] text-blue-600 dark:text-blue-400 font-mono mt-0.5">
                            L: {r.l1 && r.l2 && r.l1 !== r.l2 ? `${r.l1} – ${r.l2} m` : `${r.l1 || r.l2} m`}
                          </div>
                        )}
                      </td>

                      {/* Length (L1 / L2) */}
                      <td className="py-2.5 px-3 text-center font-mono">
                        {r.l1 || r.l2 ? (
                          <div>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                              {r.l1 && r.l2 && r.l1 !== r.l2 ? `${r.l1} – ${r.l2} m` : `${r.l1 || r.l2} m`}
                            </span>
                            {r.l1 && r.l2 && r.l1 !== r.l2 && (
                              <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                                L1: {r.l1}m · L2: {r.l2}m
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500 text-[11px]">—</span>
                        )}
                      </td>

                      {/* Work Center */}
                      <td className="py-2.5 px-3">
                        <span className="inline-flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300">
                          <Factory className="h-3 w-3 text-slate-400 dark:text-slate-500" />
                          {r.stage_name}
                        </span>
                      </td>

                      {/* VDI Salvage QTY */}
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                        {(r.vdi_salvage_pcs && r.vdi_salvage_pcs > 0) || (r.vdi_salvage_mtr && r.vdi_salvage_mtr > 0) ? (
                          <div>
                            <div className="flex items-center justify-end gap-1 mb-1">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-black bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-700 shadow-2xs">
                                <span className="font-mono text-[13px]">{fmt(r.vdi_salvage_pcs || 0, 0)}</span>
                                <span className="text-[10px] uppercase font-sans font-bold tracking-wider">PCS</span>
                              </span>
                            </div>
                            <div className="text-[11px] font-medium text-amber-800 dark:text-amber-300">
                              {fmt(r.vdi_salvage_mtr || 0)} <span className="text-[10px] text-amber-600 dark:text-amber-400">m</span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500 font-mono text-[12px]">—</span>
                        )}
                      </td>

                      {/* Physical WIP with Highlighted PCS */}
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                        <div className="flex items-center justify-end gap-1 mb-1">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-black bg-blue-100 text-blue-800 border border-blue-300 dark:bg-blue-950/60 dark:text-blue-200 dark:border-blue-700 shadow-2xs">
                            <span className="font-mono text-[13px]">{fmt(r.current_wip_pcs, 0)}</span>
                            <span className="text-[10px] uppercase font-sans font-bold tracking-wider">PCS</span>
                          </span>
                        </div>
                        <div className="text-[11px] font-medium text-slate-700 dark:text-slate-300">
                          {fmt(r.current_wip)} <span className="text-[10px] text-slate-500 dark:text-slate-400">m</span>
                          <span className="mx-1 text-slate-300 dark:text-slate-600">·</span>
                          {fmt(r.available_mt, 2)} <span className="text-[10px] text-slate-500 dark:text-slate-400">MT</span>
                        </div>
                      </td>

                      {/* Last Activity */}
                      <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-slate-300">
                        {r.last_activity_date}
                      </td>

                      {/* Days Stuck */}
                      <td className="py-2.5 px-3 text-center">
                        <span className="font-mono font-black text-sm text-slate-900 dark:text-slate-100">
                          {r.days_stuck}
                        </span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Days</span>
                      </td>

                      {/* Severity Badge */}
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider font-mono border ${
                            isCrit
                              ? 'bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300 border-red-300 dark:border-red-800 animate-pulse'
                              : isWarn
                              ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                              : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
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
                            className="inline-flex items-center gap-1 rounded bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 font-mono"
                          >
                            <ShieldCheck className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                            <span>Snoozed</span>
                          </span>
                        ) : isCrit || isWarn ? (
                          <button
                            type="button"
                            onClick={() => handleAcknowledge(r)}
                            disabled={isAcking}
                            className="inline-flex items-center gap-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 px-2 py-1 text-[10px] font-medium transition cursor-pointer border border-slate-200 dark:border-slate-700"
                          >
                            <Check className="h-3 w-3 text-slate-500 dark:text-slate-400" />
                            <span>{isAcking ? 'Snoozing...' : 'Acknowledge'}</span>
                          </button>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500 text-[10px]">Normal</span>
                        )}
                      </td>

                      {/* Action Button */}
                      <td className="py-2.5 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => router.push(`/reports/tracking?wo=${encodeURIComponent(r.work_order_no)}`)}
                          className="inline-flex items-center gap-1 rounded bg-[#0078d4]/10 hover:bg-[#0078d4]/20 text-[#0078d4] dark:text-blue-400 font-semibold px-2.5 py-1 text-[11px] transition cursor-pointer"
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
          <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 px-4 py-2 text-xs">
            <span className="text-slate-500 dark:text-slate-400">
              Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, filteredRows.length)} of {filteredRows.length} lots
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1 text-slate-700 dark:text-slate-300 disabled:opacity-40"
              >
                Previous
              </button>
              <span className="font-mono text-slate-700 dark:text-slate-300">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1 text-slate-700 dark:text-slate-300 disabled:opacity-40"
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
