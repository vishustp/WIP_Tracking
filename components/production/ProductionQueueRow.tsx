'use client';

import { useState } from 'react';
import { Package, Crown, AlertTriangle, ArrowRightLeft, ChevronDown, ChevronUp } from 'lucide-react';
import { Row, StageCode } from '@/types';
import { calc, fmt, n, mtFromMtr } from '@/lib/productionUtils';

export interface ProductionQueueRowProps {
  row: Row;
  stage: StageCode;
  woFilter?: string;
  isAllowed: boolean;
  onUpdateRow: (
    key: string,
    field: keyof Pick<
      Row,
      'pcs' | 'mtr' | 'rejection_pcs' | 'rejection_mtr' | 'htc_ok_pcs' | 'htc_ok_mtr' | 'heat_lot_no' | 'remarks' | 'input_l1' | 'input_l2'
    >,
    value: string
  ) => void;
  onToggleExpand: (key: string) => void;
  onOpenBundling?: (row: Row) => void;
  onOpenBandSawCutting?: (row: Row) => void;
  onOpenReject?: (row: Row) => void;
}

export function ProductionQueueRow({
  row,
  stage,
  woFilter,
  isAllowed,
  onUpdateRow,
  onToggleExpand,
  onOpenBundling,
  onOpenBandSawCutting,
  onOpenReject,
}: ProductionQueueRowProps) {
  const [showAllChildren, setShowAllChildren] = useState(false);
  const key = row.plan_id ? `${row.work_order_id}|${row.route_id}|${row.plan_id}` : `${row.work_order_id}|${row.route_id}`;
  const d = calc({ ...row, stage_code: stage });
  const isRollingStage = stage === 'HOT_ROLLING' || stage === 'ROLLING';
  const isMhStage = stage === 'HOT_ROLLING' || stage === 'ROLLING' || stage === 'HOLLOW_HEAT_TREATMENT';
  const hasL1L2 = stage === 'DRAW' || stage === 'PILGER' || stage === 'HEAT_TREATMENT' || stage === 'FINISHING';
  const stageOd = isMhStage && row.mh_od ? Number(row.mh_od) : Number(row.od || 0);
  const stageWt = isMhStage && row.mh_wt ? Number(row.mh_wt) : Number(row.wl || 0);

  const availMtr = n(row.balance_to_make_mtr);
  const effAvg = d.avg > 0 ? d.avg : n(row.avg_length) || 6;
  const availPcs =
    n(row.balance_to_make_pcs) > 0
      ? Math.round(n(row.balance_to_make_pcs))
      : effAvg > 0
      ? Math.round(availMtr / effAvg)
      : 0;

  // In Rolling production entry, 104% tolerance is not mandatory to enter.
  // Do not show 0 pcs in production entry of Rolling.
  if (isRollingStage && availPcs <= 0) {
    return null;
  }

  return (
    <tr id={`row-${key}`} className="group hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors">
      {/* Order Information (Frozen Left Column) */}
      <td className="sticky left-0 z-10 py-2.5 px-3 sm:px-4 align-middle bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800 border-r border-slate-200 dark:border-slate-800 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] min-w-[220px] sm:min-w-[260px] text-slate-900 dark:text-slate-100">
        <div className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5 flex-wrap">
          <span className="text-xs sm:text-sm font-extrabold">{row.work_order_no}</span>
          {isRollingStage && (row.master_plan_no || row.plan_no) && (
            <span className="inline-flex items-center gap-0.5 rounded bg-sky-100 dark:bg-sky-950/70 text-sky-800 dark:text-sky-300 border border-sky-200 dark:border-sky-800 px-1.5 py-0.5 text-[10px] font-bold uppercase">
              PLAN: {row.master_plan_no || row.plan_no}
              {Number(row.revision_no || 0) > 0 ? ` (R${String(row.revision_no)})` : ''}
            </span>
          )}
          {isRollingStage && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-2 py-0.2 text-[9px] font-bold uppercase">
              ISSUED
            </span>
          )}
          {row.is_master && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950/70 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 px-2 py-0.2 text-[9px] font-bold uppercase">
              <Crown size={10} /> MASTER
            </span>
          )}
          {row.has_diversion && (
            <span
              className="inline-flex items-center gap-1 rounded bg-purple-100 dark:bg-purple-950/80 text-purple-900 dark:text-purple-200 border border-purple-300 dark:border-purple-700 px-1.5 py-0.2 text-[10px] font-mono font-bold tracking-tight shadow-2xs"
              title={
                row.diversion_source_wo
                  ? `Diverted WIP: ${row.diversion_in_pcs ?? 0} PCS (${row.diversion_in_mtr ?? 0}m) from ${row.diversion_source_wo}${row.diversion_remarks ? ` - ${row.diversion_remarks}` : ''}`
                  : 'Diverted WIP'
              }
            >
              <ArrowRightLeft size={10} className="shrink-0 text-purple-700 dark:text-purple-300" />
              <span>DIV</span>
              {row.diversion_source_wo && (
                <span className="font-normal opacity-90 text-[9px]">← {row.diversion_source_wo}</span>
              )}
            </span>
          )}
          {row.has_pending_ppc_diversion && (
            <span
              className="inline-flex items-center gap-1 rounded bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-700 px-1.5 py-0.2 text-[10px] font-mono font-bold tracking-tight shadow-2xs"
              title={row.pending_ppc_diversion_note || 'Draw Bench diversion pending PPC approval'}
            >
              <AlertTriangle size={10} className="shrink-0 text-amber-700 dark:text-amber-400" />
              <span>HOLD: {row.pending_ppc_diversion_mtr}m PENDING PPC</span>
            </span>
          )}
          {row.daily_plan_target_pcs && Number(row.daily_plan_target_pcs) > 0 && (
            <span className="inline-flex items-center gap-1 rounded bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-700 px-1.5 py-0.2 text-[10px] font-mono font-bold tracking-tight shadow-2xs">
              ★ TODAY&apos;S TARGET: {row.daily_plan_target_pcs} PCS{row.daily_plan_machine ? ` (${row.daily_plan_machine})` : ''}
            </span>
          )}
        </div>

        <div className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5 truncate max-w-[220px]">
          {row.customer_name || '—'}
        </div>
        <div className="text-[11px] text-slate-400 dark:text-slate-500 font-mono mt-0.5">
          <span>
            {row.od ? `${row.od} × ${row.wl ?? '—'} mm` : '—'} | Avg: {fmt(d.avg, 'm')}
          </span>
        </div>

        {row.child_work_orders && row.child_work_orders.length > 0 && (
          <div className="mt-1.5 pt-1 border-t border-slate-100 dark:border-slate-800">
            <div className="text-[10px] font-bold uppercase text-slate-500 mb-0.5 flex items-center justify-between">
              <span>Children ({row.child_work_orders.length}):</span>
              {row.child_work_orders.length > 2 && (
                <button
                  type="button"
                  onClick={() => setShowAllChildren((prev) => !prev)}
                  className="text-[9px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-0.5"
                >
                  {showAllChildren ? (
                    <>Less <ChevronUp size={10} /></>
                  ) : (
                    <>+{row.child_work_orders.length - 2} more <ChevronDown size={10} /></>
                  )}
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1 max-w-[260px]">
              {(showAllChildren || (woFilter && row.child_work_orders.some((c: any) => {
                const cNo = c.work_order_no || c.wo_no || c.order_no || '';
                const qClean = (woFilter || '').trim().toLowerCase();
                return cNo.toLowerCase().includes(qClean) || (c.customer_name || '').toLowerCase().includes(qClean);
              })) ? row.child_work_orders : row.child_work_orders.slice(0, 2)).map((c: any, idx: number) => {
                const cNo = c.work_order_no || c.wo_no || c.order_no || `#${idx + 1}`;
                const qClean = (woFilter || '').trim().toLowerCase();
                const qNorm = qClean.replace(/[^a-z0-9]/g, '');
                const cText = `${cNo} ${c.customer_name || ''} ${c.specification || c.grade || ''}`.toLowerCase();
                const cNorm = cText.replace(/[^a-z0-9]/g, '');
                const isMatched =
                  qClean.length > 0 &&
                  (cText.includes(qClean) || (qNorm.length > 0 && cNorm.includes(qNorm)));

                return (
                  <span
                    key={c.id || c.work_order_id || idx}
                    className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-mono font-bold border transition-colors ${
                      isMatched
                        ? 'bg-amber-100 text-amber-950 border-amber-400 ring-1 ring-amber-400 font-black shadow-2xs'
                        : 'bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                    title={`${cNo} | ${c.customer_name || 'Direct'} | ${c.specification || c.grade || ''} | Planned: ${c.planned_pcs || 0} pcs / ${c.planned_mtr || 0} m`}
                  >
                    {isMatched && <span className="text-amber-600 font-black">★</span>}
                    <span>{cNo}</span>
                    {c.customer_name && (
                      <span className="text-[9px] font-normal text-slate-500 truncate max-w-[80px]">
                        ({c.customer_name})
                      </span>
                    )}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {row.is_child && (
          <div className="mt-1 flex items-center gap-1 text-[10px] font-mono text-indigo-700 bg-indigo-50/80 px-1.5 py-0.5 rounded border border-indigo-200/60 w-fit">
            <span className="font-bold">Child of:</span>
            <span>{row.master_wo_no || 'Master Campaign'}</span>
            {row.master_plan_no && <span className="text-slate-500">({row.master_plan_no})</span>}
          </div>
        )}
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
        <div className="text-[11px] text-slate-500 font-medium mt-0.5">
          {isRollingStage ? (
            (() => {
              const planPcs = Number(row.planned_pcs || row.campaign_total_pcs || 0);
              const donePcs = Math.max(0, planPcs - availPcs);
              const max104Pcs = planPcs > 0 ? Math.round(planPcs * 1.04) : 0;
              const rem104Pcs = n(row.max_allowed_pcs) > 0 ? Math.round(n(row.max_allowed_pcs)) : Math.max(0, max104Pcs - donePcs);
              return (
                <span className="flex flex-col gap-0.5">
                  <span>
                    Plan: <span className="font-semibold text-slate-700">{fmt(planPcs)} PCS</span>
                    {donePcs > 0 && (
                      <span className="text-emerald-600 font-semibold ml-1">
                        ({fmt(donePcs)} done)
                      </span>
                    )}
                  </span>
                  {max104Pcs > planPcs && (
                    <span className="text-[10px] text-sky-700 font-medium">
                      Max (104%): <span className="font-bold font-mono">{fmt(max104Pcs)} PCS</span>
                      {rem104Pcs > 0 && rem104Pcs !== availPcs && (
                        <span className="text-sky-600 ml-1">({fmt(rem104Pcs)} can roll)</span>
                      )}
                    </span>
                  )}
                </span>
              );
            })()
          ) : (
            `Avail: ${fmt(availPcs)} PCS`
          )}
        </div>
        {Number(row.pending_rejection_pcs || row.pending_rejection_mtr || 0) > 0 && (
          <div className="mt-1 inline-flex items-center gap-1 rounded bg-amber-50 text-amber-900 border border-amber-300 px-1.5 py-0.5 text-[10px] font-bold">
            <AlertTriangle size={11} className="text-amber-700 shrink-0" />
            <span>{row.pending_rejection_pcs || 0} PCS ({fmt(row.pending_rejection_mtr, 'm')}) Under Review</span>
          </div>
        )}
        {row.has_diversion && (
          <div className="mt-1 inline-flex items-center gap-1 rounded bg-purple-50 dark:bg-purple-950/70 text-purple-900 dark:text-purple-200 border border-purple-200 dark:border-purple-800 px-1.5 py-0.5 text-[10px] font-bold">
            <ArrowRightLeft size={10} className="text-purple-700 dark:text-purple-300 shrink-0" />
            <span>Includes Div: {row.diversion_in_pcs ?? 0} PCS</span>
          </div>
        )}
      </td>

      {/* Length Inputs (L1 / L2) for Draw, HT, Band Saw, VDI, Finishing */}
      {hasL1L2 && (
        <td className="py-2.5 px-2 sm:px-3 align-middle bg-[#fefce8]/60 border-x border-amber-100">
          <div className="flex items-center justify-center gap-1">
            <input
              type="number"
              min="0"
              step="any"
              placeholder={row.l1 ? `${row.l1}` : 'L1'}
              disabled={!isAllowed}
              value={row.input_l1 ?? ''}
              onChange={(e) => {
                onUpdateRow(key, 'input_l1', e.target.value);
                const l1Val = Number(e.target.value);
                const l2Val = Number(row.input_l2 || e.target.value);
                const avgVal = l1Val > 0 && l2Val > 0 ? (l1Val + l2Val) / 2 : l1Val;
                if (row.pcs && avgVal > 0) {
                  onUpdateRow(key, 'mtr', (Number(row.pcs) * avgVal).toFixed(2));
                }
              }}
              aria-label={`Minimum cut length L1 for order ${row.work_order_no}`}
              className="w-14 rounded border border-amber-300 dark:border-amber-700 bg-[var(--bg-surface,#ffffff)] px-1.5 py-1 text-center font-mono text-xs font-semibold text-[var(--text-main,#0f172a)] shadow-2xs focus:border-amber-500 focus:ring-1 focus:ring-amber-500 disabled:bg-[var(--bg-surface-subtle,#f1f5f9)] disabled:text-[var(--text-muted,#94a3b8)]"
              title="L1 (Length Min / Cut Length in meters)"
            />
            <span className="text-[var(--text-muted,#94a3b8)] text-xs">-</span>
            <input
              type="number"
              min="0"
              step="any"
              placeholder={row.l2 ? `${row.l2}` : 'L2'}
              disabled={!isAllowed}
              value={row.input_l2 ?? ''}
              onChange={(e) => {
                onUpdateRow(key, 'input_l2', e.target.value);
                const l2Val = Number(e.target.value);
                const l1Val = Number(row.input_l1 || e.target.value);
                const avgVal = l1Val > 0 && l2Val > 0 ? (l1Val + l2Val) / 2 : l2Val;
                if (row.pcs && avgVal > 0) {
                  onUpdateRow(key, 'mtr', (Number(row.pcs) * avgVal).toFixed(2));
                }
              }}
              aria-label={`Maximum cut length L2 for order ${row.work_order_no}`}
              className="w-14 rounded border border-amber-300 dark:border-amber-700 bg-[var(--bg-surface,#ffffff)] px-1.5 py-1 text-center font-mono text-xs font-semibold text-[var(--text-main,#0f172a)] shadow-2xs focus:border-amber-500 focus:ring-1 focus:ring-amber-500 disabled:bg-[var(--bg-surface-subtle,#f1f5f9)] disabled:text-[var(--text-muted,#94a3b8)]"
              title="L2 (Length Max / Cut Length in meters)"
            />
          </div>
        </td>
      )}

      {/* Production Inputs (PCS & MTR) */}
      <td className="py-2.5 px-3 sm:px-4 align-middle bg-[#f0f9ff]/60 dark:bg-sky-950/20 border-x border-sky-100 dark:border-sky-900/40">
        <div className="flex items-center justify-center gap-1.5">
          <input
            type="number"
            min="0"
            step="1"
            placeholder="PCS"
            disabled={!isAllowed}
            value={row.pcs}
            onChange={(e) => {
              onUpdateRow(key, 'pcs', e.target.value);
              const numPcs = Number(e.target.value);
              const inputL1 = Number(row.input_l1);
              const inputL2 = Number(row.input_l2);
              const userAvg = inputL1 > 0 && inputL2 > 0 ? (inputL1 + inputL2) / 2 : (inputL1 || inputL2 || 0);
              const avgLen = userAvg > 0 ? userAvg : d.avg > 0 ? d.avg : 6.0;
              if (numPcs > 0 && avgLen > 0) {
                onUpdateRow(key, 'mtr', (numPcs * avgLen).toFixed(2));
              } else if (!e.target.value) {
                onUpdateRow(key, 'mtr', '');
              }
            }}
            aria-label={`Produced pieces for order ${row.work_order_no}`}
            className="w-16 rounded border border-[var(--border-subtle,#cbd5e1)] bg-[var(--bg-surface,#ffffff)] px-2 py-1 text-center font-mono text-xs font-semibold text-[var(--text-main,#0f172a)] shadow-2xs focus:border-brand-600 focus:ring-1 focus:ring-brand-600 disabled:bg-[var(--bg-surface-subtle,#f1f5f9)] disabled:text-[var(--text-muted,#94a3b8)]"
          />
          <input
            type="number"
            min="0"
            step="any"
            placeholder="MTR"
            disabled={!isAllowed}
            value={row.mtr}
            onChange={(e) => onUpdateRow(key, 'mtr', e.target.value)}
            aria-label={`Produced meters for order ${row.work_order_no}`}
            className="w-20 rounded border border-[var(--border-subtle,#cbd5e1)] bg-[var(--bg-surface,#ffffff)] px-2 py-1 text-center font-mono text-xs font-semibold text-[var(--text-main,#0f172a)] shadow-2xs focus:border-brand-600 focus:ring-1 focus:ring-brand-600 disabled:bg-[var(--bg-surface-subtle,#f1f5f9)] disabled:text-[var(--text-muted,#94a3b8)]"
          />
        </div>
      </td>

      {/* Rejection Inputs (PCS & MTR) */}
      <td className="py-2.5 px-3 sm:px-4 align-middle bg-[#fff1f2]/60 dark:bg-rose-950/20 border-r border-rose-100 dark:border-rose-900/40">
        <div className="flex items-center justify-center gap-1.5">
          <input
            type="number"
            min="0"
            step="1"
            placeholder="PCS"
            disabled={!isAllowed}
            value={row.rejection_pcs}
            onChange={(e) => onUpdateRow(key, 'rejection_pcs', e.target.value)}
            aria-label={`Rejection pieces for order ${row.work_order_no}`}
            className="w-16 rounded border border-[var(--border-subtle,#cbd5e1)] bg-[var(--bg-surface,#ffffff)] px-2 py-1 text-center font-mono text-xs font-semibold text-[var(--text-main,#0f172a)] shadow-2xs focus:border-rose-500 focus:ring-1 focus:ring-rose-500 disabled:bg-[var(--bg-surface-subtle,#f1f5f9)] disabled:text-[var(--text-muted,#94a3b8)]"
          />
          <input
            type="number"
            min="0"
            step="any"
            placeholder="MTR"
            disabled={!isAllowed}
            value={row.rejection_mtr}
            onChange={(e) => onUpdateRow(key, 'rejection_mtr', e.target.value)}
            aria-label={`Rejection meters for order ${row.work_order_no}`}
            className="w-20 rounded border border-[var(--border-subtle,#cbd5e1)] bg-[var(--bg-surface,#ffffff)] px-2 py-1 text-center font-mono text-xs font-semibold text-[var(--text-main,#0f172a)] shadow-2xs focus:border-rose-500 focus:ring-1 focus:ring-rose-500 disabled:bg-[var(--bg-surface-subtle,#f1f5f9)] disabled:text-[var(--text-muted,#94a3b8)]"
          />
        </div>
      </td>

      {/* OK Nos Column (HTC OK for HTC/Rolling, Auto-calculated Net OK for other stages) */}
      {stage === 'HTC' || stage === 'ROLLING' ? (
        <td className="py-2.5 px-3 sm:px-4 align-middle bg-[#ecfdf5]/60 dark:bg-emerald-950/20 border-r border-emerald-100 dark:border-emerald-900/40">
          <div className="flex items-center justify-center gap-1.5">
            <input
              type="number"
              min="0"
              step="1"
              placeholder="PCS"
              disabled={!isAllowed}
              value={row.htc_ok_pcs}
              onChange={(e) => onUpdateRow(key, 'htc_ok_pcs', e.target.value)}
              aria-label={`HTC OK inspected pieces for order ${row.work_order_no}`}
              className="w-16 rounded border border-[var(--border-subtle,#cbd5e1)] bg-[var(--bg-surface,#ffffff)] px-2 py-1 text-center font-mono text-xs font-semibold text-[var(--text-main,#0f172a)] shadow-2xs focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:bg-[var(--bg-surface-subtle,#f1f5f9)] disabled:text-[var(--text-muted,#94a3b8)]"
            />
          </div>
        </td>
      ) : (
        <td className="py-2.5 px-3 sm:px-4 align-middle bg-[#ecfdf5]/60 dark:bg-emerald-950/20 border-r border-emerald-100 dark:border-emerald-900/40 text-center">
          {(() => {
            const pPcs = n(row.pcs);
            const rPcs = n(row.rejection_pcs);
            const okPcs = Math.max(0, pPcs - rPcs);
            const pMtr = n(row.mtr);
            const rMtr = n(row.rejection_mtr);
            const okMtr = Math.max(0, pMtr - rMtr);

            return pPcs > 0 || pMtr > 0 ? (
              <div className="inline-flex flex-col items-center justify-center bg-emerald-100/70 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800 px-2 py-0.5 rounded text-emerald-900 dark:text-emerald-200 font-mono font-extrabold text-xs shadow-2xs">
                <span>{okPcs > 0 ? `${fmt(okPcs)} PCS` : (okMtr > 0 ? `${fmt(okMtr)} m` : '0 PCS')}</span>
                {okMtr > 0 && okPcs > 0 && <span className="text-[10px] text-emerald-700 dark:text-emerald-300 font-normal">{fmt(okMtr)} m</span>}
              </div>
            ) : (
              <span className="text-[var(--text-muted,#94a3b8)] font-mono">—</span>
            );
          })()}
        </td>
      )}

      {/* Heat Lot No. (Heat Treatment) */}
      {(stage === 'HEAT_TREATMENT' || stage === 'HOLLOW_HEAT_TREATMENT') && (
        <td className="py-2.5 px-3 align-middle">
          <input
            type="text"
            placeholder="e.g. HT-8842"
            disabled={!isAllowed}
            value={row.heat_lot_no}
            onChange={(e) => onUpdateRow(key, 'heat_lot_no', e.target.value)}
            aria-label={`Heat lot number for order ${row.work_order_no}`}
            className="w-24 rounded border border-[var(--border-subtle,#cbd5e1)] bg-[var(--bg-surface,#ffffff)] px-2 py-1 text-xs font-medium text-[var(--text-main,#0f172a)] shadow-2xs focus:border-brand-600 focus:ring-1 focus:ring-brand-600 disabled:bg-[var(--bg-surface-subtle,#f1f5f9)] disabled:text-[var(--text-muted,#94a3b8)]"
          />
        </td>
      )}

      {/* Actions (Sticky Right Column) */}
      <td className="sticky right-0 z-10 py-2.5 px-3 align-middle text-center bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800 border-l border-slate-200 dark:border-slate-800 shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.06)]">
        <div className="flex items-center justify-center gap-1.5">
          <button
            type="button"
            onClick={() => onToggleExpand(key)}
            className="inline-flex items-center gap-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1 text-xs font-bold text-slate-800 dark:text-slate-200 shadow-2xs hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer touch-manipulation min-h-[30px]"
            aria-label={`View WIP flow for order ${row.work_order_no}`}
          >
            WIP Flow
          </button>
          {stage === 'FINISHING' && onOpenBundling && (
            <button
              type="button"
              onClick={() => onOpenBundling(row)}
              className="inline-flex items-center gap-1 rounded border border-teal-300 bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-800 shadow-2xs hover:bg-teal-100 transition cursor-pointer touch-manipulation min-h-[30px]"
              title="Open Bundling & Commercial Disposition Dialog"
              aria-label={`Open Bundling & Commercial Disposition for order ${row.work_order_no}`}
            >
              <Package size={12} /> Bundles
            </button>
          )}
          {onOpenReject && (
            <button
              type="button"
              disabled={!isAllowed || (availPcs <= 0 && availMtr <= 0)}
              onClick={() => onOpenReject(row)}
              className="inline-flex items-center gap-1 rounded border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 px-2.5 py-1 text-xs font-bold text-rose-800 dark:text-rose-200 shadow-2xs hover:bg-rose-100 dark:hover:bg-rose-900/40 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation min-h-[30px]"
              title={`Declare Rejection / Reject Remnant for ${row.work_order_no} (${availPcs > 0 ? `${availPcs} PCS` : `${availMtr} m`} balance)`}
              aria-label={`Declare Rejection for order ${row.work_order_no}`}
            >
              <AlertTriangle size={11} className="text-rose-600 dark:text-rose-400" />
              <span>Reject</span>
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

export default ProductionQueueRow;
