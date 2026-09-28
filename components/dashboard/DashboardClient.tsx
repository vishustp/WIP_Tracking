'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import {
  Layers,
  ArrowRight,
  TrendingUp,
  AlertTriangle,
  Clock,
  Factory,
  FileText,
  Flame,
  Disc,
  Package,
  CheckCircle2,
  Calendar,
  Wrench,
  Search,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';
import { mtFromMtr } from '@/lib/productionUtils';

const formatNum = (v: unknown, decimals = 0) => {
  const num = Number(v);
  if (!Number.isFinite(num)) return '0';
  return num.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};

type KPI = {
  active_work_orders?: number;
  pending_planning?: number;
  scheduled_orders?: number;
  in_progress_orders?: number;
  completed_today?: number;
  total_wip?: number;
  total_wip_mtr?: number;
  total_wip_pcs?: number;
  total_wip_mt?: number;
  today_prod_mt?: number;
  today_rej_mt?: number;
  today_rej_pct?: number;
  rejection_qty?: number;
  delayed_orders?: number;
};

type WIPRow = {
  work_order_id?: string;
  work_order_no: string;
  customer_name?: string | null;
  route_id?: string;
  route_code: string;
  route_name?: string;
  stage_id?: string;
  stage_code?: string;
  stage_name: string;
  sequence_no: number;
  incoming_qty?: number;
  current_wip: number;
  current_wip_pcs?: number;
  current_wip_mt?: number;
  size_od?: number | null;
  size_wt?: number | null;
  grade?: string | null;
  target_date?: string | null;
};

type PendingRow = {
  work_order_id: string;
  work_order_no: string;
  customer?: string | null;
  od?: number | null;
  wt?: number | null;
  grade?: string | null;
  route?: string | null;
  total_pending: number;
  ordered_qty?: string | number;
  planned_qty?: number;
  produced_qty?: number;
  rejected_qty?: number;
  target_date?: string | null;
  status?: string;
};

export type RecentProductionItem = {
  id: string;
  time: string;
  stage: string;
  woNo: string;
  qtyMt: string;
  rejMt: string;
  operator: string;
};

export type TrendDataPoint = {
  day: string;
  rolling: number;
  hollowHt: number;
  draw: number;
  heatTreatment: number;
  bandSaw: number;
  vdi: number;
  finishing: number;
};

interface Props {
  kpi: KPI | null;
  wip: WIPRow[];
  pending: PendingRow[];
  recentProduction?: RecentProductionItem[];
  trendData?: TrendDataPoint[];
}

// 7 Real Canonical Work Centers in the Project Flow
const CANONICAL_WORK_CENTERS = [
  { code: 'ROLLING', name: 'Rolling', fullName: 'Hot Rolling Mill', icon: Flame, color: '#ef4444', badgeBg: 'bg-rose-50/90 border-rose-200 text-rose-900' },
  { code: 'HOLLOW_HEAT_TREATMENT', name: 'Hollow HT', fullName: 'Hollow Heat Treatment', icon: Flame, color: '#f97316', badgeBg: 'bg-orange-50/90 border-orange-200 text-orange-900' },
  { code: 'DRAW', name: 'Draw', fullName: 'Cold Draw Bench', icon: Wrench, color: '#3b82f6', badgeBg: 'bg-blue-50/90 border-blue-200 text-blue-900' },
  { code: 'HEAT_TREATMENT', name: 'Heat Treatment', fullName: 'Final Heat Treatment', icon: Flame, color: '#10b981', badgeBg: 'bg-emerald-50/90 border-emerald-200 text-emerald-900' },
  { code: 'BAND_SAW', name: 'Bandsaw', fullName: 'Band Saw Cutting', icon: Disc, color: '#eab308', badgeBg: 'bg-amber-50/90 border-amber-200 text-amber-900' },
  { code: 'VDI', name: 'VDI', fullName: 'VDI / QC Inspection', icon: Package, color: '#8b5cf6', badgeBg: 'bg-purple-50/90 border-purple-200 text-purple-900' },
  { code: 'FINISHING', name: 'Finishing', fullName: 'Finishing & Dispatch', icon: CheckCircle2, color: '#06b6d4', badgeBg: 'bg-cyan-50/90 border-cyan-200 text-cyan-900' },
];

export default function DashboardClient({ kpi, wip, pending, recentProduction = [], trendData = [] }: Props) {
  // 1. Calculate Real Total Plant WIP MT strictly from active data
  const totalPlantWipMt = useMemo(() => {
    const rawSum = wip.reduce((acc, r) => {
      const mtr = Number(r.current_wip || 0);
      const od = Number(r.size_od || 0);
      const wt = Number(r.size_wt || 0);
      return acc + Number(r.current_wip_mt ?? (od > 0 && wt > 0 ? mtFromMtr(mtr, od, wt) : 0));
    }, 0);
    return Number(kpi?.total_wip_mt ?? rawSum);
  }, [kpi, wip]);

  // 2. Real WIP by Stage strictly across the 7 Project Work Centers
  const stageWipMap = useMemo(() => {
    const map: Record<string, { mt: number; pcs: number; mtr: number }> = {
      ROLLING: { mt: 0, pcs: 0, mtr: 0 },
      HOLLOW_HEAT_TREATMENT: { mt: 0, pcs: 0, mtr: 0 },
      DRAW: { mt: 0, pcs: 0, mtr: 0 },
      HEAT_TREATMENT: { mt: 0, pcs: 0, mtr: 0 },
      BAND_SAW: { mt: 0, pcs: 0, mtr: 0 },
      VDI: { mt: 0, pcs: 0, mtr: 0 },
      FINISHING: { mt: 0, pcs: 0, mtr: 0 },
    };

    for (const r of wip) {
      const rawCode = (r.stage_code || '').toUpperCase();
      let key = '';
      if (rawCode.includes('ROLL')) key = 'ROLLING';
      else if (rawCode.includes('HOLLOW') || rawCode === 'HTC') key = 'HOLLOW_HEAT_TREATMENT';
      else if (rawCode.includes('DRAW') || rawCode.includes('PILGER')) key = 'DRAW';
      else if (rawCode === 'HEAT_TREATMENT' || rawCode === 'HT') key = 'HEAT_TREATMENT';
      else if (rawCode.includes('SAW') || rawCode.includes('CUT')) key = 'BAND_SAW';
      else if (rawCode.includes('VDI') || rawCode.includes('QC')) key = 'VDI';
      else if (rawCode.includes('FINISH')) key = 'FINISHING';

      if (key && map[key]) {
        const mtr = Number(r.current_wip || 0);
        const pcs = Number(r.current_wip_pcs || 0);
        const od = Number(r.size_od || 0);
        const wt = Number(r.size_wt || 0);
        const mt = Number(r.current_wip_mt ?? (od > 0 && wt > 0 ? mtFromMtr(mtr, od, wt) : 0));
        map[key].mt += mt;
        map[key].pcs += pcs;
        map[key].mtr += mtr;
      }
    }
    return map;
  }, [wip]);

  // 3. Row 1: Top 5 Summary KPI Cards strictly with Real Database Metrics
  const summaryMetrics = useMemo(() => {
    const todayProd = Number(kpi?.today_prod_mt ?? (kpi?.completed_today ? Number(kpi.completed_today) : 0));
    const rejPct = Number(kpi?.today_rej_pct ?? 0);
    const delayedCount = Number(kpi?.delayed_orders ?? pending.filter((p) => p.target_date && new Date(p.target_date) < new Date()).length);
    const activeOrders = Number(kpi?.active_work_orders ?? pending.length);

    return [
      {
        title: 'Total WIP',
        value: `${formatNum(totalPlantWipMt, 1)} MT`,
        subText: `${formatNum(kpi?.total_wip_pcs || 0)} Pieces in Mill`,
        icon: Layers,
        iconBg: 'bg-blue-100 text-blue-600',
        badge: 'Plant WIP',
        badgeColor: 'text-blue-700 bg-blue-50 border-blue-200',
      },
      {
        title: 'Today Production',
        value: `${formatNum(todayProd, 1)} MT`,
        subText: todayProd > 0 ? 'Active Shift Logged' : 'No Output Logged Today',
        icon: Factory,
        iconBg: 'bg-emerald-100 text-emerald-600',
        badge: 'Output',
        badgeColor: 'text-emerald-700 bg-emerald-50 border-emerald-200',
      },
      {
        title: 'Rejection',
        value: `${rejPct.toFixed(1)} %`,
        subText: `${formatNum(kpi?.today_rej_mt ?? 0, 1)} MT Scrapped`,
        icon: AlertTriangle,
        iconBg: 'bg-rose-100 text-rose-600',
        badge: 'Quality',
        badgeColor: 'text-rose-700 bg-rose-50 border-rose-200',
      },
      {
        title: 'Delayed Orders',
        value: String(delayedCount),
        subText: delayedCount > 0 ? 'Past Target Date' : 'All Orders On Schedule',
        icon: Clock,
        iconBg: 'bg-amber-100 text-amber-600',
        badge: delayedCount > 0 ? 'Action Req.' : 'Nominal',
        badgeColor: delayedCount > 0 ? 'text-amber-700 bg-amber-50 border-amber-200' : 'text-slate-600 bg-slate-50 border-slate-200',
      },
      {
        title: 'Active Work Orders',
        value: String(activeOrders),
        subText: 'Scheduled & In Progress',
        icon: FileText,
        iconBg: 'bg-purple-100 text-purple-600',
        badge: 'In Flight',
        badgeColor: 'text-purple-700 bg-purple-50 border-purple-200',
      },
    ];
  }, [totalPlantWipMt, kpi, pending]);

  // 4. Row 2: 7 Real Work Centers in Pipe Manufacturing Sequence
  const pipelineStages = useMemo(() => {
    return CANONICAL_WORK_CENTERS.map((wc) => {
      const data = stageWipMap[wc.code] || { mt: 0, pcs: 0, mtr: 0 };
      return {
        ...wc,
        mt: data.mt,
        pcs: data.pcs,
        mtr: data.mtr,
      };
    });
  }, [stageWipMap]);

  // 5. Row 3: Donut Chart Data (Distribution across project work centers)
  const distributionData = useMemo(() => {
    const totalMt = totalPlantWipMt > 0 ? totalPlantWipMt : 1;
    return CANONICAL_WORK_CENTERS.map((wc) => {
      const stageMt = stageWipMap[wc.code]?.mt || 0;
      const pctNum = (stageMt / totalMt) * 100;
      return {
        name: wc.name,
        fullName: wc.fullName,
        mt: stageMt,
        pct: `${pctNum.toFixed(1)}%`,
        color: wc.color,
      };
    }).filter((d) => totalPlantWipMt === 0 || d.mt > 0);
  }, [stageWipMap, totalPlantWipMt]);

  // 6. Row 3: Ranked Top Bottlenecks among Project Work Centers
  const rankedBottlenecks = useMemo(() => {
    const sorted = [...CANONICAL_WORK_CENTERS]
      .map((wc) => ({
        stage: wc.fullName,
        shortStage: wc.name,
        mt: stageWipMap[wc.code]?.mt || 0,
        pcs: stageWipMap[wc.code]?.pcs || 0,
      }))
      .sort((a, b) => b.mt - a.mt);

    const colors = [
      { badgeBg: 'bg-red-500', pillBg: 'bg-red-50 text-red-700 border-red-200' },
      { badgeBg: 'bg-orange-500', pillBg: 'bg-orange-50 text-orange-700 border-orange-200' },
      { badgeBg: 'bg-amber-500', pillBg: 'bg-amber-50 text-amber-700 border-amber-200' },
      { badgeBg: 'bg-blue-500', pillBg: 'bg-blue-50 text-blue-700 border-blue-200' },
      { badgeBg: 'bg-indigo-500', pillBg: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    ];

    return sorted.slice(0, 5).map((item, idx) => ({
      rank: idx + 1,
      stage: item.shortStage,
      mt: item.mt,
      pcs: item.pcs,
      badgeBg: colors[idx]?.badgeBg || 'bg-slate-500',
      pillBg: colors[idx]?.pillBg || 'bg-slate-50 text-slate-700 border-slate-200',
    }));
  }, [stageWipMap]);

  // 7. Row 4: Priority / Delayed Work Orders (from real pending data)
  const priorityWorkOrders = useMemo(() => {
    const now = new Date();
    return pending.slice(0, 7).map((row) => {
      let statusLabel = 'On Track';
      let statusColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';

      if (row.target_date) {
        const target = new Date(row.target_date);
        const diffDays = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays < 0) {
          statusLabel = 'Delayed';
          statusColor = 'bg-rose-50 text-rose-700 border-rose-200';
        } else if (diffDays <= 3) {
          statusLabel = 'At Risk';
          statusColor = 'bg-amber-50 text-amber-700 border-amber-200';
        }
      }

      // Find current stage for this WO
      const activeStage = wip.find((w) => w.work_order_no === row.work_order_no);
      const stageName = activeStage?.stage_name || row.route || 'In Progress';

      const od = Number(row.od || 0);
      const wt = Number(row.wt || 0);
      const mtr = Number(row.total_pending || 0);
      const wipMt = od > 0 && wt > 0 ? mtFromMtr(mtr, od, wt) : 0;

      let dueFormatted = '—';
      if (row.target_date) {
        const d = new Date(row.target_date);
        if (!isNaN(d.getTime())) {
          dueFormatted = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }).replace(/ /g, '-');
        }
      }

      return {
        woNo: row.work_order_no,
        customer: row.customer || '—',
        grade: row.grade || '—',
        size: od > 0 && wt > 0 ? `${od} × ${wt}` : '—',
        stage: stageName,
        wipMt: wipMt > 0 ? wipMt.toFixed(1) : String(mtr),
        status: statusLabel,
        statusColor,
        dueDate: dueFormatted,
      };
    });
  }, [pending, wip]);

  return (
    <div className="space-y-4">
      {/* ========================================================================= */}
      {/* ROW 1: 5 SUMMARY KPI CARDS                                                */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        {summaryMetrics.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.title}
              className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-3.5 flex flex-col justify-between transition-all hover:shadow-xs hover:border-slate-300"
            >
              <div className="flex items-start justify-between">
                <div className={`p-2 rounded-lg ${card.iconBg} shrink-0`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex flex-col text-right">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-tight">
                    {card.title}
                  </span>
                  <span className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight font-mono mt-0.5">
                    {card.value}
                  </span>
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-500 font-medium truncate max-w-[110px]">
                  {card.subText}
                </span>
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border ${card.badgeColor}`}>
                  {card.badge}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ========================================================================= */}
      {/* ROW 2: WIP BY PROCESS STAGE (7 CANONICAL PROJECT WORK CENTERS)             */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <span>WIP by Process Stage</span>
              <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                7 Canonical Work Centers
              </span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Live Work-in-Progress balance across active seamless pipe manufacturing stages
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">Total WIP:</span>
            <span className="text-sm font-black font-mono text-slate-900 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
              {formatNum(totalPlantWipMt, 1)} MT
            </span>
          </div>
        </div>

        {/* Pipeline horizontal row */}
        <div className="overflow-x-auto pb-2 scrollbar-thin">
          <div className="flex items-center gap-2 min-w-[860px]">
            {pipelineStages.map((stage, idx) => {
              const Icon = stage.icon;
              return (
                <div key={stage.code} className="flex items-center flex-1">
                  <div className={`flex-1 rounded-xl border p-3 flex flex-col items-center justify-center transition-all hover:scale-[1.02] cursor-default ${stage.badgeBg}`}>
                    <span className="text-xs font-bold text-slate-800 text-center tracking-tight truncate w-full">
                      {stage.name}
                    </span>

                    <div className="my-2 p-2 rounded-full bg-white/90 shadow-2xs border border-white">
                      <Icon className="h-4 w-4" style={{ color: stage.color }} />
                    </div>

                    <span className="text-sm font-black font-mono tracking-tight text-slate-950">
                      {formatNum(stage.mt, 1)} MT
                    </span>

                    <div className="flex items-center gap-1 mt-1 text-[11px] font-semibold text-slate-600">
                      <span>{formatNum(stage.pcs)} PCS</span>
                    </div>
                  </div>

                  {idx < pipelineStages.length - 1 && (
                    <div className="px-1 text-slate-400 shrink-0">
                      <ArrowRight className="h-4 w-4" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* ROW 3: VISUAL ANALYTICS IN 3 COLUMNS                                      */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Col 1: WIP Distribution Donut Chart (4 cols) */}
        <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200/90 shadow-2xs p-4 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 tracking-tight">WIP Distribution</h3>
            <p className="text-xs text-slate-500 mt-0.5">Stage share of total active WIP tonnage</p>
          </div>

          <div className="my-2 flex flex-col sm:flex-row items-center justify-between gap-4">
            {/* Donut graphic */}
            <div className="relative h-44 w-44 shrink-0 flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={distributionData.length > 0 ? distributionData : [{ name: 'Empty', mt: 1, color: '#cbd5e1', pct: '0%' }]}
                    innerRadius={50}
                    outerRadius={72}
                    paddingAngle={2}
                    dataKey="mt"
                  >
                    {distributionData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} stroke="#ffffff" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val: any, name: any) => [`${formatNum(val, 1)} MT`, name]}
                    contentStyle={{ borderRadius: '8px', fontSize: '12px', border: '1px solid #e2e8f0' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                <span className="text-base font-black font-mono text-slate-900 leading-none">
                  {formatNum(totalPlantWipMt, 0)}
                </span>
                <span className="text-[10px] font-bold text-slate-500 mt-0.5">MT Total</span>
              </div>
            </div>

            {/* Stage legend table */}
            <div className="flex-1 w-full space-y-1.5 text-xs">
              {distributionData.map((item) => (
                <div key={item.name} className="flex items-center justify-between py-0.5 border-b border-slate-50">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                    <span className="font-semibold text-slate-700 truncate">{item.name}</span>
                  </div>
                  <div className="flex items-center gap-2 font-mono shrink-0 pl-2">
                    <span className="font-bold text-slate-900">{formatNum(item.mt, 1)} MT</span>
                    <span className="text-slate-400 text-[11px] w-10 text-right">{item.pct}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Active Pipeline Stages:</span>
            <span className="font-bold text-slate-800">{distributionData.filter(d => d.mt > 0).length} Stages</span>
          </div>
        </div>

        {/* Col 2: Stage-wise Trend Last 7 Days (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200/90 shadow-2xs p-4 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 tracking-tight">Stage-wise Trend (Last 7 Days)</h3>
            <p className="text-xs text-slate-500 mt-0.5">Daily finished output progression across project work centers</p>
          </div>

          <div className="h-44 w-full my-2">
            {trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 8, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: '8px', fontSize: '11px', border: '1px solid #e2e8f0' }}
                    formatter={(v: any, n: any) => [`${formatNum(v, 1)} MT`, n]}
                  />
                  <Line type="monotone" dataKey="rolling" name="Rolling" stroke="#ef4444" strokeWidth={2} dot={{ r: 2.5 }} />
                  <Line type="monotone" dataKey="hollowHt" name="Hollow HT" stroke="#f97316" strokeWidth={2} dot={{ r: 2.5 }} />
                  <Line type="monotone" dataKey="draw" name="Draw" stroke="#3b82f6" strokeWidth={2} dot={{ r: 2.5 }} />
                  <Line type="monotone" dataKey="heatTreatment" name="Heat Treatment" stroke="#10b981" strokeWidth={2} dot={{ r: 2.5 }} />
                  <Line type="monotone" dataKey="finishing" name="Finishing" stroke="#06b6d4" strokeWidth={2} dot={{ r: 2.5 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-4 border border-dashed border-slate-200 rounded-lg">
                <Factory className="h-8 w-8 text-slate-300 mb-1" />
                <span className="text-xs font-semibold text-slate-600">No output logs recorded in past 7 days</span>
                <span className="text-[11px] text-slate-400">Production activity will plot automatically</span>
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-center gap-4 text-[11px] font-semibold text-slate-600 flex-wrap">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#ef4444]" />Rolling</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#f97316]" />Hollow HT</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#3b82f6]" />Draw</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#10b981]" />Heat Treatment</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#06b6d4]" />Finishing</span>
          </div>
        </div>

        {/* Col 3: Top 5 Bottlenecks (3 cols) */}
        <div className="lg:col-span-3 bg-white rounded-xl border border-slate-200/90 shadow-2xs p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">Top Bottlenecks</h3>
              <p className="text-xs text-slate-500 mt-0.5">Highest WIP buildup</p>
            </div>
            <span className="text-xs font-bold text-slate-500 font-mono">MT</span>
          </div>

          <div className="space-y-2 my-2">
            {rankedBottlenecks.map((item) => (
              <div
                key={item.stage}
                className={`flex items-center justify-between p-2 rounded-lg border transition-all ${item.pillBg}`}
              >
                <div className="flex items-center gap-2.5">
                  <div className={`h-5 w-5 rounded-full ${item.badgeBg} text-white flex items-center justify-center text-[10px] font-black shrink-0`}>
                    {item.rank}
                  </div>
                  <span className="text-xs font-bold truncate max-w-[110px]">{item.stage}</span>
                </div>
                <div className="text-right">
                  <span className="text-xs font-black font-mono">{formatNum(item.mt, 1)}</span>
                  <span className="text-[10px] font-normal text-slate-500 block leading-none">{formatNum(item.pcs)} pcs</span>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-2 border-t border-slate-100 text-right">
            <Link href="/reports/wip" className="text-xs font-bold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1">
              View Detailed WIP <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* ROW 4: OPERATIONAL TABLES (PRIORITY ORDERS & RECENT PRODUCTION)           */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: Priority / Delayed Work Orders (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200/90 shadow-2xs p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">Priority / Delayed Work Orders</h3>
              <p className="text-xs text-slate-500 mt-0.5">Orders requiring immediate shop-floor tracking</p>
            </div>
            <Link
              href="/reports/tracking"
              className="text-xs font-bold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
            >
              View All <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-tight bg-slate-50/70">
                  <th className="py-2 px-2.5">WO No</th>
                  <th className="py-2 px-2">Customer</th>
                  <th className="py-2 px-2">Grade</th>
                  <th className="py-2 px-2">Size (OD×WT)</th>
                  <th className="py-2 px-2">Stage</th>
                  <th className="py-2 px-2 text-right">Pending</th>
                  <th className="py-2 px-2 text-center">Status</th>
                  <th className="py-2 px-2 text-right">Due Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {priorityWorkOrders.length > 0 ? (
                  priorityWorkOrders.map((row) => (
                    <tr key={row.woNo} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2 px-2.5 font-mono font-bold text-blue-700 whitespace-nowrap">
                        <Link href={`/reports/tracking?search=${encodeURIComponent(row.woNo)}`} className="hover:underline">
                          {row.woNo}
                        </Link>
                      </td>
                      <td className="py-2 px-2 font-medium text-slate-800 truncate max-w-[120px]">{row.customer}</td>
                      <td className="py-2 px-2 font-mono text-slate-600">{row.grade}</td>
                      <td className="py-2 px-2 font-mono text-slate-600 whitespace-nowrap">{row.size}</td>
                      <td className="py-2 px-2 font-medium text-slate-700 whitespace-nowrap">{row.stage}</td>
                      <td className="py-2 px-2 text-right font-mono font-bold text-slate-900">{row.wipMt}</td>
                      <td className="py-2 px-2 text-center whitespace-nowrap">
                        <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold border ${row.statusColor}`}>
                          {row.status}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-right font-mono text-slate-600 whitespace-nowrap">{row.dueDate}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-xs text-slate-500 font-medium">
                      No delayed or pending orders. All work orders are on schedule.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Recent Production Logs (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200/90 shadow-2xs p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">Recent Production</h3>
              <p className="text-xs text-slate-500 mt-0.5">Real-time shop-floor completions</p>
            </div>
            <Link
              href="/reports/production"
              className="text-xs font-bold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
            >
              View All <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-tight bg-slate-50/70">
                  <th className="py-2 px-2.5">Time</th>
                  <th className="py-2 px-2">Stage</th>
                  <th className="py-2 px-2">WO No</th>
                  <th className="py-2 px-2 text-right">Qty (MT)</th>
                  <th className="py-2 px-2 text-right">Rej (MT)</th>
                  <th className="py-2 px-2">Operator</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentProduction.length > 0 ? (
                  recentProduction.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2 px-2.5 font-mono text-slate-500 whitespace-nowrap">{row.time}</td>
                      <td className="py-2 px-2 font-medium text-slate-800 whitespace-nowrap">{row.stage}</td>
                      <td className="py-2 px-2 font-mono font-bold text-slate-900 whitespace-nowrap">{row.woNo}</td>
                      <td className="py-2 px-2 text-right font-mono font-bold text-emerald-600">{row.qtyMt}</td>
                      <td className="py-2 px-2 text-right font-mono font-bold text-rose-600">{row.rejMt}</td>
                      <td className="py-2 px-2 text-slate-600 font-medium whitespace-nowrap">{row.operator}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-xs text-slate-500 font-medium">
                      No production entries logged yet today.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
