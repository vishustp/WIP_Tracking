'use client';

import React, { useState, useMemo } from 'react';
import { calcCutSplitRemnant, type CutSplitItem } from '@/lib/diversionCalculations';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { WorkOrderSelect } from '@/components/ui/WorkOrderSelect';
import {
  Scissors,
  AlertCircle,
  Plus,
  Trash2,
  CheckCircle2,
  Recycle,
  Zap,
  ArrowRight,
  ShieldCheck,
  Split,
  Layers,
} from 'lucide-react';

interface WO {
  id: string;
  work_order_no: string;
  customer_name?: string | null;
  grade?: string | null;
  size_od?: number | null;
  size_wt?: number | null;
  od?: number | null;
  wt?: number | null;
  l1?: number | null;
  l2?: number | null;
  avg_length?: number | null;
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

export type DiversionCutStrategy = 'SINGLE_ORDER' | 'MULTI_ORDER' | 'NO_CUT';

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
    strategy: DiversionCutStrategy;
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
  // Strategy:
  // 1. SINGLE_ORDER: Cut from middle (or into N pieces) and divert all to a SINGLE work order (e.g. 14 pipes @ 10m -> 28 pcs @ 5m)
  // 2. MULTI_ORDER: Cut from middle and split pieces across MULTIPLE work orders (e.g. 14 pcs to WO A, 14 pcs to WO B)
  // 3. NO_CUT: Send whole mother pipes as-is without cutting (e.g. 14 pipes @ 10m as-is)
  const [strategy, setStrategy] = useState<DiversionCutStrategy>('SINGLE_ORDER');

  const [motherLength, setMotherLength] = useState<string>(
    defaultMotherLength > 0 ? String(defaultMotherLength) : '10.0'
  );
  const [motherPcs, setMotherPcs] = useState<string>(
    availableStagePcs > 0 ? String(Math.min(availableStagePcs, 14)) : '1'
  );

  const mLen = Number(motherLength) || 0;
  const mPcs = Number(motherPcs) || 0;
  const totalMotherMtr = Number((mLen * mPcs).toFixed(2));

  const sourceWo = useMemo(() => wos.find((w) => w.id === sourceWoId), [wos, sourceWoId]);
  const sourceWoNo = sourceWo?.work_order_no || 'Source';

  // Strategy 1: SINGLE_ORDER (Cut into N pieces per pipe for a single target order)
  const [singleTargetWo, setSingleTargetWo] = useState('');
  const [singleTargetStage, setSingleTargetStage] = useState('DRAW');
  const [singleCutsPerPipe, setSingleCutsPerPipe] = useState<number>(2); // Default 2 cuts (cut from middle)
  const [singleCutLen, setSingleCutLen] = useState<string>(
    mLen > 0 ? (mLen / 2).toFixed(2) : '5.00'
  );

  // Strategy 2: MULTI_ORDER (Split cuts across 2 work orders)
  const [multiSplit1Wo, setMultiSplit1Wo] = useState('');
  const [multiSplit1Stage, setMultiSplit1Stage] = useState('DRAW');
  const [multiSplit1CutLen, setMultiSplit1CutLen] = useState<string>(
    mLen > 0 ? (mLen / 2).toFixed(2) : '5.00'
  );

  const [multiSplit2Wo, setMultiSplit2Wo] = useState('');
  const [multiSplit2Stage, setMultiSplit2Stage] = useState('BAND_SAW');
  const [multiSplit2CutLen, setMultiSplit2CutLen] = useState<string>(
    mLen > 0 ? (mLen / 2).toFixed(2) : '5.00'
  );

  // Strategy 3: NO_CUT (Whole pipes without cutting)
  const [noCutTargetWo, setNoCutTargetWo] = useState('');
  const [noCutTargetStage, setNoCutTargetStage] = useState('DRAW');

  // When motherLength changes, update defaults if at middle
  const handleMotherLengthChange = (val: string) => {
    setMotherLength(val);
    const n = Number(val);
    if (n > 0) {
      const half = (n / 2).toFixed(2);
      if (singleCutLen === '' || Number(singleCutLen) === mLen / 2) {
        setSingleCutLen(half);
      }
      if (multiSplit1CutLen === '' || Number(multiSplit1CutLen) === mLen / 2) {
        setMultiSplit1CutLen(half);
      }
      if (multiSplit2CutLen === '' || Number(multiSplit2CutLen) === mLen / 2) {
        setMultiSplit2CutLen(half);
      }
    }
  };

  // Build active splits array depending on selected strategy
  const activeSplits: CutSplitItem[] = useMemo(() => {
    if (strategy === 'NO_CUT') {
      if (!noCutTargetWo || mLen <= 0) return [];
      return [
        {
          target_wo_id: noCutTargetWo,
          target_stage_code: noCutTargetStage,
          cut_length: mLen,
          cuts_per_pipe: 1,
        },
      ];
    }

    if (strategy === 'SINGLE_ORDER') {
      if (!singleTargetWo || Number(singleCutLen) <= 0) return [];
      return [
        {
          target_wo_id: singleTargetWo,
          target_stage_code: singleTargetStage,
          cut_length: Number(singleCutLen),
          cuts_per_pipe: singleCutsPerPipe,
        },
      ];
    }

    // MULTI_ORDER
    const list: CutSplitItem[] = [];
    if (multiSplit1Wo && Number(multiSplit1CutLen) > 0) {
      list.push({
        target_wo_id: multiSplit1Wo,
        target_stage_code: multiSplit1Stage,
        cut_length: Number(multiSplit1CutLen),
        cuts_per_pipe: 1,
      });
    }
    if (multiSplit2Wo && Number(multiSplit2CutLen) > 0) {
      list.push({
        target_wo_id: multiSplit2Wo,
        target_stage_code: multiSplit2Stage,
        cut_length: Number(multiSplit2CutLen),
        cuts_per_pipe: 1,
      });
    }
    return list;
  }, [
    strategy,
    noCutTargetWo,
    noCutTargetStage,
    mLen,
    singleTargetWo,
    singleTargetStage,
    singleCutLen,
    singleCutsPerPipe,
    multiSplit1Wo,
    multiSplit1Stage,
    multiSplit1CutLen,
    multiSplit2Wo,
    multiSplit2Stage,
    multiSplit2CutLen,
  ]);

  // Remnant analysis using calcCutSplitRemnant
  const remnantResult = useMemo(() => {
    if (mLen <= 0 || activeSplits.length === 0) return null;
    try {
      return calcCutSplitRemnant(mLen, mPcs, activeSplits);
    } catch (err: any) {
      return { error: err.message };
    }
  }, [mLen, mPcs, activeSplits]);

  // Validation
  const isValidToSubmit = useMemo(() => {
    if (busy || !canManagePlans) return false;
    if (mLen <= 0 || mPcs <= 0) return false;
    if (totalMotherMtr > availableStageMtr + 0.01) return false;

    if (strategy === 'NO_CUT') {
      return Boolean(noCutTargetWo);
    }
    if (strategy === 'SINGLE_ORDER') {
      return Boolean(singleTargetWo && Number(singleCutLen) > 0 && singleCutsPerPipe >= 1);
    }
    if (strategy === 'MULTI_ORDER') {
      return Boolean(
        multiSplit1Wo &&
        Number(multiSplit1CutLen) > 0 &&
        multiSplit2Wo &&
        Number(multiSplit2CutLen) > 0
      );
    }
    return false;
  }, [
    busy,
    canManagePlans,
    mLen,
    mPcs,
    totalMotherMtr,
    availableStageMtr,
    strategy,
    noCutTargetWo,
    singleTargetWo,
    singleCutLen,
    singleCutsPerPipe,
    multiSplit1Wo,
    multiSplit1CutLen,
    multiSplit2Wo,
    multiSplit2CutLen,
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidToSubmit || !remnantResult || 'error' in remnantResult) return;

    await onExecuteCutDivert({
      strategy,
      motherLength: mLen,
      motherPcs: mPcs,
      splits: activeSplits,
      remnantMtr: remnantResult.total_remnant_mtr,
      remnantClassification: remnantResult.classification,
    });
  };

  const singleTargetWoObj = useMemo(() => wos.find((w) => w.id === singleTargetWo), [wos, singleTargetWo]);
  const multiSplit1WoObj = useMemo(() => wos.find((w) => w.id === multiSplit1Wo), [wos, multiSplit1Wo]);
  const multiSplit2WoObj = useMemo(() => wos.find((w) => w.id === multiSplit2Wo), [wos, multiSplit2Wo]);
  const noCutTargetWoObj = useMemo(() => wos.find((w) => w.id === noCutTargetWo), [wos, noCutTargetWo]);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* 1. Mother Pipe Inputs */}
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
          <span className="font-bold text-slate-800 text-xs uppercase flex items-center gap-1.5">
            <Layers className="h-4 w-4 text-[#0078d4]" />
            1. Source Mother Pipes to Divert (WO #{sourceWoNo})
          </span>
          <span className="text-[11px] font-mono text-slate-500">
            Available at {sourceStageCode}: <strong className="text-slate-900">{availableStagePcs} Pcs</strong> ({availableStageMtr}m)
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
              onChange={(e) => handleMotherLengthChange(e.target.value)}
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

      {/* 2. Strategy Selector (The 3 Operational Pathways) */}
      <div className="space-y-2">
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">
          2. Select Diversion &amp; Cutting Pathway *
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {/* Pathway 1: Cut & Divert to Single Order */}
          <button
            type="button"
            onClick={() => setStrategy('SINGLE_ORDER')}
            className={`p-3.5 rounded-lg border text-left transition cursor-pointer flex flex-col justify-between ${
              strategy === 'SINGLE_ORDER'
                ? 'border-[#0078d4] bg-blue-50/50 ring-2 ring-[#0078d4]/30 shadow-xs'
                : 'border-slate-200 bg-white hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <div className={`p-1.5 rounded ${strategy === 'SINGLE_ORDER' ? 'bg-[#0078d4] text-white' : 'bg-blue-100 text-[#0078d4]'}`}>
                <Scissors className="h-4 w-4" />
              </div>
              <span className="font-bold text-xs text-slate-900">Cut &amp; Divert to Single Order</span>
            </div>
            <p className="text-[11px] text-slate-600 leading-snug">
              Cut pipes from middle (2 pcs/pipe) or into N cuts. <strong>All cut pieces go to ONE target work order.</strong>
            </p>
          </button>

          {/* Pathway 2: Cut & Divert to Multiple Orders */}
          <button
            type="button"
            onClick={() => setStrategy('MULTI_ORDER')}
            className={`p-3.5 rounded-lg border text-left transition cursor-pointer flex flex-col justify-between ${
              strategy === 'MULTI_ORDER'
                ? 'border-purple-600 bg-purple-50/50 ring-2 ring-purple-600/30 shadow-xs'
                : 'border-slate-200 bg-white hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <div className={`p-1.5 rounded ${strategy === 'MULTI_ORDER' ? 'bg-purple-600 text-white' : 'bg-purple-100 text-purple-700'}`}>
                <Split className="h-4 w-4" />
              </div>
              <span className="font-bold text-xs text-slate-900">Cut &amp; Split to Multiple Orders</span>
            </div>
            <p className="text-[11px] text-slate-600 leading-snug">
              Cut pipes from middle and <strong>distribute different cut pieces to 2 different work orders.</strong>
            </p>
          </button>

          {/* Pathway 3: Send Without Cutting */}
          <button
            type="button"
            onClick={() => setStrategy('NO_CUT')}
            className={`p-3.5 rounded-lg border text-left transition cursor-pointer flex flex-col justify-between ${
              strategy === 'NO_CUT'
                ? 'border-emerald-600 bg-emerald-50/50 ring-2 ring-emerald-600/30 shadow-xs'
                : 'border-slate-200 bg-white hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <div className={`p-1.5 rounded ${strategy === 'NO_CUT' ? 'bg-emerald-600 text-white' : 'bg-emerald-100 text-emerald-800'}`}>
                <ArrowRight className="h-4 w-4" />
              </div>
              <span className="font-bold text-xs text-slate-900">Send Without Cutting (As-Is)</span>
            </div>
            <p className="text-[11px] text-slate-600 leading-snug">
              Transfer whole pipes directly <strong>as-is without cutting</strong> ({mPcs} pcs @ {mLen}m = {totalMotherMtr}m).
            </p>
          </button>
        </div>
      </div>

      {/* 3. PATHWAY CONFIGURATION FORMS */}

      {/* === CONFIG 1: SINGLE WORK ORDER (CUT FROM MIDDLE / N CUTS) === */}
      {strategy === 'SINGLE_ORDER' && (
        <div className="rounded-lg border border-blue-200 bg-blue-50/30 p-4 shadow-2xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-200/60 pb-2">
            <span className="font-bold text-blue-900 text-xs uppercase flex items-center gap-1.5">
              <Scissors className="h-4 w-4 text-[#0078d4]" />
              Configuration: Cut from Middle &amp; Divert to Single Target Order
            </span>
            {Number(singleCutLen) > 0 && singleCutsPerPipe > 0 && (
              <span className="font-mono font-bold text-xs text-blue-900 bg-blue-100 border border-blue-300 px-2 py-0.5 rounded">
                Target Receives: {mPcs * singleCutsPerPipe} pcs @ {singleCutLen}m = {Number((mPcs * singleCutsPerPipe * Number(singleCutLen)).toFixed(2))} m
              </span>
            )}
          </div>

          {/* Quick helpers */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setSingleCutsPerPipe(2);
                if (mLen > 0) setSingleCutLen((mLen / 2).toFixed(2));
              }}
              className={`text-xs font-bold px-2.5 py-1 rounded border transition cursor-pointer flex items-center gap-1 ${
                singleCutsPerPipe === 2
                  ? 'bg-[#0078d4] border-blue-700 text-white shadow-2xs'
                  : 'bg-white border-blue-300 text-blue-800 hover:bg-blue-50'
              }`}
            >
              <Zap className="h-3 w-3" />
              Cut from Middle (2 Cuts/Pipe @ {(mLen / 2).toFixed(2)}m)
            </button>

            <button
              type="button"
              onClick={() => {
                setSingleCutsPerPipe(3);
                if (mLen > 0) setSingleCutLen((mLen / 3).toFixed(2));
              }}
              className={`text-xs font-bold px-2.5 py-1 rounded border transition cursor-pointer ${
                singleCutsPerPipe === 3
                  ? 'bg-[#0078d4] border-blue-700 text-white shadow-2xs'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              3 Cuts/Pipe @ {(mLen / 3).toFixed(2)}m
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Target Work Order (Single Destination) *
              </label>
              <WorkOrderSelect
                value={singleTargetWo}
                onChange={(val) => setSingleTargetWo(val)}
                workOrders={wos}
                sameOrderId={sourceWoId}
                required
                placeholder="Select Target Work Order..."
                searchPlaceholder="Search target order by WO#, customer, size..."
                buttonClassName="font-mono text-sm min-h-[44px]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Target Stage *
              </label>
              <Select
                value={singleTargetStage}
                onChange={(e) => setSingleTargetStage(e.target.value)}
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
                Cuts Per Mother Pipe *
              </label>
              <Select
                value={String(singleCutsPerPipe)}
                onChange={(e) => setSingleCutsPerPipe(Number(e.target.value) || 2)}
                required
                className="min-h-[44px] font-bold font-mono"
              >
                <option value="2">2 Pieces (Cut in Middle)</option>
                <option value="3">3 Pieces</option>
                <option value="4">4 Pieces</option>
                <option value="1">1 Piece Only</option>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Cut Length Per Piece (Mtr) *
              </label>
              <Input
                type="number"
                min="0.5"
                step="0.01"
                placeholder="e.g. 5.00"
                value={singleCutLen}
                onChange={(e) => setSingleCutLen(e.target.value)}
                required
                className="font-mono font-bold min-h-[44px]"
              />
            </div>

            <div className="rounded bg-white p-3 border border-blue-200 flex flex-col justify-center">
              <span className="text-[10px] text-blue-800 uppercase font-bold">Output Yield to Target Order</span>
              <span className="font-mono text-base font-bold text-slate-900">
                {mPcs * singleCutsPerPipe} cut pieces = {Number((mPcs * singleCutsPerPipe * Number(singleCutLen)).toFixed(2))} m
              </span>
              <span className="text-[11px] text-slate-500">
                ({mPcs} mother pipes × {singleCutsPerPipe} cuts @ {singleCutLen || 0}m)
              </span>
            </div>
          </div>
        </div>
      )}

      {/* === CONFIG 2: MULTI-ORDER (SPLIT CUTS ACROSS 2 WORK ORDERS) === */}
      {strategy === 'MULTI_ORDER' && (
        <div className="space-y-3">
          {/* Split 1 */}
          <div className="rounded-lg border border-purple-200 bg-purple-50/20 p-4 shadow-2xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-purple-200/60 pb-2">
              <span className="font-bold text-purple-900 text-xs uppercase flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-purple-700" />
                Cut Split #1 (First Target Work Order)
              </span>
              {Number(multiSplit1CutLen) > 0 && (
                <span className="font-mono font-bold text-xs text-purple-900">
                  Allocated: {Number((Number(multiSplit1CutLen) * mPcs).toFixed(2))} m ({mPcs} pcs @ {multiSplit1CutLen}m)
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Target Work Order (1) *
                </label>
                <WorkOrderSelect
                  value={multiSplit1Wo}
                  onChange={(val) => setMultiSplit1Wo(val)}
                  workOrders={wos}
                  sameOrderId={sourceWoId}
                  required
                  placeholder="Select Target Order 1..."
                  searchPlaceholder="Search order by WO#, customer, size..."
                  buttonClassName="font-mono text-sm min-h-[44px]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Target Stage (1) *
                </label>
                <Select
                  value={multiSplit1Stage}
                  onChange={(e) => setMultiSplit1Stage(e.target.value)}
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
                  placeholder="e.g. 5.00"
                  value={multiSplit1CutLen}
                  onChange={(e) => setMultiSplit1CutLen(e.target.value)}
                  required
                  className="font-mono font-bold min-h-[44px]"
                />
              </div>
            </div>
          </div>

          {/* Split 2 */}
          <div className="rounded-lg border border-purple-200 bg-purple-50/20 p-4 shadow-2xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-purple-200/60 pb-2">
              <span className="font-bold text-purple-900 text-xs uppercase flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-purple-700" />
                Cut Split #2 (Second Target Work Order)
              </span>
              {Number(multiSplit2CutLen) > 0 && (
                <span className="font-mono font-bold text-xs text-purple-900">
                  Allocated: {Number((Number(multiSplit2CutLen) * mPcs).toFixed(2))} m ({mPcs} pcs @ {multiSplit2CutLen}m)
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Target Work Order (2) *
                </label>
                <WorkOrderSelect
                  value={multiSplit2Wo}
                  onChange={(val) => setMultiSplit2Wo(val)}
                  workOrders={wos}
                  sameOrderId={sourceWoId}
                  required
                  placeholder="Select Target Order 2..."
                  searchPlaceholder="Search order by WO#, customer, size..."
                  buttonClassName="font-mono text-sm min-h-[44px]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Target Stage (2) *
                </label>
                <Select
                  value={multiSplit2Stage}
                  onChange={(e) => setMultiSplit2Stage(e.target.value)}
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
                  placeholder="e.g. 5.00"
                  value={multiSplit2CutLen}
                  onChange={(e) => setMultiSplit2CutLen(e.target.value)}
                  required
                  className="font-mono font-bold min-h-[44px]"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* === CONFIG 3: NO_CUT (SEND WITHOUT CUTTING) === */}
      {strategy === 'NO_CUT' && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/30 p-4 shadow-2xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-200/60 pb-2">
            <span className="font-bold text-emerald-900 text-xs uppercase flex items-center gap-1.5">
              <ArrowRight className="h-4 w-4 text-emerald-700" />
              Configuration: Send Without Cutting (As-Is Whole Pipes)
            </span>
            <span className="font-mono font-bold text-xs text-emerald-900 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded">
              Direct Transfer: {mPcs} pcs @ {mLen}m = {totalMotherMtr} m
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Target Work Order *
              </label>
              <WorkOrderSelect
                value={noCutTargetWo}
                onChange={(val) => setNoCutTargetWo(val)}
                workOrders={wos}
                excludeId={sourceWoId}
                required
                placeholder="Select Target Work Order..."
                searchPlaceholder="Search order by WO#, customer, size..."
                buttonClassName="font-mono text-sm min-h-[44px]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Target Stage *
              </label>
              <Select
                value={noCutTargetStage}
                onChange={(e) => setNoCutTargetStage(e.target.value)}
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
          </div>
        </div>
      )}

      {/* 4. Live Allocation & Remnant Accounting Summary */}
      {remnantResult && (
        <div className="rounded-lg border p-3.5 text-xs space-y-2.5 bg-slate-50 border-slate-300">
          {'error' in remnantResult ? (
            <div className="text-red-700 font-bold flex items-center gap-1.5">
              <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
              {remnantResult.error}
            </div>
          ) : (
            <>
              {/* Allocation Summary Chips */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pb-2 border-b border-slate-200">
                <div className="rounded bg-white p-2 border border-slate-200 flex flex-col justify-center">
                  <span className="text-[10px] text-slate-500 uppercase font-bold">Total Mother Consumed</span>
                  <span className="font-mono font-bold text-slate-900 text-xs">
                    {mPcs} pcs @ {mLen}m = {totalMotherMtr} m
                  </span>
                </div>

                <div className="rounded bg-blue-50 p-2 border border-blue-200 flex flex-col justify-center sm:col-span-2">
                  <span className="text-[10px] text-blue-800 uppercase font-bold flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-blue-700" /> Target Allocation Summary
                  </span>
                  <span className="font-mono font-bold text-blue-950 text-xs">
                    {strategy === 'SINGLE_ORDER' && singleTargetWoObj && (
                      <>
                        WO #{singleTargetWoObj.work_order_no}: {mPcs * singleCutsPerPipe} cut pcs @ {singleCutLen}m ={' '}
                        {Number((mPcs * singleCutsPerPipe * Number(singleCutLen)).toFixed(2))} m at [{singleTargetStage}]
                      </>
                    )}
                    {strategy === 'MULTI_ORDER' && (
                      <>
                        {multiSplit1WoObj ? `WO #${multiSplit1WoObj.work_order_no}: ${mPcs} pcs (${Number((Number(multiSplit1CutLen) * mPcs).toFixed(2))}m)` : 'Order 1'}
                        {' + '}
                        {multiSplit2WoObj ? `WO #${multiSplit2WoObj.work_order_no}: ${mPcs} pcs (${Number((Number(multiSplit2CutLen) * mPcs).toFixed(2))}m)` : 'Order 2'}
                      </>
                    )}
                    {strategy === 'NO_CUT' && noCutTargetWoObj && (
                      <>
                        WO #${noCutTargetWoObj.work_order_no}: {mPcs} whole pipes @ {mLen}m = {totalMotherMtr} m at [{noCutTargetStage}]
                      </>
                    )}
                  </span>
                </div>
              </div>

              {/* Remnant / Scrap Status */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <span className="font-bold text-slate-700 uppercase text-[11px]">
                  Leftover Remnant per Pipe:{' '}
                  <strong className="font-mono text-slate-900">{remnantResult.remnant_length} m</strong> ({mPcs} pcs ={' '}
                  {remnantResult.total_remnant_mtr} m)
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
              ? strategy === 'NO_CUT'
                ? 'bg-emerald-700 hover:bg-emerald-800 text-white'
                : strategy === 'MULTI_ORDER'
                ? 'bg-purple-700 hover:bg-purple-800 text-white'
                : 'bg-[#0078d4] hover:bg-[#106ebe] text-white'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed'
          }`}
        >
          {strategy === 'NO_CUT' ? (
            <>
              <ArrowRight className="h-4 w-4" />
              {busy ? 'Processing Diversion...' : `Divert Whole Pipes Without Cutting (${mPcs} pcs @ ${mLen}m = ${totalMotherMtr}m)`}
            </>
          ) : strategy === 'MULTI_ORDER' ? (
            <>
              <Split className="h-4 w-4" />
              {busy ? 'Processing Cut & Multi-Order Diversion...' : 'Execute Cut & Split to Multiple Work Orders'}
            </>
          ) : (
            <>
              <Scissors className="h-4 w-4" />
              {busy
                ? 'Processing Cut & Diversion...'
                : `Execute Cut from Middle & Divert ${mPcs * singleCutsPerPipe} Pieces (${Number((mPcs * singleCutsPerPipe * Number(singleCutLen)).toFixed(2))}m) to Single Order`}
            </>
          )}
        </button>
      </div>
    </form>
  );
}
