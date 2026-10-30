'use client';
import { showErrorDialog } from '@/lib/errorDialog';

import React, { useState, useMemo } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Scissors,
  Plus,
  Trash2,
  Calendar,
  AlertCircle,
  TrendingUp,
  Layers,
  Sparkles,
  Info,
  CheckCircle2,
  AlertTriangle,
  FileText,
  User,
  ArrowRight,
  ShieldCheck,
  RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';
import { ProductionEntry, Row } from '@/types';
import {
  fmt,
  n,
  mtFromMtr,
  extractBandSawCutsFromRemarks,
  attachBandSawCutsToRemarks,
  classifyPipeCutLength,
  normalizeGrade,
} from '@/lib/productionUtils';

export interface CutRowItem {
  id: string;
  length_mtr: number;
  cut_pcs: number;
  cut_category: 'PRIME' | 'SECONDARY' | 'OFFCUT' | 'SCRAP_TRIM';
}

export interface BandSawEditModalProps {
  entry: ProductionEntry;
  queueRow?: Row | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function BandSawEditModal({
  entry,
  queueRow,
  isOpen,
  onClose,
  onSuccess,
}: BandSawEditModalProps) {
  // Dimensions & Metallurgy
  const pipeOd = Number(entry.od || queueRow?.od || 0);
  const pipeWt = Number(entry.wl || queueRow?.wl || 0);
  const rawGrade = queueRow?.specification || entry.specification || queueRow?.grade || entry.grade || null;
  const gradeLabel = rawGrade ? normalizeGrade(rawGrade) : 'Standard Carbon';

  // Target length specifications from Work Order
  const l1 = Number(entry.l1 || queueRow?.l1 || 0);
  const l2 = Number(entry.l2 || queueRow?.l2 || 0);
  const targetOrderLenStr = useMemo(() => {
    if (l1 > 0 && l2 > 0) {
      return l1 === l2 ? `${l1.toFixed(2)} MTR` : `${l1.toFixed(2)} - ${l2.toFixed(2)} MTR`;
    }
    if (l1 > 0) return `${l1.toFixed(2)} MTR`;
    if (entry.avg_length) return `${Number(entry.avg_length).toFixed(2)} MTR`;
    return 'Standard Length';
  }, [l1, l2, entry.avg_length]);

  // Parse existing remarks & cuts
  const parsed = useMemo(() => {
    return extractBandSawCutsFromRemarks(entry.remarks);
  }, [entry.remarks]);

  // Baseline logged values for operator reference
  const initialPrimePcs = useMemo(() => {
    if (parsed.cuts && parsed.cuts.length > 0) {
      return parsed.cuts
        .filter((c) => (c.cat as any) === 'PRIME' || !c.cat || (c.cat as any) === 'SECONDARY')
        .reduce((sum, c) => sum + Number(c.pcs || 0), 0);
    }
    return entry.output_pcs ? Number(entry.output_pcs) : 0;
  }, [parsed.cuts, entry.output_pcs]);

  const originalInputMtr = Number(entry.input_mtr || 0);
  const originalOutputMtr = Number(entry.output_mtr || 0);
  const originalOutputPcs = entry.output_pcs ? Number(entry.output_pcs) : initialPrimePcs;

  // Form State: Process Date
  const [processDate, setProcessDate] = useState(entry.process_date?.slice(0, 10) || '');

  // Form State: Mother Pipes
  const initialMotherPcs = parsed.motherPcs || (originalInputMtr > 0 && entry.avg_length ? Math.round(originalInputMtr / entry.avg_length) : 1);
  const [motherPcs, setMotherPcs] = useState<number>(initialMotherPcs);

  // Initial mother average length
  const initialMotherAvgLen = useMemo(() => {
    if (originalInputMtr > 0 && initialMotherPcs > 0) {
      return Number((originalInputMtr / initialMotherPcs).toFixed(2));
    }
    if (entry.avg_length) return Number(entry.avg_length);
    if (l1 > 0 && l2 > 0) return Number(((l1 + l2) / 2).toFixed(2));
    if (l1 > 0) return l1;
    return 6.0;
  }, [originalInputMtr, initialMotherPcs, entry.avg_length, l1, l2]);

  const [motherAvgLenInput, setMotherAvgLenInput] = useState<string>(String(initialMotherAvgLen));
  const motherAvgLenNum = Math.max(0.1, parseFloat(motherAvgLenInput) || initialMotherAvgLen || 6.0);
  const totalMotherMtr = Number((motherPcs * motherAvgLenNum).toFixed(2));
  const totalMotherMt = mtFromMtr(totalMotherMtr, pipeOd, pipeWt);

  // Form State: Cut Items
  const [cutItems, setCutItems] = useState<CutRowItem[]>(() => {
    if (parsed.cuts && parsed.cuts.length > 0) {
      return parsed.cuts.map((c, idx) => ({
        id: `cut-${idx}-${Date.now()}`,
        length_mtr: Number(c.len),
        cut_pcs: Number(c.pcs),
        cut_category: (c.cat as any) || 'PRIME',
      }));
    }
    // Fallback if no JSON cut tag exists
    const avgLen = Number(entry.avg_length || l1 || 6.0);
    const pcs = initialPrimePcs || (entry.output_pcs ? Number(entry.output_pcs) : 1);
    return [
      {
        id: 'cut-default',
        length_mtr: avgLen,
        cut_pcs: pcs,
        cut_category: 'PRIME',
      },
    ];
  });

  // Rejections / Defect Cut Pieces
  const [rejCutPcs, setRejCutPcs] = useState<string>(
    entry.rejection_pcs !== null && entry.rejection_pcs !== undefined ? String(entry.rejection_pcs) : '0'
  );
  const [rejCutMtr, setRejCutMtr] = useState<string>(
    entry.rejection_mtr !== null && entry.rejection_mtr !== undefined ? String(entry.rejection_mtr) : '0'
  );

  // Manual Scrap Override Option
  const [isManualScrap, setIsManualScrap] = useState<boolean>(false);
  const [manualScrapInput, setManualScrapInput] = useState<string>(
    parsed.scrapMtr !== null && parsed.scrapMtr !== undefined ? String(parsed.scrapMtr) : '0'
  );

  const [cleanRemarks, setCleanRemarks] = useState(parsed.cleanRemarks || '');
  const [heatLotNo, setHeatLotNo] = useState(entry.heat_lot_no || '');
  const [saving, setSaving] = useState(false);
  const [error, setErrorState] = useState('');
  const setError = (msg: string) => {
    setErrorState(msg);
    if (msg) showErrorDialog(msg);
  };

  // Calculations
  const totalPrimeCutMtr = useMemo(() => {
    return cutItems
      .filter((c) => c.cut_category === 'PRIME' || c.cut_category === 'SECONDARY')
      .reduce((sum, c) => sum + Number((c.length_mtr * c.cut_pcs).toFixed(2)), 0);
  }, [cutItems]);

  const totalPrimeCutPcs = useMemo(() => {
    return cutItems
      .filter((c) => c.cut_category === 'PRIME' || c.cut_category === 'SECONDARY')
      .reduce((sum, c) => sum + Number(c.cut_pcs || 0), 0);
  }, [cutItems]);

  const totalOffcutMtr = useMemo(() => {
    return cutItems
      .filter((c) => c.cut_category === 'OFFCUT')
      .reduce((sum, c) => sum + Number((c.length_mtr * c.cut_pcs).toFixed(2)), 0);
  }, [cutItems]);

  const totalOffcutPcs = useMemo(() => {
    return cutItems
      .filter((c) => c.cut_category === 'OFFCUT')
      .reduce((sum, c) => sum + Number(c.cut_pcs || 0), 0);
  }, [cutItems]);

  const totalTrimScrapMtr = useMemo(() => {
    return cutItems
      .filter((c) => c.cut_category === 'SCRAP_TRIM')
      .reduce((sum, c) => sum + Number((c.length_mtr * c.cut_pcs).toFixed(2)), 0);
  }, [cutItems]);

  const totalPrimeCutMt = mtFromMtr(totalPrimeCutMtr, pipeOd, pipeWt);
  const totalOffcutMt = mtFromMtr(totalOffcutMtr, pipeOd, pipeWt);

  // Defect Rejections
  const nRejPcs = Math.max(0, parseInt(rejCutPcs, 10) || 0);
  const nRejMtr = Math.max(0, parseFloat(rejCutMtr) || 0);
  const nRejMt = mtFromMtr(nRejMtr, pipeOd, pipeWt);

  // Automatic balance cutting scrap (Rule 4: Scrap = Total Mother In - Prime Cuts - Offcuts - Trim - Rejections)
  const autoCalculatedScrapMtr = Math.max(
    0,
    Number((totalMotherMtr - totalPrimeCutMtr - totalOffcutMtr - totalTrimScrapMtr - nRejMtr).toFixed(2))
  );

  const effectiveScrapMtr = isManualScrap
    ? Math.max(0, parseFloat(manualScrapInput) || 0)
    : autoCalculatedScrapMtr;
  const totalScrapMt = mtFromMtr(effectiveScrapMtr + totalTrimScrapMtr, pipeOd, pipeWt);

  // Material Balance Check
  const totalAccountedMtr = Number(
    (totalPrimeCutMtr + totalOffcutMtr + totalTrimScrapMtr + effectiveScrapMtr + nRejMtr).toFixed(2)
  );
  const balanceDiff = Number((totalMotherMtr - totalAccountedMtr).toFixed(2));
  const isBalanced = Math.abs(balanceDiff) <= 0.05;

  // Yield & Scrap Percentages
  const yieldPct = totalMotherMtr > 0 ? (totalPrimeCutMtr / totalMotherMtr) * 100 : (totalAccountedMtr > 0 ? (totalPrimeCutMtr / totalAccountedMtr) * 100 : 0);
  const scrapPct = totalMotherMtr > 0 ? ((effectiveScrapMtr + totalTrimScrapMtr) / totalMotherMtr) * 100 : (totalAccountedMtr > 0 ? ((effectiveScrapMtr + totalTrimScrapMtr) / totalAccountedMtr) * 100 : 0);

  // Handlers for cut table
  const handleAddCutItem = (presetLen?: number) => {
    const len = presetLen || (l1 > 0 ? l1 : 5.8);
    const cat = classifyPipeCutLength(len, l1);
    setCutItems((prev) => [
      ...prev,
      {
        id: `cut-${Date.now()}`,
        length_mtr: len,
        cut_pcs: 1,
        cut_category: cat === 'PRIME' ? 'PRIME' : cat === 'USABLE_OFFCUT' ? 'OFFCUT' : 'SCRAP_TRIM',
      },
    ]);
  };

  const handleUpdateItem = (id: string, field: keyof CutRowItem, val: any) => {
    setCutItems((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const updated = { ...c, [field]: val };
        // Auto-reclassify category if length changed and was not manually locked
        if (field === 'length_mtr') {
          const autoCat = classifyPipeCutLength(Number(val) || 0, l1);
          updated.cut_category =
            autoCat === 'PRIME' ? 'PRIME' : autoCat === 'USABLE_OFFCUT' ? 'OFFCUT' : 'SCRAP_TRIM';
        }
        return updated;
      })
    );
  };

  const handleRemoveItem = (id: string) => {
    if (cutItems.length <= 1) {
      toast.error('At least one cut item is required.');
      return;
    }
    setCutItems((prev) => prev.filter((c) => c.id !== id));
  };

  const handleResetToBaseline = () => {
    setMotherPcs(initialMotherPcs);
    setMotherAvgLenInput(String(initialMotherAvgLen));
    setIsManualScrap(false);
    setManualScrapInput(parsed.scrapMtr !== null && parsed.scrapMtr !== undefined ? String(parsed.scrapMtr) : '0');
    setRejCutPcs(entry.rejection_pcs !== null && entry.rejection_pcs !== undefined ? String(entry.rejection_pcs) : '0');
    setRejCutMtr(entry.rejection_mtr !== null && entry.rejection_mtr !== undefined ? String(entry.rejection_mtr) : '0');
    toast.info('Form reset to original recorded values.');
  };

  const handleSave = async () => {
    if (totalPrimeCutPcs <= 0 || totalPrimeCutMtr <= 0 || totalPrimeCutMt <= 0) {
      setError('Production output must be greater than 0.00 m, 0 PCS, and 0.000 MT.');
      return;
    }

    if (cutItems.some((c) => Number(c.length_mtr) <= 0 || Number(c.cut_pcs) <= 0)) {
      setError('Each cut item must have a valid length (> 0.00 m) and piece count (≥ 1).');
      return;
    }

    if (motherAvgLenNum > 15) {
      setError('Mother pipe average length cannot exceed 15.00 MTR.');
      return;
    }

    if (cutItems.some((c) => Number(c.length_mtr) > 15)) {
      setError('Maximum allowable pipe length at Band Saw is 15.00 MTR.');
      return;
    }

    if (totalAccountedMtr > totalMotherMtr * 1.15) {
      setError(
        `Total cuts (${fmt(totalAccountedMtr, 'm')}) exceed incoming mother pipes (${fmt(totalMotherMtr, 'm')}). Please adjust mother pipes or cut lengths.`
      );
      return;
    }

    setSaving(true);
    setError('');

    try {
      const cutsPayload = cutItems.map((c) => ({
        length_mtr: Number(c.length_mtr),
        cut_pcs: Number(c.cut_pcs),
        cut_category: c.cut_category,
      }));

      const finalRemarks = attachBandSawCutsToRemarks(
        cleanRemarks,
        cutsPayload,
        motherPcs,
        yieldPct,
        totalOffcutMtr,
        effectiveScrapMtr + totalTrimScrapMtr,
        totalScrapMt,
        scrapPct,
        l1 || entry.l1,
        l2 || entry.l2
      );

      const res = await fetch('/api/production/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: entry.id,
          process_date: processDate,
          input_qty: totalMotherMtr,
          output_qty: totalPrimeCutMtr,
          output_pcs: totalPrimeCutPcs,
          rejection_qty: nRejMtr,
          rejection_pcs: nRejPcs,
          heat_lot_no: heatLotNo.trim() || null,
          remarks: finalRemarks,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to update Band Saw cut log.');
      }

      toast.success('Band Saw cut log updated successfully.');
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Update error:', err);
      setError(err?.message || 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      title={
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-500/20 shrink-0">
            <Scissors size={20} className="rotate-90" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-[11px] font-bold text-indigo-700">
                Band Saw Work Center
              </span>
              <span className="text-xs font-semibold text-slate-500">Edit Cut Entry</span>
            </div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900 mt-0.5">
              Edit Pipe Cut Log — WO #{entry.work_order_no}
            </h3>
          </div>
        </div>
      }
      onClose={onClose}
      maxWidth="4xl"
    >
      <div className="p-5 sm:p-6 space-y-5 text-xs sm:text-sm">
        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50/90 p-3.5 text-rose-800 flex items-start gap-2.5">
            <AlertCircle size={17} className="text-rose-600 shrink-0 mt-0.5" />
            <span className="font-semibold text-xs">{error}</span>
          </div>
        )}

        {/* Section 1: Full Work Order & Metallurgy Profile Header */}
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-2.5">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-extrabold text-slate-900">
                WO #{entry.work_order_no}
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10.5px] font-bold bg-indigo-100/80 text-indigo-800 border border-indigo-200">
                {entry.route_code || queueRow?.route_code || 'CDS'} Route
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1 font-medium">
                <User size={13} className="text-slate-400" />
                Logged by: <strong className="text-slate-700">{entry.operator_name || 'Operator'}</strong>
              </span>
              <span className="text-slate-300">•</span>
              <span className="font-mono text-[11px] text-slate-600">
                {entry.process_date?.slice(0, 10)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-0.5">
            <div>
              <span className="text-[11px] text-slate-500 font-medium block">Customer</span>
              <span className="font-semibold text-slate-800 truncate block text-xs sm:text-sm">
                {entry.customer_name || queueRow?.customer_name || 'Standard'}
              </span>
            </div>
            <div>
              <span className="text-[11px] text-slate-500 font-medium block">Steel Grade</span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold bg-slate-200/70 text-slate-800 border border-slate-300/80 truncate max-w-full">
                {gradeLabel}
              </span>
            </div>
            <div>
              <span className="text-[11px] text-slate-500 font-medium block">Pipe Size (OD × WT)</span>
              <span className="font-mono font-bold text-slate-800 text-xs sm:text-sm">
                {pipeOd} × {pipeWt} mm
              </span>
            </div>
            <div>
              <span className="text-[11px] text-slate-500 font-medium block">Target Order Length</span>
              <span className="font-mono font-bold text-indigo-700 text-xs sm:text-sm">
                {targetOrderLenStr}
              </span>
            </div>
          </div>
        </div>

        {/* Section 2: Original Logged Values Reference Card */}
        <div className="rounded-xl border border-amber-200/90 bg-amber-50/70 p-3.5 flex items-start gap-3 text-amber-900">
          <Info size={17} className="text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1 w-full">
            <div className="flex items-center justify-between">
              <strong className="font-semibold text-amber-950">Original Logged Entry Baseline:</strong>
              <button
                type="button"
                onClick={handleResetToBaseline}
                className="text-[11px] font-semibold text-amber-700 hover:text-amber-900 underline flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw size={11} /> Reset to Original
              </button>
            </div>
            <p className="text-amber-800 leading-relaxed">
              Processed{' '}
              <strong className="font-mono font-bold">{parsed.motherPcs || initialMotherPcs} Mother Pipes</strong>{' '}
              ({fmt(originalInputMtr || totalMotherMtr)}m) → Produced{' '}
              <strong className="font-mono font-bold">
                {fmt(originalOutputMtr)}m ({originalOutputPcs} PCS)
              </strong>{' '}
              Prime Cuts. Recorded Scrap:{' '}
              <span className="font-mono font-semibold">{parsed.scrapMtr !== null ? fmt(parsed.scrapMtr, 'm') : '0m'}</span>.
              {entry.heat_lot_no && (
                <>
                  {' '}Heat/Lot:{' '}
                  <span className="font-mono font-bold bg-amber-100 px-1 py-0.5 rounded border border-amber-300">
                    {entry.heat_lot_no}
                  </span>
                </>
              )}
            </p>
          </div>
        </div>

        {/* Section 3: Mother Pipes Processed & Incoming Stock */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700">
              <Layers size={14} className="text-indigo-600" />
              1. Mother Pipes In &amp; Cutting Date
            </h4>
            <span className="text-[11px] text-slate-500 font-medium">
              Feeder:{' '}
              <strong className="text-slate-700">
                {queueRow?.feeder_source_label || 'Heat Treatment Net Output'}
              </strong>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                Cutting Date <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  type="date"
                  value={processDate}
                  onChange={(e) => setProcessDate(e.target.value)}
                  className="pl-9 h-9 text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                Mother Pipes Consumed (Nos) <span className="text-rose-500">*</span>
              </label>
              <Input
                type="number"
                min="1"
                value={motherPcs}
                onChange={(e) => setMotherPcs(Math.max(1, Number(e.target.value) || 1))}
                className="h-9 text-xs font-mono font-bold"
                placeholder="e.g. 5"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                Mother Pipe Avg Length (Mtr) <span className="text-rose-500">*</span>
              </label>
              <Input
                type="number"
                step="0.01"
                min="1.0"
                max="15"
                value={motherAvgLenInput}
                onChange={(e) => setMotherAvgLenInput(e.target.value)}
                className="h-9 text-xs font-mono font-bold"
                placeholder="e.g. 6.00"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                Total In: <strong className="font-mono text-slate-700">{totalMotherMtr.toFixed(2)}m</strong> (
                {fmt(totalMotherMt, 3)} MT)
              </span>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                Heat / Lot Number
              </label>
              <Input
                type="text"
                placeholder="e.g. 54210 / B-12"
                value={heatLotNo}
                onChange={(e) => setHeatLotNo(e.target.value)}
                className="h-9 text-xs font-mono"
              />
            </div>
          </div>
        </div>

        {/* Section 4: Cut Lengths & Piece Quantities */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <Scissors size={13} className="text-indigo-600" />
              2. Cut Lengths &amp; Piece Quantities
            </label>
            <div className="flex items-center gap-2">
              {l1 > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleAddCutItem(l1)}
                  className="h-7 text-[11px] gap-1 border-amber-300 text-amber-800 hover:bg-amber-50"
                >
                  <Sparkles size={11} />
                  Add Target ({l1}m)
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleAddCutItem()}
                className="h-7 text-xs gap-1 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
              >
                <Plus size={13} />
                Add Cut Size
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">#</th>
                  <th className="py-2.5 px-3">Length (MTR)</th>
                  <th className="py-2.5 px-3">Cut Pieces (Nos)</th>
                  <th className="py-2.5 px-3">Classification</th>
                  <th className="py-2.5 px-3 text-right">Subtotal Length (m)</th>
                  <th className="py-2.5 px-3 text-right">Weight (MT)</th>
                  <th className="py-2.5 px-2 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {cutItems.map((item, idx) => {
                  const subMtr = Number((item.length_mtr * item.cut_pcs).toFixed(2));
                  const subMt = mtFromMtr(subMtr, pipeOd, pipeWt);
                  const isMatchingOrderTarget = l1 > 0 && Math.abs(item.length_mtr - l1) < 0.2;

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-2 px-3 font-mono text-slate-400 font-bold">{idx + 1}</td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-1.5">
                          <Input
                            type="number"
                            step="0.01"
                            min="0.5"
                            max="15"
                            value={item.length_mtr}
                            onChange={(e) =>
                              handleUpdateItem(item.id, 'length_mtr', Number(e.target.value) || 0)
                            }
                            className="h-8 text-xs font-mono font-bold w-28"
                          />
                          {isMatchingOrderTarget && (
                            <span
                              className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1 rounded shrink-0"
                              title="Matches customer order target length"
                            >
                              Target
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <Input
                          type="number"
                          min="1"
                          value={item.cut_pcs}
                          onChange={(e) =>
                            handleUpdateItem(item.id, 'cut_pcs', Number(e.target.value) || 0)
                          }
                          className="h-8 text-xs font-mono font-bold w-24"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <select
                          value={item.cut_category}
                          onChange={(e) =>
                            handleUpdateItem(item.id, 'cut_category', e.target.value as any)
                          }
                          className="h-8 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                        >
                          <option value="PRIME">PRIME (Order Piece)</option>
                          <option value="SECONDARY">SECONDARY</option>
                          <option value="OFFCUT">OFFCUT (≥ 3.0m Usable)</option>
                          <option value="SCRAP_TRIM">SCRAP / CROP (&lt; 3.0m)</option>
                        </select>
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                        {subMtr.toFixed(2)} m
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-semibold text-slate-600">
                        {fmt(subMt, 3)} MT
                      </td>
                      <td className="py-2 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.id)}
                          className="text-slate-400 hover:text-rose-600 transition-colors p-1"
                          title="Remove cut row"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 5: Scrap, Offcuts & Defect Rejections */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Scrap Card */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                Cutting Scrap / Kerf
              </label>
              <button
                type="button"
                onClick={() => setIsManualScrap((v) => !v)}
                className="text-[10px] font-bold text-indigo-700 hover:underline"
              >
                {isManualScrap ? 'Switch to Auto' : 'Manual Override'}
              </button>
            </div>
            {isManualScrap ? (
              <Input
                type="number"
                step="0.01"
                min="0"
                value={manualScrapInput}
                onChange={(e) => setManualScrapInput(e.target.value)}
                className="h-8 text-xs font-mono font-bold bg-white"
                placeholder="0.00"
              />
            ) : (
              <div className="h-8 flex items-center justify-between px-2.5 rounded-md bg-white border border-slate-200 font-mono font-bold text-xs text-slate-900">
                <span>{effectiveScrapMtr.toFixed(2)} m</span>
                <span className="text-[10px] text-emerald-700 font-sans font-bold bg-emerald-50 px-1 rounded">
                  Auto-Balanced
                </span>
              </div>
            )}
            <span className="text-[10.5px] text-slate-500 block">
              Scrap Loss: <strong className="font-mono text-slate-800">{fmt(totalScrapMt, 3)} MT</strong> (
              {scrapPct.toFixed(1)}%)
            </span>
          </div>

          {/* Defect Rejections Card */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700 block">
              Defect Rejections (Saw Rejects)
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-[10px] text-slate-500 block mb-0.5">Pieces (Nos)</span>
                <Input
                  type="number"
                  min="0"
                  value={rejCutPcs}
                  onChange={(e) => setRejCutPcs(e.target.value)}
                  className="h-8 text-xs font-mono bg-white"
                  placeholder="0"
                />
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block mb-0.5">Meters (m)</span>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={rejCutMtr}
                  onChange={(e) => setRejCutMtr(e.target.value)}
                  className="h-8 text-xs font-mono bg-white"
                  placeholder="0.00"
                />
              </div>
            </div>
            <span className="text-[10.5px] text-slate-500 block">
              Rejection Weight: <strong className="font-mono text-slate-800">{fmt(nRejMt, 3)} MT</strong>
            </span>
          </div>

          {/* Remarks Card */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700 block">
              Operator Remarks &amp; Reason
            </label>
            <Input
              type="text"
              value={cleanRemarks}
              onChange={(e) => setCleanRemarks(e.target.value)}
              placeholder="e.g. Corrected blade loss and cut count"
              className="h-8 text-xs bg-white"
            />
            <span className="text-[10.5px] text-slate-400 block">
              Logged note attached to audit trail
            </span>
          </div>
        </div>

        {/* Section 6: Live Accounting & Mass Balance KPI Bar */}
        <div className="space-y-2">
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="rounded-lg bg-white p-2.5 border border-indigo-100/80 shadow-2xs">
              <span className="text-[10px] uppercase font-bold text-indigo-600 block">Prime Cut Output</span>
              <span className="text-lg font-mono font-bold text-indigo-900 mt-0.5 block">
                {totalPrimeCutPcs} PCS
              </span>
              <span className="text-[11px] font-mono text-indigo-700 font-semibold block">
                {totalPrimeCutMtr.toFixed(2)} m
              </span>
            </div>
            <div className="rounded-lg bg-white p-2.5 border border-indigo-100/80 shadow-2xs">
              <span className="text-[10px] uppercase font-bold text-slate-600 block">Prime Weight</span>
              <span className="text-lg font-mono font-bold text-slate-900 mt-0.5 block">
                {fmt(totalPrimeCutMt, 3)} MT
              </span>
              <span className="text-[11px] text-slate-500 block">
                Order Target: {targetOrderLenStr}
              </span>
            </div>
            <div className="rounded-lg bg-white p-2.5 border border-indigo-100/80 shadow-2xs">
              <span className="text-[10px] uppercase font-bold text-amber-700 block">Cutting Scrap &amp; Kerf</span>
              <span className="text-lg font-mono font-bold text-amber-950 mt-0.5 block">
                {effectiveScrapMtr.toFixed(2)} m
              </span>
              <span className="text-[11px] font-mono text-amber-800 block">
                {fmt(totalScrapMt, 3)} MT ({scrapPct.toFixed(1)}%)
              </span>
            </div>
            <div className="rounded-lg bg-white p-2.5 border border-indigo-100/80 shadow-2xs">
              <span className="text-[10px] uppercase font-bold text-emerald-600 block">Yield Efficiency</span>
              <span className="text-lg font-mono font-bold text-emerald-700 mt-0.5 block">
                {yieldPct.toFixed(1)}%
              </span>
              <span className="text-[11px] text-emerald-600 font-medium block">
                {totalOffcutMtr > 0 ? `+${fmt(totalOffcutMtr, 'm')} Offcut` : 'Zero Offcut Loss'}
              </span>
            </div>
          </div>

          {/* Mass Balance Indicator Banner */}
          <div
            className={`rounded-xl border p-3 flex items-center justify-between text-xs font-semibold ${
              isBalanced
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : balanceDiff > 0
                ? 'bg-amber-50 border-amber-200 text-amber-900'
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}
          >
            <div className="flex items-center gap-2">
              {isBalanced ? (
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle size={16} className="text-amber-600 shrink-0" />
              )}
              <span>
                {isBalanced
                  ? `✓ Material 100% Balanced: Total Mother In (${totalMotherMtr.toFixed(2)}m) = Prime (${totalPrimeCutMtr.toFixed(2)}m) + Offcut (${totalOffcutMtr.toFixed(2)}m) + Scrap (${effectiveScrapMtr.toFixed(2)}m)`
                  : balanceDiff > 0
                  ? `ℹ Remainder: ${balanceDiff.toFixed(2)}m unaccounted from mother pipes. Adjust cuts or scrap.`
                  : `⚠ Notice: Cut pieces & scrap exceed mother pipes by ${Math.abs(balanceDiff).toFixed(2)}m.`}
              </span>
            </div>
            <span className="font-mono text-[11px] tabular-nums">
              Accounted: {totalAccountedMtr.toFixed(2)} / {totalMotherMtr.toFixed(2)} m
            </span>
          </div>
        </div>

        {/* Modal Action Buttons */}
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-sm"
          >
            {saving ? 'Saving Changes...' : 'Save Cut Corrections'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default BandSawEditModal;
