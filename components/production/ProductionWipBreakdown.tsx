'use client';

import { Layers } from 'lucide-react';
import { Row, StageCode } from '@/types';
import { fmt, mtFromMtr } from '@/lib/productionUtils';

export interface ProductionWipBreakdownProps {
  rows: Row[];
  expandedRows: Record<string, boolean>;
  stage: StageCode;
  onToggleRow: (key: string) => void;
}

export function ProductionWipBreakdown({
  rows,
  expandedRows,
  stage,
  onToggleRow,
}: ProductionWipBreakdownProps) {
  const activeExpandedRows = rows.filter(
    (r) => expandedRows[`${r.work_order_id}|${r.route_id}`]
  );

  if (activeExpandedRows.length === 0) return null;

  return (
    <div className="border-t border-slate-200 bg-slate-50/50 p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Layers className="h-4 w-4 text-brand-600" />
        <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-800">
          Work Center WIP Breakdown Across Full Process Route
        </h3>
      </div>

      {activeExpandedRows.map((r) => {
        const key = `${r.work_order_id}|${r.route_id}`;
        return (
          <div key={key} className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 text-sm">{r.work_order_no}</span>
                <span className="text-xs text-slate-500 font-mono">({r.customer_name || 'Direct'})</span>
                <span className="rounded bg-sky-50 border border-sky-200 px-2 py-0.5 text-xs font-bold text-sky-700">
                  Route: {r.route_code}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onToggleRow(key)}
                className="text-xs font-semibold text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                Close Breakdown
              </button>
            </div>

            {/* Flow steps */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {r.work_centers_wip?.map((w, idx) => {
                const isCurrent = w.stage_code === stage;
                const isRoll = w.stage_code === 'ROLLING';
                const stageOd = isRoll && r.mh_od ? Number(r.mh_od) : Number(r.od || 0);
                const stageWt = isRoll && r.mh_wt ? Number(r.mh_wt) : Number(r.wl || 0);

                const availMt = w.available_mt ?? mtFromMtr(w.available_mtr, stageOd, stageWt);
                const grossMt = w.gross_output_mt ?? mtFromMtr(w.gross_output_mtr, stageOd, stageWt);
                const rejMt = w.rejection_mt ?? mtFromMtr(w.rejection_mtr, stageOd, stageWt);
                const netMt = w.net_output_mt ?? mtFromMtr(w.net_output_mtr, stageOd, stageWt);
                const htcMt = w.htc_ok_mt ?? mtFromMtr(w.htc_ok_mtr || 0, stageOd, stageWt);

                return (
                  <div
                    key={w.stage_code}
                    className={`rounded-lg border p-3 space-y-2 relative transition-all ${
                      isCurrent
                        ? 'border-brand-500 bg-brand-50/40 ring-1 ring-brand-500 shadow-2xs'
                        : 'border-slate-200 bg-slate-50/30'
                    }`}
                  >
                    <div className="flex items-center justify-between border-b border-slate-200/60 pb-1.5">
                      <span className="text-xs font-bold text-slate-800">
                        {idx + 1}. {w.stage_name}
                      </span>
                      {isCurrent && (
                        <span className="rounded-full bg-brand-800 px-2 py-0.2 text-[10px] font-bold text-white">
                          Current
                        </span>
                      )}
                    </div>

                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between items-baseline">
                        <span className="text-slate-500">Available WIP:</span>
                        <span className="font-bold font-mono text-slate-900">
                          {fmt(w.available_pcs)} PCS ({fmt(w.available_mtr, 'm')} ·{' '}
                          <span className="text-brand-700">{fmt(availMt, ' MT')}</span>)
                        </span>
                      </div>
                      <div className="flex justify-between items-baseline">
                        <span className="text-slate-500">Gross Output:</span>
                        <span className="font-semibold font-mono text-slate-800">
                          {fmt(w.gross_output_pcs)} PCS ({fmt(w.gross_output_mtr, 'm')} ·{' '}
                          <span className="text-slate-600">{fmt(grossMt, ' MT')}</span>)
                        </span>
                      </div>
                      <div className="flex justify-between items-baseline">
                        <span className="text-slate-500">Rejection:</span>
                        <span className="font-semibold font-mono text-rose-600">
                          {fmt(w.rejection_pcs)} PCS ({fmt(w.rejection_mtr, 'm')} ·{' '}
                          <span className="text-rose-600">{fmt(rejMt, ' MT')}</span>)
                        </span>
                      </div>
                      <div className="flex justify-between items-baseline border-t border-slate-100 pt-1">
                        <span className="text-slate-700 font-semibold">Net Output:</span>
                        <span className="font-bold font-mono text-emerald-700">
                          {fmt(w.net_output_pcs)} PCS ({fmt(w.net_output_mtr, 'm')} ·{' '}
                          <span className="text-emerald-700">{fmt(netMt, ' MT')}</span>)
                        </span>
                      </div>
                      {w.stage_code === 'ROLLING' && (
                        <div className="flex justify-between items-baseline border-t border-slate-100 pt-1">
                          <span className="text-indigo-700 font-semibold">HTC OK:</span>
                          <span className="font-bold font-mono text-indigo-700">
                            {fmt(w.htc_ok_pcs)} PCS ({fmt(w.htc_ok_mtr, 'm')} ·{' '}
                            <span className="text-indigo-700">{fmt(htcMt, ' MT')}</span>)
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default ProductionWipBreakdown;
