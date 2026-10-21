'use client';

import Link from 'next/link';
import { RefreshCw, FileSpreadsheet, AlertTriangle, CalendarDays, Factory } from 'lucide-react';
import { StageCode, PRODUCTION_ENTRY_STAGES } from '@/types';
import { Button } from '@/components/ui/button';

export interface ProductionToolbarProps {
  stage: StageCode;
  setStage: (stage: StageCode) => void;
  date: string;
  setDate: (date: string) => void;
  isAllowed: boolean;
  ordersCount: number;
  loading: boolean;
  onRefresh: () => void;
  allExpanded: boolean;
  onToggleAllRows: () => void;
}

export function ProductionToolbar({
  stage,
  setStage,
  date,
  setDate,
  isAllowed,
  ordersCount,
  loading,
  onRefresh,
  allExpanded,
  onToggleAllRows,
}: ProductionToolbarProps) {
  return (
    <div className="space-y-3">
      {/* Breadcrumb & Stage Selector */}
      <div className="space-y-1">
        <div className="text-xs text-slate-500 font-medium">
          <span>Production Management</span>
          <span className="mx-1.5 text-slate-400">&gt;</span>
          <span>Shop Floor Tracking</span>
          <span className="mx-1.5 text-slate-400">&gt;</span>
          <span className="font-bold text-slate-700">Work Center Execution</span>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-1">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-main,#0f172a)]">
            Production Entry & WIP Tracking
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-lg border border-[var(--border-subtle,#cbd5e1)] bg-[var(--bg-surface,#ffffff)] shadow-2xs">
              <select
                value={stage}
                onChange={(e) => setStage(e.target.value as StageCode)}
                aria-label="Select Work Center Stage"
                className="h-9 rounded-lg border-0 bg-transparent px-3 text-xs sm:text-sm font-semibold text-[var(--text-main,#1e293b)] focus:ring-0 cursor-pointer"
              >
                {PRODUCTION_ENTRY_STAGES.map((s) => (
                  <option key={s.code} value={s.code} className="bg-[var(--bg-surface,#ffffff)] text-[var(--text-main,#1e293b)]">
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <Link
              href="/excel-import"
              className="inline-flex items-center gap-1.5 h-9 rounded-lg border border-[var(--border-subtle,#cbd5e1)] bg-[var(--bg-surface,#ffffff)] px-3 text-xs font-semibold text-[var(--text-main,#334155)] shadow-2xs hover:bg-[var(--bg-surface-subtle,#f8fafc)] transition active:scale-[0.97]"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Excel Import</span>
            </Link>

            <Link
              href="/reports/daily-plan"
              className="inline-flex items-center gap-1.5 h-9 rounded-lg border border-blue-300 dark:border-blue-800 bg-blue-50/80 dark:bg-blue-950/40 px-3 text-xs font-semibold text-blue-800 dark:text-blue-200 shadow-2xs hover:bg-blue-100 dark:hover:bg-blue-900/40 transition active:scale-[0.97]"
              title="View Daily Shift Planning Targets & Compliance"
            >
              <CalendarDays className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
              <span>Daily Plan Report</span>
            </Link>

            <Link
              href="/reports/production"
              className="inline-flex items-center gap-1.5 h-9 rounded-lg border border-purple-300 dark:border-purple-800 bg-purple-50/80 dark:bg-purple-950/40 px-3 text-xs font-semibold text-purple-800 dark:text-purple-200 shadow-2xs hover:bg-purple-100 dark:hover:bg-purple-900/40 transition active:scale-[0.97]"
              title="Work Center Shift Production Report"
            >
              <Factory className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
              <span>Production Report</span>
            </Link>

            <Link
              href="/rejections"
              className="inline-flex items-center gap-1.5 h-9 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/40 px-3 text-xs font-semibold text-amber-800 dark:text-amber-200 shadow-2xs hover:bg-amber-100 dark:hover:bg-amber-900/40 transition active:scale-[0.97]"
              title="Second & Salvage Declarations"
            >
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
              <span>Second Decl.</span>
            </Link>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={loading}
              className="h-9 active:scale-[0.97] transition-all duration-150 select-none cursor-pointer"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin text-brand-600' : 'text-[var(--text-muted,#64748b)]'} />
              <span>Refresh</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Shift Process Date & Queue Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--border-subtle,#e2e8f0)] bg-[var(--bg-surface,#ffffff)] p-4 shadow-2xs">
        <div className="flex flex-wrap items-center gap-6 sm:gap-8">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted,#64748b)] mb-1">
              Shift Process Date
            </label>
            <input
              type="date"
              value={date}
              disabled={!isAllowed}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-lg border border-[var(--border-subtle,#cbd5e1)] bg-[var(--bg-surface,#ffffff)] px-3 py-1.5 text-xs sm:text-sm font-medium text-[var(--text-main,#0f172a)] shadow-2xs focus:border-brand-600 focus:ring-1 focus:ring-brand-600 disabled:bg-[var(--bg-surface-subtle,#f1f5f9)] disabled:text-[var(--text-muted,#94a3b8)] disabled:cursor-not-allowed"
            />
          </div>
          <div className="border-l border-[var(--border-subtle,#e2e8f0)] pl-6 sm:pl-8">
            <span className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted,#64748b)] mb-1">
              Orders in Queue
            </span>
            <span className="text-xs sm:text-sm font-bold text-brand-700 dark:text-brand-400">
              {ordersCount} Records
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onToggleAllRows}
            className="text-xs active:scale-[0.97] transition-all duration-150 select-none cursor-pointer font-semibold"
          >
            {allExpanded ? 'Collapse WIP Flows' : 'Expand WIP Flows'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default ProductionToolbar;
