// components/planning/DailyPlanningConsoleClient.tsx
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  CalendarDays,
  Clock,
  Printer,
  Download,
  RefreshCw,
  Search,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertTriangle,
  Factory,
  Flame,
  Wrench,
  Layers,
  ClipboardCheck,
  ChevronRight,
  ShieldCheck,
  SlidersHorizontal,
  X,
  ArrowRight,
  Save,
  FileSpreadsheet,
  Table,
  LayoutGrid,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import {
  DailyPlanItemWithWorkOrder,
  DailyPlanShift,
  DailyPlanWorkCenter,
} from '@/types/dailyPlanning';
import {
  STATION_LABELS,
  SHIFT_LABELS,
  STATION_MACHINE_PRESETS,
  calculatePlanCompliance,
  calculateStationPlannedTotals,
  buildDailyPlanCsv,
  filterEligibleWipQueue,
  filterUnplannedWipQueue,
  isWorkOrderPlanned,
} from '@/lib/planning/dailyPlanningHelper';
import { mtFromMtr, mtrFromPcs } from '@/lib/productionUtils';

interface StationGroup {
  id: string;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  workCenters: DailyPlanWorkCenter[];
  description: string;
}

const STATION_GROUPS: StationGroup[] = [
  {
    id: 'DRAW_PILGER',
    label: 'Cold Draw & Pilger Mill',
    shortLabel: 'Draw & Pilger',
    icon: Wrench,
    workCenters: ['DRAW', 'PILGER'],
    description: 'Cold drawing and pilger reduction sizing, bench assignment, and pass targets.',
  },
  {
    id: 'HEAT_TREATMENT',
    label: 'Furnace Heat Treatment',
    shortLabel: 'Heat Treatment',
    icon: Flame,
    workCenters: ['HEAT_TREATMENT', 'HOLLOW_HEAT_TREATMENT'],
    description: 'Normalizing, annealing, and quench & temper furnace charges and soaking recipes.',
  },
  {
    id: 'FINISHING',
    label: 'Finishing, Cutting & Dispatch',
    shortLabel: 'Finishing Line',
    icon: Factory,
    workCenters: ['HEAT_TREATMENT', 'BAND_SAW', 'VDI', 'FINISHING'],
    description: 'Furnace heat treatment, band saw cutting, inspection, and dispatch bundling.',
  },
];

const fmt = (n: number | null | undefined, digits = 2) =>
  n == null ? '—' : Number(n).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });

export default function DailyPlanningConsoleClient() {
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [selectedShift, setSelectedShift] = useState<DailyPlanShift>('ALL_DAY');
  const [selectedGroupId, setSelectedGroupId] = useState<string>('DRAW_PILGER');
  const [activeWc, setActiveWc] = useState<DailyPlanWorkCenter>('DRAW');

  const [plans, setPlans] = useState<DailyPlanItemWithWorkOrder[]>([]);
  const [wipQueue, setWipQueue] = useState<any[]>([]);
  const [workCenterSummaries, setWorkCenterSummaries] = useState<Record<string, { availPcs: number; availMtr: number; count: number }>>({});
  const [loading, setLoading] = useState(true);
  const [queueLoading, setQueueLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);

  // Search filter
  const [search, setSearch] = useState('');

  // Target entry modal / state
  const [showAddModal, setShowAddModal] = useState(false);
  const [modalItem, setModalItem] = useState<any | null>(null);
  const [modalPlanDate, setModalPlanDate] = useState<string>(selectedDate);
  const [modalShift, setModalShift] = useState<DailyPlanShift>(selectedShift);
  const [modalWc, setModalWc] = useState<DailyPlanWorkCenter>(activeWc);
  const [queueTab, setQueueTab] = useState<'UNPLANNED' | 'READY' | 'FEEDER' | 'ALL'>('UNPLANNED');
  const [targetPcs, setTargetPcs] = useState<number>(0);
  const [targetMtr, setTargetMtr] = useState<number>(0);
  const [targetMt, setTargetMt] = useState<number>(0);
  const [machineId, setMachineId] = useState<string>('');
  const [chargeNo, setChargeNo] = useState<string>('');
  const [passNo, setPassNo] = useState<string>('');
  const [priorityRank, setPriorityRank] = useState<number>(1);
  const [notes, setNotes] = useState<string>('');
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);

  // View mode: Factory Mill Form Table vs Card Progress View
  const [planViewMode, setPlanViewMode] = useState<'MILL_TABLE' | 'CARDS'>('MILL_TABLE');
  const [isExpandedTable, setIsExpandedTable] = useState<boolean>(false);

  // Format header date string matching factory format: "DD -MM-MMM -YYYY"
  const formattedHeaderDate = useMemo(() => {
    try {
      const d = new Date(selectedDate);
      if (isNaN(d.getTime())) return selectedDate;
      const day = String(d.getDate()).padStart(2, '0');
      const monthNum = String(d.getMonth() + 1).padStart(2, '0');
      const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
      const monthStr = monthNames[d.getMonth()];
      const year = d.getFullYear();
      return `${day} -${monthNum}-${monthStr} -${year}`;
    } catch {
      return selectedDate;
    }
  }, [selectedDate]);

  // Format revision date (prior day): "DD-Mmm"
  const formattedRevDate = useMemo(() => {
    try {
      const d = new Date(selectedDate);
      d.setDate(d.getDate() - 1);
      const day = String(d.getDate()).padStart(2, '0');
      const monthShort = d.toLocaleString('en-US', { month: 'short' });
      return `${day}-${monthShort}`;
    } catch {
      return '06-Oct';
    }
  }, [selectedDate]);

  const activeGroup = useMemo(
    () => STATION_GROUPS.find((g) => g.id === selectedGroupId) || STATION_GROUPS[0],
    [selectedGroupId]
  );

  // Load plans from API
  const loadPlans = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/daily-plans?date=${selectedDate}&shift=${selectedShift}`, {
        cache: 'no-store',
      });
      const data = await res.json();
      if (data.error) {
        setDbError(data.error);
      } else {
        setDbError(null);
      }
      if (data.plans) {
        setPlans(data.plans);
      } else {
        setPlans([]);
      }
    } catch (err: any) {
      console.error('Failed to load daily plans:', err);
      toast.error('Failed to load daily plans.');
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }, [selectedDate, selectedShift]);

  // Load active stage WIP queue for the selected work center (including upstream feeder WIP)
  const loadStageQueue = useCallback(async () => {
    setQueueLoading(true);
    try {
      const res = await fetch(`/api/production/queue?stage=${activeWc}&include_feeder=true&_t=${Date.now()}`, {
        cache: 'no-store',
      });
      if (res.ok) {
        const json = await res.json();
        const rows = Array.isArray(json?.data) ? json.data : Array.isArray(json?.rows) ? json.rows : [];
        setWipQueue(rows);
        if (Array.isArray(json?.summary)) {
          const map: Record<string, { availPcs: number; availMtr: number; count: number }> = {};
          json.summary.forEach((s: any) => {
            map[s.stage_code] = {
              availPcs: Number(s.availPcs || 0),
              availMtr: Number(s.availMtr || 0),
              count: Number(s.count || 0),
            };
          });
          setWorkCenterSummaries(map);
        }
      } else {
        setWipQueue([]);
      }
    } catch (err: any) {
      console.error('Failed to load queue:', err);
      setWipQueue([]);
    } finally {
      setQueueLoading(false);
    }
  }, [activeWc]);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  useEffect(() => {
    loadStageQueue();
  }, [loadStageQueue]);

  // When switching station group, select first available work center
  const handleGroupSelect = (groupId: string) => {
    setSelectedGroupId(groupId);
    const grp = STATION_GROUPS.find((g) => g.id === groupId);
    if (grp && grp.workCenters.length > 0) {
      setActiveWc(grp.workCenters[0]);
    }
  };

  // Filter plans for active work center
  const filteredPlans = useMemo(() => {
    return plans.filter((p) => p.work_center === activeWc);
  }, [plans, activeWc]);

  // Lookup map of existing plans by work order id for active work center & date
  const plansByWoId = useMemo(() => {
    const map = new Map<string, DailyPlanItemWithWorkOrder>();
    for (const p of filteredPlans) {
      if (p.work_order_id) {
        map.set(p.work_order_id, p);
      }
    }
    return map;
  }, [filteredPlans]);

  // Filter WIP queue with tab selector (Unplanned vs Ready vs Feeder vs All)
  const eligibleQueue = useMemo(() => {
    let list = filterEligibleWipQueue(wipQueue);
    if (queueTab === 'UNPLANNED') {
      list = list.filter((r) => !isWorkOrderPlanned(r, plansByWoId));
    } else if (queueTab === 'READY') {
      list = list.filter((r) => Number(r.ready_pcs ?? r.available_pcs ?? 0) >= 1 && !r.is_feeder_source);
    } else if (queueTab === 'FEEDER') {
      list = list.filter((r) => r.is_feeder_source || (Number(r.feeder_pcs ?? 0) >= 1 && Number(r.ready_pcs ?? 0) === 0));
    }
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(
      (r) =>
        (r.work_order_no || '').toLowerCase().includes(q) ||
        (r.customer_name || '').toLowerCase().includes(q) ||
        (r.grade || r.specification || '').toLowerCase().includes(q) ||
        (r.feeder_source_label || '').toLowerCase().includes(q)
    );
  }, [wipQueue, queueTab, search, plansByWoId]);

  const unplannedQueueCount = useMemo(() => {
    return filterUnplannedWipQueue(wipQueue, plansByWoId).length;
  }, [wipQueue, plansByWoId]);

  const readyQueueCount = useMemo(() => {
    return filterEligibleWipQueue(wipQueue).filter(
      (r) => Number(r.ready_pcs ?? r.available_pcs ?? 0) >= 1 && !r.is_feeder_source
    ).length;
  }, [wipQueue]);

  const feederQueueCount = useMemo(() => {
    return filterEligibleWipQueue(wipQueue).filter(
      (r) => r.is_feeder_source || (Number(r.feeder_pcs ?? 0) >= 1 && Number(r.ready_pcs ?? 0) === 0)
    ).length;
  }, [wipQueue]);

  // Compute station totals
  const stationSummary = useMemo(() => {
    return calculateStationPlannedTotals(activeWc, plans);
  }, [activeWc, plans]);

  // Open planning modal for queue item
  const openScheduleModal = (item: any, existingPlan?: DailyPlanItemWithWorkOrder) => {
    setModalItem(item);
    const planToEdit = existingPlan || plansByWoId.get(item.work_order_id || item.id);
    if (planToEdit) {
      setEditingPlanId(planToEdit.id);
      setModalPlanDate(planToEdit.plan_date || selectedDate);
      setModalShift(planToEdit.shift || selectedShift);
      setModalWc(planToEdit.work_center || activeWc);
      setTargetPcs(planToEdit.target_pcs);
      setTargetMtr(planToEdit.target_mtr);
      setTargetMt(planToEdit.target_mt);
      setMachineId(planToEdit.machine_id || '');
      setChargeNo(planToEdit.charge_no || '');
      setPassNo(planToEdit.pass_no || '');
      setPriorityRank(planToEdit.priority_rank);
      setNotes(planToEdit.notes || '');
    } else {
      setEditingPlanId(null);
      setModalPlanDate(selectedDate);
      setModalShift(selectedShift);
      setModalWc(activeWc);
      const hasReady = Number(item.ready_pcs ?? 0) >= 1 && !item.is_feeder_source;
      const availPcs = hasReady
        ? Number(item.ready_pcs)
        : Number(item.balance_to_make_pcs ?? item.feeder_pcs ?? item.available_pcs ?? 0);
      const availMtr = hasReady
        ? Number(item.ready_mtr || 0)
        : Number(item.balance_to_make_mtr ?? item.feeder_mtr ?? item.available_mtr ?? 0);
      const od = Number(item.od ?? item.size_od ?? 60.3);
      const wt = Number(item.wl ?? item.wt ?? item.size_wt ?? 3.91);
      const avgLen = Number(item.avg_length || 6);

      setTargetPcs(availPcs);
      const calcMtr = availMtr > 0 ? availMtr : mtrFromPcs(availPcs, avgLen);
      setTargetMtr(Number(calcMtr.toFixed(2)));
      setTargetMt(Number(mtFromMtr(calcMtr, od, wt).toFixed(3)));
      setMachineId('');
      setChargeNo('');
      setPassNo('');
      setPriorityRank(filteredPlans.length + 1);
      setNotes('');
    }
    setShowAddModal(true);
  };

  // Save daily plan
  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalItem) return;

    if (targetPcs <= 0 && targetMtr <= 0) {
      toast.error('Please specify target pieces or meters.');
      return;
    }

    const woId = modalItem.work_order_id || modalItem.id;
    // Auto-link to existing plan on modalPlanDate to avoid duplicate creation
    let planIdToSubmit = editingPlanId;
    if (!planIdToSubmit) {
      const match = plans.find(
        (p) => p.work_order_id === woId && p.work_center === modalWc && p.plan_date === modalPlanDate
      );
      if (match) {
        planIdToSubmit = match.id;
      }
    }

    setSaving(true);
    try {
      const res = await fetch('/api/daily-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: planIdToSubmit,
          plan_date: modalPlanDate,
          shift: modalShift,
          work_center: modalWc,
          work_order_id: woId,
          target_pcs: targetPcs,
          target_mtr: targetMtr,
          target_mt: targetMt,
          machine_id: machineId,
          charge_no: chargeNo,
          pass_no: passNo,
          priority_rank: priorityRank,
          notes,
          status: 'PLANNED',
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save daily plan');

      toast.success(
        planIdToSubmit
          ? `Updated plan target for ${modalItem.work_order_no} (${modalPlanDate})`
          : `Scheduled ${modalItem.work_order_no} for ${STATION_LABELS[modalWc]} on ${modalPlanDate}`
      );
      setShowAddModal(false);
      if (modalPlanDate !== selectedDate) {
        setSelectedDate(modalPlanDate);
      }
      if (modalShift !== selectedShift) {
        setSelectedShift(modalShift);
      }
      if (modalWc !== activeWc) {
        setActiveWc(modalWc);
      }
      loadPlans();
    } catch (err: any) {
      console.error('Failed to save daily plan:', err);
      toast.error(err?.message || 'Failed to save daily plan');
    } finally {
      setSaving(false);
    }
  };

  // Delete daily plan
  const handleDeletePlan = async (id: string, woNo: string) => {
    if (!confirm(`Remove daily plan target for ${woNo}?`)) return;

    try {
      const res = await fetch(`/api/daily-plans?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete daily plan');
      toast.success(`Removed daily plan for ${woNo}`);
      loadPlans();
    } catch (err: any) {
      console.error('Failed to delete plan:', err);
      toast.error('Failed to delete plan');
    }
  };

  // Export CSV
  const handleExportCsv = () => {
    if (plans.length === 0) {
      toast.error('No daily plans to export.');
      return;
    }
    const csv = buildDailyPlanCsv(plans, selectedDate, selectedShift);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Daily_Production_Plan_${selectedDate}_${selectedShift}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Daily plan exported to CSV.');
  };

  const machinePresets = STATION_MACHINE_PRESETS[modalWc || activeWc] || [];

  return (
    <div className="space-y-6 print:space-y-4 print:p-0">
      {/* Header Toolbar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 dark:bg-slate-800 text-slate-100 dark:text-slate-200 px-2.5 py-1 text-[11px] font-bold tracking-wider uppercase shadow-2xs border border-slate-700/60">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              PPC MASTER SCHEDULE · DAILY SHIFT PLANNING
            </span>
            <span className="text-xs font-mono font-semibold text-slate-500">REF: RGHS/PRD-PLAN-01</span>
          </div>
          <div className="mt-2 flex items-baseline gap-3 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white font-sans">
              Unified Daily Planning Console
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold font-mono bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
              {SHIFT_LABELS[selectedShift]}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
            Allocate shift targets for Draw Benches, Heat Treatment Furnaces, and Finishing Lines. Targets automatically reflect as priorities on shop floor production terminals.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              loadPlans();
              loadStageQueue();
            }}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-2xs hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer active:scale-95 disabled:opacity-60"
            title="Refresh plans and stage WIP"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-blue-600' : 'text-slate-500 dark:text-slate-400'}`} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-2xs hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer active:scale-95"
            title="Export shift plans to CSV"
          >
            <Download className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-slate-800 dark:hover:bg-blue-500 transition cursor-pointer active:scale-95"
            title="Print daily planning sheet"
          >
            <Printer className="h-4 w-4" />
            <span>Print Schedule</span>
          </button>
        </div>
      </div>

      {/* Database Action Required Banner */}
      {dbError && (
        <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50/95 dark:bg-amber-950/40 p-4 shadow-xs text-xs text-amber-900 dark:text-amber-200 print:hidden">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1.5 flex-1 min-w-0">
              <div className="font-bold text-sm text-amber-950 dark:text-amber-100 flex items-center gap-2">
                <span>Database Permission Required</span>
                <span className="font-mono text-[10px] bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 px-1.5 py-0.5 rounded font-semibold">
                  Migration 069
                </span>
              </div>
              <p className="text-amber-800 dark:text-amber-300 leading-relaxed">
                Supabase database responded: <code className="font-mono bg-amber-100 dark:bg-amber-900/60 px-1 py-0.5 rounded text-[11px] font-semibold">{dbError}</code>.
                Please execute the grant statement below in your Supabase SQL Editor to grant table privileges:
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <code className="font-mono text-xs bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 rounded px-2.5 py-1 text-slate-800 dark:text-slate-100 select-all font-semibold">
                  GRANT ALL ON public.daily_production_plans TO authenticated, anon, service_role;
                </code>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText('GRANT ALL ON public.daily_production_plans TO authenticated, anon, service_role;');
                    toast.success('SQL copied to clipboard! Paste into Supabase SQL editor and execute.');
                  }}
                  className="rounded bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-semibold px-2.5 py-1 text-xs transition cursor-pointer shadow-2xs"
                >
                  Copy SQL
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Date & Shift Filter Bar */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-4 shadow-2xs print:border-black print:p-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-slate-500" />
              <label htmlFor="plan-date" className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Plan Date:
              </label>
              <input
                id="plan-date"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1 text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-hidden"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedDate(new Date().toISOString().slice(0, 10))}
                className="px-2 py-1 text-[11px] font-bold rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 cursor-pointer"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => {
                  const d = new Date();
                  d.setDate(d.getDate() + 1);
                  setSelectedDate(d.toISOString().slice(0, 10));
                }}
                className="px-2 py-1 text-[11px] font-bold rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 cursor-pointer"
              >
                Tomorrow
              </button>
            </div>
          </div>

          {/* Shift Switcher & Report Link */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">Shift:</span>
              <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 p-0.5">
                {(['ALL_DAY', 'SHIFT_A', 'SHIFT_B', 'SHIFT_C'] as DailyPlanShift[]).map((sh) => (
                  <button
                    key={sh}
                    type="button"
                    onClick={() => setSelectedShift(sh)}
                    className={`px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                      selectedShift === sh
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                    }`}
                  >
                    {sh === 'ALL_DAY' ? 'All Day' : sh.replace('SHIFT_', 'Shift ')}
                  </button>
                ))}
              </div>
            </div>

            <Link
              href={`/reports/daily-plan?date=${selectedDate}&shift=${selectedShift}&format=${selectedGroupId === 'DRAW_PILGER' ? 'F_PROD_003' : 'F_PROD_005'}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 text-xs font-bold transition shadow-2xs"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Mill Report (F PROD-003/005)
            </Link>
          </div>
        </div>
      </div>

      {/* Station Groups Selector (Process Track) */}
      <div className="print:hidden">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {STATION_GROUPS.map((grp) => {
            const isSelected = selectedGroupId === grp.id;
            const Icon = grp.icon;
            const groupTotalPcs = grp.workCenters.reduce((sum, wc) => sum + (workCenterSummaries[wc]?.availPcs || 0), 0);
            const groupTotalOrders = grp.workCenters.reduce((sum, wc) => sum + (workCenterSummaries[wc]?.count || 0), 0);

            return (
              <button
                key={grp.id}
                type="button"
                onClick={() => handleGroupSelect(grp.id)}
                className={`p-3.5 rounded-xl border text-left transition cursor-pointer ${
                  isSelected
                    ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-900 dark:border-slate-100 shadow-sm ring-2 ring-slate-900/10'
                    : 'bg-white dark:bg-slate-800/90 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/80'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Icon className={`h-5 w-5 ${isSelected ? 'text-white dark:text-slate-900' : 'text-slate-500'}`} />
                    <span className="font-bold text-sm">{grp.label}</span>
                  </div>
                  {groupTotalOrders > 0 ? (
                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                        isSelected
                          ? 'bg-white/20 text-white dark:bg-slate-900/20 dark:text-slate-900'
                          : 'bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300'
                      }`}
                    >
                      {groupTotalOrders} WO · {groupTotalPcs} PCS
                    </span>
                  ) : (
                    <ChevronRight className={`h-4 w-4 ${isSelected ? 'opacity-100' : 'opacity-40'}`} />
                  )}
                </div>
                <p className={`text-[11px] mt-1 line-clamp-1 ${isSelected ? 'text-slate-300 dark:text-slate-700' : 'text-slate-500 dark:text-slate-400'}`}>
                  {grp.description}
                </p>
              </button>
            );
          })}
        </div>

        {/* Sub-Station Tabs */}
        {activeGroup.workCenters.length > 1 && (
          <div className="mt-3 flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2 flex-wrap">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Sub-Stage:</span>
            {activeGroup.workCenters.map((wc) => {
              const wcSummary = workCenterSummaries[wc];
              const wcPcs = wcSummary?.availPcs ?? 0;
              const wcCount = wcSummary?.count ?? 0;

              return (
                <button
                  key={wc}
                  type="button"
                  onClick={() => setActiveWc(wc)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer border inline-flex items-center gap-2 ${
                    activeWc === wc
                      ? 'bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700 shadow-2xs'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span>{STATION_LABELS[wc]}</span>
                  <span
                    className={`font-mono text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      activeWc === wc
                        ? 'bg-blue-200 dark:bg-blue-800 text-blue-900 dark:text-blue-100'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {wcCount > 0 ? `${wcPcs} PCS` : '0 WIP'}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Main Dual Console Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Panel: Available Stage WIP Queue (Feed to Plan) */}
        <div className={`rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs overflow-hidden flex flex-col h-[650px] print:hidden ${isExpandedTable ? 'hidden' : 'lg:col-span-5'}`}>
          <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-850/70 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  Planning Queue ({STATION_LABELS[activeWc]})
                </h2>
                <p className="text-[10px] text-slate-500">Ready WIP & Upstream Feeder material</p>
              </div>
              <span className="font-mono text-xs font-bold bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded text-slate-800 dark:text-slate-200">
                {eligibleQueue.length} {eligibleQueue.length === 1 ? 'Order' : 'Orders'} (
                {eligibleQueue.reduce((acc, r) => acc + Number(r.balance_to_make_pcs ?? r.available_pcs ?? 0), 0)} PCS)
              </span>
            </div>

            {/* Segmented Queue Filter Tabs */}
            <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 p-0.5 text-[11px] font-bold">
              <button
                type="button"
                onClick={() => setQueueTab('UNPLANNED')}
                className={`flex-1 py-1 px-2 rounded-md transition text-center cursor-pointer ${
                  queueTab === 'UNPLANNED'
                    ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-300 shadow-2xs font-black'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
                }`}
              >
                Unplanned ({unplannedQueueCount})
              </button>
              <button
                type="button"
                onClick={() => setQueueTab('READY')}
                className={`flex-1 py-1 px-2 rounded-md transition text-center cursor-pointer ${
                  queueTab === 'READY'
                    ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
                }`}
              >
                Ready WIP ({readyQueueCount})
              </button>
              <button
                type="button"
                onClick={() => setQueueTab('FEEDER')}
                className={`flex-1 py-1 px-2 rounded-md transition text-center cursor-pointer ${
                  queueTab === 'FEEDER'
                    ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
                }`}
              >
                Upstream Feeder ({feederQueueCount})
              </button>
              <button
                type="button"
                onClick={() => setQueueTab('ALL')}
                className={`flex-1 py-1 px-2 rounded-md transition text-center cursor-pointer ${
                  queueTab === 'ALL'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
                }`}
              >
                All Queue ({wipQueue.length})
              </button>
            </div>
          </div>

          {/* Queue Search */}
          <div className="p-2.5 border-b border-slate-200 dark:border-slate-800">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search WO #, customer, grade, or feeder..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden"
              />
            </div>
          </div>

          {/* Queue Item List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80 p-1">
            {queueLoading ? (
              <div className="p-8 text-center text-slate-400">
                <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-blue-600" />
                <p className="text-xs">Loading stage WIP queue...</p>
              </div>
            ) : eligibleQueue.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <p className="text-xs font-semibold">No material available in this view for {STATION_LABELS[activeWc]}.</p>
                <p className="text-[11px] mt-1">
                  {queueTab === 'READY'
                    ? 'Check "Upstream Feeder" tab to schedule work from previous station output.'
                    : 'Issue Rolling Plans or log upstream work centers to create pipeline.'}
                </p>
              </div>
            ) : (
              eligibleQueue.map((item) => {
                const availPcs = Number(item.balance_to_make_pcs ?? item.available_pcs ?? 0);
                const availMtr = Number(item.balance_to_make_mtr ?? item.available_mtr ?? 0);
                const availMt = Number(item.balance_to_make_mt ?? item.available_mt ?? 0);
                const readyPcs = Number(item.ready_pcs ?? (item.is_feeder_source ? 0 : availPcs));
                const feederPcs = Number(item.feeder_pcs ?? availPcs);
                const itemGrade = item.grade || item.specification || '—';
                const itemOd = item.od ?? item.size_od ?? 0;
                const itemWt = item.wl ?? item.wt ?? item.size_wt ?? 0;
                const isFeeder = Boolean(item.is_feeder_source || (readyPcs === 0 && feederPcs > 0));
                const existingPlan = plansByWoId.get(item.work_order_id || item.id);
                const isAlreadyPlanned = Boolean(existingPlan);

                return (
                  <div
                    key={item.work_order_id || item.id}
                    className={`p-3 rounded-lg transition flex items-center justify-between gap-3 ${
                      isAlreadyPlanned
                        ? 'bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-200/60 dark:border-indigo-900/40'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-xs text-slate-900 dark:text-white">
                          {item.work_order_no}
                        </span>
                        {itemGrade !== '—' && (
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                            {itemGrade}
                          </span>
                        )}
                        {item.route_code && (
                          <span className="text-[9px] font-mono text-slate-400">
                            {item.route_code}
                          </span>
                        )}
                        {isAlreadyPlanned ? (
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-700 inline-flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3 text-indigo-600 dark:text-indigo-400" />
                            Planned: {existingPlan?.target_pcs} PCS
                          </span>
                        ) : isFeeder ? (
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-50 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                            ⚡ {item.feeder_source_label || 'Feeder WIP'}
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                            ✓ Ready at Station
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate mt-0.5">
                        {item.customer_name || 'Standard Stock'} · {itemOd} × {itemWt} mm
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-[11px] font-mono font-semibold flex-wrap">
                        {isFeeder ? (
                          <span className="text-amber-700 dark:text-amber-300">
                            Feeder WIP: <strong className="font-bold">{feederPcs} PCS</strong> ({fmt(availMtr)} m{availMt > 0 ? ` · ${fmt(availMt)} MT` : ''})
                          </span>
                        ) : (
                          <>
                            <span className="text-emerald-700 dark:text-emerald-300">
                              Ready: <strong className="font-bold">{readyPcs} PCS</strong> ({fmt(availMtr)} m{availMt > 0 ? ` · ${fmt(availMt)} MT` : ''})
                            </span>
                            {feederPcs > readyPcs && (
                              <span className="text-slate-500 text-[10px]">
                                (Feeder Total: {feederPcs} PCS)
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {isAlreadyPlanned ? (
                      <button
                        type="button"
                        onClick={() => openScheduleModal(item, existingPlan)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold shadow-2xs transition cursor-pointer active:scale-95 shrink-0"
                        title="Work order is already planned for this date. Click to edit plan target."
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                        <span>Edit Plan</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openScheduleModal(item)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-white text-xs font-bold shadow-2xs transition cursor-pointer active:scale-95 shrink-0 ${
                          isFeeder
                            ? 'bg-amber-600 hover:bg-amber-500'
                            : 'bg-blue-600 hover:bg-blue-500'
                        }`}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>Plan</span>
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Panel: Today's Scheduled Targets */}
        <div className={`rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs flex flex-col h-[650px] overflow-hidden ${isExpandedTable ? 'lg:col-span-12' : 'lg:col-span-7'}`}>
          <div className="p-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-850/80 flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5 flex-wrap">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
                    {activeGroup.id === 'DRAW_PILGER' ? 'Format F PROD - 003' : 'Format F PROD - 005'} Daily Plan
                  </h2>
                  <span className="font-mono text-xs font-black bg-blue-100 dark:bg-blue-950/80 text-blue-900 dark:text-blue-200 px-2 py-0.2 rounded border border-blue-300 dark:border-blue-700">
                    {filteredPlans.length} Scheduled
                  </span>
                </div>
                <p className="text-[10px] text-slate-500">
                  {STATION_LABELS[activeWc]} · Date: {selectedDate} ({formattedRevDate}) · {SHIFT_LABELS[selectedShift]}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* View Switcher: Table vs Cards */}
              <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 p-0.5 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setPlanViewMode('MILL_TABLE')}
                  className={`px-2.5 py-1 rounded-md transition flex items-center gap-1 cursor-pointer ${
                    planViewMode === 'MILL_TABLE'
                      ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-300 shadow-2xs font-extrabold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                  title="Factory Form 15-Column Table View"
                >
                  <Table className="h-3.5 w-3.5" />
                  <span>Mill Form</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPlanViewMode('CARDS')}
                  className={`px-2.5 py-1 rounded-md transition flex items-center gap-1 cursor-pointer ${
                    planViewMode === 'CARDS'
                      ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-300 shadow-2xs font-extrabold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                  title="Cards & Fulfillment View"
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  <span>Cards</span>
                </button>
              </div>

              {/* Expand to Full Width Toggle */}
              <button
                type="button"
                onClick={() => setIsExpandedTable(!isExpandedTable)}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 transition cursor-pointer shadow-2xs"
                title={isExpandedTable ? "Show Queue (Split View)" : "Expand Table (Full Width)"}
              >
                {isExpandedTable ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </button>

              <Link
                href={`/reports/daily-plan?date=${selectedDate}&shift=${selectedShift}&format=${activeGroup.id === 'DRAW_PILGER' ? 'F_PROD_003' : 'F_PROD_005'}`}
                className="p-1.5 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 transition cursor-pointer shadow-2xs text-xs font-bold inline-flex items-center gap-1"
                title="Open Official Mill Print Report"
              >
                <Printer className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Print Slip</span>
              </Link>
            </div>
          </div>

          {/* Scheduled Content: Table or Cards */}
          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="p-8 text-center text-slate-400">
                <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-blue-600" />
                <p className="text-xs">Loading scheduled daily plans...</p>
              </div>
            ) : filteredPlans.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <CalendarDays className="h-8 w-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300">No targets scheduled for {STATION_LABELS[activeWc]}</p>
                <p className="text-[11px] mt-1">Select orders from the left queue to set today&apos;s plan.</p>
              </div>
            ) : planViewMode === 'MILL_TABLE' ? (
              /* Factory Mill Format 15-Column Table */
              <div className="min-w-[1020px]">
                <table className="w-full border-collapse text-[10.5px] sm:text-[11px] leading-tight font-sans">
                  <thead>
                    <tr className="border-b border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold text-center sticky top-0 z-10 shadow-2xs">
                      <th className="border-r border-slate-300 dark:border-slate-700 p-1.5 w-[36px]">Sr. No</th>
                      <th className="border-r border-slate-300 dark:border-slate-700 p-1.5 w-[80px]">WO NO</th>
                      <th className="border-r border-slate-300 dark:border-slate-700 p-1.5 w-[140px] text-left">Customer</th>
                      <th className="border-r border-slate-300 dark:border-slate-700 p-1.5 w-[110px] text-left">Grade/SPEC</th>
                      <th className="border-r border-slate-300 dark:border-slate-700 p-1.5 w-[50px] text-right">OD</th>
                      <th className="border-r border-slate-300 dark:border-slate-700 p-1.5 w-[50px] text-right">WT</th>
                      <th className="border-r border-slate-300 dark:border-slate-700 p-1.5 w-[65px] text-right">FACTOR</th>
                      <th className="border-r border-slate-300 dark:border-slate-700 p-1.5 w-[65px] text-right">Proc. Wall</th>
                      <th className="border-r border-slate-300 dark:border-slate-700 p-1.5 w-[60px] text-right">Kg/Mtr.</th>
                      <th className="border-r border-slate-300 dark:border-slate-700 p-1.5 w-[65px] text-right">Final Lgth Min.</th>
                      <th className="border-r border-slate-300 dark:border-slate-700 p-1.5 w-[65px] text-right">Final Lgth Max.</th>
                      <th className="border-r border-slate-300 dark:border-slate-700 p-1.5 w-[60px] text-right">Avg. Lgth</th>
                      <th className="border-r border-slate-300 dark:border-slate-700 p-1.5 w-[65px]">Stage</th>
                      <th className="border-r border-slate-300 dark:border-slate-700 p-1.5 w-[55px] text-right">Nos</th>
                      <th className="border-r border-slate-300 dark:border-slate-700 p-1.5 w-[65px] text-right">MT.</th>
                      <th className="border-r border-slate-300 dark:border-slate-700 p-1.5 w-[75px] text-center">Actual (PCS)</th>
                      <th className="p-1.5 w-[60px] text-center print:hidden">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {filteredPlans.map((p, idx) => {
                      const od = p.size_od ? Number(p.size_od).toFixed(2) : '—';
                      const wt = p.size_wt ? Number(p.size_wt).toFixed(2) : '—';
                      const factor = p.factor ? Number(p.factor).toFixed(4) : (p.size_od && p.size_wt ? ((p.size_od - p.size_wt) * p.size_wt).toFixed(4) : '—');
                      const kgMtr = p.kg_per_mtr ? Number(p.kg_per_mtr).toFixed(3) : (p.factor ? (Number(p.factor) * 0.0246615).toFixed(3) : '—');
                      const procWall = p.proc_wall ? Number(p.proc_wall).toFixed(2) : (p.size_wt ? Number(p.size_wt).toFixed(2) : '—');
                      const l1 = p.l1 ? Number(p.l1).toFixed(2) : '—';
                      const l2 = p.l2 ? Number(p.l2).toFixed(2) : '—';
                      const avgLgth = p.avg_length ? Number(p.avg_length).toFixed(2) : '—';
                      const stageName = p.work_center === 'DRAW' ? 'DRAW' : p.work_center === 'BAND_SAW' ? 'CUTTING' : p.work_center;
                      const comp = p.compliance_pct;

                      return (
                        <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                          <td className="border-r border-slate-200 dark:border-slate-800 p-1.5 text-center font-mono">{idx + 1}</td>
                          <td className="border-r border-slate-200 dark:border-slate-800 p-1.5 text-center font-mono font-bold text-slate-900 dark:text-white">
                            {p.work_order_no}
                          </td>
                          <td className="border-r border-slate-200 dark:border-slate-800 p-1.5 truncate max-w-[140px] text-slate-700 dark:text-slate-300">
                            {p.customer_name || 'Standard Stock'}
                          </td>
                          <td className="border-r border-slate-200 dark:border-slate-800 p-1.5 truncate max-w-[110px] text-slate-700 dark:text-slate-300 font-mono text-[10px]">
                            {`${p.grade || ''} ${p.specification || ''}`.trim() || '—'}
                          </td>
                          <td className="border-r border-slate-200 dark:border-slate-800 p-1.5 text-right font-mono">{od}</td>
                          <td className="border-r border-slate-200 dark:border-slate-800 p-1.5 text-right font-mono">{wt}</td>
                          <td className="border-r border-slate-200 dark:border-slate-800 p-1.5 text-right font-mono">{factor}</td>
                          <td className="border-r border-slate-200 dark:border-slate-800 p-1.5 text-right font-mono">{procWall}</td>
                          <td className="border-r border-slate-200 dark:border-slate-800 p-1.5 text-right font-mono text-blue-600 dark:text-blue-400 font-semibold">{kgMtr}</td>
                          <td className="border-r border-slate-200 dark:border-slate-800 p-1.5 text-right font-mono">{l1}</td>
                          <td className="border-r border-slate-200 dark:border-slate-800 p-1.5 text-right font-mono">{l2}</td>
                          <td className="border-r border-slate-200 dark:border-slate-800 p-1.5 text-right font-mono">{avgLgth}</td>
                          <td className="border-r border-slate-200 dark:border-slate-800 p-1.5 text-center font-bold text-[10px] uppercase">{stageName}</td>
                          <td className="border-r border-slate-200 dark:border-slate-800 p-1.5 text-right font-mono font-bold text-slate-900 dark:text-white">
                            {p.target_pcs || 0}
                          </td>
                          <td className="border-r border-slate-200 dark:border-slate-800 p-1.5 text-right font-mono font-bold text-slate-900 dark:text-white">
                            {Number(p.target_mt || 0).toFixed(3)}
                          </td>
                          <td className="border-r border-slate-200 dark:border-slate-800 p-1.5 text-center font-mono">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${comp >= 100 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : comp > 0 ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
                              {p.actual_pcs} ({comp}%)
                            </span>
                          </td>
                          <td className="p-1.5 text-center print:hidden">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => openScheduleModal(p, p)}
                                className="p-1 text-slate-400 hover:text-blue-600 cursor-pointer rounded"
                                title="Edit target"
                              >
                                <Edit2 className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeletePlan(p.id, p.work_order_no)}
                                className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer rounded"
                                title="Delete plan"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-400 dark:border-slate-600 font-extrabold text-black">
                      <td colSpan={13} className="border-r border-slate-300 dark:border-slate-700 p-1.5 text-right uppercase tracking-wider bg-[#FFFF00] text-black">
                        {activeGroup.id === 'DRAW_PILGER' ? 'TOTAL' : 'TOTAL=>'}
                      </td>
                      <td className="border-r border-slate-300 dark:border-slate-700 p-1.5 text-right font-mono bg-[#FFFF00] text-black">
                        {stationSummary.total_target_pcs}
                      </td>
                      <td className="border-r border-slate-300 dark:border-slate-700 p-1.5 text-right font-mono bg-[#FFFF00] text-black">
                        {Number(stationSummary.total_target_mt).toFixed(3)}
                      </td>
                      <td className="border-r border-slate-300 dark:border-slate-700 p-1.5 text-center font-mono bg-[#FFFF00] text-black text-[10px]">
                        {stationSummary.total_actual_pcs} PCS ({stationSummary.overall_compliance_pct.toFixed(1)}%)
                      </td>
                      <td className="p-1.5 bg-[#FFFF00] text-black"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              /* Fulfillment Progress Cards View */
              <div className="divide-y divide-slate-100 dark:divide-slate-800/80 p-2">
                {filteredPlans.map((plan) => {
                  const comp = plan.compliance_pct;
                  return (
                    <div
                      key={plan.id}
                      className="p-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 rounded-xl transition border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="inline-flex items-center justify-center h-5 w-5 rounded bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 font-mono text-[11px] font-black">
                              #{plan.priority_rank}
                            </span>
                            <span className="font-mono font-bold text-sm text-slate-900 dark:text-white">
                              {plan.work_order_no}
                            </span>
                            {plan.machine_id && (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                                {plan.machine_id}
                              </span>
                            )}
                            {plan.charge_no && (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                                Charge: {plan.charge_no}
                              </span>
                            )}
                            {plan.pass_no && (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-50 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                                Pass: {plan.pass_no}
                              </span>
                            )}
                          </div>

                          <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                            {plan.customer_name || 'Standard Stock'} · {plan.grade || '—'} · {plan.size_od} × {plan.size_wt} mm
                          </div>

                          {plan.notes && (
                            <div className="text-[11px] text-slate-500 italic mt-0.5">
                              Note: {plan.notes}
                            </div>
                          )}
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1.5 shrink-0 print:hidden">
                          <button
                            type="button"
                            onClick={() => openScheduleModal(plan, plan)}
                            className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            title="Edit target"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeletePlan(plan.id, plan.work_order_no)}
                            className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            title="Delete plan"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Progress Bar & Fulfillment Status */}
                      <div className="mt-3 bg-slate-50 dark:bg-slate-800/80 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700">
                        <div className="flex items-center justify-between text-xs font-mono mb-1.5">
                          <span className="font-bold text-slate-700 dark:text-slate-300">
                            Target: <strong className="text-slate-900 dark:text-white">{plan.target_pcs} PCS</strong> ({fmt(plan.target_mt)} MT)
                          </span>
                          <span className="font-bold text-blue-700 dark:text-blue-300">
                            Actual: {plan.actual_pcs} PCS ({fmt(plan.actual_mt)} MT) · {comp}%
                          </span>
                        </div>

                        {/* Progress bar */}
                        <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-300 ${
                              comp >= 100
                                ? 'bg-emerald-500'
                                : comp >= 50
                                ? 'bg-blue-600'
                                : 'bg-amber-500'
                            }`}
                            style={{ width: `${Math.min(100, comp)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Station Summary Footer Bar */}
          <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-xs flex flex-wrap items-center justify-between gap-2 font-mono">
            <span className="text-slate-600 dark:text-slate-400 font-sans font-bold">
              {STATION_LABELS[activeWc]} Target Total:
            </span>
            <div className="flex items-center gap-3 font-black">
              <span className="text-slate-900 dark:text-white">
                {stationSummary.total_target_pcs} PCS ({fmt(stationSummary.total_target_mt)} MT)
              </span>
              <span className="text-blue-700 dark:text-blue-300">
                Actual: {stationSummary.total_actual_pcs} PCS ({fmt(stationSummary.total_actual_mt)} MT)
              </span>
              <span
                className={`px-2 py-0.5 rounded text-[11px] ${
                  stationSummary.overall_compliance_pct >= 90
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {fmt(stationSummary.overall_compliance_pct, 1)}% Compliant
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Target Planning Modal */}
      {showAddModal && modalItem && (() => {
        const modalOd = Number(modalItem.od ?? modalItem.size_od ?? 0);
        const modalWt = Number(modalItem.wl ?? modalItem.wt ?? modalItem.size_wt ?? 0);
        const modalFactor = (modalOd > 0 && modalWt > 0) ? Number(((modalOd - modalWt) * modalWt).toFixed(4)) : null;
        const modalKgPerMtr = modalFactor ? Number((modalFactor * 0.0246615).toFixed(3)) : null;
        const modalProcWall = modalItem.proc_wall ?? modalItem.mh_wt ?? (modalWt > 0 ? modalWt : null);
        const modalL1 = modalItem.l1 ?? modalItem.final_length_min ?? null;
        const modalL2 = modalItem.l2 ?? modalItem.final_length_max ?? null;
        const modalAvgLen = (modalL1 && modalL2) ? Number(((modalL1 + modalL2) / 2).toFixed(2)) : Number(modalItem.avg_length || 6);

        return (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-xl w-full p-5 shadow-2xl my-8">
              {/* Official Mill Header */}
              <div className="flex items-start justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black tracking-wider uppercase px-2 py-0.5 rounded bg-red-100 text-red-800 border border-red-300">
                      RASHMI SEAMLESS
                    </span>
                    <span className="text-[10px] font-mono font-bold text-slate-500">
                      {modalWc === 'DRAW' || modalWc === 'PILGER' ? 'Format F PROD - 003' : 'Format F PROD - 005'}
                    </span>
                  </div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white mt-1">
                    {editingPlanId ? 'Edit Daily Plan Target' : 'Schedule Daily Production Target'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    WO: <strong className="font-mono text-slate-800 dark:text-slate-200">{modalItem.work_order_no}</strong> · {modalItem.customer_name || 'Standard Stock'} ({STATION_LABELS[modalWc]})
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer p-1"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Technical Specifications Strip (Matching 15 Factory Report Columns) */}
              <div className="mt-3.5 grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-50 dark:bg-slate-850 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 font-mono text-[11px]">
                <div className="p-1">
                  <span className="block text-[9px] uppercase tracking-wider text-slate-500 font-bold font-sans">OD × WT</span>
                  <span className="font-bold text-slate-900 dark:text-white">{modalOd || '—'} × {modalWt || '—'} mm</span>
                </div>
                <div className="p-1">
                  <span className="block text-[9px] uppercase tracking-wider text-slate-500 font-bold font-sans">FACTOR</span>
                  <span className="font-bold text-slate-900 dark:text-white">{modalFactor ?? '—'}</span>
                </div>
                <div className="p-1">
                  <span className="block text-[9px] uppercase tracking-wider text-slate-500 font-bold font-sans">Proc. Wall</span>
                  <span className="font-bold text-slate-900 dark:text-white">{modalProcWall ? `${modalProcWall} mm` : '—'}</span>
                </div>
                <div className="p-1">
                  <span className="block text-[9px] uppercase tracking-wider text-slate-500 font-bold font-sans">Kg/Mtr</span>
                  <span className="font-bold text-blue-600 dark:text-blue-400">{modalKgPerMtr ? `${modalKgPerMtr} kg` : '—'}</span>
                </div>
                <div className="p-1">
                  <span className="block text-[9px] uppercase tracking-wider text-slate-500 font-bold font-sans">Min Lgth (L1)</span>
                  <span className="font-bold text-slate-900 dark:text-white">{modalL1 ? `${modalL1} m` : '—'}</span>
                </div>
                <div className="p-1">
                  <span className="block text-[9px] uppercase tracking-wider text-slate-500 font-bold font-sans">Max Lgth (L2)</span>
                  <span className="font-bold text-slate-900 dark:text-white">{modalL2 ? `${modalL2} m` : '—'}</span>
                </div>
                <div className="p-1">
                  <span className="block text-[9px] uppercase tracking-wider text-slate-500 font-bold font-sans">Avg Lgth</span>
                  <span className="font-bold text-slate-900 dark:text-white">{modalAvgLen} m</span>
                </div>
                <div className="p-1">
                  <span className="block text-[9px] uppercase tracking-wider text-slate-500 font-bold font-sans">Grade / SPEC</span>
                  <span className="font-bold text-slate-900 dark:text-white truncate block">{modalItem.grade || modalItem.specification || '—'}</span>
                </div>
              </div>

              {editingPlanId && (
                <div className="mt-3 flex items-center gap-2 p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-900 dark:text-indigo-200 text-xs">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
                  <span>
                    <strong>Work order is already planned for this station.</strong> Saving updates the existing scheduled target.
                  </span>
                </div>
              )}

              <form onSubmit={handleSavePlan} className="space-y-3.5 mt-3 text-xs">
                {/* Plan Date, Shift & Target Station */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 bg-slate-50 dark:bg-slate-850 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1">
                        <CalendarDays className="h-3 w-3 text-blue-600" />
                        Plan Date ★
                      </label>
                      <button
                        type="button"
                        onClick={() => setModalPlanDate(new Date().toISOString().slice(0, 10))}
                        className="text-[9.5px] font-bold px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300 cursor-pointer"
                      >
                        Today
                      </button>
                    </div>
                    <input
                      type="date"
                      required
                      value={modalPlanDate}
                      onChange={(e) => setModalPlanDate(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                      Planned Shift
                    </label>
                    <select
                      value={modalShift}
                      onChange={(e) => setModalShift(e.target.value as DailyPlanShift)}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-bold text-slate-900 dark:text-white focus:outline-hidden"
                    >
                      <option value="ALL_DAY">All Day (General)</option>
                      <option value="SHIFT_A">Shift A (07:00 - 15:00)</option>
                      <option value="SHIFT_B">Shift B (15:00 - 23:00)</option>
                      <option value="SHIFT_C">Shift C (23:00 - 07:00)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                      Stage / Station
                    </label>
                    <select
                      value={modalWc}
                      onChange={(e) => {
                        const nextWc = e.target.value as DailyPlanWorkCenter;
                        setModalWc(nextWc);
                        setMachineId('');
                      }}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-bold text-slate-900 dark:text-white focus:outline-hidden"
                    >
                      {activeGroup.workCenters.map((wc) => (
                        <option key={wc} value={wc}>
                          {STATION_LABELS[wc]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Machine / Equipment */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Machine / Equipment Assignment
                  </label>
                  <div className="flex items-center gap-2">
                    <select
                      value={machineId}
                      onChange={(e) => setMachineId(e.target.value)}
                      className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-white focus:outline-hidden"
                    >
                      <option value="">Select Equipment...</option>
                      {machinePresets.map((m) => (
                        <option key={m.id} value={m.label}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      placeholder="Or custom equipment ID"
                      value={machineId}
                      onChange={(e) => setMachineId(e.target.value)}
                      className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-hidden"
                    />
                  </div>
                </div>

                {/* Station Specifics: Charge No for HT, Pass No for DB, Sub-station for Finishing */}
                <div className="grid grid-cols-2 gap-3">
                  {modalWc === 'HEAT_TREATMENT' || modalWc === 'HOLLOW_HEAT_TREATMENT' ? (
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                        Furnace Charge No
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. CH-26A"
                        value={chargeNo}
                        onChange={(e) => setChargeNo(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-hidden"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                        {modalWc === 'DRAW' || modalWc === 'PILGER' ? 'Draw Pass / Sizing' : 'Sub-Station / Operation'}
                      </label>
                      <input
                        type="text"
                        placeholder={modalWc === 'DRAW' || modalWc === 'PILGER' ? 'e.g. Pass 1 (73 to 65)' : 'e.g. Hydro 250 bar / Facing / Straightening'}
                        value={passNo}
                        onChange={(e) => setPassNo(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-hidden"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                      Priority Rank
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={priorityRank}
                      onChange={(e) => setPriorityRank(Number(e.target.value))}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-hidden"
                    />
                  </div>
                </div>

                {/* Quantities: PCS (Nos), MTR, MT */}
                <div className="grid grid-cols-3 gap-3 bg-slate-50 dark:bg-slate-850 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-700 dark:text-slate-300 mb-1">
                      Nos (Target PCS) ★
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={targetPcs}
                      onChange={(e) => {
                        const p = Number(e.target.value);
                        setTargetPcs(p);
                        const m = Number((p * modalAvgLen).toFixed(2));
                        setTargetMtr(m);
                        if (modalKgPerMtr) {
                          setTargetMt(Number(((m * modalKgPerMtr) / 1000).toFixed(3)));
                        }
                      }}
                      className="w-full rounded-lg border border-blue-400 dark:border-blue-600 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-mono font-black text-slate-900 dark:text-white focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                      Target MTR
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={targetMtr}
                      onChange={(e) => {
                        const m = Number(e.target.value);
                        setTargetMtr(m);
                        if (modalKgPerMtr) {
                          setTargetMt(Number(((m * modalKgPerMtr) / 1000).toFixed(3)));
                        }
                      }}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-mono text-slate-900 dark:text-white focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                      Target MT (Metric Tons)
                    </label>
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      value={targetMt}
                      onChange={(e) => setTargetMt(Number(e.target.value))}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-hidden"
                    />
                  </div>
                </div>

                {/* Quick Fill Buttons */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-bold uppercase text-slate-500">Quick Fill:</span>
                  {Number(modalItem.ready_pcs ?? 0) > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        const p = Number(modalItem.ready_pcs);
                        setTargetPcs(p);
                        const m = Number((p * modalAvgLen).toFixed(2));
                        setTargetMtr(m);
                        if (modalKgPerMtr) {
                          setTargetMt(Number(((m * modalKgPerMtr) / 1000).toFixed(3)));
                        }
                      }}
                      className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700 cursor-pointer"
                    >
                      Ready WIP ({modalItem.ready_pcs} PCS)
                    </button>
                  )}
                  {Number(modalItem.feeder_pcs ?? 0) > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        const p = Number(modalItem.feeder_pcs);
                        setTargetPcs(p);
                        const m = Number((p * modalAvgLen).toFixed(2));
                        setTargetMtr(m);
                        if (modalKgPerMtr) {
                          setTargetMt(Number(((m * modalKgPerMtr) / 1000).toFixed(3)));
                        }
                      }}
                      className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/80 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700 cursor-pointer"
                    >
                      Feeder ({modalItem.feeder_pcs} PCS)
                    </button>
                  )}
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    PPC Expediting Notes
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Critical export order, run before afternoon shift change"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-xs text-slate-900 dark:text-white focus:outline-hidden"
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-xs transition cursor-pointer active:scale-95 disabled:opacity-50"
                  >
                    <Save className="h-4 w-4" />
                    <span>{saving ? 'Saving...' : 'Authorize Target'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
