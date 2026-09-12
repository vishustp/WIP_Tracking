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
  const { pcs: parsedPcs, rejPcs: parsedRejPcs, cleanRemarks } = extractPcsFromRemarks(editing.remarks);

  const effOutPcs =
    parsedPcs != null
      ? parsedPcs
      : isMhStage && avgLength > 0
      ? Math.round(Number(editing.output_mtr || 0) / avgLength)
      : Number(editing.output_pcs || 0) > 0
      ? Math.round(Number(editing.output_pcs))
      : avgLength > 0 && Number(editing.output_mtr || 0) > 0
      ? Math.round(Number(editing.output_mtr) / avgLength)
      : '';

  const effRejPcs =
    parsedRejPcs != null
      ? parsedRejPcs
      : isMhStage && avgLength > 0
      ? Math.round(Number(editing.rejection_mtr || 0) / avgLength)
      : Number(editing.rejection_pcs || 0) > 0
      ? Math.round(Number(editing.rejection_pcs))
      : avgLength > 0 && Number(editing.rejection_mtr || 0) > 0
      ? Math.round(Number(editing.rejection_mtr) / avgLength)
      : '';

  const effHtcPcs =
    isMhStage && avgLength > 0
      ? Math.round(Number(editing.htc_ok_mtr || 0) / avgLength)
      : Number(editing.htc_ok_pcs || 0) > 0
      ? Math.round(Number(editing.htc_ok_pcs))
      : avgLength > 0 && Number(editing.htc_ok_mtr || 0) > 0
      ? Math.round(Number(editing.htc_ok_mtr) / avgLength)
      : '';

  const [editDate, setEditDate] = useState(editing.process_date.slice(0, 10));
  const [editMtr, setEditMtr] = useState(String(editing.output_mtr || ''));
  const [editPcs, setEditPcs] = useState(String(effOutPcs));
  const [editRejectionMtr, setEditRejectionMtr] = useState(String(editing.rejection_mtr || ''));
  const [editRejectionPcs, setEditRejectionPcs] = useState(String(effRejPcs));
  const [editHtcMtr, setEditHtcMtr] = useState(String(editing.htc_ok_mtr || ''));
  const [editHtcPcs, setEditHtcPcs] = useState(String(effHtcPcs));
  const [editHeatLot, setEditHeatLot] = useState(editing.heat_lot_no || '');
  const [editRemarks, setEditRemarks] = useState(cleanRemarks || editing.remarks || '');
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState('');

  const isFinishing = editing.stage_code === 'FINISHING';

  const changeEditPcs = (value: string) => {
    setEditPcs(value);
    if (isFinishing) return;
    if (value === '') {
      setEditMtr('');
    } else {
      setEditMtr(String(mtrFromPcs(n(value), avgLength).toFixed(3).replace(/\.?0+$/, '')));
    }
  };

  const changeEditRejectionPcs = (value: string) => {
    setEditRejectionPcs(value);
    if (isFinishing) return;
    if (value === '') {
      setEditRejectionMtr('');
    } else {
      setEditRejectionMtr(String(mtrFromPcs(n(value), avgLength).toFixed(3).replace(/\.?0+$/, '')));
    }
  };

  const changeEditHtcPcs = (value: string) => {
    setEditHtcPcs(value);
    if (value === '') {
      setEditHtcMtr('');
    } else {
      setEditHtcMtr(String(mtrFromPcs(n(value), avgLength).toFixed(3).replace(/\.?0+$/, '')));
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');

    const mtr = isFinishing ? n(editMtr) : editPcs.trim() !== '' ? mtrFromPcs(n(editPcs), avgLength) : n(editMtr);
    const rejection = isFinishing
      ? n(editRejectionMtr)
      : editRejectionPcs.trim() !== ''
      ? mtrFromPcs(n(editRejectionPcs), avgLength)
      : n(editRejectionMtr);
    const htc = editHtcPcs.trim() !== '' ? mtrFromPcs(n(editHtcPcs), avgLength) : n(editHtcMtr);

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
      await onSave({
        editDate,
        editMtr: mtr,
        editPcs,
        editRejectionMtr: rejection,
        editRejectionPcs,
        editHtcMtr: editing.stage_code === 'ROLLING' ? htc : 0,
        editHtcPcs,
        editHeatLot,
        editRemarks,
      });
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed to update entry.');
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
            {editing.work_order_no} · {editing.route_code} · {stageLabel}
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

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Production (PCS & MTR) *</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                step="any"
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
                onChange={(e) => setEditMtr(e.target.value)}
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
                step="any"
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
                onChange={(e) => setEditRejectionMtr(e.target.value)}
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
                  step="any"
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
