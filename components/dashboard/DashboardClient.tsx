'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import Link from 'next/link';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from 'recharts';
import {
  AlertTriangle,
  Clock,
  CheckCircle2,
  TrendingUp,
  Layers,
  ArrowRight,
  Calendar,
  Search,
  Activity,
  Gauge,
  Factory,
  Scale,
  RefreshCw,
  SlidersHorizontal,
  ChevronRight,
} from 'lucide-react';
import { mtFromMtr } from '@/lib/productionUtils';

const formatNum = (v: unknown, decimals = 0) => {
  const num = Number(v);
  if (!Number.isFinite(num)) return '0';
  return num.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};

type KPI = {
  active_work_orders: number;
  pending_planning: number;
  scheduled_orders: number;
  in_progress_orders: number;
  completed_today: number;
  total_wip: number;
  total_wip_mtr?: number;
  total_wip_pcs?: number;
  total_wip_mt?: number;
  rejection_qty: number;
  delayed_orders: number;
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
  l1?: number | null;
  l2?: number | null;
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

type UnitMode = 'MTR' | 'PCS' | 'MT';
type SortMode = 'SEQUENCE' | 'BOTTLENECK';

export default function DashboardClient({ kpi, wip, pending }: Props) {
  const [selectedRoute, setSelectedRoute] = useState<string>('ALL');
  const [chartUnit, setChartUnit] = useState<UnitMode>('MTR');
  const [chartSort, setChartSort] = useState<SortMode>('SEQUENCE');
  const [wipSearch, setWipSearch] = useState<string>('');
  const [wipStageFilter, setWipStageFilter] = useState<string>('ALL');

  // Compute Total Plant WIP metrics
  const totalPlantWipMtr = useMemo(() => {
    return kpi?.total_wip_mtr ?? wip.reduce((acc, r) => acc + Number(r.current_wip || 0), 0);
  }, [kpi, wip]);

  const totalPlantWipPcs = useMemo(() => {
    return kpi?.total_wip_pcs ?? wip.reduce((acc, r) => acc + Number(r.current_wip_pcs || 0), 0);
  }, [kpi, wip]);

  const totalPlantWipMt = useMemo(() => {
    return kpi?.total_wip_mt ?? wip.reduce((acc, r) => {
      const mtr = Number(r.current_wip || 0);
      const od = Number(r.size_od || 0);
      const wt = Number(r.size_wt || 0);
      return acc + Number(r.current_wip_mt ?? (od > 0 && wt > 0 ? mtFromMtr(mtr, od, wt) : 0));
    }, 0);
  }, [kpi, wip]);

  // SLA Calculation for delivery deadlines
  const getSLAStatus = (targetDate?: string | null) => {
    if (!targetDate) {
      return {
        label: 'Open Schedule',
        color: 'bg-slate-100 text-slate-600 border-slate-200',
        isDelayed: false,
        isUrgent: false,
      };
    }
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const target = new Date(targetDate);
    const diffDays = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return {
        label: `Overdue by ${Math.abs(diffDays)}d`,
        color: 'bg-rose-50 text-rose-700 border-rose-200 font-bold',
        isDelayed: true,
        isUrgent: false,
      };
    }
    if (diffDays <= 7) {
      return {
        label: diffDays === 0 ? 'Due Today' : `Due in ${diffDays}d`,
        color: 'bg-amber-50 text-amber-800 border-amber-200 font-bold',
        isDelayed: false,
        isUrgent: true,
      };
    }
    return {
      label: `On Track (${diffDays}d)`,
      color: 'bg-emerald-50 text-emerald-700 border-emerald-200 font-medium',
      isDelayed: false,
      isUrgent: false,
    };
  };

  // Unique routes present in WIP data
  const uniqueRoutes = useMemo(() => {
    const routes = Array.from(new Set(wip.map((w) => w.route_code).filter(Boolean)));
    return ['ALL', ...routes];
  }, [wip]);

  // Unique stages for WIP table filtering
  const uniqueStages = useMemo(() => {
    const stages = Array.from(new Set(wip.map((w) => w.stage_name).filter(Boolean)));
    return ['ALL', ...stages];
  }, [wip]);

  // Aggregated Stage Distribution for the Bottleneck Chart
  const stageDistribution = useMemo(() => {
    const stageMap: Record<
      string,
      {
        stage: string;
        stageCode: string;
        sequenceNo: number;
        wipMtr: number;
        wipPcs: number;
        wipMt: number;
        orderCount: number;
      }
    > = {};

    const filteredWip = selectedRoute === 'ALL' ? wip : wip.filter((w) => w.route_code === selectedRoute);

    filteredWip.forEach((item) => {
      const key = item.stage_name;
      if (!stageMap[key]) {
        stageMap[key] = {
          stage: item.stage_name,
          stageCode: item.stage_code || '',
          sequenceNo: item.sequence_no || 99,
          wipMtr: 0,
          wipPcs: 0,
          wipMt: 0,
          orderCount: 0,
        };
      }
      const mtr = Number(item.current_wip || 0);
      const pcs = Number(item.current_wip_pcs || 0);
      const od = Number(item.size_od || 0);
      const wt = Number(item.size_wt || 0);
      const mt = Number(item.current_wip_mt ?? (od > 0 && wt > 0 ? mtFromMtr(mtr, od, wt) : 0));

      stageMap[key].wipMtr += mtr;
      stageMap[key].wipPcs += pcs;
      stageMap[key].wipMt += mt;
      stageMap[key].orderCount += 1;
    });

    const list = Object.values(stageMap).map((s) => ({
      ...s,
      value:
        chartUnit === 'PCS'
          ? Math.round(s.wipPcs)
          : chartUnit === 'MT'
          ? Number(s.wipMt.toFixed(2))
          : Math.round(s.wipMtr),
    }));

    if (chartSort === 'BOTTLENECK') {
      return list.sort((a, b) => b.value - a.value);
    }
    return list.sort((a, b) => a.sequenceNo - b.sequenceNo);
  }, [wip, selectedRoute, chartUnit, chartSort]);

  // Identify highest bottleneck stage
  const maxWipStage = useMemo(() => {
    if (stageDistribution.length === 0) return null;
    return [...stageDistribution].sort((a, b) => b.value - a.value)[0];
  }, [stageDistribution]);

  // Filtered WIP table rows
  const filteredWipTable = useMemo(() => {
    return wip.filter((item) => {
      if (wipStageFilter !== 'ALL' && item.stage_name !== wipStageFilter) return false;
      if (selectedRoute !== 'ALL' && item.route_code !== selectedRoute) return false;
      if (!wipSearch.trim()) return true;
      const q = wipSearch.toLowerCase();
      return (
        item.work_order_no?.toLowerCase().includes(q) ||
        item.customer_name?.toLowerCase().includes(q) ||
        item.stage_name?.toLowerCase().includes(q) ||
        item.route_code?.toLowerCase().includes(q) ||
        `${item.size_od}x${item.size_wt}`.includes(q)
      );
    });
  }, [wip, wipSearch, wipStageFilter, selectedRoute]);

  // Table totals for filtered rows
  const tableSummary = useMemo(() => {
    const totalPcs = filteredWipTable.reduce((acc, r) => acc + Number(r.current_wip_pcs || 0), 0);
    const totalMtr = filteredWipTable.reduce((acc, r) => acc + Number(r.current_wip || 0), 0);
    const totalMt = filteredWipTable.reduce((acc, r) => {
      const mtr = Number(r.current_wip || 0);
      const od = Number(r.size_od || 0);
      const wt = Number(r.size_wt || 0);
      return acc + Number(r.current_wip_mt ?? (od > 0 && wt > 0 ? mtFromMtr(mtr, od, wt) : 0));
    }, 0);
    return { totalPcs, totalMtr, totalMt };
  }, [filteredWipTable]);

  // Operational KPI Cards
  const kpiCards = [
    {
      label: 'Active Work Orders',
      value: kpi?.active_work_orders ?? 0,
      icon: Layers,
      color: 'text-slate-900',
      bg: 'bg-slate-100',
      subtext: `${kpi?.in_progress_orders ?? 0} In-Progress · ${kpi?.scheduled_orders ?? 0} Scheduled`,
    },
    {
      label: 'Pending Planning',
      value: kpi?.pending_planning ?? 0,
      icon: Clock,
      color: (kpi?.pending_planning ?? 0) > 0 ? 'text-amber-600' : 'text-slate-600',
      bg: (kpi?.pending_planning ?? 0) > 0 ? 'bg-amber-50' : 'bg-slate-50',
      subtext: (kpi?.pending_planning ?? 0) > 0 ? 'Action required in Planning' : 'All orders scheduled',
    },
    {
      label: 'Completed Today',
      value: kpi?.completed_today ?? 0,
      icon: CheckCircle2,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
      subtext: 'Finishing output batches logged',
    },
    {
      label: 'Rejection Scrap',
      value: `${formatNum(kpi?.rejection_qty ?? 0)} m`,
      icon: AlertTriangle,
      color: (kpi?.rejection_qty ?? 0) > 0 ? 'text-rose-600' : 'text-slate-500',
      bg: (kpi?.rejection_qty ?? 0) > 0 ? 'bg-rose-50' : 'bg-slate-50',
      subtext: 'Cumulative production scrap',
    },
    {
      label: 'SLA At Risk / Delayed',
      value: kpi?.delayed_orders ?? 0,
      icon: AlertTriangle,
      color: (kpi?.delayed_orders ?? 0) > 0 ? 'text-rose-700' : 'text-emerald-600',
      bg: (kpi?.delayed_orders ?? 0) > 0 ? 'bg-rose-100' : 'bg-emerald-50',
      subtext: (kpi?.delayed_orders ?? 0) > 0 ? 'Overdue target delivery dates' : 'All deliveries on schedule',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Header & Fast Action Toolbar */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">Plant Operations Dashboard</h1>
            <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800">
              Live WIP
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time physical inventory, stage bottleneck flow, and delivery SLA tracking.
          </p>
        </div>

        {/* Action Shortcuts */}
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/reports/tracking"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition"
          >
            <Activity className="h-3.5 w-3.5 text-blue-600" />
            WO Tracking Sheet
          </Link>
          <Link
            href="/reports/aging"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition"
          >
            <Clock className="h-3.5 w-3.5 text-amber-600" />
            WIP Aging
          </Link>
          <Link
            href="/reports/wip"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition"
          >
            <Gauge className="h-3.5 w-3.5 text-emerald-600" />
            Size-Wise WIP
          </Link>
          <Link
            href="/production"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition"
          >
            <Factory className="h-3.5 w-3.5 text-indigo-600" />
            Production Entry
          </Link>
          <Link
            href="/rolling-plans"
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:from-blue-700 hover:to-indigo-700 transition"
          >
            Issue Rolling Plan
          </Link>
        </div>
      </div>

      {/* KPI Section: Hero Plant WIP Card + Status Cards */}
      <div className="grid gap-4 lg:grid-cols-12">
        {/* HERO CARD: Total Plant Physical WIP */}
        <Card className="lg:col-span-5 border-blue-200 bg-gradient-to-br from-blue-50/70 via-white to-indigo-50/40 shadow-xs">
          <CardContent className="p-4 sm:p-5 flex flex-col justify-between h-full">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-blue-900 flex items-center gap-1.5">
                  <Gauge className="h-4 w-4 text-blue-600" />
                  Total Plant Physical WIP
                </span>
                <span className="text-[11px] font-semibold text-slate-500">
                  {wip.length} active stage lots
                </span>
              </div>

              {/* Primary Units Display: PCS & MT highlighted */}
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl sm:text-4xl font-black font-mono tracking-tight text-blue-950">
                  {formatNum(totalPlantWipMtr, 0)}
                </span>
                <span className="text-sm font-bold text-blue-800 font-mono">MTRS</span>
              </div>

              {/* Prominent Shop Floor Highlights: PCS and MT */}
              <div className="mt-3 flex flex-wrap items-center gap-2 pt-2 border-t border-blue-100">
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-md bg-indigo-100/90 text-indigo-950 font-black text-xs sm:text-sm border border-indigo-300">
                  <span>TOTAL:</span>
                  <span className="font-mono">{formatNum(totalPlantWipPcs, 0)}</span>
                  <span>PCS ★</span>
                </span>
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-md bg-emerald-100/90 text-emerald-950 font-black text-xs sm:text-sm border border-emerald-300">
                  <span>TOTAL:</span>
                  <span className="font-mono">{formatNum(totalPlantWipMt, 2)}</span>
                  <span>MT ★</span>
                </span>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
              <span>Plant Stock Bottleneck:</span>
              <span className="font-bold text-slate-900 font-mono">
                {maxWipStage ? `${maxWipStage.stage} (${formatNum(maxWipStage.wipMtr, 0)} m)` : 'None'}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Operational Status Cards */}
        <div className="lg:col-span-7 grid gap-3 grid-cols-2 sm:grid-cols-3">
          {kpiCards.map((c) => {
            const Icon = c.icon;
            return (
              <Card key={c.label} className="border-slate-200/80 shadow-2xs hover:border-slate-300 transition-colors">
                <CardContent className="p-3.5 flex flex-col justify-between h-full">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-600 truncate">{c.label}</span>
                    <div className={`p-1.5 rounded-md ${c.bg}`}>
                      <Icon className={`h-3.5 w-3.5 ${c.color}`} />
                    </div>
                  </div>
                  <div className="mt-2">
                    <div className={`text-2xl font-black font-mono tracking-tight ${c.color}`}>
                      {c.value}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400 truncate">{c.subtext}</div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Stage WIP Distribution & Bottleneck Analysis Chart */}
      <Card className="border-slate-200/80 shadow-xs">
        <CardHeader className="p-4 border-b border-slate-100 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-blue-600" />
              Stage WIP Bottleneck Distribution
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Physical material inventory breakdown across manufacturing workstations
            </p>
          </div>

          {/* Controls: Unit Toggle + Sort Mode + Route Filter */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Unit Toggle */}
            <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs font-semibold">
              <button
                onClick={() => setChartUnit('MTR')}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  chartUnit === 'MTR' ? 'bg-white shadow-2xs text-blue-700 font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                MTR
              </button>
              <button
                onClick={() => setChartUnit('PCS')}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  chartUnit === 'PCS' ? 'bg-indigo-600 shadow-2xs text-white font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                PCS ★
              </button>
              <button
                onClick={() => setChartUnit('MT')}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  chartUnit === 'MT' ? 'bg-emerald-600 shadow-2xs text-white font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                MT ★
              </button>
            </div>

            {/* Sort Toggle */}
            <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs font-semibold">
              <button
                onClick={() => setChartSort('SEQUENCE')}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  chartSort === 'SEQUENCE' ? 'bg-white shadow-2xs text-slate-900 font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Process sequence order (Rolling -> Finishing)"
              >
                Process Flow
              </button>
              <button
                onClick={() => setChartSort('BOTTLENECK')}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  chartSort === 'BOTTLENECK' ? 'bg-white shadow-2xs text-rose-700 font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Ranked by highest WIP volume"
              >
                Bottleneck
              </button>
            </div>

            {/* Route Filter */}
            {uniqueRoutes.length > 1 && (
              <div className="flex items-center gap-1 text-xs">
                <div className="flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
                  {uniqueRoutes.map((r) => (
                    <button
                      key={r}
                      onClick={() => setSelectedRoute(r)}
                      className={`px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                        selectedRoute === r ? 'bg-white shadow-2xs text-slate-900 font-bold' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-5">
          {stageDistribution.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">
              No positive physical WIP records found in the plant.
            </div>
          ) : (
            <div className="space-y-5">
              {/* Bar Chart */}
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stageDistribution} margin={{ top: 15, right: 20, left: 0, bottom: 25 }}>
                    <XAxis
                      dataKey="stage"
                      tick={{ fontSize: 11, fill: '#475569' }}
                      angle={-15}
                      textAnchor="end"
                      height={45}
                    />
                    <YAxis tick={{ fontSize: 11, fill: '#475569' }} />
                    <Tooltip
                      formatter={(val: any, name: any, props: any) => {
                        const item = props.payload;
                        return [
                          <div key={item.stage} className="space-y-1 font-mono">
                            <div className="font-bold text-slate-900">
                              {chartUnit === 'PCS'
                                ? `${formatNum(item.wipPcs, 0)} PCS`
                                : chartUnit === 'MT'
                                ? `${formatNum(item.wipMt, 2)} MT`
                                : `${formatNum(item.wipMtr, 0)} MTR`}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              Length: {formatNum(item.wipMtr, 0)} m · Pieces: {formatNum(item.wipPcs, 0)} · Weight: {formatNum(item.wipMt, 2)} MT
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {item.orderCount} active work order lot(s)
                            </div>
                          </div>,
                          'Stage WIP',
                        ];
                      }}
                      labelFormatter={(label) => `Station: ${label}`}
                      contentStyle={{
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        backgroundColor: '#ffffff',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                        fontSize: '12px',
                      }}
                    />
                    <Bar dataKey="value" radius={[5, 5, 0, 0]} barSize={40}>
                      {stageDistribution.map((entry) => {
                        const isHighest = maxWipStage?.stage === entry.stage && entry.value > 0;
                        const fill = isHighest
                          ? '#ef4444' // Red bottleneck
                          : chartUnit === 'PCS'
                          ? '#4f46e5' // Indigo for PCS
                          : chartUnit === 'MT'
                          ? '#059669' // Emerald for MT
                          : '#2563eb'; // Blue for Mtr
                        return <Cell key={`cell-${entry.stage}`} fill={fill} />;
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Station Indicators: Detailed Chips with PCS, MT, MTR */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 pt-3 border-t border-slate-100">
                {stageDistribution.map((s) => {
                  const isHighest = maxWipStage?.stage === s.stage && s.value > 0;
                  return (
                    <div
                      key={s.stage}
                      className={`rounded-lg border p-3 transition-colors ${
                        isHighest ? 'border-rose-300 bg-rose-50/40' : 'border-slate-200/90 bg-slate-50/60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-bold text-slate-800 truncate">{s.stage}</span>
                        {isHighest && (
                          <span className="shrink-0 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-black text-rose-700">
                            Bottleneck
                          </span>
                        )}
                      </div>

                      {/* Primary Focus value based on active unit */}
                      <div className="mt-1.5 flex items-baseline gap-1">
                        <span className="text-lg font-black font-mono text-slate-950">
                          {chartUnit === 'PCS'
                            ? formatNum(s.wipPcs, 0)
                            : chartUnit === 'MT'
                            ? formatNum(s.wipMt, 2)
                            : formatNum(s.wipMtr, 0)}
                        </span>
                        <span className="text-xs font-bold text-slate-600 font-mono">
                          {chartUnit === 'PCS' ? 'PCS' : chartUnit === 'MT' ? 'MT' : 'Mtr'}
                        </span>
                      </div>

                      {/* Secondary metrics (all 3 units) */}
                      <div className="mt-1 text-[11px] text-slate-500 font-mono">
                        {chartUnit !== 'PCS' && <span>{formatNum(s.wipPcs, 0)} pcs · </span>}
                        {chartUnit !== 'MT' && <span>{formatNum(s.wipMt, 2)} MT · </span>}
                        {chartUnit !== 'MTR' && <span>{formatNum(s.wipMtr, 0)} m · </span>}
                        <span>{s.orderCount} WOs</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tables: Current WIP Inventory & Priority Delivery Orders */}
      <div className="grid gap-6 xl:grid-cols-12">
        {/* Table 1: Current Physical WIP Inventory (7 Cols) */}
        <Card className="xl:col-span-7 border-slate-200/80 shadow-xs">
          <CardHeader className="p-3.5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Factory className="h-4 w-4 text-blue-600" />
                Current WIP Inventory
              </h2>
              <p className="text-[11px] text-slate-500">Live shop floor inventory with primary PCS & MT</p>
            </div>

            <div className="flex items-center gap-2">
              <Link
                href="/reports/wip"
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                View Full Matrix <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>

          {/* Search & Filter Bar */}
          <div className="p-3 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row gap-2 items-center justify-between">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search WO, customer, size..."
                value={wipSearch}
                onChange={(e) => setWipSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1 text-xs rounded-md border border-slate-200 bg-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-[11px] font-medium text-slate-500">Station:</span>
              <select
                value={wipStageFilter}
                onChange={(e) => setWipStageFilter(e.target.value)}
                className="text-xs rounded-md border border-slate-200 bg-white px-2 py-1 text-slate-700 focus:outline-none"
              >
                {uniqueStages.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <CardContent className="p-0">
            {filteredWipTable.length === 0 ? (
              <p className="p-8 text-sm text-slate-400 text-center">No matching WIP records found.</p>
            ) : (
              <div className="overflow-x-auto max-h-[420px]">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-100/90 sticky top-0 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider">
                    <tr>
                      <th className="py-2.5 px-3 text-left whitespace-nowrap">WO No.</th>
                      <th className="py-2.5 px-3 text-left">Customer</th>
                      <th className="py-2.5 px-3 text-left whitespace-nowrap">Size (OD × WT)</th>
                      <th className="py-2.5 px-3 text-left whitespace-nowrap">Stage</th>

                      {/* Primary Focus Columns: Highlighted PCS and MT */}
                      <th className="py-2.5 px-3 text-right whitespace-nowrap font-black text-indigo-950 bg-indigo-100/90 border-l border-indigo-300">
                        WIP (PCS) ★
                      </th>
                      <th className="py-2.5 px-3 text-right whitespace-nowrap font-black text-emerald-950 bg-emerald-100/90 border-r border-emerald-300">
                        WIP (MT) ★
                      </th>

                      <th className="py-2.5 px-3 text-right whitespace-nowrap">WIP (Mtr)</th>
                      <th className="py-2.5 px-3 text-center whitespace-nowrap">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredWipTable.map((x) => {
                      const mtr = Number(x.current_wip || 0);
                      const pcs = Number(x.current_wip_pcs || 0);
                      const od = Number(x.size_od || 0);
                      const wt = Number(x.size_wt || 0);
                      const mt = Number(x.current_wip_mt ?? (od > 0 && wt > 0 ? mtFromMtr(mtr, od, wt) : 0));

                      return (
                        <tr key={`${x.work_order_no}-${x.route_code}-${x.stage_name}`} className="hover:bg-slate-50/70">
                          <td className="py-2.5 px-3 font-bold text-slate-900 whitespace-nowrap">
                            <Link
                              href={`/reports/tracking?search=${encodeURIComponent(x.work_order_no)}`}
                              className="text-blue-600 hover:underline"
                            >
                              {x.work_order_no}
                            </Link>
                          </td>
                          <td className="py-2.5 px-3 text-slate-700 max-w-[150px] truncate" title={x.customer_name ?? ''}>
                            {x.customer_name ?? '—'}
                          </td>
                          <td className="py-2.5 px-3 text-slate-800 font-mono whitespace-nowrap">
                            {x.size_od && x.size_wt ? `${formatNum(x.size_od)} × ${formatNum(x.size_wt)}` : '—'}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span className="inline-block rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-800">
                              {x.stage_name}
                            </span>
                          </td>

                          {/* Primary Focus Cell: PCS (Highlighted) */}
                          <td className="py-2.5 px-3 text-right font-mono bg-indigo-50/50 border-l border-indigo-200">
                            <span className="inline-block px-2 py-0.5 rounded font-black text-xs text-indigo-950 bg-indigo-100 border border-indigo-300">
                              {formatNum(pcs, 0)}
                            </span>
                          </td>

                          {/* Primary Focus Cell: MT (Highlighted) */}
                          <td className="py-2.5 px-3 text-right font-mono bg-emerald-50/50 border-r border-emerald-200">
                            <span className="inline-block px-2 py-0.5 rounded font-black text-xs text-emerald-950 bg-emerald-100 border border-emerald-300">
                              {formatNum(mt, 2)}
                            </span>
                          </td>

                          <td className="py-2.5 px-3 text-right font-bold font-mono text-slate-800 whitespace-nowrap">
                            {formatNum(mtr, 0)}
                          </td>

                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            <Link
                              href="/production"
                              className="inline-flex rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                            >
                              Log Entry
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Table Summary Footer */}
            <div className="border-t border-slate-200 bg-slate-50 px-4 py-2.5 text-xs flex flex-wrap items-center justify-between font-bold text-slate-800 gap-2">
              <div className="text-slate-600">
                Shown: <span className="font-mono text-slate-900">{filteredWipTable.length}</span> records
              </div>
              <div className="flex flex-wrap items-center gap-2.5 font-mono">
                <span className="inline-flex items-center px-2 py-0.5 rounded bg-indigo-100 text-indigo-950 font-black border border-indigo-300">
                  TOTAL: {formatNum(tableSummary.totalPcs, 0)} PCS
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded bg-emerald-100 text-emerald-950 font-black border border-emerald-300">
                  TOTAL: {formatNum(tableSummary.totalMt, 2)} MT
                </span>
                <span className="text-blue-700 font-bold">
                  {formatNum(tableSummary.totalMtr, 0)} MTR
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Table 2: Priority Orders & Delivery SLA (5 Cols) */}
        <Card className="xl:col-span-5 border-slate-200/80 shadow-xs">
          <CardHeader className="p-3.5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-indigo-600" />
                Priority Orders & Delivery SLA
              </h2>
              <p className="text-[11px] text-slate-500">Unfulfilled balances & dispatch deadlines</p>
            </div>
            <Link
              href="/reports/pending-orders"
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              View All <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>

          <CardContent className="p-3">
            {pending.length === 0 ? (
              <p className="p-8 text-sm text-slate-400 text-center">No pending orders found.</p>
            ) : (
              <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
                {pending.map((x) => {
                  const sla = getSLAStatus(x.target_date);
                  const ordered = Number(x.ordered_qty || 0);
                  const planned = Number(x.planned_qty || 0);
                  const produced = Number(x.produced_qty || 0);
                  const pendingMtr = Number(x.total_pending || 0);
                  const pendingMt =
                    x.od && x.wt ? mtFromMtr(pendingMtr, Number(x.od), Number(x.wt)) : 0;
                  const percentPlanned = ordered > 0 ? Math.min(100, Math.round((planned / ordered) * 100)) : 0;
                  const percentProduced = ordered > 0 ? Math.min(100, Math.round((produced / ordered) * 100)) : 0;

                  return (
                    <div
                      key={x.work_order_id}
                      className="rounded-lg border border-slate-200/90 p-3 hover:border-slate-300 transition-colors bg-white text-xs space-y-2"
                    >
                      {/* Top row: WO + SLA Badge */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-sm text-slate-900 font-mono">{x.work_order_no}</span>
                            <span className={`inline-flex rounded border px-2 py-0.2 text-[11px] ${sla.color}`}>
                              {sla.label}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {x.customer ?? 'Customer Unspecified'}
                            {x.grade ? ` · ${x.grade}` : ''}
                            {x.od && x.wt ? ` (${x.od} × ${x.wt} mm)` : ''}
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1 shrink-0">
                          <Link
                            href={`/rolling-plans?wo=${x.work_order_id}`}
                            className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            Plan
                          </Link>
                          <Link
                            href={`/reports/tracking?search=${encodeURIComponent(x.work_order_no)}`}
                            className="rounded border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100"
                          >
                            Track
                          </Link>
                        </div>
                      </div>

                      {/* Middle row: Quantities (Pending Mtr & MT) */}
                      <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[11px]">
                        <div>
                          <span className="text-slate-500">Target Date: </span>
                          <span className="font-semibold text-slate-700 font-mono">
                            {x.target_date || 'Open Schedule'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 font-mono">
                          <span className="font-bold text-slate-900">{formatNum(pendingMtr, 0)} Mtr Pending</span>
                          {pendingMt > 0 && (
                            <span className="inline-block px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-800 font-bold border border-emerald-200">
                              {formatNum(pendingMt, 2)} MT
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Bottom progress bar: Ordered vs Planned vs Produced */}
                      {ordered > 0 && (
                        <div className="space-y-1 pt-1">
                          <div className="flex justify-between text-[10px] text-slate-400">
                            <span>Produced: {formatNum(produced, 0)} m ({percentProduced}%)</span>
                            <span>Planned: {formatNum(planned, 0)} m ({percentPlanned}%)</span>
                            <span>Total: {formatNum(ordered, 0)} m</span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden flex">
                            <div
                              className="bg-emerald-500 h-full"
                              style={{ width: `${percentProduced}%` }}
                              title={`Produced: ${percentProduced}%`}
                            />
                            <div
                              className="bg-blue-400 h-full"
                              style={{ width: `${Math.max(0, percentPlanned - percentProduced)}%` }}
                              title={`Planned: ${percentPlanned}%`}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
