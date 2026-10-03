// components/reports/process-sheet/ProcessSheetFinishingSection.tsx
'use client';

import React from 'react';
import { PackageCheck, Tag, FileText, CheckCircle2 } from 'lucide-react';
import { FormSectionCard, FormInput } from './FormCommon';
import type { ProcessSheetFormData, ProcessSheetFormActions } from './types';
import { buildMarkingString } from '@/lib/metallurgy/processSheetSpecHelper';

export default function ProcessSheetFinishingSection({
  data,
  actions,
}: {
  data: ProcessSheetFormData;
  actions: ProcessSheetFormActions;
}) {
  const currentMarkingType = data.markingType || 'single';

  const handleSelectMarkingType = (type: 'single' | 'triple') => {
    const generated = buildMarkingString(type, {
      routeCode: data.routeType,
      specification: data.materialSpec,
      grade: data.steelGrade,
      sizeOd: data.custOd,
      sizeWt: data.custWt,
      hydroPsi: data.hydroPressurePsi,
      woNo: data.woNo,
      poNo: data.poNo,
    });
    actions.updateFields({
      markingType: type,
      markingText: generated,
    });
  };

  return (
    <div className="space-y-5">
      {/* Pipe Stencil Markings */}
      <FormSectionCard title="Specification Stencil Marking" icon={Tag} headerBg="bg-blue-900">
        <div className="space-y-3">
          {/* User selector for Single vs Triple marking */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
            <span className="text-xs font-bold text-slate-800">
              Select Marking Format:
            </span>
            <div className="inline-flex rounded-lg border border-slate-300 p-0.5 bg-white shadow-xs">
              <button
                type="button"
                onClick={() => handleSelectMarkingType('single')}
                className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-md transition-colors cursor-pointer ${
                  currentMarkingType === 'single'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {currentMarkingType === 'single' && <CheckCircle2 className="w-3.5 h-3.5" />}
                <span>Single Line Marking</span>
              </button>
              <button
                type="button"
                onClick={() => handleSelectMarkingType('triple')}
                className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-md transition-colors cursor-pointer ${
                  currentMarkingType === 'triple'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {currentMarkingType === 'triple' && <CheckCircle2 className="w-3.5 h-3.5" />}
                <span>Triple Line Marking</span>
              </button>
            </div>
          </div>

          {/* Single field for stencil string */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-bold text-xs text-slate-700 block">
                {currentMarkingType === 'triple' ? 'Triple Line Stencil String' : 'Single Line Stencil String'}
              </label>
              <span className="text-[10px] text-slate-500 font-mono">
                {currentMarkingType === 'triple' ? 'Multi-spec format' : 'Standard single format'}
              </span>
            </div>
            <textarea
              rows={3}
              value={data.markingText || ''}
              onChange={(e) => actions.updateField('markingText', e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono font-bold bg-white text-slate-900 border border-slate-300 rounded-lg focus:border-blue-600 focus:outline-none shadow-xs"
              placeholder="Marking stencil string..."
            />
          </div>
        </div>
      </FormSectionCard>

      {/* Special Instructions */}
      <FormSectionCard title="Special Instructions & Customer Specific Requirements" icon={FileText} headerBg="bg-indigo-900">
        <div>
          <label className="font-bold text-xs text-slate-700 block mb-1">
            Special Instructions / Quality Remarks (Printed on Process Sheet)
          </label>
          <textarea
            rows={3}
            value={data.specialInstructions || ''}
            onChange={(e) => actions.updateField('specialInstructions', e.target.value)}
            className="w-full px-3 py-2 text-xs font-medium bg-white text-slate-900 border border-slate-300 rounded-lg focus:border-blue-600 focus:outline-none shadow-xs"
            placeholder="e.g. Third-party inspection (TPI) required before dispatch; Strict length tolerance SRL; Color coding on both ends..."
          />
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
