'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { X, Layers, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { fetchEligibleSourceWorkOrders, createHollowBankEntry } from '@/lib/hollow-bank/client';
import { calculatePipeWeightMt } from '@/lib/hollow-bank/types';

export interface DivertInitialValues {
  sourceWoId?: string;
  sourceStageCode?: string;
  heatNo?: string;
  od?: number | string;
  wt?: number | string;
  grade?: string;
  pcs?: number | string;
  avgLength?: number | string;
  totalMeters?: number | string;
  remarks?: string;
  rejectionId?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialValues?: DivertInitialValues;
}

const STAGES = [
  { code: 'ROLLING', name: 'Rolling Mill (HTC OK Mother Hollows)' },
  { code: 'HOLLOW_HEAT_TREATMENT', name: 'Hollow Heat Treatment' },
  { code: 'DRAW', name: 'Cold Draw Bench' },
  { code: 'PILGER', name: 'Cold Pilger Mill' },
  { code: 'HEAT_TREATMENT', name: 'Final Heat Treatment' },
  { code: 'BAND_SAW', name: 'Band Saw Cutting' },
  { code: 'VDI', name: 'VDI Inspection' },
];

export default function DivertToBankModal({ isOpen, onClose, onSuccess, initialValues }: Props) {
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [loadingWo, setLoadingWo] = useState(false);

  const [selectedWoId, setSelectedWoId] = useState('');
  const [sourceStageCode, setSourceStageCode] = useState('ROLLING');
  const [heatNo, setHeatNo] = useState('');
  const [od, setOd] = useState('');
  const [wt, setWt] = useState('');
  const [grade, setGrade] = useState('');
  const [pcs, setPcs] = useState('');
  const [avgLength, setAvgLength] = useState('6.0');
  const [totalMeters, setTotalMeters] = useState('');
  const [remarks, setRemarks] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync initialValues when modal opens or initialValues change
  useEffect(() => {
    if (!isOpen) return;
    if (initialValues) {
      if (initialValues.sourceWoId) setSelectedWoId(initialValues.sourceWoId);
      if (initialValues.sourceStageCode) setSourceStageCode(initialValues.sourceStageCode);
      if (initialValues.heatNo !== undefined) setHeatNo(initialValues.heatNo);
      if (initialValues.od !== undefined && initialValues.od !== '') setOd(String(initialValues.od));
      if (initialValues.wt !== undefined && initialValues.wt !== '') setWt(String(initialValues.wt));
      if (initialValues.grade !== undefined) setGrade(initialValues.grade);
      if (initialValues.pcs !== undefined && initialValues.pcs !== '') setPcs(String(initialValues.pcs));
      if (initialValues.avgLength !== undefined && initialValues.avgLength !== '') setAvgLength(String(initialValues.avgLength));
      if (initialValues.totalMeters !== undefined && initialValues.totalMeters !== '') setTotalMeters(String(initialValues.totalMeters));
      if (initialValues.remarks !== undefined) setRemarks(initialValues.remarks);
    } else {
      setSelectedWoId('');
      setSourceStageCode('ROLLING');
      setHeatNo('');
      setOd('');
      setWt('');
      setGrade('');
      setPcs('');
      setAvgLength('6.0');
      setTotalMeters('');
      setRemarks('');
    }
  }, [isOpen, initialValues]);

  useEffect(() => {
    if (!isOpen) return;
    async function loadWo() {
      setLoadingWo(true);
      try {
        const data = await fetchEligibleSourceWorkOrders();
        // If initialValues provides a sourceWoId that is not in data, fetch it or add fallback
        if (initialValues?.sourceWoId && !data.some((d) => d.id === initialValues.sourceWoId)) {
          const supabase = createClient();
          const { data: specificWo } = await supabase
            .from('work_orders')
            .select('id, work_order_no, customer_name, size_od, size_wt, grade, specification, l1, l2')
            .eq('id', initialValues.sourceWoId)
            .maybeSingle();
          if (specificWo) {
            data.unshift({
              id: specificWo.id,
              work_order_no: specificWo.work_order_no,
              customer_name: specificWo.customer_name,
              od: Number(specificWo.size_od || 0),
              wt: Number(specificWo.size_wt || 0),
              grade: specificWo.grade || specificWo.specification || '',
              l1: Number(specificWo.l1 || 6),
              l2: Number(specificWo.l2 || 6.5),
            });
          }
        }
        setWorkOrders(data);
      } catch (err: any) {
        toast.error('Failed to load work orders: ' + err.message);
      } finally {
        setLoadingWo(false);
      }
    }
    loadWo();
  }, [isOpen, initialValues]);

  const selectedWo = useMemo(() => {
    return workOrders.find((w) => w.id === selectedWoId);
  }, [workOrders, selectedWoId]);

  // Auto-prefill dimensions from selected Work Order if user switches WO and values not locked
  useEffect(() => {
    if (!selectedWo) return;
    // Only prefill from WO if not already provided by initialValues or user
    if (!initialValues || !initialValues.od) {
      if (selectedWo.od) setOd(String(selectedWo.od));
      if (selectedWo.wt) setWt(String(selectedWo.wt));
      if (selectedWo.grade) setGrade(selectedWo.grade);
      const defLen = selectedWo.l1 && selectedWo.l2 ? (selectedWo.l1 + selectedWo.l2) / 2 : selectedWo.l1 || 6.0;
      setAvgLength(String(Number(defLen.toFixed(2))));
    }
  }, [selectedWo, initialValues]);

  // Live calculation of Total Meters & Weight MT
  useEffect(() => {
    const numPcs = Number(pcs);
    const numLen = Number(avgLength);
    if (numPcs > 0 && numLen > 0) {
      setTotalMeters(String(Number((numPcs * numLen).toFixed(2))));
    }
  }, [pcs, avgLength]);

  const calculatedWeightMt = useMemo(() => {
    const numOd = Number(od);
    const numWt = Number(wt);
    const numMtr = Number(totalMeters);
    return calculatePipeWeightMt(numOd, numWt, numMtr);
  }, [od, wt, totalMeters]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedWoId) {
      toast.error('Please select a source Work Order.');
      return;
    }
    if (!sourceStageCode) {
      toast.error('Please select the originating work center.');
      return;
    }
    const numPcs = Number(pcs);
    const numLen = Number(avgLength);
    const numMtr = Number(totalMeters);
    const numOd = Number(od);
    const numWt = Number(wt);

    if (!numPcs || numPcs <= 0) {
      toast.error('Pieces must be greater than 0.');
      return;
    }
    if (!numLen || numLen <= 0) {
      toast.error('Average Length must be greater than 0.');
      return;
    }
    if (!numMtr || numMtr <= 0) {
      toast.error('Total meters must be greater than 0.');
      return;
    }
    if (!numOd || !numWt || !grade.trim()) {
      toast.error('OD, WT, and Grade are required.');
      return;
    }

    setIsSubmitting(true);
    try {
      await createHollowBankEntry({
        source_wo_id: selectedWoId,
        source_stage_code: sourceStageCode,
        heat_no: heatNo.trim() || undefined,
        od: numOd,
        wt: numWt,
        grade: grade.trim(),
        pcs: numPcs,
        avg_length: numLen,
        total_meters: numMtr,
        weight_mt: calculatedWeightMt,
        remarks: remarks.trim() || undefined,
        rejection_id: initialValues?.rejectionId,
      });

      toast.success(`Successfully parked ${numPcs} PCS (${numMtr} M) into Hollow Bank.`);
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error('Failed to park material in Hollow Bank: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-400">
              <Layers size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Divert Material to Hollow Bank</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Park mother hollows or tubes into yard buffer (deducts source stage WIP)</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Source Work Order */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                Source Work Order <span className="text-rose-500">*</span>
              </label>
              <select
                value={selectedWoId}
                onChange={(e) => setSelectedWoId(e.target.value)}
                required
                disabled={loadingWo}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Select Source Work Order --</option>
                {workOrders.map((w) => (
                  <option key={w.id} value={w.id}>
                    WO #{w.work_order_no} — {w.customer_name} ({w.od} × {w.wt} mm, {w.grade})
                  </option>
                ))}
              </select>
            </div>

            {/* Originating Stage / Work Center */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                Originating Work Center <span className="text-rose-500">*</span>
              </label>
              <select
                value={sourceStageCode}
                onChange={(e) => setSourceStageCode(e.target.value)}
                required
                className="w-full h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500"
              >
                {STAGES.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Heat / Lot Number */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                Heat / Lot No.
              </label>
              <input
                type="text"
                placeholder="e.g. H-88921"
                value={heatNo}
                onChange={(e) => setHeatNo(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono font-semibold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 uppercase"
              />
            </div>

            {/* Dimensional Properties */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                Tube OD (mm) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                step="any"
                required
                value={od}
                onChange={(e) => setOd(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono font-semibold text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                Tube WT (mm) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                step="any"
                required
                value={wt}
                onChange={(e) => setWt(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono font-semibold text-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                Steel Grade / Specification <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-900 dark:text-slate-100 uppercase"
              />
            </div>

            {/* Quantity: Pieces, Avg Length, Total Meters */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                Pieces (PCS) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                step="1"
                min="1"
                required
                placeholder="Number of pipes"
                value={pcs}
                onChange={(e) => setPcs(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono font-semibold text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                Avg Pipe Length (m) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0.1"
                required
                value={avgLength}
                onChange={(e) => setAvgLength(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono font-semibold text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                Total Meters (m) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0.1"
                required
                value={totalMeters}
                onChange={(e) => setTotalMeters(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono font-bold text-blue-600 dark:text-blue-400"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                Calculated Mass (MT)
              </label>
              <div className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
                {calculatedWeightMt} MT
              </div>
            </div>

            {/* Remarks / Notes */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                Reason / Yard Bay Location / Remarks
              </label>
              <input
                type="text"
                placeholder="e.g. Parked in Bay 3 for secondary draw allocation"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-300">
            <AlertCircle size={15} className="shrink-0 mt-0.5" />
            <div>
              <strong>Automatic WIP Balancing:</strong> Diverting this quantity will immediately deduct{' '}
              <span className="font-mono font-bold">{totalMeters || 0} m</span> from the source work order at{' '}
              <span className="font-semibold">{sourceStageCode}</span> stage.
            </div>
          </div>

          {/* Footer Controls */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white shadow-xs cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Parking to Bank...
                </>
              ) : (
                <>
                  <Layers size={14} />
                  Confirm & Park into Hollow Bank
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
