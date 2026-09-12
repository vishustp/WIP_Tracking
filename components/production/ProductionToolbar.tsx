'use client';

import { RefreshCw } from 'lucide-react';
import { StageCode, STAGES } from '@/types';
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
          <span>Supply Chain</span>
          <span className="mx-1.5 text-slate-400">&gt;</span>
          <span className="font-bold text-slate-700">Work Center Execution</span>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-1">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Production Entry & WIP Tracking
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-lg border border-slate-300 bg-white shadow-2xs">
              <select
                value={stage}
                onChange={(e) => setStage(e.target.value as StageCode)}
                className="h-9 rounded-lg border-0 bg-transparent px-3 text-xs sm:text-sm font-semibold text-slate-800 focus:ring-0 cursor-pointer"
              >
                {STAGES.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={loading}
              className="h-9"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin text-brand-600' : 'text-slate-500'} />
              <span>Refresh</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Shift Process Date & Queue Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
        <div className="flex flex-wrap items-center gap-6 sm:gap-8">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Shift Process Date
            </label>
            <input
              type="date"
              value={date}
              disabled={!isAllowed}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs sm:text-sm font-medium text-slate-800 shadow-2xs focus:border-brand-600 focus:ring-1 focus:ring-brand-600 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
            />
          </div>
          <div className="border-l border-slate-200 pl-6 sm:pl-8">
            <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Orders in Queue
            </span>
            <span className="text-xs sm:text-sm font-bold text-brand-700">
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
            className="text-xs"
          >
            {allExpanded ? 'Collapse WIP Flows' : 'Expand WIP Flows'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default ProductionToolbar;
