'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Printer,
  Save,
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
  po_no?: string | null;
  po_date?: string | null;
  material_code?: string | null;
  is_diversion?: boolean;
  display_label?: string;
}

export default function ProcessSheetReportClient() {
  const selectPlanRef = useRef<(plan: RollingPlanRecord) => void>(() => {});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [plans, setPlans] = useState<RollingPlanRecord[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [specSource, setSpecSource] = useState<'ai' | 'engine' | 'manual'>('engine');

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
  const [marking, setMarking] = useState('');

  // Signatures
  const [preparedBy] = useState('PPC EXEC');
  const [preparedDate] = useState(() => {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
  });

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

      const mappedWoPlans: RollingPlanRecord[] = [];

      // A. For each work order in allWorkOrders:
      allWorkOrders.forEach((wo: any) => {
        const associatedRps = rpsByWoId.get(wo.id) || [];

        const finalOd = Number(wo.size_od ?? 88.9);
        const finalWt = Number(wo.size_wt ?? 5.49);
        const finalL1 = Number(wo.l1 ?? 4.0);
        const finalL2 = Number(wo.l2 ?? 7.0);

        if (associatedRps.length > 0) {
          // If work order has one or more rolling plans, generate a record for each plan
          associatedRps.forEach((r: any) => {
            const route = routeMap.get(r.process_route_id) || {};
            let parsedSt: any = {};
            try {
              parsedSt = typeof r.status === 'string' ? JSON.parse(r.status) : r.status || {};
            } catch { }

            mappedWoPlans.push({
              id: r.id,
              plan_no: r.plan_no || 'Standard Plan',
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

    // Check if saved process sheet data exists in local storage or plan status
    let saved: any = null;
    if (typeof window !== 'undefined') {
      const cached =
        localStorage.getItem(`process_sheet_${plan.id}`) ||
        localStorage.getItem(`process_sheet_wo_${effectiveWoNo}`);
      if (cached) {
        try {
          saved = JSON.parse(cached);
        } catch { }
      }
    }
    if (!saved && parsedSt.process_sheet_saved) {
      saved = parsedSt.process_sheet_saved;
    }

    if (saved) {
      if (saved.sheetNo) setSheetNo(saved.sheetNo);
      if (saved.revNo) setRevNo(saved.revNo);
      if (saved.orderType) setOrderType(saved.orderType);
      if (saved.routeType) setRouteType(saved.routeType);
      if (saved.sheetDate) setSheetDate(saved.sheetDate);
      if (saved.customer) setCustomer(saved.customer);
      if (saved.destination) setDestination(saved.destination);
      if (saved.poNo !== undefined) setPoNo(saved.poNo);
      if (saved.poDate !== undefined) setPoDate(saved.poDate);
      if (saved.woNo) setWoNo(saved.woNo);
      if (saved.woDate) setWoDate(saved.woDate);
      if (saved.orderQty) setOrderQty(saved.orderQty);
      if (saved.deliveryDate) setDeliveryDate(saved.deliveryDate);
      if (saved.materialCode !== undefined) setMaterialCode(saved.materialCode);
      if (saved.priority) setPriority(saved.priority);
      if (saved.materialSpec) setMaterialSpec(saved.materialSpec);
      if (saved.pipeColorCode) setPipeColorCode(saved.pipeColorCode);
      if (saved.rmColorCode) setRmColorCode(saved.rmColorCode);
      if (saved.steelGrade) setSteelGrade(saved.steelGrade);
      if (saved.heatNo) setHeatNo(saved.heatNo);
      if (saved.billetDia) setBilletDia(saved.billetDia);
      if (saved.billetSectWt) setBilletSectWt(saved.billetSectWt);
      if (saved.totalWeightMt) setTotalWeightMt(saved.totalWeightMt);
      if (saved.billetLength) setBilletLength(saved.billetLength);
      if (saved.cuttingTol) setCuttingTol(saved.cuttingTol);
      if (saved.multiple) setMultiple(saved.multiple);
      if (saved.whfTemp) setWhfTemp(saved.whfTemp);
      if (saved.inductionTemp) setInductionTemp(saved.inductionTemp);
      if (saved.sizingOutletTemp) setSizingOutletTemp(saved.sizingOutletTemp);
      if (saved.piercerOd) setPiercerOd(saved.piercerOd);
      if (saved.piercerWt) setPiercerWt(saved.piercerWt);
      if (saved.piercerShellLen) setPiercerShellLen(saved.piercerShellLen);
      if (saved.shellWeight) setShellWeight(saved.shellWeight);
      if (saved.motherHollowOd) setMotherHollowOd(saved.motherHollowOd);
      if (saved.motherHollowWt) setMotherHollowWt(saved.motherHollowWt);
      if (saved.rollingWt) setRollingWt(saved.rollingWt);
      if (saved.motherHollowKgMtr) setMotherHollowKgMtr(saved.motherHollowKgMtr);
      if (saved.smLength) setSmLength(saved.smLength);
      if (saved.hfsFinalLength) setHfsFinalLength(saved.hfsFinalLength);
      if (saved.mhTolOdMin) setMhTolOdMin(saved.mhTolOdMin);
      if (saved.mhTolOdMax) setMhTolOdMax(saved.mhTolOdMax);
      if (saved.mhTolWtMin) setMhTolWtMin(saved.mhTolWtMin);
      if (saved.mhTolWtMax) setMhTolWtMax(saved.mhTolWtMax);
      if (saved.planQtyNos) setPlanQtyNos(saved.planQtyNos);
      if (saved.planQtyMtrs) setPlanQtyMtrs(saved.planQtyMtrs);
      if (saved.planQtyMt) setPlanQtyMt(saved.planQtyMt);
      if (saved.inspection) setInspection(saved.inspection);
      if (saved.processRouteStr) setProcessRouteStr(saved.processRouteStr);
      if (saved.custOd) setCustOd(saved.custOd);
      if (saved.custWt) setCustWt(saved.custWt);
      if (saved.processWt) setProcessWt(saved.processWt);
      if (saved.finalPipeWeight) setFinalPipeWeight(saved.finalPipeWeight);
      if (saved.finalLength) setFinalLength(saved.finalLength);
      if (saved.finalOrderLen1) setFinalOrderLen1(saved.finalOrderLen1);
      if (saved.finalOrderLen2) setFinalOrderLen2(saved.finalOrderLen2);
      if (saved.finalTolOdMin) setFinalTolOdMin(saved.finalTolOdMin);
      if (saved.finalTolOdMax) setFinalTolOdMax(saved.finalTolOdMax);
      if (saved.finalTolWtMin) setFinalTolWtMin(saved.finalTolWtMin);
      if (saved.finalTolWtMax) setFinalTolWtMax(saved.finalTolWtMax);
      if (saved.htCycle) setHtCycle(saved.htCycle);
      if (saved.htCondition) setHtCondition(saved.htCondition);
      if (saved.straightness) setStraightness(saved.straightness);
      if (saved.hardness) setHardness(saved.hardness);
      if (saved.ystMin) setYstMin(saved.ystMin);
      if (saved.ystMax) setYstMax(saved.ystMax);
      if (saved.utsMin) setUtsMin(saved.utsMin);
      if (saved.utsMax) setUtsMax(saved.utsMax);
      if (saved.elongationMin) setElongationMin(saved.elongationMin);
      if (saved.elongationMax) setElongationMax(saved.elongationMax);
      if (saved.ndt) setNdt(saved.ndt);
      if (saved.hydroPressurePsi) setHydroPressurePsi(saved.hydroPressurePsi);
      if (saved.holdingTime) setHoldingTime(saved.holdingTime);
      if (saved.coating) setCoating(saved.coating);
      if (saved.endCondition) setEndCondition(saved.endCondition);
      if (saved.bundling) setBundling(saved.bundling);
      if (saved.bundleQtyPcs) setBundleQtyPcs(saved.bundleQtyPcs);
      if (saved.bundleWeightMt) setBundleWeightMt(saved.bundleWeightMt);
      if (saved.specialReq !== undefined) setSpecialReq(saved.specialReq);
      if (saved.marking) setMarking(saved.marking);
      return;
    }

    // 2. Process sheet No = Last 2 digits of the year + D + Work order no
    const yr2 = String(new Date().getFullYear()).slice(-2);
    setSheetNo(`${yr2}D${effectiveWoNo}`);

    setWoNo(effectiveWoNo);
    setCustomer(plan.customer_name || 'Standard Client');
    setDestination(parsedSt.destination || '');

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
      specUpper.includes('NO NEG');

    const calcProcessWt = isNoNegativeTol
      ? Number((targetWt * 1.05).toFixed(2))
      : Number((targetWt * 0.97).toFixed(2));
    setProcessWt(calcProcessWt.toFixed(2));

    setFinalOrderLen1(l1Val.toFixed(3));
    setFinalOrderLen2(l2Val.toFixed(3));
    setFinalLength(avgLen.toFixed(2));

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

    // Reset marking string for the newly selected Work Order
    setMarking(
      `RASHMI SMLS / LOGO / ${rCode} / ${plan.specification || 'ASTM SPEC'} / ${plan.grade || 'STEEL GRADE'} / OD ${targetOd.toFixed(2)} MM X WT ${targetWt.toFixed(2)} MM / NDE / WO NO -${plan.work_order_no}`
    );

    // Fetch mechanical & tolerances automatically specifically for this work order
    fetchAiSpecs({
      planId: plan.id,
      grade: plan.grade || parsedSt.grade,
      specification: plan.specification || parsedSt.spec,
      size_od: targetOd,
      size_wt: targetWt,
      route_code: rCode,
      customer_name: plan.customer_name,
      wo_no: plan.work_order_no,
      po_no: plan.po_no || parsedSt.po_no || '',
      heat_no: parsedSt.heat_no || '',
    });
  };
  selectPlanRef.current = selectPlan;

  // Save current Process Sheet specifications
  const saveProcessSheet = async () => {
    if (!selectedPlanId) {
      toast.error('Please select a Work Order or Diversion Plan first.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        planId: selectedPlanId,
        sheetNo,
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
        marking,
        preparedBy,
        preparedDate,
        savedAt: new Date().toISOString(),
      };

      // 1. Instant local persistence
      if (typeof window !== 'undefined') {
        localStorage.setItem(`process_sheet_${selectedPlanId}`, JSON.stringify(payload));
        localStorage.setItem(`process_sheet_wo_${woNo}`, JSON.stringify(payload));
      }

      // 2. Persist in database process_sheets table
      const s = createClient();
      try {
        await s.from('process_sheets').upsert(
          {
            plan_id: selectedPlanId,
            work_order_no: woNo,
            sheet_no: sheetNo,
            sheet_data: payload,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'sheet_no' }
        );
      } catch (dbErr) {
        console.warn('Database note (process_sheets):', dbErr);
      }

      // 3. If standard rolling plan, also update rolling_plans status
      if (!selectedPlanId.startsWith('div-') && !selectedPlanId.startsWith('wo-')) {
        try {
          const activePlan = plans.find((p) => p.id === selectedPlanId);
          const currentSt = activePlan?.status && typeof activePlan.status === 'object' ? activePlan.status : {};
          await s
            .from('rolling_plans')
            .update({
              status: {
                ...currentSt,
                process_sheet_saved: payload,
              },
            })
            .eq('id', selectedPlanId);
        } catch (rpErr) {
          console.warn('Rolling plan status note:', rpErr);
        }
      }

      toast.success(`✓ Process Sheet (${sheetNo}) saved successfully!`);
    } catch (err: any) {
      console.error('Error saving process sheet:', err);
      toast.error(err.message || 'Failed to save process sheet.');
    } finally {
      setSaving(false);
    }
  };

  // Fetch Mechanical Properties, Tolerances & Hydro Pressure PSI via AI / Metallurgical Engine
  const fetchAiSpecs = async (customParams?: any) => {
    setAiLoading(true);
    try {
      const activePlan = plans.find((p) => p.id === (customParams?.planId || selectedPlanId));
      const targetGrade = customParams?.grade || activePlan?.grade || 'SAE 1018';
      const targetSpec = customParams?.specification || activePlan?.specification || 'ASTM A106 Gr B';
      const targetOd = Number(customParams?.size_od || activePlan?.size_od || 88.9);
      const targetWt = Number(customParams?.size_wt || activePlan?.size_wt || 5.49);
      const targetRoute = customParams?.route_code || activePlan?.route_code || 'HFS';
      const targetCustomer = customParams?.customer_name || activePlan?.customer_name || '';
      const targetWoNo = customParams?.wo_no || activePlan?.work_order_no || '';
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

      // Update marking string with calculated hydro pressure & active order details
      setMarking(
        `RASHMI SMLS / LOGO / ${targetRoute} / ${targetSpec} / ${targetGrade} / OD ${targetOd.toFixed(2)} MM X WT ${targetWt.toFixed(2)} MM / HYDRO TESTED ${d.testing.hydro_pressure_psi} PSI / NDE / WO NO -${targetWoNo}${targetPoNo ? ` / PO NO -${targetPoNo}` : ''}${targetHeatNo ? ` / H.NO -${targetHeatNo}` : ''}`
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
              onClick={saveProcessSheet}
              disabled={saving || !selectedPlanId}
              className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium flex items-center gap-1.5 shadow-sm shadow-blue-500/20 transition-all disabled:opacity-50 cursor-pointer"
              title="Save current Process Sheet specifications"
            >
              {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {saving ? 'Saving...' : 'Save Sheet'}
            </button>

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
        AUTHENTIC RASHMI SEAMLESS DIVISION PROCESS SHEET (FORMAT NO. F-PROD-11)
        Styled for direct high-fidelity visual fidelity on screen & physical A4 print
        ========================================================================
      */}
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
          <div className="col-span-1 p-1 font-bold bg-slate-200 text-slate-800 text-center">{orderType}</div>
          <div className="col-span-1 font-bold p-1 bg-slate-50">ROUTE</div>
          <div className="col-span-1 p-1 font-bold bg-slate-200 text-slate-800 text-center">{routeType}</div>
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
          <div className="col-span-2 p-1 text-center font-bold bg-slate-200 text-slate-800">
            OD: {mhTolOdMin} - {mhTolOdMax}
          </div>
          <div className="col-span-2 p-1 text-center font-bold bg-slate-200 text-slate-800">
            WT: {mhTolWtMin} - {mhTolWtMax}
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
                    specUpper.includes('A210');
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
          <div className="col-span-2 p-1 text-center font-bold bg-slate-200 text-slate-800 print:text-black">
            OD: {finalTolOdMin} - {finalTolOdMax}
          </div>
          <div className="col-span-2 p-1 text-center font-bold bg-slate-200 text-slate-800 print:text-black">
            WT: {finalTolWtMin} - {finalTolWtMax}
          </div>
          <div className="col-span-2 p-1 text-center font-bold bg-slate-200 text-slate-800">-</div>
          <div className="col-span-2 font-bold p-1 bg-slate-50 text-center">
            FINAL ORDER LENGTH (MTR)
          </div>
          <div className="col-span-1 p-1 text-center font-bold bg-slate-200 text-slate-800">L1: {finalOrderLen1}</div>
          <div className="col-span-1 p-1 text-center font-bold bg-slate-200 text-slate-800">L2: {finalOrderLen2}</div>
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
