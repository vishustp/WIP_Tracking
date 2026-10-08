// components/rejections/DeclareRejectionModal.tsx
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { X, AlertTriangle, Calculator, Check, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import {
  REJECTION_REASON_CATEGORIES,
  REJECTION_REASON_LABELS,
  WORK_CENTER_OPTIONS,
  calculateRejectionMetrics,
} from '@/lib/rejections/types';
import { createRejectionDeclaration } from '@/lib/rejections/client';
import { RejectionReasonCategory, StageCode } from '@/types';

interface DeclareRejectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  currentUser?: any;
  defaultWorkCenter?: string;
  preselectedWorkOrderId?: string;
}

interface WorkOrderOption {
  id: string;
  work_order_no: string;
  customer_name: string | null;
  grade: string | null;
  size_od: number | null;
  size_wt: number | null;
  avg_length: number | null;
  l1: number | null;
  l2: number | null;
}

export default function DeclareRejectionModal({
  isOpen,
  onClose,
  onSuccess,
  currentUser,
  defaultWorkCenter,
  preselectedWorkOrderId,
}: DeclareRejectionModalProps) {
  const [workOrders, setWorkOrders] = useState<WorkOrderOption[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [selectedWoId, setSelectedWoId] = useState(preselectedWorkOrderId || '');
  const [workCenter, setWorkCenter] = useState<string>(defaultWorkCenter || 'DRAW');
  const [rejectedPcs, setRejectedPcs] = useState<number | ''>('');
  const [rejectedMtr, setRejectedMtr] = useState<number | ''>('');
  const [rejectedMt, setRejectedMt] = useState<number | ''>('');
  const [manualMtrOverride, setManualMtrOverride] = useState(false);
  const [heatLotNo, setHeatLotNo] = useState('');
  const [reasonCategory, setReasonCategory] = useState<RejectionReasonCategory>('SMALL_QTY_NO_REPROCESS');
  const [productionRemarks, setProductionRemarks] = useState('');

  // Fetch active work orders for picker
  useEffect(() => {
    if (!isOpen) return;
    async function loadOrders() {
      setLoadingOrders(true);
      const supabase = createClient();
      const { data, error } = await supabase
        .from('work_orders')
        .select('id, work_order_no, customer_name, grade, size_od, size_wt, l1, l2')
        .order('work_order_no', { ascending: true });

      if (!error && data) {
        const mapped: WorkOrderOption[] = data.map((wo: any) => ({
          ...wo,
          avg_length: wo.l1 && wo.l2 ? (Number(wo.l1) + Number(wo.l2)) / 2 : Number(wo.l1 || 6.0),
        }));
        setWorkOrders(mapped);
      }
      setLoadingOrders(false);
    }
    loadOrders();
  }, [isOpen]);

  useEffect(() => {
    if (preselectedWorkOrderId) {
      setSelectedWoId(preselectedWorkOrderId);
    }
  }, [preselectedWorkOrderId]);

  useEffect(() => {
    if (defaultWorkCenter && defaultWorkCenter !== 'ALL') {
      setWorkCenter(defaultWorkCenter);
    }
  }, [defaultWorkCenter]);

  // Selected work order details
  const selectedWo = useMemo(() => {
    return workOrders.find((w) => w.id === selectedWoId) || null;
  }, [workOrders, selectedWoId]);

  const effectiveAvgLen = useMemo(() => {
    if (!selectedWo) return 6.0;
    return Number(selectedWo.avg_length || selectedWo.l1 || 6.0);
  }, [selectedWo]);

  // Auto-calculate meters and MT when pieces or work order change
  useEffect(() => {
    if (manualMtrOverride) return;
    if (!selectedWo || rejectedPcs === '' || Number(rejectedPcs) <= 0) {
      setRejectedMtr('');
      setRejectedMt('');
      return;
    }

    const pcs = Number(rejectedPcs);
    const od = Number(selectedWo.size_od || 0);
    const wt = Number(selectedWo.size_wt || 0);
    const { mtr, mt } = calculateRejectionMetrics(pcs, effectiveAvgLen, od, wt);

    setRejectedMtr(mtr);
    setRejectedMt(mt);
  }, [rejectedPcs, selectedWo, effectiveAvgLen, manualMtrOverride]);

  // When meters are manually modified, recalculate MT
  const handleMtrChange = (val: string) => {
    setManualMtrOverride(true);
    if (val === '') {
      setRejectedMtr('');
      setRejectedMt('');
      return;
    }
    const m = Number(val);
    setRejectedMtr(m);
    if (selectedWo && selectedWo.size_od && selectedWo.size_wt) {
      const factor = (Number(selectedWo.size_od) - Number(selectedWo.size_wt)) * Number(selectedWo.size_wt) * 0.0246615 * 0.001;
      setRejectedMt(Number((m * factor).toFixed(3)));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWoId) {
      toast.error('Please select a Work Order.');
      return;
    }
    if (!workCenter) {
      toast.error('Please select a Work Center.');
      return;
    }
    if (rejectedPcs === '' || Number(rejectedPcs) <= 0) {
      toast.error('Please enter a valid Rejected Pieces quantity (> 0).');
      return;
    }
    if (!productionRemarks.trim()) {
      toast.error('Production Remarks explaining the rejection reason are mandatory.');
      return;
    }

    setSubmitting(true);
    const declaredBy = currentUser?.name || currentUser?.employee_id || 'Production Operator';

    const { error } = await createRejectionDeclaration({
      work_order_id: selectedWoId,
      work_center: workCenter,
      rejected_pcs: Number(rejectedPcs),
      rejected_mtr: Number(rejectedMtr || 0),
      rejected_mt: Number(rejectedMt || 0),
      heat_lot_no: heatLotNo.trim() || null,
      reason_category: reasonCategory,
      production_remarks: productionRemarks.trim(),
      declared_by: declaredBy,
      declared_by_user_id: currentUser?.id || null,
    });

    setSubmitting(false);

    if (error) {
      toast.error(`Failed to submit rejection declaration: ${error}`);
    } else {
      toast.success('Rejection declared successfully! Forwarded to QC for verification.');
      // Reset form
      setRejectedPcs('');
      setRejectedMtr('');
      setRejectedMt('');
      setProductionRemarks('');
      setHeatLotNo('');
      setManualMtrOverride(false);
      onSuccess();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center space-x-2">
            <div className="p-2 bg-amber-100 text-amber-800 rounded-lg">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Declare Material as Second / Salvage</h3>
              <p className="text-xs text-slate-500">
                Log second or salvage material from any work center for QC verification and PPC write-off
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

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Work Order Selection */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
              Work Order <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedWoId}
              onChange={(e) => setSelectedWoId(e.target.value)}
              disabled={loadingOrders || !!preselectedWorkOrderId}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            >
              <option value="">-- Select Work Order --</option>
              {workOrders.map((wo) => (
                <option key={wo.id} value={wo.id}>
                  {wo.work_order_no} — {wo.customer_name || 'N/A'} ({wo.grade || '—'}) | {wo.size_od} x {wo.size_wt} mm
                </option>
              ))}
            </select>
            {selectedWo && (
              <div className="mt-2 p-2.5 bg-blue-50/70 border border-blue-200 rounded-lg flex items-center justify-between text-xs text-blue-900 font-mono">
                <span>Customer: <strong>{selectedWo.customer_name || 'N/A'}</strong></span>
                <span>Grade: <strong>{selectedWo.grade || '—'}</strong></span>
                <span>Size: <strong>{selectedWo.size_od} × {selectedWo.size_wt} mm</strong></span>
                <span>Avg Len: <strong>{effectiveAvgLen}m</strong></span>
              </div>
            )}
          </div>

          {/* Work Center & Defect Category */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                Work Center (Stage) <span className="text-red-500">*</span>
              </label>
              <select
                value={workCenter}
                onChange={(e) => setWorkCenter(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {WORK_CENTER_OPTIONS.filter((o) => o.code !== 'ALL').map((wc) => (
                  <option key={wc.code} value={wc.code}>
                    {wc.label} ({wc.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                Defect Category <span className="text-red-500">*</span>
              </label>
              <select
                value={reasonCategory}
                onChange={(e) => setReasonCategory(e.target.value as RejectionReasonCategory)}
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {REJECTION_REASON_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {REJECTION_REASON_LABELS[cat]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Quantities: Pieces, Meters, MT */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center space-x-1.5">
                <Calculator className="w-3.5 h-3.5 text-slate-500" />
                <span>Rejected Quantity Dimensions</span>
              </span>
              {manualMtrOverride && (
                <button
                  type="button"
                  onClick={() => setManualMtrOverride(false)}
                  className="text-xs text-blue-600 hover:text-blue-800 underline"
                >
                  Reset Auto-Calculate
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Rejected Pieces (PCS) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  placeholder="e.g. 3"
                  value={rejectedPcs}
                  onChange={(e) => setRejectedPcs(e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value) || 0))}
                  required
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-mono text-slate-900 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Length (Meters)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="Auto-calculated"
                  value={rejectedMtr}
                  onChange={(e) => handleMtrChange(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-mono text-slate-900 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Weight (MT)
                </label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  placeholder="Auto-calculated"
                  value={rejectedMt}
                  readOnly
                  className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm font-mono text-slate-700 cursor-not-allowed"
                />
              </div>
            </div>

            <div className="pt-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Heat / Lot # (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. HT-8421 / LOT-B3"
                value={heatLotNo}
                onChange={(e) => setHeatLotNo(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-mono text-slate-900 focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Mandatory Production Remarks */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
              Production Remarks / Explanation <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={3}
              placeholder="Explain why this material was rejected and why it cannot be re-processed (e.g. 3 Nos rejected during cold drawing due to heavy tool marks; batch completed, unviable to setup bench for 3 pipes)..."
              value={productionRemarks}
              onChange={(e) => setProductionRemarks(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            />
          </div>

          {/* Operator Sign-off info */}
          <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600">
            <span>Declaring Operator: <strong>{currentUser?.name || 'Production Operator'}</strong></span>
            <span>Department: <strong>Production</strong></span>
            <span>Next Step: <strong>QC Physical Verification</strong></span>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2.5 text-sm font-medium text-slate-700 hover:text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center space-x-2 px-5 py-2.5 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 active:bg-amber-800 rounded-lg shadow-sm transition-colors disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Submitting...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Submit to QC Verification</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
