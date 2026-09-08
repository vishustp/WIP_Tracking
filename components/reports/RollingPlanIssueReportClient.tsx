'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Printer,
  Search,
  RefreshCw,
  Crown,
  Link2,
  ChevronDown,
  ChevronUp,
  Download,
  Flame,
  X,
  FileText,
  Table as TableIcon,
  Edit2,
  CheckCircle2,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

export type Plan = {
  id: string;
  plan_no: string;
  work_order_id: string;
  work_order_no: string;
  customer_name: string | null;
  grade: string | null;
  od: number | null;
  wt: number | null;
  l1: number | null;
  l2: number | null;
  avg_length: number | null;
  route_id: string;
  route_code: string;
  route_name: string;
  planned_rolling_date: string;
  planned_mtr: number;
  planned_pcs: number;
  planned_mt: number;
  planned_qty?: number;
  mh_od: number | null;
  mh_wt: number | null;
  mh_l1: number | null;
  mh_l2: number | null;
  pass_required: number;
  multiple: number;
  status: string;
  created_at: string;
  updated_at: string;
  can_modify: boolean;
};

export interface FactoryPlanRow {
  // 35-Column Manufacturing Schedule Fields
  srNo: number;            // 1. Sr No.
  catg: string;            // 2. Catg
  customer: string;        // 3. Customer
  woNo: string;            // 4. W.O. / S.O. No.
  spec: string;            // 5. Spec
  grade: string;           // 6. Grade
  ibr: string;             // 7. IBR/NIBR
  rollingMtr: number;      // 8. Rolling mtr
  rmOd: number;            // 9. RM OD (mm)
  rmLenMin: number;        // 10. RM Len Min
  rmLenMax: number;        // 11. RM Len Max
  weightKg: number;        // 12. Weight (Kgs)
  planQtyNos: number;      // 13. Nos
  planQtyMton: number;     // 14. Mton
  billetWtWhf: number;     // 15. Billet Wt. After WHF
  pmOd: number;            // 16. PM OD
  pmWt: number;            // 17. PM Wt
  pmKgMtr: number;         // 18. PM Kg/Mtr
  pmLen: number;           // 19. PM Length
  wtWbf: number;           // 20. Wt. After WBF
  custOd: number;          // 21. Cust. OD
  custWt: number;          // 22. Cust. WT
  rollingWt: number;       // 23. Rolling WT
  smKgMtr: number;         // 24. SM Kg/Mtr
  smLen: number;           // 25. SM Length
  feLen: number;           // 26. FE Lg (Mtr)
  feWg: number;            // 27. FE Wg(Kgs)
  beLen: number;           // 28. BE Lg (Mtr)
  beWg: number;            // 29. BE Wg(Kgs)
  effectiveWg: number;     // 30. Effective Wg (Kg)
  effLen: number;          // 31. Effective Length
  reqLenEr: string;        // 32. E/R
  reqLenMin: number;       // 33. Min
  reqLenMax: number;       // 34. Max
  mult: string;            // 35. Multi

  // Tolerances & Yield
  tolOdMin?: number;
  tolOdMax?: number;
  tolWtMin?: number;
  tolWtMax?: number;
  processYieldPct?: number;

  // Header & Linking Metadata
  campaignPlanNo: string;
  millName: string;
  monthStr: string;
  issueDate: string;
  prevPlanNo: string;
  plan?: Plan;
  childSubRows: Array<{
    catg: string;
    finishSize: string;
    finalLen: string;
    woNo: string;
    customer: string;
    hollowLen: string;
    htcMtr: number;
    isParent?: boolean;
  }>;
}

const fmt = (n: number | string | null | undefined, digits = 2) => {
  if (n == null || n === '') return '—';
  const num = Number(n);
  return isNaN(num) ? String(n) : num.toLocaleString(undefined, { maximumFractionDigits: digits });
};

const formatFinalSizeLength = (p: { l1?: number | null; l2?: number | null; avg_length?: number | null }) => {
  const hl1 = Number(p.l1 || 0);
  const hl2 = Number(p.l2 || 0);
  if (hl1 > 0 && hl2 > 0) {
    if (hl1 === hl2) return `L: ${fmt(hl1)} m`;
    return `L: ${fmt(hl1)} - ${fmt(hl2)} m`;
  }
  if (hl1 > 0) return `L: ${fmt(hl1)} m`;
  if (hl2 > 0) return `L: ${fmt(hl2)} m`;
  const avg = Number(p.avg_length || 0);
  if (avg > 0) return `L: ~${fmt(avg)} m (avg)`;
  return null;
};

export default function RollingPlanIssueReportClient() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [routeFilter, setRouteFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [millFilter, setMillFilter] = useState<'ALL' | 'Mill-02' | 'Mill-03'>('ALL');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [routes, setRoutes] = useState<{ id: string; route_code: string; route_name: string }[]>([]);

  const [expandedMasters, setExpandedMasters] = useState<Record<string, boolean>>({});
  const [selectedPlanForSlip, setSelectedPlanForSlip] = useState<Plan | null>(null);

  // Edit Specs & Tolerances modal state
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editCatg, setEditCatg] = useState('CDS');
  const [editSpec, setEditSpec] = useState('ASME SA210 Gr.A1');
  const [editGrade, setEditGrade] = useState('SAE-1018');
  const [editIbrStatus, setEditIbrStatus] = useState('IBR');
  const [editRmOd, setEditRmOd] = useState('63.00');
  const [editRmLenMin, setEditRmLenMin] = useState('2.030');
  const [editRmLenMax, setEditRmLenMax] = useState('2.035');
  const [editPmOd, setEditPmOd] = useState('66.0');
  const [editPmWt, setEditPmWt] = useState('6.00');
  const [editCustOd, setEditCustOd] = useState('47.00');
  const [editCustWt, setEditCustWt] = useState('6.25');
  const [editRollingWt, setEditRollingWt] = useState('6.25');
  const [editFeLen, setEditFeLen] = useState('0.000');
  const [editBeLen, setEditBeLen] = useState('0.000');
  const [editReqLenEr, setEditReqLenEr] = useState('EL');
  const [editReqLenMin, setEditReqLenMin] = useState('7.53');
  const [editReqLenMax, setEditReqLenMax] = useState('7.53');
  const [editTolOdMin, setEditTolOdMin] = useState('46.50');
  const [editTolOdMax, setEditTolOdMax] = useState('47.40');
  const [editTolWtMin, setEditTolWtMin] = useState('5.78');
  const [editTolWtMax, setEditTolWtMax] = useState('6.88');
  const [editProcessYieldPct, setEditProcessYieldPct] = useState('95.22');
  const [editPlannedPcs, setEditPlannedPcs] = useState('180');

  // View Mode: Factory Cutting Plan (Mill-02) or Standard Table View
  const [viewMode, setViewMode] = useState<'factory' | 'standard'>('factory');
  const [selectedCampaignPlan, setSelectedCampaignPlan] = useState<string>('ALL');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const s = createClient();
      const [plansRes, routesRes] = await Promise.all([
        s.rpc('get_rolling_plans', {
          p_search: search.trim() || null,
          p_route_code: routeFilter === 'ALL' ? null : routeFilter,
          p_from_date: fromDate || null,
          p_to_date: toDate || null,
          p_limit: 2000,
          p_offset: 0,
        }),
        s.from('process_routes').select('id,route_code,route_name').eq('active', true).order('route_code'),
      ]);

      if (plansRes.error) throw plansRes.error;
      const rawPlans = (plansRes.data ?? []) as Plan[];

      // Fetch actual Mother Hollow specs & status directly from rolling_plans table
      const planIds = rawPlans.map((x) => x.id);
      const woIds = Array.from(new Set(rawPlans.map((x) => x.work_order_id).filter(Boolean)));
      let mhMap: Record<string, any> = {};
      let woMap: Record<string, any> = {};

      const [rpDetailsRes, woDetailsRes] = await Promise.all([
        planIds.length > 0
          ? s.from('rolling_plans').select('id, mh_od, mh_wt, mh_l1, mh_l2, pass_required, multiple, status, planned_qty').in('id', planIds)
          : Promise.resolve({ data: [] }),
        woIds.length > 0
          ? s.from('work_orders').select('id, size_od, size_wt, l1, l2, ordered_qty_pcs, ordered_qty_mtr').in('id', woIds)
          : Promise.resolve({ data: [] }),
      ]);

      if (rpDetailsRes.data) {
        for (const d of rpDetailsRes.data) mhMap[d.id] = d;
      }
      if (woDetailsRes.data) {
        for (const w of woDetailsRes.data) woMap[w.id] = w;
      }

      const enrichedPlans: Plan[] = rawPlans.map((p) => {
        const detail = mhMap[p.id];
        const wo = woMap[p.work_order_id];
        let parsedSt: any = {};
        try {
          parsedSt = typeof detail?.status === 'string'
            ? JSON.parse(detail.status)
            : detail?.status || (typeof p.status === 'string' ? JSON.parse(p.status) : p.status || {});
        } catch { }

        // Final Size Specifications
        const finalOd = wo?.size_od ?? p.od ?? parsedSt?.master_od ?? null;
        const finalWt = wo?.size_wt ?? p.wt ?? parsedSt?.master_wt ?? null;
        const finalL1 = wo?.l1 ?? p.l1 ?? null;
        const finalL2 = wo?.l2 ?? p.l2 ?? null;

        let computedAvgLen: number | null = p.avg_length ?? null;
        if (!computedAvgLen && finalL1 && finalL2) {
          computedAvgLen = (Number(finalL1) + Number(finalL2)) / 2;
        } else if (!computedAvgLen && (finalL1 || finalL2)) {
          computedAvgLen = Number(finalL1 || finalL2);
        } else if (!computedAvgLen && wo && Number(wo.ordered_qty_pcs) > 0 && Number(wo.ordered_qty_mtr) > 0) {
          computedAvgLen = Number((Number(wo.ordered_qty_mtr) / Number(wo.ordered_qty_pcs)).toFixed(2));
        }

        const mhOd = detail?.mh_od ?? p.mh_od ?? null;
        const mhWt = detail?.mh_wt ?? p.mh_wt ?? null;
        const mhL1 = detail?.mh_l1 ?? p.mh_l1 ?? null;
        const mhL2 = detail?.mh_l2 ?? p.mh_l2 ?? null;
        const passReq = detail?.pass_required ?? p.pass_required ?? 1;
        const mult = detail?.multiple ?? p.multiple ?? 1;

        let pcs = 0;
        if (parsedSt?.is_master && Number(parsedSt?.master_planned_pcs) > 0) {
          pcs = Number(parsedSt.master_planned_pcs);
        } else if (Number(parsedSt?.planned_pcs) > 0) {
          pcs = Number(parsedSt.planned_pcs);
        } else if (Number(p.planned_pcs) > 0) {
          pcs = Number(p.planned_pcs);
        }

        const hl1 = Number(mhL1 || 0);
        const hl2 = Number(mhL2 || 0);
        const mhAvgLen = (hl1 > 0 && hl2 > 0)
          ? (hl1 + hl2) / 2
          : (hl1 > 0 ? hl1 : (hl2 > 0 ? hl2 : Number(computedAvgLen || 6.0)));

        const rawMtr = Number(detail?.planned_qty ?? p.planned_qty ?? p.planned_mtr ?? 0);
        if (pcs === 0 && rawMtr > 0 && mhAvgLen > 0) {
          pcs = Math.round(rawMtr / mhAvgLen);
        }

        const mtr = pcs > 0
          ? Number((pcs * mhAvgLen).toFixed(2))
          : (Number(parsedSt?.master_planned_mtr || parsedSt?.planned_mtr || rawMtr) || 0);

        const hod = Number(mhOd || 0) > 0 ? Number(mhOd) : Number(finalOd || 0);
        const hwt = Number(mhWt || 0) > 0 ? Number(mhWt) : Number(finalWt || 0);
        const mt = (hod > 0 && hwt > 0 && hod > hwt)
          ? Number(((hod - hwt) * hwt * 0.0246615 * 0.001 * mtr).toFixed(3))
          : (Number(parsedSt?.master_planned_mt || parsedSt?.planned_mt || p.planned_mt) || 0);

        return {
          ...p,
          od: finalOd,
          wt: finalWt,
          l1: finalL1,
          l2: finalL2,
          avg_length: computedAvgLen,
          mh_od: mhOd,
          mh_wt: mhWt,
          mh_l1: mhL1,
          mh_l2: mhL2,
          pass_required: passReq,
          multiple: mult,
          planned_pcs: pcs,
          planned_mtr: mtr,
          planned_mt: mt,
          status: detail?.status ?? p.status,
        };
      });

      setPlans(enrichedPlans);

      if (routesRes.data) {
        setRoutes(routesRes.data);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load rolling plans.');
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }, [search, routeFilter, fromDate, toDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openEditSpecs = (p: Plan) => {
    setEditingPlan(p);
    let st: any = {};
    try {
      st = typeof p.status === 'string' ? JSON.parse(p.status) : p.status || {};
    } catch {}

    setEditCatg(st.catg || 'CDS');
    setEditSpec(st.spec || 'ASME SA210 Gr.A1');
    setEditGrade(st.grade || p.grade || 'SAE-1018');
    setEditIbrStatus(st.ibr_status || 'IBR');
    setEditRmOd(String(st.rm_od || st.billet?.rm_od || 63.0));

    const rawRMin = st.rm_len_min != null ? Number(st.rm_len_min) : (st.billet?.rm_len_min != null ? Number(st.billet.rm_len_min) : 2.030);
    setEditRmLenMin(String(rawRMin > 20 ? (rawRMin / 1000).toFixed(3) : rawRMin));

    const rawRMax = st.rm_len_max != null ? Number(st.rm_len_max) : (st.billet?.rm_len_max != null ? Number(st.billet.rm_len_max) : 2.035);
    setEditRmLenMax(String(rawRMax > 20 ? (rawRMax / 1000).toFixed(3) : rawRMax));

    setEditPmOd(String(st.pm_od || st.piercer_mill?.pm_od || 66.0));
    setEditPmWt(String(st.pm_wt || st.piercer_mill?.pm_wt || 6.00));
    setEditCustOd(String(st.cust_od || st.sm?.cust_od || p.mh_od || p.od || 47.00));
    setEditCustWt(String(st.cust_wt || st.sm?.cust_wt || p.mh_wt || p.wt || 6.25));
    setEditRollingWt(String(st.rolling_wt || st.sm?.rolling_wt || st.cust_wt || 6.25));
    setEditFeLen(String(st.fe_len != null ? st.fe_len : (st.thicken_ends?.fe_len ?? 0.0)));
    setEditBeLen(String(st.be_len != null ? st.be_len : (st.thicken_ends?.be_len ?? 0.0)));
    setEditReqLenEr(st.req_len_er || st.final_length?.er || 'EL');
    setEditReqLenMin(String(st.req_len_min || st.final_length?.min || p.mh_l1 || 7.53));
    setEditReqLenMax(String(st.req_len_max || st.final_length?.max || p.mh_l2 || 7.53));

    setEditTolOdMin(String(st.tol_od_min != null ? st.tol_od_min : (st.tolerances?.od_min ?? 46.50)));
    setEditTolOdMax(String(st.tol_od_max != null ? st.tol_od_max : (st.tolerances?.od_max ?? 47.40)));
    setEditTolWtMin(String(st.tol_wt_min != null ? st.tol_wt_min : (st.tolerances?.wt_min ?? 5.78)));
    setEditTolWtMax(String(st.tol_wt_max != null ? st.tol_wt_max : (st.tolerances?.wt_max ?? 6.88)));
    setEditProcessYieldPct(String(st.process_yield_pct != null ? st.process_yield_pct : 95.22));
    setEditPlannedPcs(String(p.planned_pcs || st.master_planned_pcs || st.plan_qty?.nos || 180));
  };

  const saveReportSpecs = async () => {
    if (!editingPlan) return;
    setEditSaving(true);
    try {
      const parsedRMin = Number(editRmLenMin) > 20 ? Number((Number(editRmLenMin) / 1000).toFixed(3)) : (Number(editRmLenMin) || 2.030);
      const parsedRMax = Number(editRmLenMax) > 20 ? Number((Number(editRmLenMax) / 1000).toFixed(3)) : (Number(editRmLenMax) || parsedRMin);

      const payload: any = {
        plan_id: editingPlan.id,
        planned_pcs: Number(editPlannedPcs) || editingPlan.planned_pcs || 1,
        planned_rolling_date: editingPlan.planned_rolling_date,
        route_id: editingPlan.route_id,
        multiple: Number(editingPlan.multiple) || 1,
        multiple_str: Number(editingPlan.multiple) === 2 ? '2-Multi' : '1',
        force: true,

        catg: editCatg,
        spec: editSpec,
        grade: editGrade,
        ibr_status: editIbrStatus,
        rm_od: Number(editRmOd) || 63.0,
        rm_len_min: parsedRMin,
        rm_len_max: parsedRMax,
        pm_od: Number(editPmOd) || 66.0,
        pm_wt: Number(editPmWt) || 6.00,
        cust_od: Number(editCustOd) || 47.00,
        cust_wt: Number(editCustWt) || 6.25,
        rolling_wt: Number(editRollingWt) || 6.25,
        fe_len: Number(editFeLen) || 0.0,
        be_len: Number(editBeLen) || 0.0,
        req_len_er: editReqLenEr,
        req_len_min: Number(editReqLenMin) || 7.53,
        req_len_max: Number(editReqLenMax) || 7.53,

        tol_od_min: Number(editTolOdMin),
        tol_od_max: Number(editTolOdMax),
        tol_wt_min: Number(editTolWtMin),
        tol_wt_max: Number(editTolWtMax),
        process_yield_pct: Number(editProcessYieldPct) || 95.22,

        mh_od: Number(editCustOd) || 47.00,
        mh_wt: Number(editRollingWt) || 6.25,
        mh_l1: Number(editReqLenMin) || 7.53,
        mh_l2: Number(editReqLenMax) || 7.53,
      };

      const res = await fetch('/api/rolling-plans', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update specifications.');
      }

      toast.success('Specifications and tolerances updated successfully!');
      setEditingPlan(null);
      await loadData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update specifications.');
    } finally {
      setEditSaving(false);
    }
  };

  // Filter plans based on type (Master, Child, Standard)
  const filteredPlans = useMemo(() => {
    return plans.filter((p) => {
      let parsedStatus: any = {};
      try {
        parsedStatus = typeof p.status === 'string' ? JSON.parse(p.status) : p.status;
      } catch { }

      const isMaster = !!parsedStatus?.is_master;
      const isChild = !!parsedStatus?.is_child;

      if (typeFilter === 'MASTER' && !isMaster) return false;
      if (typeFilter === 'CHILD' && !isChild) return false;
      if (typeFilter === 'STANDARD' && (isMaster || isChild)) return false;

      if (millFilter !== 'ALL') {
        const planMill = parsedStatus?.mill_name || 'Production Plan-Hot Mill-02';
        if (!planMill.toLowerCase().includes(millFilter.toLowerCase())) {
          return false;
        }
      }

      return true;
    });
  }, [plans, typeFilter, millFilter]);

  // Distinct Campaign Plan Nos for filtering
  const availableCampaigns = useMemo(() => {
    const set = new Set<string>();
    plans.forEach((p) => {
      let parsedStatus: any = {};
      try {
        parsedStatus = typeof p.status === 'string' ? JSON.parse(p.status) : p.status;
      } catch { }
      const camp = parsedStatus?.campaign_plan_no || p.plan_no;
      if (camp) set.add(camp);
    });
    return Array.from(set).sort();
  }, [plans]);

  // Transform filtered plans into Factory Cutting Plan Rows (Mill-02 format)
  const factoryRows = useMemo(() => {
    // In factory view, each row represents a setup group (Master plan or standalone plan)
    // Child plans are represented as sub-rows under their master
    const masterOrStandardPlans = filteredPlans.filter((p) => {
      let parsed: any = {};
      try {
        parsed = typeof p.status === 'string' ? JSON.parse(p.status) : p.status;
      } catch { }
      return !parsed?.is_child; // exclude children from being separate master rows
    });

    const targetPlans = selectedCampaignPlan === 'ALL'
      ? masterOrStandardPlans
      : masterOrStandardPlans.filter((p) => {
        let parsed: any = {};
        try {
          parsed = typeof p.status === 'string' ? JSON.parse(p.status) : p.status;
        } catch { }
        return (parsed?.campaign_plan_no || p.plan_no) === selectedCampaignPlan;
      });

    return targetPlans.map((p, idx) => {
      let parsed: any = {};
      try {
        parsed = typeof p.status === 'string' ? JSON.parse(p.status) : p.status || {};
      } catch { }

      const catg = parsed.catg || (p.route_code?.includes('CDS') ? 'CDS' : 'CDS');
      const customer = p.customer_name || 'Standard Stock';
      const woNo = p.work_order_no;
      const spec = parsed.spec || 'ASME SA210 Gr.A1';
      const grade = parsed.grade || p.grade || 'SAE 1018';
      const ibr = parsed.ibr_status || 'IBR';

      // 33. Min, 34. Max
      const reqLenMin = parsed.req_len_min != null ? Number(parsed.req_len_min) : (parsed.final_length?.min != null ? Number(parsed.final_length.min) : Number(p.mh_l1 || p.l1 || 7.53));
      const reqLenMax = parsed.req_len_max != null ? Number(parsed.req_len_max) : (parsed.final_length?.max != null ? Number(parsed.final_length.max) : Number(p.mh_l2 || p.l2 || 7.53));

      // 32. E/R = if Min=Max, "EL", "RL"
      const reqLenEr = parsed.req_len_er || parsed.er_status || (parsed.final_length?.er) || (reqLenMin === reqLenMax ? 'EL' : 'RL');

      // 1. Sub-Row 1: ALWAYS the Parent Work Order
      const parentFinishSize = parsed.master_od && parsed.master_wt
        ? `${fmt(parsed.master_od, 2)}x${fmt(parsed.master_wt, 2)}`
        : (p.od && p.wt ? `${fmt(p.od, 2)}x${fmt(p.wt, 2)}` : '38.1x4.73');
      const parentFinalLen = p.l1 && p.l2 ? `${fmt(p.l1, 2)}-${fmt(p.l2, 2)}` : (parsed.final_len || '11.55-11.55');
      const parentHollowLen = `${fmt(reqLenMin, 2)}-${fmt(reqLenMax, 2)}`;
      const parentHtcMtr = Number(parsed.master_planned_mtr ?? p.planned_mtr ?? 0);

      const childSubRows: Array<{
        catg: string;
        finishSize: string;
        finalLen: string;
        woNo: string;
        customer: string;
        hollowLen: string;
        htcMtr: number;
        isParent?: boolean;
      }> = [
        {
          catg: parsed.catg || catg,
          finishSize: parentFinishSize,
          finalLen: parentFinalLen,
          woNo: p.work_order_no,
          customer: p.customer_name || parsed.master_customer || 'Standard Stock',
          hollowLen: parentHollowLen,
          htcMtr: parentHtcMtr,
          isParent: true,
        },
      ];

      // 2. Sub-Rows 2..N: All linked Child Work Orders
      const childOrders: any[] = parsed.child_work_orders || [];
      childOrders.forEach((c: any) => {
        if (c.work_order_no && c.work_order_no !== p.work_order_no) {
          const cFinishSize = c.finish_size || `${fmt(c.size_od ?? p.od, 2)}x${fmt(c.size_wt ?? p.wt, 2)}`;
          const cFinalLen = c.final_len || (c.l1 && c.l2 ? `${fmt(c.l1, 2)}-${fmt(c.l2, 2)}` : `${fmt(c.l1 || 6, 2)}-${fmt(c.l2 || 6, 2)}`);
          const cHollowLen = c.hollow_len || parentHollowLen;
          const cMtr = Number(c.htc_mtr ?? c.planned_mtr ?? 0);
          childSubRows.push({
            catg: c.catg || catg,
            finishSize: cFinishSize,
            finalLen: cFinalLen,
            woNo: c.work_order_no,
            customer: c.customer_name || p.customer_name || 'Standard Stock',
            hollowLen: cHollowLen,
            htcMtr: cMtr,
            isParent: false,
          });
        }
      });

      // Also discover child plans from the plans table that might not be in parsed.child_work_orders
      const dbChildren = plans.filter((cp) => {
        if (cp.id === p.id) return false;
        let cpSt: any = {};
        try {
          cpSt = typeof cp.status === 'string' ? JSON.parse(cp.status) : cp.status || {};
        } catch {}
        return (
          cpSt.master_plan_id === p.id ||
          cpSt.master_plan_no === p.plan_no ||
          (p.plan_no && cp.plan_no && cp.plan_no.startsWith(p.plan_no + '-C'))
        );
      });

      dbChildren.forEach((cp) => {
        if (!childSubRows.some((r) => r.woNo === cp.work_order_no)) {
          let cpSt: any = {};
          try {
            cpSt = typeof cp.status === 'string' ? JSON.parse(cp.status) : cp.status || {};
          } catch {}
          const cFinishSize = cpSt.finish_size || (cp.od && cp.wt ? `${fmt(cp.od, 2)}x${fmt(cp.wt, 2)}` : `${fmt(p.od, 2)}x${fmt(p.wt, 2)}`);
          const cFinalLen = cpSt.final_len || (cp.l1 && cp.l2 ? `${fmt(cp.l1, 2)}-${fmt(cp.l2, 2)}` : `${fmt(cp.l1 || 6, 2)}-${fmt(cp.l2 || 6, 2)}`);
          const cHollowLen = cpSt.hollow_len || parentHollowLen;
          const cMtr = Number(cpSt.htc_mtr ?? cpSt.planned_mtr ?? cp.planned_qty ?? cp.planned_mtr ?? 0);
          childSubRows.push({
            catg: cpSt.catg || catg,
            finishSize: cFinishSize,
            finalLen: cFinalLen,
            woNo: cp.work_order_no,
            customer: cp.customer_name || p.customer_name || 'Standard Stock',
            hollowLen: cHollowLen,
            htcMtr: cMtr,
            isParent: false,
          });
        }
      });

      // 9. RM OD (mm)
      const rmOd = parsed.rm_od != null ? Number(parsed.rm_od) : (parsed.billet?.rm_od != null ? Number(parsed.billet.rm_od) : 63.00);
      
      // 10. RM Len Min (normalize if entered in mm)
      const rawRmLenMin = parsed.rm_len_min != null ? Number(parsed.rm_len_min) : (parsed.billet?.rm_len_min != null ? Number(parsed.billet.rm_len_min) : 1.890);
      const rmLenMin = rawRmLenMin > 20 ? Number((rawRmLenMin / 1000).toFixed(3)) : rawRmLenMin;

      // 11. RM Len Max (normalize if entered in mm)
      const rawRmLenMax = parsed.rm_len_max != null ? Number(parsed.rm_len_max) : (parsed.billet?.rm_len_max != null ? Number(parsed.billet.rm_len_max) : 1.895);
      const rmLenMax = rawRmLenMax > 20 ? Number((rawRmLenMax / 1000).toFixed(3)) : (rawRmLenMax || rmLenMin);

      // 12. Weight (Kgs) = (((RM OD)*(RM OD)*3.14*0.007856/4)*RM Len Min)
      const parsedWeightKg = parsed.weight_kg != null ? Number(parsed.weight_kg) : (parsed.billet?.weight_kg != null ? Number(parsed.billet.weight_kg) : null);
      const weightKg = parsedWeightKg != null && parsedWeightKg < 1000
        ? parsedWeightKg
        : Number((((rmOd * rmOd * 3.14 * 0.007856) / 4) * rmLenMin).toFixed(2));

      // 21. Cust. OD
      const custOd = parsed.cust_od != null ? Number(parsed.cust_od) : (parsed.sm?.cust_od != null ? Number(parsed.sm.cust_od) : Number(p.mh_od || p.od || 47.00));
      // 22. Cust. WT
      const custWt = parsed.cust_wt != null ? Number(parsed.cust_wt) : (parsed.sm?.cust_wt != null ? Number(parsed.sm.cust_wt) : Number(p.mh_wt || p.wt || 5.75));
      // 23. Rolling WT = Cust. WT
      const rollingWt = parsed.rolling_wt != null ? Number(parsed.rolling_wt) : (parsed.sm?.rolling_wt != null ? Number(parsed.sm.rolling_wt) : custWt);

      // 24. SM Kg/Mtr = (cust OD - Cust WT) * Cust WT * 0.02467
      const smKgMtr = parsed.sm_kg_mtr != null
        ? Number(parsed.sm_kg_mtr)
        : (parsed.sm?.sm_kg_mtr != null
          ? Number(parsed.sm.sm_kg_mtr)
          : (custOd > custWt ? Number(((custOd - custWt) * custWt * 0.02467).toFixed(3)) : 0));

      // 20. Wt. After WBF = Weight (Kgs) * 0.97
      const parsedWtWbf = parsed.wt_wbf != null ? Number(parsed.wt_wbf) : (parsed.sm?.wt_wbf != null ? Number(parsed.sm.wt_wbf) : null);
      const wtWbf = parsedWtWbf != null && parsedWtWbf < 1000 ? parsedWtWbf : Number((weightKg * 0.97).toFixed(2));

      // 25. SM Length = Wt. After WBF / SM Kg/Mtr
      const parsedSmLen = parsed.sm_len != null ? Number(parsed.sm_len) : (parsed.sm?.sm_len != null ? Number(parsed.sm.sm_len) : null);
      const smLen = parsedSmLen != null && parsedSmLen < 50
        ? parsedSmLen
        : (smKgMtr > 0 ? Number((wtWbf / smKgMtr).toFixed(2)) : 7.67);

      // 26. FE Lg (Mtr)
      const feLen = parsed.fe_len != null ? Number(parsed.fe_len) : (parsed.thicken_ends?.fe_len != null ? Number(parsed.thicken_ends.fe_len) : 0.000);
      // 27. FE Wg(Kgs) = SM Kg/Mtr * FE Lg (Mtr)
      const feWg = parsed.fe_wg != null
        ? Number(parsed.fe_wg)
        : (parsed.thicken_ends?.fe_wg != null
          ? Number(parsed.thicken_ends.fe_wg)
          : (smKgMtr > 0 && feLen > 0 ? Number((smKgMtr * feLen).toFixed(2)) : 0.0));

      // 28. BE Lg (Mtr)
      const beLen = parsed.be_len != null ? Number(parsed.be_len) : (parsed.thicken_ends?.be_len != null ? Number(parsed.thicken_ends.be_len) : 0.000);
      // 29. BE Wg(Kgs) = SM Kg/Mtr * BE Lg (Mtr)
      const beWg = parsed.be_wg != null
        ? Number(parsed.be_wg)
        : (parsed.thicken_ends?.be_wg != null
          ? Number(parsed.thicken_ends.be_wg)
          : (smKgMtr > 0 && beLen > 0 ? Number((smKgMtr * beLen).toFixed(2)) : 0.0));

      // 30. Effective Wg (Kg) = Wt. After WBF - FE Wg(Kgs) - BE Wg(Kgs)
      const effectiveWg = Number(Math.max(0, wtWbf - feWg - beWg).toFixed(2));

      // 31. Effective Length = Effective Wg (Kg) / SM Kg/Mtr
      const parsedEffLen = parsed.eff_len != null ? Number(parsed.eff_len) : (parsed.thicken_ends?.eff_len != null ? Number(parsed.thicken_ends.eff_len) : null);
      const effLen = parsedEffLen != null && parsedEffLen < 50
        ? parsedEffLen
        : (smKgMtr > 0 ? Number((effectiveWg / smKgMtr).toFixed(2)) : smLen);

      // 15. Billet Wt. After WHF = Weight (Kgs) * 0.97
      const billetWtWhf = wtWbf;

      // 16. PM OD: Use user input if provided, otherwise default to 66.0 (for 63mm RM OD)
      const parsedPmOd = parsed.pm_od != null ? Number(parsed.pm_od) : (parsed.piercer_mill?.pm_od != null ? Number(parsed.piercer_mill.pm_od) : null);
      const pmOd = parsedPmOd != null && (parsedPmOd !== 68 || rmOd !== 63) ? parsedPmOd : 66.0;

      // 17. PM Wt = Rolling WT - 0.25
      const pmWt = parsed.pm_wt != null ? Number(parsed.pm_wt) : (parsed.piercer_mill?.pm_wt != null ? Number(parsed.piercer_mill.pm_wt) : (rollingWt > 0.25 ? Number((rollingWt - 0.25).toFixed(2)) : 6.00));

      // 18. PM Kg/Mtr = (PM OD - PM WT) * PM WT * 0.02467
      const pmKgMtr = (pmOd > pmWt && pmWt > 0) ? Number(((pmOd - pmWt) * pmWt * 0.02467).toFixed(3)) : 8.88;

      // 19. PM Length = Billet Wt. After WHF / PM KG/MTR
      const parsedPmLen = parsed.pm_len != null ? Number(parsed.pm_len) : (parsed.piercer_mill?.pm_len != null ? Number(parsed.piercer_mill.pm_len) : null);
      const pmLen = parsedPmLen != null && parsedPmLen < 50
        ? parsedPmLen
        : (pmKgMtr > 0 ? Number((billetWtWhf / pmKgMtr).toFixed(2)) : 5.37);

      // 8. Rolling mtr = Calculated from sum of childSubRows HTC mtr or planned_mtr
      const subRowsTotalMtr = childSubRows.reduce((sum, r) => sum + r.htcMtr, 0);
      const rollingMtr = subRowsTotalMtr > 0
        ? subRowsTotalMtr
        : (parsed.rolling_mtr != null && Number(parsed.rolling_mtr) < 100000 ? Number(parsed.rolling_mtr) : Number(p.planned_mtr || 0));

      // 13. Nos
      const parsedNos = parsed.plan_qty?.nos != null ? Number(parsed.plan_qty.nos) : (parsed.plan_qty_nos != null ? Number(parsed.plan_qty_nos) : null);
      const planQtyNos = parsedNos != null && parsedNos > 0
        ? parsedNos
        : (effLen > 0 ? Math.round(rollingMtr / effLen) : Number(p.planned_pcs || 0));

      // 14. Mton = (Weight (Kgs) * Nos) / 1000
      const planQtyMton = Number(((weightKg * planQtyNos) / 1000).toFixed(1));

      // 35. Multi
      const mult = parsed.multiple_str || (p.multiple > 1 ? `${p.multiple}-Multi` : '1');
      const tolOdMin = parsed.tol_od_min != null ? Number(parsed.tol_od_min) : (custOd - 0.4);
      const tolOdMax = parsed.tol_od_max != null ? Number(parsed.tol_od_max) : (custOd + 0.4);
      const tolWtMin = parsed.tol_wt_min != null ? Number(parsed.tol_wt_min) : (custWt * 0.92);
      const tolWtMax = parsed.tol_wt_max != null ? Number(parsed.tol_wt_max) : (custWt * 1.1);
      const processYieldPct = parsed.process_yield_pct != null ? Number(parsed.process_yield_pct) : 95.50;

      const campaignPlanNo = parsed.campaign_plan_no || p.plan_no;
      const millName = parsed.mill_name || 'Production Plan-Hot Mill-02';
      const monthStr = parsed.month_str || 'Sep-26';
      const issueDate = p.planned_rolling_date || '7-Sep';
      const prevPlanNo = parsed.prev_plan_no || '01';

      return {
        // Exact 35 Columns
        srNo: idx + 1,        // 1. Sr No.
        catg,                 // 2. Catg
        customer,             // 3. Customer
        woNo,                 // 4. W.O. / S.O. No.
        spec,                 // 5. Spec
        grade,                // 6. Grade
        ibr,                  // 7. IBR/NIBR
        rollingMtr,           // 8. Rolling mtr
        rmOd,                 // 9. RM OD (mm)
        rmLenMin,             // 10. RM Len Min
        rmLenMax,             // 11. RM Len Max
        weightKg,             // 12. Weight (Kgs)
        planQtyNos,           // 13. Nos
        planQtyMton,          // 14. Mton
        billetWtWhf,          // 15. Billet Wt. After WHF
        pmOd,                 // 16. PM OD
        pmWt,                 // 17. PM Wt
        pmKgMtr,              // 18. PM Kg/Mtr
        pmLen,                // 19. PM Length
        wtWbf,                // 20. Wt. After WBF
        custOd,               // 21. Cust. OD
        custWt,               // 22. Cust. WT
        rollingWt,            // 23. Rolling WT
        smKgMtr,              // 24. SM Kg/Mtr
        smLen,                // 25. SM Length
        feLen,                // 26. FE Lg (Mtr)
        feWg,                 // 27. FE Wg(Kgs)
        beLen,                // 28. BE Lg (Mtr)
        beWg,                 // 29. BE Wg(Kgs)
        effectiveWg,          // 30. Effective Wg (Kg)
        effLen,               // 31. Effective Length
        reqLenEr,             // 32. E/R
        reqLenMin,            // 33. Min
        reqLenMax,            // 34. Max
        mult,                 // 35. Multi

        // Metadata & linking
        tolOdMin,
        tolOdMax,
        tolWtMin,
        tolWtMax,
        processYieldPct,
        campaignPlanNo,
        millName,
        monthStr,
        issueDate,
        prevPlanNo,
        plan: p,
        childSubRows,
      };
    });
  }, [filteredPlans, selectedCampaignPlan]);

  // Primary Metadata for Active Factory Sheet Header
  const activeSheetMeta = useMemo(() => {
    if (factoryRows.length > 0) {
      const first = factoryRows[0];
      return {
        millName: first.millName,
        monthStr: first.monthStr,
        planNo: selectedCampaignPlan !== 'ALL' ? selectedCampaignPlan : (first.campaignPlanNo || '02'),
        issueDate: first.issueDate,
        prevPlanNo: first.prevPlanNo,
      };
    }
    return {
      millName: millFilter !== 'ALL' ? `Production Plan-Hot ${millFilter}` : 'Production Plan-Hot Mill-02',
      monthStr: 'Sep-26',
      planNo: selectedCampaignPlan !== 'ALL' ? selectedCampaignPlan : '02',
      issueDate: '7-Sep',
      prevPlanNo: '01',
    };
  }, [factoryRows, selectedCampaignPlan, millFilter]);

  // Summary Metrics
  const summary = useMemo(() => {
    let totalMtr = 0;
    let totalPcs = 0;
    let totalMt = 0;
    let masterCount = 0;

    filteredPlans.forEach((p) => {
      let parsedStatus: any = {};
      try {
        parsedStatus = typeof p.status === 'string' ? JSON.parse(p.status) : p.status;
      } catch { }
      if (parsedStatus?.is_master) masterCount++;

      totalMtr += Number(p.planned_mtr || 0);
      totalPcs += Number(p.planned_pcs || 0);
      totalMt += Number(p.planned_mt || 0);
    });

    return {
      count: filteredPlans.length,
      totalMtr,
      totalPcs,
      totalMt,
      masterCount,
    };
  }, [filteredPlans]);

  const toggleExpand = (id: string) => {
    setExpandedMasters((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const exportCSV = () => {
    if (viewMode === 'factory') {
      if (!factoryRows.length) {
        toast.error('No data available to export.');
        return;
      }
      const headers = [
        'Sr No.',
        'Catg',
        'Customer',
        'W.O. / S.O. No.',
        'Spec',
        'Grade',
        'IBR/NIBR',
        'Rolling mtr',
        'RM OD (mm)',
        'RM Len Min',
        'RM Len Max',
        'Weight (Kgs)',
        'Nos',
        'Mton',
        'Billet Wt. After WHF',
        'PM OD',
        'PM Wt',
        'PM Kg/Mtr',
        'PM Length',
        'Wt. After WBF',
        'Cust. OD',
        'Cust. WT',
        'Rolling WT',
        'SM Kg/Mtr',
        'SM Length',
        'FE Lg (Mtr)',
        'FE Wg(Kgs)',
        'BE Lg (Mtr)',
        'BE Wg(Kgs)',
        'Effective Wg (Kg)',
        'Effective Length',
        'E/R',
        'Min',
        'Max',
        'Multi',
      ];
      const rows = factoryRows.map((r) => [
        r.srNo,
        r.catg,
        `"${(r.customer || '').replace(/"/g, '""')}"`,
        r.woNo,
        `"${(r.spec || '').replace(/"/g, '""')}"`,
        r.grade,
        r.ibr,
        r.rollingMtr,
        r.rmOd,
        r.rmLenMin,
        r.rmLenMax,
        r.weightKg,
        r.planQtyNos,
        r.planQtyMton,
        r.billetWtWhf,
        r.pmOd,
        r.pmWt,
        r.pmKgMtr,
        r.pmLen,
        r.wtWbf,
        r.custOd,
        r.custWt,
        r.rollingWt,
        r.smKgMtr,
        r.smLen,
        r.feLen,
        r.feWg,
        r.beLen,
        r.beWg,
        r.effectiveWg,
        r.effLen,
        r.reqLenEr,
        r.reqLenMin,
        r.reqLenMax,
        r.mult,
      ]);
      const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `Rolling_Plan_35Col_Schedule_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('35-Column Factory Schedule exported to CSV.');
      return;
    }

    if (!filteredPlans.length) {
      toast.error('No data available to export.');
      return;
    }

    const headers = [
      'Plan No',
      'Rolling Date',
      'Work Order No',
      'Customer',
      'Grade',
      'Finished OD (mm)',
      'Finished WT (mm)',
      'MH OD (mm)',
      'MH WT (mm)',
      'Route Code',
      'Pass Req',
      'Multiple',
      'Planned Pcs',
      'Planned Mtr',
      'Planned MT',
    ];

    const rows = filteredPlans.map((p) => [
      p.plan_no,
      p.planned_rolling_date,
      p.work_order_no,
      `"${(p.customer_name || '').replace(/"/g, '""')}"`,
      p.grade || '',
      p.od ?? '',
      p.wt ?? '',
      p.mh_od ?? '',
      p.mh_wt ?? '',
      p.route_code || '',
      p.pass_required ?? '',
      p.multiple ?? '',
      p.planned_pcs ?? 0,
      p.planned_mtr ?? 0,
      p.planned_mt ?? 0,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Rolling_Plan_Schedule_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Rolling plans exported to CSV.');
  };

  return (
    <div className="space-y-6 print:space-y-2 print:p-0 print:m-0 print:w-full">
      {/* Print Stylesheet for A4 Landscape with Factory-Exact Borders */}
      <style dangerouslySetInnerHTML={{
        __html: `
        @media print {
          @page {
            size: A4 landscape;
            margin: 4mm 5mm 4mm 5mm;
          }
          html, body {
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            font-size: 10px !important;
          }
          main {
            max-width: 100% !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .overflow-x-auto {
            overflow: visible !important;
          }
          .factory-print-sheet {
            display: block !important;
            width: 100% !important;
          }
          .standard-screen-sheet {
            display: none !important;
          }
          table {
            width: 100% !important;
            border-collapse: collapse !important;
          }
          th, td {
            border: 1px solid #000000 !important;
            padding: 2px 3px !important;
          }
          tr {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          .break-inside-avoid {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
        }
      `}} />

      {/* Screen Toolbar / View Mode Switcher */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800 border border-amber-200">
              <Flame className="h-3.5 w-3.5 text-amber-700" />
              HOT MILL-02 PRODUCTION PLANNING
            </span>
            <span className="text-xs font-semibold text-slate-500">Doc: F-PROD-01A (Rev 02)</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 mt-1">
            Round Bar Cutting Plan & Hot Mill Daily Production Plan
          </h1>
          <p className="text-xs text-slate-500">
            Factory shop-floor campaign schedule with Mother Hollow piercing specs, billet dimensions, and child order allocations.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* View Mode Segmented Switcher */}
          <div className="flex items-center rounded-lg bg-slate-100 p-1 border border-slate-200">
            <button
              type="button"
              onClick={() => setViewMode('factory')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                viewMode === 'factory'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              Factory Sheet (Photo Layout)
            </button>
            <button
              type="button"
              onClick={() => setViewMode('standard')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                viewMode === 'standard'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              <TableIcon className="h-3.5 w-3.5" />
              Standard Table
            </button>
          </div>

          <button
            type="button"
            onClick={loadData}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-blue-600' : 'text-slate-500'}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={exportCSV}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition cursor-pointer"
          >
            <Download className="h-3.5 w-3.5 text-slate-500" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-600 transition cursor-pointer"
          >
            <Printer className="h-4 w-4" />
            Print Factory Sheet
          </button>
        </div>
      </div>

      {/* Screen Filters Bar (Hidden on Print) */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs print:hidden">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-6">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Select Mill
            </label>
            <select
              value={millFilter}
              onChange={(e) => setMillFilter(e.target.value as any)}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-indigo-700 focus:border-indigo-500 focus:outline-hidden cursor-pointer"
            >
              <option value="ALL">All Mills</option>
              <option value="Mill-02">Hot Mill-02</option>
              <option value="Mill-03">Hot Mill-03</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Search Order / Plan / Customer
            </label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="e.g. DOM-SHANTA or 06233"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-hidden"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Select Daily Plan / Campaign
            </label>
            <select
              value={selectedCampaignPlan}
              onChange={(e) => setSelectedCampaignPlan(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-hidden"
            >
              <option value="ALL">All Campaign Plans</option>
              {availableCampaigns.map((camp) => (
                <option key={camp} value={camp}>
                  Plan No: {camp}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Process Route
            </label>
            <select
              value={routeFilter}
              onChange={(e) => setRouteFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-hidden"
            >
              <option value="ALL">All Process Routes</option>
              {routes.map((r) => (
                <option key={r.id} value={r.route_code}>
                  {r.route_code} — {r.route_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              From Date
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              To Date
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-hidden"
            />
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. FACTORY CUTTING PLAN VIEW (PHOTO MATCH - MILL 02 FORMAT)               */}
      {/* ========================================================================= */}
      {(viewMode === 'factory' || true) && (
        <div className={`space-y-3 ${viewMode === 'factory' ? 'block' : 'hidden print:block'} factory-print-sheet`}>
          <div className="rounded-xl border-2 border-black bg-white p-3 shadow-md print:border-black print:p-2 print:shadow-none">
            {/* Header: Company Title & Document Name (Exact match from photo) */}
            <div className="flex items-center justify-between border-b-2 border-black pb-2">
              <div className="flex items-center gap-3">
                {/* Rashmi Seamless Logo Representation */}
                <div className="border-2 border-black px-2 py-1 text-center font-black">
                  <div className="text-base tracking-tight text-slate-900 leading-none">RASHMI</div>
                  <div className="text-[8px] tracking-widest text-slate-700 font-bold border-t border-black mt-0.5 pt-0.5">
                    SEAMLESS
                  </div>
                </div>
              </div>

              <div className="text-center flex-1 mx-2">
                <h2 className="text-base sm:text-lg font-black uppercase tracking-wide text-black leading-tight">
                  RASHMI GREEN HYDROGEN STEEL PVT. LTD.
                </h2>
                <div className="text-xs font-bold uppercase tracking-wider text-black">
                  (SEAMLESS DIVISION)
                </div>
                <h3 className="text-xs sm:text-sm font-black uppercase tracking-tight text-black mt-0.5">
                  ROUND BAR CUTTING PLAN & HOT MILL DAILY PRODUCTION PLAN {activeSheetMeta.millName.toLowerCase().includes('03') ? 'MILL - 03' : 'MILL - 02'}
                </h3>
              </div>

              <div className="text-right text-[10px] font-mono text-black">
                <div className="font-bold">{activeSheetMeta.millName.toLowerCase().includes('03') ? 'MILL - 03' : 'MILL - 02'}</div>
                <div>DOC: F-PROD-01A</div>
              </div>
            </div>

            {/* Sub-Header Bar: Production Plan-Hot Mill-02 | Month | Plan No | Issue Date */}
            <div className="grid grid-cols-4 border-b border-black text-xs font-bold text-black py-1 px-1 bg-slate-50 print:bg-white text-center">
              <div className="border-r border-black">{activeSheetMeta.millName}</div>
              <div className="border-r border-black">Month: <span className="font-mono">{activeSheetMeta.monthStr}</span></div>
              <div className="border-r border-black">Plan No :- <span className="font-mono">{activeSheetMeta.planNo}</span></div>
              <div>Issue Date: <span className="font-mono">{activeSheetMeta.issueDate}</span></div>
            </div>

            {/* Note Line: This Plan is Started after Plan No. XX */}
            <div className="border-b border-black py-0.5 px-2 text-xs font-bold italic text-black bg-white">
              This Plan is Started after Plan No. {activeSheetMeta.prevPlanNo}
            </div>

            {/* Main Production Plan Table (35 Columns - Exact 2-Tier Header) */}
            <div className="overflow-x-auto mt-1">
              <table className="w-full text-left text-[11px] border-collapse border border-black font-sans">
                <thead>
                  {/* Tier 1 Header */}
                  <tr className="bg-slate-100 print:bg-white text-center font-bold text-black border-b border-black text-[10px]">
                    <th rowSpan={2} className="border border-black px-1 py-1 w-6">Sr No.</th>
                    <th rowSpan={2} className="border border-black px-1 py-1 w-10">Catg</th>
                    <th rowSpan={2} className="border border-black px-1.5 py-1">Customer</th>
                    <th rowSpan={2} className="border border-black px-1.5 py-1 whitespace-nowrap">W.O. / S.O. No.</th>
                    <th rowSpan={2} className="border border-black px-1 py-1">Spec</th>
                    <th rowSpan={2} className="border border-black px-1 py-1">Grade</th>
                    <th rowSpan={2} className="border border-black px-1 py-1 w-12">IBR/NIBR</th>
                    <th rowSpan={2} className="border border-black px-1.5 py-1 whitespace-nowrap">Rolling mtr</th>
                    
                    {/* Billet Dimensions & Weight (4 cols) */}
                    <th colSpan={4} className="border border-black px-1 py-0.5">Billet Dimensions & Weight</th>
                    
                    {/* Plan qty & WHF (3 cols) */}
                    <th colSpan={3} className="border border-black px-1 py-0.5">Plan Qty & WHF</th>
                    
                    {/* Piercer Mill (4 cols) */}
                    <th colSpan={4} className="border border-black px-1 py-0.5">Piercer Mill</th>
                    
                    {/* Sizing Mill (SM) / Hollow (6 cols) */}
                    <th colSpan={6} className="border border-black px-1 py-0.5">Sizing Mill (SM) / Hot Hollow</th>
                    
                    {/* Thicken Ends & Effective (6 cols) */}
                    <th colSpan={6} className="border border-black px-1 py-0.5">Thicken Ends & Effective</th>
                    
                    {/* Final Length Reqd & Multi (4 cols) */}
                    <th colSpan={4} className="border border-black px-1 py-0.5">Final Length Reqd & Multi</th>
                  </tr>

                  {/* Tier 2 Header (35 Columns Detailed Names) */}
                  <tr className="bg-slate-100 print:bg-white text-center font-bold text-black border-b border-black text-[9px]">
                    {/* 9-12. Billet Dimensions & Weight */}
                    <th className="border border-black px-1 py-0.5 whitespace-nowrap">RM OD (mm)</th>
                    <th className="border border-black px-1 py-0.5 whitespace-nowrap">RM Len Min</th>
                    <th className="border border-black px-1 py-0.5 whitespace-nowrap">RM Len Max</th>
                    <th className="border border-black px-1 py-0.5 whitespace-nowrap">Weight (Kgs)</th>
                    
                    {/* 13-15. Plan qty & WHF */}
                    <th className="border border-black px-1 py-0.5">Nos</th>
                    <th className="border border-black px-1 py-0.5">Mton</th>
                    <th className="border border-black px-1 py-0.5 whitespace-nowrap">Billet Wt. After WHF</th>
                    
                    {/* 16-19. Piercer Mill */}
                    <th className="border border-black px-1 py-0.5">PM OD</th>
                    <th className="border border-black px-1 py-0.5">PM Wt</th>
                    <th className="border border-black px-1 py-0.5">PM Kg/Mtr</th>
                    <th className="border border-black px-1 py-0.5">PM Length</th>
                    
                    {/* 20-25. Sizing Mill (SM) / Hollow */}
                    <th className="border border-black px-1 py-0.5 whitespace-nowrap">Wt. After WBF</th>
                    <th className="border border-black px-1 py-0.5">Cust. OD</th>
                    <th className="border border-black px-1 py-0.5">Cust. WT</th>
                    <th className="border border-black px-1 py-0.5">Rolling WT</th>
                    <th className="border border-black px-1 py-0.5">SM Kg/Mtr</th>
                    <th className="border border-black px-1 py-0.5">SM Length</th>
                    
                    {/* 26-31. Thicken Ends & Effective */}
                    <th className="border border-black px-1 py-0.5 whitespace-nowrap">FE Lg (Mtr)</th>
                    <th className="border border-black px-1 py-0.5 whitespace-nowrap">FE Wg (Kgs)</th>
                    <th className="border border-black px-1 py-0.5 whitespace-nowrap">BE Lg (Mtr)</th>
                    <th className="border border-black px-1 py-0.5 whitespace-nowrap">BE Wg (Kgs)</th>
                    <th className="border border-black px-1 py-0.5 whitespace-nowrap">Effective Wg (Kg)</th>
                    <th className="border border-black px-1 py-0.5 whitespace-nowrap">Effective Length</th>
                    
                    {/* 32-35. Final Length Reqd & Multi */}
                    <th className="border border-black px-1 py-0.5">E/R</th>
                    <th className="border border-black px-1 py-0.5">Min</th>
                    <th className="border border-black px-1 py-0.5">Max</th>
                    <th className="border border-black px-1 py-0.5">Multi</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-black text-black">
                  {loading ? (
                    <tr>
                      <td colSpan={35} className="p-8 text-center text-slate-500 border border-black">
                        <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-blue-600" />
                        Loading factory cutting plan schedule...
                      </td>
                    </tr>
                  ) : factoryRows.length === 0 ? (
                    <tr>
                      <td colSpan={35} className="p-8 text-center text-slate-500 border border-black">
                        No active cutting plan records found. Create or select a plan above.
                      </td>
                    </tr>
                  ) : (
                    factoryRows.map((row) => (
                      <React.Fragment key={`setup-${row.srNo}-${row.woNo}`}>
                        {/* Optional Multi Header row */}
                        {row.mult.includes('Multi') && (
                          <tr className="bg-slate-50 print:bg-white text-center font-bold text-xs border border-black">
                            <td colSpan={35} className="py-0.5 text-center font-black border border-black">
                              <span className="inline-block px-3 py-0.5 rounded bg-slate-200 border border-black font-mono">
                                {row.mult}
                              </span>
                            </td>
                          </tr>
                        )}

                        {/* Main Master Setup Row - All 35 Columns */}
                        <tr className="hover:bg-slate-50/60 print:hover:bg-transparent font-medium border-t border-black text-[10px]">
                          {/* 1. Sr No */}
                          <td className="border border-black px-1 py-1 text-center font-bold">{row.srNo}</td>
                          
                          {/* 2. Catg */}
                          <td className="border border-black px-1 py-1 text-center font-semibold">{row.catg}</td>
                          
                          {/* 3. Customer */}
                          <td className="border border-black px-1.5 py-1 font-semibold max-w-[140px] truncate" title={row.customer}>
                            {row.customer}
                          </td>
                          
                          {/* 4. W.O. / S.O. No */}
                          <td className="border border-black px-1.5 py-1 font-bold font-mono whitespace-nowrap">
                            <div className="flex items-center justify-between gap-1">
                              <span>{row.woNo}</span>
                              {row.plan && (
                                <button
                                  type="button"
                                  onClick={() => openEditSpecs(row.plan!)}
                                  className="print:hidden p-0.5 rounded text-slate-400 hover:text-amber-700 hover:bg-amber-100 transition cursor-pointer"
                                  title="Edit Setup Specs & Tolerances"
                                >
                                  <Edit2 className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          </td>
                          
                          {/* 5. Spec */}
                          <td className="border border-black px-1 py-1 text-center whitespace-nowrap">{row.spec}</td>
                          
                          {/* 6. Grade */}
                          <td className="border border-black px-1 py-1 text-center font-mono whitespace-nowrap">{row.grade}</td>
                          
                          {/* 7. IBR/NIBR */}
                          <td className="border border-black px-1 py-1 text-center font-bold">{row.ibr}</td>
                          
                          {/* 8. Rolling mtr */}
                          <td className="border border-black px-1.5 py-1 text-right font-mono font-black">
                            {fmt(row.rollingMtr, 0)}
                          </td>
                          
                          {/* 9. RM OD (mm) */}
                          <td className="border border-black px-1 py-1 text-right font-mono">{fmt(row.rmOd, 2)}</td>
                          
                          {/* 10. RM Len Min */}
                          <td className="border border-black px-1 py-1 text-right font-mono">{fmt(row.rmLenMin, 3)}</td>
                          
                          {/* 11. RM Len Max */}
                          <td className="border border-black px-1 py-1 text-right font-mono">{fmt(row.rmLenMax, 3)}</td>
                          
                          {/* 12. Weight (Kgs) */}
                          <td className="border border-black px-1 py-1 text-right font-mono font-semibold">{fmt(row.weightKg, 2)}</td>
                          
                          {/* 13. Nos */}
                          <td className="border border-black px-1 py-1 text-right font-mono font-bold">{fmt(row.planQtyNos, 0)}</td>
                          
                          {/* 14. Mton */}
                          <td className="border border-black px-1 py-1 text-right font-mono font-bold">{fmt(row.planQtyMton, 2)}</td>
                          
                          {/* 15. Billet Wt. After WHF */}
                          <td className="border border-black px-1 py-1 text-right font-mono font-semibold">{fmt(row.billetWtWhf, 2)}</td>
                          
                          {/* 16. PM OD */}
                          <td className="border border-black px-1 py-1 text-right font-mono">{fmt(row.pmOd, 1)}</td>
                          
                          {/* 17. PM Wt */}
                          <td className="border border-black px-1 py-1 text-right font-mono">{fmt(row.pmWt, 2)}</td>
                          
                          {/* 18. PM Kg/Mtr */}
                          <td className="border border-black px-1 py-1 text-right font-mono">{fmt(row.pmKgMtr, 3)}</td>
                          
                          {/* 19. PM Length */}
                          <td className="border border-black px-1 py-1 text-right font-mono">{fmt(row.pmLen, 2)}</td>
                          
                          {/* 20. Wt. After WBF */}
                          <td className="border border-black px-1 py-1 text-right font-mono font-semibold">{fmt(row.wtWbf, 2)}</td>
                          
                          {/* 21. Cust. OD */}
                          <td className="border border-black px-1 py-1 text-right font-mono font-bold">{fmt(row.custOd, 2)}</td>
                          
                          {/* 22. Cust. WT */}
                          <td className="border border-black px-1 py-1 text-right font-mono">{fmt(row.custWt, 2)}</td>
                          
                          {/* 23. Rolling WT */}
                          <td className="border border-black px-1 py-1 text-right font-mono">{fmt(row.rollingWt, 2)}</td>
                          
                          {/* 24. SM Kg/Mtr */}
                          <td className="border border-black px-1 py-1 text-right font-mono">{fmt(row.smKgMtr, 3)}</td>
                          
                          {/* 25. SM Length */}
                          <td className="border border-black px-1 py-1 text-right font-mono">{fmt(row.smLen, 2)}</td>
                          
                          {/* 26. FE Lg (Mtr) */}
                          <td className="border border-black px-1 py-1 text-right font-mono">{fmt(row.feLen, 3)}</td>
                          
                          {/* 27. FE Wg(Kgs) */}
                          <td className="border border-black px-1 py-1 text-right font-mono">{fmt(row.feWg, 2)}</td>
                          
                          {/* 28. BE Lg (Mtr) */}
                          <td className="border border-black px-1 py-1 text-right font-mono">{fmt(row.beLen, 3)}</td>
                          
                          {/* 29. BE Wg(Kgs) */}
                          <td className="border border-black px-1 py-1 text-right font-mono">{fmt(row.beWg, 2)}</td>
                          
                          {/* 30. Effective Wg (Kg) */}
                          <td className="border border-black px-1 py-1 text-right font-mono font-semibold">{fmt(row.effectiveWg, 2)}</td>
                          
                          {/* 31. Effective Length */}
                          <td className="border border-black px-1 py-1 text-right font-mono font-semibold">{fmt(row.effLen, 2)}</td>
                          
                          {/* 32. E/R */}
                          <td className="border border-black px-1 py-1 text-center font-bold">{row.reqLenEr}</td>
                          
                          {/* 33. Min */}
                          <td className="border border-black px-1 py-1 text-right font-mono">{fmt(row.reqLenMin, 2)}</td>
                          
                          {/* 34. Max */}
                          <td className="border border-black px-1 py-1 text-right font-mono">{fmt(row.reqLenMax, 2)}</td>
                          
                          {/* 35. Multi */}
                          <td className="border border-black px-1 py-1 text-center font-mono font-bold">{row.mult}</td>
                        </tr>

                        {/* Sub-Rows: Exact child order breakdown lines matching the photo */}
                        {row.childSubRows.map((child, cIdx) => (
                          <tr key={`sub-${row.srNo}-${cIdx}`} className="bg-white text-[9.5px] border-b border-black">
                            <td colSpan={35} className="px-3 py-0.5 border border-black font-mono text-black leading-tight">
                              <span className="font-bold">
                                {child.catg}(finish size-{child.finishSize})(Final len - {child.finalLen})(OA-{child.woNo})(Cust.- {child.customer})(Hollow len-{child.hollowLen})(HTC mtr-{fmt(child.htcMtr, 0)})
                              </span>
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer with Document Control & Official Signature Blocks (From photo) */}
            <div className="mt-3 pt-2 border-t-2 border-black flex flex-col sm:flex-row items-end justify-between text-xs text-black break-inside-avoid">
              <div className="text-[10px] font-mono space-y-0.5">
                <div className="font-bold">F-PROD-01A, EFF. Date: 01.04.2023, Rev.02, Rev Dt. 01.04.2024 / PPC</div>
                <div className="text-slate-600">Confidential Shop Floor Copy · Rashmi Green Hydrogen Steel Pvt. Ltd.</div>
              </div>

              {/* Signatures Area */}
              <div className="flex items-center gap-12 my-2 sm:my-0">
                <div className="text-center">
                  <div className="h-8 border-b border-dashed border-black w-28 mb-1"></div>
                  <span className="text-[10px] font-bold block">Prepared by (PPC)</span>
                </div>
                <div className="text-center">
                  <div className="h-8 border-b border-dashed border-black w-32 mb-1"></div>
                  <span className="text-[10px] font-bold block">Checked by (Hot Mill Incharge)</span>
                </div>
              </div>

              <div className="text-[10px] font-mono font-bold">
                Page 1 of 1
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. STANDARD SCHEDULE TABLE VIEW (ORIGINAL SUMMARY & LIST)                 */}
      {/* ========================================================================= */}
      {viewMode === 'standard' && (
        <div className="space-y-4 standard-screen-sheet">
          {/* Summary Metric KPI Badges */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl bg-slate-50 p-3 border border-slate-200">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Total Plans Issued
              </span>
              <span className="text-lg font-black text-slate-900 font-mono">{summary.count}</span>
              <span className="text-[10px] text-indigo-600 block">({summary.masterCount} Master Campaigns)</span>
            </div>

            <div className="rounded-xl bg-indigo-50/50 p-3 border-2 border-indigo-200 shadow-2xs">
              <span className="block text-[10px] font-black uppercase tracking-wider text-indigo-900">
                Total Planned Pieces (PCS) ★
              </span>
              <div className="mt-1">
                <span className="inline-block px-2.5 py-0.5 rounded-md text-base sm:text-lg font-black font-mono bg-indigo-100 text-indigo-950 border border-indigo-300">
                  {fmt(summary.totalPcs, 0)} PCS
                </span>
              </div>
              <span className="text-[10px] text-indigo-700 block font-semibold mt-1">
                Billets / Tubes Allocated
              </span>
            </div>

            <div className="rounded-xl bg-emerald-50/50 p-3 border-2 border-emerald-200 shadow-2xs">
              <span className="block text-[10px] font-black uppercase tracking-wider text-emerald-900">
                Total Billet Tonnage (MT) ★
              </span>
              <div className="mt-1">
                <span className="inline-block px-2.5 py-0.5 rounded-md text-base sm:text-lg font-black font-mono bg-emerald-100 text-emerald-950 border border-emerald-300">
                  {fmt(summary.totalMt)} MT
                </span>
              </div>
              <span className="text-[10px] text-emerald-700 block font-semibold mt-1">
                Gross Rolling Campaign Mass
              </span>
            </div>

            <div className="rounded-xl bg-slate-50 p-3 border border-slate-200">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Total Planned Meters
              </span>
              <span className="text-lg font-black text-blue-700 font-mono">{fmt(summary.totalMtr)} MTR</span>
              <span className="text-[10px] text-slate-500 block mt-1">Linear rolling schedule</span>
            </div>
          </div>

          {/* Table */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-100/90 font-bold uppercase tracking-wider text-slate-700">
                    <th className="px-3 py-2.5 whitespace-nowrap">Plan No</th>
                    <th className="px-3 py-2.5 whitespace-nowrap">Rolling Date</th>
                    <th className="px-3 py-2.5 whitespace-nowrap">Work Order #</th>
                    <th className="px-3 py-2.5">Customer & Grade</th>
                    <th className="px-3 py-2.5 whitespace-nowrap font-bold">Mother Hollow Size</th>
                    <th className="px-3 py-2.5 whitespace-nowrap font-bold">Final Size</th>
                    <th className="px-3 py-2.5 whitespace-nowrap">Route</th>
                    <th className="px-3 py-2.5 text-right whitespace-nowrap font-black text-indigo-950 bg-indigo-100/90">
                      PLANNED PCS ★
                    </th>
                    <th className="px-3 py-2.5 text-right whitespace-nowrap font-black text-emerald-950 bg-emerald-100/90">
                      TONNAGE (MT) ★
                    </th>
                    <th className="px-3 py-2.5 text-right whitespace-nowrap">Meters</th>
                    <th className="px-3 py-2.5 text-center whitespace-nowrap">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredPlans.map((p) => {
                    let parsedStatus: any = {};
                    try {
                      parsedStatus = typeof p.status === 'string' ? JSON.parse(p.status) : p.status;
                    } catch { }

                    const isMaster = !!parsedStatus?.is_master;
                    const isChild = !!parsedStatus?.is_child;
                    const childOrders: any[] = parsedStatus?.child_work_orders || [];
                    const isExpanded = expandedMasters[p.id];

                    return (
                      <React.Fragment key={p.id}>
                        <tr className={`transition-colors ${isMaster ? 'bg-indigo-50/30' : isChild ? 'bg-slate-50/40' : 'hover:bg-slate-50/50'}`}>
                          <td className="px-3 py-2 font-mono font-bold text-slate-900 whitespace-nowrap">
                            {p.plan_no}
                            {isMaster && (
                              <span className="ml-1.5 inline-flex items-center rounded-full bg-indigo-100 text-indigo-800 px-1.5 py-0.2 text-[10px] font-bold">
                                <Crown className="h-2.5 w-2.5 mr-0.5" />
                                Master
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 font-mono text-slate-600 whitespace-nowrap">
                            {p.planned_rolling_date}
                          </td>
                          <td className="px-3 py-2 font-bold text-slate-900 whitespace-nowrap">
                            {p.work_order_no}
                            {isChild && (
                              <span className="block text-[10px] text-teal-700 font-medium">
                                Child of {parsedStatus.master_wo_no || 'Master'}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 max-w-[170px] truncate">
                            <div className="font-semibold text-slate-800">{p.customer_name || 'Standard Stock'}</div>
                            <div className="text-[11px] font-mono text-slate-500">{p.grade}</div>
                          </td>
                          <td className="px-3 py-2 font-mono font-semibold text-slate-800 whitespace-nowrap">
                            {p.mh_od && p.mh_wt ? (
                              <span>
                                {fmt(p.mh_od)} × {fmt(p.mh_wt)} mm
                                <span className="text-[10px] text-slate-500 block">
                                  L: {fmt(p.mh_l1)} - {fmt(p.mh_l2)} m
                                </span>
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 font-mono text-slate-700 whitespace-nowrap">
                            <div className="font-bold text-slate-800">
                              {p.od && p.wt ? `${fmt(p.od)} × ${fmt(p.wt)} mm` : <span className="text-slate-400">—</span>}
                            </div>
                            {(() => {
                              const lenStr = formatFinalSizeLength(p);
                              return lenStr ? <span className="text-[10px] text-slate-500 block">{lenStr}</span> : null;
                            })()}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono font-semibold text-slate-700">
                              {p.route_code}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right font-mono bg-indigo-50/60 border-l border-indigo-200">
                            <span className="inline-block px-2 py-0.5 rounded-md font-black text-xs sm:text-sm text-indigo-950 bg-indigo-100/90 border border-indigo-300">
                              {fmt(p.planned_pcs, 0)}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right font-mono bg-emerald-50/60 border-r border-emerald-200">
                            <span className="inline-block px-2 py-0.5 rounded-md font-black text-xs sm:text-sm text-emerald-950 bg-emerald-100/90 border border-emerald-300">
                              {fmt(p.planned_mt)}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-blue-700">
                            {fmt(p.planned_mtr)}
                          </td>
                          <td className="px-3 py-2 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => openEditSpecs(p)}
                                className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-100 transition cursor-pointer inline-flex items-center gap-1"
                                title="Edit Setup Specs & Tolerances"
                              >
                                <Edit2 className="h-3 w-3" />
                                Edit Specs
                              </button>
                              <button
                                type="button"
                                onClick={() => setSelectedPlanForSlip(p)}
                                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-blue-600 hover:bg-blue-50 transition cursor-pointer"
                              >
                                Issue Slip
                              </button>
                              {isMaster && childOrders.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => toggleExpand(p.id)}
                                  className="rounded-md border border-indigo-200 bg-indigo-50 px-1.5 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100 transition cursor-pointer inline-flex items-center gap-0.5"
                                >
                                  {childOrders.length} Child
                                  {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>

                        {/* Expandable Child Work Orders for Master Campaign */}
                        {isMaster && isExpanded && childOrders.length > 0 && (
                          <tr className="bg-indigo-50/40">
                            <td colSpan={11} className="px-6 py-3">
                              <div className="rounded-lg border border-indigo-200 bg-white p-3 shadow-2xs">
                                <div className="text-xs font-bold text-indigo-900 mb-2 flex items-center gap-1.5">
                                  <Link2 className="h-3.5 w-3.5 text-indigo-600" />
                                  Linked Child Work Orders in Campaign
                                </div>
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-slate-500 font-semibold border-b border-indigo-100">
                                      <th className="py-1 text-left">Child WO #</th>
                                      <th className="py-1 text-left">Customer</th>
                                      <th className="py-1 text-left">Grade</th>
                                      <th className="py-1 text-left">Final Size</th>
                                      <th className="py-1 text-right font-black text-indigo-900">Planned Pcs ★</th>
                                      <th className="py-1 text-right font-black text-emerald-900">Planned MT ★</th>
                                      <th className="py-1 text-right">Planned Mtr</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-indigo-50 font-mono">
                                    {childOrders.map((c: any, idx: number) => (
                                      <tr key={idx} className="hover:bg-indigo-50/30">
                                        <td className="py-1 text-slate-800 font-bold">{c.work_order_no}</td>
                                        <td className="py-1 text-slate-600 font-sans">{c.customer_name || '—'}</td>
                                        <td className="py-1 text-slate-600">{c.grade || p.grade}</td>
                                        <td className="py-1 text-slate-700">
                                          {fmt(c.size_od ?? p.od)} × {fmt(c.size_wt ?? p.wt)} mm
                                        </td>
                                        <td className="py-1 text-right font-black text-indigo-950">
                                          {fmt(c.planned_pcs ?? 0, 0)}
                                        </td>
                                        <td className="py-1 text-right font-black text-emerald-950">
                                          {fmt(c.planned_mt ?? 0)}
                                        </td>
                                        <td className="py-1 text-right font-bold text-slate-700">
                                          {fmt(c.planned_mtr ?? 0)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Individual Plan Issue Slip Modal */}
      {selectedPlanForSlip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 print:hidden">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-amber-100 text-amber-800 px-2 py-0.5 text-xs font-bold">
                  HOT ROLLING SLIP
                </span>
                <span className="font-mono font-bold text-slate-900">{selectedPlanForSlip.plan_no}</span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPlanForSlip(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs">
              <div className="flex items-start justify-between border-b border-slate-200 pb-3">
                <div>
                  <h4 className="font-black text-sm uppercase text-slate-900">HOT ROLLING MILL ISSUE SLIP</h4>
                  <div className="text-slate-500">Rashmi Green Hydrogen Steel Pvt. Ltd. · Seamless Division</div>
                </div>
                <div className="text-right font-mono">
                  <div className="font-bold text-slate-900">PLAN: {selectedPlanForSlip.plan_no}</div>
                  <div className="text-slate-500">Date: {selectedPlanForSlip.planned_rolling_date}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 border border-slate-200 rounded-lg p-3 bg-slate-50">
                <div>
                  <span className="text-slate-500 block">Work Order Number:</span>
                  <span className="font-bold text-slate-900 text-sm font-mono">{selectedPlanForSlip.work_order_no}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Customer Name:</span>
                  <span className="font-bold text-slate-800">{selectedPlanForSlip.customer_name || 'Standard Stock'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Material Grade / Spec:</span>
                  <span className="font-bold text-slate-900 font-mono">{selectedPlanForSlip.grade || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Target Process Route:</span>
                  <span className="font-bold text-slate-900 font-mono">{selectedPlanForSlip.route_code}</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 rounded-lg border border-slate-200 p-3 bg-slate-50 font-mono text-center">
                <div className="rounded-md bg-indigo-50 border border-indigo-200 p-2">
                  <span className="text-indigo-900 text-[10px] block uppercase font-bold">Planned Pcs ★</span>
                  <span className="text-lg font-black text-indigo-950">{fmt(selectedPlanForSlip.planned_pcs, 0)} PCS</span>
                </div>
                <div className="rounded-md bg-emerald-50 border border-emerald-200 p-2">
                  <span className="text-emerald-900 text-[10px] block uppercase font-bold">Planned Weight (MT) ★</span>
                  <span className="text-lg font-black text-emerald-950">{fmt(selectedPlanForSlip.planned_mt)} MT</span>
                </div>
                <div className="rounded-md bg-white border border-slate-200 p-2">
                  <span className="text-slate-500 text-[10px] block uppercase font-bold">Planned Length</span>
                  <span className="text-base font-black text-blue-700">{fmt(selectedPlanForSlip.planned_mtr)} M</span>
                </div>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setSelectedPlanForSlip(null)}
                className="rounded-lg border border-slate-300 px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-blue-500 transition cursor-pointer"
              >
                <Printer className="h-3.5 w-3.5" />
                Print Slip
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Setup Specs & Tolerances Modal */}
      {editingPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto print:hidden">
          <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-amber-100 text-amber-900 px-2 py-0.5 text-xs font-bold font-mono">
                  EDIT SPECS & TOLERANCES
                </span>
                <span className="font-mono font-bold text-slate-900">
                  Plan #{editingPlan.plan_no} (WO: {editingPlan.work_order_no})
                </span>
              </div>
              <button
                type="button"
                onClick={() => setEditingPlan(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Live Calculation Preview Hook */}
            {(() => {
              const parsedRMin = Number(editRmLenMin) > 20 ? Number((Number(editRmLenMin) / 1000).toFixed(3)) : (Number(editRmLenMin) || 2.03);
              const rmOdNum = Number(editRmOd) || 63.0;
              const liveWeightKg = (rmOdNum * rmOdNum) * 0.006165 * (parsedRMin * 1000) / 1000;
              const liveBilletWhf = liveWeightKg * 0.985;
              const pmOdNum = Number(editPmOd) || 66.0;
              const pmWtNum = Number(editPmWt) || 6.0;
              const livePmKgMtr = (pmOdNum - pmWtNum) * pmWtNum * 0.0246615;
              const livePmLen = livePmKgMtr > 0 ? liveBilletWhf / livePmKgMtr : 0;
              const custOdNum = Number(editCustOd) || 47.0;
              const rollingWtNum = Number(editRollingWt) || 6.25;
              const liveSmKgMtr = (custOdNum - rollingWtNum) * rollingWtNum * 0.0246615;
              const liveSmLen = liveSmKgMtr > 0 ? liveBilletWhf / liveSmKgMtr : 0;
              const feLenNum = Number(editFeLen) || 0;
              const beLenNum = Number(editBeLen) || 0;
              const liveFeWg = feLenNum * liveSmKgMtr * 1.07;
              const liveBeWg = beLenNum * liveSmKgMtr * 1.07;
              const liveEffectiveWg = liveBilletWhf - (liveFeWg + liveBeWg);
              const liveEffLen = liveSmKgMtr > 0 ? liveEffectiveWg / liveSmKgMtr : 0;

              return (
                <div className="space-y-4">
                  {/* Setup Specifications (35-Column Standards) */}
                  <div className="bg-amber-50/50 rounded-xl p-4 border border-amber-200/80 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wide flex items-center gap-1.5">
                        <Flame className="h-4 w-4 text-amber-600" />
                        <span>Setup Specifications (35-Column Standards)</span>
                      </h4>
                      <span className="text-[11px] text-amber-800 font-mono font-semibold">Mill-02 / F-PROD-01A</span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Catg</label>
                        <select
                          value={editCatg}
                          onChange={(e) => setEditCatg(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono font-medium focus:border-indigo-500 focus:outline-hidden"
                        >
                          <option value="CDS">CDS</option>
                          <option value="HRS">HRS</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Spec</label>
                        <input
                          type="text"
                          value={editSpec}
                          onChange={(e) => setEditSpec(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono font-medium focus:border-indigo-500 focus:outline-hidden"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Grade</label>
                        <input
                          type="text"
                          value={editGrade}
                          onChange={(e) => setEditGrade(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono font-medium focus:border-indigo-500 focus:outline-hidden"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">IBR / NIBR</label>
                        <select
                          value={editIbrStatus}
                          onChange={(e) => setEditIbrStatus(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono font-medium focus:border-indigo-500 focus:outline-hidden"
                        >
                          <option value="IBR">IBR</option>
                          <option value="NIBR">NIBR</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">RM OD (mm)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={editRmOd}
                          onChange={(e) => setEditRmOd(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono font-medium focus:border-indigo-500 focus:outline-hidden"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">RM Len Min (m)</label>
                        <input
                          type="number"
                          step="0.001"
                          value={editRmLenMin}
                          onChange={(e) => setEditRmLenMin(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono font-medium focus:border-indigo-500 focus:outline-hidden"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">RM Len Max (m)</label>
                        <input
                          type="number"
                          step="0.001"
                          value={editRmLenMax}
                          onChange={(e) => setEditRmLenMax(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono font-medium focus:border-indigo-500 focus:outline-hidden"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Planned Pcs</label>
                        <input
                          type="number"
                          value={editPlannedPcs}
                          onChange={(e) => setEditPlannedPcs(e.target.value)}
                          className="w-full rounded-lg border border-indigo-300 bg-white px-2.5 py-1.5 text-xs font-mono font-bold text-indigo-900 focus:border-indigo-500 focus:outline-hidden"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">PM OD (mm)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={editPmOd}
                          onChange={(e) => setEditPmOd(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono font-medium focus:border-indigo-500 focus:outline-hidden"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">PM WT (mm)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={editPmWt}
                          onChange={(e) => setEditPmWt(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono font-medium focus:border-indigo-500 focus:outline-hidden"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Cust OD (mm)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={editCustOd}
                          onChange={(e) => setEditCustOd(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono font-medium focus:border-indigo-500 focus:outline-hidden"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Cust WT (mm)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={editCustWt}
                          onChange={(e) => setEditCustWt(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono font-medium focus:border-indigo-500 focus:outline-hidden"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Rolling WT (mm)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={editRollingWt}
                          onChange={(e) => setEditRollingWt(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono font-medium focus:border-indigo-500 focus:outline-hidden"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">FE Lg (m)</label>
                        <input
                          type="number"
                          step="0.001"
                          value={editFeLen}
                          onChange={(e) => setEditFeLen(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono font-medium focus:border-indigo-500 focus:outline-hidden"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">BE Lg (m)</label>
                        <input
                          type="number"
                          step="0.001"
                          value={editBeLen}
                          onChange={(e) => setEditBeLen(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono font-medium focus:border-indigo-500 focus:outline-hidden"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">E/R (EL / RL)</label>
                        <select
                          value={editReqLenEr}
                          onChange={(e) => setEditReqLenEr(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono font-medium focus:border-indigo-500 focus:outline-hidden"
                        >
                          <option value="EL">EL (Exact Length)</option>
                          <option value="RL">RL (Random Length)</option>
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-1.5 col-span-2">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">Min Len (m)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={editReqLenMin}
                            onChange={(e) => setEditReqLenMin(e.target.value)}
                            className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono font-medium focus:border-indigo-500 focus:outline-hidden"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">Max Len (m)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={editReqLenMax}
                            onChange={(e) => setEditReqLenMax(e.target.value)}
                            className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono font-medium focus:border-indigo-500 focus:outline-hidden"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Real-Time Calculation Preview Badge */}
                    <div className="rounded-lg bg-indigo-50/80 border border-indigo-200 p-2.5 grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs">
                      <div>
                        <span className="block text-[10px] text-slate-500 font-bold uppercase">Billet Weight</span>
                        <span className="font-mono font-black text-indigo-950">{fmt(liveWeightKg, 2)} kg</span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-500 font-bold uppercase">Wt. After WHF</span>
                        <span className="font-mono font-black text-indigo-950">{fmt(liveBilletWhf, 2)} kg</span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-500 font-bold uppercase">PM (Kg/m • Len)</span>
                        <span className="font-mono font-black text-indigo-950">{fmt(livePmKgMtr, 2)} • {fmt(livePmLen, 2)}m</span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-500 font-bold uppercase">SM (Kg/m • Len)</span>
                        <span className="font-mono font-black text-indigo-950">{fmt(liveSmKgMtr, 2)} • {fmt(liveSmLen, 2)}m</span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-500 font-bold uppercase">Effective Len</span>
                        <span className="font-mono font-black text-emerald-800">{fmt(liveEffLen, 2)} m</span>
                      </div>
                    </div>
                  </div>

                  {/* Tolerances & Process Yield */}
                  <div className="bg-slate-50/80 rounded-xl p-4 border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4 text-teal-600" />
                        <span>Tolerances & Process Yield</span>
                      </h4>
                      <span className="text-[11px] text-slate-500 font-medium">Quality Parameters</span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">OD Min (mm)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={editTolOdMin}
                          onChange={(e) => setEditTolOdMin(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono font-medium focus:border-indigo-500 focus:outline-hidden"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">OD Max (mm)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={editTolOdMax}
                          onChange={(e) => setEditTolOdMax(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono font-medium focus:border-indigo-500 focus:outline-hidden"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">WT Min (mm)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={editTolWtMin}
                          onChange={(e) => setEditTolWtMin(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono font-medium focus:border-indigo-500 focus:outline-hidden"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">WT Max (mm)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={editTolWtMax}
                          onChange={(e) => setEditTolWtMax(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono font-medium focus:border-indigo-500 focus:outline-hidden"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Process Yield (%)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={editProcessYieldPct}
                          onChange={(e) => setEditProcessYieldPct(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono font-medium focus:border-indigo-500 focus:outline-hidden"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="mt-5 flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setEditingPlan(null)}
                disabled={editSaving}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveReportSpecs}
                disabled={editSaving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-5 py-2 text-xs font-bold text-white hover:bg-indigo-500 transition cursor-pointer disabled:opacity-50"
              >
                {editSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {editSaving ? 'Saving Changes...' : 'Save Specs & Tolerances'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
