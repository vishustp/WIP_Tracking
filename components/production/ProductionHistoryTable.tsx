'use client';

import { Search, Edit2, Trash2, Lock, RefreshCw } from 'lucide-react';
import { ProductionEntry, Row, STAGES } from '@/types';
import { fmt, extractPcsFromRemarks, extractCustomLengthFromRemarks } from '@/lib/productionUtils';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';

export interface ProductionHistoryTableProps {
  entries: ProductionEntry[];
  rows: Row[];
  search: string;
  setSearch: (val: string) => void;
  entryStage: string;
  setEntryStage: (val: string) => void;
  entryRoute: string;
  setEntryRoute: (val: string) => void;
  routes: string[];
  fromDate: string;
  setFromDate: (val: string) => void;
  toDate: string;
  setToDate: (val: string) => void;
  historyLoading: boolean;
  canEditForStage: (stage: string) => { allowed: boolean; reason?: string };
  canDeleteForStage: (stage: string) => { allowed: boolean; reason?: string };
  onOpenEdit: (entry: ProductionEntry) => void;
  onOpenDelete: (entryId: string) => void;
  isAdmin: boolean;
  isSuperUser: boolean;
  workCenter?: string;
}

export function ProductionHistoryTable({
  entries,
  rows,
  search,
  setSearch,
  entryStage,
  setEntryStage,
  entryRoute,
  setEntryRoute,
  routes,
  fromDate,
  setFromDate,
  toDate,
  setToDate,
  historyLoading,
  canEditForStage,
  canDeleteForStage,
  onOpenEdit,
  onOpenDelete,
  isAdmin,
  isSuperUser,
  workCenter,
}: ProductionHistoryTableProps) {
  return (
    <div className="rounded-xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden">
      {/* Search & Filter Toolbar */}
      <div className="border-b border-slate-100 p-4 bg-slate-50/70">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Search size={15} className="text-slate-500" />
            <h2 className="text-xs sm:text-sm font-bold text-slate-900">Production History</h2>
          </div>
          <span className="text-xs font-semibold text-slate-500 font-mono">
            {entries.length} Logged Record{entries.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-5 text-xs">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search WO, customer, grade, plan no..."
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 shadow-2xs focus:border-brand-600 focus:ring-1 focus:ring-brand-600 text-xs"
          />
          <select
            value={entryStage}
            onChange={(e) => setEntryStage(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 shadow-2xs focus:border-brand-600 focus:ring-1 focus:ring-brand-600 text-xs"
          >
            <option value="">All Stages</option>
            {STAGES.map((s) => (
              <option key={s.code} value={s.code}>
                {s.label}
              </option>
            ))}
          </select>
          <select
            value={entryRoute}
            onChange={(e) => setEntryRoute(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 shadow-2xs focus:border-brand-600 focus:ring-1 focus:ring-brand-600 text-xs"
          >
            <option value="">All Routes</option>
            {routes.map((route) => (
              <option key={route} value={route}>
                {route}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 shadow-2xs focus:border-brand-600 focus:ring-1 focus:ring-brand-600 text-xs"
          />
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 shadow-2xs focus:border-brand-600 focus:ring-1 focus:ring-brand-600 text-xs"
          />
        </div>
      </div>

      {/* Content Table / Skeletons / Empty */}
      {historyLoading ? (
        <div className="p-8 space-y-3">
          <div className="flex items-center justify-center gap-2 text-xs font-medium text-slate-500 mb-4">
            <RefreshCw size={14} className="animate-spin text-brand-600" />
            <span>Loading production history records...</span>
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="p-8">
          <EmptyState
            title="No Production Records Found"
            description="No logged entries match your search criteria or date range."
          />
        </div>
      ) : (
        <div className="overflow-auto max-h-[70vh] relative">
          <table className="min-w-full text-xs">
            <thead className="sticky top-0 z-20 border-b border-slate-200 bg-slate-100 shadow-2xs text-slate-700">
              <tr>
                <th className="py-2.5 px-3 text-left font-semibold">Date</th>
                <th className="py-2.5 px-3 text-left font-semibold">Work Order</th>
                <th className="py-2.5 px-3 text-left font-semibold">Route & Stage</th>
                <th className="py-2.5 px-3 text-right font-semibold">Production (PCS & MTR)</th>
                <th className="py-2.5 px-3 text-right font-semibold">Rejection (PCS & MTR)</th>
                <th className="py-2.5 px-3 text-right font-semibold">HTC OK</th>
                <th className="py-2.5 px-3 text-left font-semibold">Heat Lot</th>
                <th className="py-2.5 px-3 text-left font-semibold">Operator</th>
                <th className="py-2.5 px-3 text-center font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.map((entry) => {
                const isMhStage = entry.stage_code === 'ROLLING' || entry.stage_code === 'HOLLOW_HEAT_TREATMENT';
                const rowMatch = rows.find(
                  (r) =>
                    r.work_order_no === entry.work_order_no &&
                    (entry.plan_no ? r.plan_no === entry.plan_no || r.master_plan_no === entry.plan_no : true)
                );
                const effPlanNo = entry.plan_no || (rowMatch?.plan_no && !rowMatch.plan_no.includes(',') ? rowMatch.plan_no : undefined);
                const effRevNo = entry.revision_no ?? rowMatch?.revision_no;
                const mhLen = Number(
                  entry.mh_avg_length || entry.mh_l1 || rowMatch?.mh_avg_length || rowMatch?.mh_l1 || 0
                );
                const woLen = Number(
                  entry.avg_length ||
                    rowMatch?.avg_length ||
                    (Number(rowMatch?.total_order_mtr || 0) > 0 && Number(rowMatch?.total_order_pcs || 0) > 0
                      ? Number(rowMatch?.total_order_mtr) / Number(rowMatch?.total_order_pcs)
                      : 6.0)
                );
                const customLen = extractCustomLengthFromRemarks(entry.remarks);
                const effectiveLen =
                  isMhStage && mhLen > 0
                    ? mhLen
                    : customLen.avg && customLen.avg > 0
                    ? customLen.avg
                    : woLen > 0
                    ? woLen
                    : 6.0;

                const { pcs: parsedPcs, rejPcs: parsedRejPcs, cleanRemarks } = extractPcsFromRemarks(entry.remarks);

                const dispOutPcs = Math.round(
                  parsedPcs != null
                    ? parsedPcs
                    : isMhStage && mhLen > 0
                    ? Number(entry.output_mtr || 0) / mhLen
                    : Number(entry.output_pcs || 0) > 0
                    ? Number(entry.output_pcs)
                    : effectiveLen > 0 && Number(entry.output_mtr || 0) > 0
                    ? Number(entry.output_mtr) / effectiveLen
                    : 0
                );

                const dispRejPcs = Math.round(
                  parsedRejPcs != null
                    ? parsedRejPcs
                    : isMhStage && mhLen > 0
                    ? Number(entry.rejection_mtr || 0) / mhLen
                    : Number(entry.rejection_pcs || 0) > 0
                    ? Number(entry.rejection_pcs)
                    : effectiveLen > 0 && Number(entry.rejection_mtr || 0) > 0
                    ? Number(entry.rejection_mtr) / effectiveLen
                    : 0
                );

                const dispHtcOkPcs =
                  entry.stage_code === 'ROLLING'
                    ? Math.max(
                        0,
                        Number(entry.htc_ok_pcs || 0) > 0
                          ? Math.min(dispOutPcs, Number(entry.htc_ok_pcs))
                          : dispOutPcs - dispRejPcs
                      )
                    : 0;

                const dispHtcOkMtr =
                  entry.stage_code === 'ROLLING'
                    ? Math.min(
                        Number(entry.output_mtr || 0),
                        Number(entry.htc_ok_mtr || 0) > 0
                          ? Number(entry.htc_ok_mtr)
                          : Math.max(0, Number(entry.output_mtr || 0) - Number(entry.rejection_mtr || 0))
                      )
                    : 0;

                const editCheck = canEditForStage(entry.stage_code);
                const delCheck = canDeleteForStage(entry.stage_code);
                const canAdminOverride = isAdmin || isSuperUser;
                const canEditEntry = canAdminOverride ? editCheck.allowed : (entry.can_modify && editCheck.allowed);
                const canDeleteEntry = canAdminOverride ? delCheck.allowed : (entry.can_modify && delCheck.allowed);

                return (
                  <tr key={entry.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-2.5 px-3 font-mono text-slate-700">{entry.process_date}</td>
                    <td className="py-2.5 px-3 font-bold text-slate-900">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-extrabold">{entry.work_order_no}</span>
                        {effPlanNo && (
                          <span className="inline-flex items-center gap-0.5 rounded bg-sky-100 border border-sky-200 text-sky-800 px-1.5 py-0.5 text-[10px] font-bold font-mono tracking-tight shadow-2xs">
                            PLAN: {effPlanNo}{effRevNo && Number(effRevNo) > 0 ? ` (R${effRevNo})` : ''}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] font-normal text-slate-500 truncate max-w-[140px]">
                        {entry.customer_name || '—'}
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="rounded bg-slate-100 border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-800">
                        {entry.route_code}
                      </span>
                      <div className="text-xs text-slate-600 font-medium mt-0.5">
                        {STAGES.find((s) => s.code === entry.stage_code)?.label || entry.stage_code}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono">
                      <div className="font-bold text-slate-900">{fmt(dispOutPcs)} PCS</div>
                      <div className="text-[11px] text-slate-500">{fmt(entry.output_mtr, ' MTR')}</div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono">
                      <div className="font-bold text-rose-600">{fmt(dispRejPcs)} PCS</div>
                      <div className="text-[11px] text-slate-500">{fmt(entry.rejection_mtr, ' MTR')}</div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-emerald-700">
                      {entry.stage_code === 'ROLLING' && (dispHtcOkMtr > 0 || dispHtcOkPcs > 0) ? (
                        <>
                          <div className="font-bold">{fmt(dispHtcOkPcs)} PCS</div>
                          <div className="text-[11px] text-slate-500">{fmt(dispHtcOkMtr, ' MTR')}</div>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-800">{entry.heat_lot_no || '—'}</td>
                    <td className="py-2.5 px-3">
                      {entry.operator_name ? (
                        <div className="flex items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 shadow-2xs">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                            {entry.operator_name}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400 font-medium italic">Unassigned</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          disabled={!canEditEntry}
                          onClick={() => onOpenEdit(entry)}
                          title={
                            !editCheck.allowed
                              ? editCheck.reason || 'Unauthorized to edit'
                              : canAdminOverride
                              ? `Edit Entry (${entry.stage_code} - Admin Authority)`
                              : entry.can_modify
                              ? `Edit Entry (${entry.stage_code})`
                              : 'Locked: subsequent production logs exist for this order'
                          }
                          className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                        >
                          {!editCheck.allowed ? <Lock size={11} className="text-slate-400" /> : <Edit2 size={12} />}
                          Edit
                        </button>

                        {delCheck.allowed ? (
                          <button
                            type="button"
                            disabled={!canDeleteEntry}
                            onClick={() => onOpenDelete(entry.id)}
                            title={
                              canAdminOverride
                                ? `Delete Entry (${entry.stage_code} - Admin Authority)`
                                : entry.can_modify
                                ? `Delete Entry (${
                                    isAdmin
                                      ? 'Admin Authority'
                                      : isSuperUser
                                      ? 'Super User Authority'
                                      : 'Assigned Work Center Authorized'
                                  })`
                                : 'Locked: subsequent production logs exist for this order'
                            }
                            className="inline-flex items-center gap-1 rounded border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                          >
                            <Trash2 size={12} /> Delete
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={true}
                            title={delCheck.reason || 'Deletion restricted'}
                            className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-100/70 px-2 py-1 text-xs font-medium text-slate-400 cursor-not-allowed opacity-60"
                          >
                            <Lock size={11} /> Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default ProductionHistoryTable;
