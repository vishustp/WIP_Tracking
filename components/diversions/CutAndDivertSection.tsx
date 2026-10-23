'use client';

import React, { useState, useMemo } from 'react';
import { calcCutSplitRemnant, type CutSplitItem } from '@/lib/diversionCalculations';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Scissors, AlertCircle, Plus, Trash2, CheckCircle2, Recycle } from 'lucide-react';

interface WO {
  id: string;
  work_order_no: string;
  customer_name?: string | null;
  grade?: string | null;
  size_od?: number | null;
  size_wt?: number | null;
  od?: number | null;
  wt?: number | null;
}

interface Route {
  id: string;
  route_code: string;
  route_name: string;
}

interface WorkCenter {
  code: string;
  name: string;
}

interface CutAndDivertSectionProps {
  wos: WO[];
  routes: Route[];
  workCenters: WorkCenter[];
  sourceWoId: string;
  sourceStageCode: string;
  defaultMotherLength: number;
  availableStageMtr: number;
  availableStagePcs: number;
  canManagePlans: boolean;
  onExecuteCutDivert: (payload: {
    motherLength: number;
    motherPcs: number;
    splits: CutSplitItem[];
    remnantMtr: number;
    remnantClassification: 'SCRAP' | 'USABLE_OFFCUT';
  }) => Promise<void>;
  busy: boolean;
}

export function CutAndDivertSection({
  wos,
  routes,
  workCenters,
  sourceWoId,
  sourceStageCode,
  defaultMotherLength,
  availableStageMtr,
  availableStagePcs,
  canManagePlans,
  onExecuteCutDivert,
  busy,
}: CutAndDivertSectionProps) {
  const [motherLength, setMotherLength] = useState<string>(
    defaultMotherLength > 0 ? String(defaultMotherLength) : '10.0'
  );
  const [motherPcs, setMotherPcs] = useState<string>(
    availableStagePcs > 0 ? String(Math.min(availableStagePcs, 1)) : '1'
  );

  // Target 1 (Primary Split)
  const [target1Wo, setTarget1Wo] = useState('');
  const [target1Stage, setTarget1Stage] = useState('DRAW');
  const [target1CutLen, setTarget1CutLen] = useState('');

  // Target 2 (Optional Split)
  const [hasTarget2, setHasTarget2] = useState(false);
  const [target2Wo, setTarget2Wo] = useState('');
  const [target2Stage, setTarget2Stage] = useState('BAND_SAW');
  const [target2CutLen, setTarget2CutLen] = useState('');

  const mLen = Number(motherLength) || 0;
  const mPcs = Number(motherPcs) || 0;
  const totalMotherMtr = Number((mLen * mPcs).toFixed(2));

  // Build splits array
  const activeSplits: CutSplitItem[] = useMemo(() => {
    const list: CutSplitItem[] = [];
    if (Number(target1CutLen) > 0) {
      list.push({
        target_wo_id: target1Wo,
        target_stage_code: target1Stage,
        cut_length: Number(target1CutLen),
        cuts_per_pipe: 1,
      });
    }
    if (hasTarget2 && Number(target2CutLen) > 0) {
      list.push({
        target_wo_id: target2Wo,
        target_stage_code: target2Stage,
        cut_length: Number(target2CutLen),
        cuts_per_pipe: 1,
      });
    }
    return list;
  }, [target1Wo, target1Stage, target1CutLen, hasTarget2, target2Wo, target2Stage, target2CutLen]);

  // Remnant analysis
  const remnantResult = useMemo(() => {
    if (mLen <= 0 || activeSplits.length === 0) return null;
    try {
      return calcCutSplitRemnant(mLen, mPcs, activeSplits);
    } catch (err: any) {
      return { error: err.message };
    }
  }, [mLen, mPcs, activeSplits]);

  const isValidToSubmit = useMemo(() => {
    if (busy || !canManagePlans) return false;
    if (mLen <= 0 || mPcs <= 0) return false;
    if (totalMotherMtr > availableStageMtr + 0.01) return false;
    if (!target1Wo || Number(target1CutLen) <= 0) return false;
    if (hasTarget2 && (!target2Wo || Number(target2CutLen) <= 0)) return false;
    if (remnantResult && 'error' in remnantResult) return false;
    return true;
  }, [busy, canManagePlans, mLen, mPcs, totalMotherMtr, availableStageMtr, target1Wo, target1CutLen, hasTarget2, target2Wo, target2CutLen, remnantResult]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidToSubmit || !remnantResult || 'error' in remnantResult) return;

    await onExecuteCutDivert({
      motherLength: mLen,
      motherPcs: mPcs,
      splits: activeSplits,
      remnantMtr: remnantResult.total_remnant_mtr,
      remnantClassification: remnantResult.classification,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* 1. Mother Pipe Inputs */}
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <span className="font-bold text-slate-800 text-xs uppercase flex items-center gap-1.5">
            <Scissors className="h-4 w-4 text-[#0078d4]" />
            1. Source Mother Pipe Parameters (To Cut &amp; Divert)
          </span>
          <span className="text-[11px] font-mono text-slate-500">
            Available: <strong>{availableStagePcs} Pcs</strong> ({availableStageMtr}m)
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Mother Pipe Length (Mtr) *
            </label>
            <Input
              type="number"
              min="1"
              step="0.01"
              value={motherLength}
              onChange={(e) => setMotherLength(e.target.value)}
              required
              className="font-mono font-bold min-h-[44px]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Number of Pipes (Pcs) *
            </label>
            <Input
              type="number"
              min="1"
              max={availableStagePcs || undefined}
              step="1"
              value={motherPcs}
              onChange={(e) => setMotherPcs(e.target.value)}
              required
              className="font-mono font-bold min-h-[44px]"
            />
          </div>

          <div className="rounded bg-slate-50 border border-slate-200 p-2.5 flex flex-col justify-center">
            <span className="text-[10px] text-slate-500 uppercase font-bold">Total Incoming Meters</span>
            <span className="font-mono text-lg font-black text-slate-900">{totalMotherMtr} m</span>
          </div>
        </div>

        {totalMotherMtr > availableStageMtr && (
          <div className="text-xs text-red-700 font-medium flex items-center gap-1.5 bg-red-50 p-2 rounded border border-red-200">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
            Selected {totalMotherMtr}m exceeds available physical WIP ({availableStageMtr}m).
          </div>
        )}
      </div>

      {/* 2. Cut Split 1 (Primary Destination) */}
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/20 p-4 shadow-2xs space-y-3">
        <div className="flex items-center justify-between border-b border-emerald-200/60 pb-2">
          <span className="font-bold text-emerald-900 text-xs uppercase flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-700" />
            2. Cut Split #1 (Primary Target Work Order)
          </span>
          {Number(target1CutLen) > 0 && (
            <span className="font-mono font-bold text-xs text-emerald-800">
              Allocated: {Number((Number(target1CutLen) * mPcs).toFixed(2))} m ({mPcs} pcs @ {target1CutLen}m)
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Target Work Order (1) *
            </label>
            <Select
              value={target1Wo}
              onChange={(e) => setTarget1Wo(e.target.value)}
              required
              className="min-h-[44px]"
            >
              <option value="">Select Target Order...</option>
              {wos
                .filter((w) => w.id !== sourceWoId)
                .map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.work_order_no} · {w.customer_name || 'Generic'} ({w.grade || 'Grade N/A'} · {w.size_od || w.od}×{w.size_wt || w.wt}mm)
                  </option>
                ))}
            </Select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Target Stage *
            </label>
            <Select
              value={target1Stage}
              onChange={(e) => setTarget1Stage(e.target.value)}
              required
              className="min-h-[44px]"
            >
              {workCenters.map((wc) => (
                <option key={wc.code} value={wc.code}>
                  {wc.name}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Cut Length Per Pipe (Mtr) *
            </label>
            <Input
              type="number"
              min="0.5"
              step="0.01"
              placeholder="e.g. 7.00"
              value={target1CutLen}
              onChange={(e) => setTarget1CutLen(e.target.value)}
              required
              className="font-mono font-bold min-h-[44px]"
            />
          </div>
        </div>
      </div>

      {/* 3. Cut Split 2 (Optional Secondary Destination) */}
      {!hasTarget2 ? (
        <button
          type="button"
          onClick={() => setHasTarget2(true)}
          className="inline-flex items-center gap-1.5 rounded border border-dashed border-slate-300 bg-white hover:bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 cursor-pointer transition w-full justify-center min-h-[44px]"
        >
          <Plus className="h-4 w-4 text-[#0078d4]" />
          Split Remnant to a Second Work Order (Target WO 2)
        </button>
      ) : (
        <div className="rounded-lg border border-purple-200 bg-purple-50/20 p-4 shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b border-purple-200/60 pb-2">
            <span className="font-bold text-purple-900 text-xs uppercase flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-purple-700" />
              3. Cut Split #2 (Secondary Target Work Order)
            </span>
            <button
              type="button"
              onClick={() => {
                setHasTarget2(false);
                setTarget2CutLen('');
                setTarget2Wo('');
              }}
              className="text-xs text-rose-600 hover:text-rose-800 font-medium inline-flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" /> Remove Split 2
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Target Work Order (2) *
              </label>
              <Select
                value={target2Wo}
                onChange={(e) => setTarget2Wo(e.target.value)}
                required={hasTarget2}
                className="min-h-[44px]"
              >
                <option value="">Select Secondary Order...</option>
                {wos
                  .filter((w) => w.id !== sourceWoId && w.id !== target1Wo)
                  .map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.work_order_no} · {w.customer_name || 'Generic'} ({w.grade || 'Grade N/A'} · {w.size_od || w.od}×{w.size_wt || w.wt}mm)
                    </option>
                  ))}
              </Select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Target Stage (2) *
              </label>
              <Select
                value={target2Stage}
                onChange={(e) => setTarget2Stage(e.target.value)}
                required={hasTarget2}
                className="min-h-[44px]"
              >
                {workCenters.map((wc) => (
                  <option key={wc.code} value={wc.code}>
                    {wc.name}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Cut Length Per Pipe (Mtr) *
              </label>
              <Input
                type="number"
                min="0.5"
                step="0.01"
                placeholder="e.g. 2.50"
                value={target2CutLen}
                onChange={(e) => setTarget2CutLen(e.target.value)}
                required={hasTarget2}
                className="font-mono font-bold min-h-[44px]"
              />
            </div>
          </div>
        </div>
      )}

      {/* 4. Live Remnant & Scrap Accounting Summary */}
      {remnantResult && (
        <div className="rounded-lg border p-3 text-xs space-y-2 bg-slate-50 border-slate-300">
          {'error' in remnantResult ? (
            <div className="text-red-700 font-bold flex items-center gap-1.5">
              <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
              {remnantResult.error}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                <span className="font-bold text-slate-700 uppercase text-[11px]">
                  Leftover Remnant per Pipe: <strong className="font-mono text-slate-900">{remnantResult.remnant_length} m</strong> ({mPcs} pcs = {remnantResult.total_remnant_mtr} m)
                </span>

                {remnantResult.is_usable_offcut ? (
                  <span className="inline-flex items-center gap-1 rounded bg-emerald-100 border border-emerald-300 text-emerald-900 px-2.5 py-0.5 font-bold font-mono text-[11px]">
                    <Recycle className="h-3.5 w-3.5 text-emerald-700" />
                    USABLE OFFCUT (≥ 3.0m) · Auto-saved to Remnants Pool
                  </span>
                ) : remnantResult.remnant_length > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded bg-amber-100 border border-amber-300 text-amber-900 px-2.5 py-0.5 font-bold font-mono text-[11px]">
                    <Scissors className="h-3.5 w-3.5 text-amber-700" />
                    CUTTING SCRAP (&lt; 3.0m) · Logged as Melt Loss (Rule 5B)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded bg-blue-100 border border-blue-300 text-blue-900 px-2.5 py-0.5 font-bold font-mono text-[11px]">
                    Exact 100% Pipe Consumption (0m scrap)
                  </span>
                )}
              </div>

              <p className="text-[11px] text-slate-600">
                {remnantResult.is_usable_offcut
                  ? `Under Rule 5C, this ${remnantResult.total_remnant_mtr}m balance will remain active in the Usable Off-cuts & Remnants Pool for future diversion or secondary commercial dispatch.`
                  : remnantResult.remnant_length > 0
                  ? `Under Rule 5B, off-cut remnants below 3.0 meters cannot satisfy standard prime orders and are automatically accounted for as cutting scrap.`
                  : 'Total cut pieces consume the incoming mother pipe completely.'}
              </p>
            </>
          )}
        </div>
      )}

      {/* 5. Submit Button */}
      <div className="pt-2">
        <button
          type="submit"
          disabled={!isValidToSubmit}
          className={`w-full min-h-[48px] rounded-lg font-bold text-sm shadow-md transition flex items-center justify-center gap-2 cursor-pointer ${
            isValidToSubmit
              ? 'bg-[#0078d4] hover:bg-[#106ebe] text-white'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed'
          }`}
        >
          <Scissors className="h-4 w-4" />
          {busy ? 'Processing Cut & Diversion...' : 'Execute Cut & Split Diversion'}
        </button>
      </div>
    </form>
  );
}
