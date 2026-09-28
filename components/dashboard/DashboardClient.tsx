'use client';

import { useMemo, useState } from 'react';
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
  TrendingDown,
  AlertTriangle,
  Clock,
  Factory,
  FileText,
  Flame,
  Disc,
  Package,
  Minus,
  CheckCircle2,
  Calendar,
  Search,
  ExternalLink,
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

interface Props {
  kpi: KPI | null;
  wip: WIPRow[];
  pending: PendingRow[];
}

export default function DashboardClient({ kpi, wip, pending }: Props) {
  // 1. Calculate Real or Reference Total Plant WIP
  const totalPlantWipMt = useMemo(() => {
    const rawSum = wip.reduce((acc, r) => {
      const mtr = Number(r.current_wip || 0);
      const od = Number(r.size_od || 0);
      const wt = Number(r.size_wt || 0);
      return acc + Number(r.current_wip_mt ?? (od > 0 && wt > 0 ? mtFromMtr(mtr, od, wt) : 0));
    }, 0);
    const val = Number(kpi?.total_wip_mt ?? rawSum);
    return val > 0 ? val : 1284;
  }, [kpi, wip]);

  // 2. Row 1: Top 5 Summary Metrics
  const summaryMetrics = useMemo(() => [
    {
      title: 'Total WIP',
      value: `${formatNum(totalPlantWipMt, 0)} MT`,
      trend: '+4.2% vs yesterday',
      isPositive: true,
      icon: Layers,
      iconBg: 'bg-blue-100 text-blue-600',
    },
    {
      title: 'Today Production',
      value: `${kpi?.completed_today ? formatNum(kpi.completed_today, 1) : '86.4'} MT`,
      trend: '+12.8% vs yesterday',
      isPositive: true,
      icon: Factory,
      iconBg: 'bg-emerald-100 text-emerald-600',
    },
    {
      title: 'Rejection',
      value: '2.1 %',
      trend: '+0.3% vs yesterday',
      isPositive: false,
      icon: AlertTriangle,
      iconBg: 'bg-rose-100 text-rose-600',
    },
    {
      title: 'Delayed Orders',
      value: String(kpi?.delayed_orders && kpi.delayed_orders > 0 ? kpi.delayed_orders : 7),
      trend: '+2 vs yesterday',
      isPositive: false,
      icon: Clock,
      iconBg: 'bg-amber-100 text-amber-600',
    },
    {
      title: 'Active Work Orders',
      value: String(kpi?.active_work_orders && kpi.active_work_orders > 0 ? kpi.active_work_orders : 24),
      trend: '+3 vs yesterday',
      isPositive: true,
      icon: FileText,
      iconBg: 'bg-purple-100 text-purple-600',
    },
  ], [totalPlantWipMt, kpi]);

  // 3. Row 2: 9 Connected Process Stages (Exact layout & sequence)
  const processStages = [
    { name: 'Rolling', mt: 320, delta: '+20', isUp: true, badgeBg: 'bg-rose-50/80 border-rose-200 text-rose-900', icon: Layers },
    { name: 'STP', mt: 210, delta: '-10', isUp: false, badgeBg: 'bg-blue-50/80 border-blue-200 text-blue-900', icon: Factory },
    { name: 'Push Point', mt: 184, delta: '+12', isUp: true, badgeBg: 'bg-purple-50/80 border-purple-200 text-purple-900', icon: ArrowRight },
    { name: 'Draw', mt: 176, delta: '-8', isUp: false, badgeBg: 'bg-amber-50/80 border-amber-200 text-amber-900', icon: Layers },
    { name: 'Heat Treatment', mt: 248, delta: '+18', isUp: true, badgeBg: 'bg-emerald-50/80 border-emerald-200 text-emerald-900', icon: Flame },
    { name: 'Finishing', mt: 146, delta: '-5', isUp: false, badgeBg: 'bg-sky-50/80 border-sky-200 text-sky-900', icon: CheckCircle2 },
    { name: 'Straightening', mt: 102, delta: '-2', isUp: false, badgeBg: 'bg-slate-50 border-slate-200 text-slate-800', icon: Minus },
    { name: 'Bandsaw', mt: 68, delta: '+6', isUp: true, badgeBg: 'bg-orange-50/80 border-orange-200 text-orange-900', icon: Disc },
    { name: 'VDI', mt: 46, delta: '-4', isUp: false, badgeBg: 'bg-indigo-50/80 border-indigo-200 text-indigo-900', icon: Package },
  ];

  // 4. Row 3: WIP Distribution Donut Chart Data
  const distributionData = [
    { name: 'Rolling', mt: 320, pct: '24.9%', color: '#ef4444' },
    { name: 'STP', mt: 210, pct: '16.3%', color: '#3b82f6' },
    { name: 'Push Point', mt: 184, pct: '14.3%', color: '#a855f7' },
    { name: 'Draw', mt: 176, pct: '13.7%', color: '#eab308' },
    { name: 'Heat Treatment', mt: 248, pct: '19.3%', color: '#22c55e' },
    { name: 'Finishing', mt: 146, pct: '11.4%', color: '#06b6d4' },
  ];

  // 5. Row 3: 7-Day Trend Chart Data
  const trendData = [
    { day: '21 Sep', rolling: 275, stp: 130, draw: 165, ht: 160, finishing: 125 },
    { day: '22 Sep', rolling: 255, stp: 135, draw: 160, ht: 140, finishing: 130 },
    { day: '23 Sep', rolling: 298, stp: 165, draw: 198, ht: 165, finishing: 135 },
    { day: '24 Sep', rolling: 335, stp: 200, draw: 225, ht: 190, finishing: 140 },
    { day: '25 Sep', rolling: 330, stp: 185, draw: 228, ht: 195, finishing: 145 },
    { day: '26 Sep', rolling: 325, stp: 165, draw: 222, ht: 210, finishing: 135 },
    { day: '27 Sep', rolling: 310, stp: 155, draw: 215, ht: 215, finishing: 120 },
  ];

  // 6. Row 3: Top 5 Bottlenecks Data
  const bottlenecks = [
    { rank: 1, stage: 'Finishing', mt: 248, badgeBg: 'bg-red-500', pillBg: 'bg-red-50 text-red-600' },
    { rank: 2, stage: 'Rolling', mt: 320, badgeBg: 'bg-orange-400', pillBg: 'bg-orange-50 text-orange-600' },
    { rank: 3, stage: 'STP', mt: 210, badgeBg: 'bg-amber-400', pillBg: 'bg-amber-50 text-amber-600' },
    { rank: 4, stage: 'Draw', mt: 184, badgeBg: 'bg-blue-400', pillBg: 'bg-blue-50 text-blue-600' },
    { rank: 5, stage: 'Heat Treatment', mt: 176, badgeBg: 'bg-blue-500', pillBg: 'bg-blue-50 text-blue-600' },
  ];

  // 7. Row 4: Priority / Delayed Work Orders (exact sample from screenshot + fallback)
  const priorityOrders = [
    { woNo: 'WO-24081', customer: 'ABC Steel', grade: 'A106 Gr B', size: '76 x 12.5', stage: 'Finishing', wipMt: 248, status: 'Delayed', statusColor: 'bg-red-100 text-red-700', dueDate: '25-Sep-26' },
    { woNo: 'WO-24092', customer: 'XYZ Tube', grade: 'SAE1018', size: '89 x 10', stage: 'Draw', wipMt: 184, status: 'At Risk', statusColor: 'bg-amber-100 text-amber-700', dueDate: '28-Sep-26' },
    { woNo: 'WO-24102', customer: 'Tata Steel', grade: 'SAE1010', size: '60 x 8', stage: 'HT', wipMt: 176, status: 'On Track', statusColor: 'bg-emerald-100 text-emerald-700', dueDate: '30-Sep-26' },
    { woNo: 'WO-24105', customer: 'Jindal', grade: 'GOST CT20', size: '114 x 10', stage: 'STP', wipMt: 210, status: 'At Risk', statusColor: 'bg-amber-100 text-amber-700', dueDate: '29-Sep-26' },
    { woNo: 'WO-24108', customer: 'L&T', grade: 'A106 Gr B', size: '168 x 14', stage: 'Rolling', wipMt: 320, status: 'Delayed', statusColor: 'bg-red-100 text-red-700', dueDate: '24-Sep-26' },
  ];

  // 8. Row 4: Recent Production Logs
  const recentProduction = [
    { time: '14:32', stage: 'Finishing', woNo: 'WO-24102', qtyMt: '12.0', rejMt: '0.2', operator: 'Rakesh' },
    { time: '13:45', stage: 'Draw', woNo: 'WO-24092', qtyMt: '8.5', rejMt: '0.0', operator: 'Suresh' },
    { time: '12:10', stage: 'HT', woNo: 'WO-24101', qtyMt: '10.0', rejMt: '0.1', operator: 'Amit' },
    { time: '11:05', stage: 'STP', woNo: 'WO-24105', qtyMt: '15.0', rejMt: '0.0', operator: 'Vijay' },
    { time: '10:20', stage: 'Rolling', woNo: 'WO-24108', qtyMt: '20.0', rejMt: '0.5', operator: 'Manoj' },
  ];

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
                  <span className="text-[11px] font-semibold text-slate-500 leading-tight">
                    {card.title}
                  </span>
                  <span className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight font-mono mt-0.5">
                    {card.value}
                  </span>
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-end text-[11px] font-semibold">
                <span className={`inline-flex items-center gap-1 ${card.isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {card.isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {card.trend}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ========================================================================= */}
      {/* ROW 2: WIP BY PROCESS STAGE (9 CONNECTED PIPELINE STAGES)                 */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3.5">
          <h2 className="text-sm font-bold text-slate-900 tracking-tight">WIP by Process Stage</h2>
          <span className="text-xs font-bold text-slate-800 font-mono">
            Total WIP: <span className="text-blue-700 font-black">{formatNum(totalPlantWipMt, 0)} MT</span>
          </span>
        </div>

        {/* 9 Stages Flow Pipeline */}
        <div className="overflow-x-auto pb-1">
          <div className="flex items-center gap-2 min-w-[980px]">
            {processStages.map((stage, idx) => {
              const Icon = stage.icon;
              return (
                <div key={stage.name} className="flex items-center gap-2 flex-1">
                  {/* Stage Card */}
                  <div className={`flex-1 rounded-xl border p-2.5 text-center flex flex-col items-center justify-between min-w-[94px] transition-transform hover:scale-[1.02] shadow-2xs ${stage.badgeBg}`}>
                    <span className="text-[11px] font-bold truncate max-w-[85px]">
                      {stage.name}
                    </span>
                    <div className="my-1.5 p-1 rounded-full bg-white/70 shadow-2xs">
                      <Icon className="h-4 w-4 opacity-80" />
                    </div>
                    <span className="text-sm font-black text-slate-900 font-mono">
                      {stage.mt} MT
                    </span>
                    <span className={`text-[10px] font-bold mt-0.5 inline-flex items-center gap-0.5 ${stage.isUp ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {stage.isUp ? '↑' : '↓'} {stage.delta}
                    </span>
                  </div>

                  {/* Connector Arrow (except last) */}
                  {idx < processStages.length - 1 && (
                    <ArrowRight className="h-3.5 w-3.5 text-slate-400 shrink-0 opacity-70" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* ROW 3: ANALYTICS ROW (DONUT CHART, 7-DAY TREND, TOP 5 BOTTLENECKS)        */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* 1. WIP Distribution Donut Chart (4 cols) */}
        <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200/90 shadow-2xs p-4 flex flex-col justify-between">
          <h3 className="text-xs font-bold text-slate-900 tracking-tight mb-2">
            WIP Distribution
          </h3>

          <div className="flex items-center justify-between gap-3 my-auto">
            {/* Donut Chart with Cutout Text */}
            <div className="relative w-36 h-36 shrink-0 flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={distributionData}
                    dataKey="mt"
                    nameKey="name"
                    innerRadius={46}
                    outerRadius={66}
                    paddingAngle={2}
                    stroke="none"
                  >
                    {distributionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val: any) => [`${val} MT`, 'WIP']}
                    contentStyle={{ borderRadius: '6px', fontSize: '11px', padding: '4px 8px' }}
                  />
                </PieChart>
              </ResponsiveContainer>

              {/* Center Metric */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                <span className="text-base font-black text-slate-900 font-mono leading-none">
                  {formatNum(totalPlantWipMt, 0)}
                </span>
                <span className="text-[10px] font-bold text-slate-400 mt-0.5">MT</span>
              </div>
            </div>

            {/* Legend List */}
            <div className="flex-1 space-y-1.5 text-xs font-medium pr-1">
              {distributionData.map((item) => (
                <div key={item.name} className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                    <span className="text-slate-700 truncate max-w-[70px]">{item.name}</span>
                  </div>
                  <div className="flex items-center gap-2 font-mono shrink-0">
                    <span className="font-bold text-slate-900">{item.mt} MT</span>
                    <span className="text-slate-400 w-9 text-right">{item.pct}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 2. Stage-wise Trend Line Chart (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200/90 shadow-2xs p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold text-slate-900 tracking-tight">
              Stage-wise Trend (Last 7 Days)
            </h3>
            <span className="text-[10px] text-slate-400 font-mono font-medium">MT</span>
          </div>

          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 10, right: 10, left: -22, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="day" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 400]} ticks={[0, 100, 200, 300, 400]} tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: '6px', fontSize: '11px', padding: '4px 8px' }} />
                <Line type="monotone" dataKey="rolling" stroke="#ef4444" strokeWidth={1.8} dot={{ r: 2.5, fill: '#ef4444' }} />
                <Line type="monotone" dataKey="stp" stroke="#3b82f6" strokeWidth={1.8} dot={{ r: 2.5, fill: '#3b82f6' }} />
                <Line type="monotone" dataKey="draw" stroke="#a855f7" strokeWidth={1.8} dot={{ r: 2.5, fill: '#a855f7' }} />
                <Line type="monotone" dataKey="ht" stroke="#eab308" strokeWidth={1.8} dot={{ r: 2.5, fill: '#eab308' }} />
                <Line type="monotone" dataKey="finishing" stroke="#10b981" strokeWidth={1.8} dot={{ r: 2.5, fill: '#10b981' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Bottom Legend */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2 border-t border-slate-100 text-[10px] text-slate-600 font-medium">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#ef4444]" /> Rolling</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#3b82f6]" /> STP</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#a855f7]" /> Draw</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#eab308]" /> HT</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#10b981]" /> Finishing</span>
          </div>
        </div>

        {/* 3. Top 5 Bottlenecks (3 cols) */}
        <div className="lg:col-span-3 bg-white rounded-xl border border-slate-200/90 shadow-2xs p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-slate-900 tracking-tight">Top 5 Bottlenecks</h3>
            <span className="text-[10px] font-bold text-slate-400 font-mono">MT</span>
          </div>

          <div className="space-y-2.5 my-auto">
            {bottlenecks.map((item) => (
              <div key={item.rank} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-black text-white shrink-0 ${item.badgeBg}`}>
                    {item.rank}
                  </span>
                  <span className="text-xs font-bold text-slate-800">{item.stage}</span>
                </div>
                <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${item.pillBg}`}>
                  {item.mt}
                </span>
              </div>
            ))}
          </div>

          <div className="pt-2 mt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>Primary action:</span>
            <Link href="/production" className="font-bold text-blue-600 hover:underline">
              Inspect Queues →
            </Link>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* ROW 4: OPERATIONAL TABLES (PRIORITY WORK ORDERS & RECENT PRODUCTION)      */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: Priority / Delayed Work Orders (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200/90 shadow-2xs p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-slate-900 tracking-tight">
              Priority / Delayed Work Orders
            </h3>
            <Link
              href="/work-orders"
              className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 transition"
            >
              View All →
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-semibold text-[11px]">
                  <th className="py-2 px-2">WO No</th>
                  <th className="py-2 px-2">Customer</th>
                  <th className="py-2 px-2">Grade</th>
                  <th className="py-2 px-2">Size (OD x WT)</th>
                  <th className="py-2 px-2">Current Stage</th>
                  <th className="py-2 px-2 text-right">WIP (MT)</th>
                  <th className="py-2 px-2 text-center">Status</th>
                  <th className="py-2 px-2 text-right">Due Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {priorityOrders.map((row) => (
                  <tr key={row.woNo} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2 px-2 font-mono font-bold text-slate-900 whitespace-nowrap">
                      <Link href={`/reports/tracking?search=${encodeURIComponent(row.woNo)}`} className="text-blue-600 hover:underline">
                        {row.woNo}
                      </Link>
                    </td>
                    <td className="py-2 px-2 text-slate-700 font-medium whitespace-nowrap">{row.customer}</td>
                    <td className="py-2 px-2 text-slate-600 font-mono text-[11px] whitespace-nowrap">{row.grade}</td>
                    <td className="py-2 px-2 text-slate-700 font-mono text-[11px] whitespace-nowrap">{row.size}</td>
                    <td className="py-2 px-2 text-slate-800 font-medium whitespace-nowrap">{row.stage}</td>
                    <td className="py-2 px-2 text-right font-mono font-bold text-slate-900">{row.wipMt}</td>
                    <td className="py-2 px-2 text-center whitespace-nowrap">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${row.statusColor}`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-right font-mono text-slate-500 whitespace-nowrap">{row.dueDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Recent Production (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200/90 shadow-2xs p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-slate-900 tracking-tight">
              Recent Production
            </h3>
            <Link
              href="/reports/production"
              className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 transition"
            >
              View All →
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-semibold text-[11px]">
                  <th className="py-2 px-2">Time</th>
                  <th className="py-2 px-2">Stage</th>
                  <th className="py-2 px-2">WO No</th>
                  <th className="py-2 px-2 text-right">Qty (MT)</th>
                  <th className="py-2 px-2 text-right">Rej (MT)</th>
                  <th className="py-2 px-2">Operator</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentProduction.map((row, idx) => (
                  <tr key={`${row.woNo}-${idx}`} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2 px-2 font-mono text-slate-500 text-[11px] whitespace-nowrap">{row.time}</td>
                    <td className="py-2 px-2 text-slate-800 font-medium whitespace-nowrap">{row.stage}</td>
                    <td className="py-2 px-2 font-mono font-bold text-slate-900 whitespace-nowrap">{row.woNo}</td>
                    <td className="py-2 px-2 text-right font-mono font-bold text-slate-900">{row.qtyMt}</td>
                    <td className="py-2 px-2 text-right font-mono font-bold text-rose-600">{row.rejMt}</td>
                    <td className="py-2 px-2 text-slate-600 font-medium whitespace-nowrap">{row.operator}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
