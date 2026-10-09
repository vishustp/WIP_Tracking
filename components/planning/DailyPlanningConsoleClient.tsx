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
} from 'lucide-react';
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
    workCenters: ['BAND_SAW', 'VDI', 'FINISHING'],
    description: 'Band saw cutting, dimensional/NDT inspection targets, and dispatch bundling.',
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

  // Search filter
  const [search, setSearch] = useState('');

  // Target entry modal / state
  const [showAddModal, setShowAddModal] = useState(false);
  const [modalItem, setModalItem] = useState<any | null>(null);
  const [targetPcs, setTargetPcs] = useState<number>(0);
  const [targetMtr, setTargetMtr] = useState<number>(0);
  const [targetMt, setTargetMt] = useState<number>(0);
  const [machineId, setMachineId] = useState<string>('');
  const [chargeNo, setChargeNo] = useState<string>('');
  const [passNo, setPassNo] = useState<string>('');
  const [priorityRank, setPriorityRank] = useState<number>(1);
  const [notes, setNotes] = useState<string>('');
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);

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

  // Load active stage WIP queue for the selected work center
  const loadStageQueue = useCallback(async () => {
    setQueueLoading(true);
    try {
      const res = await fetch(`/api/production/queue?stage=${activeWc}&_t=${Date.now()}`, {
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

  // Filter WIP queue
  const eligibleQueue = useMemo(() => {
    const eligible = filterEligibleWipQueue(wipQueue);
    if (!search.trim()) return eligible;
    const q = search.toLowerCase();
    return eligible.filter(
      (r) =>
        (r.work_order_no || '').toLowerCase().includes(q) ||
        (r.customer_name || '').toLowerCase().includes(q) ||
        (r.grade || r.specification || '').toLowerCase().includes(q)
    );
  }, [wipQueue, search]);

  // Compute station totals
  const stationSummary = useMemo(() => {
    return calculateStationPlannedTotals(activeWc, plans);
  }, [activeWc, plans]);

  // Open planning modal for queue item
  const openScheduleModal = (item: any, existingPlan?: DailyPlanItemWithWorkOrder) => {
    setModalItem(item);
    if (existingPlan) {
      setEditingPlanId(existingPlan.id);
      setTargetPcs(existingPlan.target_pcs);
      setTargetMtr(existingPlan.target_mtr);
      setTargetMt(existingPlan.target_mt);
      setMachineId(existingPlan.machine_id || '');
      setChargeNo(existingPlan.charge_no || '');
      setPassNo(existingPlan.pass_no || '');
      setPriorityRank(existingPlan.priority_rank);
      setNotes(existingPlan.notes || '');
    } else {
      setEditingPlanId(null);
      const availPcs = Number(item.balance_to_make_pcs ?? item.available_pcs ?? 0);
      const availMtr = Number(item.balance_to_make_mtr ?? item.available_mtr ?? 0);
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

    setSaving(true);
    try {
      const res = await fetch('/api/daily-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingPlanId,
          plan_date: selectedDate,
          shift: selectedShift,
          work_center: activeWc,
          work_order_id: modalItem.work_order_id || modalItem.id,
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
        editingPlanId
          ? `Updated plan target for ${modalItem.work_order_no}`
          : `Scheduled ${modalItem.work_order_no} for ${STATION_LABELS[activeWc]}`
      );
      setShowAddModal(false);
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

  const machinePresets = STATION_MACHINE_PRESETS[activeWc] || [];

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

          {/* Shift Switcher */}
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
        <div className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs overflow-hidden flex flex-col h-[650px] print:hidden">
          <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-850/70 flex items-center justify-between">
            <div>
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
                Active WIP Queue ({STATION_LABELS[activeWc]})
              </h2>
              <p className="text-[10px] text-slate-500">Pipes waiting for processing</p>
            </div>
            <span className="font-mono text-xs font-bold bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded text-slate-800 dark:text-slate-200">
              {eligibleQueue.length} {eligibleQueue.length === 1 ? 'Order' : 'Orders'} (
              {eligibleQueue.reduce((acc, r) => acc + Number(r.balance_to_make_pcs ?? r.available_pcs ?? 0), 0)} PCS)
            </span>
          </div>

          {/* Queue Search */}
          <div className="p-2.5 border-b border-slate-200 dark:border-slate-800">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search WO #, customer, grade..."
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
                <p className="text-xs font-semibold">No active WIP waiting at {STATION_LABELS[activeWc]}.</p>
                <p className="text-[11px] mt-1">Requires upstream production output first.</p>
              </div>
            ) : (
              eligibleQueue.map((item) => {
                const availPcs = Number(item.balance_to_make_pcs ?? item.available_pcs ?? 0);
                const availMtr = Number(item.balance_to_make_mtr ?? item.available_mtr ?? 0);
                const availMt = Number(item.balance_to_make_mt ?? item.available_mt ?? 0);
                const itemGrade = item.grade || item.specification || '—';
                const itemOd = item.od ?? item.size_od ?? 0;
                const itemWt = item.wl ?? item.wt ?? item.size_wt ?? 0;

                return (
                  <div
                    key={item.work_order_id || item.id}
                    className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg transition flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
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
                      </div>
                      <div className="text-[11px] text-slate-500 truncate mt-0.5">
                        {item.customer_name || 'Standard Stock'} · {itemOd} × {itemWt} mm
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-[11px] font-mono font-semibold">
                        <span className="text-blue-700 dark:text-blue-300">
                          Available: <strong className="font-bold">{availPcs} PCS</strong> ({fmt(availMtr)} m{availMt > 0 ? ` · ${fmt(availMt)} MT` : ''})
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => openScheduleModal(item)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-2xs transition cursor-pointer active:scale-95 shrink-0"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Plan</span>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Panel: Today's Scheduled Targets */}
        <div className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs flex flex-col h-[650px]">
          <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-850/70 flex items-center justify-between">
            <div>
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
                Today's Daily Plan ({STATION_LABELS[activeWc]})
              </h2>
              <p className="text-[10px] text-slate-500">
                Date: {selectedDate} · Shift: {SHIFT_LABELS[selectedShift]}
              </p>
            </div>
            <span className="font-mono text-xs font-black bg-blue-100 dark:bg-blue-950/80 text-blue-900 dark:text-blue-200 px-2.5 py-0.5 rounded border border-blue-300 dark:border-blue-700">
              {filteredPlans.length} Scheduled
            </span>
          </div>

          {/* Scheduled Plan Grid */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80 p-2">
            {loading ? (
              <div className="p-8 text-center text-slate-400">
                <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-blue-600" />
                <p className="text-xs">Loading scheduled daily plans...</p>
              </div>
            ) : filteredPlans.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <CalendarDays className="h-8 w-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300">No targets scheduled for {STATION_LABELS[activeWc]}</p>
                <p className="text-[11px] mt-1">Select orders from the left queue to set today's plan.</p>
              </div>
            ) : (
              filteredPlans.map((plan) => {
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
              })
            )}
          </div>

          {/* Station Summary Footer */}
          <div className="p-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-xs flex flex-wrap items-center justify-between gap-2 font-mono">
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
      {showAddModal && modalItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-lg w-full p-5 shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  {editingPlanId ? 'Edit Daily Plan Target' : 'Schedule Daily Production Target'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Work Order: <strong className="font-mono text-slate-800 dark:text-slate-200">{modalItem.work_order_no}</strong> ({STATION_LABELS[activeWc]})
                </p>
                <p className="text-[11px] text-blue-600 dark:text-blue-400 font-mono mt-0.5 font-semibold">
                  Queue Available: <strong className="font-bold">{Number(modalItem.balance_to_make_pcs ?? modalItem.available_pcs ?? 0)} PCS</strong> ({fmt(Number(modalItem.balance_to_make_mtr ?? modalItem.available_mtr ?? 0))} m)
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

            <form onSubmit={handleSavePlan} className="space-y-4 mt-4 text-xs">
              {/* Machine / Equipment */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Machine / Furnace Assignment
                </label>
                <div className="flex items-center gap-2">
                  <select
                    value={machineId}
                    onChange={(e) => setMachineId(e.target.value)}
                    className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white focus:outline-hidden"
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
                    placeholder="Or type custom machine ID"
                    value={machineId}
                    onChange={(e) => setMachineId(e.target.value)}
                    className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Station Specifics: Charge No for HT, Pass No for DB */}
              <div className="grid grid-cols-2 gap-3">
                {activeWc === 'HEAT_TREATMENT' || activeWc === 'HOLLOW_HEAT_TREATMENT' ? (
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                      Furnace Charge No
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. CH-26A"
                      value={chargeNo}
                      onChange={(e) => setChargeNo(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-hidden"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                      Draw Pass / Sizing
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Pass 1 (73 to 65)"
                      value={passNo}
                      onChange={(e) => setPassNo(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-hidden"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Priority Rank
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={priorityRank}
                    onChange={(e) => setPriorityRank(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Quantities: PCS, MTR, MT */}
              <div className="grid grid-cols-3 gap-3 bg-slate-50 dark:bg-slate-850 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                    Target PCS ★
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={targetPcs}
                    onChange={(e) => {
                      const p = Number(e.target.value);
                      setTargetPcs(p);
                      const len = Number(modalItem.avg_length || 6);
                      const m = mtrFromPcs(p, len);
                      setTargetMtr(Number(m.toFixed(2)));
                      const od = Number(modalItem.od ?? modalItem.size_od ?? 60.3);
                      const wt = Number(modalItem.wl ?? modalItem.wt ?? modalItem.size_wt ?? 3.91);
                      setTargetMt(Number(mtFromMtr(m, od, wt).toFixed(3)));
                    }}
                    className="w-full rounded-lg border border-blue-300 dark:border-blue-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-mono font-black text-slate-900 dark:text-white focus:outline-hidden"
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
                      const od = Number(modalItem.od ?? modalItem.size_od ?? 60.3);
                      const wt = Number(modalItem.wl ?? modalItem.wt ?? modalItem.size_wt ?? 3.91);
                      setTargetMt(Number(mtFromMtr(m, od, wt).toFixed(3)));
                    }}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-mono text-slate-900 dark:text-white focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                    Target MT
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={targetMt}
                    onChange={(e) => setTargetMt(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-mono text-slate-900 dark:text-white focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  PPC Expediting Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Critical export order, run before afternoon shift change"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-xs text-slate-900 dark:text-white focus:outline-hidden"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-xs transition cursor-pointer active:scale-95 disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  <span>{saving ? 'Saving...' : 'Authorize Target'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
