// components/reports/process-sheet/ProcessSheetHotMillSection.tsx
'use client';

import React from 'react';
import { Flame, Disc, Gauge } from 'lucide-react';
import { FormSectionCard, FormInput } from './FormCommon';
import type { ProcessSheetFormData, ProcessSheetFormActions } from './types';

export default function ProcessSheetHotMillSection({
  data,
  actions,
}: {
  data: ProcessSheetFormData;
  actions: ProcessSheetFormActions;
}) {
  return (
    <div className="space-y-5">
      {/* Sizing & Rolling Mill Parameters */}
      <FormSectionCard title="Hot Rolling & Sizing Mill (Mother Hollow)" icon={Gauge} headerBg="bg-slate-800">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <FormInput
            label="Mother Hollow OD"
            value={data.motherHollowOd}
            onChange={(val) => actions.updateField('motherHollowOd', val)}
            unit="MM"
            highlight
          />
          <FormInput
            label="Mother Hollow WT"
            value={data.motherHollowWt}
            onChange={(val) => actions.updateField('motherHollowWt', val)}
            unit="MM"
            highlight
          />
          <FormInput
            label="Rolling WT"
            value={data.rollingWt}
            onChange={(val) => actions.updateField('rollingWt', val)}
            unit="MM"
          />
          <FormInput
            label="MH Kg/Meter"
            value={data.motherHollowKgMtr}
            onChange={(val) => actions.updateField('motherHollowKgMtr', val)}
            unit="KG/M"
          />
          <FormInput
            label="SM Length"
            value={data.smLength}
            onChange={(val) => actions.updateField('smLength', val)}
            unit="MTR"
          />
          <FormInput
            label="HFS Final Length"
            value={data.hfsFinalLength}
            onChange={(val) => actions.updateField('hfsFinalLength', val)}
            unit="MTR"
          />
        </div>
      </FormSectionCard>

      {/* Piercer Shell & Raw Billet */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <FormSectionCard title="Piercing Mill (Hollow Shell)" icon={Disc} headerBg="bg-amber-900">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <FormInput
              label="Piercer Shell OD"
              value={data.piercerOd}
              onChange={(val) => actions.updateField('piercerOd', val)}
              unit="MM"
            />
            <FormInput
              label="Piercer Shell WT"
              value={data.piercerWt}
              onChange={(val) => actions.updateField('piercerWt', val)}
              unit="MM"
            />
            <FormInput
              label="Shell Length"
              value={data.piercerShellLen}
              onChange={(val) => actions.updateField('piercerShellLen', val)}
              unit="MTR"
            />
            <FormInput
              label="Shell Kg/Mtr"
              value={data.shellWeight}
              onChange={(val) => actions.updateField('shellWeight', val)}
              unit="KG/M"
            />
          </div>
        </FormSectionCard>

        <FormSectionCard title="Raw Material Billet Sizing" icon={Flame} headerBg="bg-rose-900">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <FormInput
              label="Billet Diameter"
              value={data.billetDia}
              onChange={(val) => actions.updateField('billetDia', val)}
              unit="MM"
              highlight
            />
            <FormInput
              label="Billet Sect. Wt."
              value={data.billetSectWt}
              onChange={(val) => actions.updateField('billetSectWt', val)}
              unit="KG/M"
            />
            <FormInput
              label="Billet Length"
              value={data.billetLength}
              onChange={(val) => actions.updateField('billetLength', val)}
              unit="MM"
            />
            <FormInput
              label="Total Weight"
              value={data.totalWeightMt}
              onChange={(val) => actions.updateField('totalWeightMt', val)}
              unit="MT"
            />
          </div>
        </FormSectionCard>
      </div>
    </div>
  );
}
