'use client';

import { Package, Crown } from 'lucide-react';
import { Row, StageCode } from '@/types';
import { calc, fmt, n, mtFromMtr } from '@/lib/productionUtils';

export interface ProductionQueueRowProps {
  row: Row;
  stage: StageCode;
  isAllowed: boolean;
  onUpdateRow: (
    key: string,
    field: keyof Pick<
      Row,
      'pcs' | 'mtr' | 'rejection_pcs' | 'rejection_mtr' | 'htc_ok_pcs' | 'htc_ok_mtr' | 'heat_lot_no' | 'remarks'
    >,
    value: string
  ) => void;
  onToggleExpand: (key: string) => void;
  onOpenBundling?: (row: Row) => void;
}

export function ProductionQueueRow({
  row,
  stage,
  isAllowed,
  onUpdateRow,
  onToggleExpand,
  onOpenBundling,
}: ProductionQueueRowProps) {
  const key = `${row.work_order_id}|${row.route_id}`;
  const d = calc({ ...row, stage_code: stage });
  const isRollingStage = stage === 'ROLLING';
  const stageOd = isRollingStage && row.mh_od ? Number(row.mh_od) : Number(row.od || 0);
  const stageWt = isRollingStage && row.mh_wt ? Number(row.mh_wt) : Number(row.wl || 0);

  const availMtr = n(row.balance_to_make_mtr);
  const effAvg = d.avg > 0 ? d.avg : n(row.avg_length) || 6;
  const availPcs =
    isRollingStage && effAvg > 0
      ? Math.round(availMtr / effAvg)
      : n(row.balance_to_make_pcs) > 0
      ? Math.round(n(row.balance_to_make_pcs))
      : effAvg > 0
      ? Math.round(availMtr / effAvg)
      : 0;

  return (
    <tr className="hover:bg-slate-50/60 transition-colors">
      {/* Order Information */}
      <td className="py-2.5 px-3 sm:px-4 align-middle">
        <div className="font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
          <span className="text-xs sm:text-sm font-extrabold">{row.work_order_no}</span>
          {isRollingStage && (row.master_plan_no || row.plan_no) && (
            <span className="inline-flex items-center gap-0.5 rounded bg-sky-100 text-sky-800 px-1.5 py-0.5 text-[10px] font-bold uppercase">
              PLAN: {row.master_plan_no || row.plan_no}
              {Number(row.revision_no || 0) > 0 ? ` (R${String(row.revision_no)})` : ''}
            </span>
          )}
          {isRollingStage && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.2 text-[9px] font-bold uppercase">
              ISSUED
            </span>
          )}
          {row.is_master && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-indigo-100 text-indigo-800 px-2 py-0.2 text-[9px] font-bold uppercase">
              <Crown size={10} /> MASTER
            </span>
          )}
        </div>

        <div className="text-xs text-slate-600 font-medium mt-0.5 truncate max-w-[220px]">
          {row.customer_name || '—'}
        </div>
        <div className="text-[11px] text-slate-400 font-mono mt-0.5">
          {row.od ? `${row.od} × ${row.wl ?? '—'} mm` : '—'} | Avg: {fmt(d.avg, 'm')}
        </div>
      </td>

      {/* Route */}
      <td className="py-2.5 px-2.5 align-middle text-center">
        <span className="inline-flex rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-bold font-mono text-slate-700">
          {row.route_code}
        </span>
      </td>

      {/* Balance */}
      <td className="py-2.5 px-3 sm:px-4 align-middle">
        <div className="font-extrabold text-emerald-700 font-mono text-xs">
          {fmt(availPcs)} PCS / {fmt(availMtr, ' MTR')}
        </div>
        <div className="text-[11px] text-slate-400 mt-0.5">
          {isRollingStage
            ? `Plan: ${fmt(row.planned_pcs || row.campaign_total_pcs || 0)} PCS`
            : `Avail: ${fmt(availPcs)} PCS`}
        </div>
      </td>

      {/* Production Inputs (PCS & MTR) */}
      <td className="py-2.5 px-3 sm:px-4 align-middle bg-[#f0f9ff]/60 border-x border-sky-100">
        <div className="flex items-center justify-center gap-1.5">
          <input
            type="number"
            min="0"
            step="any"
            placeholder="PCS"
            disabled={!isAllowed}
            value={row.pcs}
            onChange={(e) => onUpdateRow(key, 'pcs', e.target.value)}
            className="w-16 rounded border border-slate-300 bg-white px-2 py-1 text-center font-mono text-xs font-semibold text-slate-800 shadow-2xs focus:border-brand-600 focus:ring-1 focus:ring-brand-600 disabled:bg-slate-100 disabled:text-slate-400"
          />
          <input
            type="number"
            min="0"
            step="any"
            placeholder="MTR"
            disabled={!isAllowed}
            value={row.mtr}
            onChange={(e) => onUpdateRow(key, 'mtr', e.target.value)}
            className="w-20 rounded border border-slate-300 bg-white px-2 py-1 text-center font-mono text-xs font-semibold text-slate-800 shadow-2xs focus:border-brand-600 focus:ring-1 focus:ring-brand-600 disabled:bg-slate-100 disabled:text-slate-400"
          />
        </div>
      </td>

      {/* Rejection Inputs (PCS & MTR) */}
      <td className="py-2.5 px-3 sm:px-4 align-middle bg-[#fff1f2]/60 border-r border-rose-100">
        <div className="flex items-center justify-center gap-1.5">
          <input
            type="number"
            min="0"
            step="any"
            placeholder="PCS"
            disabled={!isAllowed}
            value={row.rejection_pcs}
            onChange={(e) => onUpdateRow(key, 'rejection_pcs', e.target.value)}
            className="w-16 rounded border border-slate-300 bg-white px-2 py-1 text-center font-mono text-xs font-semibold text-slate-800 shadow-2xs focus:border-rose-500 focus:ring-1 focus:ring-rose-500 disabled:bg-slate-100 disabled:text-slate-400"
          />
          <input
            type="number"
            min="0"
            step="any"
            placeholder="MTR"
            disabled={!isAllowed}
            value={row.rejection_mtr}
            onChange={(e) => onUpdateRow(key, 'rejection_mtr', e.target.value)}
            className="w-20 rounded border border-slate-300 bg-white px-2 py-1 text-center font-mono text-xs font-semibold text-slate-800 shadow-2xs focus:border-rose-500 focus:ring-1 focus:ring-rose-500 disabled:bg-slate-100 disabled:text-slate-400"
          />
        </div>
      </td>

      {/* HTC OK Inputs (Rolling Stage only) */}
      {stage === 'ROLLING' && (
        <td className="py-2.5 px-3 sm:px-4 align-middle bg-[#ecfdf5]/60 border-r border-emerald-100">
          <div className="flex items-center justify-center gap-1.5">
            <input
              type="number"
              min="0"
              step="any"
              placeholder="PCS"
              disabled={!isAllowed}
              value={row.htc_ok_pcs}
              onChange={(e) => onUpdateRow(key, 'htc_ok_pcs', e.target.value)}
              className="w-16 rounded border border-slate-300 bg-white px-2 py-1 text-center font-mono text-xs font-semibold text-slate-800 shadow-2xs focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-100 disabled:text-slate-400"
            />
          </div>
        </td>
      )}

      {/* Heat Lot No. (Heat Treatment only) */}
      {(stage === 'HEAT_TREATMENT' || stage === 'HOLLOW_HEAT_TREATMENT') && (
        <td className="py-2.5 px-3 align-middle">
          <input
            type="text"
            placeholder="e.g. HT-8842"
            disabled={!isAllowed}
            value={row.heat_lot_no}
            onChange={(e) => onUpdateRow(key, 'heat_lot_no', e.target.value)}
            className="w-24 rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-900 shadow-2xs focus:border-brand-600 focus:ring-1 focus:ring-brand-600 disabled:bg-slate-100 disabled:text-slate-400"
          />
        </td>
      )}

      {/* Actions */}
      <td className="py-2.5 px-3 align-middle text-center">
        <div className="flex items-center justify-center gap-1.5">
          <button
            type="button"
            onClick={() => onToggleExpand(key)}
            className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-800 shadow-2xs hover:bg-slate-50 transition cursor-pointer"
          >
            WIP Flow
          </button>
          {stage === 'FINISHING' && (row.is_master || (row.child_work_orders && row.child_work_orders.length > 0)) && onOpenBundling && (
            <button
              type="button"
              onClick={() => onOpenBundling(row)}
              className="inline-flex items-center gap-1 rounded border border-teal-300 bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-800 shadow-2xs hover:bg-teal-100 transition cursor-pointer"
              title="Open Campaign Multi-WO Bundling Dialog"
            >
              <Package size={12} /> Bundles
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

export default ProductionQueueRow;
