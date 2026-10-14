'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { X, ArrowRight, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { fetchEligibleSourceWorkOrders, allocateHollowBankLot } from '@/lib/hollow-bank/client';
import { HollowBankLot, calculatePipeWeightMt } from '@/lib/hollow-bank/types';

interface Props {
  isOpen: boolean;
  lot: HollowBankLot | null;
  onClose: () => void;
  onSuccess: () => void;
}

const TARGET_STAGES = [
  { code: 'DRAW', name: 'Cold Draw Bench' },
  { code: 'PILGER', name: 'Cold Pilger Mill' },
  { code: 'HOLLOW_HEAT_TREATMENT', name: 'Hollow Heat Treatment' },
  { code: 'HEAT_TREATMENT', name: 'Final Heat Treatment' },
  { code: 'BAND_SAW', name: 'Band Saw Cutting' },
  { code: 'VDI', name: 'VDI Inspection' },
];

export default function AllocateHollowModal({ isOpen, lot, onClose, onSuccess }: Props) {
  const [targetOrders, setTargetOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  const [targetWoId, setTargetWoId] = useState('');
  const [targetStageCode, setTargetStageCode] = useState('DRAW');
  const [allocPcs, setAllocPcs] = useState('');
  const [allocMtr, setAllocMtr] = useState('');
  const [remarks, setRemarks] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen || !lot) return;
    const sourceWoId = lot.source_wo_id;
    const availablePcs = lot.available_pcs;
    const availableMeters = lot.available_meters;

    async function loadOrders(excludeId: string) {
      setLoadingOrders(true);
      try {
        const data = await fetchEligibleSourceWorkOrders();
        // Exclude the source work order to avoid diverting to self
        setTargetOrders(data.filter((w) => w.id !== excludeId));
      } catch (err: any) {
        toast.error('Failed to load target work orders: ' + err.message);
      } finally {
        setLoadingOrders(false);
      }
    }
    loadOrders(sourceWoId);

    // Default allocate all available pieces initially
    setAllocPcs(String(availablePcs));
    setAllocMtr(String(availableMeters));
  }, [isOpen, lot]);

  const selectedTargetWo = useMemo(() => {
    return targetOrders.find((w) => w.id === targetWoId);
  }, [targetOrders, targetWoId]);

  // Adjust meters when pieces change based on lot's avg length
  const handlePcsChange = (val: string) => {
    setAllocPcs(val);
    const numP = Number(val);
    if (lot && numP > 0 && lot.avg_length > 0) {
      const calculatedMtr = Number((numP * lot.avg_length).toFixed(2));
      setAllocMtr(String(Math.min(calculatedMtr, lot.available_meters)));
    } else if (!val) {
      setAllocMtr('');
    }
  };

  const calculatedAllocMt = useMemo(() => {
    if (!lot) return 0;
    const numMtr = Number(allocMtr);
    return calculatePipeWeightMt(lot.od, lot.wt, numMtr);
  }, [lot, allocMtr]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!lot) return;

    if (!targetWoId) {
      toast.error('Please select a target Work Order.');
      return;
    }
    if (!targetStageCode) {
      toast.error('Please select a target work center.');
      return;
    }

    const numPcs = Number(allocPcs);
    const numMtr = Number(allocMtr);

    if (!numPcs || numPcs <= 0) {
      toast.error('Allocated pieces must be greater than 0.');
      return;
    }
    if (numPcs > lot.available_pcs) {
      toast.error(`Cannot allocate more than ${lot.available_pcs} available pieces.`);
      return;
    }
    if (!numMtr || numMtr <= 0) {
      toast.error('Allocated meters must be greater than 0.');
      return;
    }
    if (numMtr > lot.available_meters) {
      toast.error(`Cannot allocate more than ${lot.available_meters} available meters.`);
      return;
    }

    setIsSubmitting(true);
    try {
      await allocateHollowBankLot({
        hollow_bank_id: lot.id,
        target_wo_id: targetWoId,
        target_stage_code: targetStageCode,
        allocated_pcs: numPcs,
        allocated_meters: numMtr,
        allocated_mt: calculatedAllocMt,
        remarks: remarks.trim() || undefined,
      });

      toast.success(
        `Successfully allocated ${numPcs} PCS (${numMtr} M) from Lot ${lot.lot_no} to target WO.`
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error('Failed to allocate material: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isOpen || !lot) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400">
              <ArrowRight size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Allocate Hollow Bank Lot to Work Order
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                PPC authorization to release banked tubes into shop floor WIP
              </p>
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

        {/* Selected Lot Metadata Box */}
        <div className="mx-6 mt-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400">
              {lot.lot_no}
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded font-semibold bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
              Origin: {lot.source_stage_code}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400">Size (OD × WT)</span>
              <p className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                {lot.od} × {lot.wt} mm
              </p>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400">Grade</span>
              <p className="font-semibold text-slate-800 dark:text-slate-200">{lot.grade}</p>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400">Heat No</span>
              <p className="font-mono text-slate-800 dark:text-slate-200">{lot.heat_no || '—'}</p>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400">Available Stock</span>
              <p className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                {lot.available_pcs} pcs / {lot.available_meters} m ({lot.available_mt} MT)
              </p>
            </div>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Target Work Order */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                Target Work Order <span className="text-rose-500">*</span>
              </label>
              <select
                value={targetWoId}
                onChange={(e) => setTargetWoId(e.target.value)}
                required
                disabled={loadingOrders}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">-- Select Target Work Order to Inject Material --</option>
                {targetOrders.map((w) => (
                  <option key={w.id} value={w.id}>
                    WO #{w.work_order_no} — {w.customer_name} ({w.od} × {w.wt} mm, {w.grade})
                  </option>
                ))}
              </select>
            </div>

            {/* Target Work Center / Stage */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                Destination Work Center <span className="text-rose-500">*</span>
              </label>
              <select
                value={targetStageCode}
                onChange={(e) => setTargetStageCode(e.target.value)}
                required
                className="w-full h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500"
              >
                {TARGET_STAGES.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Allocated Pieces & Meters */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                Allocate Pieces (Max: {lot.available_pcs}) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                step="1"
                min="1"
                max={lot.available_pcs}
                required
                value={allocPcs}
                onChange={(e) => handlePcsChange(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono font-bold text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                Allocate Meters (Max: {lot.available_meters}) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0.1"
                max={lot.available_meters}
                required
                value={allocMtr}
                onChange={(e) => setAllocMtr(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400"
              />
            </div>

            {/* Calculated Weight MT */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                Allocated Mass (MT)
              </label>
              <div className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
                {calculatedAllocMt} MT
              </div>
            </div>

            {/* Remarks / PPC Instruction */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                PPC Instruction / Reason / Remarks
              </label>
              <input
                type="text"
                placeholder="e.g. Allocated for rush order fulfillment"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 flex items-start gap-2.5 text-xs text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 size={15} className="shrink-0 mt-0.5" />
            <div>
              <strong>Queue Injection:</strong> This will inject{' '}
              <span className="font-mono font-bold">{allocMtr || 0} m</span> directly into target work order's queue at{' '}
              <span className="font-semibold">{targetStageCode}</span> stage.
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
              className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-xs cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Allocating...
                </>
              ) : (
                <>
                  <CheckCircle2 size={14} />
                  Authorize & Allocate to Order
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
