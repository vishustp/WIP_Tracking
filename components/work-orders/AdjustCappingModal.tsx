'use client';

import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { fmt } from '@/lib/productionUtils';
import { SlidersHorizontal, ShieldCheck, RotateCcw, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface AdjustCappingModalProps {
  isOpen: boolean;
  onClose: () => void;
  workOrderId?: string | null;
  workOrderNo?: string | null;
  onSuccess?: () => void;
}

interface CappingInfo {
  work_order_id: string;
  work_order_no: string;
  customer_name?: string | null;
  specification?: string | null;
  size_od?: number | null;
  size_wt?: number | null;
  avg_length?: number | null;
  ordered_qty_pcs: number;
  ordered_qty_mtr: number;
  finished_output_pcs: number;
  finished_output_mtr: number;
  default_capping_pcs: number;
  default_capping_mtr: number;
  custom_capping_pcs?: number | null;
  custom_capping_mtr?: number | null;
  effective_capping_pcs: number;
  effective_capping_mtr: number;
  is_custom: boolean;
  master_plan_no?: string | null;
  updated_by?: string | null;
  updated_at?: string | null;
}

export default function AdjustCappingModal({
  isOpen,
  onClose,
  workOrderId,
  workOrderNo,
  onSuccess,
}: AdjustCappingModalProps) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cappingInfo, setCappingInfo] = useState<CappingInfo | null>(null);
  const [cappingPcs, setCappingPcs] = useState<string>('');
  const [cappingMtr, setCappingMtr] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  useEffect(() => {
    if (!isOpen || (!workOrderId && !workOrderNo)) return;

    let active = true;
    setLoading(true);

    const queryParam = workOrderId ? `work_order_id=${workOrderId}` : `work_order_no=${workOrderNo}`;
    fetch(`/api/work-orders/capping?${queryParam}`)
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        if (data.error) {
          toast.error(data.error);
          return;
        }
        setCappingInfo(data);
        setCappingPcs(String(data.effective_capping_pcs || data.default_capping_pcs));
        setCappingMtr(String(data.effective_capping_mtr || data.default_capping_mtr));
        setNotes('');
      })
      .catch((err) => {
        if (!active) return;
        toast.error('Failed to load capping info: ' + (err.message || 'Network error'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen, workOrderId, workOrderNo]);

  const handlePcsChange = (val: string) => {
    setCappingPcs(val);
    const num = Number(val);
    const avg = Number(cappingInfo?.avg_length || 6.0);
    if (!isNaN(num) && num > 0 && avg > 0) {
      setCappingMtr((num * avg).toFixed(2));
    } else {
      setCappingMtr('');
    }
  };

  const handleMtrChange = (val: string) => {
    setCappingMtr(val);
    const num = Number(val);
    const avg = Number(cappingInfo?.avg_length || 6.0);
    if (!isNaN(num) && num > 0 && avg > 0) {
      setCappingPcs(String(Math.round(num / avg)));
    } else {
      setCappingPcs('');
    }
  };

  const applyPercentPreset = (percent: number) => {
    if (!cappingInfo) return;
    const basePcs = cappingInfo.ordered_qty_pcs;
    const newPcs = Math.round(basePcs * (1 + percent / 100));
    handlePcsChange(String(newPcs));
  };

  const handleResetToDefault = async () => {
    if (!cappingInfo) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/work-orders/capping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          work_order_id: cappingInfo.work_order_id,
          reset_default: true,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to reset capping');

      toast.success(`Capping for WO ${cappingInfo.work_order_no} reset to default 110%`);
      onSuccess?.();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to reset capping');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cappingInfo) return;

    const pcsNum = Number(cappingPcs);
    if (isNaN(pcsNum) || pcsNum <= 0) {
      toast.error('Please enter a valid positive number of pieces.');
      return;
    }

    if (pcsNum < cappingInfo.finished_output_pcs) {
      toast.warning(
        `Warning: New capping (${pcsNum} PCS) is less than already finished production (${cappingInfo.finished_output_pcs} PCS).`
      );
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/work-orders/capping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          work_order_id: cappingInfo.work_order_id,
          capping_pcs: pcsNum,
          capping_mtr: cappingMtr ? Number(cappingMtr) : undefined,
          notes: notes.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to update capping');

      toast.success(`Finishing capping for WO ${cappingInfo.work_order_no} increased to ${pcsNum} PCS successfully!`);
      onSuccess?.();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update capping');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      title={
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
            <SlidersHorizontal size={18} />
          </div>
          <div>
            <div className="text-base font-bold text-slate-900">Adjust Finishing Capping</div>
            <div className="text-xs text-slate-500 font-normal">
              Authorize higher finishing line bundling limits against work orders (PPC Control)
            </div>
          </div>
        </div>
      }
      onClose={onClose}
    >
      {loading ? (
        <div className="py-12 text-center text-sm text-slate-500">Loading work order capping details...</div>
      ) : !cappingInfo ? (
        <div className="py-8 text-center text-sm text-rose-600">Failed to load work order capping details.</div>
      ) : (
        <form onSubmit={handleSave} className="space-y-4 pt-2">
          {/* Header Card: WO Details */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-base font-bold text-slate-900">{cappingInfo.work_order_no}</span>
                {cappingInfo.is_custom ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800 border border-amber-200">
                    <ShieldCheck size={11} /> PPC Custom Capping Active
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                    Standard 110% Capping
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-500 font-mono font-medium">
                {cappingInfo.size_od} × {cappingInfo.size_wt} mm · Avg: {fmt(cappingInfo.avg_length || 6, 'm')}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-200/80 text-xs">
              <div>
                <span className="text-slate-500 block">Customer</span>
                <span className="font-medium text-slate-800 truncate block">{cappingInfo.customer_name || '—'}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Ordered Quantity</span>
                <span className="font-mono font-bold text-slate-900 block">
                  {fmt(cappingInfo.ordered_qty_pcs)} PCS
                </span>
                <span className="font-mono text-[10px] text-slate-500">{fmt(cappingInfo.ordered_qty_mtr, 'm')}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Finished Bundled</span>
                <span className="font-mono font-bold text-emerald-700 block">
                  {fmt(cappingInfo.finished_output_pcs)} PCS
                </span>
                <span className="font-mono text-[10px] text-slate-500">{fmt(cappingInfo.finished_output_mtr, 'm')}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Default 110% Cap</span>
                <span className="font-mono font-bold text-slate-700 block">
                  {fmt(cappingInfo.default_capping_pcs)} PCS
                </span>
                <span className="font-mono text-[10px] text-slate-500">{fmt(cappingInfo.default_capping_mtr, 'm')}</span>
              </div>
            </div>
          </div>

          {/* Capping Input Section */}
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/30 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-indigo-950 flex items-center gap-1.5">
                <ShieldCheck size={16} className="text-indigo-600" /> Authorized Finishing Capping
              </label>
              <span className="text-xs font-mono text-indigo-700">
                Current: <b>{fmt(cappingInfo.effective_capping_pcs)} PCS</b>
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Capping Pieces (PCS) *
                </label>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  className="font-mono text-base font-bold text-slate-900 bg-white"
                  value={cappingPcs}
                  onChange={(e) => handlePcsChange(e.target.value)}
                  placeholder="e.g. 200"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Equivalent Meters (MTR)
                </label>
                <Input
                  type="number"
                  step="0.01"
                  className="font-mono text-base text-slate-700 bg-white"
                  value={cappingMtr}
                  onChange={(e) => handleMtrChange(e.target.value)}
                  placeholder="Auto-calculated from PCS"
                />
              </div>
            </div>

            {/* Quick Percentage Presets */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] font-semibold text-slate-500 mr-1">Quick Presets:</span>
              <button
                type="button"
                onClick={() => applyPercentPreset(10)}
                className="rounded px-2 py-0.5 text-xs font-mono font-bold bg-white border border-slate-300 text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300 transition-colors cursor-pointer"
              >
                110% ({Math.round(cappingInfo.ordered_qty_pcs * 1.10)} PCS)
              </button>
              <button
                type="button"
                onClick={() => applyPercentPreset(20)}
                className="rounded px-2 py-0.5 text-xs font-mono font-bold bg-white border border-slate-300 text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300 transition-colors cursor-pointer"
              >
                120% ({Math.round(cappingInfo.ordered_qty_pcs * 1.20)} PCS)
              </button>
              <button
                type="button"
                onClick={() => applyPercentPreset(30)}
                className="rounded px-2 py-0.5 text-xs font-mono font-bold bg-white border border-slate-300 text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300 transition-colors cursor-pointer"
              >
                130% ({Math.round(cappingInfo.ordered_qty_pcs * 1.30)} PCS)
              </button>
              <button
                type="button"
                onClick={() => applyPercentPreset(50)}
                className="rounded px-2 py-0.5 text-xs font-mono font-bold bg-white border border-slate-300 text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300 transition-colors cursor-pointer"
              >
                150% ({Math.round(cappingInfo.ordered_qty_pcs * 1.50)} PCS)
              </button>
            </div>
          </div>

          {/* Notes field */}
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              Reason / Authorization Notes (Optional)
            </label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Master order bundling for multi-WO campaign or customer tolerance approval"
              className="text-xs"
            />
          </div>

          {/* Action Footer */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-200">
            {cappingInfo.is_custom ? (
              <button
                type="button"
                onClick={handleResetToDefault}
                disabled={submitting}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer disabled:opacity-50"
              >
                <RotateCcw size={13} /> Reset to Default (110%)
              </button>
            ) : <div />}

            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold">
                {submitting ? 'Saving Capping...' : 'Authorize Capping'}
              </Button>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}
