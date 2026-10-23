'use client';

import React from 'react';
import { validateColdDrawReduction } from '@/lib/diversionCalculations';
import { AlertCircle, Gauge, TrendingUp } from 'lucide-react';

interface DrawReductionBadgeProps {
  sourceOd: number;
  sourceWt: number;
  targetOd: number;
  targetWt: number;
  divertedMtr?: number;
}

export function DrawReductionBadge({
  sourceOd,
  sourceWt,
  targetOd,
  targetWt,
  divertedMtr = 0,
}: DrawReductionBadgeProps) {
  if (!sourceOd || !sourceWt || !targetOd || !targetWt) return null;

  const reduction = validateColdDrawReduction(sourceOd, sourceWt, targetOd, targetWt);

  if (!reduction.isValid) {
    return (
      <div className="rounded border border-red-300 bg-red-50 p-2 text-xs text-red-800 flex items-start gap-1.5 font-medium">
        <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold">Draw Feasibility Error:</span> {reduction.errorReason}
        </div>
      </div>
    );
  }

  const expectedDrawnMtr = Number((divertedMtr * reduction.elongationFactor).toFixed(2));

  return (
    <div className="rounded border border-blue-200 bg-blue-50/70 p-2.5 text-xs text-slate-800 space-y-1.5">
      <div className="flex items-center justify-between border-b border-blue-200/60 pb-1">
        <span className="font-bold text-blue-900 flex items-center gap-1.5 uppercase text-[10px] tracking-wide">
          <Gauge className="h-3.5 w-3.5 text-[#0078d4]" />
          Cold Draw Metallurgy & Reduction
        </span>
        <span className="font-mono text-[11px] font-bold text-blue-800">
          {sourceOd}×{sourceWt}mm → {targetOd}×{targetWt}mm
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-0.5 font-mono">
        <div className="bg-white/80 rounded px-2 py-1 border border-blue-100">
          <span className="text-[10px] text-slate-500 uppercase block font-sans">Area Reduction</span>
          <span className="font-bold text-slate-900 text-xs">{reduction.areaReductionPct}%</span>
        </div>

        <div className="bg-white/80 rounded px-2 py-1 border border-blue-100">
          <span className="text-[10px] text-slate-500 uppercase block font-sans">Elongation Factor</span>
          <span className="font-bold text-[#0078d4] text-xs">{reduction.elongationFactor}×</span>
        </div>

        {divertedMtr > 0 && (
          <div className="col-span-2 sm:col-span-1 bg-emerald-50 rounded px-2 py-1 border border-emerald-200 text-emerald-950">
            <span className="text-[10px] text-emerald-700 uppercase block font-sans flex items-center gap-0.5">
              <TrendingUp className="h-2.5 w-2.5" /> Drawn Output
            </span>
            <span className="font-black text-emerald-800 text-xs">{expectedDrawnMtr} m</span>
          </div>
        )}
      </div>
    </div>
  );
}
