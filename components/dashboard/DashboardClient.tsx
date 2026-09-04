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
  Legend,
  Cell,
} from 'recharts';
import {
  AlertTriangle,
  Clock,
  CheckCircle2,
  TrendingUp,
  Layers,
  ArrowRight,
  Sparkles,
  Calendar,
} from 'lucide-react';

type KPI = {
  active_work_orders: number;
  pending_planning: number;
  scheduled_orders: number;
  in_progress_orders: number;
  completed_today: number;
  total_wip: number;
  rejection_qty: number;
  delayed_orders: number;
};

type WIPRow = {
  work_order_no: string;
  route_code: string;
  stage_name: string;
  current_wip: number;
  sequence_no: number;
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
  target_date?: string | null;
  status?: string;
};

interface Props {
  kpi: KPI | null;
  wip: WIPRow[];
  pending: PendingRow[];
}

export default function DashboardClient({ kpi, wip, pending }: Props) {
  const [selectedRoute, setSelectedRoute] = useState<string>('ALL');

  // Compute SLA status for a given target date
  const getSLAStatus = (targetDate?: string | null) => {
    if (!targetDate) return { label: 'No Target', color: 'bg-slate-100 text-slate-600 border-slate-200' };
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const target = new Date(targetDate);
    const diffDays = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return {
        label: `Overdue by ${Math.abs(diffDays)}d`,
        color: 'bg-red-50 text-red-700 border-red-200 font-medium',
        isDelayed: true,
      };
    }
    if (diffDays <= 7) {
      return {
        label: `Due in ${diffDays}d`,
        color: 'bg-amber-50 text-amber-800 border-amber-200 font-medium',
        isUrgent: true,
      };
    }
    return {
      label: `On Track (${diffDays}d)`,
      color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    };
  };

  // Group WIP by Stage for Bottleneck Chart
  const stageDistribution = useMemo(() => {
    const stageMap: Record<string, { stage: string; wip: number; orderCount: number }> = {};
    const filteredWip = selectedRoute === 'ALL' ? wip : wip.filter(w => w.route_code === selectedRoute);

    filteredWip.forEach(item => {
      if (!stageMap[item.stage_name]) {
        stageMap[item.stage_name] = { stage: item.stage_name, wip: 0, orderCount: 0 };
      }
      stageMap[item.stage_name].wip += Number(item.current_wip || 0);
      stageMap[item.stage_name].orderCount += 1;
    });

    return Object.values(stageMap).sort((a, b) => b.wip - a.wip);
  }, [wip, selectedRoute]);

  const uniqueRoutes = useMemo(() => {
    const routes = Array.from(new Set(wip.map(w => w.route_code).filter(Boolean)));
    return ['ALL', ...routes];
  }, [wip]);

  const cards = [
    { label: 'Active Work Orders', value: kpi?.active_work_orders ?? 0, icon: Layers, color: 'text-slate-900', bg: 'bg-slate-50' },
    { label: 'Pending Planning', value: kpi?.pending_planning ?? 0, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Scheduled', value: kpi?.scheduled_orders ?? 0, icon: Calendar, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'In Progress', value: kpi?.in_progress_orders ?? 0, icon: TrendingUp, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { label: 'Completed Today', value: kpi?.completed_today ?? 0, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Total WIP (Mtr)', value: kpi?.total_wip ?? 0, icon: Layers, color: 'text-cyan-700', bg: 'bg-cyan-50' },
    { label: 'Rejection Scrap (Mtr)', value: kpi?.rejection_qty ?? 0, icon: AlertTriangle, color: 'text-rose-600', bg: 'bg-rose-50' },
    { label: 'Delayed Orders', value: kpi?.delayed_orders ?? 0, icon: AlertTriangle, color: 'text-red-700', bg: 'bg-red-50' },
  ];

  return (
    <div className="space-y-5">
      {/* Top Header */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">Plant Operations Dashboard</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/work-orders"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition cursor-pointer"
          >
            Work Orders
          </Link>
          <Link
            href="/production"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition cursor-pointer"
          >
            Production Entry
          </Link>
          <Link
            href="/rolling-plans"
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:from-blue-700 hover:to-indigo-700 transition cursor-pointer"
          >
            Issue Rolling Plan
          </Link>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 lg:grid-cols-8">
        {cards.map(c => {
          const Icon = c.icon;
          return (
            <Card key={c.label} className="border-slate-200/80 shadow-xs hover:border-slate-300 transition-colors">
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-500 truncate">{c.label}</span>
                  <div className={`p-1 rounded ${c.bg}`}>
                    <Icon className={`h-3 w-3 ${c.color}`} />
                  </div>
                </div>
                <div className={`mt-1.5 text-xl font-bold font-mono tracking-tight ${c.color}`}>{c.value}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Stage WIP Bottleneck Flowchart */}
      <Card className="border-slate-200/80 shadow-xs">
        <CardHeader className="p-3.5 border-b border-slate-100 flex flex-row items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Stage WIP Distribution</h2>
          </div>
          {uniqueRoutes.length > 1 && (
            <div className="flex items-center gap-1.5 text-sm">
              <span className="text-slate-500 font-medium text-sm">Route:</span>
              <div className="flex rounded-md border border-slate-200 p-0.5 bg-slate-50">
                {uniqueRoutes.map(r => (
                  <button
                    key={r}
                    onClick={() => setSelectedRoute(r)}
                    className={`px-2.5 py-1 rounded text-sm font-medium transition-colors ${
                      selectedRoute === r ? 'bg-white shadow-xs text-slate-900 font-semibold' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          )}
        </CardHeader>
        <CardContent className="p-4">
          {stageDistribution.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-400">
              No WIP records found.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stageDistribution} margin={{ top: 10, right: 20, left: -10, bottom: 15 }}>
                    <XAxis dataKey="stage" tick={{ fontSize: 11 }} angle={-15} textAnchor="end" height={40} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(val: any) => [`${val} Mtrs`, 'WIP']}
                      labelFormatter={(label) => `Stage: ${label}`}
                      contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                    />
                    <Bar dataKey="wip" radius={[4, 4, 0, 0]} barSize={36}>
                      {stageDistribution.map((entry, idx) => (
                        <Cell
                          key={`cell-${idx}`}
                          fill={idx === 0 && entry.wip > 100 ? '#ef4444' : idx === 1 ? '#f59e0b' : '#3b82f6'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Stage Flow Indicator Chips */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2 border-t border-slate-100">
                {stageDistribution.map((s, idx) => (
                  <div key={s.stage} className="rounded-lg border border-slate-200/80 bg-slate-50/50 p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-700 truncate">{s.stage}</span>
                      {idx === 0 && s.wip > 0 && (
                        <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.2 text-[11px] font-bold text-rose-700">
                          Highest
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-baseline gap-1">
                      <span className="text-base font-bold font-mono text-slate-900">{s.wip}</span>
                      <span className="text-sm text-slate-500 font-mono">Mtr ({s.orderCount} WOs)</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tables: Route-aware WIP & Priority Pending Orders */}
      <div className="grid gap-5 xl:grid-cols-2">
        {/* Route Stage WIP Table */}
        <Card className="border-slate-200/80 shadow-xs">
          <CardHeader className="p-3.5 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">Current WIP Inventory</h2>
            <Link href="/reports/wip" className="text-sm font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1">
              View Report <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {wip.length === 0 ? (
              <p className="p-6 text-sm text-slate-500 text-center">No positive WIP currently available.</p>
            ) : (
              <div className="overflow-x-auto max-h-[380px]">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50/80 sticky top-0 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2.5 px-3 text-left font-semibold">WO No.</th>
                      <th className="py-2.5 px-3 text-left font-semibold">Route</th>
                      <th className="py-2.5 px-3 text-left font-semibold">Stage</th>
                      <th className="py-2.5 px-3 text-right font-semibold">WIP (Mtr)</th>
                      <th className="py-2.5 px-3 text-center font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {wip.map((x: any) => (
                      <tr key={`${x.work_order_no}-${x.route_code}-${x.stage_name}`} className="hover:bg-slate-50/50">
                        <td className="py-2 px-3 font-bold text-slate-900">{x.work_order_no}</td>
                        <td className="py-2 px-3">
                          <span className="inline-block rounded bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">
                            {x.route_code}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-700">{x.stage_name}</td>
                        <td className="py-2 px-3 text-right font-bold font-mono text-slate-900">{x.current_wip}</td>
                        <td className="py-2 px-3 text-center">
                          <Link
                            href="/production"
                            className="inline-flex rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                          >
                            Log Entry
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Priority Pending Orders with SLA Tracker */}
        <Card className="border-slate-200/80 shadow-xs">
          <CardHeader className="p-3.5 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">Priority Orders & Delivery SLA</h2>
            <Link href="/reports/pending-orders" className="text-sm font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1">
              View All <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="p-3">
            {pending.length === 0 ? (
              <p className="p-4 text-sm text-slate-500 text-center">No pending orders.</p>
            ) : (
              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                {pending.map((x: any) => {
                  const sla = getSLAStatus(x.target_date);
                  return (
                    <div
                      key={x.work_order_id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border border-slate-200/80 p-2.5 hover:border-slate-300 transition-colors bg-white text-sm"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-900">{x.work_order_no}</span>
                          <span className={`inline-flex rounded border px-2 py-0.2 text-xs ${sla.color}`}>
                            {sla.label}
                          </span>
                        </div>
                        <div className="text-sm text-slate-500">
                          {x.customer ?? 'Customer Unspecified'}
                          {x.grade ? ` · ${x.grade}` : ''}
                          {x.od && x.wt ? ` (${x.od} × ${x.wt} mm)` : ''}
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 pt-1.5 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                        <div className="text-right">
                          <div className="text-sm font-bold font-mono text-slate-900">{x.total_pending} Mtr Pending</div>
                          <div className="text-xs text-slate-400">
                            Target: {x.target_date || 'None'}
                          </div>
                        </div>
                        <Link
                          href={`/rolling-plans?wo=${x.work_order_id}`}
                          className="rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          Plan
                        </Link>
                      </div>
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
