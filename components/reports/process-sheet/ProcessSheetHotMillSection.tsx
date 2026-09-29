// components/reports/process-sheet/ProcessSheetHotMillSection.tsx
'use client';

import React from 'react';
import { Flame, Disc, Ruler, Gauge, AlertCircle } from 'lucide-react';
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
      {/* Finished Pipe Target Dimensions */}
      <FormSectionCard title="Target Pipe Dimensions & Process Wall" icon={Ruler} headerBg="bg-blue-900">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          <FormInput
            label="Finished OD"
            value={data.custOd}
            onChange={(val) => actions.updateField('custOd', val)}
            unit="MM"
            highlight
          />
          <FormInput
            label="Finished WT"
            value={data.custWt}
            onChange={(val) => actions.updateField('custWt', val)}
            unit="MM"
            highlight
          />
          <FormInput
            label="Process WT"
            value={data.processWt}
            onChange={(val) => actions.updateField('processWt', val)}
            unit="MM"
            title="Process Wall Thickness (+5% for Min-Wall, -3% for Standard)"
            highlight
          />
          <div className="space-y-1">
            <span className="font-bold text-xs text-slate-700 block">Wall Tolerance Type</span>
            <button
              type="button"
              onClick={() => actions.updateField('isMinWall', !data.isMinWall)}
              className={`w-full py-1.5 px-2 text-xs font-bold rounded-lg border flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                data.isMinWall
                  ? 'bg-amber-100 text-amber-900 border-amber-400 hover:bg-amber-200'
                  : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
              }`}
            >
              <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
              <span>{data.isMinWall ? 'MIN WALL (+20%/-0%)' : 'NOMINAL (+15%/-12.5%)'}</span>
            </button>
          </div>
          <FormInput
            label="Weight / Meter"
            value={data.finalPipeWeight}
            onChange={(val) => actions.updateField('finalPipeWeight', val)}
            unit="KG/M"
          />
          <FormInput
            label="Length 1 (Min)"
            value={data.finalOrderLen1}
            onChange={(val) => actions.updateField('finalOrderLen1', val)}
            unit="MTR"
          />
          <FormInput
            label="Length 2 (Max)"
            value={data.finalOrderLen2}
            onChange={(val) => actions.updateField('finalOrderLen2', val)}
            unit="MTR"
          />
          <FormInput
            label="Average Length"
            value={data.finalLength}
            onChange={(val) => actions.updateField('finalLength', val)}
            unit="MTR"
          />
          <FormInput
            label="Length Tol."
            value={data.finalLenTol}
            onChange={(val) => actions.updateField('finalLenTol', val)}
            placeholder="e.g. +10MM / SRL"
          />
          <FormInput
            label="Bundle Qty"
            value={data.bundleQtyPcs}
            onChange={(val) => actions.updateField('bundleQtyPcs', val)}
            unit="PCS"
            title="Calculated for ~2.0 MT bundle limit"
          />
          <FormInput
            label="Bundle Weight"
            value={data.bundleWeightMt}
            onChange={(val) => actions.updateField('bundleWeightMt', val)}
            unit="MT"
          />
        </div>

        {/* Tolerances row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 pt-3 border-t border-slate-100">
          <FormInput
            label="OD Tol. Min"
            value={data.finalTolOdMin}
            onChange={(val) => actions.updateField('finalTolOdMin', val)}
            unit="MM"
          />
          <FormInput
            label="OD Tol. Max"
            value={data.finalTolOdMax}
            onChange={(val) => actions.updateField('finalTolOdMax', val)}
            unit="MM"
          />
          <FormInput
            label="WT Tol. Min"
            value={data.finalTolWtMin}
            onChange={(val) => actions.updateField('finalTolWtMin', val)}
            unit="MM"
          />
          <FormInput
            label="WT Tol. Max"
            value={data.finalTolWtMax}
            onChange={(val) => actions.updateField('finalTolWtMax', val)}
            unit="MM"
          />
        </div>
      </FormSectionCard>

      {/* Sizing & Rolling Mill Parameters */}
      <FormSectionCard title="Hot Rolling & Sizing Mill" icon={Gauge} headerBg="bg-slate-800">
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
