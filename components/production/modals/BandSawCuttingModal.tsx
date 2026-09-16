'use client';

import React, { useState, useMemo } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Row, BandSawCutItem, BandSawCutCategory } from '@/types';
import {
  n,
  fmt,
  mtFromMtr,
  mtrFromPcs,
  attachBandSawCutsToRemarks,
  extractBandSawCutsFromRemarks,
} from '@/lib/productionUtils';
import {
  Scissors,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Layers,
  ArrowRight,
  TrendingUp,
  Percent,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';

export interface BandSawCuttingModalProps {
  row: Row;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  processDate?: string;
}

export function BandSawCuttingModal({
  row,
  isOpen,
  onClose,
  onSuccess,
  processDate: initialDate,
}: BandSawCuttingModalProps) {
  // Mother hollow / pipe dimensions
  const pipeOd = Number(row.od || 0);
  const pipeWt = Number(row.wl || 0);

  // Available mother pipes from queue
  const availMotherPcs = Math.max(0, Math.round(Number(row.balance_to_make_pcs || 0)));
  const availMotherMtr = Math.max(0, Number(row.balance_to_make_mtr || 0));

  // Default initial mother pipe average length
  const defaultMotherLen = (() => {
    const l1 = Number(row.l1 || 0);
    const l2 = Number(row.l2 || 0);
    if (l1 > 0 && l2 > 0) return (l1 + l2) / 2;
    if (l1 > 0) return l1;
    if (availMotherPcs > 0 && availMotherMtr > 0) return Number((availMotherMtr / availMotherPcs).toFixed(2));
    return Number(row.avg_length || 6.0);
  })();

  const [date, setDate] = useState(() => {
    if (initialDate) return initialDate;
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  });

  // Mother pipes input state
  const [motherPcsInput, setMotherPcsInput] = useState<string>(
    availMotherPcs > 0 ? String(availMotherPcs) : '1'
  );
  const [motherAvgLenInput, setMotherAvgLenInput] = useState<string>(
    String(defaultMotherLen > 0 ? defaultMotherLen : 6.0)
  );

  // Multi-length cut items list
  const [cutItems, setCutItems] = useState<BandSawCutItem[]>(() => {
    const defaultCutLen = defaultMotherLen > 0 ? defaultMotherLen : 6.0;
    return [
      {
        id: 'cut-1',
        length_mtr: Number(defaultCutLen.toFixed(2)),
        cut_pcs: availMotherPcs > 0 ? availMotherPcs : 1,
        cut_category: 'PRIME',
        total_mtr: Number((defaultCutLen * (availMotherPcs > 0 ? availMotherPcs : 1)).toFixed(2)),
      },
    ];
  });

  // Rejection / Defect cut pieces
  const [rejCutPcs, setRejCutPcs] = useState<string>('0');
  const [rejCutMtr, setRejCutMtr] = useState<string>('0');
  const [heatLotNo, setHeatLotNo] = useState<string>(row.heat_lot_no || '');
  const [remarks, setRemarks] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Computations
  const motherPcsNum = Math.max(0, parseInt(motherPcsInput, 10) || 0);
  const motherAvgLenNum = Math.max(0, parseFloat(motherAvgLenInput) || 0);
  const totalMotherMtr = Number((motherPcsNum * motherAvgLenNum).toFixed(2));
  const totalMotherMt = mtFromMtr(totalMotherMtr, pipeOd, pipeWt);

  // Total cuts calculation
  const { totalPrimeCutPcs, totalPrimeCutMtr, totalPrimeCutMt, totalAllCutMtr, totalOffcutMtr } =
    useMemo(() => {
      let primePcs = 0;
      let primeMtr = 0;
      let allMtr = 0;
      let offcutM = 0;

      cutItems.forEach((c) => {
        const len = Number(c.length_mtr || 0);
        const pcs = Number(c.cut_pcs || 0);
        const mtr = Number((len * pcs).toFixed(2));
        allMtr += mtr;

        if (c.cut_category === 'PRIME' || c.cut_category === 'SECONDARY') {
          primePcs += pcs;
          primeMtr += mtr;
        } else if (c.cut_category === 'OFFCUT' || c.cut_category === 'SCRAP_TRIM') {
          offcutM += mtr;
        }
      });

      const primeMt = mtFromMtr(primeMtr, pipeOd, pipeWt);
      return {
        totalPrimeCutPcs: primePcs,
        totalPrimeCutMtr: Number(primeMtr.toFixed(2)),
        totalPrimeCutMt: primeMt,
        totalAllCutMtr: Number(allMtr.toFixed(2)),
        totalOffcutMtr: Number(offcutM.toFixed(2)),
      };
    }, [cutItems, pipeOd, pipeWt]);

  // Rejections
  const nRejPcs = Math.max(0, parseInt(rejCutPcs, 10) || 0);
  const nRejMtr = Math.max(
    0,
    parseFloat(rejCutMtr) || (nRejPcs > 0 && motherAvgLenNum > 0 ? nRejPcs * motherAvgLenNum : 0)
  );
  const nRejMt = mtFromMtr(nRejMtr, pipeOd, pipeWt);

  // Net good cuts feeding VDI
  const netVdiFeedPcs = Math.max(0, totalPrimeCutPcs - nRejPcs);
  const netVdiFeedMtr = Math.max(0, Number((totalPrimeCutMtr - nRejMtr).toFixed(2)));
  const netVdiFeedMt = mtFromMtr(netVdiFeedMtr, pipeOd, pipeWt);

  // Yield calculation
  const yieldPct = totalMotherMtr > 0 ? Math.min(100, Math.max(0, (netVdiFeedMtr / totalMotherMtr) * 100)) : 100;
  const unaccountedMtr = Math.max(0, Number((totalMotherMtr - totalAllCutMtr - nRejMtr).toFixed(2)));

  // Handlers for Cut Items
  const handleAddCutItem = () => {
    const defaultLen = Number((defaultMotherLen > 0 ? defaultMotherLen : 6.0).toFixed(2));
    const newItem: BandSawCutItem = {
      id: `cut-${Date.now()}`,
      length_mtr: defaultLen,
      cut_pcs: 1,
      cut_category: 'PRIME',
      total_mtr: defaultLen,
      total_mt: mtFromMtr(defaultLen, pipeOd, pipeWt),
    };
    setCutItems((prev) => [...prev, newItem]);
  };

  const handleUpdateCutItem = (
    id: string,
    field: keyof BandSawCutItem,
    val: string | number | BandSawCutCategory
  ) => {
    setCutItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const updated = { ...item, [field]: val };
        const len = Number(updated.length_mtr || 0);
        const pcs = Number(updated.cut_pcs || 0);
        updated.total_mtr = Number((len * pcs).toFixed(2));
        updated.total_mt = mtFromMtr(updated.total_mtr, pipeOd, pipeWt);
        return updated;
      })
    );
  };

  const handleRemoveCutItem = (id: string) => {
    if (cutItems.length === 1) {
      toast.info('At least one cut length row is required.');
      return;
    }
    setCutItems((prev) => prev.filter((item) => item.id !== id));
  };

  // Submit Cutting Log
  const handleSubmit = async () => {
    setError(null);
    if (motherPcsNum <= 0) {
      setError('Please enter valid Mother Pipes Processed (≥ 1).');
      return;
    }
    if (totalPrimeCutPcs <= 0 && totalPrimeCutMtr <= 0) {
      setError('Please specify at least one cut length item with positive pieces.');
      return;
    }
    if (totalAllCutMtr > totalMotherMtr * 1.15) {
      setError(
        `Total cut length (${totalAllCutMtr}m) significantly exceeds mother pipe length (${totalMotherMtr}m). Please verify cut pieces.`
      );
      return;
    }

    setSaving(true);
    try {
      // Serialize multi-cut JSON into remarks
      const finalRemarks = attachBandSawCutsToRemarks(
        remarks,
        cutItems,
        motherPcsNum,
        yieldPct,
        totalOffcutMtr + unaccountedMtr,
        row.l1,
        row.l2
      );

      const payload = {
        entries: [
          {
            work_order_id: row.work_order_id,
            route_id: row.route_id,
            rolling_plan_id: row.plan_id || null,
            stage_code: 'BAND_SAW',
            input_qty: totalMotherMtr,
            output_qty: totalPrimeCutMtr,
            rejection_qty: nRejMtr,
            output_pcs: totalPrimeCutPcs,
            rejection_pcs: nRejPcs,
            heat_lot_no: heatLotNo || null,
            remarks: finalRemarks,
            input_l1: row.l1 ? String(row.l1) : null,
            input_l2: row.l2 ? String(row.l2) : null,
          },
        ],
        p_process_date: date,
      };

      const res = await fetch('/api/production/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to record Band Saw cutting log.');
      }

      toast.success(
        `Band Saw cut recorded: ${totalPrimeCutPcs} cut pieces (${totalPrimeCutMtr}m) sent to VDI QC queue!`,
        { duration: 4000 }
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Failed to record band saw cutting:', err);
      setError(err?.message || 'Failed to record Band Saw cutting.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal onClose={onClose} maxWidth="4xl" title="Band Saw Pipe Cutting & Multi-Length Station">
      <div className="space-y-6">
        {/* Work Order Information Banner */}
        <div className="rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50/90 via-blue-50/70 to-slate-50 p-4.5 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-bold text-white shadow-2xs">
                  <Scissors size={13} className="rotate-90" />
                  Band Saw Cutting Station
                </span>
                <span className="font-mono text-base font-bold text-slate-900">
                  WO #{row.work_order_no}
                </span>
                {row.route_code && (
                  <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-700">
                    {row.route_code}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600">
                {row.customer_name ? (
                  <span className="font-medium text-slate-800">{row.customer_name}</span>
                ) : (
                  'Standard Order'
                )}{' '}
                • Grade: <span className="font-semibold text-slate-800">{row.specification || 'SAE-1018'}</span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-right">
              <div className="rounded-lg border border-slate-200/80 bg-white/90 px-3 py-1.5 shadow-2xs">
                <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Pipe Size (OD × WT)</div>
                <div className="font-mono text-xs font-bold text-slate-800">
                  {pipeOd} mm × {pipeWt} mm
                </div>
              </div>
              <div className="rounded-lg border border-indigo-200 bg-indigo-50/80 px-3 py-1.5 shadow-2xs">
                <div className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider">
                  Available to Cut
                </div>
                <div className="font-mono text-xs font-extrabold text-indigo-950">
                  {availMotherPcs} PCS <span className="font-normal text-indigo-700">({fmt(availMotherMtr)} m)</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Section 1: Mother Pipe Processing Inputs */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
              <Layers size={14} className="text-indigo-600" />
              1. Mother Pipes Input (Incoming from Feeder)
            </h4>
            <span className="text-[11px] font-medium text-slate-500">
              Feeder:{' '}
              <strong className="text-slate-700">
                {row.feeder_source_label || 'Heat Treatment Net Output'}
              </strong>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-700">
                Mother Pipes Processed (Pcs) <span className="text-rose-500">*</span>
              </label>
              <Input
                type="number"
                min="1"
                max={availMotherPcs > 0 ? availMotherPcs * 2 : 9999}
                value={motherPcsInput}
                onChange={(e) => setMotherPcsInput(e.target.value)}
                className="h-9 font-mono text-xs font-semibold focus:border-indigo-500 focus:ring-indigo-500"
                placeholder="e.g. 10"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-700">
                Mother Pipe Avg Length (Mtr) <span className="text-rose-500">*</span>
              </label>
              <Input
                type="number"
                step="0.01"
                min="0.5"
                value={motherAvgLenInput}
                onChange={(e) => setMotherAvgLenInput(e.target.value)}
                className="h-9 font-mono text-xs font-semibold focus:border-indigo-500 focus:ring-indigo-500"
                placeholder="e.g. 12.00"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-500">
                Total Mother Input Length
              </label>
              <div className="flex h-9 items-center rounded-md border border-slate-200 bg-white px-3 font-mono text-xs font-bold text-slate-800 shadow-2xs">
                {fmt(totalMotherMtr)} MTR
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-500">
                Total Mother Input Tonnes
              </label>
              <div className="flex h-9 items-center rounded-md border border-slate-200 bg-white px-3 font-mono text-xs font-bold text-slate-800 shadow-2xs">
                {fmt(totalMotherMt, 3)} MT
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Multi-Length Cutting Schedule Table */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3">
            <div>
              <h4 className="flex items-center gap-2 text-xs font-bold text-slate-900 uppercase tracking-wider">
                <Scissors size={14} className="text-indigo-600" />
                2. Multi-Length Cut Schedule
              </h4>
              <p className="text-[11px] text-slate-500">
                Define the multiple cut segments produced per mother pipe batch.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddCutItem}
              className="h-8 gap-1.5 border-indigo-200 bg-indigo-50/50 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
            >
              <Plus size={14} />
              Add Cut Length
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-100 bg-slate-50 text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">#</th>
                  <th className="py-2.5 px-3 min-w-[130px]">Cut Length (Mtr)</th>
                  <th className="py-2.5 px-3 min-w-[110px]">Cut Nos (Pcs)</th>
                  <th className="py-2.5 px-3 min-w-[130px]">Category</th>
                  <th className="py-2.5 px-3 text-right">Total Meters</th>
                  <th className="py-2.5 px-3 text-right">Total Weight (MT)</th>
                  <th className="py-2.5 px-3 text-center w-12">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {cutItems.map((item, idx) => {
                  const itemMtr = Number(((item.length_mtr || 0) * (item.cut_pcs || 0)).toFixed(2));
                  const itemMt = mtFromMtr(itemMtr, pipeOd, pipeWt);

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-2.5 px-3 text-slate-400 font-mono text-xs">{idx + 1}</td>
                      <td className="py-2 px-3">
                        <Input
                          type="number"
                          step="0.01"
                          min="0.1"
                          value={item.length_mtr || ''}
                          onChange={(e) =>
                            handleUpdateCutItem(item.id, 'length_mtr', parseFloat(e.target.value) || 0)
                          }
                          className="h-8 font-mono text-xs font-semibold"
                          placeholder="e.g. 6.00"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <Input
                          type="number"
                          min="1"
                          value={item.cut_pcs || ''}
                          onChange={(e) =>
                            handleUpdateCutItem(item.id, 'cut_pcs', parseInt(e.target.value, 10) || 0)
                          }
                          className="h-8 font-mono text-xs font-semibold"
                          placeholder="e.g. 2"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <select
                          value={item.cut_category}
                          onChange={(e) =>
                            handleUpdateCutItem(
                              item.id,
                              'cut_category',
                              e.target.value as BandSawCutCategory
                            )
                          }
                          className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-800 shadow-2xs focus:border-indigo-500 focus:outline-hidden"
                        >
                          <option value="PRIME">Prime Pipe Cut</option>
                          <option value="SECONDARY">Secondary / Multiple Length</option>
                          <option value="OFFCUT">Usable Off-Cut (≥4m)</option>
                          <option value="SCRAP_TRIM">End Trim / Scrap (&lt;4m)</option>
                        </select>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-800">
                        {fmt(itemMtr)} m
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                        {fmt(itemMt, 3)} MT
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveCutItem(item.id)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                          title="Remove cut row"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Table Summary Strip */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 bg-slate-50/90 px-4 py-3 text-xs">
            <div className="flex items-center gap-4">
              <div>
                <span className="text-slate-500 font-medium">Total Cut Pieces: </span>
                <span className="font-mono font-bold text-indigo-700 text-sm">
                  {totalPrimeCutPcs} PCS
                </span>
              </div>
              <div>
                <span className="text-slate-500 font-medium">Total Cut Length: </span>
                <span className="font-mono font-bold text-slate-900 text-sm">
                  {fmt(totalPrimeCutMtr)} MTR
                </span>
              </div>
              <div>
                <span className="text-slate-500 font-medium">Total Cut Weight: </span>
                <span className="font-mono font-bold text-slate-900 text-sm">
                  {fmt(totalPrimeCutMt, 3)} MT
                </span>
              </div>
            </div>

            {/* Yield & Efficiency Gauge */}
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-semibold text-slate-600">Cutting Yield:</span>
              <div className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-0.5 shadow-2xs">
                <div
                  className={`h-2 w-2 rounded-full ${
                    yieldPct >= 92 ? 'bg-emerald-500' : yieldPct >= 80 ? 'bg-amber-500' : 'bg-rose-500'
                  }`}
                />
                <span
                  className={`font-mono text-xs font-bold ${
                    yieldPct >= 92
                      ? 'text-emerald-700'
                      : yieldPct >= 80
                      ? 'text-amber-700'
                      : 'text-rose-700'
                  }`}
                >
                  {yieldPct.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Rejections, Offcuts & VDI Handover Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Rejection & Scrap Details */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <AlertCircle size={14} className="text-amber-600" />
              Rejection & Defect Cuts
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                  Rejection Pieces (Nos)
                </label>
                <Input
                  type="number"
                  min="0"
                  value={rejCutPcs}
                  onChange={(e) => {
                    const val = e.target.value;
                    setRejCutPcs(val);
                    const nVal = parseInt(val, 10) || 0;
                    if (nVal > 0 && motherAvgLenNum > 0) {
                      setRejCutMtr(String(Number((nVal * motherAvgLenNum).toFixed(2))));
                    } else if (nVal === 0) {
                      setRejCutMtr('0');
                    }
                  }}
                  className="h-8 font-mono text-xs font-semibold"
                  placeholder="0"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                  Rejection Meters (Mtr)
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={rejCutMtr}
                  onChange={(e) => setRejCutMtr(e.target.value)}
                  className="h-8 font-mono text-xs font-semibold"
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                  Process Date
                </label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="h-8 text-xs font-medium"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                  Heat / Lot No.
                </label>
                <Input
                  type="text"
                  value={heatLotNo}
                  onChange={(e) => setHeatLotNo(e.target.value)}
                  className="h-8 text-xs font-medium"
                  placeholder="e.g. HT-9821"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                Operator Remarks
              </label>
              <Input
                type="text"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                className="h-8 text-xs font-medium"
                placeholder="e.g. Clean cuts, square ends checked"
              />
            </div>
          </div>

          {/* VDI Handover Summary Card */}
          <div className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50/80 to-blue-50/50 p-4 shadow-2xs flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-2 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider">
                  <ArrowRight size={12} />
                  Feeds into VDI QC Inspection
                </span>
                <span className="text-[11px] font-bold text-indigo-900">Total Cut Net Output</span>
              </div>

              <div className="rounded-lg border border-indigo-200/80 bg-white p-3.5 shadow-2xs space-y-2">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="text-xs text-slate-600">Total Cut Pieces (Nos):</span>
                  <span className="font-mono text-base font-extrabold text-indigo-950">
                    {netVdiFeedPcs} PCS
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="text-xs text-slate-600">Total Cut Length (Mtr):</span>
                  <span className="font-mono text-xs font-bold text-slate-800">
                    {fmt(netVdiFeedMtr)} MTR
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-600">Total Cut Weight (MT):</span>
                  <span className="font-mono text-xs font-bold text-slate-800">
                    {fmt(netVdiFeedMt, 3)} MT
                  </span>
                </div>
              </div>

              <div className="text-[11px] text-slate-600 bg-white/60 rounded-md p-2 border border-slate-200/50">
                <p>
                  ✓ These <strong>{netVdiFeedPcs} Total Cut Nos</strong> will immediately appear in the{' '}
                  <strong className="text-indigo-800">VDI / QC Inspection Queue</strong> for visual and dimensional check.
                </p>
              </div>
            </div>

            {error && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-800">
                <AlertCircle size={14} className="mt-0.5 text-rose-600 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSubmit}
            disabled={saving || totalPrimeCutPcs <= 0}
            className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs font-semibold px-4"
          >
            {saving ? (
              'Recording Cutting...'
            ) : (
              <>
                <Scissors size={14} className="rotate-90" />
                Save &amp; Send to VDI QC ({netVdiFeedPcs} Cut Pcs)
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default BandSawCuttingModal;
