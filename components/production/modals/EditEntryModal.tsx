'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { STAGES, ProductionEntry } from '@/types';
import { n, mtrFromPcs, extractPcsFromRemarks } from '@/lib/productionUtils';

export interface EditEntryModalProps {
  editing: ProductionEntry;
  onClose: () => void;
  onSave: (payload: {
    editDate: string;
    editMtr: number;
    editPcs: string;
    editRejectionMtr: number;
    editRejectionPcs: string;
    editHtcMtr: number;
    editHtcPcs: string;
    editHeatLot: string;
    editRemarks: string;
    editL1?: string;
    editL2?: string;
  }) => Promise<void>;
  avgLength: number;
}

export function EditEntryModal({
  editing,
  onClose,
  onSave,
  avgLength,
}: EditEntryModalProps) {
  const isMhStage = editing.stage_code === 'ROLLING' || editing.stage_code === 'HOLLOW_HEAT_TREATMENT';
  const isDrawOrHt = editing.stage_code === 'DRAW' || editing.stage_code === 'HEAT_TREATMENT';
  const hasL1L2 = editing.stage_code === 'DRAW' || editing.stage_code === 'HEAT_TREATMENT' || editing.stage_code === 'BAND_SAW' || editing.stage_code === 'VDI' || editing.stage_code === 'FINISHING';
  const { pcs: parsedPcs, rejPcs: parsedRejPcs, cleanRemarks } = extractPcsFromRemarks(editing.remarks);

  const l1Match = (editing.remarks || '').match(/\[L1:([0-9.]+)\]/i);
  const l2Match = (editing.remarks || '').match(/\[L2:([0-9.]+)\]/i);

  // For stages without L1/L2 (ROLLING, HOLLOW_HT), L1 and L2 are NOT operator adjustable and must not override MH length.
  // For DRAW and HEAT_TREATMENT, default to elongated mother pipe length (avgLength) if not explicitly tagged in remarks.
  // For BAND_SAW and downstream, default to order cut lengths.
  const initialL1 = l1Match
    ? l1Match[1]
    : isMhStage
    ? ''
    : isDrawOrHt
    ? (avgLength > 0 ? String(avgLength) : (editing.l1 ? String(editing.l1) : ''))
    : (editing.l1 ? String(editing.l1) : (avgLength > 0 ? String(avgLength) : ''));

  const initialL2 = l2Match
    ? l2Match[1]
    : isMhStage
    ? ''
    : isDrawOrHt
    ? (avgLength > 0 ? String(avgLength) : (editing.l2 ? String(editing.l2) : ''))
    : (editing.l2 ? String(editing.l2) : (avgLength > 0 ? String(avgLength) : ''));

  const [editL1, setEditL1] = useState(initialL1);
  const [editL2, setEditL2] = useState(initialL2);

  const effAvgLength = (() => {
    if (isMhStage) {
      return avgLength > 0 ? avgLength : (Number(editing.mh_avg_length) || 4.4);
    }
    const nL1 = Number(editL1);
    const nL2 = Number(editL2);
    if (nL1 > 0 && nL2 > 0) return (nL1 + nL2) / 2;
    if (nL1 > 0) return nL1;
    if (nL2 > 0) return nL2;
    return avgLength > 0 ? avgLength : 6.0;
  })();

  const effOutPcs = (() => {
    const outMtr = Number(editing.output_mtr || 0);
    if (isMhStage && effAvgLength > 0 && outMtr > 0) {
      // If parsedPcs matches output_mtr with effAvgLength, keep it; otherwise recalculate at MH length
      if (parsedPcs != null && Math.abs(outMtr - parsedPcs * effAvgLength) <= 2) {
        return parsedPcs;
      }
      return Math.round(outMtr / effAvgLength);
    }
    if (parsedPcs != null) return parsedPcs;
    if (Number(editing.output_pcs || 0) > 0) return Math.round(Number(editing.output_pcs));
    if (effAvgLength > 0 && outMtr > 0) return Math.round(outMtr / effAvgLength);
    return '';
  })();

  const effRejPcs = (() => {
    const rejMtr = Number(editing.rejection_mtr || 0);
    if (isMhStage && effAvgLength > 0 && rejMtr > 0) {
      if (parsedRejPcs != null && Math.abs(rejMtr - parsedRejPcs * effAvgLength) <= 2) {
        return parsedRejPcs;
      }
      return Math.round(rejMtr / effAvgLength);
    }
    if (parsedRejPcs != null) return parsedRejPcs;
    if (Number(editing.rejection_pcs || 0) > 0) return Math.round(Number(editing.rejection_pcs));
    if (effAvgLength > 0 && rejMtr > 0) return Math.round(rejMtr / effAvgLength);
    return '';
  })();

  const effHtcPcs = (() => {
    if (editing.stage_code !== 'ROLLING') return '';
    const htcMtr = Number(editing.htc_ok_mtr || 0);
    const outMtr = Number(editing.output_mtr || 0);
    const rejMtr = Number(editing.rejection_mtr || 0);
    const pPcs = n(effOutPcs);
    const rPcs = n(effRejPcs);
    const expectedOkPcs = Math.max(0, pPcs - rPcs);
    if (expectedOkPcs > 0 && Math.abs(htcMtr - (outMtr - rejMtr)) < 0.1) {
      return expectedOkPcs;
    }
    if (effAvgLength > 0 && htcMtr > 0) {
      return Math.round(htcMtr / effAvgLength);
    }
    if (Number(editing.htc_ok_pcs || 0) > 0) return Math.round(Number(editing.htc_ok_pcs));
    return '';
  })();

  const [editDate, setEditDate] = useState(editing.process_date.slice(0, 10));
  const [editMtr, setEditMtr] = useState(String(editing.output_mtr || ''));
  const [editPcs, setEditPcs] = useState(String(effOutPcs));
  const [editRejectionMtr, setEditRejectionMtr] = useState(String(editing.rejection_mtr || ''));
  const [editRejectionPcs, setEditRejectionPcs] = useState(String(effRejPcs));
  const [editHtcMtr, setEditHtcMtr] = useState(String(editing.htc_ok_mtr || ''));
  const [editHtcPcs, setEditHtcPcs] = useState(String(effHtcPcs));
  const [editHeatLot, setEditHeatLot] = useState(editing.heat_lot_no || '');
  const [editRemarks, setEditRemarks] = useState(cleanRemarks || '');
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState('');

  const isFinishing = editing.stage_code === 'FINISHING';

  const changeEditPcs = (value: string) => {
    setEditPcs(value);
    const mtrVal = value === '' ? '' : String(mtrFromPcs(n(value), effAvgLength).toFixed(2).replace(/\.?0+$/, ''));
    if (!isFinishing) setEditMtr(mtrVal);

    const pPcs = n(value);
    const rPcs = n(editRejectionPcs);
    const okPcs = Math.max(0, pPcs - rPcs);
    setEditHtcPcs(value === '' ? '' : String(okPcs));
    if (!isFinishing && editing.stage_code === 'ROLLING') {
      setEditHtcMtr(okPcs > 0 ? String(mtrFromPcs(okPcs, effAvgLength).toFixed(2).replace(/\.?0+$/, '')) : '0');
    }
  };

  const changeEditMtr = (value: string) => {
    setEditMtr(value);
    if (!isFinishing && effAvgLength > 0 && value !== '') {
      const calculatedPcs = String(Math.round(n(value) / effAvgLength));
      setEditPcs(calculatedPcs);
      const pPcs = n(calculatedPcs);
      const rPcs = n(editRejectionPcs);
      const okPcs = Math.max(0, pPcs - rPcs);
      setEditHtcPcs(String(okPcs));
      const okMtr = Math.max(0, n(value) - n(editRejectionMtr));
      if (editing.stage_code === 'ROLLING') {
        setEditHtcMtr(String(Number(okMtr.toFixed(2))));
      }
    } else if (value === '') {
      setEditPcs('');
      if (editing.stage_code === 'ROLLING') {
        setEditHtcPcs('');
        setEditHtcMtr('');
      }
    }
  };

  const changeEditRejectionPcs = (value: string) => {
    setEditRejectionPcs(value);
    const rejMtrVal = value === '' ? '' : String(mtrFromPcs(n(value), effAvgLength).toFixed(2).replace(/\.?0+$/, ''));
    if (!isFinishing) setEditRejectionMtr(rejMtrVal);

    const pPcs = n(editPcs);
    const rPcs = n(value);
    const okPcs = Math.max(0, pPcs - rPcs);
    setEditHtcPcs(editPcs === '' ? '' : String(okPcs));
    if (!isFinishing && editing.stage_code === 'ROLLING') {
      setEditHtcMtr(okPcs > 0 ? String(mtrFromPcs(okPcs, effAvgLength).toFixed(2).replace(/\.?0+$/, '')) : '0');
    }
  };

  const changeEditRejectionMtr = (value: string) => {
    setEditRejectionMtr(value);
    if (!isFinishing && effAvgLength > 0 && value !== '') {
      const calculatedRejPcs = String(Math.round(n(value) / effAvgLength));
      setEditRejectionPcs(calculatedRejPcs);
      const pPcs = n(editPcs);
      const rPcs = n(calculatedRejPcs);
      const okPcs = Math.max(0, pPcs - rPcs);
      setEditHtcPcs(editPcs === '' ? '' : String(okPcs));
      const okMtr = Math.max(0, n(editMtr) - n(value));
      if (editing.stage_code === 'ROLLING') {
        setEditHtcMtr(String(Number(okMtr.toFixed(2))));
      }
    } else if (value === '') {
      setEditRejectionPcs('');
    }
  };

  const changeEditHtcPcs = (value: string) => {
    setEditHtcPcs(value);
    if (value === '') {
      setEditHtcMtr('');
    } else {
      setEditHtcMtr(String(mtrFromPcs(n(value), effAvgLength).toFixed(2).replace(/\.?0+$/, '')));
    }
  };

  const updateL1L2 = (newL1: string, newL2: string) => {
    setEditL1(newL1);
    setEditL2(newL2);
    const n1 = Number(newL1);
    const n2 = Number(newL2);
    const newEffAvg = isMhStage
      ? (avgLength > 0 ? avgLength : 4.4)
      : n1 > 0 && n2 > 0
      ? (n1 + n2) / 2
      : n1 > 0
      ? n1
      : n2 > 0
      ? n2
      : avgLength > 0
      ? avgLength
      : 6.0;

    if (editPcs !== '') {
      const mtrVal = String(mtrFromPcs(n(editPcs), newEffAvg).toFixed(2).replace(/\.?0+$/, ''));
      if (!isFinishing) setEditMtr(mtrVal);
    }
    if (editRejectionPcs !== '') {
      const rejMtrVal = String(mtrFromPcs(n(editRejectionPcs), newEffAvg).toFixed(2).replace(/\.?0+$/, ''));
      if (!isFinishing) setEditRejectionMtr(rejMtrVal);
    }
    if (editHtcPcs !== '' && editing.stage_code === 'ROLLING') {
      const pPcs = n(editPcs);
      const rPcs = n(editRejectionPcs);
      const okPcs = Math.max(0, pPcs - rPcs);
      setEditHtcPcs(String(okPcs));
      setEditHtcMtr(String(mtrFromPcs(okPcs, newEffAvg).toFixed(2).replace(/\.?0+$/, '')));
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');

    const mtr = n(editMtr) > 0 ? n(editMtr) : editPcs.trim() !== '' ? mtrFromPcs(n(editPcs), effAvgLength) : 0;
    const rejection = n(editRejectionMtr) > 0 ? n(editRejectionMtr) : editRejectionPcs.trim() !== '' ? mtrFromPcs(n(editRejectionPcs), effAvgLength) : 0;
    const htc = editing.stage_code === 'ROLLING'
      ? (n(editHtcMtr) > 0 ? n(editHtcMtr) : editHtcPcs.trim() !== '' ? mtrFromPcs(n(editHtcPcs), effAvgLength) : Math.max(0, mtr - rejection))
      : 0;

    if (!editDate) {
      setLocalError('Process date is required.');
      return;
    }
    if (mtr <= 0) {
      setLocalError('Production quantity (PCS / MTR) must be greater than zero.');
      return;
    }
    if (rejection < 0 || rejection > mtr + 0.001) {
      setLocalError('Rejection cannot exceed production quantity.');
      return;
    }
    if (editing.stage_code === 'ROLLING' && htc > mtr - rejection + 0.001) {
      setLocalError('HTC OK cannot exceed Net Rolling output (Production - Rejection).');
      return;
    }

    setSaving(true);
    try {
      const userRemarks = editRemarks.trim();
      const finalRemarks = hasL1L2
        ? (userRemarks ? `${userRemarks} [L1:${editL1 || 0}] [L2:${editL2 || 0}]` : `[L1:${editL1 || 0}] [L2:${editL2 || 0}]`).trim()
        : userRemarks;

      await onSave({
        editDate,
        editMtr: mtr,
        editPcs,
        editRejectionMtr: rejection,
        editRejectionPcs,
        editHtcMtr: editing.stage_code === 'ROLLING' ? htc : 0,
        editHtcPcs,
        editHeatLot,
        editRemarks: finalRemarks,
        editL1: hasL1L2 ? editL1 : undefined,
        editL2: hasL1L2 ? editL2 : undefined,
      });
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message: unknown }).message)
          : typeof err === 'string'
          ? err
          : 'Failed to update entry.';
      setLocalError(msg);
    } finally {
      setSaving(false);
    }
  };

  const stageLabel = STAGES.find((s) => s.code === editing.stage_code)?.label || editing.stage_code;

  return (
    <Modal
      title={
        <div>
          <h2 className="text-base font-bold text-slate-900">Edit Production Record</h2>
          <p className="text-xs text-slate-500 font-normal mt-0.5 font-mono">
            {editing.work_order_no}
            {editing.plan_no ? ` · Plan: ${editing.plan_no}` : ''} · {editing.route_code} · {stageLabel} · Length: {effAvgLength.toFixed(2)} m
          </p>
        </div>
      }
      onClose={onClose}
      maxWidth="2xl"
    >
      <form onSubmit={handleFormSubmit}>
        {localError && (
          <div className="mx-6 mt-4 rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs font-semibold text-rose-700">
            {localError}
          </div>
        )}

        <div className="grid gap-4 p-6 sm:grid-cols-2 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Process Date *</label>
            <input
              type="date"
              value={editDate}
              onChange={(e) => setEditDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 shadow-2xs focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
              required
            />
          </div>

          {hasL1L2 && (
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Cut / Pipe Length (L1 - L2 in meters)</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="L1 (Min)"
                  value={editL1}
                  onChange={(e) => updateL1L2(e.target.value, editL2)}
                  className="w-1/2 rounded-lg border border-amber-300 bg-white px-3 py-2 font-mono text-xs font-bold text-slate-900 shadow-2xs focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                />
                <input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="L2 (Max)"
                  value={editL2}
                  onChange={(e) => updateL1L2(editL1, e.target.value)}
                  className="w-1/2 rounded-lg border border-amber-300 bg-white px-3 py-2 font-mono text-xs font-bold text-slate-900 shadow-2xs focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Production (PCS & MTR) *</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                step="1"
                placeholder="PCS"
                value={editPcs}
                onChange={(e) => changeEditPcs(e.target.value)}
                className="w-1/2 rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs font-bold text-slate-900 shadow-2xs focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
              />
              <input
                type="number"
                min="0"
                step="any"
                placeholder="MTR"
                value={editMtr}
                onChange={(e) => changeEditMtr(e.target.value)}
                className="w-1/2 rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs font-bold text-slate-900 shadow-2xs focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Rejection (PCS & MTR)</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                step="1"
                placeholder="PCS"
                value={editRejectionPcs}
                onChange={(e) => changeEditRejectionPcs(e.target.value)}
                className="w-1/2 rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-rose-700 font-semibold shadow-2xs focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
              />
              <input
                type="number"
                min="0"
                step="any"
                placeholder="MTR"
                value={editRejectionMtr}
                onChange={(e) => changeEditRejectionMtr(e.target.value)}
                className="w-1/2 rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-rose-700 font-semibold shadow-2xs focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
              />
            </div>
          </div>

          {editing.stage_code === 'ROLLING' && (
            <div>
              <label className="block font-semibold text-slate-700 mb-1">HTC OK (PCS & MTR)</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="PCS"
                  value={editHtcPcs}
                  onChange={(e) => changeEditHtcPcs(e.target.value)}
                  className="w-1/2 rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-emerald-700 font-bold shadow-2xs focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                />
                <input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="MTR"
                  value={editHtcMtr}
                  onChange={(e) => setEditHtcMtr(e.target.value)}
                  className="w-1/2 rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-emerald-700 font-bold shadow-2xs focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>
          )}

          {(editing.stage_code === 'HEAT_TREATMENT' || editing.stage_code === 'HOLLOW_HEAT_TREATMENT') && (
            <div>
              <Input
                label="Heat Lot No."
                placeholder="Optional (e.g. HT-8842)"
                value={editHeatLot}
                onChange={(e) => setEditHeatLot(e.target.value)}
              />
            </div>
          )}

          <div className="sm:col-span-2">
            <Input
              label="Remarks"
              placeholder="Operational notes..."
              value={editRemarks}
              onChange={(e) => setEditRemarks(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-6 py-4">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm" disabled={saving}>
            {saving ? 'Updating...' : 'Update Production Entry'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default EditEntryModal;
