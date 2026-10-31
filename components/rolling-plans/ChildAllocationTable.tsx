'use client';

import React from 'react';
import { Link2, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import type { WorkOrderGroup, ChildOrderEntry } from '@/lib/rolling-plans/planReducer';

export interface ChildAllocationTableProps {
  group: WorkOrderGroup;
  woPlanHistoryMap: Map<string, any>;
  parentPcs: number;
  parentMtr: number;
  onRemoveChild: (groupId: string, childId: string) => void;
}

const fmt = (n: number | string | null | undefined, digits = 2) => {
  if (n == null || n === '') return '—';
  const num = Number(n);
  return isNaN(num) ? String(n) : num.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
};

export default function ChildAllocationTable({
  group,
  woPlanHistoryMap,
  parentPcs,
  parentMtr,
  onRemoveChild,
}: ChildAllocationTableProps) {
  if (group.children.length === 0) return null;

  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center gap-2 text-xs">
        <span className="font-bold text-slate-700">
          Child Work Orders under {group.wo.work_order_no}:
        </span>
        <span className="text-slate-500 font-medium">
          Linked to parent setup specifications
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-emerald-200 bg-white">
        <table className="w-full text-left text-xs">
          <thead className="bg-emerald-50/70 text-slate-700 border-b border-emerald-200">
            <tr>
              <th className="px-3 py-1.5 font-bold">Role</th>
              <th className="px-3 py-1.5 font-bold">Child Work Order</th>
              <th className="px-3 py-1.5 font-bold">Customer & Grade</th>
              <th className="px-3 py-1.5 font-bold">Size (OD × WT)</th>
              <th className="px-3 py-1.5 font-bold">Length</th>
              <th className="px-3 py-1.5 font-bold text-right">Available Balance</th>
              <th className="px-3 py-1.5 font-bold text-center" colSpan={3}>Rolling Plan Allocation</th>
              <th className="px-3 py-1.5 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-emerald-100">
            {group.children.map((child: ChildOrderEntry) => {
              const childHist = woPlanHistoryMap.get(child.wo.id);

              return (
                <tr key={child.id} className="hover:bg-emerald-50/30">
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 border border-emerald-300 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                      <Link2 className="h-3 w-3" />
                      Child Order
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="font-mono font-bold text-slate-900">
                      {child.wo.work_order_no}
                    </div>
                    {childHist?.isFullQtyPlanned ? (
                      <div className="mt-0.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 border border-amber-300 text-[10px] font-bold text-amber-900">
                        <AlertTriangle className="h-3 w-3 text-amber-700 shrink-0" />
                        <span>Old Plan: {childHist.displayPlanNosStr} (Full Qty Issued)</span>
                      </div>
                    ) : childHist?.isPartialQtyPlanned ? (
                      <div className="mt-0.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 border border-blue-200 text-[10px] font-semibold text-blue-800">
                        <span>Old Plan: {childHist.displayPlanNosStr} ({fmt(childHist.totalPlannedMtr)} m)</span>
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 max-w-[180px] truncate text-slate-600">
                    <span className="font-semibold text-slate-800">
                      {child.wo.customer_name || 'Standard Stock'}
                    </span>
                    <div className="text-[11px] text-slate-500">{child.wo.grade}</div>
                  </td>
                  <td className="px-3 py-2 font-mono whitespace-nowrap">
                    {child.wo.size_od} × {child.wo.size_wt} mm
                  </td>
                  <td className="px-3 py-2 font-mono whitespace-nowrap text-slate-500">
                    <div>{child.wo.l1}–{child.wo.l2} m (WO)</div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono whitespace-nowrap text-slate-600">
                    <span className="font-bold text-slate-700">
                      {fmt(child.availableMtr)}
                    </span>{' '}
                    MTR
                  </td>
                  <td className="px-3 py-2 text-center" colSpan={3}>
                    <div className="inline-flex items-center gap-1.5 rounded-md bg-teal-50 border border-teal-200 px-2.5 py-1 text-xs font-semibold text-teal-800">
                      <CheckCircle2 className="h-3.5 w-3.5 text-teal-600 shrink-0" />
                      <span>Uses Master Plan&apos;s Rolling Qty (<strong className="font-mono">{fmt(parentPcs)} PCS</strong> · <strong className="font-mono">{fmt(parentMtr)} m</strong>)</span>
                      <span className="text-[10px] text-teal-600/80 font-normal">(Not issued separately)</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => onRemoveChild(group.id, child.id)}
                      className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer transition"
                      title="Remove child order from setup"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
