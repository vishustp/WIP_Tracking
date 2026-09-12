'use client';

import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import { Trash2, ShieldAlert } from 'lucide-react';
import { ProductionEntry } from '@/types';

export interface DeleteEntryModalProps {
  targetEntry: ProductionEntry;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  delCheck: { allowed: boolean; reason?: string };
  isAdmin: boolean;
  isSuperUser: boolean;
  workCenter?: string;
  busy: boolean;
}

export function DeleteEntryModal({
  targetEntry,
  onClose,
  onConfirm,
  delCheck,
  isAdmin,
  isSuperUser,
  workCenter,
  busy,
}: DeleteEntryModalProps) {
  return (
    <Modal
      title={
        <div className="flex items-center gap-2.5">
          <div
            className={`rounded-full p-2 ${
              delCheck.allowed ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'
            }`}
          >
            {delCheck.allowed ? <Trash2 size={16} /> : <ShieldAlert size={16} />}
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900">
              {delCheck.allowed ? 'Delete Production Entry' : 'Permission Restricted'}
            </h3>
          </div>
        </div>
      }
      onClose={onClose}
      maxWidth="md"
    >
      <div className="p-5 space-y-4 text-xs">
        <p className="text-slate-600 leading-relaxed">
          {delCheck.allowed
            ? `Are you sure you want to delete this ${targetEntry.stage_code} entry (${targetEntry.work_order_no})? WIP balances will be recalculated immediately.`
            : delCheck.reason || 'Unauthorized to delete this record.'}
        </p>

        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 space-y-1.5 font-sans">
          <div className="flex justify-between text-slate-600">
            <span>Work Order:</span>
            <span className="font-mono font-bold text-slate-900">{targetEntry.work_order_no}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>Work Center / Stage:</span>
            <span className="font-semibold text-slate-800">{targetEntry.stage_code}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>Output Quantity:</span>
            <span className="font-mono font-bold text-slate-900">
              {targetEntry.output_mtr} MTR ({targetEntry.output_pcs || 0} PCS)
            </span>
          </div>
          <div className="flex justify-between text-slate-600 border-t border-slate-200/60 pt-1.5">
            <span>Authorization:</span>
            <span className="font-semibold text-emerald-700">
              {isAdmin
                ? 'Admin Group (Global Deletion)'
                : isSuperUser
                ? 'Super User Group (Global Deletion)'
                : `User Group (${workCenter || 'Assigned Work Center'})`}
            </span>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onClose}>
            {delCheck.allowed ? 'Cancel' : 'Close'}
          </Button>
          {delCheck.allowed && (
            <Button
              type="button"
              variant="danger"
              size="sm"
              disabled={busy}
              onClick={onConfirm}
            >
              {busy ? 'Deleting...' : 'Confirm Delete'}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

export default DeleteEntryModal;
