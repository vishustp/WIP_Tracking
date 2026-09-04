'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { mtFromMtr, fmt } from '@/lib/productionUtils';
import * as XLSX from 'xlsx';
import {
  Search,
  Filter,
  Download,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  Layers,
  Crown,
  Calendar,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Flame,
  ArrowRight,
  ShieldCheck,
  TrendingUp,
  SlidersHorizontal,
  FileSpreadsheet,
} from 'lucide-react';

interface WorkOrder {
  id: string;
  work_order_no: string;
  customer_name: string | null;
  size_od: number | null;
  size_wt: number | null;
  l1: number | null;
  l2: number | null;
  grade: string | null;
  specification: string | null;
  ordered_qty: number;
  uom: string;
  target_date: string | null;
  status: string;
  created_at: string;
}

interface RollingPlan {
  id: string;
  plan_no: string;
  work_order_id: string;
  status: any;
  planned_qty: number;
  mh_od: number | null;
  mh_wt: number | null;
  mh_l1: number | null;
  mh_l2: number | null;
  created_at: string;
}

interface StageWipRow {
  work_order_id: string;
  work_order_no: string;
  stage_code: string;
  stage_name: string;
  sequence_no: number;
  incoming_qty: number;
  production_qty: number;
  rejection_qty: number;
  current_wip: number;
  current_wip_pcs?: number;
  current_wip_mt?: number;
}

interface ProductionLog {
  id: string;
  work_order_id: string;
  stage_code: string;
  stage_name: string;
  shift_date: string;
  shift: string | null;
  heat_no: string | null;
  lot_no: string | null;
  output_qty: number;
  output_pcs: number;
  rejection_qty: number;
  rejection_pcs: number;
  htc_ok_qty?: number;
  htc_ok_pcs?: number;
  operator_name: string | null;
  remarks: string | null;
  created_at: string;
}

const STAGES_ORDER = [
  { code: 'ROLLING', label: 'Rolling Mill', short: 'ROLL', bg: 'bg-blue-50 text-blue-900 border-blue-200' },
  { code: 'HOLLOW_HEAT_TREATMENT', label: 'Hollow Heat Treatment', short: 'HTC', bg: 'bg-amber-50 text-amber-900 border-amber-200' },
  { code: 'DRAW', label: 'Draw Bench', short: 'DRAW', bg: 'bg-indigo-50 text-indigo-900 border-indigo-200' },
  { code: 'HEAT_TREATMENT', label: 'Heat Treatment', short: 'HT', bg: 'bg-orange-50 text-orange-900 border-orange-200' },
  { code: 'FINISHING', label: 'Finishing Line', short: 'FINISH', bg: 'bg-emerald-50 text-emerald-900 border-emerald-200' },
];

export default function WorkOrderTrackingClient() {
  const supabase = createClient();

  // Raw Database Data
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [rollingPlans, setRollingPlans] = useState<RollingPlan[]>([]);
  const [stageWip, setStageWip] = useState<StageWipRow[]>([]);
  const [productionLogs, setProductionLogs] = useState<ProductionLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Filters
  const [filterWo, setFilterWo] = useState<string>('');
  const [filterCustomer, setFilterCustomer] = useState<string>('');
  const [fromOd, setFromOd] = useState<string>('');
  const [toOd, setToOd] = useState<string>('');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');

  // UI state
  const [expandedWos, setExpandedWos] = useState<Record<string, boolean>>({});

  // Fetch initial data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [woRes, plansRes, wipRes, logsRes] = await Promise.all([
        supabase.from('work_orders').select('*').order('created_at', { ascending: false }),
        supabase.from('rolling_plans').select('*').not('status', 'is', null).order('created_at', { ascending: false }),
        supabase.from('vw_route_stage_wip').select('*'),
        supabase
          .from('production_logs')
          .select('*, process_stages(stage_code, stage_name)')
          .order('created_at', { ascending: false })
          .limit(1500),
      ]);

      if (woRes.data) setWorkOrders(woRes.data);
      if (plansRes.data) setRollingPlans(plansRes.data);
      if (wipRes.data) setStageWip(wipRes.data);

      if (logsRes.data) {
        const mappedLogs: ProductionLog[] = logsRes.data.map((l: any) => ({
          id: l.id,
          work_order_id: l.work_order_id,
          stage_code: l.process_stages?.stage_code || '',
          stage_name: l.process_stages?.stage_name || '',
          shift_date: l.shift_date || l.created_at?.slice(0, 10),
          shift: l.shift || null,
          heat_no: l.heat_no || null,
          lot_no: l.lot_no || null,
          output_qty: Number(l.output_qty || 0),
          output_pcs: Number(l.output_pcs || 0),
          rejection_qty: Number(l.rejection_qty || 0),
          rejection_pcs: Number(l.rejection_pcs || 0),
          htc_ok_qty: Number(l.htc_ok_qty || 0),
          htc_ok_pcs: Number(l.htc_ok_pcs || 0),
          operator_name: l.operator_name || null,
          remarks: l.remarks || null,
          created_at: l.created_at,
        }));
        setProductionLogs(mappedLogs);
      }
    } catch (err) {
      console.error('Failed to load tracking data:', err);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Campaign Mapping
  const campaignMeta = useMemo(() => {
    const masterMap = new Map<string, any>(); // key: master_wo_id -> plan
    const childMap = new Map<string, { master_wo_id: string; master_wo_no: string; master_plan_no: string }>();

    for (const p of rollingPlans) {
      try {
        const parsed = typeof p.status === 'string' ? JSON.parse(p.status) : p.status;
        if (parsed?.is_master && Array.isArray(parsed?.child_work_orders)) {
          masterMap.set(p.work_order_id, {
            ...p,
            parsed,
            child_work_orders: parsed.child_work_orders,
          });
          for (const c of parsed.child_work_orders) {
            const childId = c.work_order_id || c.id;
            if (childId) {
              childMap.set(childId, {
                master_wo_id: p.work_order_id,
                master_wo_no: parsed.master_wo_no,
                master_plan_no: p.plan_no,
              });
            }
          }
        } else if (parsed?.is_child) {
          childMap.set(p.work_order_id, {
            master_wo_id: parsed.master_wo_id,
            master_wo_no: parsed.master_wo_no,
            master_plan_no: parsed.master_plan_no,
          });
        }
      } catch {}
    }

    return { masterMap, childMap };
  }, [rollingPlans]);

  // Filtered Work Orders
  const filteredWorkOrders = useMemo(() => {
    return workOrders.filter((wo) => {
      // 1. Work Order No Filter
      if (filterWo.trim()) {
        const match = wo.work_order_no.toLowerCase().includes(filterWo.trim().toLowerCase());
        if (!match) return false;
      }

      // 2. Customer Filter
      if (filterCustomer.trim()) {
        const match = (wo.customer_name || '').toLowerCase().includes(filterCustomer.trim().toLowerCase());
        if (!match) return false;
      }

      // 3. OD Range Filter (From OD to To OD)
      const od = Number(wo.size_od || 0);
      if (fromOd !== '' && !isNaN(Number(fromOd))) {
        if (od < Number(fromOd)) return false;
      }
      if (toOd !== '' && !isNaN(Number(toOd))) {
        if (od > Number(toOd)) return false;
      }

      // 4. Date Range Filter (From Date to To Date)
      const d = (wo.target_date || wo.created_at || '').slice(0, 10);
      if (fromDate && d < fromDate) return false;
      if (toDate && d > toDate) return false;

      // 5. Status Filter
      if (filterStatus && wo.status !== filterStatus) return false;

      return true;
    });
  }, [workOrders, filterWo, filterCustomer, fromOd, toOd, fromDate, toDate, filterStatus]);

  // Helper to get aggregated stage metrics for a work order
  const getWoTrackingData = useCallback(
    (wo: WorkOrder) => {
      const avgLen = wo.l1 && wo.l2 ? (wo.l1 + wo.l2) / 2 : wo.l1 || wo.l2 || 6.0;
      const isMaster = campaignMeta.masterMap.has(wo.id);
      const masterInfo = campaignMeta.masterMap.get(wo.id);
      const childInfo = campaignMeta.childMap.get(wo.id);

      // Associated rolling plan
      const plan = rollingPlans.find((p) => p.work_order_id === wo.id);

      // Logs for this WO
      const woLogs = productionLogs.filter((l) => l.work_order_id === wo.id);

      // Stage-by-stage stats
      const stagesData = STAGES_ORDER.map((stageDef) => {
        const stageCode = stageDef.code;
        const sLogs = woLogs.filter((l) => l.stage_code === stageCode);

        const outMtr = sLogs.reduce((sum, l) => sum + Number(l.output_qty || 0), 0);
        const outPcs = sLogs.reduce((sum, l) => sum + Number(l.output_pcs || 0), 0);
        const rejMtr = sLogs.reduce((sum, l) => sum + Number(l.rejection_qty || 0), 0);
        const rejPcs = sLogs.reduce((sum, l) => sum + Number(l.rejection_pcs || 0), 0);
        const htcOkMtr = sLogs.reduce((sum, l) => sum + Number(l.htc_ok_qty || 0), 0);
        const htcOkPcs = sLogs.reduce((sum, l) => sum + Number(l.htc_ok_pcs || 0), 0);

        // Find WIP row from view
        const wipRow = stageWip.find((w) => w.work_order_id === wo.id && w.stage_code === stageCode);
        const wipMtr = Number(wipRow?.current_wip || 0);
        const wipPcs = Number(wipRow?.current_wip_pcs || (avgLen > 0 ? Math.round(wipMtr / avgLen) : 0));
        const wipMt = Number(wipRow?.current_wip_mt || mtFromMtr(wipMtr, wo.size_od || 0, wo.size_wt || 0));

        // For Rolling stage: plan issued
        let planMtr = Number(plan?.planned_qty || 0);
        let planPcs = planMtr > 0 && avgLen > 0 ? Math.round(planMtr / avgLen) : 0;
        if (isMaster && masterInfo) {
          planMtr = Number(masterInfo.parsed?.total_campaign_mtr || planMtr);
          planPcs = Number(masterInfo.parsed?.total_campaign_pcs || planPcs);
        }

        return {
          ...stageDef,
          planMtr,
          planPcs,
          outMtr,
          outPcs,
          rejMtr,
          rejPcs,
          htcOkMtr,
          htcOkPcs,
          wipMtr,
          wipPcs,
          wipMt,
          logsCount: sLogs.length,
        };
      });

      // Overall Progress & Yield
      const totalOutMtr = stagesData.reduce((sum, s) => sum + s.outMtr, 0);
      const totalRejMtr = stagesData.reduce((sum, s) => sum + s.rejMtr, 0);
      const finishingOutMtr = stagesData.find((s) => s.code === 'FINISHING')?.outMtr || 0;
      const rollingPlanMtr = stagesData.find((s) => s.code === 'ROLLING')?.planMtr || wo.ordered_qty;

      const completionPct = rollingPlanMtr > 0 ? Math.min(100, Math.round((finishingOutMtr / rollingPlanMtr) * 100)) : 0;
      const processYieldPct =
        finishingOutMtr + totalRejMtr > 0
          ? Math.round((finishingOutMtr / (finishingOutMtr + totalRejMtr)) * 100)
          : 100;

      return {
        wo,
        avgLen,
        isMaster,
        masterInfo,
        childInfo,
        plan,
        stagesData,
        finishingOutMtr,
        totalRejMtr,
        completionPct,
        processYieldPct,
        logs: woLogs,
      };
    },
    [campaignMeta, rollingPlans, productionLogs, stageWip]
  );

  // Toggle single work order details
  const toggleWo = (id: string) => {
    setExpandedWos((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Toggle all
  const toggleAll = () => {
    const anyExpanded = filteredWorkOrders.some((w) => expandedWos[w.id]);
    const nextState: Record<string, boolean> = {};
    filteredWorkOrders.forEach((w) => {
      nextState[w.id] = !anyExpanded;
    });
    setExpandedWos(nextState);
  };

  // Reset Filters
  const resetFilters = () => {
    setFilterWo('');
    setFilterCustomer('');
    setFromOd('');
    setToOd('');
    setFromDate('');
    setToDate('');
    setFilterStatus('');
  };

  // KPI calculations across filtered work orders
  const kpis = useMemo(() => {
    let totalOrderedMtr = 0;
    let totalRollingWipMtr = 0;
    let totalFinishingOutMtr = 0;
    let totalRejMtr = 0;

    filteredWorkOrders.forEach((wo) => {
      totalOrderedMtr += Number(wo.ordered_qty || 0);
      const row = getWoTrackingData(wo);
      const rollStage = row.stagesData.find((s) => s.code === 'ROLLING');
      const finStage = row.stagesData.find((s) => s.code === 'FINISHING');
      totalRollingWipMtr += rollStage?.wipMtr || 0;
      totalFinishingOutMtr += finStage?.outMtr || 0;
      totalRejMtr += row.totalRejMtr;
    });

    const factoryYield =
      totalFinishingOutMtr + totalRejMtr > 0
        ? ((totalFinishingOutMtr / (totalFinishingOutMtr + totalRejMtr)) * 100).toFixed(1)
        : '100';

    return {
      totalOrders: filteredWorkOrders.length,
      totalOrderedMtr,
      totalRollingWipMtr,
      totalFinishingOutMtr,
      factoryYield,
    };
  }, [filteredWorkOrders, getWoTrackingData]);

  // Export to Excel
  const exportToExcel = () => {
    const rows = filteredWorkOrders.map((wo) => {
      const row = getWoTrackingData(wo);
      const rRoll = row.stagesData.find((s) => s.code === 'ROLLING');
      const rHtc = row.stagesData.find((s) => s.code === 'HOLLOW_HEAT_TREATMENT');
      const rDraw = row.stagesData.find((s) => s.code === 'DRAW');
      const rHt = row.stagesData.find((s) => s.code === 'HEAT_TREATMENT');
      const rFin = row.stagesData.find((s) => s.code === 'FINISHING');

      return {
        'WO No.': wo.work_order_no,
        'Customer': wo.customer_name || '—',
        'Grade': wo.grade || wo.specification || '—',
        'Finished OD (mm)': wo.size_od,
        'Finished WT (mm)': wo.size_wt,
        'Length L1-L2 (m)': `${wo.l1 || '—'} - ${wo.l2 || '—'}`,
        'Ordered Qty (Mtr)': wo.ordered_qty,
        'Status': wo.status,
        'Campaign Type': row.isMaster ? 'Master Campaign' : row.childInfo ? 'Child Order' : 'Single Order',
        'Mother Hollow OD (mm)': row.plan?.mh_od || '—',
        'Mother Hollow WT (mm)': row.plan?.mh_wt || '—',
        // Rolling Mill
        'Rolling Plan (Mtr)': rRoll?.planMtr || 0,
        'Rolling Output (Mtr)': rRoll?.outMtr || 0,
        'Rolling Output (Pcs)': rRoll?.outPcs || 0,
        'Rolling Rejection (Mtr)': rRoll?.rejMtr || 0,
        'Rolling WIP (Mtr)': rRoll?.wipMtr || 0,
        // HTC
        'HTC Output (Mtr)': rHtc?.outMtr || 0,
        'HTC Rejection (Mtr)': rHtc?.rejMtr || 0,
        'HTC OK (Mtr)': rHtc?.htcOkMtr || 0,
        'HTC WIP (Mtr)': rHtc?.wipMtr || 0,
        // Draw Bench
        'Draw Output (Mtr)': rDraw?.outMtr || 0,
        'Draw Rejection (Mtr)': rDraw?.rejMtr || 0,
        'Draw WIP (Mtr)': rDraw?.wipMtr || 0,
        // Heat Treatment
        'HT Output (Mtr)': rHt?.outMtr || 0,
        'HT Rejection (Mtr)': rHt?.rejMtr || 0,
        'HT WIP (Mtr)': rHt?.wipMtr || 0,
        // Finishing
        'Finishing Output (Mtr)': rFin?.outMtr || 0,
        'Finishing Output (Pcs)': rFin?.outPcs || 0,
        'Finishing Rejection (Mtr)': rFin?.rejMtr || 0,
        'Final Goods WIP (Mtr)': rFin?.wipMtr || 0,
        // Summary
        'Completion (%)': `${row.completionPct}%`,
        'Process Yield (%)': `${row.processYieldPct}%`,
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'WO Tracking');
    const dateStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `work-order-tracking-sheet-${dateStr}.xlsx`);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <span>Work Order Tracking Sheet</span>
            <span className="text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-2.5 py-0.5">
              Live Stage Flow
            </span>
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            End-to-end station tracking: Rolling Mill &rarr; HTC &rarr; Draw Bench &rarr; Heat Treatment &rarr; Finishing Line
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            onClick={exportToExcel}
            className="inline-flex items-center gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs text-sm h-9"
          >
            <Download size={14} /> Export to Excel
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={fetchData}
            className="text-sm h-9 gap-1.5"
            title="Refresh live tracking data"
          >
            <RotateCcw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </Button>
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Card className="border-slate-200 bg-white">
          <CardContent className="p-4">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Filtered Orders</div>
            <div className="mt-1 text-2xl font-bold text-slate-900 font-mono">{kpis.totalOrders}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">Active in view</div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white">
          <CardContent className="p-4">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Ordered</div>
            <div className="mt-1 text-2xl font-bold text-slate-900 font-mono">{fmt(kpis.totalOrderedMtr, 'm')}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">Target delivery volume</div>
          </CardContent>
        </Card>

        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="p-4">
            <div className="text-xs font-semibold text-blue-700 uppercase tracking-wider">Active Rolling WIP</div>
            <div className="mt-1 text-2xl font-bold text-blue-900 font-mono">{fmt(kpis.totalRollingWipMtr, 'm')}</div>
            <div className="text-[11px] text-blue-600 mt-0.5">In piercing & rolling</div>
          </CardContent>
        </Card>

        <Card className="border-emerald-200 bg-emerald-50/50">
          <CardContent className="p-4">
            <div className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Finished Output</div>
            <div className="mt-1 text-2xl font-bold text-emerald-900 font-mono">{fmt(kpis.totalFinishingOutMtr, 'm')}</div>
            <div className="text-[11px] text-emerald-600 mt-0.5">Final inspected & cut</div>
          </CardContent>
        </Card>

        <Card className="border-indigo-200 bg-indigo-50/50">
          <CardContent className="p-4">
            <div className="text-xs font-semibold text-indigo-700 uppercase tracking-wider">Process Yield</div>
            <div className="mt-1 text-2xl font-bold text-indigo-900 font-mono">{kpis.factoryYield}%</div>
            <div className="text-[11px] text-indigo-600 mt-0.5">Overall yield efficiency</div>
          </CardContent>
        </Card>
      </div>

      {/* Responsive Filter Panel */}
      <Card className="border-slate-200/90 bg-white shadow-xs">
        <CardHeader className="bg-slate-50/80 px-4 py-3 border-b border-slate-200 flex flex-row items-center justify-between">
          <div className="font-bold text-slate-800 text-sm flex items-center gap-2">
            <SlidersHorizontal size={15} className="text-blue-600" />
            <span>Filter Tracking Sheet</span>
          </div>
          <button
            type="button"
            onClick={resetFilters}
            className="text-xs font-semibold text-slate-500 hover:text-blue-600 transition flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw size={11} /> Reset Filters
          </button>
        </CardHeader>

        <CardContent className="p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6 text-sm">
            {/* Work Order No search */}
            <div>
              <label className="text-xs font-semibold text-slate-600">Work Order No.</label>
              <div className="relative mt-1">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <Input
                  className="pl-8 text-sm h-9"
                  placeholder="e.g. WO-2026-101"
                  value={filterWo}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFilterWo(e.target.value)}
                />
              </div>
            </div>

            {/* Customer Search */}
            <div>
              <label className="text-xs font-semibold text-slate-600">Customer</label>
              <Input
                className="mt-1 text-sm h-9"
                placeholder="e.g. Apex Energy"
                value={filterCustomer}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFilterCustomer(e.target.value)}
              />
            </div>

            {/* From OD (mm) */}
            <div>
              <label className="text-xs font-semibold text-slate-600">From OD (mm)</label>
              <Input
                type="number"
                step="0.1"
                className="mt-1 text-sm h-9"
                placeholder="Min OD (e.g. 40)"
                value={fromOd}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFromOd(e.target.value)}
              />
            </div>

            {/* To OD (mm) */}
            <div>
              <label className="text-xs font-semibold text-slate-600">To OD (mm)</label>
              <Input
                type="number"
                step="0.1"
                className="mt-1 text-sm h-9"
                placeholder="Max OD (e.g. 90)"
                value={toOd}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setToOd(e.target.value)}
              />
            </div>

            {/* From Date */}
            <div>
              <label className="text-xs font-semibold text-slate-600">From Date</label>
              <Input
                type="date"
                className="mt-1 text-sm h-9"
                value={fromDate}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFromDate(e.target.value)}
              />
            </div>

            {/* To Date */}
            <div>
              <label className="text-xs font-semibold text-slate-600">To Date</label>
              <Input
                type="date"
                className="mt-1 text-sm h-9"
                value={toDate}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setToDate(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-500">Status:</label>
              <Select
                className="text-xs h-8 max-w-[150px]"
                value={filterStatus}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilterStatus(e.target.value)}
              >
                <option value="">All Statuses</option>
                <option value="Scheduled">Scheduled</option>
                <option value="In Progress">In Progress</option>
                <option value="Completed">Completed</option>
                <option value="Pending Plan">Pending Plan</option>
                <option value="Diverted">Diverted</option>
              </Select>
            </div>

            <div className="text-xs text-slate-500 font-medium">
              Showing <span className="font-bold text-slate-800">{filteredWorkOrders.length}</span> of{' '}
              <span className="font-bold text-slate-800">{workOrders.length}</span> work orders
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Tracking Sheet Table */}
      <div className="rounded-xl border border-slate-200/90 bg-white shadow-xs overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200/80 px-4 py-3 bg-slate-50/70">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800 text-sm">Station Progress Matrix</span>
            <span className="text-xs text-slate-500">
              (Rolling &rarr; Hollow HT &rarr; Draw Bench &rarr; HT &rarr; Finishing)
            </span>
          </div>
          <button
            type="button"
            onClick={toggleAll}
            className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition cursor-pointer flex items-center gap-1"
          >
            <Layers size={12} />
            {filteredWorkOrders.some((w) => expandedWos[w.id]) ? 'Collapse All History' : 'Expand All History'}
          </button>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-12 text-center text-sm text-slate-500">Loading work order tracking data...</div>
          ) : filteredWorkOrders.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-500">
              No work orders match the selected filters.
            </div>
          ) : (
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50/90 border-b border-slate-200 text-slate-700">
                <tr>
                  <th className="py-3 px-3 text-left font-bold min-w-[200px]">Work Order & Specs</th>
                  <th className="py-3 px-3 text-center font-bold min-w-[130px] bg-blue-50/70 border-x border-blue-100 text-blue-900">
                    1. Rolling Mill
                  </th>
                  <th className="py-3 px-3 text-center font-bold min-w-[120px] bg-amber-50/70 border-r border-amber-100 text-amber-900">
                    2. Hollow HT (HTC)
                  </th>
                  <th className="py-3 px-3 text-center font-bold min-w-[120px] bg-indigo-50/70 border-r border-indigo-100 text-indigo-900">
                    3. Draw Bench
                  </th>
                  <th className="py-3 px-3 text-center font-bold min-w-[120px] bg-orange-50/70 border-r border-orange-100 text-orange-900">
                    4. Heat Treatment
                  </th>
                  <th className="py-3 px-3 text-center font-bold min-w-[130px] bg-emerald-50/70 border-r border-emerald-100 text-emerald-900">
                    5. Finishing Line
                  </th>
                  <th className="py-3 px-3 text-right font-bold min-w-[110px]">Progress & Yield</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filteredWorkOrders.map((wo) => {
                  const data = getWoTrackingData(wo);
                  const isExpanded = !!expandedWos[wo.id];
                  const rRoll = data.stagesData.find((s) => s.code === 'ROLLING');
                  const rHtc = data.stagesData.find((s) => s.code === 'HOLLOW_HEAT_TREATMENT');
                  const rDraw = data.stagesData.find((s) => s.code === 'DRAW');
                  const rHt = data.stagesData.find((s) => s.code === 'HEAT_TREATMENT');
                  const rFin = data.stagesData.find((s) => s.code === 'FINISHING');

                  return (
                    <React.Fragment key={wo.id}>
                      <tr className="hover:bg-slate-50/50 transition-colors">
                        {/* Work Order Info */}
                        <td className="py-3 px-3 align-top">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-slate-900 font-mono text-sm">{wo.work_order_no}</span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold border ${
                                wo.status === 'Completed'
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  : wo.status === 'In Progress'
                                  ? 'bg-blue-50 text-blue-800 border-blue-200'
                                  : 'bg-slate-100 text-slate-700 border-slate-200'
                              }`}
                            >
                              {wo.status}
                            </span>
                          </div>

                          <div className="text-slate-600 font-medium truncate max-w-[190px] mt-0.5">
                            {wo.customer_name || '—'}
                          </div>

                          <div className="font-mono text-slate-800 mt-1">
                            {wo.size_od} × {wo.size_wt} mm ({wo.l1 || '—'}-{wo.l2 || '—'}m)
                          </div>

                          <div className="text-slate-500 text-[11px]">
                            Ord: <strong className="text-slate-800">{fmt(wo.ordered_qty)} {wo.uom}</strong> · {wo.grade || wo.specification || '—'}
                          </div>

                          {/* Master / Child Badge */}
                          {data.isMaster && (
                            <div className="mt-1.5 inline-flex items-center gap-1 rounded bg-indigo-50 border border-indigo-200/80 px-1.5 py-0.5 text-[10px] font-bold text-indigo-900">
                              <Crown size={10} className="text-indigo-600" />
                              Master Campaign ({data.masterInfo?.child_work_orders?.length || 0} Children)
                            </div>
                          )}
                          {data.childInfo && (
                            <div className="mt-1.5 inline-flex items-center gap-1 rounded bg-slate-100 border border-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
                              Child of {data.childInfo.master_wo_no}
                            </div>
                          )}

                          {data.logs.length > 0 && (
                            <div className="mt-2">
                              <button
                                type="button"
                                onClick={() => toggleWo(wo.id)}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 transition cursor-pointer"
                              >
                                {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                {data.logs.length} Logged Entries
                              </button>
                            </div>
                          )}
                        </td>

                        {/* 1. Rolling Mill */}
                        <td className="py-3 px-3 align-top bg-blue-50/30 border-x border-blue-100">
                          <div className="space-y-1">
                            {data.plan?.mh_od ? (
                              <div className="text-[10px] font-mono text-blue-900 bg-blue-100/60 rounded px-1 py-0.5">
                                MH: {data.plan.mh_od} × {data.plan.mh_wt}mm
                              </div>
                            ) : null}

                            <div className="flex justify-between text-slate-600">
                              <span>Plan:</span>
                              <span className="font-mono font-bold text-slate-800">{fmt(rRoll?.planMtr || 0)}m</span>
                            </div>

                            <div className="flex justify-between text-slate-600">
                              <span>Output:</span>
                              <span className="font-mono font-bold text-emerald-700">{fmt(rRoll?.outMtr || 0)}m</span>
                            </div>

                            {Number(rRoll?.rejMtr || 0) > 0 && (
                              <div className="flex justify-between text-rose-600">
                                <span>Rej:</span>
                                <span className="font-mono">{fmt(rRoll?.rejMtr || 0)}m</span>
                              </div>
                            )}

                            <div className="flex justify-between pt-1 border-t border-blue-200/60 text-blue-900 font-bold">
                              <span>WIP:</span>
                              <span className="font-mono">{fmt(rRoll?.wipMtr || 0)}m</span>
                            </div>
                          </div>
                        </td>

                        {/* 2. Hollow Heat Treatment (HTC) */}
                        <td className="py-3 px-3 align-top bg-amber-50/30 border-r border-amber-100">
                          <div className="space-y-1">
                            <div className="flex justify-between text-slate-600">
                              <span>Output:</span>
                              <span className="font-mono font-bold text-emerald-700">{fmt(rHtc?.outMtr || 0)}m</span>
                            </div>

                            {Number(rHtc?.htcOkMtr || 0) > 0 && (
                              <div className="flex justify-between text-indigo-700 font-medium">
                                <span>HTC OK:</span>
                                <span className="font-mono">{fmt(rHtc?.htcOkMtr || 0)}m</span>
                              </div>
                            )}

                            {Number(rHtc?.rejMtr || 0) > 0 && (
                              <div className="flex justify-between text-rose-600">
                                <span>Rej:</span>
                                <span className="font-mono">{fmt(rHtc?.rejMtr || 0)}m</span>
                              </div>
                            )}

                            <div className="flex justify-between pt-1 border-t border-amber-200/60 text-amber-900 font-bold">
                              <span>WIP:</span>
                              <span className="font-mono">{fmt(rHtc?.wipMtr || 0)}m</span>
                            </div>
                          </div>
                        </td>

                        {/* 3. Draw Bench */}
                        <td className="py-3 px-3 align-top bg-indigo-50/30 border-r border-indigo-100">
                          <div className="space-y-1">
                            <div className="flex justify-between text-slate-600">
                              <span>Output:</span>
                              <span className="font-mono font-bold text-emerald-700">{fmt(rDraw?.outMtr || 0)}m</span>
                            </div>

                            {Number(rDraw?.rejMtr || 0) > 0 && (
                              <div className="flex justify-between text-rose-600">
                                <span>Rej:</span>
                                <span className="font-mono">{fmt(rDraw?.rejMtr || 0)}m</span>
                              </div>
                            )}

                            <div className="flex justify-between pt-1 border-t border-indigo-200/60 text-indigo-900 font-bold">
                              <span>WIP:</span>
                              <span className="font-mono">{fmt(rDraw?.wipMtr || 0)}m</span>
                            </div>
                          </div>
                        </td>

                        {/* 4. Heat Treatment */}
                        <td className="py-3 px-3 align-top bg-orange-50/30 border-r border-orange-100">
                          <div className="space-y-1">
                            <div className="flex justify-between text-slate-600">
                              <span>Output:</span>
                              <span className="font-mono font-bold text-emerald-700">{fmt(rHt?.outMtr || 0)}m</span>
                            </div>

                            {Number(rHt?.rejMtr || 0) > 0 && (
                              <div className="flex justify-between text-rose-600">
                                <span>Rej:</span>
                                <span className="font-mono">{fmt(rHt?.rejMtr || 0)}m</span>
                              </div>
                            )}

                            <div className="flex justify-between pt-1 border-t border-orange-200/60 text-orange-900 font-bold">
                              <span>WIP:</span>
                              <span className="font-mono">{fmt(rHt?.wipMtr || 0)}m</span>
                            </div>
                          </div>
                        </td>

                        {/* 5. Finishing Line */}
                        <td className="py-3 px-3 align-top bg-emerald-50/30 border-r border-emerald-100">
                          <div className="space-y-1">
                            <div className="flex justify-between text-slate-600">
                              <span>Finished:</span>
                              <span className="font-mono font-bold text-emerald-800 text-[13px]">{fmt(rFin?.outMtr || 0)}m</span>
                            </div>

                            <div className="flex justify-between text-slate-500">
                              <span>Cut Pcs:</span>
                              <span className="font-mono font-bold text-slate-700">{fmt(rFin?.outPcs || 0)}</span>
                            </div>

                            {Number(rFin?.rejMtr || 0) > 0 && (
                              <div className="flex justify-between text-rose-600">
                                <span>Rej:</span>
                                <span className="font-mono">{fmt(rFin?.rejMtr || 0)}m</span>
                              </div>
                            )}

                            <div className="flex justify-between pt-1 border-t border-emerald-200/60 text-emerald-900 font-bold">
                              <span>Stock WIP:</span>
                              <span className="font-mono">{fmt(rFin?.wipMtr || 0)}m</span>
                            </div>
                          </div>
                        </td>

                        {/* Overall Completion & Yield */}
                        <td className="py-3 px-3 align-top text-right">
                          <div className="space-y-1.5">
                            <div>
                              <div className="flex justify-between text-[11px]">
                                <span className="text-slate-500">Completed:</span>
                                <span className="font-bold text-slate-900 font-mono">{data.completionPct}%</span>
                              </div>
                              <div className="w-full bg-slate-100 rounded-full h-1.5 mt-0.5 overflow-hidden">
                                <div
                                  className="bg-emerald-600 h-1.5 rounded-full transition-all"
                                  style={{ width: `${data.completionPct}%` }}
                                />
                              </div>
                            </div>

                            <div className="text-[11px] flex justify-between">
                              <span className="text-slate-500">Yield:</span>
                              <span className="font-bold font-mono text-indigo-700">{data.processYieldPct}%</span>
                            </div>

                            {data.totalRejMtr > 0 && (
                              <div className="text-[10px] text-rose-600 font-mono">
                                Total Scrap: {fmt(data.totalRejMtr)}m
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Expanded Production History Rows */}
                      {isExpanded && (
                        <tr className="bg-slate-50/80 border-b border-slate-200">
                          <td colSpan={7} className="p-3">
                            <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2 shadow-2xs">
                              <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                                  <Clock size={13} className="text-blue-600" />
                                  Shift Production Log History for {wo.work_order_no}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => toggleWo(wo.id)}
                                  className="text-[11px] font-semibold text-slate-500 hover:text-slate-900 cursor-pointer"
                                >
                                  Close History
                                </button>
                              </div>

                              <div className="overflow-x-auto">
                                <table className="min-w-full text-[11px]">
                                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                                    <tr>
                                      <th className="py-1.5 px-2 text-left font-semibold">Date & Shift</th>
                                      <th className="py-1.5 px-2 text-left font-semibold">Stage</th>
                                      <th className="py-1.5 px-2 text-left font-semibold">Heat / Lot</th>
                                      <th className="py-1.5 px-2 text-right font-semibold">Output</th>
                                      <th className="py-1.5 px-2 text-right font-semibold">Rejection</th>
                                      <th className="py-1.5 px-2 text-right font-semibold">HTC OK</th>
                                      <th className="py-1.5 px-2 text-left font-semibold">Operator</th>
                                      <th className="py-1.5 px-2 text-left font-semibold">Remarks</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 font-mono">
                                    {data.logs.map((log) => (
                                      <tr key={log.id} className="hover:bg-slate-50/60">
                                        <td className="py-1.5 px-2 text-slate-800 font-sans">
                                          {log.shift_date} {log.shift ? `(${log.shift})` : ''}
                                        </td>
                                        <td className="py-1.5 px-2 text-slate-900 font-sans font-medium">
                                          {log.stage_name}
                                        </td>
                                        <td className="py-1.5 px-2 text-slate-600">
                                          {log.heat_no || '—'} / {log.lot_no || '—'}
                                        </td>
                                        <td className="py-1.5 px-2 text-right font-bold text-emerald-700">
                                          {fmt(log.output_qty)}m {log.output_pcs ? `(${log.output_pcs} pcs)` : ''}
                                        </td>
                                        <td className="py-1.5 px-2 text-right text-rose-600">
                                          {log.rejection_qty > 0 ? `${fmt(log.rejection_qty)}m` : '0'}
                                        </td>
                                        <td className="py-1.5 px-2 text-right text-indigo-700 font-semibold">
                                          {Number(log.htc_ok_qty || 0) > 0 ? `${fmt(log.htc_ok_qty)}m` : '—'}
                                        </td>
                                        <td className="py-1.5 px-2 text-slate-600 font-sans">
                                          {log.operator_name || '—'}
                                        </td>
                                        <td className="py-1.5 px-2 text-slate-500 font-sans truncate max-w-[200px]">
                                          {log.remarks || '—'}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
