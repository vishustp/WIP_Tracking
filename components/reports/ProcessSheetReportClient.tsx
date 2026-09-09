'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { ProcessSpecResult } from '@/lib/metallurgy/specEngine';

interface RollingPlanRecord {
  id: string;
  plan_no: string;
  work_order_id: string;
  planned_rolling_date: string;
  planned_qty: number;
  process_route_id: string;
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
}

export default function ProcessSheetReportClient() {
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<RollingPlanRecord[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [specSource, setSpecSource] = useState<'ai' | 'engine' | 'manual'>('engine');

  // Process Sheet Form State Fields
  const [sheetNo, setSheetNo] = useState('250D05000');
  const [revNo, setRevNo] = useState('REV 01');
  const [orderType, setOrderType] = useState('HFS');
  const [routeType, setRouteType] = useState('HFS');
  const [sheetDate, setSheetDate] = useState('04-06-2026');

  const [customer, setCustomer] = useState('Bharat Petroleum Corporation Ltd');
  const [destination, setDestination] = useState('Administrative Building, Bharat Petroleum Corporation, Limited, ...');
  const [poNo, setPoNo] = useState('GEMC-511687748165300');
  const [poDate, setPoDate] = useState('10.12.2025');
  const [woNo, setWoNo] = useState('DOM-BPCL - 05000');
  const [woDate, setWoDate] = useState('04-06-2026');
  const [orderQty, setOrderQty] = useState('77 MTR');
  const [deliveryDate, setDeliveryDate] = useState('IMMEDIATE');
  const [materialCode, setMaterialCode] = useState('CFIDP0889005490020');
  const [priority, setPriority] = useState('1');
  const [materialSpec, setMaterialSpec] = useState('ASTM A106 Gr B (IBR)');
  const [pipeColorCode, setPipeColorCode] = useState('WHITE');
  const [rmColorCode, setRmColorCode] = useState('YELLOW + WHITE');
  const [steelGrade, setSteelGrade] = useState('SAE 1018 / 15C8 RS-03');
  const [heatNo, setHeatNo] = useState('25D05457');

  // Billet Details
  const [billetDia, setBilletDia] = useState('90.00');
  const [billetSectWt, setBilletSectWt] = useState('49.95');
  const [totalWeightMt, setTotalWeightMt] = useState('0.16');
  const [billetLength, setBilletLength] = useState('1290');
  const [cuttingTol, setCuttingTol] = useState('+5/-0 MM');
  const [multiple, setMultiple] = useState('1');

  // Temperatures
  const [whfTemp, setWhfTemp] = useState('1220° C (+/- 40° C)');
  const [inductionTemp, setInductionTemp] = useState('850 °C - 880° C');
  const [sizingOutletTemp, setSizingOutletTemp] = useState('880° C TO 900° C');

  // Piercer & Mother Hollow
  const [piercerOd, setPiercerOd] = useState('96.00');
  const [piercerWt, setPiercerWt] = useState('5.74');
  const [piercerShellLen, setPiercerShellLen] = useState('4.89');
  const [shellWeight, setShellWeight] = useState('12.78');

  const [motherHollowOd, setMotherHollowOd] = useState('88.90');
  const [motherHollowWt, setMotherHollowWt] = useState('5.49');
  const [rollingWt, setRollingWt] = useState('5.49');
  const [motherHollowKgMtr, setMotherHollowKgMtr] = useState('11.30');
  const [smLength, setSmLength] = useState('5.533');
  const [hfsFinalLength, setHfsFinalLength] = useState('5.533');

  // Tolerances
  const [mhTolOdMin, setMhTolOdMin] = useState('88.11');
  const [mhTolOdMax, setMhTolOdMax] = useState('89.69');
  const [mhTolWtMin, setMhTolWtMin] = useState('4.80');
  const [mhTolWtMax, setMhTolWtMax] = useState('6.31');

  const [planQtyNos, setPlanQtyNos] = useState('14');
  const [planQtyMtrs, setPlanQtyMtrs] = useState('77');
  const [planQtyMt, setPlanQtyMt] = useState('0.87');
  const [inspection, setInspection] = useState('IBR');
  const [processRouteStr, setProcessRouteStr] = useState(
    'BILLET CUTTING # WHF 3# PIERCER LXC 60 # SIZING # STRA # CUTTING # UT # HYDRO # VDI # BLACK VARNISH # MARKING # BUNDLING'
  );

  // Cold Mill & Final
  const [custOd, setCustOd] = useState('88.90');
  const [custWt, setCustWt] = useState('5.49');
  const [processWt, setProcessWt] = useState('5.49');
  const [finalPipeWeight, setFinalPipeWeight] = useState('11.30');
  const [finalLength, setFinalLength] = useState('5.51');
  const [finalOrderLen1, setFinalOrderLen1] = useState('4.000');
  const [finalOrderLen2, setFinalOrderLen2] = useState('7.000');

  const [finalTolOdMin, setFinalTolOdMin] = useState('88.10');
  const [finalTolOdMax, setFinalTolOdMax] = useState('89.70');
  const [finalTolWtMin, setFinalTolWtMin] = useState('4.80');
  const [finalTolWtMax, setFinalTolWtMax] = useState('6.59');

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
  const [endCondition, setEndCondition] = useState('BEVEL END (30°-35°) ROOT FACE (0.8 2.4MM)');
  const [bundling, setBundling] = useState('HEXAGONAL');
  const [bundleQtyPcs, setBundleQtyPcs] = useState('69');
  const [bundleWeightMt, setBundleWeightMt] = useState('2 MT');
  const [endCap, setEndCap] = useState('PLASTIC PROTECTOR');

  const [specialReq, setSpecialReq] = useState('');
  const [marking, setMarking] = useState(
    'RASHMI SMLS / LOGO / HFS / ASTM A106 GR.B /NACE MR0103 / MR0175/ OD 88.90 MM X WT 5.49 MM / HYDRO TESTED 2500 PSI / NDE / PO NO -4511422279 / ITEM CODE-6001909522 /00100 / EIL CODE : PI21917221118ZZZZ/ H.NO...... + LENGTH.......+BUNDLE NO.............'
  );

  // Signatures
  const [preparedBy] = useState('PPC EXEC');
  const [preparedDate] = useState('04-06-2026');

  // Load Work Orders with Issued Rolling Plans
  const loadIssuedPlans = useCallback(async () => {
    setLoading(true);
    try {
      const s = createClient();
      // Fetch rolling plans joined with work orders and routes
      const { data: rps, error: rpErr } = await s
        .from('rolling_plans')
        .select(`
          id,
          plan_no,
          work_order_id,
          planned_rolling_date,
          planned_qty,
          process_route_id,
          target_mother_size,
          multiple,
          status,
          mh_od,
          mh_wt,
          mh_l1,
          mh_l2,
          pass_required,
          work_orders (
            id,
            work_order_no,
            customer_name,
            grade,
            specification,
            size_od,
            size_wt,
            l1,
            l2,
            ordered_qty,
            ordered_qty_pcs,
            ordered_qty_mtr
          ),
          process_routes (
            id,
            route_code,
            route_name
          )
        `)
        .order('planned_rolling_date', { ascending: false })
        .limit(300);

      if (rpErr) throw rpErr;

      const mappedPlans: RollingPlanRecord[] = (rps || []).map((r: any) => {
        const wo = r.work_orders || {};
        const route = r.process_routes || {};
        return {
          id: r.id,
          plan_no: r.plan_no,
          work_order_id: r.work_order_id,
          planned_rolling_date: r.planned_rolling_date,
          planned_qty: Number(r.planned_qty || 0),
          process_route_id: r.process_route_id,
          target_mother_size: r.target_mother_size,
          multiple: Number(r.multiple || 1),
          status: r.status,
          mh_od: r.mh_od,
          mh_wt: r.mh_wt,
          mh_l1: r.mh_l1,
          mh_l2: r.mh_l2,
          pass_required: r.pass_required,
          work_order_no: wo.work_order_no || 'WO-UNKNOWN',
          customer_name: wo.customer_name || 'Standard Customer',
          grade: wo.grade || 'SAE 1018',
          specification: wo.specification || 'ASTM A106 Gr B',
          size_od: Number(wo.size_od) || 88.9,
          size_wt: Number(wo.size_wt) || 5.49,
          l1: Number(wo.l1) || 4.0,
          l2: Number(wo.l2) || 7.0,
          ordered_qty: Number(wo.ordered_qty || 0),
          ordered_qty_pcs: Number(wo.ordered_qty_pcs || 0),
          ordered_qty_mtr: Number(wo.ordered_qty_mtr || 0),
          route_code: route.route_code || 'HFS',
          route_name: route.route_name || 'Standard HFS',
        };
      });

      setPlans(mappedPlans);
      if (mappedPlans.length > 0 && !selectedPlanId) {
        selectPlan(mappedPlans[0]);
      }
    } catch (err: any) {
      console.error('Error loading rolling plans:', err);
      toast.error(err.message || 'Failed to load Work Orders with issued rolling plans.');
    } finally {
      setLoading(false);
    }
  }, [selectedPlanId]);

  useEffect(() => {
    loadIssuedPlans();
  }, [loadIssuedPlans]);

  // When a Work Order / Rolling Plan is selected
  const selectPlan = (plan: RollingPlanRecord) => {
    setSelectedPlanId(plan.id);

    const isCds = plan.route_code.toUpperCase().includes('CDS');
    const rCode = isCds ? 'CDS' : 'HFS';
    setOrderType(rCode);
    setRouteType(rCode);

    setSheetNo(plan.plan_no.replace('RP-', 'PS-'));
    setWoNo(plan.work_order_no);
    setCustomer(plan.customer_name || 'Customer');
    setSteelGrade(plan.grade || 'SAE 1018');
    setMaterialSpec(plan.specification || 'ASTM A106 Gr B (IBR)');

    const targetOd = Number(plan.size_od) || 88.9;
    const targetWt = Number(plan.size_wt) || 5.49;
    const l1Val = plan.l1 || 4.0;
    const l2Val = plan.l2 || 7.0;

    setCustOd(targetOd.toFixed(2));
    setCustWt(targetWt.toFixed(2));
    setProcessWt(targetWt.toFixed(2));
    setFinalOrderLen1(l1Val.toFixed(3));
    setFinalOrderLen2(l2Val.toFixed(3));
    setFinalLength(((l1Val + l2Val) / 2).toFixed(2));

    // Calculate pipe weight in kg/mtr: (OD - WT) * WT * 0.0246615
    const kgMtr = Math.max(targetOd - targetWt, 0) * Math.max(targetWt, 0) * 0.0246615;
    setFinalPipeWeight(kgMtr.toFixed(2));
    setMotherHollowKgMtr(kgMtr.toFixed(2));

    // Rolling / Piercer Hollow values
    const mhOd = Number(plan.mh_od) || targetOd;
    const mhWt = Number(plan.mh_wt) || targetWt;
    setMotherHollowOd(mhOd.toFixed(2));
    setMotherHollowWt(mhWt.toFixed(2));
    setRollingWt(mhWt.toFixed(2));
    setSmLength((plan.mh_l1 || 5.533).toString());
    setHfsFinalLength((plan.mh_l2 || 5.533).toString());

    // Piercer estimate
    const piercOd = Number((mhOd * 1.08).toFixed(2));
    const piercWt = Number((mhWt * 1.04).toFixed(2));
    setPiercerOd(piercOd.toFixed(2));
    setPiercerWt(piercWt.toFixed(2));
    setPiercerShellLen((5.533 * 0.88).toFixed(2));
    setShellWeight((kgMtr * 1.13).toFixed(2));

    // Billet estimate
    const bDia = mhOd > 75 ? 90.0 : 63.0;
    setBilletDia(bDia.toFixed(2));
    const bSect = ((bDia * bDia * 3.14159 * 0.007856) / 4);
    setBilletSectWt(bSect.toFixed(2));
    setBilletLength('1290');
    setTotalWeightMt((((bSect * 1.29) / 1000)).toFixed(2));

    setMultiple(plan.multiple ? plan.multiple.toString() : '1');
    setPlanQtyMtrs(plan.planned_qty ? plan.planned_qty.toString() : '77');
    const nosCalc = Math.round(Number(plan.planned_qty || 77) / Number((l1Val + l2Val) / 2 || 5.5));
    setPlanQtyNos(nosCalc.toString());
    setPlanQtyMt(((kgMtr * (plan.planned_qty || 77)) / 1000).toFixed(2));
    setOrderQty(`${plan.ordered_qty_mtr || plan.planned_qty || 77} MTR`);

    // Fetch mechanical & tolerances automatically
    fetchAiSpecs({
      grade: plan.grade,
      specification: plan.specification,
      size_od: targetOd,
      size_wt: targetWt,
      route_code: rCode,
      customer_name: plan.customer_name,
      wo_no: plan.work_order_no,
    });
  };

  // Fetch Mechanical Properties, Tolerances & Hydro Pressure PSI via AI / Metallurgical Engine
  const fetchAiSpecs = async (customParams?: any) => {
    setAiLoading(true);
    try {
      const activePlan = plans.find((p) => p.id === selectedPlanId);
      const payload = {
        grade: customParams?.grade || steelGrade || activePlan?.grade,
        specification: customParams?.specification || materialSpec || activePlan?.specification,
        size_od: Number(customParams?.size_od || custOd || activePlan?.size_od || 88.9),
        size_wt: Number(customParams?.size_wt || custWt || activePlan?.size_wt || 5.49),
        route_code: customParams?.route_code || routeType || activePlan?.route_code || 'HFS',
        customer_name: customParams?.customer_name || customer || activePlan?.customer_name,
        wo_no: customParams?.wo_no || woNo || activePlan?.work_order_no,
        po_no: poNo,
        heat_no: heatNo,
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

      if (d.suggested_marking) {
        setMarking(d.suggested_marking);
      }

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
      {/* Action Header & WO Selector (Hidden on Print) */}
      <div className="print:hidden space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-lg">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> Rolling Plan Issued Orders Only
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center gap-1">
                <Cpu className="w-3.5 h-3.5" /> AI Metallurgical Engine Active
              </span>
            </div>
            <h1 className="text-xl font-bold text-white mt-1">
              Process Sheet Report (Format No. F-PROD-11)
            </h1>
            <p className="text-xs text-slate-400">
              Select any Work Order scheduled in Rolling Planning to auto-fetch Mechanical Properties,
              Dimensional Tolerances & Hydro Pressure (PSI).
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
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
              {aiLoading ? 'Analyzing Specs...' : 'Fetch with AI'}
            </button>

            <button
              onClick={handlePrint}
              className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1.5 shadow-sm shadow-emerald-500/20 transition-all cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              Print / Save PDF
            </button>
          </div>
        </div>

        {/* Work Order Selector Bar */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-xs font-medium text-slate-300 flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-400" />
              <span>
                Active Rolling Plan Orders: <strong className="text-white">{plans.length}</strong> available
              </span>
            </div>

            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
              <input
                type="text"
                placeholder="Search Work Order, Plan No, Grade, Size..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Quick Selection Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
            {filteredPlans.slice(0, 15).map((p) => {
              const isSelected = p.id === selectedPlanId;
              return (
                <button
                  key={p.id}
                  onClick={() => selectPlan(p)}
                  className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-all border text-left cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-600/20 border-indigo-500 text-white font-medium shadow-sm'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  <div className="font-semibold text-white">{p.work_order_no}</div>
                  <div className="text-[10px] text-slate-400">
                    {p.plan_no} • {p.grade} • OD {p.size_od} x {p.size_wt}
                  </div>
                </button>
              );
            })}
          </div>

          {activePlan && (
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3 text-xs flex items-center justify-between flex-wrap gap-2 text-slate-300">
              <div className="flex items-center gap-3">
                <span className="text-slate-400">Selected Order:</span>
                <span className="font-bold text-white">{activePlan.work_order_no}</span>
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
        AUTHENTIC RASHMI SEAMLESS DIVISION PROCESS SHEET (FORMAT NO. F-PROD-11)
        Styled for direct high-fidelity visual fidelity on screen & physical A4 print
        ========================================================================
      */}
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
          <div className="col-span-1 p-1 font-bold">{orderType}</div>
          <div className="col-span-1 font-bold p-1 bg-slate-50">ROUTE</div>
          <div className="col-span-1 p-1 font-bold">{routeType}</div>
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
          <div className="col-span-6 p-1 font-bold">
            <input
              type="text"
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              className="w-full bg-transparent border-none focus:outline-none font-bold"
            />
          </div>
          <div className="col-span-2 font-bold p-1 bg-slate-50">DESTINATION:</div>
          <div className="col-span-2 p-1 text-[8.5px]">
            <input
              type="text"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              className="w-full bg-transparent border-none focus:outline-none text-[8.5px]"
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
          <div className="col-span-2 p-1">
            <input
              type="text"
              value={woDate}
              onChange={(e) => setWoDate(e.target.value)}
              className="w-full bg-transparent border-none focus:outline-none"
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
          <div className="col-span-10 grid grid-cols-6 divide-x divide-black text-center">
            <div className="p-0.5">
              <div className="text-[8px] text-slate-500">OD (MM) in Hot</div>
              <div className="font-bold">{piercerOd}</div>
            </div>
            <div className="p-0.5">
              <div className="text-[8px] text-slate-500">WT(MM) in Hot</div>
              <div className="font-bold">{piercerWt}</div>
            </div>
            <div className="p-0.5">
              <div className="text-[8px] text-slate-500">PIERCER SHELL LENGTH</div>
              <div className="font-bold">{piercerShellLen}</div>
            </div>
            <div className="p-0.5">
              <div className="text-[8px] text-slate-500">SHELL WEIGHT KG/MTR</div>
              <div className="font-bold">{shellWeight}</div>
            </div>
            <div className="p-0.5">
              <div className="text-[8px] text-slate-500">OD (MM) AIM</div>
              <div className="font-bold">NA</div>
            </div>
            <div className="p-0.5">
              <div className="text-[8px] text-slate-500">WT(MM) AIM</div>
              <div className="font-bold">NA</div>
            </div>
          </div>
        </div>

        {/* MOTHER HOLLOW SIZE : SIZING MILL */}
        <div className="border-x border-b border-black grid grid-cols-12 divide-x divide-black text-[9px]">
          <div className="col-span-2 font-bold p-1 bg-slate-50 flex items-center">
            MOTHER HOLLOW SIZE : SIZING MILL
          </div>
          <div className="col-span-10 grid grid-cols-6 divide-x divide-black text-center">
            <div className="p-0.5">
              <div className="text-[8px] text-slate-500">MOTHER HOLLOW OD (MM)</div>
              <div className="font-bold font-mono">{motherHollowOd}</div>
            </div>
            <div className="p-0.5">
              <div className="text-[8px] text-slate-500">MOTHER HOLLOW WT(MM)</div>
              <div className="font-bold font-mono">{motherHollowWt}</div>
            </div>
            <div className="p-0.5">
              <div className="text-[8px] text-slate-500">ROLLING WT(MM)</div>
              <div className="font-bold font-mono">{rollingWt}</div>
            </div>
            <div className="p-0.5">
              <div className="text-[8px] text-slate-500">MOTHER HOLLOW KG/MTR</div>
              <div className="font-bold font-mono">{motherHollowKgMtr}</div>
            </div>
            <div className="p-0.5">
              <div className="text-[8px] text-slate-500">SM LENGTH (MTR)</div>
              <div className="font-bold">{smLength}</div>
            </div>
            <div className="p-0.5">
              <div className="text-[8px] text-slate-500">HFS FINAL LENGTH (MTR)</div>
              <div className="font-bold">{hfsFinalLength}</div>
            </div>
          </div>
        </div>

        {/* TOLERANCE (IN MM) FOR MOTHER HOLLOW & PLAN QTY */}
        <div className="border-x border-b border-black grid grid-cols-12 divide-x divide-black text-[9px]">
          <div className="col-span-2 font-bold p-1 bg-slate-50">TOLERANCE (IN MM):</div>
          <div className="col-span-2 p-1 text-center font-bold">
            OD: {mhTolOdMin} - {mhTolOdMax}
          </div>
          <div className="col-span-2 p-1 text-center font-bold">
            WT: {mhTolWtMin} - {mhTolWtMax}
          </div>
          <div className="col-span-2 font-bold p-1 bg-slate-50 text-center">PLAN QTY IN NOS:</div>
          <div className="col-span-1 p-1 font-bold text-center">{planQtyNos}</div>
          <div className="col-span-1 font-bold p-1 text-center">MTRS: {planQtyMtrs}</div>
          <div className="col-span-1 font-bold p-1 text-center">MT: {planQtyMt}</div>
          <div className="col-span-1 font-bold p-1 bg-indigo-50 text-center text-indigo-900 print:text-black">
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
            <div className="font-bold text-sm text-indigo-900 print:text-black">{custOd}</div>
          </div>
          <div className="col-span-2 p-1 text-center">
            <div className="text-[8px] text-slate-500">CUSTOMER WT(MM)</div>
            <div className="font-bold text-sm text-indigo-900 print:text-black">{custWt}</div>
          </div>
          <div className="col-span-2 p-1 text-center">
            <div className="text-[8px] text-slate-500">PROCESS WT(MM)</div>
            <div className="font-bold text-sm">{processWt}</div>
          </div>
          <div className="col-span-2 p-1 text-center">
            <div className="text-[8px] text-slate-500">FINAL PIPE WEIGHT (KG/MTR)</div>
            <div className="font-bold">{finalPipeWeight}</div>
          </div>
          <div className="col-span-2 p-1 text-center">
            <div className="text-[8px] text-slate-500">FINAL LENGTH (MTRS)</div>
            <div className="font-bold">{finalLength}</div>
          </div>
        </div>

        {/* FINAL TOLERANCE & ORDER LENGTH */}
        <div className="border-x border-b border-black grid grid-cols-12 divide-x divide-black text-[9px]">
          <div className="col-span-2 font-bold p-1 bg-slate-50">
            FINAL {orderType} TOLERANCE (IN MM)
          </div>
          <div className="col-span-2 p-1 text-center font-bold text-indigo-950 print:text-black">
            OD: {finalTolOdMin} - {finalTolOdMax}
          </div>
          <div className="col-span-2 p-1 text-center font-bold text-indigo-950 print:text-black">
            WT: {finalTolWtMin} - {finalTolWtMax}
          </div>
          <div className="col-span-2 p-1 text-center font-bold">-</div>
          <div className="col-span-2 font-bold p-1 bg-slate-50 text-center">
            FINAL ORDER LENGTH (MTR)
          </div>
          <div className="col-span-1 p-1 text-center font-bold">L1: {finalOrderLen1}</div>
          <div className="col-span-1 p-1 text-center font-bold">L2: {finalOrderLen2}</div>
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
            <div className="grid grid-cols-8 divide-x divide-black text-center text-[8.5px]">
              <div className="col-span-2 p-1 font-semibold text-left pl-2">OD & WT (MM)</div>
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
              <div className="col-span-2 p-1 text-center font-medium">CYCLE: {htCycle}</div>
              <div className="col-span-2 p-1 font-bold bg-slate-50">STRAIGHTNESS</div>
              <div className="col-span-2 p-1 text-center font-bold">{straightness}</div>
            </div>

            <div className="grid grid-cols-8 divide-x divide-black text-[8.5px]">
              <div className="col-span-2 p-1 font-bold bg-slate-50">CONDITION</div>
              <div className="col-span-2 p-1 text-center font-medium">{htCondition}</div>
              <div className="col-span-2 p-1 font-bold bg-slate-50">HARDNESS</div>
              <div className="col-span-2 p-1 text-center font-bold text-purple-950 print:text-black">
                {hardness}
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
                {ystMin}
              </div>
              {/* UTS */}
              <div className="col-span-1 p-0.5 font-bold text-slate-600 bg-slate-50">MIN.</div>
              <div className="col-span-2 p-0.5 font-extrabold text-sm text-indigo-900 print:text-black">
                {utsMin}
              </div>
              {/* ELONGATION */}
              <div className="col-span-1 p-0.5 font-bold text-slate-600 bg-slate-50">MIN.</div>
              <div className="col-span-2 p-0.5 font-extrabold text-sm text-indigo-900 print:text-black">
                {elongationMin}%
              </div>
            </div>

            <div className="grid grid-cols-9 divide-x divide-black text-center text-[8.5px]">
              {/* YST MAX */}
              <div className="col-span-1 p-0.5 font-bold text-slate-600 bg-slate-50">MAX.</div>
              <div className="col-span-2 p-0.5 font-medium text-slate-700">{ystMax}</div>
              {/* UTS MAX */}
              <div className="col-span-1 p-0.5 font-bold text-slate-600 bg-slate-50">MAX.</div>
              <div className="col-span-2 p-0.5 font-medium text-slate-700">{utsMax}</div>
              {/* ELONGATION MAX */}
              <div className="col-span-1 p-0.5 font-bold text-slate-600 bg-slate-50">MAX.</div>
              <div className="col-span-2 p-0.5 font-medium text-slate-700">{elongationMax}</div>
            </div>

            {/* 
              ========================================================================
              CRITICAL USER REQUIREMENT: HYDRO PRESSURE IN PSI & NDT
              ========================================================================
            */}
            <div className="grid grid-cols-8 divide-x divide-black text-[8.5px] border-t border-black">
              <div className="col-span-2 p-1 font-bold bg-slate-50">TESTING</div>
              <div className="col-span-2 p-1 text-center font-bold">NDT: {ndt}</div>
              <div className="col-span-2 p-1 font-bold bg-emerald-100 text-emerald-950 print:bg-white print:text-black">
                HYDRO PRESSURE
              </div>
              <div className="col-span-2 p-1 text-center font-extrabold text-sm text-emerald-900 print:text-black">
                {hydroPressurePsi}
              </div>
            </div>

            <div className="grid grid-cols-8 divide-x divide-black text-[8.5px]">
              <div className="col-span-2 p-1 font-bold bg-slate-50">HOLDING TIME:</div>
              <div className="col-span-2 p-1 text-center font-bold">{holdingTime}</div>
              <div className="col-span-2 p-1 font-bold bg-slate-50">END CONDITION</div>
              <div className="col-span-2 p-1 text-[7.5px] font-semibold">{endCondition}</div>
            </div>

            {/* Coating & Bundling */}
            <div className="grid grid-cols-8 divide-x divide-black text-[8.5px]">
              <div className="col-span-2 p-1 font-bold bg-slate-50">COATING</div>
              <div className="col-span-2 p-1 font-bold text-center">{coating}</div>
              <div className="col-span-2 p-1 font-bold bg-slate-50">BUNDLING</div>
              <div className="col-span-2 p-1 font-bold text-center">{bundling}</div>
            </div>

            <div className="grid grid-cols-8 divide-x divide-black text-[8.5px]">
              <div className="col-span-2 p-1 font-bold bg-slate-50">BUNDLE QTY. (PCS)</div>
              <div className="col-span-2 p-1 font-bold text-center">{bundleQtyPcs}</div>
              <div className="col-span-2 p-1 font-bold bg-slate-50">BUNDLE WEIGHT (MT)</div>
              <div className="col-span-2 p-1 font-bold text-center">{bundleWeightMt}</div>
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
          <span className="font-bold whitespace-nowrap">SPECIAL REQUIREMENTS (IF ANY):</span>
          <input
            type="text"
            placeholder="e.g. As per Client Approved Quality Plan (QAP) & Inspection by Third Party (EIL / TUV / BVQI)"
            value={specialReq}
            onChange={(e) => setSpecialReq(e.target.value)}
            className="flex-1 bg-transparent border-none focus:outline-none text-[8.5px]"
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
  );
}
