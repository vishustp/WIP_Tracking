// components/rejections/ApproveRejectionModal.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { X, ShieldCheck, AlertCircle, Check, XCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { RejectionDeclaration } from '@/types';
import { REJECTION_REASON_LABELS } from '@/lib/rejections/types';
import { approveRejectionDeclaration, rejectDeclaration } from '@/lib/rejections/client';

interface ApproveRejectionModalProps {
  isOpen: boolean;
  declaration: RejectionDeclaration | null;
  onClose: () => void;
  onSuccess: () => void;
  currentUser?: any;
}

export default function ApproveRejectionModal({
  isOpen,
  declaration,
  onClose,
  onSuccess,
  currentUser,
}: ApproveRejectionModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  // Form State
  const [approvedPcs, setApprovedPcs] = useState<number | ''>('');
  const [approvedMtr, setApprovedMtr] = useState<number | ''>('');
  const [approvedMt, setApprovedMt] = useState<number | ''>('');
  const [ppcRemarks, setPpcRemarks] = useState('');

  useEffect(() => {
    if (declaration) {
      setApprovedPcs(declaration.qc_verified_pcs ?? declaration.rejected_pcs);
      setApprovedMtr(declaration.qc_verified_mtr ?? declaration.rejected_mtr);
      setApprovedMt(declaration.qc_verified_mt ?? declaration.rejected_mt);
      setPpcRemarks(declaration.ppc_remarks || 'Approved for scrap / salvage write-off. Deduct from active WIP.');
    }
  }, [declaration]);

  const handleApprove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!declaration) return;

    if (approvedPcs === '' || Number(approvedPcs) <= 0) {
      toast.error('Approved pieces must be greater than 0.');
      return;
    }
    if (!ppcRemarks.trim()) {
      toast.error('PPC Authorization Remarks are mandatory.');
      return;
    }

    setSubmitting(true);
    const approverName = currentUser?.name || currentUser?.employee_id || 'PPC Manager';

    const { error } = await approveRejectionDeclaration({
      id: declaration.id,
      ppc_approved_pcs: Number(approvedPcs),
      ppc_approved_mtr: Number(approvedMtr || 0),
      ppc_approved_mt: Number(approvedMt || 0),
      ppc_remarks: ppcRemarks.trim(),
      ppc_approved_by: approverName,
      ppc_approved_by_user_id: currentUser?.id || null,
    });

    setSubmitting(false);

    if (error) {
      toast.error(`Approval failed: ${error}`);
    } else {
      toast.success('PPC Approval granted! Quantity deducted from Work Center WIP.');
      onSuccess();
      onClose();
    }
  };

  const handleReject = async () => {
    if (!declaration) return;
    if (!ppcRemarks.trim()) {
      toast.error('Please specify the reason for rejecting this declaration in PPC Remarks.');
      return;
    }

    setRejecting(true);
    const approverName = currentUser?.name || currentUser?.employee_id || 'PPC Manager';

    const { error } = await rejectDeclaration(
      declaration.id,
      'PPC',
      ppcRemarks.trim(),
      approverName,
      currentUser?.id || null
    );

    setRejecting(false);

    if (error) {
      toast.error(`Failed to reject declaration: ${error}`);
    } else {
      toast.success('Declaration rejected by PPC.');
      onSuccess();
      onClose();
    }
  };

  if (!isOpen || !declaration) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center space-x-2">
            <div className="p-2 bg-emerald-100 text-emerald-800 rounded-lg">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">PPC Write-Off & WIP Authorization</h3>
              <p className="text-xs text-slate-500">
                Declaration {declaration.declaration_no} • Final authorization to deduct from active WIP
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleApprove} className="p-6 space-y-5">
          {/* Dual Audit Review Card: Production & QC */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Production Declaration */}
            <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl text-xs space-y-1.5">
              <div className="font-bold text-amber-900 flex justify-between border-b border-amber-200 pb-1">
                <span>1. Production Declaration</span>
                <span className="font-mono">{declaration.rejected_pcs} PCS</span>
              </div>
              <div>WO: <strong>{declaration.work_orders?.work_order_no}</strong> ({declaration.work_center})</div>
              <div>Customer: <strong>{declaration.work_orders?.customer_name || 'N/A'}</strong></div>
              <div>Grade / Size: <strong>{declaration.work_orders?.grade || '—'}</strong> | {declaration.work_orders?.size_od} × {declaration.work_orders?.size_wt} mm</div>
              <div>Reason: <strong>{REJECTION_REASON_LABELS[declaration.reason_category] || declaration.reason_category}</strong></div>
              <div className="italic text-slate-700 bg-white/60 p-1.5 rounded border border-amber-200">
                &ldquo;{declaration.production_remarks}&rdquo;
              </div>
              <div className="text-[11px] text-amber-800">By: {declaration.declared_by} ({declaration.declared_at.slice(0, 10)})</div>
            </div>

            {/* QC Verification */}
            <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl text-xs space-y-1.5">
              <div className="font-bold text-blue-900 flex justify-between border-b border-blue-200 pb-1">
                <span>2. QC Verification</span>
                <span className="font-mono">{declaration.qc_verified_pcs ?? declaration.rejected_pcs} PCS</span>
              </div>
              <div>Verified Length: <strong>{declaration.qc_verified_mtr ?? declaration.rejected_mtr} m</strong></div>
              <div>Verified Weight: <strong>{declaration.qc_verified_mt ?? declaration.rejected_mt} MT</strong></div>
              <div className="font-semibold text-blue-900">QC Inspection Findings:</div>
              <div className="italic text-slate-700 bg-white/60 p-1.5 rounded border border-blue-200">
                &ldquo;{declaration.qc_remarks || 'Inspection confirmed'}&rdquo;
              </div>
              <div className="text-[11px] text-blue-800">
                Verified By: {declaration.qc_verified_by || 'QC Inspector'} ({declaration.qc_verified_at ? declaration.qc_verified_at.slice(0, 10) : '—'})
              </div>
            </div>
          </div>

          {/* Approved Quantities Confirmation */}
          <div className="p-4 bg-emerald-50/50 border border-emerald-200 rounded-xl space-y-3">
            <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-emerald-900">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Final PPC Authorized Quantities to Deduct</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Approved Pieces (PCS) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={approvedPcs}
                  onChange={(e) => setApprovedPcs(e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value) || 0))}
                  required
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-mono text-slate-900 focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Approved Length (Meters)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={approvedMtr}
                  onChange={(e) => setApprovedMtr(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-mono text-slate-900 focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Approved Weight (MT)
                </label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  value={approvedMt}
                  readOnly
                  className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm font-mono text-slate-700 cursor-not-allowed"
                />
              </div>
            </div>
          </div>

          {/* Mandatory PPC Remarks */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
              PPC Authorization Remarks / Disposition <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={2}
              placeholder="Enter management authorization remarks, scrap order reference, or rejection reason if turning down..."
              value={ppcRemarks}
              onChange={(e) => setPpcRemarks(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
            />
          </div>

          {/* Ledger Effect Warning */}
          <div className="flex items-start space-x-2.5 p-3 bg-amber-50 border border-amber-300 rounded-lg text-xs text-amber-900">
            <AlertCircle className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
            <div>
              <strong>WIP Ledger Impact:</strong> Confirming this authorization will deduct{' '}
              <span className="font-mono font-bold">{approvedPcs || 0} PCS</span> ({approvedMtr || 0}m · {approvedMt || 0} MT) from{' '}
              <strong>{declaration.work_center}</strong> active WIP balance.
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={handleReject}
              disabled={submitting || rejecting}
              className="inline-flex items-center space-x-1.5 px-4 py-2 text-sm font-medium text-rose-700 bg-rose-50 border border-rose-300 rounded-lg hover:bg-rose-100 transition-colors disabled:opacity-50"
            >
              {rejecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
              <span>Reject Declaration</span>
            </button>

            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting || rejecting}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || rejecting}
                className="inline-flex items-center space-x-2 px-5 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-lg shadow-sm transition-colors disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Deducting WIP...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Authorize & Deduct from WIP</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
