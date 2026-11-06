'use client';

import { useState } from 'react';
import { Lock, AlertCircle, CheckCircle2, Crown, Layers, Info, RefreshCw } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import { Row } from '@/types';
import { fmt, n } from '@/lib/productionUtils';
import { toast } from 'sonner';

export interface CloseRollingModalProps {
  row: Row;
  onClose: () => void;
  onSuccess: () => void;
}

const PRESET_REASONS = [
  'Batch / Lot Completed',
  'Shift Completed - Balance Short-Closed',
  'Target Quantity / Tonnage Reached',
  'Work Order Requirements Fulfilled',
  'Tooling / Mill Changeover - Ending Run',
  'Other',
];

export function CloseRollingModal({ row, onClose, onSuccess }: CloseRollingModalProps) {
  const planNo = row.master_plan_no || row.plan_no || 'N/A';
  const avgLen = Number(row.mh_avg_length || row.avg_length || 6.0);
  const plannedPcs = Math.round(Number(row.planned_pcs || row.campaign_total_pcs || 0));
  const plannedMtr = Number(Number(row.campaign_total_mtr || (plannedPcs * avgLen)).toFixed(2));
  const loggedRolledPcs = Math.round(Number(row.rolled_pcs || 0));

  const [actualPcsInput, setActualPcsInput] = useState<string>(String(loggedRolledPcs));
  const [selectedReason, setSelectedReason] = useState<string>(PRESET_REASONS[0]);
  const [customReason, setCustomReason] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);

  const actPcs = Math.max(0, parseInt(actualPcsInput, 10) || 0);
  const actMtr = Number((actPcs * (avgLen > 0 ? avgLen : 6.0)).toFixed(2));
  const unrolledPcs = Math.max(0, plannedPcs - actPcs);
  const unrolledMtr = Math.max(0, Number((plannedMtr - actMtr).toFixed(2)));

  async function handleConfirmClose() {
    if (!row.plan_id) {
      toast.error('No rolling plan ID found for this row.');
      return;
    }

    if (actPcs < 0) {
      toast.error('Actual rolled pieces must be zero or a positive integer.');
      return;
    }

    const finalReason = selectedReason === 'Other' ? (customReason.trim() || 'Short-closed for partial quantity') : selectedReason;

    setBusy(true);
    try {
      const res = await fetch('/api/rolling-plans', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan_id: row.plan_id,
          lifecycle_action: 'CLOSE_PARTIAL',
          actual_pcs: actPcs,
          close_reason: finalReason,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to close rolling plan.');
      }

      toast.success(data.message || `Rolling Plan ${planNo} successfully closed.`);
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to close rolling plan.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={
        <div className="flex items-center gap-2.5">
          <div className="rounded-full bg-amber-100 dark:bg-amber-950/70 p-2 text-amber-700 dark:text-amber-400">
            <Lock size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Close Rolling Plan
              </h3>
              <span className="inline-flex items-center gap-0.5 rounded bg-sky-100 dark:bg-sky-950/80 text-sky-800 dark:text-sky-300 border border-sky-200 dark:border-sky-800 px-2 py-0.5 text-xs font-bold uppercase">
                PLAN: {planNo}
              </span>
              {row.is_master && (
                <span className="inline-flex items-center gap-1 rounded bg-indigo-100 dark:bg-indigo-950/80 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 px-1.5 py-0.5 text-xs font-bold">
                  <Crown size={11} /> MASTER
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
              Work Order: <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{row.work_order_no}</span>
              {row.customer_name ? ` • ${row.customer_name}` : ''}
            </p>
          </div>
        </div>
      }
      onClose={onClose}
      maxWidth="lg"
    >
      <div className="p-5 space-y-4 text-xs">
        {/* Specification & Size Info Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 p-3">
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">
              Mother Hollow
            </div>
            <div className="font-mono font-bold text-slate-900 dark:text-slate-100 mt-0.5">
              {row.mh_od || row.od || '-'} × {row.mh_wt || row.wl || '-'} mm
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">
              Avg Length
            </div>
            <div className="font-mono font-bold text-slate-900 dark:text-slate-100 mt-0.5">
              {avgLen.toFixed(2)} m
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">
              Grade
            </div>
            <div className="font-mono font-bold text-slate-900 dark:text-slate-100 mt-0.5 truncate">
              {row.grade || '-'}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">
              Specification
            </div>
            <div className="font-mono font-bold text-slate-900 dark:text-slate-100 mt-0.5 truncate">
              {row.specification || '-'}
            </div>
          </div>
        </div>

        {/* Quantities Comparison Grid */}
        <div className="grid grid-cols-3 gap-2.5">
          {/* Planned */}
          <div className="rounded-xl border border-sky-200 dark:border-sky-800/60 bg-sky-50/60 dark:bg-sky-950/30 p-3">
            <div className="flex items-center gap-1 text-[11px] font-bold text-sky-800 dark:text-sky-300">
              <Layers size={13} />
              <span>PPC Planned</span>
            </div>
            <div className="mt-2 space-y-0.5">
              <div className="text-base font-extrabold font-mono tabular-nums text-sky-950 dark:text-sky-100">
                {fmt(plannedPcs)} <span className="text-[10px] font-bold text-sky-700 dark:text-sky-400">PCS</span>
              </div>
              <div className="text-xs font-mono tabular-nums text-sky-800 dark:text-sky-300">
                {fmt(plannedMtr)} m
              </div>
            </div>
          </div>

          {/* Already Rolled / Final Actual */}
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/60 dark:bg-emerald-950/30 p-3">
            <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-800 dark:text-emerald-300">
              <CheckCircle2 size={13} />
              <span>Rolled Output</span>
            </div>
            <div className="mt-2 space-y-0.5">
              <div className="text-base font-extrabold font-mono tabular-nums text-emerald-950 dark:text-emerald-100">
                {fmt(actPcs)} <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400">PCS</span>
              </div>
              <div className="text-xs font-mono tabular-nums text-emerald-800 dark:text-emerald-300">
                {fmt(actMtr)} m
              </div>
            </div>
          </div>

          {/* Unrolled Balance Released */}
          <div className="rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50/60 dark:bg-amber-950/30 p-3">
            <div className="flex items-center gap-1 text-[11px] font-bold text-amber-800 dark:text-amber-300">
              <AlertCircle size={13} />
              <span>Unrolled Balance</span>
            </div>
            <div className="mt-2 space-y-0.5">
              <div className="text-base font-extrabold font-mono tabular-nums text-amber-950 dark:text-amber-100">
                {fmt(unrolledPcs)} <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400">PCS</span>
              </div>
              <div className="text-xs font-mono tabular-nums text-amber-800 dark:text-amber-300">
                {fmt(unrolledMtr)} m
              </div>
            </div>
          </div>
        </div>

        {/* Input: Final Actual Rolled Pieces (Pre-filled with logged production) */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 space-y-3">
          <div>
            <label
              htmlFor="actual-rolled-pcs-input"
              className="block font-bold text-slate-800 dark:text-slate-200 mb-1"
            >
              Confirmed Actual Rolled Pieces (PCS)
            </label>
            <div className="flex items-center gap-2">
              <input
                id="actual-rolled-pcs-input"
                type="number"
                min="0"
                max={Math.round(plannedPcs * 1.04)}
                value={actualPcsInput}
                onChange={(e) => setActualPcsInput(e.target.value)}
                className="w-36 h-9 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm font-mono font-bold text-slate-900 dark:text-slate-100 focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
              />
              <span className="text-xs text-slate-500 dark:text-slate-400">
                (Pre-filled from logged Hot Rolling production: <strong className="text-slate-700 dark:text-slate-300 font-mono">{loggedRolledPcs} PCS</strong>)
              </span>
            </div>
          </div>

          {/* Reason Selection */}
          <div>
            <label
              htmlFor="close-reason-select"
              className="block font-bold text-slate-800 dark:text-slate-200 mb-1"
            >
              Closing Reason / Remarks
            </label>
            <select
              id="close-reason-select"
              value={selectedReason}
              onChange={(e) => setSelectedReason(e.target.value)}
              className="w-full h-9 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-xs font-medium text-slate-900 dark:text-slate-100 focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
            >
              {PRESET_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            {selectedReason === 'Other' && (
              <input
                type="text"
                placeholder="Specify reason for closing..."
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                className="mt-2 w-full h-9 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-xs font-medium text-slate-900 dark:text-slate-100 focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
              />
            )}
          </div>
        </div>

        {/* Operational Impact Notice */}
        <div className="rounded-xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/80 p-3 space-y-1.5">
          <div className="flex items-center gap-1.5 text-amber-900 dark:text-amber-200 font-bold">
            <Info size={14} className="text-amber-600 dark:text-amber-400 shrink-0" />
            <span>Operational & Inventory Effects:</span>
          </div>
          <ul className="list-disc list-inside text-amber-800 dark:text-amber-300 space-y-0.5 pl-1 leading-relaxed">
            <li>
              This rolling plan will be marked as <strong className="font-semibold">CLOSED</strong> and removed immediately from the Hot Rolling console queue.
            </li>
            {unrolledPcs > 0 ? (
              <li>
                The remaining unrolled balance of <strong className="font-mono font-bold text-amber-950 dark:text-amber-100">{fmt(unrolledPcs)} PCS ({fmt(unrolledMtr)} m)</strong> will be released back to Work Order <strong className="font-mono font-bold">{row.work_order_no}</strong> as <em className="font-semibold">Pending Plan</em> for PPC.
              </li>
            ) : (
              <li>
                Work Order planned quantity is fully matched. No unrolled balance released.
              </li>
            )}
            {row.is_master && (
              <li>
                Associated child work order allocations in this master campaign will be closed concurrently.
              </li>
            )}
          </ul>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end items-center gap-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={onClose}
            className="px-4 text-xs font-semibold"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={busy}
            onClick={handleConfirmClose}
            className="bg-amber-600 hover:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-700 text-white font-bold px-4 text-xs shadow-2xs inline-flex items-center gap-1.5"
          >
            {busy ? (
              <>
                <RefreshCw size={13} className="animate-spin motion-reduce:animate-none" />
                <span>Closing Plan...</span>
              </>
            ) : (
              <>
                <Lock size={13} />
                <span>Confirm & Close Rolling Plan</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default CloseRollingModal;
