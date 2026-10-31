'use client';

import React from 'react';
import { Flame, Sparkles } from 'lucide-react';
import { STANDARD_RM_GRADES } from '@/lib/productionUtils';
import type { WorkOrderGroup } from '@/lib/rolling-plans/planReducer';

export interface SizingMillSpecCardProps {
  group: WorkOrderGroup;
  groupIndex: number;
  routes: any[];
  route: string;
  specs: any;
  onUpdateField: (groupId: string, field: keyof WorkOrderGroup, value: any) => void;
}

const fmt = (n: number | string | null | undefined, digits = 2) => {
  if (n == null || n === '') return '—';
  const num = Number(n);
  return isNaN(num) ? String(n) : num.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
};

export default function SizingMillSpecCard({
  group,
  groupIndex,
  routes,
  route,
  specs,
  onUpdateField,
}: SizingMillSpecCardProps) {
  if (!group.isSpecsExpanded) return null;

  return (
    <div className="border-t border-amber-200 bg-amber-50/40 p-4 space-y-4">
      <div className="text-xs font-bold text-amber-950 flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <Flame className="h-4 w-4 text-amber-600" />
          Setup Specifications & Manufacturing Parameters (Setup #{groupIndex + 1})
        </span>
        <span className="text-[11px] text-amber-800 font-normal">
          35-Column Schedule Parameters · Live reactive calculations for shop floor cutting plan
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 text-xs">
        {/* 1. Route & Work Order Classification */}
        <div className="space-y-1.5 p-2.5 rounded-md bg-white border border-slate-200 shadow-2xs">
          <span className="font-bold text-slate-800 block text-[11px] uppercase tracking-wider border-b pb-1">
            1. Route & Work Order
          </span>
          <div>
            <label className="text-[10px] text-indigo-700 font-bold block">
              Process Route *
            </label>
            <select
              value={group.routeId || route}
              onChange={(e) =>
                onUpdateField(group.id, 'routeId', e.target.value)
              }
              className="w-full rounded border border-indigo-300 bg-indigo-50/40 p-1 text-xs font-bold text-slate-900 cursor-pointer"
              required
            >
              <option value="">-- Select Route --</option>
              {routes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.route_code} — {r.route_name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-1.5">
            <div className="w-1/2">
              <label className="text-[10px] text-slate-500 block">Catg</label>
              <input
                type="text"
                value={group.catg}
                onChange={(e) =>
                  onUpdateField(group.id, 'catg', e.target.value)
                }
                className="w-full rounded border border-slate-300 p-1 text-xs font-bold bg-slate-50"
              />
            </div>
            <div className="w-1/2">
              <label className="text-[10px] text-slate-500 block">IBR / NIBR</label>
              <select
                value={group.ibrStatus}
                onChange={(e) =>
                  onUpdateField(group.id, 'ibrStatus', e.target.value)
                }
                className="w-full rounded border border-slate-300 p-1 text-xs font-bold"
              >
                <option value="IBR">IBR</option>
                <option value="NIBR">NIBR</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-[10px] text-slate-500 font-semibold block">Spec</label>
            <input
              type="text"
              value={group.spec}
              placeholder="e.g. ASTM A106 Gr.B"
              onChange={(e) =>
                onUpdateField(group.id, 'spec', e.target.value)
              }
              className="w-full rounded border border-slate-300 p-1 text-xs font-mono bg-white focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="text-[10px] text-indigo-700 font-bold block">RM Grade *</label>
            <div className="relative">
              <input
                type="text"
                list={`rm-grade-list-${group.id}`}
                value={group.grade}
                placeholder="Select or enter RM Grade *..."
                onChange={(e) =>
                  onUpdateField(group.id, 'grade', e.target.value)
                }
                className="w-full rounded border border-indigo-300 p-1 text-xs font-mono font-bold bg-white focus:border-indigo-500"
                required
              />
              <datalist id={`rm-grade-list-${group.id}`}>
                {STANDARD_RM_GRADES.map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            </div>
          </div>
        </div>

        {/* 2. Billet & Weight */}
        <div className="space-y-1.5 p-2.5 rounded-md bg-white border border-slate-200 shadow-2xs">
          <span className="font-bold text-slate-800 block text-[11px] uppercase tracking-wider border-b pb-1">
            2. Billet & Weight
          </span>
          <div>
            <label className="text-[10px] text-slate-500 block">RM OD (mm) *</label>
            <input
              type="number"
              step="0.01"
              value={group.rmOd}
              onChange={(e) =>
                onUpdateField(group.id, 'rmOd', e.target.value)
              }
              className="w-full rounded border border-slate-300 p-1 text-xs font-mono font-bold"
            />
          </div>
          <div className="flex gap-1.5">
            <div className="w-1/2">
              <label className="text-[10px] text-slate-500 block">RM Len Min (m)</label>
              <input
                type="number"
                step="0.001"
                value={group.rmLenMin}
                onChange={(e) =>
                  onUpdateField(group.id, 'rmLenMin', e.target.value)
                }
                className="w-full rounded border border-slate-300 p-1 text-xs font-mono"
              />
            </div>
            <div className="w-1/2">
              <label className="text-[10px] text-slate-500 block">RM Len Max (m)</label>
              <input
                type="number"
                step="0.001"
                value={group.rmLenMax}
                onChange={(e) =>
                  onUpdateField(group.id, 'rmLenMax', e.target.value)
                }
                className="w-full rounded border border-slate-300 p-1 text-xs font-mono"
              />
            </div>
          </div>
          <div className="pt-1 border-t border-slate-100 space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-500">Weight:</span>
              <span className="font-mono font-bold text-slate-900">{fmt(specs.weightKg, 3)} kg</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-500">Wt. After WHF:</span>
              <span className="font-mono font-bold text-slate-700">{fmt(specs.billetWtWhf, 3)} kg</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-500">Nos (Charge):</span>
              <span className="font-mono font-bold text-indigo-700">{specs.nos} Nos</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-500">Mton:</span>
              <span className="font-mono font-bold text-emerald-700">{fmt(specs.mton, 3)} MT</span>
            </div>
          </div>
        </div>

        {/* 3. Piercer Mill (PM) */}
        <div className="space-y-1.5 p-2.5 rounded-md bg-white border border-slate-200 shadow-2xs">
          <span className="font-bold text-slate-800 block text-[11px] uppercase tracking-wider border-b pb-1">
            3. Piercer Mill (PM)
          </span>
          <div className="p-1.5 rounded bg-slate-50 border border-slate-100 space-y-1.5 text-[11px]">
            <div>
              <label className="text-[10px] font-semibold text-slate-600 block mb-0.5">PM OD (mm) *</label>
              <input
                type="number"
                step="0.1"
                value={group.pmOd}
                placeholder={specs.pmOd > 0 ? String(specs.pmOd) : 'Auto (Formula)'}
                onChange={(e) => onUpdateField(group.id, 'pmOd', e.target.value)}
                className="w-full rounded border border-slate-300 bg-white px-1.5 py-0.5 text-xs font-mono font-bold text-slate-900 focus:border-indigo-500 focus:outline-hidden"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-600 block mb-0.5">PM Wt (mm) *</label>
              <input
                type="number"
                step="0.01"
                value={group.pmWt}
                placeholder={specs.pmWt > 0 ? String(specs.pmWt) : 'Auto (Formula)'}
                onChange={(e) => onUpdateField(group.id, 'pmWt', e.target.value)}
                className="w-full rounded border border-slate-300 bg-white px-1.5 py-0.5 text-xs font-mono font-bold text-slate-900 focus:border-indigo-500 focus:outline-hidden"
              />
            </div>
            <div className="flex justify-between items-center pt-1 border-t border-slate-200">
              <span className="text-slate-500">PM Kg/Mtr:</span>
              <span className="font-mono font-bold text-slate-800">{fmt(specs.pmKgMtr, 3)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">PM Length:</span>
              <span className="font-mono font-bold text-indigo-700">{fmt(specs.pmLen, 2)} m</span>
            </div>
          </div>
        </div>

        {/* 4. Sizing Mill (SM) */}
        <div className="space-y-1.5 p-2.5 rounded-md bg-white border border-slate-200 shadow-2xs">
          <span className="font-bold text-slate-800 block text-[11px] uppercase tracking-wider border-b pb-1">
            4. Sizing Mill (SM)
          </span>
          <div>
            <label className="text-[10px] text-indigo-700 font-bold block">MH OD × WT (mm) *</label>
            <div className="flex gap-1.5">
              <input
                type="number"
                step="0.01"
                value={group.custOd}
                onChange={(e) =>
                  onUpdateField(group.id, 'custOd', e.target.value)
                }
                className="w-1/2 rounded border border-slate-300 p-1 text-xs font-mono font-bold"
                placeholder="MH OD"
              />
              <input
                type="number"
                step="0.01"
                value={group.custWt}
                onChange={(e) =>
                  onUpdateField(group.id, 'custWt', e.target.value)
                }
                className="w-1/2 rounded border border-slate-300 p-1 text-xs font-mono font-bold"
                placeholder="MH WT"
              />
            </div>
          </div>
          <div className="pt-1 border-t border-slate-100 space-y-1 text-[11px]">
            <div className="flex justify-between">
              <span className="text-slate-500">Rolling WT:</span>
              <span className="font-mono font-bold text-slate-800">{fmt(specs.rollingWt, 2)} mm</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Wt. After WBF:</span>
              <span className="font-mono font-bold text-slate-800">{fmt(specs.wtWbf, 3)} kg</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">SM Kg/Mtr:</span>
              <span className="font-mono font-bold text-slate-800">{fmt(specs.smKgMtr, 3)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">SM Length:</span>
              <span className="font-mono font-bold text-indigo-700">{fmt(specs.smLen, 2)} m</span>
            </div>
          </div>
        </div>

        {/* 5. Thicken Ends & Effective */}
        <div className="space-y-1.5 p-2.5 rounded-md bg-white border border-slate-200 shadow-2xs">
          <span className="font-bold text-slate-800 block text-[11px] uppercase tracking-wider border-b pb-1">
            5. Ends & Effective
          </span>
          <div className="flex gap-1.5">
            <div className="w-1/2">
              <label className="text-[10px] text-slate-500 block">FE Lg (m)</label>
              <input
                type="number"
                step="0.001"
                value={group.feLen}
                onChange={(e) =>
                  onUpdateField(group.id, 'feLen', e.target.value)
                }
                className="w-full rounded border border-slate-300 p-1 text-xs font-mono"
                placeholder="0.000"
              />
            </div>
            <div className="w-1/2">
              <label className="text-[10px] text-slate-500 block">BE Lg (m)</label>
              <input
                type="number"
                step="0.001"
                value={group.beLen}
                onChange={(e) =>
                  onUpdateField(group.id, 'beLen', e.target.value)
                }
                className="w-full rounded border border-slate-300 p-1 text-xs font-mono"
                placeholder="0.000"
              />
            </div>
          </div>
          <div className="pt-1 border-t border-slate-100 space-y-1 text-[11px]">
            <div className="flex justify-between">
              <span className="text-slate-500">FE Wg:</span>
              <span className="font-mono text-slate-700">{fmt(specs.feWg, 3)} kg</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">BE Wg:</span>
              <span className="font-mono text-slate-700">{fmt(specs.beWg, 3)} kg</span>
            </div>
            <div className="flex justify-between font-bold">
              <span className="text-slate-700">Effective Wg:</span>
              <span className="font-mono text-slate-900">{fmt(specs.effectiveWg, 3)} kg</span>
            </div>
            <div className="flex justify-between font-bold">
              <span className="text-emerald-800">Effective Len:</span>
              <span className="font-mono text-emerald-700">{fmt(specs.effectiveLen, 2)} m</span>
            </div>
          </div>
        </div>

        {/* 6. Length & Multi */}
        <div className="space-y-1.5 p-2.5 rounded-md bg-white border border-slate-200 shadow-2xs">
          <span className="font-bold text-slate-800 block text-[11px] uppercase tracking-wider border-b pb-1">
            6. Length & Multi
          </span>
          <div className="flex gap-1.5">
            <div className="w-1/2">
              <label className="text-[10px] text-indigo-700 font-bold block">Min (m) *</label>
              <input
                type="number"
                step="0.01"
                value={group.reqLenMin}
                onChange={(e) =>
                  onUpdateField(group.id, 'reqLenMin', e.target.value)
                }
                className="w-full rounded border border-slate-300 p-1 text-xs font-mono font-bold"
                placeholder="Min (m)"
              />
            </div>
            <div className="w-1/2">
              <label className="text-[10px] text-indigo-700 font-bold block">Max (m) *</label>
              <input
                type="number"
                step="0.01"
                value={group.reqLenMax}
                onChange={(e) =>
                  onUpdateField(group.id, 'reqLenMax', e.target.value)
                }
                className="w-full rounded border border-slate-300 p-1 text-xs font-mono font-bold"
                placeholder="Max (m)"
              />
            </div>
          </div>
          <div className="flex gap-1.5">
            <div className="w-1/2">
              <label className="text-[10px] text-slate-500 block">E/R</label>
              <div className="w-full rounded border border-slate-200 bg-slate-50 p-1 text-center font-mono font-bold text-xs">
                {specs.erStatus}
              </div>
            </div>
            <div className="w-1/2">
              <label className="text-[10px] text-slate-500 block">Multi</label>
              <input
                type="text"
                value={group.multipleStr}
                onChange={(e) =>
                  onUpdateField(group.id, 'multipleStr', e.target.value)
                }
                className="w-full rounded border border-slate-300 p-1 text-xs font-mono font-bold text-center"
              />
            </div>
          </div>
          <div className="pt-1 border-t border-slate-100 space-y-1 text-[11px]">
            <div className="flex justify-between">
              <span className="text-slate-500">Rolling mtr:</span>
              <span className="font-mono font-bold text-blue-700">{fmt(specs.rollingMtr, 1)} m</span>
            </div>
          </div>
        </div>

        {/* 7. IP Cutting (Pre-Draw Band Saw Cut) */}
        <div className="space-y-1.5 p-2.5 rounded-md bg-white border border-slate-200 shadow-2xs">
          <span className="font-bold text-slate-800 block text-[11px] uppercase tracking-wider border-b pb-1 flex items-center justify-between">
            <span>7. IP Cutting</span>
            {group.isIpCutting && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                ACTIVE
              </span>
            )}
          </span>
          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id={`ip-cut-toggle-${group.id}`}
              checked={Boolean(group.isIpCutting)}
              onChange={(e) =>
                onUpdateField(group.id, 'isIpCutting', e.target.checked)
              }
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
            />
            <label
              htmlFor={`ip-cut-toggle-${group.id}`}
              className="text-[11px] font-bold text-slate-700 cursor-pointer select-none"
            >
              Enable IP Cut
            </label>
          </div>
          {group.isIpCutting && (
            <div className="space-y-1.5 pt-1 border-t border-slate-100">
              <div className="flex gap-1.5">
                <div className="w-1/2">
                  <label className="text-[10px] text-indigo-700 font-bold block">
                    Cut Len (m)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={group.ipCutLength ?? ''}
                    onChange={(e) =>
                      onUpdateField(group.id, 'ipCutLength', e.target.value)
                    }
                    className="w-full rounded border border-indigo-300 bg-indigo-50/30 p-1 text-xs font-mono font-bold"
                    placeholder="e.g. 6.20"
                  />
                </div>
                <div className="w-1/2">
                  <label className="text-[10px] text-indigo-700 font-bold block">
                    IP Multi
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    value={group.ipMultiple ?? '1'}
                    onChange={(e) =>
                      onUpdateField(group.id, 'ipMultiple', e.target.value)
                    }
                    className="w-full rounded border border-indigo-300 bg-indigo-50/30 p-1 text-xs font-mono font-bold text-center"
                    placeholder="1"
                  />
                </div>
              </div>
              <p className="text-[10px] text-slate-500 leading-tight">
                Mother pipe will route to Band Saw for pre-draw cut before Cold Draw.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Live 35-Column Schedule Row Preview */}
      <div className="rounded-lg border border-slate-200 bg-white p-2.5 overflow-x-auto">
        <div className="text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 text-indigo-600" />
          Live 35-Column Schedule Row Preview:
        </div>
        <table className="w-full text-left text-[10px] border-collapse font-mono">
          <thead>
            <tr className="bg-slate-100 text-slate-700 text-center border-b border-slate-300 font-bold">
              <th className="px-1.5 py-0.5 border-r border-slate-200">Sr</th>
              <th className="px-1.5 py-0.5 border-r border-slate-200">Catg</th>
              <th className="px-1.5 py-0.5 border-r border-slate-200">Customer</th>
              <th className="px-1.5 py-0.5 border-r border-slate-200">WO No</th>
              <th className="px-1.5 py-0.5 border-r border-slate-200">Spec</th>
              <th className="px-1.5 py-0.5 border-r border-slate-200">Grade</th>
              <th className="px-1.5 py-0.5 border-r border-slate-200">IBR</th>
              <th className="px-1.5 py-0.5 border-r border-slate-200">Rolling Mtr</th>
              <th className="px-1.5 py-0.5 border-r border-slate-200">RM OD</th>
              <th className="px-1.5 py-0.5 border-r border-slate-200">RM Min</th>
              <th className="px-1.5 py-0.5 border-r border-slate-200">RM Max</th>
              <th className="px-1.5 py-0.5 border-r border-slate-200">Wt(Kg)</th>
              <th className="px-1.5 py-0.5 border-r border-slate-200">Nos</th>
              <th className="px-1.5 py-0.5 border-r border-slate-200">Mton</th>
              <th className="px-1.5 py-0.5 border-r border-slate-200">PM OD</th>
              <th className="px-1.5 py-0.5 border-r border-slate-200">PM WT</th>
              <th className="px-1.5 py-0.5 border-r border-slate-200">PM Kg/m</th>
              <th className="px-1.5 py-0.5 border-r border-slate-200">PM Len</th>
              <th className="px-1.5 py-0.5 border-r border-slate-200">SM OD</th>
              <th className="px-1.5 py-0.5 border-r border-slate-200">SM WT</th>
              <th className="px-1.5 py-0.5 border-r border-slate-200">SM Kg/m</th>
              <th className="px-1.5 py-0.5 border-r border-slate-200">SM Len</th>
              <th className="px-1.5 py-0.5 border-r border-slate-200">FE Len</th>
              <th className="px-1.5 py-0.5 border-r border-slate-200">BE Len</th>
              <th className="px-1.5 py-0.5 border-r border-slate-200">Eff Len</th>
              <th className="px-1.5 py-0.5 border-r border-slate-200">Req Min</th>
              <th className="px-1.5 py-0.5 border-r border-slate-200">Req Max</th>
              <th className="px-1.5 py-0.5">E/R</th>
            </tr>
          </thead>
          <tbody>
            <tr className="hover:bg-indigo-50/50 text-center">
              <td className="px-1.5 py-1 border-r border-slate-200 font-bold">{specs.srNo}</td>
              <td className="px-1.5 py-1 border-r border-slate-200">{specs.catg}</td>
              <td className="px-1.5 py-1 border-r border-slate-200 text-left truncate max-w-[100px]">{specs.customer}</td>
              <td className="px-1.5 py-1 border-r border-slate-200 font-bold text-indigo-700">{specs.woNo}</td>
              <td className="px-1.5 py-1 border-r border-slate-200 truncate max-w-[90px]">{specs.spec}</td>
              <td className="px-1.5 py-1 border-r border-slate-200">{specs.grade}</td>
              <td className="px-1.5 py-1 border-r border-slate-200 font-bold">{specs.ibrStatus}</td>
              <td className="px-1.5 py-1 border-r border-slate-200 font-bold text-blue-700">{fmt(specs.rollingMtr, 1)}</td>
              <td className="px-1.5 py-1 border-r border-slate-200">{fmt(specs.rmOd, 1)}</td>
              <td className="px-1.5 py-1 border-r border-slate-200">{fmt(specs.rmLenMin, 3)}</td>
              <td className="px-1.5 py-1 border-r border-slate-200">{fmt(specs.rmLenMax, 3)}</td>
              <td className="px-1.5 py-1 border-r border-slate-200">{fmt(specs.weightKg, 3)}</td>
              <td className="px-1.5 py-1 border-r border-slate-200 font-bold text-indigo-700">{specs.nos}</td>
              <td className="px-1.5 py-1 border-r border-slate-200 font-bold text-emerald-700">{fmt(specs.mton, 3)}</td>
              <td className="px-1.5 py-1 border-r border-slate-200">{fmt(specs.pmOd, 1)}</td>
              <td className="px-1.5 py-1 border-r border-slate-200">{fmt(specs.pmWt, 2)}</td>
              <td className="px-1.5 py-1 border-r border-slate-200">{fmt(specs.pmKgMtr, 3)}</td>
              <td className="px-1.5 py-1 border-r border-slate-200">{fmt(specs.pmLen, 2)}</td>
              <td className="px-1.5 py-1 border-r border-slate-200 font-bold text-purple-700">{fmt(specs.custOd, 2)}</td>
              <td className="px-1.5 py-1 border-r border-slate-200 font-bold text-purple-700">{fmt(specs.custWt, 2)}</td>
              <td className="px-1.5 py-1 border-r border-slate-200">{fmt(specs.smKgMtr, 3)}</td>
              <td className="px-1.5 py-1 border-r border-slate-200 font-bold">{fmt(specs.smLen, 2)}</td>
              <td className="px-1.5 py-1 border-r border-slate-200">{fmt(specs.feLen, 3)}</td>
              <td className="px-1.5 py-1 border-r border-slate-200">{fmt(specs.beLen, 3)}</td>
              <td className="px-1.5 py-1 border-r border-slate-200 font-bold text-emerald-700">{fmt(specs.effectiveLen, 2)}</td>
              <td className="px-1.5 py-1 border-r border-slate-200">{fmt(specs.reqLenMin, 2)}</td>
              <td className="px-1.5 py-1 border-r border-slate-200">{fmt(specs.reqLenMax, 2)}</td>
              <td className="px-1.5 py-1 font-bold">{specs.erStatus}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
