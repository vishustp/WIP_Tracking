'use client';

import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Search, Link2, X, Plus, Info } from 'lucide-react';
import type { WorkOrderGroup } from '@/lib/rolling-plans/planReducer';

export interface AddChildOrderModalProps {
  targetGroup: WorkOrderGroup | null;
  targetGroupIndex: number;
  wos: any[];
  woPlanHistoryMap: Map<string, any>;
  availableGrades: string[];
  existingWoIds: Set<string>;
  onClose: () => void;
  onAddChild: (groupId: string, childWo: any) => void;
}

const fmt = (n: number | string | null | undefined, digits = 2) => {
  if (n == null || n === '') return '—';
  const num = Number(n);
  return isNaN(num) ? String(n) : num.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
};

export default function AddChildOrderModal({
  targetGroup,
  targetGroupIndex,
  wos,
  woPlanHistoryMap,
  availableGrades,
  existingWoIds,
  onClose,
  onAddChild,
}: AddChildOrderModalProps) {
  const [childModalSearch, setChildModalSearch] = useState('');
  const [childModalGradeFilter, setChildModalGradeFilter] = useState('ALL');

  const filteredWos = useMemo(() => {
    if (!targetGroup) return [];
    return wos.filter((w) => {
      if (existingWoIds.has(w.id)) return false;
      if (childModalGradeFilter !== 'ALL' && w.grade !== childModalGradeFilter) return false;

      if (!childModalSearch.trim()) return true;
      const q = childModalSearch.toLowerCase();
      const planHist = woPlanHistoryMap.get(w.id);
      const matchesPlanNo = planHist?.displayPlanNosStr ? planHist.displayPlanNosStr.toLowerCase().includes(q) : false;

      return (
        w.work_order_no?.toLowerCase().includes(q) ||
        w.customer_name?.toLowerCase().includes(q) ||
        w.grade?.toLowerCase().includes(q) ||
        String(w.size_od).includes(q) ||
        String(w.size_wt).includes(q) ||
        matchesPlanNo
      );
    });
  }, [wos, existingWoIds, childModalGradeFilter, childModalSearch, woPlanHistoryMap, targetGroup]);

  if (!targetGroup) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-4xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Link2 className="h-5 w-5 text-emerald-600" />
            <h3 className="text-base font-bold text-slate-900">
              Add Child Work Order to Setup #{targetGroupIndex + 1}
            </h3>
            <span className="rounded-full bg-emerald-50 text-emerald-700 px-2.5 py-0.5 text-xs font-bold border border-emerald-200">
              Parent WO: {targetGroup.wo.work_order_no} ({targetGroup.wo.size_od}×{targetGroup.wo.size_wt}mm)
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Filters Bar */}
        <div className="my-3 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by WO No, customer, size, grade, old plan no..."
              value={childModalSearch}
              onChange={(e) => setChildModalSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-300 py-1.5 pl-9 pr-3 text-xs focus:border-emerald-500 focus:outline-hidden"
            />
          </div>
          <select
            value={childModalGradeFilter}
            onChange={(e) => setChildModalGradeFilter(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium cursor-pointer"
          >
            <option value="ALL">All Grades</option>
            {availableGrades.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>

        {/* Work Orders Table */}
        <div className="flex-1 overflow-y-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-slate-100 text-slate-700 font-bold border-b border-slate-200 shadow-2xs">
              <tr>
                <th className="px-3 py-2.5">Work Order</th>
                <th className="px-3 py-2.5">Customer</th>
                <th className="px-3 py-2.5">Grade</th>
                <th className="px-3 py-2.5">Size (OD × WT)</th>
                <th className="px-3 py-2.5">Length</th>
                <th className="px-3 py-2.5 text-right">Available Balance</th>
                <th className="px-3 py-2.5 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredWos.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    No eligible work orders available to add as child.
                  </td>
                </tr>
              ) : (
                filteredWos.map((w) => {
                  const hist = woPlanHistoryMap.get(w.id);

                  return (
                    <tr key={w.id} className="hover:bg-emerald-50/40 transition">
                      <td className="px-3 py-2">
                        <div className="font-mono font-bold text-slate-900">{w.work_order_no}</div>
                        {hist?.isFullQtyPlanned ? (
                          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                            <span className="inline-flex items-center gap-1 rounded bg-amber-100 border border-amber-300 px-1.5 py-0.5 text-[10px] font-bold text-amber-900 shadow-2xs">
                              <Info className="h-3 w-3 text-amber-700 shrink-0" />
                              <span>Old Plan: <strong>{hist.displayPlanNosStr}</strong></span>
                              <span className="bg-amber-200/80 px-1 py-0.2 rounded text-[9px] text-amber-800 uppercase tracking-tight">Full Qty Issued</span>
                            </span>
                          </div>
                        ) : hist?.isPartialQtyPlanned ? (
                          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                            <span className="inline-flex items-center gap-1 rounded bg-blue-50 border border-blue-200 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800">
                              <span>Old Plan: <strong>{hist.displayPlanNosStr}</strong></span>
                              <span className="text-blue-600 font-mono">({fmt(hist.totalPlannedMtr)} MTR)</span>
                            </span>
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-slate-700">{w.customer_name || 'Standard Stock'}</td>
                      <td className="px-3 py-2 font-mono text-slate-600">{w.grade}</td>
                      <td className="px-3 py-2 font-mono font-semibold">
                        {w.size_od} × {w.size_wt} mm
                      </td>
                      <td className="px-3 py-2 font-mono text-slate-500">
                        {w.l1 && w.l2 ? `${w.l1}–${w.l2} m` : w.l1 || w.l2 ? `${w.l1 || w.l2} m` : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-slate-900">
                        {fmt(w.balance_qty_mtr)} MTR
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Button
                          type="button"
                          onClick={() => onAddChild(targetGroup.id, w)}
                          className="h-7 px-2.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-md cursor-pointer inline-flex items-center gap-1 shadow-2xs"
                        >
                          <Plus className="h-3 w-3" />
                          Add as Child
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Modal Footer Actions */}
        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
          <div className="text-xs text-slate-500">
            Current children in this setup:{' '}
            <span className="font-bold text-emerald-700">{targetGroup.children.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={onClose}
              className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold px-4 py-1.5 rounded-lg cursor-pointer"
            >
              Done Adding Children
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
