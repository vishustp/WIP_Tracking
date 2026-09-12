'use client';

import { X, Crown, Package, Lock, RefreshCw } from 'lucide-react';
import { Row, StageCode, STAGES } from '@/types';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import ProductionQueueRow from '@/components/production/ProductionQueueRow';
import ProductionWipBreakdown from '@/components/production/ProductionWipBreakdown';

export interface ProductionQueueTableProps {
  stage: StageCode;
  rows: Row[];
  filteredRows: Row[];
  woFilter: string;
  setWoFilter: (val: string) => void;
  expandedRows: Record<string, boolean>;
  onToggleRowExpansion: (key: string) => void;
  onUpdateRow: (
    key: string,
    field: keyof Pick<
      Row,
      'pcs' | 'mtr' | 'rejection_pcs' | 'rejection_mtr' | 'htc_ok_pcs' | 'htc_ok_mtr' | 'heat_lot_no' | 'remarks'
    >,
    value: string
  ) => void;
  onOpenBundling: (row: Row) => void;
  isAllowed: boolean;
  roleTitle?: string;
  isAuditor: boolean;
  saving: boolean;
  queueLoading: boolean;
  onSave: () => void;
}

export function ProductionQueueTable({
  stage,
  rows,
  filteredRows,
  woFilter,
  setWoFilter,
  expandedRows,
  onToggleRowExpansion,
  onUpdateRow,
  onOpenBundling,
  isAllowed,
  roleTitle,
  isAuditor,
  saving,
  queueLoading,
  onSave,
}: ProductionQueueTableProps) {
  const stageLabel = STAGES.find((x) => x.code === stage)?.label || stage;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
      {/* Table Header Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-white px-5 py-3.5">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold text-slate-900 tracking-tight">
            {stageLabel} Queue
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Quick Filter Search Input */}
          <div className="relative">
            <input
              type="text"
              value={woFilter}
              onChange={(e) => setWoFilter(e.target.value)}
              placeholder="Quick filter..."
              className="h-8 w-48 sm:w-60 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-800 placeholder-slate-400 shadow-2xs focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
            />
            {woFilter && (
              <button
                type="button"
                onClick={() => setWoFilter('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-0.5"
                title="Clear filter"
                aria-label="Clear quick filter"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {(stage === 'DRAW' || stage === 'HOLLOW_HEAT_TREATMENT' || stage === 'HEAT_TREATMENT') && (
            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 border border-indigo-200/80 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
              <Crown size={12} /> Master Consolidated
            </span>
          )}
          {stage === 'FINISHING' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 border border-teal-200/80 px-2.5 py-0.5 text-xs font-semibold text-teal-700">
              <Package size={12} /> Finishing & Bundling
            </span>
          )}
        </div>
      </div>

      {/* Queue Loading / Empty States */}
      {queueLoading ? (
        <div className="p-8 space-y-3">
          <div className="flex items-center justify-center gap-2 text-xs font-medium text-slate-500 mb-4">
            <RefreshCw size={14} className="animate-spin text-brand-600" />
            <span>Loading work order production queue...</span>
          </div>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="p-8">
          <EmptyState
            title={`No Orders Available in ${stageLabel} Queue`}
            description={
              stage === 'ROLLING'
                ? 'No officially issued rolling plans are currently awaiting production.'
                : `No work order WIP balance is currently ready for ${stageLabel}. Record production in preceding process stages first.`
            }
          />
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="p-8">
          <EmptyState
            title={`No orders match "${woFilter}"`}
            description={`Try modifying your filter keyword to find work orders in ${stageLabel} queue.`}
            actionLabel="Clear Filter"
            onAction={() => setWoFilter('')}
          />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-700 font-semibold">
              <tr>
                <th className="py-2.5 px-3 sm:px-4 text-left font-bold text-slate-700">Order Information</th>
                <th className="py-2.5 px-2.5 text-center font-bold text-slate-700">Route</th>
                <th className="py-2.5 px-3 sm:px-4 text-left font-bold text-slate-700">Balance</th>
                <th className="py-2.5 px-3 sm:px-4 text-center font-bold text-slate-800 bg-[#e0f2fe] border-x border-sky-100">
                  Production*
                </th>
                <th className="py-2.5 px-3 sm:px-4 text-center font-bold text-slate-800 bg-[#ffe4e6] border-r border-rose-100">
                  Rejection
                </th>
                {stage === 'ROLLING' && (
                  <th className="py-2.5 px-3 sm:px-4 text-center font-bold text-slate-800 bg-[#d1fae5] border-r border-emerald-100">
                    HTC OK
                  </th>
                )}
                {(stage === 'HEAT_TREATMENT' || stage === 'HOLLOW_HEAT_TREATMENT') && (
                  <th className="py-2.5 px-3 text-left font-bold text-slate-700">Heat Lot No.</th>
                )}
                <th className="py-2.5 px-3 text-center font-bold text-slate-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.map((r) => (
                <ProductionQueueRow
                  key={`${r.work_order_id}|${r.route_id}`}
                  row={r}
                  stage={stage}
                  isAllowed={isAllowed}
                  onUpdateRow={onUpdateRow}
                  onToggleExpand={onToggleRowExpansion}
                  onOpenBundling={onOpenBundling}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Expandable Work Center WIP Breakdown Pipeline for expanded rows */}
      <ProductionWipBreakdown
        rows={rows}
        expandedRows={expandedRows}
        stage={stage}
        onToggleRow={onToggleRowExpansion}
      />

      {/* Batch Save Action Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/80 bg-slate-50/70 p-3 sm:p-4">
        <div className="text-xs sm:text-sm text-slate-600">
          {(!isAllowed || isAuditor) && (
            <span className="inline-flex items-center gap-1.5 text-amber-800 font-medium bg-amber-50 border border-amber-200/80 rounded-lg px-2.5 py-1.5 text-xs">
              <Lock size={12} />
              Entry disabled: Active role ({roleTitle}) does not have write permissions for {stageLabel}.
            </span>
          )}
        </div>

        <Button
          type="button"
          variant="primary"
          size="md"
          disabled={saving || queueLoading || isAuditor || !isAllowed}
          onClick={onSave}
          className="bg-brand-800 hover:bg-brand-900 px-6 font-bold"
        >
          {saving ? (
            <>
              <RefreshCw size={15} className="animate-spin" />
              <span>Saving Entries...</span>
            </>
          ) : (
            <span>Save Production Entries</span>
          )}
        </Button>
      </div>
    </div>
  );
}

export default ProductionQueueTable;
