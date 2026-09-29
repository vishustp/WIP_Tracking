// components/reports/process-sheet/ProcessSheetFinishingSection.tsx
'use client';

import React from 'react';
import { PackageCheck, Palette, Tag } from 'lucide-react';
import { FormSectionCard, FormInput } from './FormCommon';
import type { ProcessSheetFormData, ProcessSheetFormActions } from './types';

export default function ProcessSheetFinishingSection({
  data,
  actions,
}: {
  data: ProcessSheetFormData;
  actions: ProcessSheetFormActions;
}) {
  return (
    <div className="space-y-5">
      {/* Pipe Stencil Markings */}
      <FormSectionCard title="Specification Stencil Markings" icon={Tag} headerBg="bg-blue-900">
        <div className="space-y-3">
          <div>
            <label className="font-bold text-xs text-slate-700 block mb-1">
              Single Marking Stencil String
            </label>
            <textarea
              rows={2}
              value={data.markingSingle}
              onChange={(e) => actions.updateField('markingSingle', e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono font-bold bg-white text-slate-900 border border-slate-300 rounded-lg focus:border-blue-600 focus:outline-none shadow-xs"
              placeholder="Single Marking String..."
            />
          </div>

          <div>
            <label className="font-bold text-xs text-slate-700 block mb-1">
              Triple Marking Stencil String (Multi-Specification)
            </label>
            <textarea
              rows={2}
              value={data.markingTriple}
              onChange={(e) => actions.updateField('markingTriple', e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono font-bold bg-white text-slate-900 border border-slate-300 rounded-lg focus:border-blue-600 focus:outline-none shadow-xs"
              placeholder="Triple Marking String..."
            />
          </div>
        </div>
      </FormSectionCard>

      {/* Finishing & Dispatch Packaging */}
      <FormSectionCard title="Finishing, Bundling & Dispatch Packaging" icon={PackageCheck} headerBg="bg-slate-800">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <FormInput
            label="Pipe Color Code"
            value={data.pipeColorCode}
            onChange={(val) => actions.updateField('pipeColorCode', val)}
            placeholder="WHITE / YELLOW"
          />
          <FormInput
            label="RM Color Code"
            value={data.rmColorCode}
            onChange={(val) => actions.updateField('rmColorCode', val)}
            placeholder="YELLOW + WHITE"
          />
          <FormInput
            label="Surface Coating"
            value={data.coating}
            onChange={(val) => actions.updateField('coating', val)}
            placeholder="BLACK VARNISH / BARE"
          />
          <FormInput
            label="End Condition"
            value={data.endCondition}
            onChange={(val) => actions.updateField('endCondition', val)}
            placeholder="BEVEL END (30°-35°)"
          />
          <FormInput
            label="Bundling Style"
            value={data.bundling}
            onChange={(val) => actions.updateField('bundling', val)}
            placeholder="HEXAGONAL"
          />
          <FormInput
            label="End Protection"
            value={data.endCap}
            onChange={(val) => actions.updateField('endCap', val)}
            placeholder="PLASTIC PROTECTOR"
          />
        </div>
      </FormSectionCard>
    </div>
  );
}
