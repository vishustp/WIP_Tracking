'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Printer,
  Sparkles,
  RefreshCw,
  Search,
  CheckCircle2,
  FileSpreadsheet,
  AlertCircle,
  Cpu,
  Layers,
  ArrowRight,
  Flame,
  ShieldCheck,
  Activity,
  Gauge,
  Info,
  Save,
  FileText,
  Check,
  Copy,
  Undo2,
  Sliders,
  Thermometer,
  Ruler,
  FlaskConical,
  Award,
  PackageCheck,
  Calendar,
  UserCheck,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { ProcessSpecResult, calculateStandardTolerances } from '@/lib/metallurgy/specEngine';

interface RollingPlanRecord {
  id: string;
  plan_no: string;
  work_order_id: string;
  planned_rolling_date: string;
  planned_qty: number;
  process_route_id: string | null;
  target_mother_size: string | null;
  multiple: number;
  status: any;
  mh_od: number | null;
  mh_wt: number | null;
  mh_l1: number | null;
  mh_l2: number | null;
  pass_required: number | null;
  // joined fields
  work_order_no: string;
  customer_name: string | null;
  grade: string | null;
  specification: string | null;
  size_od: number | null;
  size_wt: number | null;
  l1: number | null;
  l2: number | null;
  ordered_qty: number | null;
  ordered_qty_pcs: number | null;
  ordered_qty_mtr: number | null;
  route_code: string;
  route_name: string;
  po_no?: string | null;
  po_date?: string | null;
  material_code?: string | null;
  destination?: string | null;
  is_diversion?: boolean;
  display_label?: string;
}

function buildMarkingString(
  type: 'single' | 'triple',
  params: {
    routeCode?: string | null;
    specification?: string | null;
    grade?: string | null;
    sizeOd?: number | string | null;
    sizeWt?: number | string | null;
    hydroPsi?: string | null;
    woNo?: string | null;
    poNo?: string | null;
  }
): string {
  const rCode = (params.routeCode || 'HFS').toUpperCase().includes('CDS') ? 'CDS' : 'HFS';
  const odVal = Number(params.sizeOd || 73.0);
  const wtVal = Number(params.sizeWt || 7.01);
  const odStr = (Number.isFinite(odVal) && odVal > 0 ? odVal : 73.0).toFixed(2);
  const wtStr = (Number.isFinite(wtVal) && wtVal > 0 ? wtVal : 7.01).toFixed(2);
  const hydroStr = params.hydroPsi
    ? (params.hydroPsi.includes('PSI') ? params.hydroPsi : `${params.hydroPsi} PSI`)
    : '2500 PSI';

  if (type === 'triple') {
    return `(IBR) RASHMI SMLS / LOGO / ${rCode} /ASTM A106 Gr B /ASME SA106 GR B/ASTM A53 GR B/ API 5L GR B/ NACE MR0103/MR0175 OD ${odStr} MM X WT ${wtStr} MM / HYDRO TESTED ${hydroStr} / NDE /  LENGTH......MM + H .NO____  + BUNDLE NO..............`;
  }

  // Single Marking
  const specGrade = params.specification || params.grade || 'ASME SA210 Gr.A1';
  return `(IBR) RASHMI SMLS / LOGO / ${rCode} / ${specGrade} / OD ${odStr} MM X WT ${wtStr} MM / HYDRO TESTED ${hydroStr} / NDE /  LENGTH......MM + H .NO____  + BUNDLE NO..............`;
}

// Reusable Form UI Components
function FormSectionCard({
  title,
  subtitle,
  icon: Icon,
  badge,
  badgeColor = 'indigo',
  children,
}: {
  title: string;
  subtitle?: string;
  icon: React.ElementType;
  badge?: string;
  badgeColor?: 'indigo' | 'emerald' | 'amber' | 'blue' | 'purple' | 'rose' | 'slate';
  children: React.ReactNode;
}) {
  const colorClasses: Record<string, string> = {
    indigo: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30',
    emerald: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
    amber: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
    blue: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
    purple: 'bg-purple-500/10 text-purple-300 border-purple-500/30',
    rose: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
    slate: 'bg-slate-800 text-slate-300 border-slate-700',
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow-xl hover:border-slate-700/80 transition-all duration-200">
      <div className="px-4 py-3 bg-slate-850/80 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-slate-950 border border-slate-700/80 text-indigo-400 shadow-inner">
            <Icon className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs sm:text-sm font-bold text-white tracking-wide">{title}</h3>
            {subtitle && <p className="text-[10px] text-slate-400">{subtitle}</p>}
          </div>
        </div>
        {badge && (
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase border ${
              colorClasses[badgeColor] || colorClasses.indigo
            }`}
          >
            {badge}
          </span>
        )}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  );
}

function FormInput({
  label,
  value,
  onChange,
  unit,
  type = 'text',
  placeholder,
  disabled = false,
  highlight = false,
  title,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  unit?: string;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
  highlight?: boolean;
  title?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <label className="font-semibold text-slate-300 truncate" title={title || label}>
          {label}
        </label>
        {unit && (
          <span className="text-[9.5px] font-mono text-slate-400 bg-slate-950 px-1.5 py-0.2 rounded border border-slate-800">
            {unit}
          </span>
        )}
      </div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        title={title}
        className={`w-full px-3 py-1.5 bg-slate-950 border ${
          highlight
            ? 'border-indigo-500 text-indigo-200 shadow-sm shadow-indigo-500/10'
            : 'border-slate-700/80 text-white hover:border-slate-500 focus:border-indigo-500'
        } rounded-lg text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors placeholder:text-slate-600 disabled:opacity-50`}
      />
    </div>
  );
}

export default function ProcessSheetReportClient() {
  const selectPlanRef = useRef<(plan: RollingPlanRecord) => void>(() => {});
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<RollingPlanRecord[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [specSource, setSpecSource] = useState<'ai' | 'engine' | 'manual'>('engine');

  // Form View Mode & Database Persistence States
  const [viewMode, setViewMode] = useState<'form' | 'preview'>('form');
  const [saving, setSaving] = useState(false);
  const [savedRecord, setSavedRecord] = useState<any | null>(null);
  const [formFilterTab, setFormFilterTab] = useState<'all' | 'order' | 'mill' | 'metallurgy' | 'testing' | 'marking'>('all');

  // Process Sheet Form State Fields (Empty/Dynamic by default)
  const [sheetNo, setSheetNo] = useState('');
  const [revNo, setRevNo] = useState('REV 01');
  const [orderType, setOrderType] = useState('HFS');
  const [routeType, setRouteType] = useState('HFS');
  const [sheetDate, setSheetDate] = useState(() => {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
  });

  const [customer, setCustomer] = useState('');
  const [destination, setDestination] = useState('');
  const [poNo, setPoNo] = useState('');
  const [poDate, setPoDate] = useState('');
  const [woNo, setWoNo] = useState('');
  const [woDate, setWoDate] = useState(() => {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
  });
  const [orderQty, setOrderQty] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('IMMEDIATE');
  const [materialCode, setMaterialCode] = useState('');
  const [priority, setPriority] = useState('1');
  const [materialSpec, setMaterialSpec] = useState('');
  const [pipeColorCode, setPipeColorCode] = useState('WHITE');
  const [rmColorCode, setRmColorCode] = useState('YELLOW + WHITE');
  const [steelGrade, setSteelGrade] = useState('');
  const [heatNo, setHeatNo] = useState('');

  // Billet Details
  const [billetDia, setBilletDia] = useState('');
  const [billetSectWt, setBilletSectWt] = useState('');
  const [totalWeightMt, setTotalWeightMt] = useState('');
  const [billetLength, setBilletLength] = useState('');
  const [cuttingTol, setCuttingTol] = useState('+5/-0 MM');
  const [multiple, setMultiple] = useState('1');

  // Temperatures
  const [whfTemp, setWhfTemp] = useState('1220° C (+/- 40° C)');
  const [inductionTemp, setInductionTemp] = useState('850 °C - 880° C');
  const [sizingOutletTemp, setSizingOutletTemp] = useState('880° C TO 900° C');

  // Piercer & Mother Hollow
  const [piercerOd, setPiercerOd] = useState('');
  const [piercerWt, setPiercerWt] = useState('');
  const [piercerShellLen, setPiercerShellLen] = useState('');
  const [shellWeight, setShellWeight] = useState('');

  const [motherHollowOd, setMotherHollowOd] = useState('');
  const [motherHollowWt, setMotherHollowWt] = useState('');
  const [rollingWt, setRollingWt] = useState('');
  const [motherHollowKgMtr, setMotherHollowKgMtr] = useState('');
  const [smLength, setSmLength] = useState('');
  const [hfsFinalLength, setHfsFinalLength] = useState('');

  // Tolerances
  const [mhTolOdMin, setMhTolOdMin] = useState('');
  const [mhTolOdMax, setMhTolOdMax] = useState('');
  const [mhTolWtMin, setMhTolWtMin] = useState('');
  const [mhTolWtMax, setMhTolWtMax] = useState('');

  const [planQtyNos, setPlanQtyNos] = useState('');
  const [planQtyMtrs, setPlanQtyMtrs] = useState('');
  const [planQtyMt, setPlanQtyMt] = useState('');
  const [inspection, setInspection] = useState('IBR');
  const [processRouteStr, setProcessRouteStr] = useState(
    'BILLET CUTTING # WHF # PIERCER # SIZING # STRA # CUTTING # UT # HYDRO # VDI # BLACK VARNISH # MARKING # BUNDLING'
  );

  // Cold Mill & Final
  const [custOd, setCustOd] = useState('');
  const [custWt, setCustWt] = useState('');
  const [processWt, setProcessWt] = useState('');
  const [finalPipeWeight, setFinalPipeWeight] = useState('');
  const [finalLength, setFinalLength] = useState('');
  const [finalOrderLen1, setFinalOrderLen1] = useState('');
  const [finalOrderLen2, setFinalOrderLen2] = useState('');

  const [finalTolOdMin, setFinalTolOdMin] = useState('');
  const [finalTolOdMax, setFinalTolOdMax] = useState('');
  const [finalTolWtMin, setFinalTolWtMin] = useState('');
  const [finalTolWtMax, setFinalTolWtMax] = useState('');
  const [finalLenTol, setFinalLenTol] = useState('+10MM');

  // Inter Pass
  const [p1Od, setP1Od] = useState('NA');
  const [p1Wt, setP1Wt] = useState('NA');
  const [p2Od, setP2Od] = useState('NA');
  const [p2Wt, setP2Wt] = useState('NA');
  const [p3Od, setP3Od] = useState('NA');
  const [p3Wt, setP3Wt] = useState('NA');

  // Heat Treatment
  const [htCycle, setHtCycle] = useState('NA');
  const [htCondition, setHtCondition] = useState('NA');
  const [straightness, setStraightness] = useState('1:1000');
  const [hardness, setHardness] = useState('79 HRB MAX');

  // Mechanical Properties
  const [ystMin, setYstMin] = useState('240');
  const [ystMax, setYstMax] = useState('NOT SPECIFIED');
  const [utsMin, setUtsMin] = useState('415');
  const [utsMax, setUtsMax] = useState('NOT SPECIFIED');
  const [elongationMin, setElongationMin] = useState('21');
  const [elongationMax, setElongationMax] = useState('NOT SPECIFIED');

  // Testing & Inspection
  const [ndt, setNdt] = useState('UT');
  const [hydroPressurePsi, setHydroPressurePsi] = useState('2500 PSI');
  const [holdingTime, setHoldingTime] = useState('5 SEC');

  // Coating & Finishing
  const [coating, setCoating] = useState('BLACK VARNISH');
  const [endCondition, setEndCondition] = useState('BEVEL END (30°-35°) ROOT FACE (0.8 - 2.4MM)');
  const [bundling, setBundling] = useState('HEXAGONAL');
  const [bundleQtyPcs, setBundleQtyPcs] = useState('-');
  const [bundleWeightMt, setBundleWeightMt] = useState('-');
  const [endCap, setEndCap] = useState('PLASTIC PROTECTOR');

  const [specialReq, setSpecialReq] = useState('');
  const [markingType, setMarkingType] = useState<'single' | 'triple'>('single');
  const markingTypeRef = useRef<'single' | 'triple'>('single');
  markingTypeRef.current = markingType;
  const [marking, setMarking] = useState('(IBR) RASHMI SMLS / LOGO / CDS / ASME SA210 Gr.A1 / OD 63.50 MM X WT 4.06 MM / HYDRO TESTED 2500 PSI / NDE /  LENGTH......MM + H .NO____  + BUNDLE NO..............');

  // Signatures
  const [preparedBy] = useState('PPC EXEC');
  const [preparedDate] = useState(() => {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
  });

  // Hydrate all state variables from saved sheet JSON
  const applySavedSheetData = (d: any) => {
    if (!d || typeof d !== 'object') return;
    if (d.sheetNo !== undefined) setSheetNo(String(d.sheetNo));
    if (d.revNo !== undefined) setRevNo(String(d.revNo));
    if (d.orderType !== undefined) setOrderType(String(d.orderType));
    if (d.routeType !== undefined) setRouteType(String(d.routeType));
    if (d.sheetDate !== undefined) setSheetDate(String(d.sheetDate));
    if (d.customer !== undefined) setCustomer(String(d.customer));
    if (d.destination !== undefined) setDestination(String(d.destination));
    if (d.poNo !== undefined) setPoNo(String(d.poNo));
    if (d.poDate !== undefined) setPoDate(String(d.poDate));
    if (d.woNo !== undefined) setWoNo(String(d.woNo));
    if (d.woDate !== undefined) setWoDate(String(d.woDate));
    if (d.orderQty !== undefined) setOrderQty(String(d.orderQty));
    if (d.deliveryDate !== undefined) setDeliveryDate(String(d.deliveryDate));
    if (d.materialCode !== undefined) setMaterialCode(String(d.materialCode));
    if (d.priority !== undefined) setPriority(String(d.priority));
    if (d.materialSpec !== undefined) setMaterialSpec(String(d.materialSpec));
    if (d.pipeColorCode !== undefined) setPipeColorCode(String(d.pipeColorCode));
    if (d.rmColorCode !== undefined) setRmColorCode(String(d.rmColorCode));
    if (d.steelGrade !== undefined) setSteelGrade(String(d.steelGrade));
    if (d.heatNo !== undefined) setHeatNo(String(d.heatNo));

    if (d.billetDia !== undefined) setBilletDia(String(d.billetDia));
    if (d.billetSectWt !== undefined) setBilletSectWt(String(d.billetSectWt));
    if (d.totalWeightMt !== undefined) setTotalWeightMt(String(d.totalWeightMt));
    if (d.billetLength !== undefined) setBilletLength(String(d.billetLength));
    if (d.cuttingTol !== undefined) setCuttingTol(String(d.cuttingTol));
    if (d.multiple !== undefined) setMultiple(String(d.multiple));

    if (d.whfTemp !== undefined) setWhfTemp(String(d.whfTemp));
    if (d.inductionTemp !== undefined) setInductionTemp(String(d.inductionTemp));
    if (d.sizingOutletTemp !== undefined) setSizingOutletTemp(String(d.sizingOutletTemp));

    if (d.piercerOd !== undefined) setPiercerOd(String(d.piercerOd));
    if (d.piercerWt !== undefined) setPiercerWt(String(d.piercerWt));
    if (d.piercerShellLen !== undefined) setPiercerShellLen(String(d.piercerShellLen));
    if (d.shellWeight !== undefined) setShellWeight(String(d.shellWeight));

    if (d.motherHollowOd !== undefined) setMotherHollowOd(String(d.motherHollowOd));
    if (d.motherHollowWt !== undefined) setMotherHollowWt(String(d.motherHollowWt));
    if (d.rollingWt !== undefined) setRollingWt(String(d.rollingWt));
    if (d.motherHollowKgMtr !== undefined) setMotherHollowKgMtr(String(d.motherHollowKgMtr));
    if (d.smLength !== undefined) setSmLength(String(d.smLength));
    if (d.hfsFinalLength !== undefined) setHfsFinalLength(String(d.hfsFinalLength));

    if (d.mhTolOdMin !== undefined) setMhTolOdMin(String(d.mhTolOdMin));
    if (d.mhTolOdMax !== undefined) setMhTolOdMax(String(d.mhTolOdMax));
    if (d.mhTolWtMin !== undefined) setMhTolWtMin(String(d.mhTolWtMin));
    if (d.mhTolWtMax !== undefined) setMhTolWtMax(String(d.mhTolWtMax));

    if (d.planQtyNos !== undefined) setPlanQtyNos(String(d.planQtyNos));
    if (d.planQtyMtrs !== undefined) setPlanQtyMtrs(String(d.planQtyMtrs));
    if (d.planQtyMt !== undefined) setPlanQtyMt(String(d.planQtyMt));
    if (d.inspection !== undefined) setInspection(String(d.inspection));
    if (d.processRouteStr !== undefined) setProcessRouteStr(String(d.processRouteStr));

    if (d.custOd !== undefined) setCustOd(String(d.custOd));
    if (d.custWt !== undefined) setCustWt(String(d.custWt));
    if (d.processWt !== undefined) setProcessWt(String(d.processWt));
    if (d.finalPipeWeight !== undefined) setFinalPipeWeight(String(d.finalPipeWeight));
    if (d.finalLength !== undefined) setFinalLength(String(d.finalLength));
    if (d.finalOrderLen1 !== undefined) setFinalOrderLen1(String(d.finalOrderLen1));
    if (d.finalOrderLen2 !== undefined) setFinalOrderLen2(String(d.finalOrderLen2));

    if (d.finalTolOdMin !== undefined) setFinalTolOdMin(String(d.finalTolOdMin));
    if (d.finalTolOdMax !== undefined) setFinalTolOdMax(String(d.finalTolOdMax));
    if (d.finalTolWtMin !== undefined) setFinalTolWtMin(String(d.finalTolWtMin));
    if (d.finalTolWtMax !== undefined) setFinalTolWtMax(String(d.finalTolWtMax));
    if (d.finalLenTol !== undefined) setFinalLenTol(String(d.finalLenTol));

    if (d.p1Od !== undefined) setP1Od(String(d.p1Od));
    if (d.p1Wt !== undefined) setP1Wt(String(d.p1Wt));
    if (d.p2Od !== undefined) setP2Od(String(d.p2Od));
    if (d.p2Wt !== undefined) setP2Wt(String(d.p2Wt));
    if (d.p3Od !== undefined) setP3Od(String(d.p3Od));
    if (d.p3Wt !== undefined) setP3Wt(String(d.p3Wt));

    if (d.htCycle !== undefined) setHtCycle(String(d.htCycle));
    if (d.htCondition !== undefined) setHtCondition(String(d.htCondition));
    if (d.straightness !== undefined) setStraightness(String(d.straightness));
    if (d.hardness !== undefined) setHardness(String(d.hardness));

    if (d.ystMin !== undefined) setYstMin(String(d.ystMin));
    if (d.ystMax !== undefined) setYstMax(String(d.ystMax));
    if (d.utsMin !== undefined) setUtsMin(String(d.utsMin));
    if (d.utsMax !== undefined) setUtsMax(String(d.utsMax));
    if (d.elongationMin !== undefined) setElongationMin(String(d.elongationMin));
    if (d.elongationMax !== undefined) setElongationMax(String(d.elongationMax));

    if (d.ndt !== undefined) setNdt(String(d.ndt));
    if (d.hydroPressurePsi !== undefined) setHydroPressurePsi(String(d.hydroPressurePsi));
    if (d.holdingTime !== undefined) setHoldingTime(String(d.holdingTime));

    if (d.coating !== undefined) setCoating(String(d.coating));
    if (d.endCondition !== undefined) setEndCondition(String(d.endCondition));
    if (d.bundling !== undefined) setBundling(String(d.bundling));
    if (d.bundleQtyPcs !== undefined) setBundleQtyPcs(String(d.bundleQtyPcs));
    if (d.bundleWeightMt !== undefined) setBundleWeightMt(String(d.bundleWeightMt));
    if (d.endCap !== undefined) setEndCap(String(d.endCap));

    if (d.specialReq !== undefined) setSpecialReq(String(d.specialReq));
    if (d.markingType !== undefined) {
      setMarkingType(d.markingType as 'single' | 'triple');
      markingTypeRef.current = d.markingType as 'single' | 'triple';
    }
    if (d.marking !== undefined) setMarking(String(d.marking));
  };

  // Save current Process Sheet to Supabase process_sheets table
  const handleSaveProcessSheet = async () => {
    const activePlan = plans.find((p) => p.id === selectedPlanId);
    if (!activePlan && !woNo) {
      toast.error('Please select a Work Order before saving.');
      return;
    }
    setSaving(true);
    try {
      const s = createClient();
      const effectiveSheetNo = sheetNo.trim() || `PS-${woNo || 'UNKNOWN'}`;
      const payload = {
        plan_id: activePlan?.id || selectedPlanId || 'manual',
        work_order_no: woNo || activePlan?.work_order_no || 'WO-MANUAL',
        sheet_no: effectiveSheetNo,
        saved_by: preparedBy || 'PPC EXEC',
        sheet_data: {
          sheetNo: effectiveSheetNo,
          revNo,
          orderType,
          routeType,
          sheetDate,
          customer,
          destination,
          poNo,
          poDate,
          woNo,
          woDate,
          orderQty,
          deliveryDate,
          materialCode,
          priority,
          materialSpec,
          pipeColorCode,
          rmColorCode,
          steelGrade,
          heatNo,
          billetDia,
          billetSectWt,
          totalWeightMt,
          billetLength,
          cuttingTol,
          multiple,
          whfTemp,
          inductionTemp,
          sizingOutletTemp,
          piercerOd,
          piercerWt,
          piercerShellLen,
          shellWeight,
          motherHollowOd,
          motherHollowWt,
          rollingWt,
          motherHollowKgMtr,
          smLength,
          hfsFinalLength,
          mhTolOdMin,
          mhTolOdMax,
          mhTolWtMin,
          mhTolWtMax,
          planQtyNos,
          planQtyMtrs,
          planQtyMt,
          inspection,
          processRouteStr,
          custOd,
          custWt,
          processWt,
          finalPipeWeight,
          finalLength,
          finalOrderLen1,
          finalOrderLen2,
          finalTolOdMin,
          finalTolOdMax,
          finalTolWtMin,
          finalTolWtMax,
          finalLenTol,
          p1Od,
          p1Wt,
          p2Od,
          p2Wt,
          p3Od,
          p3Wt,
          htCycle,
          htCondition,
          straightness,
          hardness,
          ystMin,
          ystMax,
          utsMin,
          utsMax,
          elongationMin,
          elongationMax,
          ndt,
          hydroPressurePsi,
          holdingTime,
          coating,
          endCondition,
          bundling,
          bundleQtyPcs,
          bundleWeightMt,
          endCap,
          specialReq,
          markingType,
          marking,
          preparedBy,
          preparedDate,
        },
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await s
        .from('process_sheets')
        .upsert(payload, { onConflict: 'sheet_no' })
        .select()
        .single();

      if (error) throw error;
      setSavedRecord(data);
      toast.success(`Process Sheet (${effectiveSheetNo}) saved to database!`);
    } catch (err: any) {
      console.error('Error saving process sheet:', err);
      toast.error(`Save failed: ${err.message || err}`);
    } finally {
      setSaving(false);
    }
  };

  // Revert back to formula-calculated plan defaults
  const resetToCalculatedDefaults = () => {
    const activePlan = plans.find((p) => p.id === selectedPlanId);
    if (activePlan) {
      selectPlanRef.current(activePlan);
      setSavedRecord(null);
      toast.info('Reset form parameters to auto-calculated metallurgical defaults.');
    }
  };

  // Load ALL Work Orders (User requested: remove Plan issued condition, all work orders available)
  const loadIssuedPlans = useCallback(async () => {
    setLoading(true);
    try {
      const s = createClient();

      // 1. Fetch ALL Work Orders unconditionally
      const { data: woRes, error: woErr } = await s
        .from('work_orders')
        .select('*')
        .order('work_order_no', { ascending: false })
        .limit(2000);

      if (woErr) {
        console.warn('Error fetching work orders:', woErr);
      }
      const allWorkOrders: any[] = woRes || [];

      // 2. Fetch Rolling Plans (if available, to enrich work orders with plan specifications)
      let rawPlans: any[] = [];
      try {
        const { data: directRps, error: directErr } = await s
          .from('rolling_plans')
          .select('id, plan_no, work_order_id, planned_rolling_date, planned_qty, process_route_id, multiple, status, mh_od, mh_wt, mh_l1, mh_l2, pass_required')
          .order('planned_rolling_date', { ascending: false })
          .limit(2000);
        if (!directErr && directRps) {
          rawPlans = directRps;
        }
      } catch (rpE) {
        console.warn('Rolling plans fetch note:', rpE);
      }

      // 3. Fetch Diversion Plans
      let rawDivs: any[] = [];
      try {
        const { data: directDivs } = await s
          .from('diversion_plans')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(1000);
        rawDivs = directDivs || [];
      } catch (e) {
        console.warn('Diversion plans query note:', e);
      }

      // 4. Fetch Process Routes
      let routesData: any[] = [];
      try {
        const { data: rData } = await s.from('process_routes').select('id, route_code, route_name');
        routesData = rData || [];
      } catch (rE) {
        console.warn('Routes fetch note:', rE);
      }

      const routeMap = new Map<string, any>();
      routesData.forEach((r: any) => routeMap.set(r.id, r));

      const woMap = new Map<string, any>();
      allWorkOrders.forEach((w: any) => woMap.set(w.id, w));

      // Map rolling plans by work_order_id
      const rpsByWoId = new Map<string, any[]>();
      rawPlans.forEach((rp: any) => {
        if (rp.work_order_id) {
          const list = rpsByWoId.get(rp.work_order_id) || [];
          list.push(rp);
          rpsByWoId.set(rp.work_order_id, list);
        }
      });

      // Map master campaigns by child work order id and child work order no
      const masterCampaignByChildWoId = new Map<string, { masterPlan: any; childMeta: any }>();
      rawPlans.forEach((rp: any) => {
        let parsedSt: any = {};
        try {
          parsedSt = typeof rp.status === 'string' ? JSON.parse(rp.status) : rp.status || {};
        } catch {}
        if (parsedSt.is_master && Array.isArray(parsedSt.child_work_orders)) {
          parsedSt.child_work_orders.forEach((c: any) => {
            const cId = c.work_order_id || c.id;
            if (cId) {
              masterCampaignByChildWoId.set(cId, { masterPlan: rp, childMeta: c });
            }
            if (c.work_order_no) {
              const cleanNo = String(c.work_order_no).trim().toLowerCase();
              masterCampaignByChildWoId.set(cleanNo, { masterPlan: rp, childMeta: c });
            }
          });
        }
      });

      const mappedWoPlans: RollingPlanRecord[] = [];

      // A. For each work order in allWorkOrders:
      allWorkOrders.forEach((wo: any) => {
        const associatedRps = rpsByWoId.get(wo.id) || [];

        // Check if this work order is a Child Work Order linked to a Parent Campaign
        const childCampaignInfo =
          masterCampaignByChildWoId.get(wo.id) ||
          masterCampaignByChildWoId.get(String(wo.work_order_no || '').trim().toLowerCase());

        let parentPlan = childCampaignInfo?.masterPlan;
        if (!parentPlan && associatedRps.length > 0) {
          try {
            const st = typeof associatedRps[0].status === 'string' ? JSON.parse(associatedRps[0].status) : associatedRps[0].status || {};
            if (st.is_child && (st.master_plan_id || st.master_plan_no)) {
              parentPlan = rawPlans.find((p) => p.id === st.master_plan_id || p.plan_no === st.master_plan_no);
            }
          } catch {}
        }

        let parentParsedSt: any = {};
        if (parentPlan) {
          try {
            parentParsedSt = typeof parentPlan.status === 'string' ? JSON.parse(parentPlan.status) : parentPlan.status || {};
          } catch {}
        }

        const finalOd = Number(wo.size_od ?? 88.9);
        const finalWt = Number(wo.size_wt ?? 5.49);
        const finalL1 = Number(wo.l1 ?? 4.0);
        const finalL2 = Number(wo.l2 ?? 7.0);

        if (parentPlan) {
          // RULE: Rolling plan for child work order will be the SAME as parent work order
          const parentRoute = routeMap.get(parentPlan.process_route_id) || {};
          const effPlanNo = parentPlan.plan_no;
          const effRollingDate = parentPlan.planned_rolling_date || wo.target_date || new Date().toISOString().split('T')[0];
          const effMhOd = Number(parentPlan.mh_od ?? finalOd);
          const effMhWt = Number(parentPlan.mh_wt ?? finalWt);
          const effMhL1 = Number(parentPlan.mh_l1 ?? 5.533);
          const effMhL2 = Number(parentPlan.mh_l2 ?? 5.533);
          const effPass = Number(parentPlan.pass_required ?? 1);
          const effMultiple = Number(parentPlan.multiple ?? 1);

          let childParsedSt: any = {};
          if (associatedRps.length > 0) {
            try {
              childParsedSt = typeof associatedRps[0].status === 'string' ? JSON.parse(associatedRps[0].status) : associatedRps[0].status || {};
            } catch {}
          }

          const mergedStatus = {
            ...parentParsedSt,
            ...childParsedSt,
            is_child: true,
            master_plan_no: parentPlan.plan_no,
            master_wo_id: parentPlan.work_order_id,
          };

          mappedWoPlans.push({
            id: associatedRps.length > 0 ? `child-rp-${associatedRps[0].id}-wo-${wo.id}` : `child-wo-${wo.id}`,
            plan_no: effPlanNo, // Same rolling plan as parent work order
            work_order_id: wo.id,
            planned_rolling_date: effRollingDate,
            planned_qty: Number(childCampaignInfo?.childMeta?.planned_mtr ?? wo.ordered_qty_mtr ?? wo.ordered_qty ?? 0),
            process_route_id: parentPlan.process_route_id,
            target_mother_size: parentPlan.target_mother_size || null,
            multiple: effMultiple,
            status: mergedStatus,
            mh_od: effMhOd,
            mh_wt: effMhWt,
            mh_l1: effMhL1,
            mh_l2: effMhL2,
            pass_required: effPass,
            work_order_no: wo.work_order_no || 'WO-UNKNOWN',
            customer_name: wo.customer_name || 'Standard Customer',
            grade: wo.grade || parentParsedSt.grade || '',
            specification: wo.specification || parentParsedSt.spec || wo.grade || '',
            size_od: finalOd,
            size_wt: finalWt,
            l1: finalL1,
            l2: finalL2,
            ordered_qty: Number(wo.ordered_qty || 0),
            ordered_qty_pcs: Number(wo.ordered_qty_pcs || 0),
            ordered_qty_mtr: Number(wo.ordered_qty_mtr || 0),
            route_code: parentRoute.route_code || 'HFS',
            route_name: parentRoute.route_name || 'Standard HFS',
            po_no: wo.po_no || wo.purchase_order_no || mergedStatus.po_no || null,
            po_date: wo.po_date || wo.purchase_order_date || mergedStatus.po_date || null,
            material_code: wo.material_code || wo.item_code || mergedStatus.material_code || null,
            destination: wo.destination || mergedStatus.destination || null,
            is_diversion: false,
            display_label: wo.work_order_no || 'WO-UNKNOWN',
          });
        } else if (associatedRps.length > 0) {
          // If work order has one or more rolling plans, generate a record for each plan
          associatedRps.forEach((r: any) => {
            const route = routeMap.get(r.process_route_id) || {};
            let parsedSt: any = {};
            try {
              parsedSt = typeof r.status === 'string' ? JSON.parse(r.status) : r.status || {};
            } catch { }

            mappedWoPlans.push({
              id: `rp-${r.id}-wo-${wo.id}`,
              plan_no: parsedSt.master_plan_no || r.plan_no || 'Standard Plan',
              work_order_id: wo.id,
              planned_rolling_date: r.planned_rolling_date || wo.target_date || new Date().toISOString().split('T')[0],
              planned_qty: Number(r.planned_qty ?? wo.ordered_qty_mtr ?? wo.ordered_qty ?? 0),
              process_route_id: r.process_route_id,
              target_mother_size: r.target_mother_size || null,
              multiple: Number(r.multiple ?? 1),
              status: parsedSt,
              mh_od: Number(r.mh_od ?? finalOd),
              mh_wt: Number(r.mh_wt ?? finalWt),
              mh_l1: Number(r.mh_l1 ?? 5.533),
              mh_l2: Number(r.mh_l2 ?? 5.533),
              pass_required: Number(r.pass_required ?? 1),
              work_order_no: wo.work_order_no || 'WO-UNKNOWN',
              customer_name: wo.customer_name || 'Standard Customer',
              grade: wo.grade || parsedSt.grade || '',
              specification: wo.specification || parsedSt.spec || wo.grade || '',
              size_od: finalOd,
              size_wt: finalWt,
              l1: finalL1,
              l2: finalL2,
              ordered_qty: Number(wo.ordered_qty || 0),
              ordered_qty_pcs: Number(wo.ordered_qty_pcs || 0),
              ordered_qty_mtr: Number(wo.ordered_qty_mtr || 0),
              route_code: route.route_code || 'HFS',
              route_name: route.route_name || 'Standard HFS',
              po_no: wo.po_no || wo.purchase_order_no || parsedSt.po_no || null,
              po_date: wo.po_date || wo.purchase_order_date || parsedSt.po_date || null,
              material_code: wo.material_code || wo.item_code || parsedSt.material_code || null,
              destination: wo.destination || parsedSt.destination || null,
              is_diversion: false,
              display_label: wo.work_order_no || 'WO-UNKNOWN',
            });
          });
        } else {
          // Direct Work Order (without an issued rolling plan)
          mappedWoPlans.push({
            id: `wo-${wo.id}`,
            plan_no: 'Pending Plan',
            work_order_id: wo.id,
            planned_rolling_date: wo.target_date || new Date().toISOString().split('T')[0],
            planned_qty: Number(wo.ordered_qty_mtr || wo.ordered_qty || 0),
            process_route_id: null,
            target_mother_size: null,
            multiple: 1,
            status: { work_order_status: wo.status },
            mh_od: finalOd,
            mh_wt: finalWt,
            mh_l1: 5.533,
            mh_l2: 5.533,
            pass_required: 1,
            work_order_no: wo.work_order_no || 'WO-UNKNOWN',
            customer_name: wo.customer_name || 'Standard Customer',
            grade: wo.grade || '',
            specification: wo.specification || wo.grade || '',
            size_od: finalOd,
            size_wt: finalWt,
            l1: finalL1,
            l2: finalL2,
            ordered_qty: Number(wo.ordered_qty || 0),
            ordered_qty_pcs: Number(wo.ordered_qty_pcs || 0),
            ordered_qty_mtr: Number(wo.ordered_qty_mtr || 0),
            route_code: 'HFS',
            route_name: 'Standard HFS',
            po_no: wo.po_no || wo.purchase_order_no || null,
            po_date: wo.po_date || wo.purchase_order_date || null,
            material_code: wo.material_code || wo.item_code || null,
            destination: wo.destination || null,
            is_diversion: false,
            display_label: wo.work_order_no || 'WO-UNKNOWN',
          });
        }
      });

      // B. Sort work orders numerically / descending by work order number
      mappedWoPlans.sort((a, b) => {
        const numA = parseInt(a.work_order_no.replace(/\D/g, ''), 10) || 0;
        const numB = parseInt(b.work_order_no.replace(/\D/g, ''), 10) || 0;
        if (numA !== numB) return numB - numA;
        return b.work_order_no.localeCompare(a.work_order_no);
      });

      // C. Map Diversion Plans
      const mappedDivPlans: RollingPlanRecord[] = rawDivs.map((d: any) => {
        const woId = d.target_wo_id || d.source_wo_id;
        const wo = woMap.get(woId) || {};
        const routeId = d.route_id || d.process_route_id;
        const route = routeMap.get(routeId) || {};

        const finalOd = Number(wo.size_od ?? (d.target_size ? parseFloat(d.target_size) : 88.9));
        const finalWt = Number(
          wo.size_wt ??
            (d.target_size
              ? parseFloat(d.target_size.split('×')[1] || d.target_size.split('x')[1] || '5.49')
              : 5.49)
        );
        const finalL1 = Number(wo.l1 ?? 4.0);
        const finalL2 = Number(wo.l2 ?? 7.0);
        const baseWoNo = wo.work_order_no || d.target_wo_no || d.source_wo_no || 'WO-DIV';

        return {
          id: `div-${d.id}`,
          plan_no: `DIV-${String(d.id).slice(0, 8)}`,
          work_order_id: woId,
          planned_rolling_date: d.diversion_date || d.created_at || new Date().toISOString().split('T')[0],
          planned_qty: Number(d.diverted_qty || 0),
          process_route_id: routeId,
          target_mother_size: null,
          multiple: Number(d.multiple ?? 1),
          status: { is_diversion: true, diversion_reason: d.reason, work_center: d.work_center },
          mh_od: finalOd,
          mh_wt: finalWt,
          mh_l1: 5.533,
          mh_l2: 5.533,
          pass_required: 1,
          work_order_no: baseWoNo,
          customer_name: wo.customer_name || d.target_customer || d.source_customer || 'Standard Customer',
          grade: wo.grade || d.target_grade || d.source_grade || '',
          specification: wo.specification || d.target_grade || '',
          size_od: finalOd,
          size_wt: finalWt,
          l1: finalL1,
          l2: finalL2,
          ordered_qty: Number(wo.ordered_qty || d.diverted_qty || 0),
          ordered_qty_pcs: Number(wo.ordered_qty_pcs || d.diverted_pcs || 0),
          ordered_qty_mtr: Number(wo.ordered_qty_mtr || d.diverted_qty || 0),
          route_code: route.route_code || d.route_code || 'HFS',
          route_name: route.route_name || d.route_name || 'Diversion Route',
          po_no: wo.po_no || wo.purchase_order_no || null,
          po_date: wo.po_date || wo.purchase_order_date || null,
          material_code: wo.material_code || wo.item_code || null,
          destination: wo.destination || null,
          is_diversion: true,
          display_label: `${baseWoNo}-Div`,
        };
      });

      const combinedPlans = [...mappedWoPlans, ...mappedDivPlans];
      setPlans(combinedPlans);

      if (combinedPlans.length > 0) {
        setSelectedPlanId((prev) => {
          if (!prev) {
            selectPlanRef.current(combinedPlans[0]);
            return combinedPlans[0].id;
          }
          // If already selected, do not force-switch
          return prev;
        });
      }
    } catch (err: any) {
      console.error('Error loading work orders:', err);
      toast.error(err.message || 'Failed to load Work Orders.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadIssuedPlans();
  }, [loadIssuedPlans]);

  // When a Work Order / Rolling Plan is selected
  const selectPlan = (plan: RollingPlanRecord) => {
    setSelectedPlanId(plan.id);

    const isCds = (plan.route_code || '').toUpperCase().includes('CDS');
    const rCode = isCds ? 'CDS' : 'HFS';
    setOrderType(rCode);
    setRouteType(rCode);

    const parsedSt = plan.status && typeof plan.status === 'object' ? plan.status : {};

    // Work Order with -Div indicator if issued from a diversion plan
    const cleanWo = String(plan.work_order_no || '').trim();
    const effectiveWoNo = plan.is_diversion ? `${cleanWo}-Div` : cleanWo;

    // 2. Process sheet No = Last 2 digits of the year + D + Work order no
    const yr2 = String(new Date().getFullYear()).slice(-2);
    setSheetNo(`${yr2}D${effectiveWoNo}`);

    setWoNo(effectiveWoNo);
    if (parsedSt.wo_date) {
      setWoDate(parsedSt.wo_date);
    } else if (plan.planned_rolling_date) {
      const parts = plan.planned_rolling_date.split('-');
      if (parts.length === 3 && parts[0].length === 4) {
        setWoDate(`${parts[2]}-${parts[1]}-${parts[0]}`);
      } else {
        setWoDate(plan.planned_rolling_date);
      }
    }
    setCustomer(plan.customer_name || 'Standard Client');
    // 2. Destination from Work Order table
    setDestination(plan.destination || parsedSt.destination || '');

    // 3. PURCHASE ORDER NO, PURCHASE ORDER DATE, MATERIAL CODE from Work Order table
    setPoNo(plan.po_no || parsedSt.po_no || '');
    setPoDate(plan.po_date || parsedSt.po_date || '');
    setMaterialCode(plan.material_code || parsedSt.material_code || '');

    setHeatNo(parsedSt.heat_no || '');
    setSteelGrade(plan.grade || parsedSt.grade || '');
    setMaterialSpec(plan.specification || parsedSt.spec || '');
    setInspection(parsedSt.ibr_status || 'IBR');

    const targetOd = Number(plan.size_od) || 88.9;
    const targetWt = Number(plan.size_wt) || 5.49;
    const l1Val = Number(plan.l1) || 4.0;
    const l2Val = Number(plan.l2) || 7.0;
    const avgLen = (l1Val + l2Val) / 2 || 6.0;

    setCustOd(targetOd.toFixed(2));
    setCustWt(targetWt.toFixed(2));

    // 6. Process Wall: For material without negative tolerance -> Customer WT * 1.05; For rest -> Customer WT * 0.97
    const specUpper = `${plan.specification || ''} ${plan.grade || ''} ${parsedSt.spec || ''}`.toUpperCase();
    const isNoNegativeTol =
      specUpper.includes('MIN') ||
      specUpper.includes('MW') ||
      specUpper.includes('MIN WALL') ||
      specUpper.includes('NO NEG') ||
      specUpper.includes('210') ||
      specUpper.includes('213') ||
      specUpper.includes('192') ||
      specUpper.includes('179') ||
      specUpper.includes('3059');

    const calcProcessWt = isNoNegativeTol
      ? Number((targetWt * 1.05).toFixed(2))
      : Number((targetWt * 0.97).toFixed(2));
    setProcessWt(calcProcessWt.toFixed(2));

    const isFixedLength = Math.abs(l1Val - l2Val) < 0.05 || l1Val === l2Val;
    setFinalOrderLen1(l1Val.toFixed(3));
    setFinalOrderLen2(isFixedLength ? `${l2Val.toFixed(3)} +10MM` : l2Val.toFixed(3));
    setFinalLength(avgLen.toFixed(2));
    if (isFixedLength) {
      setFinalLenTol('+10MM');
    }

    // Calculate pipe weight in kg/mtr: (OD - WT) * WT * 0.0246615
    const kgMtr = Math.max(targetOd - targetWt, 0) * Math.max(targetWt, 0) * 0.0246615;
    setFinalPipeWeight(kgMtr.toFixed(2));
    setMotherHollowKgMtr(kgMtr.toFixed(2));

    // 5. BUNDLE QTY. (PCS) calculated based on Bundle weight Fixed to 2 MT (2000 kg)
    const wtPerPieceKg = kgMtr * avgLen;
    const calcBundleQtyPcs = wtPerPieceKg > 0 ? Math.round(2000 / wtPerPieceKg) : 0;
    setBundleQtyPcs(calcBundleQtyPcs > 0 ? calcBundleQtyPcs.toString() : '-');
    setBundleWeightMt('2 MT');

    // Rolling / Piercer Hollow values
    const mhOd = Number(parsedSt.sizing_mill?.cust_od || plan.mh_od || targetOd);
    const mhWt = Number(parsedSt.sizing_mill?.rolling_wt || plan.mh_wt || targetWt);
    setMotherHollowOd(mhOd.toFixed(2));
    setMotherHollowWt(mhWt.toFixed(2));
    setRollingWt(mhWt.toFixed(2));
    setSmLength((parsedSt.sizing_mill?.sm_len || plan.mh_l1 || 5.533).toString());
    setHfsFinalLength((plan.mh_l2 || 5.533).toString());

    // Piercer values from plan metadata or computed dynamically
    const piercOd = Number(parsedSt.piercer_mill?.pm_od || (mhOd * 1.08).toFixed(2));
    const piercWt = Number(parsedSt.piercer_mill?.pm_wt || (mhWt * 1.04).toFixed(2));
    setPiercerOd(piercOd.toFixed(2));
    setPiercerWt(piercWt.toFixed(2));
    setPiercerShellLen((parsedSt.piercer_mill?.pm_len || (avgLen * 0.88)).toFixed(2));
    setShellWeight((parsedSt.piercer_mill?.pm_kg_mtr || (kgMtr * 1.13)).toFixed(2));

    // Billet values from plan metadata or computed dynamically
    const bDia = Number(parsedSt.billet?.rm_od || (mhOd > 75 ? 90.0 : 63.0));
    setBilletDia(bDia.toFixed(2));
    const bSect = Number(parsedSt.billet?.weight_kg || (((bDia * bDia * 3.14159 * 0.007856) / 4).toFixed(2)));
    setBilletSectWt(bSect.toFixed(2));
    setBilletLength((parsedSt.billet?.rm_len_min || 1290).toString());
    setTotalWeightMt((parsedSt.billet?.billet_wt_whf || ((bSect * 1.29) / 1000)).toFixed(2));

    setMultiple((plan.multiple || parsedSt.multiple || 1).toString());
    const plannedMtr = plan.planned_qty || parsedSt.rolling_mtr || plan.ordered_qty_mtr || 0;
    setPlanQtyMtrs(plannedMtr ? plannedMtr.toString() : '');
    const nosCalc = Math.round(Number(plannedMtr || 0) / avgLen);
    setPlanQtyNos(nosCalc > 0 ? nosCalc.toString() : '');
    setPlanQtyMt(((kgMtr * Number(plannedMtr || 0)) / 1000).toFixed(2));
    setOrderQty(plan.ordered_qty_mtr ? `${plan.ordered_qty_mtr} MTR` : plannedMtr ? `${plannedMtr} MTR` : '');

    // Combine spec & grade so minimum wall and standard matching (e.g. SA210, A210, A106) always match
    const fullSpecGrade = `${plan.specification || parsedSt.spec || ''} ${plan.grade || parsedSt.grade || ''}`.trim() || 'ASTM A106 Gr B';

    // Immediate synchronous tolerance calculation using metallurgy engine
    const initialTols = calculateStandardTolerances(
      targetOd,
      targetWt,
      fullSpecGrade,
      rCode
    );
    setFinalTolOdMin(initialTols.od_min.toFixed(2));
    setFinalTolOdMax(initialTols.od_max.toFixed(2));
    setFinalTolWtMin(initialTols.wt_min.toFixed(2));
    setFinalTolWtMax(initialTols.wt_max.toFixed(2));

    setMhTolOdMin((initialTols.od_min + 0.01).toFixed(2));
    setMhTolOdMax((initialTols.od_max - 0.01).toFixed(2));
    setMhTolWtMin(initialTols.wt_min.toFixed(2));
    setMhTolWtMax((initialTols.wt_max - 0.28).toFixed(2));

    // Reset marking string for the newly selected Work Order based on active markingType
    setMarking(
      buildMarkingString(markingTypeRef.current, {
        routeCode: rCode,
        specification: plan.specification || parsedSt.spec,
        grade: plan.grade || parsedSt.grade,
        sizeOd: targetOd,
        sizeWt: targetWt,
        hydroPsi: undefined,
        woNo: plan.work_order_no,
        poNo: plan.po_no || parsedSt.po_no || '',
      })
    );

    // Fetch mechanical & tolerances automatically specifically for this work order
    fetchAiSpecs({
      planId: plan.id,
      grade: plan.grade || parsedSt.grade,
      specification: fullSpecGrade,
      size_od: targetOd,
      size_wt: targetWt,
      route_code: rCode,
      customer_name: plan.customer_name,
      wo_no: plan.work_order_no,
      po_no: plan.po_no || parsedSt.po_no || '',
      heat_no: parsedSt.heat_no || '',
    });

    // Check if custom Process Sheet has been saved for this Work Order in database
    (async () => {
      try {
        const s = createClient();
        const { data, error } = await s
          .from('process_sheets')
          .select('*')
          .or(`work_order_no.eq.${effectiveWoNo},plan_id.eq.${plan.id}`)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!error && data && data.sheet_data) {
          applySavedSheetData(data.sheet_data);
          setSavedRecord(data);
          toast.info(`Loaded saved Process Sheet (${data.sheet_no}) from database.`);
          return;
        }
      } catch (e) {
        console.warn('Note checking saved process sheet:', e);
      }
      setSavedRecord(null);
    })();
  };
  selectPlanRef.current = selectPlan;

  // Fetch Mechanical Properties, Tolerances & Hydro Pressure PSI via AI / Metallurgical Engine
  const fetchAiSpecs = async (customParams?: any) => {
    setAiLoading(true);
    try {
      const activePlan = plans.find((p) => p.id === (customParams?.planId || selectedPlanId));
      const targetGrade =
        customParams?.grade ||
        steelGrade ||
        activePlan?.grade ||
        'SAE 1018';
      const targetSpec =
        customParams?.specification ||
        materialSpec ||
        activePlan?.specification ||
        'ASTM A106 Gr B';
      const targetOd = Number(
        customParams?.size_od ||
        custOd ||
        activePlan?.size_od ||
        88.9
      );
      const targetWt = Number(
        customParams?.size_wt ||
        custWt ||
        activePlan?.size_wt ||
        5.49
      );
      const targetRoute =
        customParams?.route_code ||
        orderType ||
        activePlan?.route_code ||
        'HFS';
      const targetCustomer =
        customParams?.customer_name ||
        customer ||
        activePlan?.customer_name ||
        '';
      const targetWoNo =
        customParams?.wo_no ||
        woNo ||
        activePlan?.work_order_no ||
        '';
      const targetPoNo = customParams?.po_no ?? poNo;
      const targetHeatNo = customParams?.heat_no ?? heatNo;

      const payload = {
        grade: targetGrade,
        specification: targetSpec,
        size_od: targetOd,
        size_wt: targetWt,
        route_code: targetRoute,
        customer_name: targetCustomer,
        wo_no: targetWoNo,
        po_no: targetPoNo,
        heat_no: targetHeatNo,
      };

      const res = await fetch('/api/ai/process-spec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to fetch metallurgical specs.');
      }

      const d: ProcessSpecResult = json.data;
      setSpecSource(d.source);

      // Populate Mechanical Properties
      setYstMin(String(d.mechanical.yst_min_mpa));
      setYstMax(String(d.mechanical.yst_max_mpa));
      setUtsMin(String(d.mechanical.uts_min_mpa));
      setUtsMax(String(d.mechanical.uts_max_mpa));
      setElongationMin(String(d.mechanical.elongation_min_pct));
      setElongationMax(String(d.mechanical.elongation_max_pct));
      setHardness(d.mechanical.hardness_max);
      setStraightness(d.mechanical.straightness);

      // Populate Hydro Pressure PSI
      setHydroPressurePsi(`${d.testing.hydro_pressure_psi} PSI`);
      setHoldingTime(`${d.testing.holding_time_sec} SEC`);
      setNdt(d.testing.ndt);

      // Populate Tolerances
      setFinalTolOdMin(d.tolerances.od_min.toFixed(2));
      setFinalTolOdMax(d.tolerances.od_max.toFixed(2));
      setFinalTolWtMin(d.tolerances.wt_min.toFixed(2));
      setFinalTolWtMax(d.tolerances.wt_max.toFixed(2));

      setMhTolOdMin((d.tolerances.od_min + 0.01).toFixed(2));
      setMhTolOdMax((d.tolerances.od_max - 0.01).toFixed(2));
      setMhTolWtMin(d.tolerances.wt_min.toFixed(2));
      setMhTolWtMax((d.tolerances.wt_max - 0.28).toFixed(2));

      // Rule 6: Process Wall for material without negative tolerance is Customer WT * 1.05, rest is Customer WT * 0.97
      const isNoNeg =
        d.tolerances.wt_min >= targetWt - 0.01 ||
        (Boolean((d.tolerances as any).wt_tol_str) && String((d.tolerances as any).wt_tol_str).includes('-0')) ||
        targetSpec.toUpperCase().includes('MIN') ||
        targetSpec.toUpperCase().includes('MW') ||
        targetSpec.toUpperCase().includes('MIN WALL') ||
        targetSpec.toUpperCase().includes('NO NEG') ||
        targetSpec.toUpperCase().includes('A213') ||
        targetSpec.toUpperCase().includes('A192') ||
        targetSpec.toUpperCase().includes('A210');
      const calcProcWt = isNoNeg ? Number((targetWt * 1.05).toFixed(2)) : Number((targetWt * 0.97).toFixed(2));
      setProcessWt(calcProcWt.toFixed(2));

      // Thermal & Coating
      setWhfTemp(d.thermal.whf_temp);
      setInductionTemp(d.thermal.induction_furnace_temp);
      setSizingOutletTemp(d.thermal.sizing_mill_outlet_temp);
      setHtCycle(d.thermal.ht_cycle);
      setHtCondition(d.thermal.ht_condition);

      setPipeColorCode(d.color_code_spec);
      setRmColorCode(d.rm_color_code);
      setCoating(d.coating);
      setEndCondition(d.end_condition);
      setBundling(d.bundling);
      setEndCap(d.end_cap);

      // Update marking string with calculated hydro pressure & active order details adhering to markingType
      setMarking(
        buildMarkingString(markingTypeRef.current, {
          routeCode: targetRoute,
          specification: targetSpec,
          grade: targetGrade,
          sizeOd: targetOd,
          sizeWt: targetWt,
          hydroPsi: `${d.testing.hydro_pressure_psi} PSI`,
          woNo: targetWoNo,
          poNo: targetPoNo,
        })
      );

      toast.success(
        d.source === 'ai'
          ? 'Mechanical properties & Hydro Pressure fetched via Google Gemini AI!'
          : 'Mechanical properties & Hydro Pressure verified via Metallurgical Standards Engine.'
      );
    } catch (err: any) {
      toast.error(err.message || 'Failed to fetch AI specs.');
    } finally {
      setAiLoading(false);
    }
  };

  // Filter plans based on search
  const filteredPlans = useMemo(() => {
    if (!searchQuery.trim()) return plans;
    const q = searchQuery.toLowerCase();
    return plans.filter(
      (p) =>
        p.work_order_no.toLowerCase().includes(q) ||
        (p.is_diversion && `${p.work_order_no}-div`.toLowerCase().includes(q)) ||
        (p.is_diversion && 'diversion'.includes(q)) ||
        p.plan_no.toLowerCase().includes(q) ||
        (p.customer_name || '').toLowerCase().includes(q) ||
        (p.grade || '').toLowerCase().includes(q) ||
        (p.specification || '').toLowerCase().includes(q)
    );
  }, [plans, searchQuery]);

  const activePlan = useMemo(() => {
    return plans.find((p) => p.id === selectedPlanId);
  }, [plans, selectedPlanId]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Print Overrides: Suppress layout header/sidebar and set page size */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              @page {
                size: A4 portrait;
                margin: 6mm 5mm;
              }
              header, aside, nav, .print\\:hidden, [role="navigation"] {
                display: none !important;
              }
              body, html {
                background: #ffffff !important;
                color: #000000 !important;
                padding: 0 !important;
                margin: 0 !important;
              }
            }
          `,
        }}
      />

      {/* Action Header & WO Selector (Hidden on Print) */}
      <div className="print:hidden space-y-4">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-lg">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> Rolling Plan Orders
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center gap-1">
                <Cpu className="w-3.5 h-3.5" /> AI Metallurgy Active
              </span>
              {savedRecord ? (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Saved in DB ({savedRecord.sheet_no})
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" /> Draft / Unsaved
                </span>
              )}
            </div>
            <h1 className="text-xl font-bold text-white mt-1">
              Process Sheet Form (Format No. F-PROD-11)
            </h1>
            <p className="text-xs text-slate-400">
              Interactive process sheet form with metallurgical calculations, database persistence, and certified print output.
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* View Mode Switcher */}
            <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 shadow-inner">
              <button
                type="button"
                onClick={() => setViewMode('form')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all ${
                  viewMode === 'form'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                Form View
              </button>
              <button
                type="button"
                onClick={() => setViewMode('preview')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all ${
                  viewMode === 'preview'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Printer className="w-3.5 h-3.5" />
                Print Preview (F-11)
              </button>
            </div>

            {/* Marking Type Dropdown */}
            <div className="flex items-center gap-2 bg-slate-950 border border-slate-700 hover:border-indigo-500 rounded-lg px-3 py-1.5 shadow-sm transition-colors">
              <span className="text-xs text-slate-400 font-semibold flex items-center gap-1">
                Marking:
              </span>
              <select
                value={markingType}
                onChange={(e) => {
                  const newType = e.target.value as 'single' | 'triple';
                  setMarkingType(newType);
                  const active = plans.find((p) => p.id === selectedPlanId);
                  setMarking(
                    buildMarkingString(newType, {
                      routeCode: routeType || active?.route_code || 'HFS',
                      specification: materialSpec || active?.specification,
                      grade: steelGrade || active?.grade,
                      sizeOd: custOd || active?.size_od,
                      sizeWt: custWt || active?.size_wt,
                      hydroPsi: hydroPressurePsi,
                      woNo: woNo || active?.work_order_no,
                      poNo: poNo || active?.po_no || undefined,
                    })
                  );
                }}
                className="bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer"
              >
                <option value="single" className="bg-slate-900 text-white font-medium">Single Marking</option>
                <option value="triple" className="bg-slate-900 text-white font-medium">Triple Marking</option>
              </select>
            </div>

            {/* AI Spec Engine Button */}
            <button
              type="button"
              onClick={() => fetchAiSpecs()}
              disabled={aiLoading || !selectedPlanId}
              className="px-3.5 py-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-medium flex items-center gap-1.5 shadow-sm shadow-indigo-500/20 transition-all disabled:opacity-50 cursor-pointer"
              title="Fetch or refresh Mechanical Properties and Tolerances using AI"
            >
              {aiLoading ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              )}
              {aiLoading ? 'Analyzing...' : 'Fetch with AI'}
            </button>

            {/* Save Process Sheet Button */}
            <button
              type="button"
              onClick={handleSaveProcessSheet}
              disabled={saving || !selectedPlanId}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm shadow-emerald-500/20 transition-all disabled:opacity-50 cursor-pointer"
              title="Save customized Process Sheet specifications to database"
            >
              {saving ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              {saving ? 'Saving...' : 'Save Sheet'}
            </button>

            {/* Print / Save PDF Button */}
            <button
              type="button"
              onClick={handlePrint}
              className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium flex items-center gap-1.5 border border-slate-700 transition-all cursor-pointer"
              title="Print certified A4 Process Sheet or save as PDF"
            >
              <Printer className="w-3.5 h-3.5 text-emerald-400" />
              Print / Save PDF
            </button>
          </div>
        </div>

        {/* Work Order & Diversion Plan Selector Frame */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3.5 shadow-lg">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="text-xs font-medium text-slate-300 flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-400" />
              <span>
                Work Orders Available: <strong className="text-white">{plans.length}</strong> Total (
                <span className="text-indigo-400 font-semibold">{plans.filter((p) => !p.is_diversion).length} Work Orders</span>
                {plans.filter((p) => p.is_diversion).length > 0 && (
                  <>, <span className="text-amber-400 font-semibold">{plans.filter((p) => p.is_diversion).length} Diversion Plans</span></>
                )}
                )
              </span>
            </div>

            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
              <input
                type="text"
                placeholder="Search Work Order, Plan, Grade, Size..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* User Requested: Primary Dropdown list showing all work orders (plan issued condition removed) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                <span>Select Work Order / Plan ({filteredPlans.length} matching):</span>
              </label>
              {activePlan?.is_diversion && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  🔀 Diversion Plan Selected (-Div)
                </span>
              )}
            </div>

            <select
              value={selectedPlanId}
              onChange={(e) => {
                const chosen = plans.find((p) => p.id === e.target.value);
                if (chosen) selectPlan(chosen);
              }}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 hover:border-indigo-500 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500 font-medium cursor-pointer shadow-sm transition-colors"
            >
              <option value="" disabled>
                -- Select Work Order --
              </option>

              {filteredPlans.some((p) => !p.is_diversion) && (
                <optgroup label="📋 Work Orders">
                  {filteredPlans
                    .filter((p) => !p.is_diversion)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.work_order_no}
                        {p.plan_no && p.plan_no !== 'Pending Plan' && p.plan_no !== 'Standard Plan'
                          ? ` | Plan: ${p.plan_no}`
                          : ''}{' '}
                        | {p.grade || 'Standard'} | OD {p.size_od} × {p.size_wt} mm — {p.customer_name}
                      </option>
                    ))}
                </optgroup>
              )}

              {filteredPlans.some((p) => p.is_diversion) && (
                <optgroup label="🔀 Diversion Plans (-Div)">
                  {filteredPlans
                    .filter((p) => p.is_diversion)
                    .map((p) => (
                      <option key={p.id} value={p.id} className="text-amber-300">
                        {p.work_order_no}-Div | Diversion Plan: {p.plan_no} | {p.grade || 'Standard'} | OD {p.size_od} × {p.size_wt} mm — {p.customer_name}
                      </option>
                    ))}
                </optgroup>
              )}
            </select>
          </div>

          {activePlan && (
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3 text-xs flex items-center justify-between flex-wrap gap-2 text-slate-300">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-slate-400">Selected Order:</span>
                <span className="font-bold text-white flex items-center gap-1.5">
                  {activePlan.work_order_no}{activePlan.is_diversion ? '-Div' : ''}
                  {activePlan.is_diversion && (
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      DIVERSION PLAN
                    </span>
                  )}
                </span>
                <span className="text-slate-400">Customer:</span>
                <span className="text-emerald-300 font-medium">{activePlan.customer_name}</span>
                <span className="text-slate-400">Grade & Spec:</span>
                <span className="text-amber-300 font-medium">
                  {activePlan.grade} ({activePlan.specification})
                </span>
                <span className="text-slate-400">Size:</span>
                <span className="text-white font-medium">
                  OD {activePlan.size_od} mm × WT {activePlan.size_wt} mm
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                  Hydro Pressure:{' '}
                  <strong className="text-emerald-400 font-mono">{hydroPressurePsi}</strong>
                </span>
                <span
                  className={`text-[11px] px-2 py-0.5 rounded ${
                    specSource === 'ai'
                      ? 'bg-purple-950 text-purple-300 border border-purple-800'
                      : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                  }`}
                >
                  Source: {specSource === 'ai' ? 'Google Gemini AI' : 'Verified Standard Engine'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 
        ========================================================================
        PROCESS SHEET INTERACTIVE FORM VIEW
        Clean, structured cards for fast editing, validation and saving
        ========================================================================
      */}
      {viewMode === 'form' && (
        <div className="space-y-6 print:hidden">
          {/* Quick Section Filter Bar */}
          <div className="flex items-center justify-between flex-wrap gap-2 bg-slate-900 border border-slate-800 rounded-xl p-2.5 shadow-md">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-semibold text-slate-400 px-2 flex items-center gap-1">
                <Sliders className="w-3.5 h-3.5 text-indigo-400" /> Filter Sections:
              </span>
              {[
                { id: 'all', label: 'All Sections' },
                { id: 'order', label: '1. Order & Customer' },
                { id: 'billet', label: '2. Billet & WHF' },
                { id: 'piercer', label: '3. Piercer & Mother Hollow' },
                { id: 'final', label: '4. Cold Mill & Tolerances' },
                { id: 'metallurgy', label: '5. Heat Treatment & Mechanical' },
                { id: 'testing', label: '6. Testing & QC' },
                { id: 'marking', label: '7. Marking & Reqs' },
                { id: 'signatures', label: '8. Signatures' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFormFilterTab(tab.id as any)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                    formFilterTab === tab.id
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-slate-950 text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setViewMode('preview')}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 border border-slate-700 transition-colors"
              >
                <Printer className="w-3.5 h-3.5 text-emerald-400" /> Preview Print Sheet
              </button>
              <button
                type="button"
                onClick={handleSaveProcessSheet}
                disabled={saving || !selectedPlanId}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm shadow-emerald-500/20 disabled:opacity-50 transition-colors"
              >
                {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                {saving ? 'Saving...' : 'Save Sheet'}
              </button>
            </div>
          </div>

          {/* Section 1: Order & Master Identification */}
          {(formFilterTab === 'all' || formFilterTab === 'order') && (
            <FormSectionCard
              title="1. Order & Master Identification"
              subtitle="Work order metadata, customer specs, order quantities, and document numbering"
              icon={FileText}
              badge="Order Specs"
              badgeColor="indigo"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <FormInput
                  label="Process Sheet No."
                  value={sheetNo}
                  onChange={setSheetNo}
                  unit="Doc ID"
                  highlight
                />
                <FormInput
                  label="Revision No."
                  value={revNo}
                  onChange={setRevNo}
                  placeholder="REV 01"
                />
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <label className="font-semibold text-slate-300">Order Category</label>
                    <span className="text-[9.5px] font-mono text-slate-400 bg-slate-950 px-1.5 py-0.2 rounded border border-slate-800">
                      Type
                    </span>
                  </div>
                  <select
                    value={orderType}
                    onChange={(e) => setOrderType(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700/80 hover:border-slate-500 focus:border-indigo-500 text-white rounded-lg text-xs font-semibold focus:outline-none"
                  >
                    <option value="HFS">HFS (Hot Finished Seamless)</option>
                    <option value="CDS">CDS (Cold Drawn Seamless)</option>
                  </select>
                </div>
                <FormInput
                  label="Process Route"
                  value={routeType}
                  onChange={setRouteType}
                />

                <FormInput
                  label="Sheet Issue Date"
                  value={sheetDate}
                  onChange={setSheetDate}
                  placeholder="DD-MM-YYYY"
                />
                <FormInput
                  label="Customer Name"
                  value={customer}
                  onChange={setCustomer}
                  highlight
                />
                <FormInput
                  label="Destination / Consignee"
                  value={destination}
                  onChange={setDestination}
                />
                <FormInput
                  label="Purchase Order No."
                  value={poNo}
                  onChange={setPoNo}
                />

                <FormInput
                  label="Purchase Order Date"
                  value={poDate}
                  onChange={setPoDate}
                  placeholder="DD-MM-YYYY"
                />
                <FormInput
                  label="Work Order No."
                  value={woNo}
                  onChange={setWoNo}
                  highlight
                />
                <FormInput
                  label="Work Order Date"
                  value={woDate}
                  onChange={setWoDate}
                  placeholder="DD-MM-YYYY"
                />
                <FormInput
                  label="Order Quantity"
                  value={orderQty}
                  onChange={setOrderQty}
                  unit="Mtr / Pcs"
                />

                <FormInput
                  label="Delivery Date"
                  value={deliveryDate}
                  onChange={setDeliveryDate}
                />
                <FormInput
                  label="Material Item Code"
                  value={materialCode}
                  onChange={setMaterialCode}
                />
                <FormInput
                  label="Rolling Priority"
                  value={priority}
                  onChange={setPriority}
                />
                <FormInput
                  label="Material Specification"
                  value={materialSpec}
                  onChange={setMaterialSpec}
                  highlight
                />

                <FormInput
                  label="Steel Grade"
                  value={steelGrade}
                  onChange={setSteelGrade}
                  highlight
                />
                <FormInput
                  label="Raw Material Heat No."
                  value={heatNo}
                  onChange={setHeatNo}
                />
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <label className="font-semibold text-slate-300">Inspection Authority</label>
                    <span className="text-[9.5px] font-mono text-slate-400 bg-slate-950 px-1.5 py-0.2 rounded border border-slate-800">
                      Standard
                    </span>
                  </div>
                  <select
                    value={inspection}
                    onChange={(e) => setInspection(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700/80 hover:border-slate-500 focus:border-indigo-500 text-white rounded-lg text-xs font-semibold focus:outline-none"
                  >
                    <option value="IBR">IBR (Indian Boiler Regulations)</option>
                    <option value="NON-IBR">NON-IBR (Commercial / General)</option>
                  </select>
                </div>
                <FormInput
                  label="Pipe Colour Code"
                  value={pipeColorCode}
                  onChange={setPipeColorCode}
                />
                <FormInput
                  label="RM Billet Colour Code"
                  value={rmColorCode}
                  onChange={setRmColorCode}
                />
              </div>
            </FormSectionCard>
          )}

          {/* Section 2: Billet & Heating Parameters */}
          {(formFilterTab === 'all' || formFilterTab === 'billet') && (
            <FormSectionCard
              title="2. Billet Cutting & Furnace Heating Parameters"
              subtitle="Billet diameter, cutting length, furnace thermal controls and multiple"
              icon={Flame}
              badge="Thermal & Raw Material"
              badgeColor="amber"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <FormInput
                  label="Billet Diameter"
                  value={billetDia}
                  onChange={setBilletDia}
                  unit="mm"
                />
                <FormInput
                  label="Billet Section Weight"
                  value={billetSectWt}
                  onChange={setBilletSectWt}
                  unit="kg/m"
                />
                <FormInput
                  label="Total Planned Billet Wt"
                  value={totalWeightMt}
                  onChange={setTotalWeightMt}
                  unit="MT"
                />
                <FormInput
                  label="Billet Cutting Length"
                  value={billetLength}
                  onChange={setBilletLength}
                  unit="m"
                />
                <FormInput
                  label="Billet Cutting Tolerance"
                  value={cuttingTol}
                  onChange={setCuttingTol}
                  placeholder="+5/-0 MM"
                />
                <FormInput
                  label="Rolling Multiple"
                  value={multiple}
                  onChange={setMultiple}
                  placeholder="1 or 2"
                />
                <FormInput
                  label="WHF Heating Temperature"
                  value={whfTemp}
                  onChange={setWhfTemp}
                  unit="°C"
                />
                <FormInput
                  label="Induction Furnace Temp"
                  value={inductionTemp}
                  onChange={setInductionTemp}
                  unit="°C"
                />
                <FormInput
                  label="Sizing Mill Outlet Temp"
                  value={sizingOutletTemp}
                  onChange={setSizingOutletTemp}
                  unit="°C"
                />
              </div>
            </FormSectionCard>
          )}

          {/* Section 3: Piercer & Mother Hollow Specs */}
          {(formFilterTab === 'all' || formFilterTab === 'piercer') && (
            <FormSectionCard
              title="3. Piercer Mill & Mother Hollow Specifications"
              subtitle="Shell dimensions, Mother Hollow sizing, and hot mill rolling tolerances"
              icon={Cpu}
              badge="Hot Rolling"
              badgeColor="blue"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <FormInput
                  label="Piercer Shell OD"
                  value={piercerOd}
                  onChange={setPiercerOd}
                  unit="mm"
                />
                <FormInput
                  label="Piercer Shell WT"
                  value={piercerWt}
                  onChange={setPiercerWt}
                  unit="mm"
                />
                <FormInput
                  label="Piercer Shell Length"
                  value={piercerShellLen}
                  onChange={setPiercerShellLen}
                  unit="m"
                />
                <FormInput
                  label="Piercer Shell Weight"
                  value={shellWeight}
                  onChange={setShellWeight}
                  unit="kg"
                />

                <FormInput
                  label="Mother Hollow OD"
                  value={motherHollowOd}
                  onChange={setMotherHollowOd}
                  unit="mm"
                  highlight
                />
                <FormInput
                  label="Mother Hollow WT"
                  value={motherHollowWt}
                  onChange={setMotherHollowWt}
                  unit="mm"
                  highlight
                />
                <FormInput
                  label="Rolling Wall Thickness"
                  value={rollingWt}
                  onChange={setRollingWt}
                  unit="mm"
                />
                <FormInput
                  label="Mother Hollow Wt/Mtr"
                  value={motherHollowKgMtr}
                  onChange={setMotherHollowKgMtr}
                  unit="kg/m"
                />

                <FormInput
                  label="Sizing Mill Length (SM)"
                  value={smLength}
                  onChange={setSmLength}
                  unit="m"
                />
                <FormInput
                  label="HFS Final Length"
                  value={hfsFinalLength}
                  onChange={setHfsFinalLength}
                  unit="m"
                />
                <FormInput
                  label="MH Tol: OD Min"
                  value={mhTolOdMin}
                  onChange={setMhTolOdMin}
                  unit="mm"
                />
                <FormInput
                  label="MH Tol: OD Max"
                  value={mhTolOdMax}
                  onChange={setMhTolOdMax}
                  unit="mm"
                />

                <FormInput
                  label="MH Tol: WT Min"
                  value={mhTolWtMin}
                  onChange={setMhTolWtMin}
                  unit="mm"
                />
                <FormInput
                  label="MH Tol: WT Max"
                  value={mhTolWtMax}
                  onChange={setMhTolWtMax}
                  unit="mm"
                />
                <FormInput
                  label="Planned Quantity (Nos)"
                  value={planQtyNos}
                  onChange={setPlanQtyNos}
                  unit="pcs"
                />
                <FormInput
                  label="Planned Quantity (Mtrs)"
                  value={planQtyMtrs}
                  onChange={setPlanQtyMtrs}
                  unit="m"
                />

                <FormInput
                  label="Planned Quantity (MT)"
                  value={planQtyMt}
                  onChange={setPlanQtyMt}
                  unit="MT"
                />
                <div className="col-span-1 sm:col-span-2 lg:col-span-3">
                  <FormInput
                    label="Process Route Sequence Flow"
                    value={processRouteStr}
                    onChange={setProcessRouteStr}
                    placeholder="BILLET CUTTING # WHF # PIERCER # SIZING # STRA # CUTTING # UT # HYDRO # VDI # BLACK VARNISH # MARKING # BUNDLING"
                  />
                </div>
              </div>
            </FormSectionCard>
          )}

          {/* Section 4: Cold Mill & Final Sizing Dimensions & Tolerances */}
          {(formFilterTab === 'all' || formFilterTab === 'final') && (
            <FormSectionCard
              title="4. Cold Mill & Final Sizing Dimensions & Tolerances"
              subtitle="Customer finished size, process wall, length tolerances (+10MM), and cold drawing passes"
              icon={Layers}
              badge="Finishing Tolerances"
              badgeColor="emerald"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <FormInput
                  label="Customer Finished OD"
                  value={custOd}
                  onChange={setCustOd}
                  unit="mm"
                  highlight
                />
                <FormInput
                  label="Customer Finished WT"
                  value={custWt}
                  onChange={setCustWt}
                  unit="mm"
                  highlight
                />
                <FormInput
                  label="Process Wall Thickness"
                  value={processWt}
                  onChange={setProcessWt}
                  unit="mm"
                  title="Calculated with standard expansion margin"
                />
                <FormInput
                  label="Final Pipe Weight"
                  value={finalPipeWeight}
                  onChange={setFinalPipeWeight}
                  unit="kg/m"
                />

                <FormInput
                  label="Final Calculated Length"
                  value={finalLength}
                  onChange={setFinalLength}
                  unit="m"
                />
                <FormInput
                  label="Order Length (L1)"
                  value={finalOrderLen1}
                  unit="m"
                  onChange={(val) => {
                    setFinalOrderLen1(val);
                    const n1 = parseFloat(val);
                    const n2 = parseFloat(finalOrderLen2);
                    if (!isNaN(n1) && !isNaN(n2)) {
                      if (Math.abs(n1 - n2) < 0.05) {
                        setFinalLenTol('+10MM');
                        if (!finalOrderLen2.includes('+10MM')) {
                          setFinalOrderLen2(`${n2.toFixed(3)} +10MM`);
                        }
                      }
                    }
                  }}
                />
                <FormInput
                  label="Order Length (L2) (+10MM Fixed)"
                  value={finalOrderLen2}
                  unit="m"
                  onChange={(val) => {
                    setFinalOrderLen2(val);
                    const n1 = parseFloat(finalOrderLen1);
                    const n2 = parseFloat(val);
                    if (!isNaN(n1) && !isNaN(n2)) {
                      if (Math.abs(n1 - n2) < 0.05) {
                        setFinalLenTol('+10MM');
                      }
                    }
                  }}
                  highlight
                />
                <FormInput
                  label="Length Tolerance"
                  value={finalLenTol}
                  onChange={setFinalLenTol}
                  placeholder="+10MM"
                />

                <FormInput
                  label="Final Tol: OD Min"
                  value={finalTolOdMin}
                  onChange={setFinalTolOdMin}
                  unit="mm"
                  highlight
                />
                <FormInput
                  label="Final Tol: OD Max"
                  value={finalTolOdMax}
                  onChange={setFinalTolOdMax}
                  unit="mm"
                  highlight
                />
                <FormInput
                  label="Final Tol: WT Min"
                  value={finalTolWtMin}
                  onChange={setFinalTolWtMin}
                  unit="mm"
                  highlight
                />
                <FormInput
                  label="Final Tol: WT Max"
                  value={finalTolWtMax}
                  onChange={setFinalTolWtMax}
                  unit="mm"
                  highlight
                />
              </div>

              {/* Inter-Pass Reductions Sub-Block */}
              <div className="mt-5 pt-4 border-t border-slate-800">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-emerald-400" /> Cold Mill Inter-Pass Reductions (P1 / P2 / P3)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800 space-y-2.5">
                    <div className="text-[11px] font-bold text-indigo-300 border-b border-slate-800 pb-1">
                      PASS 1 (P1)
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <FormInput label="OD" value={p1Od} onChange={setP1Od} unit="mm" />
                      <FormInput label="WT" value={p1Wt} onChange={setP1Wt} unit="mm" />
                    </div>
                  </div>
                  <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800 space-y-2.5">
                    <div className="text-[11px] font-bold text-indigo-300 border-b border-slate-800 pb-1">
                      PASS 2 (P2)
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <FormInput label="OD" value={p2Od} onChange={setP2Od} unit="mm" />
                      <FormInput label="WT" value={p2Wt} onChange={setP2Wt} unit="mm" />
                    </div>
                  </div>
                  <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800 space-y-2.5">
                    <div className="text-[11px] font-bold text-indigo-300 border-b border-slate-800 pb-1">
                      PASS 3 (P3)
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <FormInput label="OD" value={p3Od} onChange={setP3Od} unit="mm" />
                      <FormInput label="WT" value={p3Wt} onChange={setP3Wt} unit="mm" />
                    </div>
                  </div>
                </div>
              </div>
            </FormSectionCard>
          )}

          {/* Section 5: Heat Treatment & Mechanical Properties */}
          {(formFilterTab === 'all' || formFilterTab === 'metallurgy') && (
            <FormSectionCard
              title="5. Heat Treatment & Mechanical Properties"
              subtitle="Furnace heat treat conditions, straightness, hardness, YST, UTS, and elongation"
              icon={Activity}
              badge="Metallurgical QA"
              badgeColor="purple"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <FormInput
                  label="Heat Treatment Cycle"
                  value={htCycle}
                  onChange={setHtCycle}
                  placeholder="NORMALIZED / SUB-CRITICAL ANNEAL"
                />
                <FormInput
                  label="Heat Treatment Condition"
                  value={htCondition}
                  onChange={setHtCondition}
                />
                <FormInput
                  label="Straightness Requirement"
                  value={straightness}
                  onChange={setStraightness}
                  placeholder="1:1000"
                />
                <FormInput
                  label="Hardness Limit"
                  value={hardness}
                  onChange={setHardness}
                  placeholder="79 HRB MAX"
                  highlight
                />

                <FormInput
                  label="Yield Strength (YST) Min"
                  value={ystMin}
                  onChange={setYstMin}
                  unit="MPa"
                  highlight
                />
                <FormInput
                  label="Yield Strength (YST) Max"
                  value={ystMax}
                  onChange={setYstMax}
                  unit="MPa"
                  placeholder="NOT SPECIFIED"
                />
                <FormInput
                  label="Tensile Strength (UTS) Min"
                  value={utsMin}
                  onChange={setUtsMin}
                  unit="MPa"
                  highlight
                />
                <FormInput
                  label="Tensile Strength (UTS) Max"
                  value={utsMax}
                  onChange={setUtsMax}
                  unit="MPa"
                  placeholder="NOT SPECIFIED"
                />

                <FormInput
                  label="Elongation Min"
                  value={elongationMin}
                  onChange={setElongationMin}
                  unit="%"
                  highlight
                />
                <FormInput
                  label="Elongation Max"
                  value={elongationMax}
                  onChange={setElongationMax}
                  unit="%"
                  placeholder="NOT SPECIFIED"
                />
              </div>
            </FormSectionCard>
          )}

          {/* Section 6: Testing, Quality & Surface Protection */}
          {(formFilterTab === 'all' || formFilterTab === 'testing') && (
            <FormSectionCard
              title="6. Testing, Quality & Surface Protection"
              subtitle="Hydrostatic test pressure, NDT inspection method, pipe coatings, and packaging"
              icon={ShieldCheck}
              badge="NDT & Packing"
              badgeColor="rose"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <FormInput
                  label="Non-Destructive Testing (NDT)"
                  value={ndt}
                  onChange={setNdt}
                  placeholder="UT / ET"
                  highlight
                />
                <FormInput
                  label="Hydrostatic Test Pressure"
                  value={hydroPressurePsi}
                  onChange={setHydroPressurePsi}
                  unit="PSI"
                  highlight
                />
                <FormInput
                  label="Hydro Holding Time"
                  value={holdingTime}
                  onChange={setHoldingTime}
                  unit="Sec"
                />

                <FormInput
                  label="Surface Coating"
                  value={coating}
                  onChange={setCoating}
                  placeholder="BLACK VARNISH"
                />
                <FormInput
                  label="Pipe End Condition"
                  value={endCondition}
                  onChange={setEndCondition}
                  placeholder="BEVEL END (30°-35°)"
                />
                <FormInput
                  label="Bundling Shape / Type"
                  value={bundling}
                  onChange={setBundling}
                  placeholder="HEXAGONAL"
                />

                <FormInput
                  label="Bundle Quantity (Pcs)"
                  value={bundleQtyPcs}
                  onChange={setBundleQtyPcs}
                  unit="pcs"
                />
                <FormInput
                  label="Bundle Weight (MT)"
                  value={bundleWeightMt}
                  onChange={setBundleWeightMt}
                  unit="MT"
                />
                <FormInput
                  label="End Protection Cap"
                  value={endCap}
                  onChange={setEndCap}
                  placeholder="PLASTIC PROTECTOR"
                />
              </div>
            </FormSectionCard>
          )}

          {/* Section 7: Marking Specification & Special Requirements */}
          {(formFilterTab === 'all' || formFilterTab === 'marking') && (
            <FormSectionCard
              title="7. Marking Specification & Special Requirements"
              subtitle="Stenciling standard, single/triple marking toggle, and custom client requirements"
              icon={FileSpreadsheet}
              badge="Marking & Specs"
              badgeColor="amber"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-300">Marking Format:</span>
                    <div className="inline-flex rounded-lg border border-slate-700 bg-slate-950 p-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          setMarkingType('single');
                          markingTypeRef.current = 'single';
                          const active = plans.find((p) => p.id === selectedPlanId);
                          setMarking(
                            buildMarkingString('single', {
                              routeCode: routeType || active?.route_code || 'HFS',
                              specification: materialSpec || active?.specification,
                              grade: steelGrade || active?.grade,
                              sizeOd: custOd || active?.size_od,
                              sizeWt: custWt || active?.size_wt,
                              hydroPsi: hydroPressurePsi,
                              woNo: woNo || active?.work_order_no,
                              poNo: poNo || active?.po_no || undefined,
                            })
                          );
                        }}
                        className={`px-3 py-1 rounded-md text-xs font-bold transition-colors ${
                          markingType === 'single'
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Single Marking
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMarkingType('triple');
                          markingTypeRef.current = 'triple';
                          const active = plans.find((p) => p.id === selectedPlanId);
                          setMarking(
                            buildMarkingString('triple', {
                              routeCode: routeType || active?.route_code || 'HFS',
                              specification: materialSpec || active?.specification,
                              grade: steelGrade || active?.grade,
                              sizeOd: custOd || active?.size_od,
                              sizeWt: custWt || active?.size_wt,
                              hydroPsi: hydroPressurePsi,
                              woNo: woNo || active?.work_order_no,
                              poNo: poNo || active?.po_no || undefined,
                            })
                          );
                        }}
                        className={`px-3 py-1 rounded-md text-xs font-bold transition-colors ${
                          markingType === 'triple'
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Triple Marking
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(marking);
                      toast.success('Marking specification copied to clipboard!');
                    }}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg flex items-center gap-1 transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" /> Copy Marking Text
                  </button>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-300">
                    Pipe Body Stenciling / Marking Text
                  </label>
                  <textarea
                    rows={3}
                    value={marking}
                    onChange={(e) => setMarking(e.target.value)}
                    className="w-full p-3 bg-slate-950 border border-slate-700 hover:border-slate-500 focus:border-indigo-500 text-white rounded-lg text-xs font-mono focus:outline-none transition-colors"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-300">
                    Special Customer Requirements (If Any)
                  </label>
                  <textarea
                    rows={2}
                    value={specialReq}
                    onChange={(e) => setSpecialReq(e.target.value)}
                    placeholder="Enter any customer specific inspection, third-party stamping, or packaging instructions..."
                    className="w-full p-3 bg-slate-950 border border-slate-700 hover:border-slate-500 focus:border-indigo-500 text-white rounded-lg text-xs font-semibold focus:outline-none transition-colors"
                  />
                </div>
              </div>
            </FormSectionCard>
          )}

          {/* Section 8: Signatures & Document Control */}
          {(formFilterTab === 'all' || formFilterTab === 'signatures') && (
            <FormSectionCard
              title="8. Signatures & Document Control"
              subtitle="Departmental approvals, prepared by sign-off, and quality management authorization"
              icon={UserCheck}
              badge="Signatures"
              badgeColor="slate"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800 space-y-1 text-center">
                  <div className="text-[11px] font-bold text-slate-300">PREPARED BY</div>
                  <div className="text-xs font-bold text-emerald-400 mt-2">{preparedBy}</div>
                  <div className="text-[10px] text-slate-500">{preparedDate}</div>
                </div>
                <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800 space-y-1 text-center">
                  <div className="text-[11px] font-bold text-slate-300">PPC SEC. IN-CHARGE</div>
                  <div className="text-xs text-slate-400 mt-3">APPROVED & VERIFIED</div>
                </div>
                <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800 space-y-1 text-center">
                  <div className="text-[11px] font-bold text-slate-300">HOT MILL SEC IN-CHARGE</div>
                  <div className="text-xs text-slate-400 mt-3">HOT ROLLING READY</div>
                </div>
                <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800 space-y-1 text-center">
                  <div className="text-[11px] font-bold text-slate-300">COLD MILL SEC IN-CHARGE</div>
                  <div className="text-xs text-slate-400 mt-3">PASS REDUCTIONS READY</div>
                </div>
                <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800 space-y-1 text-center">
                  <div className="text-[11px] font-bold text-slate-300">APPROVED BY QC</div>
                  <div className="text-xs text-emerald-400 mt-3">QUALITY ASSURED</div>
                </div>
              </div>
            </FormSectionCard>
          )}

          {/* Sticky / Floating Bottom Form Action Bar */}
          <div className="sticky bottom-4 z-20 bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-xl p-3.5 shadow-2xl flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-slate-300">
                Work Order: <strong className="text-white">{woNo || 'No Order Selected'}</strong>
              </span>
              {savedRecord ? (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Saved in Database ({savedRecord.sheet_no})
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" /> Unsaved Changes
                </span>
              )}
            </div>

            <div className="flex items-center gap-2.5">
              {savedRecord && (
                <button
                  type="button"
                  onClick={resetToCalculatedDefaults}
                  className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 border border-slate-700 transition-colors"
                >
                  <Undo2 className="w-3.5 h-3.5 text-amber-400" /> Reset Defaults
                </button>
              )}

              <button
                type="button"
                onClick={() => fetchAiSpecs()}
                disabled={aiLoading || !selectedPlanId}
                className="px-3.5 py-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm shadow-indigo-500/20 transition-all disabled:opacity-50"
              >
                {aiLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-amber-300" />}
                {aiLoading ? 'Analyzing...' : 'Fetch with AI'}
              </button>

              <button
                type="button"
                onClick={() => setViewMode('preview')}
                className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold flex items-center gap-1.5 border border-slate-700 transition-colors"
              >
                <Printer className="w-3.5 h-3.5 text-emerald-400" /> Preview Sheet
              </button>

              <button
                type="button"
                onClick={handleSaveProcessSheet}
                disabled={saving || !selectedPlanId}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-500/20 transition-all disabled:opacity-50"
              >
                {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                {saving ? 'Saving...' : 'Save Process Sheet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 
        ========================================================================
        AUTHENTIC RASHMI SEAMLESS DIVISION PROCESS SHEET (FORMAT NO. F-PROD-11)
        Styled for direct high-fidelity visual fidelity on screen & physical A4 print
        ========================================================================
      */}
      <div className={viewMode === 'preview' ? 'block' : 'hidden print:block'}>
      {/* Legend Banner */}
      <div className="max-w-[1100px] mx-auto mb-2 flex items-center justify-between text-xs px-2 py-1 print:hidden">
        <div className="flex items-center gap-4 text-slate-300">
          <span className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded border border-slate-300 bg-white inline-block shadow-sm"></span>
            <span className="font-medium text-slate-200">White Cells: Editable User Inputs</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded border border-slate-400 bg-slate-200 inline-block shadow-sm"></span>
            <span className="font-semibold text-amber-300">Grey Cells: Non-Editable / System Calculated</span>
          </span>
        </div>
        <span className="text-[10px] text-slate-400 font-mono">Format: F-PROD-11</span>
      </div>

      <div className="bg-white text-black p-4 sm:p-6 rounded-xl shadow-2xl border border-slate-300 print:border-none print:shadow-none print:p-0 max-w-[1100px] mx-auto text-[11px] leading-tight font-sans">
        {/* Company Header */}
        <div className="border border-black flex items-stretch">
          {/* Logo Box */}
          <div className="w-36 p-2 border-r border-black flex flex-col items-center justify-center text-center bg-slate-50 print:bg-white">
            <div className="font-extrabold text-lg tracking-wider text-red-600 print:text-black">
              RASHMI
            </div>
            <div className="text-[9px] font-bold tracking-widest uppercase text-slate-700">
              SEAMLESS
            </div>
          </div>

          {/* Title & Division Info */}
          <div className="flex-1 p-1.5 text-center">
            <div className="font-bold text-xs uppercase tracking-wide">
              RASHMI GREEN HYDROGEN STEEL PVT. LTD.
            </div>
            <div className="text-[10px] font-semibold">
              (SEAMLESS DIVISION)
            </div>
            <div className="text-[8.5px] text-slate-700">
              KHATRANGA CHANGUAL, GOPINATHPUR AND JETHIA, KHARAGPUR, WEST BENGAL-721301
            </div>
            <div className="font-black text-sm uppercase tracking-widest mt-0.5 border-t border-black/40 pt-0.5">
              PROCESS SHEET
            </div>
          </div>
        </div>

        {/* Section: ORDER DETAILS HEADER */}
        <div className="bg-slate-200 border-x border-b border-black text-center font-bold text-[10px] py-0.5 uppercase tracking-wide">
          ORDER DETAILS
        </div>

        {/* Top Meta Table */}
        <div className="border-x border-b border-black grid grid-cols-12 divide-x divide-black text-[9.5px]">
          <div className="col-span-2 font-bold p-1 bg-slate-50">PROCESS SHEET NO</div>
          <div className="col-span-2 p-1 font-mono font-bold">
            <input
              type="text"
              value={sheetNo}
              onChange={(e) => setSheetNo(e.target.value)}
              className="w-full bg-transparent border-none focus:outline-none font-bold"
            />
          </div>
          <div className="col-span-1 font-bold p-1 bg-slate-50">REV NO :</div>
          <div className="col-span-1 p-1">
            <input
              type="text"
              value={revNo}
              onChange={(e) => setRevNo(e.target.value)}
              className="w-full bg-transparent border-none focus:outline-none"
            />
          </div>
          <div className="col-span-1 font-bold p-1 bg-slate-50">ORDER</div>
          <div className="col-span-1 p-1 font-bold text-center">
            <input
              type="text"
              value={orderType}
              onChange={(e) => setOrderType(e.target.value)}
              className="w-full bg-transparent border-none focus:outline-none font-bold text-center"
            />
          </div>
          <div className="col-span-1 font-bold p-1 bg-slate-50">ROUTE</div>
          <div className="col-span-1 p-1 font-bold text-center">
            <input
              type="text"
              value={routeType}
              onChange={(e) => setRouteType(e.target.value)}
              className="w-full bg-transparent border-none focus:outline-none font-bold text-center"
            />
          </div>
          <div className="col-span-1 font-bold p-1 bg-slate-50">Date :</div>
          <div className="col-span-1 p-1 font-bold">
            <input
              type="text"
              value={sheetDate}
              onChange={(e) => setSheetDate(e.target.value)}
              className="w-full bg-transparent border-none focus:outline-none"
            />
          </div>
        </div>

        {/* Customer & Destination */}
        <div className="border-x border-b border-black grid grid-cols-12 divide-x divide-black text-[9.5px]">
          <div className="col-span-2 font-bold p-1 bg-slate-50">CUSTOMER</div>
          <div className="col-span-4 p-1 font-bold">
            <input
              type="text"
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              className="w-full bg-transparent border-none focus:outline-none font-bold"
            />
          </div>
          <div className="col-span-2 font-bold p-1 bg-slate-50">DESTINATION:</div>
          <div className="col-span-4 p-1 font-bold">
            <input
              type="text"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              className="w-full bg-transparent border-none focus:outline-none font-bold uppercase"
            />
          </div>
        </div>

        {/* PO & Work Order Row 1 */}
        <div className="border-x border-b border-black grid grid-cols-12 divide-x divide-black text-[9.5px]">
          <div className="col-span-2 font-bold p-1 bg-slate-50">PURCHASE ORDER NO</div>
          <div className="col-span-6 p-1">
            <input
              type="text"
              value={poNo}
              onChange={(e) => setPoNo(e.target.value)}
              className="w-full bg-transparent border-none focus:outline-none font-mono"
            />
          </div>
          <div className="col-span-2 font-bold p-1 bg-slate-50">WORK ORDER NO:</div>
          <div className="col-span-2 p-1 font-bold font-mono">
            <input
              type="text"
              value={woNo}
              onChange={(e) => setWoNo(e.target.value)}
              className="w-full bg-transparent border-none focus:outline-none font-bold"
            />
          </div>
        </div>

        {/* PO Date & WO Date */}
        <div className="border-x border-b border-black grid grid-cols-12 divide-x divide-black text-[9.5px]">
          <div className="col-span-2 font-bold p-1 bg-slate-50">PURCHASE ORDER DATE</div>
          <div className="col-span-6 p-1">
            <input
              type="text"
              value={poDate}
              onChange={(e) => setPoDate(e.target.value)}
              className="w-full bg-transparent border-none focus:outline-none"
            />
          </div>
          <div className="col-span-2 font-bold p-1 bg-slate-50">WORK ORDER DATE:</div>
          <div className="col-span-2 p-1 font-bold">
            <input
              type="text"
              value={woDate}
              onChange={(e) => setWoDate(e.target.value)}
              className="w-full bg-transparent border-none focus:outline-none font-bold"
              placeholder="DD-MM-YYYY"
            />
          </div>
        </div>

        {/* Order Qty & Delivery Date */}
        <div className="border-x border-b border-black grid grid-cols-12 divide-x divide-black text-[9.5px]">
          <div className="col-span-2 font-bold p-1 bg-slate-50">ORDER QTY</div>
          <div className="col-span-6 p-1 font-bold">
            <input
              type="text"
              value={orderQty}
              onChange={(e) => setOrderQty(e.target.value)}
              className="w-full bg-transparent border-none focus:outline-none font-bold"
            />
          </div>
          <div className="col-span-2 font-bold p-1 bg-slate-50">DELIVERY DATE:</div>
          <div className="col-span-2 p-1 font-bold">
            <input
              type="text"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              className="w-full bg-transparent border-none focus:outline-none"
            />
          </div>
        </div>

        {/* Material Code & Priority */}
        <div className="border-x border-b border-black grid grid-cols-12 divide-x divide-black text-[9.5px]">
          <div className="col-span-2 font-bold p-1 bg-slate-50">MATERIAL CODE</div>
          <div className="col-span-6 p-1 font-mono">
            <input
              type="text"
              value={materialCode}
              onChange={(e) => setMaterialCode(e.target.value)}
              className="w-full bg-transparent border-none focus:outline-none"
            />
          </div>
          <div className="col-span-2 font-bold p-1 bg-slate-50">PRIORITY :</div>
          <div className="col-span-2 p-1 font-bold">
            <input
              type="text"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full bg-transparent border-none focus:outline-none"
            />
          </div>
        </div>

        {/* Material Specification & Pipe Color Code */}
        <div className="border-x border-b border-black grid grid-cols-12 divide-x divide-black text-[9.5px]">
          <div className="col-span-2 font-bold p-1 bg-slate-50">MATERIAL SPECIFICATION</div>
          <div className="col-span-6 p-1 font-bold text-indigo-950 print:text-black">
            <input
              type="text"
              value={materialSpec}
              onChange={(e) => setMaterialSpec(e.target.value)}
              className="w-full bg-transparent border-none focus:outline-none font-bold"
            />
          </div>
          <div className="col-span-2 font-bold p-1 bg-slate-50">PIPE COLOUR CODE AS PER SPECIFICATION:</div>
          <div className="col-span-2 p-1 font-bold text-center">
            <input
              type="text"
              value={pipeColorCode}
              onChange={(e) => setPipeColorCode(e.target.value)}
              className="w-full bg-transparent border-none focus:outline-none font-bold text-center"
            />
          </div>
        </div>

        {/* Steel Grade, Heat No, RM Color Code */}
        <div className="border-x border-b border-black grid grid-cols-12 divide-x divide-black text-[9.5px]">
          <div className="col-span-2 font-bold p-1 bg-slate-50">STEEL GRADE</div>
          <div className="col-span-3 p-1 font-bold">
            <input
              type="text"
              value={steelGrade}
              onChange={(e) => setSteelGrade(e.target.value)}
              className="w-full bg-transparent border-none focus:outline-none font-bold"
            />
          </div>
          <div className="col-span-1 font-bold p-1 bg-slate-50 text-center">HEAT NO :</div>
          <div className="col-span-2 p-1 font-bold font-mono">
            <input
              type="text"
              value={heatNo}
              onChange={(e) => setHeatNo(e.target.value)}
              className="w-full bg-transparent border-none focus:outline-none font-bold"
            />
          </div>
          <div className="col-span-2 font-bold p-1 bg-slate-50">RM COLOR CODE:</div>
          <div className="col-span-2 p-1 font-bold text-center">
            <input
              type="text"
              value={rmColorCode}
              onChange={(e) => setRmColorCode(e.target.value)}
              className="w-full bg-transparent border-none focus:outline-none font-bold text-center"
            />
          </div>
        </div>

        {/* Billet Dia & Weight Grid */}
        <div className="border-x border-b border-black grid grid-cols-12 divide-x divide-black text-[9.5px]">
          <div className="col-span-2 font-bold p-1 bg-slate-50">BILLET DIA (IN MM)</div>
          <div className="col-span-3 p-1 text-center font-bold">
            <input
              type="text"
              value={billetDia}
              onChange={(e) => setBilletDia(e.target.value)}
              className="w-full bg-transparent border-none focus:outline-none font-bold text-center"
            />
          </div>
          <div className="col-span-2 font-bold p-1 bg-slate-50">BILLET SECT. WEIGHT (KG/MTR)</div>
          <div className="col-span-2 p-1 text-center font-bold">
            <input
              type="text"
              value={billetSectWt}
              onChange={(e) => setBilletSectWt(e.target.value)}
              className="w-full bg-transparent border-none focus:outline-none font-bold text-center"
            />
          </div>
          <div className="col-span-2 font-bold p-1 bg-slate-50">TOTAL WEIGHT IN MT (THEO.)</div>
          <div className="col-span-1 p-1 text-center font-bold">
            <input
              type="text"
              value={totalWeightMt}
              onChange={(e) => setTotalWeightMt(e.target.value)}
              className="w-full bg-transparent border-none focus:outline-none font-bold text-center"
            />
          </div>
        </div>

        {/* Billet Length & Multiple */}
        <div className="border-x border-b border-black grid grid-cols-12 divide-x divide-black text-[9.5px]">
          <div className="col-span-2 font-bold p-1 bg-slate-50">BILLET LENGTH (IN MM)</div>
          <div className="col-span-3 p-1 text-center font-bold">
            <input
              type="text"
              value={billetLength}
              onChange={(e) => setBilletLength(e.target.value)}
              className="w-full bg-transparent border-none focus:outline-none font-bold text-center"
            />
          </div>
          <div className="col-span-2 font-bold p-1 bg-slate-50">CUTTING TOLERANCE IN MM</div>
          <div className="col-span-2 p-1 text-center font-bold">
            <input
              type="text"
              value={cuttingTol}
              onChange={(e) => setCuttingTol(e.target.value)}
              className="w-full bg-transparent border-none focus:outline-none font-bold text-center"
            />
          </div>
          <div className="col-span-2 font-bold p-1 bg-slate-50">MULTIPLE</div>
          <div className="col-span-1 p-1 text-center font-bold">
            <input
              type="text"
              value={multiple}
              onChange={(e) => setMultiple(e.target.value)}
              className="w-full bg-transparent border-none focus:outline-none font-bold text-center"
            />
          </div>
        </div>

        {/* Furnaces Temperatures */}
        <div className="border-x border-b border-black grid grid-cols-12 divide-x divide-black text-[9px]">
          <div className="col-span-2 font-bold p-1 bg-slate-50">WHF (IN DEGREE)</div>
          <div className="col-span-2 p-1 text-center font-bold">
            <input
              type="text"
              value={whfTemp}
              onChange={(e) => setWhfTemp(e.target.value)}
              className="w-full bg-transparent border-none focus:outline-none font-bold text-center"
            />
          </div>
          <div className="col-span-2 font-bold p-1 bg-slate-50">INDUCTION FURNACE (IN DEGREE)</div>
          <div className="col-span-2 p-1 text-center font-bold">
            <input
              type="text"
              value={inductionTemp}
              onChange={(e) => setInductionTemp(e.target.value)}
              className="w-full bg-transparent border-none focus:outline-none font-bold text-center"
            />
          </div>
          <div className="col-span-2 font-bold p-1 bg-slate-50">SIZING MILL OUTLET TEMP</div>
          <div className="col-span-2 p-1 text-center font-bold">
            <input
              type="text"
              value={sizingOutletTemp}
              onChange={(e) => setSizingOutletTemp(e.target.value)}
              className="w-full bg-transparent border-none focus:outline-none font-bold text-center"
            />
          </div>
        </div>

        {/* PIERCER & ACCU MANDREL MILL HOLLOW */}
        <div className="border-x border-b border-black grid grid-cols-12 divide-x divide-black text-[9px]">
          <div className="col-span-2 font-bold p-1 bg-slate-50 flex items-center">PIERCER SIZE</div>
          <div className="col-span-10 grid grid-cols-6 divide-x divide-black text-center bg-slate-200 text-slate-800">
            <div className="p-0.5">
              <div className="text-[8px] text-slate-600">OD (MM) in Hot</div>
              <div className="font-bold">{piercerOd}</div>
            </div>
            <div className="p-0.5">
              <div className="text-[8px] text-slate-600">WT(MM) in Hot</div>
              <div className="font-bold">{piercerWt}</div>
            </div>
            <div className="p-0.5">
              <div className="text-[8px] text-slate-600">PIERCER SHELL LENGTH</div>
              <div className="font-bold">{piercerShellLen}</div>
            </div>
            <div className="p-0.5">
              <div className="text-[8px] text-slate-600">SHELL WEIGHT KG/MTR</div>
              <div className="font-bold">{shellWeight}</div>
            </div>
            <div className="p-0.5">
              <div className="text-[8px] text-slate-600">OD (MM) AIM</div>
              <div className="font-bold">NA</div>
            </div>
            <div className="p-0.5">
              <div className="text-[8px] text-slate-600">WT(MM) AIM</div>
              <div className="font-bold">NA</div>
            </div>
          </div>
        </div>

        {/* MOTHER HOLLOW SIZE : SIZING MILL */}
        <div className="border-x border-b border-black grid grid-cols-12 divide-x divide-black text-[9px]">
          <div className="col-span-2 font-bold p-1 bg-slate-50 flex items-center">
            MOTHER HOLLOW SIZE : SIZING MILL
          </div>
          <div className="col-span-10 grid grid-cols-6 divide-x divide-black text-center bg-slate-200 text-slate-800">
            <div className="p-0.5">
              <div className="text-[8px] text-slate-600">MOTHER HOLLOW OD (MM)</div>
              <div className="font-bold font-mono">{motherHollowOd}</div>
            </div>
            <div className="p-0.5">
              <div className="text-[8px] text-slate-600">MOTHER HOLLOW WT(MM)</div>
              <div className="font-bold font-mono">{motherHollowWt}</div>
            </div>
            <div className="p-0.5">
              <div className="text-[8px] text-slate-600">ROLLING WT(MM)</div>
              <div className="font-bold font-mono">{rollingWt}</div>
            </div>
            <div className="p-0.5">
              <div className="text-[8px] text-slate-600">MOTHER HOLLOW KG/MTR</div>
              <div className="font-bold font-mono">{motherHollowKgMtr}</div>
            </div>
            <div className="p-0.5">
              <div className="text-[8px] text-slate-600">SM LENGTH (MTR)</div>
              <div className="font-bold">{smLength}</div>
            </div>
            <div className="p-0.5">
              <div className="text-[8px] text-slate-600">HFS FINAL LENGTH (MTR)</div>
              <div className="font-bold">{hfsFinalLength}</div>
            </div>
          </div>
        </div>

        {/* TOLERANCE (IN MM) FOR MOTHER HOLLOW & PLAN QTY */}
        <div className="border-x border-b border-black grid grid-cols-12 divide-x divide-black text-[9px]">
          <div className="col-span-2 font-bold p-1 bg-slate-50">TOLERANCE (IN MM):</div>
          <div className="col-span-2 p-1 text-center font-bold bg-white text-black flex items-center justify-center gap-1">
            <span className="text-[8.5px] font-bold text-slate-500">OD:</span>
            <input
              type="text"
              value={mhTolOdMin}
              onChange={(e) => setMhTolOdMin(e.target.value)}
              className="w-12 px-1 py-0.5 bg-slate-50 hover:bg-white border border-slate-300 rounded text-center font-bold text-black focus:outline-none focus:ring-1 focus:ring-indigo-500 text-[9px]"
              title="Mother Hollow Minimum OD"
            />
            <span>-</span>
            <input
              type="text"
              value={mhTolOdMax}
              onChange={(e) => setMhTolOdMax(e.target.value)}
              className="w-12 px-1 py-0.5 bg-slate-50 hover:bg-white border border-slate-300 rounded text-center font-bold text-black focus:outline-none focus:ring-1 focus:ring-indigo-500 text-[9px]"
              title="Mother Hollow Maximum OD"
            />
          </div>
          <div className="col-span-2 p-1 text-center font-bold bg-white text-black flex items-center justify-center gap-1">
            <span className="text-[8.5px] font-bold text-slate-500">WT:</span>
            <input
              type="text"
              value={mhTolWtMin}
              onChange={(e) => setMhTolWtMin(e.target.value)}
              className="w-12 px-1 py-0.5 bg-slate-50 hover:bg-white border border-slate-300 rounded text-center font-bold text-black focus:outline-none focus:ring-1 focus:ring-indigo-500 text-[9px]"
              title="Mother Hollow Minimum WT"
            />
            <span>-</span>
            <input
              type="text"
              value={mhTolWtMax}
              onChange={(e) => setMhTolWtMax(e.target.value)}
              className="w-12 px-1 py-0.5 bg-slate-50 hover:bg-white border border-slate-300 rounded text-center font-bold text-black focus:outline-none focus:ring-1 focus:ring-indigo-500 text-[9px]"
              title="Mother Hollow Maximum WT"
            />
          </div>
          <div className="col-span-2 font-bold p-1 bg-slate-50 text-center">PLAN QTY IN NOS:</div>
          <div className="col-span-1 p-1 font-bold text-center bg-slate-200 text-slate-800">{planQtyNos}</div>
          <div className="col-span-1 font-bold p-1 text-center bg-slate-200 text-slate-800">MTRS: {planQtyMtrs}</div>
          <div className="col-span-1 font-bold p-1 text-center bg-slate-200 text-slate-800">MT: {planQtyMt}</div>
          <div className="col-span-1 font-bold p-1 bg-slate-200 text-center text-slate-800 print:text-black">
            {inspection}
          </div>
        </div>

        {/* PROCESS ROUTE */}
        <div className="border-x border-b border-black grid grid-cols-12 divide-x divide-black text-[8.5px]">
          <div className="col-span-2 font-bold p-1 bg-slate-50">PROCESS ROUTE :</div>
          <div className="col-span-10 p-1 font-mono tracking-tight font-semibold">
            <input
              type="text"
              value={processRouteStr}
              onChange={(e) => setProcessRouteStr(e.target.value)}
              className="w-full bg-transparent border-none focus:outline-none"
            />
          </div>
        </div>

        {/* Section: COLD MILL */}
        <div className="bg-slate-200 border-x border-b border-black text-center font-bold text-[10px] py-0.5 uppercase tracking-wide">
          COLD MILL & FINAL SIZING
        </div>

        {/* FINAL SIZE: HFS / CDS HEADER & VALUES */}
        <div className="border-x border-b border-black grid grid-cols-12 divide-x divide-black text-[9px]">
          <div className="col-span-2 font-bold p-1 bg-slate-50 flex items-center">
            FINAL SIZE: {orderType}
          </div>
          <div className="col-span-2 p-1 text-center">
            <div className="text-[8px] text-slate-500">CUSTOMER OD (MM)</div>
            <input
              type="text"
              value={custOd}
              onChange={(e) => setCustOd(e.target.value)}
              className="w-full bg-transparent border-none focus:outline-none font-bold text-sm text-indigo-900 print:text-black text-center"
            />
          </div>
          <div className="col-span-2 p-1 text-center">
            <div className="text-[8px] text-slate-500">CUSTOMER WT(MM)</div>
            <input
              type="text"
              value={custWt}
              onChange={(e) => {
                const val = e.target.value;
                setCustWt(val);
                const w = parseFloat(val);
                if (!isNaN(w) && w > 0) {
                  const specUpper = `${materialSpec} ${steelGrade}`.toUpperCase();
                  const isNoNeg =
                    specUpper.includes('MIN') ||
                    specUpper.includes('MW') ||
                    specUpper.includes('MIN WALL') ||
                    specUpper.includes('NO NEG') ||
                    specUpper.includes('A213') ||
                    specUpper.includes('A192') ||
                    specUpper.includes('A210') ||
                    specUpper.includes('SA210') ||
                    specUpper.includes('210') ||
                    specUpper.includes('3059');
                  const pWt = isNoNeg ? w * 1.05 : w * 0.97;
                  setProcessWt(pWt.toFixed(2));
                }
              }}
              className="w-full bg-transparent border-none focus:outline-none font-bold text-sm text-indigo-900 print:text-black text-center"
            />
          </div>
          <div className="col-span-2 p-1 text-center">
            <div className="text-[8px] text-slate-500">PROCESS WT(MM)</div>
            <input
              type="text"
              value={processWt}
              onChange={(e) => setProcessWt(e.target.value)}
              className="w-full bg-transparent border-none focus:outline-none font-bold text-sm text-center"
            />
          </div>
          <div className="col-span-2 p-1 text-center">
            <div className="text-[8px] text-slate-500">FINAL PIPE WEIGHT (KG/MTR)</div>
            <input
              type="text"
              value={finalPipeWeight}
              onChange={(e) => setFinalPipeWeight(e.target.value)}
              className="w-full bg-transparent border-none focus:outline-none font-bold text-center"
            />
          </div>
          <div className="col-span-2 p-1 text-center">
            <div className="text-[8px] text-slate-500">FINAL LENGTH (MTRS)</div>
            <input
              type="text"
              value={finalLength}
              onChange={(e) => setFinalLength(e.target.value)}
              className="w-full bg-transparent border-none focus:outline-none font-bold text-center"
            />
          </div>
        </div>

        {/* FINAL TOLERANCE & ORDER LENGTH */}
        <div className="border-x border-b border-black grid grid-cols-12 divide-x divide-black text-[9px]">
          <div className="col-span-2 font-bold p-1 bg-slate-50">
            FINAL {orderType} TOLERANCE (IN MM)
          </div>
          <div className="col-span-2 p-1 text-center font-bold bg-white text-black flex items-center justify-center gap-1">
            <span className="text-[8.5px] font-bold text-slate-500">OD:</span>
            <input
              type="text"
              value={finalTolOdMin}
              onChange={(e) => setFinalTolOdMin(e.target.value)}
              className="w-12 px-1 py-0.5 bg-slate-50 hover:bg-white border border-slate-300 rounded text-center font-bold text-black focus:outline-none focus:ring-1 focus:ring-indigo-500 text-[9px]"
              title="Final Minimum OD"
            />
            <span>-</span>
            <input
              type="text"
              value={finalTolOdMax}
              onChange={(e) => setFinalTolOdMax(e.target.value)}
              className="w-12 px-1 py-0.5 bg-slate-50 hover:bg-white border border-slate-300 rounded text-center font-bold text-black focus:outline-none focus:ring-1 focus:ring-indigo-500 text-[9px]"
              title="Final Maximum OD"
            />
          </div>
          <div className="col-span-2 p-1 text-center font-bold bg-white text-black flex items-center justify-center gap-1">
            <span className="text-[8.5px] font-bold text-slate-500">WT:</span>
            <input
              type="text"
              value={finalTolWtMin}
              onChange={(e) => setFinalTolWtMin(e.target.value)}
              className="w-12 px-1 py-0.5 bg-slate-50 hover:bg-white border border-slate-300 rounded text-center font-bold text-black focus:outline-none focus:ring-1 focus:ring-indigo-500 text-[9px]"
              title="Final Minimum WT"
            />
            <span>-</span>
            <input
              type="text"
              value={finalTolWtMax}
              onChange={(e) => setFinalTolWtMax(e.target.value)}
              className="w-12 px-1 py-0.5 bg-slate-50 hover:bg-white border border-slate-300 rounded text-center font-bold text-black focus:outline-none focus:ring-1 focus:ring-indigo-500 text-[9px]"
              title="Final Maximum WT"
            />
          </div>
          <div className="col-span-2 p-1 text-center font-bold flex items-center justify-center gap-1 bg-white text-slate-800 print:bg-transparent print:text-black">
            <span className="text-[8.5px] font-bold">LEN:</span>
            <input
              type="text"
              value={finalLenTol}
              onChange={(e) => setFinalLenTol(e.target.value)}
              className="w-16 px-1 py-0.5 bg-slate-50 hover:bg-white border border-slate-300 rounded text-center font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500 text-[9px] uppercase"
            />
          </div>
          <div className="col-span-2 font-bold p-1 bg-slate-50 text-center">
            FINAL ORDER LENGTH (MTR)
          </div>
          <div className="col-span-1 p-1 text-center font-bold bg-slate-200 text-slate-800 flex items-center justify-center gap-0.5">
            <span className="text-[8px] font-bold">L1:</span>
            <input
              type="text"
              value={finalOrderLen1}
              onChange={(e) => {
                const val = e.target.value;
                setFinalOrderLen1(val);
                const n1 = parseFloat(val);
                const n2 = parseFloat(finalOrderLen2);
                if (!isNaN(n1) && !isNaN(n2)) {
                  if (Math.abs(n1 - n2) < 0.05) {
                    setFinalLenTol('+10MM');
                    if (!finalOrderLen2.includes('+10MM')) {
                      setFinalOrderLen2(`${n2.toFixed(3)} +10MM`);
                    }
                  }
                }
              }}
              className="w-10 bg-transparent border-none focus:outline-none text-center font-bold text-[9px]"
            />
          </div>
          <div className="col-span-1 p-1 text-center font-bold bg-slate-200 text-slate-800 flex items-center justify-center gap-0.5">
            <span className="text-[8px] font-bold">L2:</span>
            <input
              type="text"
              value={finalOrderLen2}
              onChange={(e) => {
                const val = e.target.value;
                setFinalOrderLen2(val);
                const n1 = parseFloat(finalOrderLen1);
                const n2 = parseFloat(val);
                if (!isNaN(n1) && !isNaN(n2)) {
                  if (Math.abs(n1 - n2) < 0.05) {
                    setFinalLenTol('+10MM');
                  }
                }
              }}
              className="w-16 bg-transparent border-none focus:outline-none text-center font-bold text-[9px]"
            />
          </div>
        </div>

        {/* INTER PASS & BUNDLE QUANTITY TABLE */}
        <div className="border-x border-b border-black grid grid-cols-12 divide-x divide-black text-[9px]">
          {/* Left Column: Inter Pass */}
          <div className="col-span-8 divide-y divide-black">
            <div className="grid grid-cols-8 divide-x divide-black text-center font-bold bg-slate-50 text-[8.5px]">
              <div className="col-span-2 p-1">INTER PASS</div>
              <div className="col-span-2 p-1">1 ST PASS</div>
              <div className="col-span-2 p-1">2 ND PASS</div>
              <div className="col-span-2 p-1">3 RD PASS</div>
            </div>
            <div className="grid grid-cols-8 divide-x divide-black text-center text-[8.5px] bg-slate-200 text-slate-800">
              <div className="col-span-2 p-1 font-semibold text-left pl-2 bg-slate-50 text-black">OD & WT (MM)</div>
              <div className="col-span-2 p-1 font-mono">
                {p1Od} / {p1Wt}
              </div>
              <div className="col-span-2 p-1 font-mono">
                {p2Od} / {p2Wt}
              </div>
              <div className="col-span-2 p-1 font-mono">
                {p3Od} / {p3Wt}
              </div>
            </div>

            {/* Heat Treatment & Straightness */}
            <div className="grid grid-cols-8 divide-x divide-black text-[8.5px]">
              <div className="col-span-2 p-1 font-bold bg-slate-50">HEAT TREATMENT</div>
              <div className="col-span-2 p-1 text-center font-medium">
                CYCLE:{' '}
                <input
                  type="text"
                  value={htCycle}
                  onChange={(e) => setHtCycle(e.target.value)}
                  className="bg-transparent border-none focus:outline-none font-semibold text-center w-24"
                />
              </div>
              <div className="col-span-2 p-1 font-bold bg-slate-50">STRAIGHTNESS</div>
              <div className="col-span-2 p-1 text-center font-bold">
                <input
                  type="text"
                  value={straightness}
                  onChange={(e) => setStraightness(e.target.value)}
                  className="w-full bg-transparent border-none focus:outline-none font-bold text-center"
                />
              </div>
            </div>

            <div className="grid grid-cols-8 divide-x divide-black text-[8.5px]">
              <div className="col-span-2 p-1 font-bold bg-slate-50">CONDITION</div>
              <div className="col-span-2 p-1 text-center font-medium">
                <input
                  type="text"
                  value={htCondition}
                  onChange={(e) => setHtCondition(e.target.value)}
                  className="w-full bg-transparent border-none focus:outline-none font-semibold text-center"
                />
              </div>
              <div className="col-span-2 p-1 font-bold bg-slate-50">HARDNESS</div>
              <div className="col-span-2 p-1 text-center font-bold text-purple-950 print:text-black">
                <input
                  type="text"
                  value={hardness}
                  onChange={(e) => setHardness(e.target.value)}
                  className="w-full bg-transparent border-none focus:outline-none font-bold text-center"
                />
              </div>
            </div>

            {/* 
              ========================================================================
              CRITICAL USER REQUIREMENT: MECHANICAL PROPERTIES TABLE
              ========================================================================
            */}
            <div className="bg-slate-100 p-1 text-center font-bold text-[9px] uppercase tracking-wider text-slate-800 border-t border-b border-black">
              MECHANICAL PROPERTIES (PER SPECIFICATION & AI LOOKUP)
            </div>

            <div className="grid grid-cols-9 divide-x divide-black text-center text-[8px] bg-slate-50">
              <div className="col-span-3 p-0.5 font-bold">YST (MPa) / PROOF STRESS</div>
              <div className="col-span-3 p-0.5 font-bold">UTS (MPa) / TENSILE STRENGTH</div>
              <div className="col-span-3 p-0.5 font-bold">ELONGATION % (CS AREA)</div>
            </div>

            <div className="grid grid-cols-9 divide-x divide-black text-center text-[8.5px]">
              {/* YST */}
              <div className="col-span-1 p-0.5 font-bold text-slate-600 bg-slate-50">MIN.</div>
              <div className="col-span-2 p-0.5 font-extrabold text-sm text-indigo-900 print:text-black">
                <input
                  type="text"
                  value={ystMin}
                  onChange={(e) => setYstMin(e.target.value)}
                  className="w-full bg-transparent border-none focus:outline-none font-extrabold text-sm text-indigo-900 print:text-black text-center"
                />
              </div>
              {/* UTS */}
              <div className="col-span-1 p-0.5 font-bold text-slate-600 bg-slate-50">MIN.</div>
              <div className="col-span-2 p-0.5 font-extrabold text-sm text-indigo-900 print:text-black">
                <input
                  type="text"
                  value={utsMin}
                  onChange={(e) => setUtsMin(e.target.value)}
                  className="w-full bg-transparent border-none focus:outline-none font-extrabold text-sm text-indigo-900 print:text-black text-center"
                />
              </div>
              {/* ELONGATION */}
              <div className="col-span-1 p-0.5 font-bold text-slate-600 bg-slate-50">MIN.</div>
              <div className="col-span-2 p-0.5 font-extrabold text-sm text-indigo-900 print:text-black">
                <input
                  type="text"
                  value={elongationMin}
                  onChange={(e) => setElongationMin(e.target.value)}
                  className="w-full bg-transparent border-none focus:outline-none font-extrabold text-sm text-indigo-900 print:text-black text-center"
                />
              </div>
            </div>

            <div className="grid grid-cols-9 divide-x divide-black text-center text-[8.5px]">
              {/* YST MAX */}
              <div className="col-span-1 p-0.5 font-bold text-slate-600 bg-slate-50">MAX.</div>
              <div className="col-span-2 p-0.5 font-medium text-slate-700">
                <input
                  type="text"
                  value={ystMax}
                  onChange={(e) => setYstMax(e.target.value)}
                  className="w-full bg-transparent border-none focus:outline-none font-medium text-slate-700 text-center"
                />
              </div>
              {/* UTS MAX */}
              <div className="col-span-1 p-0.5 font-bold text-slate-600 bg-slate-50">MAX.</div>
              <div className="col-span-2 p-0.5 font-medium text-slate-700">
                <input
                  type="text"
                  value={utsMax}
                  onChange={(e) => setUtsMax(e.target.value)}
                  className="w-full bg-transparent border-none focus:outline-none font-medium text-slate-700 text-center"
                />
              </div>
              {/* ELONGATION MAX */}
              <div className="col-span-1 p-0.5 font-bold text-slate-600 bg-slate-50">MAX.</div>
              <div className="col-span-2 p-0.5 font-medium text-slate-700">
                <input
                  type="text"
                  value={elongationMax}
                  onChange={(e) => setElongationMax(e.target.value)}
                  className="w-full bg-transparent border-none focus:outline-none font-medium text-slate-700 text-center"
                />
              </div>
            </div>

            {/* 
              ========================================================================
              CRITICAL USER REQUIREMENT: HYDRO PRESSURE IN PSI & NDT
              ========================================================================
            */}
            <div className="grid grid-cols-8 divide-x divide-black text-[8.5px] border-t border-black">
              <div className="col-span-2 p-1 font-bold bg-slate-50">TESTING</div>
              <div className="col-span-2 p-1 text-center font-bold">
                NDT:{' '}
                <input
                  type="text"
                  value={ndt}
                  onChange={(e) => setNdt(e.target.value)}
                  className="bg-transparent border-none focus:outline-none font-bold text-center w-16"
                />
              </div>
              <div className="col-span-2 p-1 font-bold bg-emerald-100 text-emerald-950 print:bg-white print:text-black">
                HYDRO PRESSURE
              </div>
              <div className="col-span-2 p-1 text-center font-extrabold text-sm text-emerald-900 print:text-black">
                <input
                  type="text"
                  value={hydroPressurePsi}
                  onChange={(e) => setHydroPressurePsi(e.target.value)}
                  className="w-full bg-transparent border-none focus:outline-none font-extrabold text-sm text-emerald-900 print:text-black text-center"
                />
              </div>
            </div>

            <div className="grid grid-cols-8 divide-x divide-black text-[8.5px]">
              <div className="col-span-2 p-1 font-bold bg-slate-50">HOLDING TIME:</div>
              <div className="col-span-2 p-1 text-center font-bold">
                <input
                  type="text"
                  value={holdingTime}
                  onChange={(e) => setHoldingTime(e.target.value)}
                  className="w-full bg-transparent border-none focus:outline-none font-bold text-center"
                />
              </div>
              <div className="col-span-2 p-1 font-bold bg-slate-50">END CONDITION</div>
              <div className="col-span-2 p-1 text-[7.5px] font-semibold">
                <input
                  type="text"
                  value={endCondition}
                  onChange={(e) => setEndCondition(e.target.value)}
                  className="w-full bg-transparent border-none focus:outline-none text-[7.5px] font-semibold text-center"
                />
              </div>
            </div>

            {/* Coating & Bundling */}
            <div className="grid grid-cols-8 divide-x divide-black text-[8.5px]">
              <div className="col-span-2 p-1 font-bold bg-slate-50">COATING</div>
              <div className="col-span-2 p-1 font-bold text-center">
                <input
                  type="text"
                  value={coating}
                  onChange={(e) => setCoating(e.target.value)}
                  className="w-full bg-transparent border-none focus:outline-none font-bold text-center"
                />
              </div>
              <div className="col-span-2 p-1 font-bold bg-slate-50">BUNDLING</div>
              <div className="col-span-2 p-1 font-bold text-center">
                <input
                  type="text"
                  value={bundling}
                  onChange={(e) => setBundling(e.target.value)}
                  className="w-full bg-transparent border-none focus:outline-none font-bold text-center"
                />
              </div>
            </div>

            <div className="grid grid-cols-8 divide-x divide-black text-[8.5px]">
              <div className="col-span-2 p-1 font-bold bg-slate-50">BUNDLE QTY. (PCS)</div>
              <div className="col-span-2 p-1 font-bold text-center">
                <input
                  type="text"
                  value={bundleQtyPcs}
                  onChange={(e) => setBundleQtyPcs(e.target.value)}
                  className="w-full bg-transparent border-none focus:outline-none font-bold text-center"
                />
              </div>
              <div className="col-span-2 p-1 font-bold bg-slate-50">BUNDLE WEIGHT (MT)</div>
              <div className="col-span-2 p-1 font-bold text-center">
                <input
                  type="text"
                  value={bundleWeightMt}
                  onChange={(e) => setBundleWeightMt(e.target.value)}
                  className="w-full bg-transparent border-none focus:outline-none font-bold text-center"
                />
              </div>
            </div>
          </div>

          {/* Right Column: BUNDLE SL.NO. TABLE */}
          <div className="col-span-4 flex flex-col justify-between">
            <div className="grid grid-cols-3 divide-x divide-black text-center font-bold bg-slate-50 text-[8.5px] border-b border-black">
              <div className="p-1">SL.NO.</div>
              <div className="p-1">BUNDLE NO.</div>
              <div className="p-1">QTY.</div>
            </div>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((idx) => (
              <div
                key={idx}
                className="grid grid-cols-3 divide-x divide-black text-center text-[8px] border-b border-black/40 h-4 items-center"
              >
                <div>{idx}</div>
                <div className="font-mono text-[7.5px] text-slate-400">BN-{idx.toString().padStart(2, '0')}</div>
                <div className="font-mono text-[7.5px] text-slate-400">-</div>
              </div>
            ))}
            <div className="grid grid-cols-3 divide-x divide-black text-center font-bold bg-slate-100 text-[8.5px] border-t border-black">
              <div className="p-0.5 col-span-2">TOTAL</div>
              <div className="p-0.5 font-bold">{planQtyNos}</div>
            </div>
          </div>
        </div>

        {/* Special Requirements */}
        <div className="border-x border-b border-black p-1 text-[9px] flex items-start gap-2">
          <span className="font-bold whitespace-nowrap pt-0.5">SPECIAL REQUIREMENTS (IF ANY):</span>
          <textarea
            rows={2}
            value={specialReq}
            onChange={(e) => setSpecialReq(e.target.value)}
            className="flex-1 bg-transparent border-none focus:outline-none text-[8.5px] leading-tight resize-y min-h-[32px]"
          />
        </div>

        {/* Marking Section */}
        <div className="border-x border-b border-black p-1">
          <div className="text-center font-bold text-[9px] uppercase tracking-wider mb-0.5">
            MARKING SPECIFICATION
          </div>
          <div className="bg-slate-50 p-1.5 border border-black/30 font-mono text-[8.5px] leading-relaxed break-all">
            <textarea
              rows={2}
              value={marking}
              onChange={(e) => setMarking(e.target.value)}
              className="w-full bg-transparent border-none focus:outline-none font-mono text-[8.5px] resize-none"
            />
          </div>
        </div>

        {/* Signatures & Approvals */}
        <div className="border-x border-b border-black grid grid-cols-5 divide-x divide-black text-center text-[8.5px] min-h-[52px]">
          <div className="p-1 flex flex-col justify-between">
            <div className="font-bold">PREPARED BY</div>
            <div className="text-[7.5px] text-slate-600 mt-4">{preparedBy} / {preparedDate}</div>
          </div>
          <div className="p-1 flex flex-col justify-between">
            <div className="font-bold">PPC SEC. IN-CHARGE</div>
            <div className="text-[7.5px] text-slate-400 mt-4">DATE: ____________</div>
          </div>
          <div className="p-1 flex flex-col justify-between">
            <div className="font-bold">HOT MILL SEC IN-CHARGE</div>
            <div className="text-[7.5px] text-slate-400 mt-4">DATE: ____________</div>
          </div>
          <div className="p-1 flex flex-col justify-between">
            <div className="font-bold">COLD MILL SEC IN-CHARGE</div>
            <div className="text-[7.5px] text-slate-400 mt-4">DATE: ____________</div>
          </div>
          <div className="p-1 flex flex-col justify-between">
            <div className="font-bold">APPROVED BY QC</div>
            <div className="text-[7.5px] text-slate-400 mt-4">DATE: ____________</div>
          </div>
        </div>

        {/* Document Footer */}
        <div className="text-[8px] text-slate-600 flex items-center justify-between pt-1">
          <span>Format No. F-PROD-11, Eff. Date:01.04.2023, Rev.01, Rev. Dt:01.04.2024 / PPC</span>
          <span>RASHMI SEAMLESS DIVISION • QUALITY MANAGEMENT SYSTEM</span>
          <span>PAGE 1 OF 1</span>
        </div>
      </div>
      </div>
    </div>
  );
}
