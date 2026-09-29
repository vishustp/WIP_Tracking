// components/reports/process-sheet/ProcessSheetMetallurgySection.tsx
'use client';

import React from 'react';
import { FlaskConical, Award, SlidersHorizontal, Sparkles } from 'lucide-react';
import { FormSectionCard, FormInput } from './FormCommon';
import type { ProcessSheetFormData, ProcessSheetFormActions } from './types';
import type { SpecMasterRecord } from '@/lib/specMasterDefaults';

export default function ProcessSheetMetallurgySection({
  data,
  actions,
  specMasterList,
  onApplySpecMaster,
}: {
  data: ProcessSheetFormData;
  actions: ProcessSheetFormActions;
  specMasterList: SpecMasterRecord[];
  onApplySpecMaster: (spec: SpecMasterRecord) => void;
}) {
  return (
    <div className="space-y-5">
      {/* Spec Master Quick Select Bar */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-blue-600 text-white rounded-lg shadow-xs">
            <SlidersHorizontal className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-blue-950">Material Spec Master Quick-Match</div>
            <div className="text-[11px] text-blue-700">Pre-fill standard metallurgical, thermal, and test limits with 1 click</div>
          </div>
        </div>
        <div className="w-full sm:w-72">
          <select
            value=""
            onChange={(e) => {
              const found = specMasterList.find((s) => s.id === e.target.value || s.spec_key === e.target.value);
              if (found) onApplySpecMaster(found);
            }}
            className="w-full px-3 py-1.5 text-xs font-bold bg-white text-slate-800 border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 shadow-xs cursor-pointer"
          >
            <option value="">-- Apply from Spec Master ({specMasterList.length} standards) --</option>
            {specMasterList.map((s) => (
              <option key={s.id || s.spec_key} value={s.id || s.spec_key}>
                {s.spec_full || s.spec_key} {s.is_min_wall ? '(MIN WALL)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Mechanical Properties */}
      <FormSectionCard title="Mechanical & Hardness Specifications" icon={Award} headerBg="bg-indigo-900">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <FormInput
            label="YST Min"
            value={data.ystMin}
            onChange={(val) => actions.updateField('ystMin', val)}
            unit="MPA"
            highlight
          />
          <FormInput
            label="YST Max"
            value={data.ystMax}
            onChange={(val) => actions.updateField('ystMax', val)}
            unit="MPA"
          />
          <FormInput
            label="UTS Min"
            value={data.utsMin}
            onChange={(val) => actions.updateField('utsMin', val)}
            unit="MPA"
            highlight
          />
          <FormInput
            label="UTS Max"
            value={data.utsMax}
            onChange={(val) => actions.updateField('utsMax', val)}
            unit="MPA"
          />
          <FormInput
            label="Elongation Min"
            value={data.elongationMin}
            onChange={(val) => actions.updateField('elongationMin', val)}
            unit="%"
            highlight
          />
          <FormInput
            label="Hardness"
            value={data.hardness}
            onChange={(val) => actions.updateField('hardness', val)}
            placeholder="e.g. 85 HRB MAX"
          />
          <FormInput
            label="Straightness"
            value={data.straightness}
            onChange={(val) => actions.updateField('straightness', val)}
            placeholder="1:1000"
          />
        </div>
      </FormSectionCard>

      {/* Chemical Composition Limits Table */}
      <FormSectionCard title="Specified Chemical Composition (% Max / Range)" icon={FlaskConical} headerBg="bg-slate-800">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
          <FormInput
            label="C (Carbon) Min"
            value={data.cMin}
            onChange={(val) => actions.updateField('cMin', val)}
            placeholder="0.00"
          />
          <FormInput
            label="C (Carbon) Max"
            value={data.cMax}
            onChange={(val) => actions.updateField('cMax', val)}
            placeholder="0.30"
            highlight
          />
          <FormInput
            label="Mn Min"
            value={data.mnMin}
            onChange={(val) => actions.updateField('mnMin', val)}
            placeholder="0.29"
          />
          <FormInput
            label="Mn Max"
            value={data.mnMax}
            onChange={(val) => actions.updateField('mnMax', val)}
            placeholder="1.06"
            highlight
          />
          <FormInput
            label="P (Phosphorus)"
            value={data.pMax}
            onChange={(val) => actions.updateField('pMax', val)}
            placeholder="0.035"
          />
          <FormInput
            label="S (Sulphur)"
            value={data.sMax}
            onChange={(val) => actions.updateField('sMax', val)}
            placeholder="0.035"
          />
          <FormInput
            label="Si (Silicon) Min"
            value={data.siMin}
            onChange={(val) => actions.updateField('siMin', val)}
            placeholder="0.10"
          />
          <FormInput
            label="Si (Silicon) Max"
            value={data.siMax}
            onChange={(val) => actions.updateField('siMax', val)}
            placeholder="0.50"
          />
          <FormInput
            label="Cr (Chromium)"
            value={data.crMax}
            onChange={(val) => actions.updateField('crMax', val)}
            placeholder="0.40"
          />
          <FormInput
            label="Mo (Moly)"
            value={data.moMax}
            onChange={(val) => actions.updateField('moMax', val)}
            placeholder="0.15"
          />
          <FormInput
            label="Ni (Nickel)"
            value={data.niMax}
            onChange={(val) => actions.updateField('niMax', val)}
            placeholder="0.40"
          />
          <FormInput
            label="Cu (Copper)"
            value={data.cuMax}
            onChange={(val) => actions.updateField('cuMax', val)}
            placeholder="0.40"
          />
          <FormInput
            label="V (Vanadium)"
            value={data.vMax}
            onChange={(val) => actions.updateField('vMax', val)}
            placeholder="0.08"
          />
          <FormInput
            label="Nb (Columbium)"
            value={data.nbMax}
            onChange={(val) => actions.updateField('nbMax', val)}
            placeholder="0.02"
          />
          <FormInput
            label="CE (Carbon Eq.)"
            value={data.ceMax}
            onChange={(val) => actions.updateField('ceMax', val)}
            placeholder="0.50"
          />
        </div>
      </FormSectionCard>
    </div>
  );
}
