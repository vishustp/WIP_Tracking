'use client';

import React from 'react';
import { checkStpHollowLimit, STP_HOLLOW_LIMIT_MTR } from '@/lib/diversionCalculations';
import { AlertTriangle, Scissors, Check } from 'lucide-react';

interface StpConstraintAlertProps {
  pipeLength: number;
  targetStageCode: string;
  isExempt: boolean;
  onToggleExempt: (exempt: boolean) => void;
  onSwitchToCutMode?: () => void;
}

export function StpConstraintAlert({
  pipeLength,
  targetStageCode,
  isExempt,
  onToggleExempt,
  onSwitchToCutMode,
}: StpConstraintAlertProps) {
  const isStpStage = targetStageCode === 'DRAW' || targetStageCode === 'HOLLOW_HEAT_TREATMENT';
  if (!isStpStage) return null;

  const { exceedsLimit, limitMtr } = checkStpHollowLimit(pipeLength);
  if (!exceedsLimit) return null;

  return (
    <div className={`rounded-lg border p-3 text-xs transition ${
      isExempt ? 'border-blue-200 bg-blue-50/60 text-blue-900' : 'border-amber-300 bg-amber-50 text-amber-900'
    }`}>
      <div className="flex items-start gap-2">
        <AlertTriangle className={`h-4 w-4 shrink-0 mt-0.5 ${isExempt ? 'text-blue-600' : 'text-amber-600'}`} />
        <div className="space-y-1.5 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <span className="font-bold uppercase tracking-wide text-[11px]">
              STP Hollow Limit Alert ({pipeLength}m &gt; {limitMtr}m)
            </span>
            <label className="inline-flex items-center gap-1.5 cursor-pointer bg-white px-2 py-0.5 rounded border border-slate-300 text-[11px] font-medium text-slate-700 hover:bg-slate-50">
              <input
                type="checkbox"
                checked={isExempt}
                onChange={(e) => onToggleExempt(e.target.checked)}
                className="rounded border-slate-300 text-[#0078d4] focus:ring-[#0078d4]"
              />
              Special Length Exemption
            </label>
          </div>

          <p className="text-[11px] leading-relaxed text-slate-700">
            Seamless Tube Plant (STP) beds and draw benches have a standard maximum hollow length limit of{' '}
            <strong>{limitMtr} meters</strong>. Incoming hollows above {limitMtr}m should typically be cut before drawing.
          </p>

          {!isExempt && onSwitchToCutMode && (
            <div className="pt-1 flex items-center gap-2">
              <button
                type="button"
                onClick={onSwitchToCutMode}
                className="inline-flex items-center gap-1.5 rounded bg-amber-600 hover:bg-amber-700 text-white font-semibold px-2.5 py-1 text-xs shadow-2xs cursor-pointer transition"
              >
                <Scissors className="h-3.5 w-3.5" />
                Switch to Cut &amp; Divert Mode
              </button>
              <span className="text-[10px] text-amber-800">
                (Cut below {STP_HOLLOW_LIMIT_MTR}m and divert remaining pieces)
              </span>
            </div>
          )}

          {isExempt && (
            <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-800 bg-blue-100/70 px-2 py-0.5 rounded">
              <Check className="h-3 w-3 text-blue-700" />
              Special exemption active: Proceeding with full {pipeLength}m length.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
