// components/rejections/VerifyRejectionModal.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { X, ClipboardCheck, AlertTriangle, Check, XCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { RejectionDeclaration } from '@/types';
import { REJECTION_REASON_LABELS, calculateRejectionMetrics } from '@/lib/rejections/types';
import { verifyRejectionDeclaration, rejectDeclaration } from '@/lib/rejections/client';

interface VerifyRejectionModalProps {
  isOpen: boolean;
  declaration: RejectionDeclaration | null;
  onClose: () => void;
  onSuccess: () => void;
  currentUser?: any;
}

export default function VerifyRejectionModal({
  isOpen,
  declaration,
  onClose,
  onSuccess,
  currentUser,
}: VerifyRejectionModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  // Form State
  const [verifiedPcs, setVerifiedPcs] = useState<number | ''>('');
  const [verifiedMtr, setVerifiedMtr] = useState<number | ''>('');
  const [verifiedMt, setVerifiedMt] = useState<number | ''>('');
  const [qcRemarks, setQcRemarks] = useState('');

  useEffect(() => {
    if (declaration) {
      setVerifiedPcs(declaration.rejected_pcs);
      setVerifiedMtr(declaration.rejected_mtr);
      setVerifiedMt(declaration.rejected_mt);
      setQcRemarks(declaration.qc_remarks || '');
    }
  }, [declaration]);

  // Recalculate meters and MT if QC adjusts verified pieces
  const handlePcsChange = (val: string) => {
    if (val === '') {
      setVerifiedPcs('');
      setVerifiedMtr('');
      setVerifiedMt('');
      return;
    }
    const pcs = Math.max(0, parseInt(val) || 0);
    setVerifiedPcs(pcs);

    if (declaration?.work_orders) {
      const wo = declaration.work_orders;
      const avgLen = Number(wo.avg_length || (wo.l1 && wo.l2 ? (wo.l1 + wo.l2) / 2 : wo.l1) || 6.0);
      const od = Number(declaration.work_orders.size_od || 0);
      const wt = Number(declaration.work_orders.size_wt || 0);
      const { mtr, mt } = calculateRejectionMetrics(pcs, avgLen, od, wt);
      setVerifiedMtr(mtr);
      setVerifiedMt(mt);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!declaration) return;

    if (verifiedPcs === '' || Number(verifiedPcs) <= 0) {
      toast.error('Verified pieces must be greater than 0.');
      return;
    }
    if (!qcRemarks.trim()) {
      toast.error('QC Inspection Remarks and findings are mandatory.');
      return;
    }

    setSubmitting(true);
    const verifierName = currentUser?.name || currentUser?.employee_id || 'QC Inspector';

    const { error } = await verifyRejectionDeclaration({
      id: declaration.id,
      qc_verified_pcs: Number(verifiedPcs),
      qc_verified_mtr: Number(verifiedMtr || 0),
      qc_verified_mt: Number(verifiedMt || 0),
      qc_remarks: qcRemarks.trim(),
      qc_verified_by: verifierName,
      qc_verified_by_user_id: currentUser?.id || null,
    });

    setSubmitting(false);

    if (error) {
      toast.error(`Verification failed: ${error}`);
    } else {
      toast.success('QC Verification recorded! Forwarded to PPC for final approval.');
      onSuccess();
      onClose();
    }
  };

  const handleReturnToProduction = async () => {
    if (!declaration) return;
    if (!qcRemarks.trim()) {
      toast.error('Please specify why this declaration is being rejected/returned in the remarks field.');
      return;
    }

    setRejecting(true);
    const verifierName = currentUser?.name || currentUser?.employee_id || 'QC Inspector';

    const { error } = await rejectDeclaration(
      declaration.id,
      'QC',
      qcRemarks.trim(),
      verifierName,
      currentUser?.id || null
    );

    setRejecting(false);

    if (error) {
      toast.error(`Failed to reject declaration: ${error}`);
    } else {
      toast.success('Declaration rejected and returned to Production.');
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
            <div className="p-2 bg-blue-100 text-blue-800 rounded-lg">
              <ClipboardCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">QC Quality Verification</h3>
              <p className="text-xs text-slate-500">
                Declaration {declaration.declaration_no} • Inspect physical pipes and confirm rejection
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
        <form onSubmit={handleVerify} className="p-6 space-y-5">
          {/* Production Declaration Summary Card */}
          <div className="p-4 bg-amber-50/60 border border-amber-200 rounded-xl space-y-2.5 text-xs text-amber-950">
            <div className="flex items-center justify-between font-bold text-amber-900 border-b border-amber-200/70 pb-2">
              <span>Production Declaration Summary</span>
              <span className="font-mono">{declaration.declaration_no}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono">
              <div>WO #: <strong>{declaration.work_orders?.work_order_no || '—'}</strong></div>
              <div>Customer: <strong>{declaration.work_orders?.customer_name || '—'}</strong></div>
              <div>Grade: <strong>{declaration.work_orders?.grade || '—'}</strong></div>
              <div>Stage: <strong>{declaration.work_center}</strong></div>
              <div>Size: <strong>{declaration.work_orders?.size_od} × {declaration.work_orders?.size_wt} mm</strong></div>
              <div>Declared: <strong>{declaration.rejected_pcs} PCS</strong></div>
              <div>Length: <strong>{declaration.rejected_mtr} m</strong></div>
              <div>Weight: <strong>{declaration.rejected_mt} MT</strong></div>
            </div>
            <div className="pt-1 text-slate-700">
              <div className="font-semibold text-amber-900">Reason Category:</div>
              <div>{REJECTION_REASON_LABELS[declaration.reason_category] || declaration.reason_category}</div>
            </div>
            <div className="text-slate-700">
              <div className="font-semibold text-amber-900">Production Remarks:</div>
              <div className="italic bg-white/70 p-2 rounded border border-amber-200/60 mt-0.5">
                &ldquo;{declaration.production_remarks}&rdquo;
              </div>
            </div>
            <div className="flex justify-between pt-1 text-[11px] text-amber-800">
              <span>Declared by: <strong>{declaration.declared_by}</strong></span>
              <span>Date: <strong>{declaration.declared_at.slice(0, 16).replace('T', ' ')}</strong></span>
            </div>
          </div>

          {/* QC Inspection Inputs */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-700">
              QC Verified Quantities (Adjust if partially salvageable)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Verified Pieces (PCS) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={verifiedPcs}
                  onChange={(e) => handlePcsChange(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-mono text-slate-900 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Verified Length (Meters)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={verifiedMtr}
                  onChange={(e) => setVerifiedMtr(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-mono text-slate-900 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Verified Weight (MT)
                </label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  value={verifiedMt}
                  readOnly
                  className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm font-mono text-slate-700 cursor-not-allowed"
                />
              </div>
            </div>
          </div>

          {/* Mandatory QC Remarks */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
              QC Inspection Remarks & Findings <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={3}
              placeholder="Enter quality findings, defect verification details, metallurgical measurements, or reason if rejecting declaration..."
              value={qcRemarks}
              onChange={(e) => setQcRemarks(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            />
          </div>

          {/* QC Verifier Sign-off */}
          <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600">
            <span>QC Verifier: <strong>{currentUser?.name || 'QC Inspector'}</strong></span>
            <span>Department: <strong>Quality Control / QA</strong></span>
            <span>Next Stage: <strong>PPC Final Write-Off Approval</strong></span>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={handleReturnToProduction}
              disabled={submitting || rejecting}
              className="inline-flex items-center space-x-1.5 px-4 py-2 text-sm font-medium text-rose-700 bg-rose-50 border border-rose-300 rounded-lg hover:bg-rose-100 transition-colors disabled:opacity-50"
            >
              {rejecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
              <span>Reject / Return to Production</span>
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
                className="inline-flex items-center space-x-2 px-5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-lg shadow-sm transition-colors disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Verify & Forward to PPC</span>
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
