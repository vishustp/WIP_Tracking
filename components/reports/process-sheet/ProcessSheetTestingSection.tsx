// components/reports/process-sheet/ProcessSheetTestingSection.tsx
'use client';

import React from 'react';
import { Thermometer, ShieldCheck, Gauge, Clock } from 'lucide-react';
import { FormSectionCard, FormInput } from './FormCommon';
import type { ProcessSheetFormData, ProcessSheetFormActions } from './types';

export default function ProcessSheetTestingSection({
  data,
  actions,
}: {
  data: ProcessSheetFormData;
  actions: ProcessSheetFormActions;
}) {
  return (
    <div className="space-y-5">
      {/* Furnace Operating Temperatures */}
      <FormSectionCard title="Furnace Temperatures & Thermal Profile" icon={Thermometer} headerBg="bg-amber-900">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <FormInput
            label="Walking Hearth Furnace (WHF)"
            value={data.whfTemp}
            onChange={(val) => actions.updateField('whfTemp', val)}
            placeholder="1220° C (+/- 40° C)"
            highlight
          />
          <FormInput
            label="Induction Furnace Temp"
            value={data.inductionTemp}
            onChange={(val) => actions.updateField('inductionTemp', val)}
            placeholder="850 °C - 880° C"
          />
          <FormInput
            label="Sizing Mill Outlet Temp"
            value={data.sizingOutletTemp}
            onChange={(val) => actions.updateField('sizingOutletTemp', val)}
            placeholder="880° C TO 900° C"
          />
        </div>
      </FormSectionCard>

      {/* Heat Treatment Specifications */}
      <FormSectionCard title="Heat Treatment Cycles & Holding Duration" icon={Clock} headerBg="bg-slate-800">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <FormInput
            label="Heat Treatment Cycle"
            value={data.htCycle}
            onChange={(val) => actions.updateField('htCycle', val)}
            placeholder="NORMALIZING / QUENCH & TEMPER / NA"
          />
          <FormInput
            label="Heat Treatment Condition"
            value={data.htCondition}
            onChange={(val) => actions.updateField('htCondition', val)}
            placeholder="AS ROLLED / NORMALIZED 900-940°C"
            highlight
          />
          <FormInput
            label="Holding Time"
            value={data.holdingTime}
            onChange={(val) => actions.updateField('holdingTime', val)}
            placeholder="5 SEC / 30 MIN"
          />
        </div>
      </FormSectionCard>

      {/* Testing & QC Verification */}
      <FormSectionCard title="Quality Control & Hydrostatic Test Requirements" icon={ShieldCheck} headerBg="bg-blue-900">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormInput
            label="Barlow Hydrostatic Test Pressure"
            value={data.hydroPressurePsi}
            onChange={(val) => actions.updateField('hydroPressurePsi', val)}
            unit="PSI"
            title="Barlow Formula capped per ASTM standard"
            highlight
          />
          <FormInput
            label="Non-Destructive Testing (NDT)"
            value={data.ndt}
            onChange={(val) => actions.updateField('ndt', val)}
            placeholder="UT / ET / MT"
            highlight
          />
        </div>
      </FormSectionCard>
    </div>
  );
}
