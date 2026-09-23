'use client';

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
} from 'lucide-react';
import { toast } from 'sonner';
import { ProductionEntry } from '@/types';
import {
  fmt,
  mtFromMtr,
  extractBandSawCutsFromRemarks,
  attachBandSawCutsToRemarks,
} from '@/lib/productionUtils';

interface CutRowItem {
  id: string;
  length_mtr: number;
  cut_pcs: number;
  cut_category: 'PRIME' | 'SECONDARY' | 'OFFCUT' | 'SCRAP_TRIM';
}

export interface BandSawEditModalProps {
  entry: ProductionEntry;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function BandSawEditModal({
  entry,
  isOpen,
  onClose,
  onSuccess,
}: BandSawEditModalProps) {
  const pipeOd = Number(entry.od || 0);
  const pipeWt = Number(entry.wl || 0);

  // Parse existing remarks & cuts
  const parsed = useMemo(() => {
    return extractBandSawCutsFromRemarks(entry.remarks);
  }, [entry.remarks]);

  const [processDate, setProcessDate] = useState(entry.process_date.slice(0, 10));
  const [motherPcs, setMotherPcs] = useState<number>(
    parsed.motherPcs || (entry.output_pcs ? Number(entry.output_pcs) : 1)
  );

  // Initialize cut items
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
    const avgLen = Number(entry.avg_length || entry.l1 || 6.0);
    const pcs = entry.output_pcs ? Number(entry.output_pcs) : 1;
    return [
      {
        id: `cut-default`,
        length_mtr: avgLen,
        cut_pcs: pcs,
        cut_category: 'PRIME',
      },
    ];
  });

  const [scrapMtrManual, setScrapMtrManual] = useState<string>(
    parsed.scrapMtr !== null && parsed.scrapMtr !== undefined ? String(parsed.scrapMtr) : '0'
  );
  const [cleanRemarks, setCleanRemarks] = useState(parsed.cleanRemarks || '');
  const [heatLotNo, setHeatLotNo] = useState(entry.heat_lot_no || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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

  const scrapMtr = Math.max(0, Number(scrapMtrManual) || 0);
  const totalScrapMt = mtFromMtr(scrapMtr, pipeOd, pipeWt);
  const totalPrimeCutMt = mtFromMtr(totalPrimeCutMtr, pipeOd, pipeWt);

  const totalAllMtr = totalPrimeCutMtr + totalOffcutMtr + scrapMtr;
  const yieldPct = totalAllMtr > 0 ? (totalPrimeCutMtr / totalAllMtr) * 100 : 96.5;
  const scrapPct = totalAllMtr > 0 ? (scrapMtr / totalAllMtr) * 100 : 3.5;

  // Handlers for cut table
  const handleAddCutItem = () => {
    const defaultLen = entry.l1 ? Number(entry.l1) : 5.8;
    setCutItems((prev) => [
      ...prev,
      {
        id: `cut-${Date.now()}`,
        length_mtr: defaultLen,
        cut_pcs: 1,
        cut_category: 'PRIME',
      },
    ]);
  };

  const handleUpdateItem = (id: string, field: keyof CutRowItem, val: any) => {
    setCutItems((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [field]: val } : c))
    );
  };

  const handleRemoveItem = (id: string) => {
    if (cutItems.length <= 1) {
      toast.error('At least one cut item is required.');
      return;
    }
    setCutItems((prev) => prev.filter((c) => c.id !== id));
  };

  const handleSave = async () => {
    if (totalPrimeCutPcs <= 0 && totalOffcutPcs <= 0) {
      setError('Please enter at least 1 valid cut piece.');
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
        scrapMtr,
        totalScrapMt,
        scrapPct,
        entry.l1,
        entry.l2
      );

      const res = await fetch('/api/production/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: entry.id,
          process_date: processDate,
          output_qty: totalPrimeCutMtr,
          output_pcs: totalPrimeCutPcs,
          rejection_qty: scrapMtr,
          rejection_pcs: 0,
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
      maxWidth="2xl"
    >
      <div className="p-5 sm:p-6 space-y-5 text-xs sm:text-sm">
        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50/90 p-3.5 text-rose-800 flex items-start gap-2.5">
            <AlertCircle size={17} className="text-rose-600 shrink-0 mt-0.5" />
            <span className="font-semibold text-xs">{error}</span>
          </div>
        )}

        {/* Work Order Info Bar */}
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <span className="text-[11px] text-slate-500 font-medium block">Customer</span>
            <span className="font-semibold text-slate-800 truncate block">
              {entry.customer_name || 'Standard'}
            </span>
          </div>
          <div>
            <span className="text-[11px] text-slate-500 font-medium block">Pipe Size</span>
            <span className="font-mono font-bold text-slate-800">
              {entry.od} × {entry.wl} mm
            </span>
          </div>
          <div>
            <span className="text-[11px] text-slate-500 font-medium block">Order Target Length</span>
            <span className="font-mono font-bold text-indigo-700">
              {entry.l1 ? `${entry.l1}${entry.l2 ? ` - ${entry.l2}` : ''} MTR` : 'Standard'}
            </span>
          </div>
          <div>
            <span className="text-[11px] text-slate-500 font-medium block">Initial Logged Qty</span>
            <span className="font-mono font-bold text-slate-800">
              {entry.output_mtr}m ({entry.output_pcs || 0} pcs)
            </span>
          </div>
        </div>

        {/* Date & Mother Pipes Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
              Process Date
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
              Mother Pipes Consumed (Nos)
            </label>
            <Input
              type="number"
              min="1"
              value={motherPcs}
              onChange={(e) => setMotherPcs(Math.max(1, Number(e.target.value) || 1))}
              className="h-9 text-xs font-mono font-bold"
            />
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

        {/* Cut Items Table */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <Scissors size={13} className="text-indigo-600" />
              Cut Lengths &amp; Piece Quantities
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddCutItem}
              className="h-7 text-xs gap-1 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
            >
              <Plus size={13} />
              Add Cut Size
            </Button>
          </div>

          <div className="rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2 px-3">#</th>
                  <th className="py-2 px-3">Length (MTR)</th>
                  <th className="py-2 px-3">Cut Pieces (Nos)</th>
                  <th className="py-2 px-3">Classification</th>
                  <th className="py-2 px-3 text-right">Subtotal (m)</th>
                  <th className="py-2 px-2 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {cutItems.map((item, idx) => {
                  const subMtr = Number((item.length_mtr * item.cut_pcs).toFixed(2));
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/60">
                      <td className="py-2 px-3 font-mono text-slate-400 font-bold">{idx + 1}</td>
                      <td className="py-2 px-3">
                        <Input
                          type="number"
                          step="0.01"
                          min="0.5"
                          value={item.length_mtr}
                          onChange={(e) =>
                            handleUpdateItem(item.id, 'length_mtr', Number(e.target.value) || 0)
                          }
                          className="h-8 text-xs font-mono font-bold w-28"
                        />
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

        {/* Scrap & Remarks Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
              End Crop / Blade Scrap (Meters)
            </label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={scrapMtrManual}
              onChange={(e) => setScrapMtrManual(e.target.value)}
              className="h-9 text-xs font-mono"
              placeholder="0.00"
            />
            <span className="text-[10px] text-slate-400 mt-1 block">
              Equivalent Scrap: {fmt(totalScrapMt, 3)} MT ({scrapPct.toFixed(1)}%)
            </span>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
              Operator Remarks
            </label>
            <Input
              type="text"
              value={cleanRemarks}
              onChange={(e) => setCleanRemarks(e.target.value)}
              placeholder="e.g. Corrected blade loss and cut count"
              className="h-9 text-xs"
            />
          </div>
        </div>

        {/* Live Summary KPI Cards */}
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div className="rounded-lg bg-white p-2.5 border border-indigo-100/80 shadow-2xs">
            <span className="text-[10px] uppercase font-bold text-indigo-600 block">Prime Cut Pieces</span>
            <span className="text-lg font-mono font-bold text-indigo-900 mt-0.5 block">
              {totalPrimeCutPcs} PCS
            </span>
          </div>
          <div className="rounded-lg bg-white p-2.5 border border-indigo-100/80 shadow-2xs">
            <span className="text-[10px] uppercase font-bold text-slate-600 block">Prime Cut Meters</span>
            <span className="text-lg font-mono font-bold text-slate-900 mt-0.5 block">
              {totalPrimeCutMtr.toFixed(2)} m
            </span>
          </div>
          <div className="rounded-lg bg-white p-2.5 border border-indigo-100/80 shadow-2xs">
            <span className="text-[10px] uppercase font-bold text-slate-600 block">Prime Weight</span>
            <span className="text-lg font-mono font-bold text-slate-900 mt-0.5 block">
              {fmt(totalPrimeCutMt, 3)} MT
            </span>
          </div>
          <div className="rounded-lg bg-white p-2.5 border border-indigo-100/80 shadow-2xs">
            <span className="text-[10px] uppercase font-bold text-emerald-600 block">Estimated Yield</span>
            <span className="text-lg font-mono font-bold text-emerald-700 mt-0.5 block">
              {yieldPct.toFixed(1)}%
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
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
          >
            {saving ? 'Saving Changes...' : 'Save Cut Corrections'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default BandSawEditModal;
