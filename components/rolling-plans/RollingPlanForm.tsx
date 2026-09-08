'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { CreateMultiWoRollingPlanPayload } from '@/app/api/rolling-plans/route';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Edit2,
  Trash2,
  RefreshCw,
  Search,
  Eye,
  Lock,
  Plus,
  X,
  Crown,
  Link2,
  ChevronDown,
  ChevronUp,
  Layers,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Info,
  Flame,
  Sliders,
  FileText,
} from 'lucide-react';
import { usePermissions, getFormAccess } from '@/lib/permissions';
import FormAccessBanner from '@/components/common/FormAccessBanner';

export type WO = {
  id: string;
  work_order_no: string;
  customer_name: string | null;
  grade: string | null;
  specification?: string | null;
  size_od: number | null;
  size_wt: number | null;
  l1: number | null;
  l2: number | null;
  ordered_qty: number;
  uom: 'Pcs' | 'Mtrs';
  balance_qty_mtr: number;
};

export type Route = {
  id: string;
  route_code: string;
  route_name: string;
  material_category: string;
};

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

export interface ChildOrderEntry {
  id: string;
  wo: WO;
  plannedPcs: string;
  availableMtr: number;
}

export interface WorkOrderGroup {
  id: string;
  wo: WO;
  plannedPcs: string;
  availableMtr: number;
  children: ChildOrderEntry[];

  // Process Route & Setup Specifications & Factory Tolerances
  routeId: string;
  catg: string; // 'CDS' | 'HFS'
  spec: string;
  grade: string;
  ibrStatus: string; // 'IBR' | 'NIBR'
  rmOd: string;
  rmLenMin: string;
  rmLenMax: string;
  pmOd: string;
  pmWt: string;
  pmLen: string;
  custOd: string;
  custWt: string;
  rollingWt: string;
  smLen: string;
  feLen: string;
  beLen: string;
  effLen: string;
  reqLenEr: string;
  reqLenMin: string;
  reqLenMax: string;
  multipleStr: string;
  tolOdMin: string;
  tolOdMax: string;
  tolWtMin: string;
  tolWtMax: string;
  processYieldPct: string;

  isSpecsExpanded?: boolean;
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

/** Mother Hollow dimension inputs used for edit-modal live calculations */
export interface HollowDimensions {
  od: number | string | null | undefined;
  wt: number | string | null | undefined;
  l1: number | string | null | undefined;
  l2: number | string | null | undefined;
}

/** Compute planned MTR and MT from hollow specs + planned pcs */
export function calcHollowMetrics(
  wo: Pick<WO, 'size_od' | 'size_wt' | 'l1' | 'l2'>,
  pcs: number,
  hollow: HollowDimensions
): { avg: number; mtr: number; mt: number } {
  const hl1 = Number(hollow.l1 || wo.l1 || 0);
  const hl2 = Number(hollow.l2 || wo.l2 || 0);
  const avg = hl1 > 0 && hl2 > 0 ? (hl1 + hl2) / 2 : hl1 > 0 ? hl1 : hl2 > 0 ? hl2 : 6.0;
  const mtr = Number((pcs * avg).toFixed(2));
  const hod = Number(hollow.od || wo.size_od || 0);
  const hwt = Number(hollow.wt || wo.size_wt || 0);
  const mt =
    hod > 0 && hwt > 0 && hod > hwt
      ? Number(((hod - hwt) * hwt * 0.0246615 * 0.001 * mtr).toFixed(3))
      : 0;
  return { avg, mtr, mt };
}

export interface ComputedGroupSpecs {
  srNo: number;
  catg: string;
  customer: string;
  woNo: string;
  spec: string;
  grade: string;
  ibr: string;
  rollingMtr: number;
  rmOd: number;
  rmLenMin: number;
  rmLenMax: number;
  weightKg: number;
  nos: number;
  mton: number;
  billetWtWhf: number;
  pmOd: number;
  pmWt: number;
  pmKgMtr: number;
  pmLen: number;
  wtWbf: number;
  custOd: number;
  custWt: number;
  rollingWt: number;
  smKgMtr: number;
  smLen: number;
  feLen: number;
  feWg: number;
  beLen: number;
  beWg: number;
  effectiveWg: number;
  effectiveLen: number;
  erStatus: 'EL' | 'RL';
  minLen: number;
  maxLen: number;
  multi: string;
}

export function computeGroupSpecs(
  group: WorkOrderGroup,
  totalRollingMtr: number,
  srIndex = 1,
  totalPlannedPcs = 0
): ComputedGroupSpecs {
  const rmOd = Number(group.rmOd) || 0;
  const rawRmLenMin = Number(group.rmLenMin) || 0;
  const rawRmLenMax = Number(group.rmLenMax) || 0;

  // Billet cutting lengths in steel mills are often input in mm (e.g. 2030, 1890, 1770) or meters (2.030, 1.890).
  // Automatically normalize values > 20 to meters to prevent astronomical weight and length computations.
  const rmLenMin = rawRmLenMin > 20 ? Number((rawRmLenMin / 1000).toFixed(3)) : rawRmLenMin;
  const rmLenMax = rawRmLenMax > 20 ? Number((rawRmLenMax / 1000).toFixed(3)) : (rawRmLenMax || rmLenMin);

  // 12. Weight (Kgs) = (((RM OD)*(RM OD)*3.14*0.007856/4)*RM Len Min)
  const weightKg = Number((((rmOd * rmOd * 3.14 * 0.007856) / 4) * rmLenMin).toFixed(3));

  // 21-23. Cust. OD, Cust. WT, Rolling WT = Cust. WT
  const custOd = Number(group.custOd) || Number(group.wo.size_od) || 0;
  const custWt = Number(group.custWt) || Number(group.wo.size_wt) || 0;
  const rollingWt = Number(group.rollingWt) || custWt;

  // 15. Billet Wt. After WHF = Weight (Kgs) * 0.97
  const billetWtWhf = Number((weightKg * 0.97).toFixed(3));

  // 16. PM OD: Use user input if provided, otherwise default to 66.0 (for 63mm RM OD) or rmOd + 3
  const userPmOd = Number(group.pmOd) || 0;
  const pmOd = userPmOd > 0 ? userPmOd : (rmOd === 63 ? 66.0 : (rmOd > 0 ? Number((rmOd + 3).toFixed(2)) : 66.0));

  // 17. PM Wt: Use user input if provided, otherwise default to Rolling WT - 0.25
  const userPmWt = Number(group.pmWt) || 0;
  const pmWt = userPmWt > 0 ? userPmWt : (rollingWt > 0.25 ? Number((rollingWt - 0.25).toFixed(2)) : 6.00);

  // 18. PM Kg/Mtr = (PM OD - PM WT) * PM WT * 0.02467
  const pmKgMtr =
    pmOd > pmWt && pmWt > 0
      ? Number(((pmOd - pmWt) * pmWt * 0.02467).toFixed(3))
      : 0;

  // 19. PM Length = Billet Wt. After WHF / PM KG/MTR
  const pmLen = pmKgMtr > 0 ? Number((billetWtWhf / pmKgMtr).toFixed(2)) : 0;

  // 20. Wt. After WBF = Weight (Kgs) * 0.97
  const wtWbf = billetWtWhf;

  // 24. SM Kg/Mtr = (Cust OD - Cust WT) * Cust WT * 0.02467
  const smKgMtr =
    custOd > custWt && custWt > 0
      ? Number(((custOd - custWt) * custWt * 0.02467).toFixed(3))
      : 0;

  // 25. SM Length = Wt. After WBF / SM Kg/Mtr
  const smLen = smKgMtr > 0 ? Number((wtWbf / smKgMtr).toFixed(2)) : 0;

  // 26-29. FE & BE Lengths & Weights
  const feLen = Number(group.feLen) || 0;
  const feWg = Number((smKgMtr * feLen).toFixed(3));
  const beLen = Number(group.beLen) || 0;
  const beWg = Number((smKgMtr * beLen).toFixed(3));

  // 30. Effective Wg (Kg) = Wt. After WBF - FE Wg - BE Wg
  const effectiveWg = Number(Math.max(0, wtWbf - feWg - beWg).toFixed(3));

  // 31. Effective Length = Effective Wg / SM Kg/Mtr
  const effectiveLen = smKgMtr > 0 ? Number((effectiveWg / smKgMtr).toFixed(2)) : smLen;

  // 32-34. Min, Max, E/R
  const minLen = Number(group.reqLenMin) || Number(group.wo.l1) || 0;
  const maxLen = Number(group.reqLenMax) || Number(group.wo.l2) || minLen;
  const erStatus: 'EL' | 'RL' = minLen > 0 && minLen === maxLen ? 'EL' : 'RL';

  // 13. Nos = Total Planned Pcs if entered, else Rolling MTR / Effective Length
  const nos =
    totalPlannedPcs > 0
      ? totalPlannedPcs
      : (totalRollingMtr > 0 && effectiveLen > 0 ? Math.ceil(totalRollingMtr / effectiveLen) : 0);

  // 14. Mton = (Weight (Kgs) * Nos) / 1000
  const mton = Number(((weightKg * nos) / 1000).toFixed(2));

  return {
    srNo: srIndex,
    catg: group.catg || 'CDS',
    customer: group.wo.customer_name || 'Standard Stock',
    woNo: group.wo.work_order_no,
    spec: group.spec || group.wo.specification || group.wo.grade || '—',
    grade: group.grade || group.wo.grade || '—',
    ibr: group.ibrStatus || 'IBR',
    rollingMtr: totalRollingMtr,
    rmOd,
    rmLenMin,
    rmLenMax,
    weightKg,
    nos,
    mton,
    billetWtWhf,
    pmOd,
    pmWt,
    pmKgMtr,
    pmLen,
    wtWbf,
    custOd,
    custWt,
    rollingWt,
    smKgMtr,
    smLen,
    feLen,
    feWg,
    beLen,
    beWg,
    effectiveWg,
    effectiveLen,
    erStatus,
    minLen,
    maxLen,
    multi: group.multipleStr || '1',
  };
}

export function createDefaultGroup(
  wo: WO,
  availMtr: number,
  defaultRouteId = '',
  defaultRoute?: Route
): WorkOrderGroup {
  const lAvg = wo.l1 && wo.l2 ? (wo.l1 + wo.l2) / 2 : wo.l1 || 6;
  const initPcs = availMtr > 0 ? Math.max(1, Math.floor(availMtr / lAvg)) : 100;
  const custOdNum = Number(wo.size_od || 47.0);
  const custWtNum = Number(wo.size_wt || 5.75);
  const smLenNum = Number(wo.l1 || 7.67);

  const pmOdNum = Number((custOdNum * 1.4).toFixed(1));
  const pmWtNum = Number((custWtNum * 0.95).toFixed(2));

  // Determine IBR status: auto-detect from spec or grade
  const specText = `${wo.specification || ''} ${wo.grade || ''}`.toUpperCase();
  const autoIbr = specText.includes('IBR') ? 'IBR' : 'NIBR';

  const catgFromRoute = defaultRoute?.material_category || 'CDS';

  return {
    id: `grp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    wo,
    plannedPcs: String(initPcs),
    availableMtr: availMtr,
    children: [],

    routeId: defaultRouteId,
    catg: catgFromRoute,
    spec: wo.specification || wo.grade || 'ASME SA210 Gr.A1',
    grade: wo.grade || 'SAE 1018',
    ibrStatus: autoIbr,
    rmOd: '63.00',
    rmLenMin: '1.890',
    rmLenMax: '1.895',
    pmOd: String(pmOdNum > 0 ? pmOdNum : '66.0'),
    pmWt: String(pmWtNum > 0 ? pmWtNum : '5.50'),
    pmLen: '5.41',
    custOd: String(custOdNum.toFixed(2)),
    custWt: String(custWtNum.toFixed(2)),
    rollingWt: String(custWtNum.toFixed(2)),
    smLen: String(smLenNum.toFixed(2)),
    feLen: '0.000',
    beLen: '0.000',
    effLen: String(smLenNum.toFixed(2)),
    reqLenEr: wo.l1 && wo.l2 && wo.l1 === wo.l2 ? 'EL' : 'RL',
    reqLenMin: wo.l1 ? String(Number(wo.l1).toFixed(2)) : '7.55',
    reqLenMax: wo.l2 ? String(Number(wo.l2).toFixed(2)) : '7.55',
    multipleStr: '1',
    tolOdMin: String((custOdNum - 0.4).toFixed(2)),
    tolOdMax: String((custOdNum + 0.4).toFixed(2)),
    tolWtMin: String((custWtNum * 0.92).toFixed(2)),
    tolWtMax: String((custWtNum * 1.1).toFixed(2)),
    processYieldPct: '95.50',
    isSpecsExpanded: false,
  };
}

export default function RollingPlanForm() {
  const searchParams = useSearchParams();
  const initialWoId = searchParams?.get('wo') || '';

  const [wos, setWos] = useState<WO[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);

  // Setup groups for the campaign
  const [groups, setGroups] = useState<WorkOrderGroup[]>([]);
  const [woSearchQuery, setWoSearchQuery] = useState('');
  const [addWoSelectValue, setAddWoSelectValue] = useState('');

  // Child Work Order Picker Modal State
  const [activeChildTargetGroupId, setActiveChildTargetGroupId] = useState<string | null>(null);
  const [childModalSearch, setChildModalSearch] = useState('');
  const [childModalGradeFilter, setChildModalGradeFilter] = useState('ALL');

  // Multi-Work Order Selection Dialog State (for adding parent setup groups)
  const [isMultiPickerOpen, setIsMultiPickerOpen] = useState(false);
  const [modalSearch, setModalSearch] = useState('');
  const [modalGradeFilter, setModalGradeFilter] = useState('ALL');
  const [modalSelectedIds, setModalSelectedIds] = useState<string[]>([]);

  // Common campaign parameters
  const [route, setRoute] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);

  // Factory Production Plan (Mill-02 or Mill-03) Sheet Parameters (From Photo)
  const [selectedMill, setSelectedMill] = useState<'Mill-02' | 'Mill-03'>('Mill-02');
  const [millName, setMillName] = useState('Production Plan-Hot Mill-02');

  const formatMonthToCampaign = (val: string) => {
    if (!val) return 'Sep-26';
    const [y, m] = val.split('-');
    if (!y || !m) return val;
    const d = new Date(Number(y), Number(m) - 1, 1);
    const mShort = d.toLocaleString('en-US', { month: 'short' });
    return `${mShort}-${y.slice(-2)}`;
  };

  const [campaignMonth, setCampaignMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const [monthStr, setMonthStr] = useState(() => {
    const d = new Date();
    const mShort = d.toLocaleString('en-US', { month: 'short' });
    return `${mShort}-${String(d.getFullYear()).slice(-2)}`;
  });
  const [planNoOverride, setPlanNoOverride] = useState('');
  const [prevPlanNo, setPrevPlanNo] = useState('');

  // Plans table & filtering
  const [plans, setPlans] = useState<Plan[]>([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterRoute, setFilterRoute] = useState('');
  const [planTypeFilter, setPlanTypeFilter] = useState<'all' | 'master' | 'child'>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [plansLoading, setPlansLoading] = useState(false);
  const [expandedMasterPlans, setExpandedMasterPlans] = useState<Record<string, boolean>>({});

  // Auto-calculated next daily plan number (e.g. 01, 02, 03...)
  const autoNextPlanNo = useMemo(() => {
    let maxNum = 0;
    plans.forEach((p) => {
      let parsed: any = {};
      try {
        parsed = typeof p.status === 'string' ? JSON.parse(p.status) : p.status || {};
      } catch {}
      const candidate = String(parsed.campaign_plan_no || p.plan_no || '').trim();
      const m = candidate.match(/^(\d+)/);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > maxNum && n < 1000) maxNum = n;
      }
    });
    const nextNum = maxNum + 1;
    return String(nextNum).padStart(2, '0');
  }, [plans]);

  useEffect(() => {
    if (autoNextPlanNo) {
      setPlanNoOverride(autoNextPlanNo);
    }
  }, [autoNextPlanNo]);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  // Editing single plan modal
  const [editing, setEditing] = useState<Plan | null>(null);
  const [editQtyPcs, setEditQtyPcs] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editRoute, setEditRoute] = useState('');
  const [editMhOd, setEditMhOd] = useState('');
  const [editMhWt, setEditMhWt] = useState('');
  const [editMhL1, setEditMhL1] = useState('6.0');
  const [editMhL2, setEditMhL2] = useState('6.5');
  const [editPassRequired, setEditPassRequired] = useState('1');
  const [editMultiple, setEditMultiple] = useState('1');

  // Setup Specifications (35-Column Standards) for Editing Modal
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

  const [editChildOrders, setEditChildOrders] = useState<
    Array<{
      work_order_id: string;
      work_order_no: string;
      customer_name: string | null;
      grade: string | null;
      size_od: number | null;
      size_wt: number | null;
      l1: number | null;
      l2: number | null;
      planned_pcs: string;
      planned_mtr: number;
      planned_mt: number;
      plan_id?: string;
    }>
  >([]);
  const [editSaving, setEditSaving] = useState(false);

  // Deleting plan modal state
  const [deletingPlan, setDeletingPlan] = useState<Plan | null>(null);
  const [deleteClearLogs, setDeleteClearLogs] = useState<boolean>(true);
  const [isDeleting, setIsDeleting] = useState(false);

  const { user } = usePermissions();
  const formAccess = useMemo(() => getFormAccess(user, 'rolling_plan'), [user]);
  const canManagePlans = formAccess.isAllowed;

  // Load plans list with full Mother Hollow specifications and user-planned quantities
  const loadPlans = useCallback(async () => {
    setPlansLoading(true);
    try {
      const s = createClient();
      const { data, error } = await s.rpc('get_rolling_plans', {
        p_search: debouncedSearch.trim() || null,
        p_route_code: filterRoute || null,
        p_from_date: fromDate || null,
        p_to_date: toDate || null,
        p_limit: 2000,
        p_offset: 0,
      });

      if (error) throw new Error(error.message);
      const rawPlans = (data ?? []) as Plan[];

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
        } catch {}

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

        // User-entered Planned PCS
        let pcs = 0;
        if (parsedSt?.is_master && Number(parsedSt?.master_planned_pcs) > 0) {
          pcs = Number(parsedSt.master_planned_pcs);
        } else if (Number(parsedSt?.planned_pcs) > 0) {
          pcs = Number(parsedSt.planned_pcs);
        } else if (Number(p.planned_pcs) > 0) {
          pcs = Number(p.planned_pcs);
        }

        // Hollow Average Length: (mh_l1 + mh_l2) / 2
        const hl1 = Number(mhL1 || 0);
        const hl2 = Number(mhL2 || 0);
        const mhAvgLen = (hl1 > 0 && hl2 > 0)
          ? (hl1 + hl2) / 2
          : (hl1 > 0 ? hl1 : (hl2 > 0 ? hl2 : Number(computedAvgLen || 6.0)));

        const rawMtr = Number(detail?.planned_qty ?? p.planned_qty ?? p.planned_mtr ?? 0);
        if (pcs === 0 && rawMtr > 0 && mhAvgLen > 0) {
          pcs = Math.round(rawMtr / mhAvgLen);
        }

        // Planned MTR = Planned PCS * Average Hollow Length
        const mtr = pcs > 0
          ? Number((pcs * mhAvgLen).toFixed(2))
          : (Number(parsedSt?.master_planned_mtr || parsedSt?.planned_mtr || rawMtr) || 0);

        // Planned MT = Planned PCS * (MH OD - MH WT) * MH WT * 0.0246615 * 0.001 * Average Hollow Length
        //            = (MH OD - MH WT) * MH WT * 0.0246615 * 0.001 * Planned MTR
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
    } catch (error) {
      setPlans([]);
      toast.error(error instanceof Error ? error.message : 'Failed to load rolling plans.');
    } finally {
      setPlansLoading(false);
    }
  }, [filterRoute, fromDate, debouncedSearch, toDate]);

  // Helper to fetch unplanned quantity
  const fetchUnplannedQty = useCallback(async (woId: string): Promise<number> => {
    try {
      const { data, error } = await createClient().rpc('get_unplanned_qty', {
        p_work_order_id: woId,
      });
      if (error) throw error;
      return Number(data ?? 0);
    } catch {
      return 0;
    }
  }, []);

  // Reload work orders list
  const loadWorkOrders = useCallback(async () => {
    try {
      const s = createClient();
      const { data, error } = await s
        .from('work_orders')
        .select('id,work_order_no,customer_name,grade,specification,size_od,size_wt,l1,l2,ordered_qty,uom,balance_qty_mtr')
        .order('work_order_no');
      if (error) throw error;
      setWos((data ?? []) as WO[]);
    } catch {
      // ignore
    }
  }, []);

  // Load initial work orders and routes
  useEffect(() => {
    const s = createClient();
    Promise.all([
      s
        .from('work_orders')
        .select('id,work_order_no,customer_name,grade,specification,size_od,size_wt,l1,l2,ordered_qty,uom,balance_qty_mtr')
        .order('work_order_no'),
      s
        .from('process_routes')
        .select('id,route_code,route_name,material_category')
        .eq('active', true)
        .order('route_code'),
    ])
      .then(async ([a, b]) => {
        if (a?.error) throw new Error(a.error.message);
        const woList = (a?.data ?? []) as WO[];
        setWos(woList);

        if (b?.error) throw new Error(b.error.message);
        const routeList = (b?.data ?? []) as Route[];
        setRoutes(routeList);
        if (routeList.length > 0) {
          setRoute((prev) => prev || routeList[0].id);
        }

        // Auto-select initial WO if query param present
        if (initialWoId && woList.length > 0) {
          const match = woList.find((x) => x.id === initialWoId);
          if (match) {
            const availMtr = await fetchUnplannedQty(match.id);
            setGroups([createDefaultGroup(match, availMtr, routeList[0]?.id || '', routeList[0])]);
          }
        }
      })
      .catch((error) => {
        setWos([]);
        setRoutes([]);
        toast.error(error instanceof Error ? error.message : 'Failed to load rolling plan masters.');
      });
  }, [initialWoId, fetchUnplannedQty]);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  // Add parent work order to campaign (new setup group)
  const handleAddOrder = async (woId: string) => {
    if (!woId) return;
    const isAlreadySelected = groups.some(
      (g) => g.wo.id === woId || g.children.some((c) => c.wo.id === woId)
    );
    if (isAlreadySelected) {
      toast.info('This work order is already included in the plan.');
      setAddWoSelectValue('');
      return;
    }

    const targetWo = wos.find((w) => w.id === woId);
    if (!targetWo) return;

    const availMtr = await fetchUnplannedQty(woId);
    const rObj = routes.find((r) => r.id === (route || routes[0]?.id));
    const newGrp = createDefaultGroup(targetWo, availMtr, route || routes[0]?.id || '', rObj);
    setGroups((prev) => [...prev, newGrp]);
    setAddWoSelectValue('');
    toast.success(`Added ${targetWo.work_order_no} as Setup #${groups.length + 1}.`);
  };

  // Batch Add Work Orders from Multi-Select Modal
  const handleBatchAddOrders = async (woIds: string[]) => {
    if (woIds.length === 0) return;
    const existingIds = new Set<string>();
    groups.forEach((g) => {
      existingIds.add(g.wo.id);
      g.children.forEach((c) => existingIds.add(c.wo.id));
    });
    const toAdd = wos.filter((w) => woIds.includes(w.id) && !existingIds.has(w.id));
    if (toAdd.length === 0) {
      toast.info('Selected orders are already in the plan.');
      setIsMultiPickerOpen(false);
      return;
    }

    const rObj = routes.find((r) => r.id === (route || routes[0]?.id));
    const newGroups: WorkOrderGroup[] = [];
    for (const targetWo of toAdd) {
      const availMtr = await fetchUnplannedQty(targetWo.id);
      newGroups.push(createDefaultGroup(targetWo, availMtr, route || routes[0]?.id || '', rObj));
    }

    setGroups((prev) => [...prev, ...newGroups]);
    setIsMultiPickerOpen(false);
    setModalSelectedIds([]);
    toast.success(`Added ${newGroups.length} work orders to campaign.`);
  };

  // Remove setup group
  const handleRemoveGroup = (groupId: string) => {
    setGroups((prev) => prev.filter((g) => g.id !== groupId));
  };

  // Add child to specific parent work order group
  const handleAddChildToGroup = async (groupId: string, childWo: WO) => {
    const childAvailMtr = await fetchUnplannedQty(childWo.id);
    const lAvg = childWo.l1 && childWo.l2 ? (childWo.l1 + childWo.l2) / 2 : childWo.l1 || 6;
    const defaultChildPcs = childAvailMtr > 0 ? Math.max(1, Math.floor(childAvailMtr / lAvg)) : 50;

    const newChild: ChildOrderEntry = {
      id: `c-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      wo: childWo,
      plannedPcs: String(defaultChildPcs),
      availableMtr: childAvailMtr,
    };

    setGroups((prev) =>
      prev.map((g) => {
        if (g.id !== groupId) return g;
        return {
          ...g,
          children: [...g.children, newChild],
        };
      })
    );

    toast.success(`Added ${childWo.work_order_no} as child of this setup.`);
  };

  // Remove child from group (childId is the ChildOrderEntry.id, not wo.id)
  const handleRemoveChildFromGroup = (groupId: string, childId: string) => {
    setGroups((prev) =>
      prev.map((g) => {
        if (g.id !== groupId) return g;
        return {
          ...g,
          children: g.children.filter((c) => c.id !== childId),
        };
      })
    );
  };

  // Update field on group
  const handleUpdateGroupField = (groupId: string, field: keyof WorkOrderGroup, value: any) => {
    setGroups((prev) =>
      prev.map((g) => {
        if (g.id !== groupId) return g;
        const updated = { ...g, [field]: value };
        if (field === 'routeId') {
          const matchedRoute = routes.find((r) => r.id === value);
          if (matchedRoute?.material_category) {
            updated.catg = matchedRoute.material_category;
          }
        } else if (field === 'custWt') {
          updated.rollingWt = value;
        } else if (field === 'reqLenMin' || field === 'reqLenMax') {
          const min = field === 'reqLenMin' ? Number(value) : Number(g.reqLenMin);
          const max = field === 'reqLenMax' ? Number(value) : Number(g.reqLenMax);
          updated.reqLenEr = min > 0 && min === max ? 'EL' : 'RL';
        }
        return updated;
      })
    );
  };

  // Update child planned pcs (childId is the ChildOrderEntry.id)
  const handleUpdateChildPcs = (groupId: string, childId: string, pcs: string) => {
    setGroups((prev) =>
      prev.map((g) => {
        if (g.id !== groupId) return g;
        return {
          ...g,
          children: g.children.map((c) => (c.id === childId ? { ...c, plannedPcs: pcs } : c)),
        };
      })
    );
  };

  // Toggle specs expansion for a group (uses isSpecsExpanded field)
  const toggleGroupSpecs = (groupId: string) => {
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, isSpecsExpanded: !g.isSpecsExpanded } : g))
    );
  };

  // Campaign Calculations for all setups & children
  const campaignSummary = useMemo(() => {
    let grandTotalPcs = 0;
    let grandTotalMtr = 0;
    let grandTotalMt = 0;

    const groupSummaries = groups.map((g, gIdx) => {
      // Preliminary computation of group specs to get effective length
      const prelimSpecs = computeGroupSpecs(g, 0, gIdx + 1);
      const avgLen =
        Number(g.reqLenMin) > 0
          ? Number(g.reqLenMin)
          : (prelimSpecs.effectiveLen > 0 ? prelimSpecs.effectiveLen : Number(g.wo.l1 || 6.0));
      const custOdNum = prelimSpecs.custOd;
      const custWtNum = prelimSpecs.custWt;

      const calcMtr = (pcs: number) => Number((pcs * avgLen).toFixed(2));
      const calcMt = (mtr: number) =>
        Number((Math.max(custOdNum - custWtNum, 0) * Math.max(custWtNum, 0) * 0.02467 * 0.001 * mtr).toFixed(3));

      const parentPcs = Number(g.plannedPcs || 0);
      const parentMtr = calcMtr(parentPcs);
      const parentMt = calcMt(parentMtr);

      const childSummaries = g.children.map((c) => {
        const cPcs = Number(c.plannedPcs || 0);
        const cMtr = calcMtr(cPcs);
        const cMt = calcMt(cMtr);
        return {
          id: c.id,
          wo: c.wo,
          pcs: cPcs,
          mtr: cMtr,
          mt: cMt,
          availableMtr: c.availableMtr,
        };
      });

      const totalGroupChildPcs = childSummaries.reduce((sum, c) => sum + c.pcs, 0);
      const totalGroupChildMtr = childSummaries.reduce((sum, c) => sum + c.mtr, 0);
      const totalGroupChildMt = childSummaries.reduce((sum, c) => sum + c.mt, 0);

      const totalGroupPcs = parentPcs + totalGroupChildPcs;
      const totalGroupMtr = Number((parentMtr + totalGroupChildMtr).toFixed(2));
      const totalGroupMt = Number((parentMt + totalGroupChildMt).toFixed(3));

      // Final specs with total group rolling mtr and total pcs
      const specs = computeGroupSpecs(g, totalGroupMtr, gIdx + 1, totalGroupPcs);

      grandTotalPcs += totalGroupPcs;
      grandTotalMtr += totalGroupMtr;
      grandTotalMt += totalGroupMt;

      return {
        groupId: g.id,
        parentPcs,
        parentMtr,
        parentMt,
        childSummaries,
        totalGroupPcs,
        totalGroupMtr,
        totalGroupMt,
        avgLen,
        specs,
      };
    });

    return {
      grandTotalPcs,
      grandTotalMtr: Number(grandTotalMtr.toFixed(2)),
      grandTotalMt: Number(grandTotalMt.toFixed(3)),
      groupSummaries,
    };
  }, [groups]);

  // Submit Multi-WO Rolling Plan (in one go, with NO plan qty validation blocking)
  async function submitMultiWoPlan(e: React.FormEvent) {
    e.preventDefault();

    if (groups.length === 0) {
      toast.error('Please select at least one Work Order for the Rolling Plan.');
      return;
    }

    const unroutedGroup = groups.find((g) => !g.routeId && !route);
    if (unroutedGroup) {
      toast.error(`Please select a Process Route for Work Order ${unroutedGroup.wo.work_order_no} in Setup Specifications.`);
      return;
    }

    setLoading(true);

    try {
      const defaultRouteId = route || groups[0]?.routeId || '';
      const payload: CreateMultiWoRollingPlanPayload = {
        mill_name: millName,
        month_str: monthStr,
        plan_no_override: planNoOverride.trim() || undefined,
        prev_plan_no: prevPlanNo,
        rolling_date: date,
        route_id: defaultRouteId,
        multiple: Number(groups[0]?.multipleStr === '2' || groups[0]?.multipleStr === '2-Multi' ? 2 : 1),

        master_groups: groups.map((g, gIdx) => {
          const gSummary = campaignSummary.groupSummaries.find((s) => s.groupId === g.id)!;
          const specs = gSummary?.specs || computeGroupSpecs(g, gSummary?.totalGroupMtr || 0, gIdx + 1);
          const grpRoute = g.routeId || route;

          return {
            master_work_order_id: g.wo.id,
            route_id: grpRoute,
            master_planned_pcs: gSummary.parentPcs,
            master_planned_mtr: gSummary.parentMtr,
            master_planned_mt: gSummary.parentMt,

            // Setup specifications for this work order (35 Columns)
            catg: specs.catg,
            spec: specs.spec,
            grade: specs.grade,
            ibr_status: specs.ibr,
            rolling_mtr: specs.rollingMtr,

            rm_od: specs.rmOd,
            rm_len_min: specs.rmLenMin,
            rm_len_max: specs.rmLenMax,
            weight_kg: specs.weightKg,
            plan_qty_nos: specs.nos,
            plan_qty_mton: specs.mton,
            billet_wt_whf: specs.billetWtWhf,

            pm_od: specs.pmOd,
            pm_wt: specs.pmWt,
            pm_kg_mtr: specs.pmKgMtr,
            pm_len: specs.pmLen,

            wt_wbf: specs.wtWbf,
            cust_od: specs.custOd,
            cust_wt: specs.custWt,
            rolling_wt: specs.rollingWt,
            sm_kg_mtr: specs.smKgMtr,
            sm_len: specs.smLen,

            fe_len: specs.feLen,
            fe_wg: specs.feWg,
            be_len: specs.beLen,
            be_wg: specs.beWg,
            effective_wg: specs.effectiveWg,
            eff_len: specs.effectiveLen,
            effective_len: specs.effectiveLen,

            req_len_er: specs.erStatus,
            req_len_min: specs.minLen,
            req_len_max: specs.maxLen,
            multiple_str: specs.multi,
            multiple: Number(specs.multi === '2' || specs.multi === '2-Multi' ? 2 : 1),
            tol_od_min: Number(g.tolOdMin),
            tol_od_max: Number(g.tolOdMax),
            tol_wt_min: Number(g.tolWtMin),
            tol_wt_max: Number(g.tolWtMax),
            process_yield_pct: Number(g.processYieldPct),

            child_work_orders: g.children.map((c, cIdx) => {
              const cSummary = gSummary.childSummaries.find((cs) => cs.id === c.id)!;
              return {
                id: c.wo.id,
                work_order_no: c.wo.work_order_no,
                customer_name: c.wo.customer_name,
                grade: c.wo.grade,
                size_od: c.wo.size_od,
                size_wt: c.wo.size_wt,
                l1: c.wo.l1,
                l2: c.wo.l2,
                planned_pcs: cSummary.pcs,
                planned_mtr: cSummary.mtr,
                planned_mt: cSummary.mt,
                catg: specs.catg,
                finish_size: `${fmt(c.wo.size_od, 2)}x${fmt(c.wo.size_wt, 2)}`,
                final_len: `${fmt(c.wo.l1, 2)}-${fmt(c.wo.l2, 2)}`,
                hollow_len: `${fmt(specs.minLen, 2)}-${fmt(specs.maxLen, 2)}`,
                htc_mtr: cSummary.mtr,
                alloc_tag: `${cIdx + 1}`,
              };
            }),
          };
        }),
      };

      const res = await fetch('/api/rolling-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to create rolling plan.');
      }

      toast.success(
        `Rolling Plan ${data.plan_no} issued successfully in one go! (${groups.length} Setup(s), ${data.child_count || 0} Child Order(s))`
      );

      setGroups([]);
      await Promise.all([loadPlans(), loadWorkOrders()]);
    } catch (err: any) {
      console.error('Submit error:', err);
      toast.error(err.message || 'Failed to create rolling plan.');
    } finally {
      setLoading(false);
    }
  }

  // Delete plan modal trigger & executor
  function openDeleteModal(p: Plan) {
    setDeletingPlan(p);
    setDeleteClearLogs(true);
  }

  async function executeDeletePlan() {
    if (!deletingPlan) return;
    setIsDeleting(true);
    try {
      const res = await fetch(
        `/api/rolling-plans?id=${deletingPlan.id}&force=true&clear_logs=${deleteClearLogs}`,
        { method: 'DELETE' }
      );
      const data = await res.json();

      if (res.ok && data.success) {
        toast.success(data.message || 'Rolling plan deleted successfully.');
        setDeletingPlan(null);
        await Promise.all([loadPlans(), loadWorkOrders()]);
      } else {
        toast.error(data.error || 'Failed to delete rolling plan.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete rolling plan.');
    } finally {
      setIsDeleting(false);
    }
  }

  // Start Edit
  function startEdit(p: Plan) {
    setEditing(p);
    
    let isMaster = false;
    let childList: any[] = [];
    let parsed: any = {};
    try {
      parsed = typeof p.status === 'string' ? JSON.parse(p.status) : p.status || {};
      if (parsed?.is_master) {
        isMaster = true;
        childList = parsed.child_work_orders || [];
      }
    } catch {}

    const pcsVal =
      p.planned_pcs ||
      ((p.avg_length || 0) > 0 ? Math.round(p.planned_mtr / (p.avg_length || 1)) : 0);
    setEditQtyPcs(String(pcsVal));
    setEditDate(p.planned_rolling_date);
    setEditRoute(p.route_id);
    setEditMhOd(p.mh_od != null ? String(p.mh_od) : '');
    setEditMhWt(p.mh_wt != null ? String(p.mh_wt) : '');
    setEditMhL1(p.mh_l1 != null ? String(p.mh_l1) : '6.0');
    setEditMhL2(p.mh_l2 != null ? String(p.mh_l2) : '6.5');
    setEditPassRequired(String(p.pass_required ?? 1));
    setEditMultiple(String(p.multiple ?? 1));

    // Setup Specifications
    setEditCatg(parsed.catg || 'CDS');
    setEditSpec(parsed.spec || 'ASME SA210 Gr.A1');
    setEditGrade(parsed.grade || p.grade || 'SAE-1018');
    setEditIbrStatus(parsed.ibr_status || 'IBR');
    setEditRmOd(String(parsed.rm_od || parsed.billet?.rm_od || 63.0));

    const rawRMin = parsed.rm_len_min != null ? Number(parsed.rm_len_min) : (parsed.billet?.rm_len_min != null ? Number(parsed.billet.rm_len_min) : 2.030);
    setEditRmLenMin(String(rawRMin > 20 ? (rawRMin / 1000).toFixed(3) : rawRMin));

    const rawRMax = parsed.rm_len_max != null ? Number(parsed.rm_len_max) : (parsed.billet?.rm_len_max != null ? Number(parsed.billet.rm_len_max) : 2.035);
    setEditRmLenMax(String(rawRMax > 20 ? (rawRMax / 1000).toFixed(3) : rawRMax));

    setEditPmOd(String(parsed.pm_od || parsed.piercer_mill?.pm_od || 66.0));
    setEditPmWt(String(parsed.pm_wt || parsed.piercer_mill?.pm_wt || 6.00));
    setEditCustOd(String(parsed.cust_od || parsed.sm?.cust_od || p.mh_od || p.od || 47.00));
    setEditCustWt(String(parsed.cust_wt || parsed.sm?.cust_wt || p.mh_wt || p.wt || 6.25));
    setEditRollingWt(String(parsed.rolling_wt || parsed.sm?.rolling_wt || parsed.cust_wt || 6.25));
    setEditFeLen(String(parsed.fe_len != null ? parsed.fe_len : (parsed.thicken_ends?.fe_len ?? 0.0)));
    setEditBeLen(String(parsed.be_len != null ? parsed.be_len : (parsed.thicken_ends?.be_len ?? 0.0)));
    setEditReqLenEr(parsed.req_len_er || parsed.final_length?.er || 'EL');
    setEditReqLenMin(String(parsed.req_len_min || parsed.final_length?.min || p.mh_l1 || 7.53));
    setEditReqLenMax(String(parsed.req_len_max || parsed.final_length?.max || p.mh_l2 || 7.53));

    // Tolerances & Yield
    setEditTolOdMin(String(parsed.tol_od_min != null ? parsed.tol_od_min : (parsed.tolerances?.od_min ?? 46.50)));
    setEditTolOdMax(String(parsed.tol_od_max != null ? parsed.tol_od_max : (parsed.tolerances?.od_max ?? 47.40)));
    setEditTolWtMin(String(parsed.tol_wt_min != null ? parsed.tol_wt_min : (parsed.tolerances?.wt_min ?? 5.78)));
    setEditTolWtMax(String(parsed.tol_wt_max != null ? parsed.tol_wt_max : (parsed.tolerances?.wt_max ?? 6.88)));
    setEditProcessYieldPct(String(parsed.process_yield_pct != null ? parsed.process_yield_pct : 95.22));

    if (isMaster && childList.length > 0) {
      setEditChildOrders(
        childList.map((c: any) => ({
          ...c,
          planned_pcs: String(c.planned_pcs || ''),
        }))
      );
    } else {
      setEditChildOrders([]);
    }
  }

  // Update child order planned PCS in master edit modal
  const handleUpdateEditChildPcs = (woId: string, val: string) => {
    setEditChildOrders((prev) =>
      prev.map((c) => (c.work_order_id === woId ? { ...c, planned_pcs: val } : c))
    );
  };

  // Save Edit
  async function saveEdit() {
    if (!editing) return;
    const pcs = Number(editQtyPcs);
    if (!Number.isFinite(pcs) || pcs <= 0) {
      toast.error('Enter a valid Planned PCS.');
      return;
    }
    if (!editDate) {
      toast.error('Please select a Planned Rolling Date.');
      return;
    }
    if (!editRoute) {
      toast.error('Please select a Target Route.');
      return;
    }

    const mhOdVal = Number(editCustOd) || Number(editMhOd) || 47.0;
    const mhWtVal = Number(editRollingWt) || Number(editMhWt) || 6.25;
    const mhL1Val = Number(editReqLenMin) || Number(editMhL1) || 7.53;
    const mhL2Val = Number(editReqLenMax) || Number(editMhL2) || 7.53;

    if (mhOdVal <= 0) {
      toast.error('Enter valid MH OD.');
      return;
    }
    if (mhWtVal <= 0) {
      toast.error('Enter valid MH WT.');
      return;
    }

    setEditSaving(true);
    try {
      const parsedRMin = Number(editRmLenMin) > 20 ? Number((Number(editRmLenMin) / 1000).toFixed(3)) : (Number(editRmLenMin) || 2.030);
      const parsedRMax = Number(editRmLenMax) > 20 ? Number((Number(editRmLenMax) / 1000).toFixed(3)) : (Number(editRmLenMax) || parsedRMin);

      const payload: any = {
        plan_id: editing.id,
        planned_pcs: pcs,
        planned_rolling_date: editDate,
        route_id: editRoute,
        multiple: Number(editMultiple) || 1,
        multiple_str: editMultiple === '2' ? '2-Multi' : '1',
        pass_required: Number(editPassRequired) || 1,
        force: true,

        // Specifications (35-columns)
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

        // Tolerances & Yield
        tol_od_min: Number(editTolOdMin),
        tol_od_max: Number(editTolOdMax),
        tol_wt_min: Number(editTolWtMin),
        tol_wt_max: Number(editTolWtMax),
        process_yield_pct: Number(editProcessYieldPct) || 95.22,

        // Sync mother hollow root columns
        mh_od: mhOdVal,
        mh_wt: mhWtVal,
        mh_l1: mhL1Val,
        mh_l2: mhL2Val,
      };

      if (editChildOrders.length > 0) {
        payload.child_adjustments = editChildOrders.map((c) => ({
          plan_id: c.plan_id,
          work_order_id: c.work_order_id,
          planned_pcs: Number(c.planned_pcs) || 0,
        }));
      }

      const res = await fetch('/api/rolling-plans', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update rolling plan.');
      }

      toast.success(data.message || 'Rolling plan specifications and tolerances updated successfully.');
      setEditing(null);
      await Promise.all([loadPlans(), loadWorkOrders()]);
    } catch (err: any) {
      toast.error(err.message || 'Failed to update rolling plan.');
    } finally {
      setEditSaving(false);
    }
  }

  // Available Work Orders for addition (exclude already selected as parent or child)
  const availableWosToAdd = useMemo(() => {
    const selectedIds = new Set<string>();
    groups.forEach((g) => {
      selectedIds.add(g.wo.id);
      g.children.forEach((c) => selectedIds.add(c.wo.id));
    });
    return wos
      .filter((w) => !selectedIds.has(w.id))
      .filter((w) => {
        if (!woSearchQuery) return true;
        const q = woSearchQuery.toLowerCase();
        return (
          w.work_order_no.toLowerCase().includes(q) ||
          (w.customer_name && w.customer_name.toLowerCase().includes(q)) ||
          (w.grade && w.grade.toLowerCase().includes(q)) ||
          `${w.size_od}x${w.size_wt}`.includes(q)
        );
      });
  }, [wos, groups, woSearchQuery]);

  // Distinct Grades for Multi-WO picker
  const availableGrades = useMemo(() => {
    const s = new Set<string>();
    wos.forEach((w) => {
      if (w.grade) s.add(w.grade);
    });
    return Array.from(s).sort();
  }, [wos]);

  // Filtered available WOs for Multi-Select modal (parent setups)
  const modalFilteredWos = useMemo(() => {
    const selectedIds = new Set<string>();
    groups.forEach((g) => {
      selectedIds.add(g.wo.id);
      g.children.forEach((c) => selectedIds.add(c.wo.id));
    });
    return wos
      .filter((w) => !selectedIds.has(w.id))
      .filter((w) => {
        if (modalGradeFilter !== 'ALL' && w.grade !== modalGradeFilter) return false;
        if (!modalSearch) return true;
        const q = modalSearch.toLowerCase();
        return (
          w.work_order_no.toLowerCase().includes(q) ||
          (w.customer_name && w.customer_name.toLowerCase().includes(q)) ||
          (w.grade && w.grade.toLowerCase().includes(q)) ||
          `${w.size_od}x${w.size_wt}`.includes(q)
        );
      });
  }, [wos, groups, modalSearch, modalGradeFilter]);

  // Filtered available WOs for Child Order Picker modal
  const childModalFilteredWos = useMemo(() => {
    const selectedIds = new Set<string>();
    groups.forEach((g) => {
      selectedIds.add(g.wo.id);
      g.children.forEach((c) => selectedIds.add(c.wo.id));
    });
    return wos
      .filter((w) => !selectedIds.has(w.id))
      .filter((w) => {
        if (childModalGradeFilter !== 'ALL' && w.grade !== childModalGradeFilter) return false;
        if (!childModalSearch) return true;
        const q = childModalSearch.toLowerCase();
        return (
          w.work_order_no.toLowerCase().includes(q) ||
          (w.customer_name && w.customer_name.toLowerCase().includes(q)) ||
          (w.grade && w.grade.toLowerCase().includes(q)) ||
          `${w.size_od}x${w.size_wt}`.includes(q)
        );
      });
  }, [wos, groups, childModalSearch, childModalGradeFilter]);

  // Filtered plans based on planTypeFilter
  const filteredPlans = useMemo(() => {
    return plans.filter((p) => {
      let isMaster = false;
      let isChild = false;
      try {
        const parsed = typeof p.status === 'string' ? JSON.parse(p.status) : p.status;
        if (parsed?.is_master) isMaster = true;
        if (parsed?.is_child) isChild = true;
      } catch {}

      if (planTypeFilter === 'master') return isMaster;
      if (planTypeFilter === 'child') return isChild;
      return true;
    });
  }, [plans, planTypeFilter]);

  return (
    <div className="space-y-6">
      <FormAccessBanner access={formAccess} />

      {/* Campaign Rolling Plan Creation Card */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs">
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Layers className="h-5 w-5 text-indigo-600" />
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Issue Rolling Plan</h1>
            <span className="rounded-full bg-indigo-50 border border-indigo-200/80 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
              Multi-WO Campaign Planning
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs font-medium text-slate-600 font-mono">
            <span><b>{groups.length}</b> Setup{groups.length === 1 ? '' : 's'}</span>
            <span>•</span>
            <span><b>{fmt(campaignSummary.grandTotalPcs)}</b> Pcs</span>
            <span>•</span>
            <span className="text-indigo-700 font-bold">{fmt(campaignSummary.grandTotalMtr)} MTR</span>
          </div>
        </div>

        <form onSubmit={submitMultiWoPlan} className="space-y-5">
          {/* Section 1: Factory Daily Production Plan & Campaign Headers (Mill-02 Photo Format) */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <div className="flex items-center gap-2">
                <Flame className="h-4 w-4 text-amber-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Daily Production Plan Parameters ({selectedMill})
                </h3>
              </div>
              <span className="text-[11px] font-mono text-slate-500">
                Form: F-PROD-01A (Rev.02)
              </span>
            </div>

            {/* Campaign Subheaders Grid: 4 Clean Columns */}
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Select Mill *
                </label>
                <select
                  value={selectedMill}
                  disabled={!canManagePlans}
                  onChange={(e) => {
                    const m = e.target.value as 'Mill-02' | 'Mill-03';
                    setSelectedMill(m);
                    setMillName(`Production Plan-Hot ${m}`);
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-indigo-700 focus:border-indigo-500 focus:outline-hidden cursor-pointer"
                >
                  <option value="Mill-02">Hot Mill-02</option>
                  <option value="Mill-03">Hot Mill-03</option>
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    Campaign Month *
                  </label>
                  <span className="text-[10px] font-bold font-mono px-1.5 py-0.2 rounded bg-slate-200 text-slate-700">
                    {monthStr}
                  </span>
                </div>
                <Input
                  type="month"
                  value={campaignMonth}
                  disabled={!canManagePlans}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCampaignMonth(val);
                    setMonthStr(formatMonthToCampaign(val));
                  }}
                  className="bg-white text-xs font-medium font-mono cursor-pointer"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    Daily Plan No :-
                  </label>
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-800 font-mono">
                    Auto
                  </span>
                </div>
                <Input
                  type="text"
                  value={planNoOverride || autoNextPlanNo}
                  readOnly
                  disabled
                  className="bg-slate-100 text-xs font-black font-mono text-indigo-800 border-indigo-200 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Issue / Rolling Date *
                </label>
                <Input
                  type="date"
                  value={date}
                  disabled={!canManagePlans}
                  onChange={(e) => setDate(e.target.value)}
                  required
                  className="bg-white text-xs font-medium cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Work Orders & Setup Groups */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  <Sliders className="h-4 w-4 text-indigo-600" />
                  <span>Work Orders & Setup Groups ({groups.length})</span>
                  <span className="text-rose-500">*</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Each work order has its own setup specifications. Click &quot;+ Add Child&quot; near any Work Order No to link child orders.
                </p>
              </div>

              {/* Work Order Picker Controls: Batch Dialog Button */}
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Button
                  type="button"
                  onClick={() => {
                    setModalSelectedIds([]);
                    setIsMultiPickerOpen(true);
                  }}
                  disabled={!canManagePlans}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs h-9 cursor-pointer shadow-xs"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Select Work Orders (Dialog)
                </Button>
              </div>
            </div>

            {/* Groups List */}
            {groups.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-slate-200 bg-white p-8 text-center">
                <Layers className="mx-auto h-8 w-8 text-slate-400" />
                <p className="mt-2 text-sm font-semibold text-slate-700">No Work Orders Selected</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Select work orders above to add them as rolling plan setups.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {groups.map((group, groupIndex) => {
                  const gSummary = campaignSummary.groupSummaries.find((s) => s.groupId === group.id);
                  const pMetrics = {
                    pcs: gSummary?.parentPcs || 0,
                    mtr: gSummary?.parentMtr || 0,
                    mt: gSummary?.parentMt || 0,
                    avg: gSummary?.avgLen || 0,
                  };
                  const specs =
                    gSummary?.specs ||
                    computeGroupSpecs(group, gSummary?.totalGroupMtr || 0, groupIndex + 1);

                  return (
                    <div
                      key={group.id}
                      className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden transition-all hover:border-indigo-300"
                    >
                      {/* Setup Card Header */}
                      <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <span className="rounded-md bg-indigo-600 px-2 py-0.5 text-xs font-bold text-white shadow-xs">
                            Setup #{groupIndex + 1}
                          </span>

                          <div className="flex items-center gap-1.5 font-mono">
                            <span className="text-xs text-slate-500 font-sans font-medium">WO:</span>
                            <span className="text-sm font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                              {group.wo.work_order_no}
                            </span>
                          </div>

                          {/* Route Badge */}
                          {(() => {
                            const curRouteId = group.routeId || route;
                            const curRouteObj = routes.find((r) => r.id === curRouteId);
                            return curRouteObj ? (
                              <span className="rounded-md bg-blue-50 border border-blue-200 px-2 py-0.5 text-xs font-bold text-blue-700 font-mono flex items-center gap-1">
                                <span>Route:</span> {curRouteObj.route_code}
                              </span>
                            ) : (
                              <span className="rounded-md bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs font-bold text-amber-700">
                                Route: Select in Specs
                              </span>
                            );
                          })()}

                          {/* ADD CHILD BUTTON NEAR WORK ORDER NO */}
                          <Button
                            type="button"
                            onClick={() => {
                              setChildModalSearch('');
                              setChildModalGradeFilter('ALL');
                              setActiveChildTargetGroupId(group.id);
                            }}
                            disabled={!canManagePlans}
                            className="h-7 px-2.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-md shadow-xs cursor-pointer flex items-center gap-1"
                            title="Add child work orders under this work order"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            <span>Add Child</span>
                          </Button>

                          {group.children.length > 0 && (
                            <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 flex items-center gap-1">
                              <Link2 className="h-3 w-3" />
                              {group.children.length} Child Order{group.children.length === 1 ? '' : 's'}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => toggleGroupSpecs(group.id)}
                            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                              group.isSpecsExpanded
                                ? 'bg-amber-100 border-amber-300 text-amber-900'
                                : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <Sliders className="h-3.5 w-3.5 text-amber-600" />
                            <span>{group.isSpecsExpanded ? 'Hide Specs' : 'Setup Specs & Tolerances'}</span>
                            <span className="text-[10px] text-slate-400 font-mono hidden md:inline">
                              ({routes.find((r) => r.id === (group.routeId || route))?.route_code || 'No Route'} · {specs.catg} · RM {specs.rmOd}mm · PM {specs.pmOd}mm · SM {specs.custOd}×{specs.custWt} · {specs.nos} Nos / {fmt(specs.mton, 2)} MT)
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleRemoveGroup(group.id)}
                            className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer transition"
                            title="Remove this setup group"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {/* Parent Work Order Row Details */}
                      <div className="p-3.5 bg-white">
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                              <tr>
                                <th className="px-3 py-1.5 font-bold">Role</th>
                                <th className="px-3 py-1.5 font-bold">Work Order</th>
                                <th className="px-3 py-1.5 font-bold">Customer & Grade</th>
                                <th className="px-3 py-1.5 font-bold">Size (OD × WT)</th>
                                <th className="px-3 py-1.5 font-bold">Length</th>
                                <th className="px-3 py-1.5 font-bold text-right">Available Balance</th>
                                <th className="px-3 py-1.5 font-bold text-center w-32">Planned PCS *</th>
                                <th className="px-3 py-1.5 font-bold text-right">Planned MTR</th>
                                <th className="px-3 py-1.5 font-bold text-right">Planned MT</th>
                                <th className="px-3 py-1.5 font-bold text-center">Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr className="bg-indigo-50/20 font-medium">
                                <td className="px-3 py-2 whitespace-nowrap">
                                  <span className="inline-flex items-center gap-1 rounded-full bg-indigo-600 px-2.5 py-0.5 text-xs font-bold text-white shadow-2xs">
                                    <Crown className="h-3 w-3" />
                                    Master Order
                                  </span>
                                </td>
                                <td className="px-3 py-2 font-mono font-bold text-slate-900 whitespace-nowrap">
                                  {group.wo.work_order_no}
                                </td>
                                <td className="px-3 py-2 max-w-[180px] truncate text-slate-600">
                                  <span className="font-semibold text-slate-800">
                                    {group.wo.customer_name || 'Standard Stock'}
                                  </span>
                                  <div className="text-[11px] text-slate-500">{group.wo.grade}</div>
                                </td>
                                <td className="px-3 py-2 font-mono whitespace-nowrap">
                                  {group.wo.size_od} × {group.wo.size_wt} mm
                                </td>
                                <td className="px-3 py-2 font-mono whitespace-nowrap text-slate-500">
                                  <div>{group.wo.l1}–{group.wo.l2} m (WO)</div>
                                  <div className="text-[10px] text-indigo-600 font-semibold">
                                    Hollow: {fmt(pMetrics.avg)} m avg
                                  </div>
                                </td>
                                <td className="px-3 py-2 text-right font-mono whitespace-nowrap text-slate-600">
                                  <span className="font-bold text-slate-700">
                                    {fmt(group.availableMtr)}
                                  </span>{' '}
                                  MTR
                                </td>
                                <td className="px-3 py-2 text-center">
                                  <Input
                                    type="number"
                                    min="1"
                                    step="1"
                                    value={group.plannedPcs}
                                    onChange={(e) =>
                                      handleUpdateGroupField(group.id, 'plannedPcs', e.target.value)
                                    }
                                    disabled={!canManagePlans}
                                    className="h-8 w-28 text-center font-mono font-bold bg-white text-slate-900 border-slate-300"
                                    required
                                  />
                                </td>
                                <td className="px-3 py-2 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                                  {fmt(pMetrics.mtr)} m
                                </td>
                                <td className="px-3 py-2 text-right font-mono text-slate-700 whitespace-nowrap">
                                  {fmt(pMetrics.mt)} MT
                                </td>
                                <td className="px-3 py-2 text-center">
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveGroup(group.id)}
                                    className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer transition"
                                    title="Remove this work order setup group"
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Nested Child Work Orders Sub-Table (if any) */}
                      {group.children.length > 0 && (
                        <div className="border-t border-slate-100 bg-emerald-50/20 p-3.5 space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-emerald-900 flex items-center gap-1.5">
                              <Link2 className="h-3.5 w-3.5 text-emerald-600" />
                              Child Work Orders under {group.wo.work_order_no}:
                            </span>
                            <span className="text-slate-500 font-medium">
                              Linked to parent setup specifications
                            </span>
                          </div>

                          <div className="overflow-x-auto rounded-lg border border-emerald-200 bg-white">
                            <table className="w-full text-left text-xs">
                              <thead className="bg-emerald-50/70 text-slate-700 border-b border-emerald-200">
                                <tr>
                                  <th className="px-3 py-1.5 font-bold">Role</th>
                                  <th className="px-3 py-1.5 font-bold">Child Work Order</th>
                                  <th className="px-3 py-1.5 font-bold">Customer & Grade</th>
                                  <th className="px-3 py-1.5 font-bold">Size (OD × WT)</th>
                                  <th className="px-3 py-1.5 font-bold">Length</th>
                                  <th className="px-3 py-1.5 font-bold text-right">Available Balance</th>
                                  <th className="px-3 py-1.5 font-bold text-center w-32">Planned PCS *</th>
                                  <th className="px-3 py-1.5 font-bold text-right">Planned MTR</th>
                                  <th className="px-3 py-1.5 font-bold text-right">Planned MT</th>
                                  <th className="px-3 py-1.5 text-center">Action</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-emerald-100">
                                {group.children.map((child) => {
                                  const cSumEntry = gSummary?.childSummaries.find((c) => c.id === child.id);
                                  const cMetrics = { pcs: cSumEntry?.pcs || 0, mtr: cSumEntry?.mtr || 0, mt: cSumEntry?.mt || 0, avg: gSummary?.avgLen || 0 };

                                  return (
                                    <tr key={child.id} className="hover:bg-emerald-50/30">
                                      <td className="px-3 py-2 whitespace-nowrap">
                                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 border border-emerald-300 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                                          <Link2 className="h-3 w-3" />
                                          Child Order
                                        </span>
                                      </td>
                                      <td className="px-3 py-2 font-mono font-bold text-slate-900 whitespace-nowrap">
                                        {child.wo.work_order_no}
                                      </td>
                                      <td className="px-3 py-2 max-w-[180px] truncate text-slate-600">
                                        <span className="font-semibold text-slate-800">
                                          {child.wo.customer_name || 'Standard Stock'}
                                        </span>
                                        <div className="text-[11px] text-slate-500">{child.wo.grade}</div>
                                      </td>
                                      <td className="px-3 py-2 font-mono whitespace-nowrap">
                                        {child.wo.size_od} × {child.wo.size_wt} mm
                                      </td>
                                      <td className="px-3 py-2 font-mono whitespace-nowrap text-slate-500">
                                        <div>{child.wo.l1}–{child.wo.l2} m (WO)</div>
                                        <div className="text-[10px] text-emerald-700 font-semibold">
                                          Hollow: {fmt(cMetrics.avg)} m avg
                                        </div>
                                      </td>
                                      <td className="px-3 py-2 text-right font-mono whitespace-nowrap text-slate-600">
                                        <span className="font-bold text-slate-700">
                                          {fmt(child.availableMtr)}
                                        </span>{' '}
                                        MTR
                                      </td>
                                      <td className="px-3 py-2 text-center">
                                        <Input
                                          type="number"
                                          min="1"
                                          step="1"
                                          value={child.plannedPcs}
                                          onChange={(e) =>
                                            handleUpdateChildPcs(group.id, child.id, e.target.value)
                                          }
                                          disabled={!canManagePlans}
                                          className="h-8 w-28 text-center font-mono font-bold bg-white text-slate-900 border-emerald-300"
                                          required
                                        />
                                      </td>
                                      <td className="px-3 py-2 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                                        {fmt(cMetrics.mtr)} m
                                      </td>
                                      <td className="px-3 py-2 text-right font-mono text-slate-700 whitespace-nowrap">
                                        {fmt(cMetrics.mt)} MT
                                      </td>
                                      <td className="px-3 py-2 text-center">
                                        <button
                                          type="button"
                                          onClick={() => handleRemoveChildFromGroup(group.id, child.id)}
                                          className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer transition"
                                          title="Remove child order from setup"
                                        >
                                          <X className="h-4 w-4" />
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Setup Summary Footer */}
                      <div className="bg-slate-50/80 px-4 py-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                        <div className="text-slate-600">
                          Setup #{groupIndex + 1} Total:{' '}
                          <span className="font-bold text-slate-900">
                            {1 + group.children.length} Order(s)
                          </span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span>
                            Pcs: <b className="text-indigo-700">{fmt(gSummary?.totalGroupPcs || 0)}</b>
                          </span>
                          <span>
                            MTR: <b className="text-indigo-700">{fmt(gSummary?.totalGroupMtr || 0)} m</b>
                          </span>
                          <span>
                            MT: <b className="text-emerald-700">{fmt(gSummary?.totalGroupMt || 0)} MT</b>
                          </span>
                        </div>
                      </div>

                      {/* Collapsible Setup Specifications & Factory Tolerances Accordion */}
                      {group.isSpecsExpanded && (
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

                          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 text-xs">
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
                                    handleUpdateGroupField(group.id, 'routeId', e.target.value)
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
                                      handleUpdateGroupField(group.id, 'catg', e.target.value)
                                    }
                                    className="w-full rounded border border-slate-300 p-1 text-xs font-bold bg-slate-50"
                                  />
                                </div>
                                <div className="w-1/2">
                                  <label className="text-[10px] text-slate-500 block">IBR / NIBR</label>
                                  <select
                                    value={group.ibrStatus}
                                    onChange={(e) =>
                                      handleUpdateGroupField(group.id, 'ibrStatus', e.target.value)
                                    }
                                    className="w-full rounded border border-slate-300 p-1 text-xs font-bold"
                                  >
                                    <option value="IBR">IBR</option>
                                    <option value="NIBR">NIBR</option>
                                  </select>
                                </div>
                              </div>
                              <div>
                                <label className="text-[10px] text-slate-500 block">Spec</label>
                                <input
                                  type="text"
                                  value={group.spec}
                                  onChange={(e) =>
                                    handleUpdateGroupField(group.id, 'spec', e.target.value)
                                  }
                                  className="w-full rounded border border-slate-300 p-1 text-xs font-mono"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-slate-500 block">Grade</label>
                                <input
                                  type="text"
                                  value={group.grade}
                                  onChange={(e) =>
                                    handleUpdateGroupField(group.id, 'grade', e.target.value)
                                  }
                                  className="w-full rounded border border-slate-300 p-1 text-xs font-mono"
                                />
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
                                    handleUpdateGroupField(group.id, 'rmOd', e.target.value)
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
                                      handleUpdateGroupField(group.id, 'rmLenMin', e.target.value)
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
                                      handleUpdateGroupField(group.id, 'rmLenMax', e.target.value)
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
                                <div className="flex justify-between items-center">
                                  <span className="text-slate-500">PM OD:</span>
                                  <span className="font-mono font-bold text-slate-900 bg-white px-1.5 py-0.5 rounded border">
                                    {fmt(specs.pmOd, 2)} mm
                                  </span>
                                </div>
                                <div className="text-[10px] text-slate-400">RM OD + 5 mm</div>
                                <div className="flex justify-between items-center">
                                  <span className="text-slate-500">PM Wt:</span>
                                  <span className="font-mono font-bold text-slate-900 bg-white px-1.5 py-0.5 rounded border">
                                    {fmt(specs.pmWt, 2)} mm
                                  </span>
                                </div>
                                <div className="text-[10px] text-slate-400">Rolling WT - 0.25 mm</div>
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
                                <label className="text-[10px] text-slate-500 block">Cust. OD × WT (mm) *</label>
                                <div className="flex gap-1.5">
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={group.custOd}
                                    onChange={(e) =>
                                      handleUpdateGroupField(group.id, 'custOd', e.target.value)
                                    }
                                    className="w-1/2 rounded border border-slate-300 p-1 text-xs font-mono font-bold"
                                    placeholder="OD"
                                  />
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={group.custWt}
                                    onChange={(e) =>
                                      handleUpdateGroupField(group.id, 'custWt', e.target.value)
                                    }
                                    className="w-1/2 rounded border border-slate-300 p-1 text-xs font-mono font-bold"
                                    placeholder="WT"
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
                                      handleUpdateGroupField(group.id, 'feLen', e.target.value)
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
                                      handleUpdateGroupField(group.id, 'beLen', e.target.value)
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
                                  <label className="text-[10px] text-slate-500 block">Min (m) *</label>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={group.reqLenMin}
                                    onChange={(e) =>
                                      handleUpdateGroupField(group.id, 'reqLenMin', e.target.value)
                                    }
                                    className="w-full rounded border border-slate-300 p-1 text-xs font-mono font-bold"
                                  />
                                </div>
                                <div className="w-1/2">
                                  <label className="text-[10px] text-slate-500 block">Max (m) *</label>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={group.reqLenMax}
                                    onChange={(e) =>
                                      handleUpdateGroupField(group.id, 'reqLenMax', e.target.value)
                                    }
                                    className="w-full rounded border border-slate-300 p-1 text-xs font-mono font-bold"
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
                                      handleUpdateGroupField(group.id, 'multipleStr', e.target.value)
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
                                  <th className="px-1.5 py-0.5 border-r border-slate-200">WHF Wt</th>
                                  <th className="px-1.5 py-0.5 border-r border-slate-200">PM OD</th>
                                  <th className="px-1.5 py-0.5 border-r border-slate-200">PM Wt</th>
                                  <th className="px-1.5 py-0.5 border-r border-slate-200">PM Kg/m</th>
                                  <th className="px-1.5 py-0.5 border-r border-slate-200">PM Len</th>
                                  <th className="px-1.5 py-0.5 border-r border-slate-200">WBF Wt</th>
                                  <th className="px-1.5 py-0.5 border-r border-slate-200">Cust OD</th>
                                  <th className="px-1.5 py-0.5 border-r border-slate-200">Cust WT</th>
                                  <th className="px-1.5 py-0.5 border-r border-slate-200">Roll WT</th>
                                  <th className="px-1.5 py-0.5 border-r border-slate-200">SM Kg/m</th>
                                  <th className="px-1.5 py-0.5 border-r border-slate-200">SM Len</th>
                                  <th className="px-1.5 py-0.5 border-r border-slate-200">FE Lg</th>
                                  <th className="px-1.5 py-0.5 border-r border-slate-200">FE Wg</th>
                                  <th className="px-1.5 py-0.5 border-r border-slate-200">BE Lg</th>
                                  <th className="px-1.5 py-0.5 border-r border-slate-200">BE Wg</th>
                                  <th className="px-1.5 py-0.5 border-r border-slate-200">Eff Wg</th>
                                  <th className="px-1.5 py-0.5 border-r border-slate-200">Eff Len</th>
                                  <th className="px-1.5 py-0.5 border-r border-slate-200">E/R</th>
                                  <th className="px-1.5 py-0.5 border-r border-slate-200">Min</th>
                                  <th className="px-1.5 py-0.5 border-r border-slate-200">Max</th>
                                  <th className="px-1.5 py-0.5">Multi</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr className="text-center font-medium bg-slate-50/50">
                                  <td className="px-1.5 py-1 border-r border-slate-200 font-bold">{specs.srNo}</td>
                                  <td className="px-1.5 py-1 border-r border-slate-200 font-bold">{specs.catg}</td>
                                  <td className="px-1.5 py-1 border-r border-slate-200 max-w-[100px] truncate text-left">{specs.customer}</td>
                                  <td className="px-1.5 py-1 border-r border-slate-200 font-bold">{specs.woNo}</td>
                                  <td className="px-1.5 py-1 border-r border-slate-200 truncate max-w-[80px]">{specs.spec}</td>
                                  <td className="px-1.5 py-1 border-r border-slate-200">{specs.grade}</td>
                                  <td className="px-1.5 py-1 border-r border-slate-200 font-bold">{specs.ibr}</td>
                                  <td className="px-1.5 py-1 border-r border-slate-200 font-bold text-blue-700">{fmt(specs.rollingMtr, 0)}</td>
                                  <td className="px-1.5 py-1 border-r border-slate-200">{fmt(specs.rmOd, 2)}</td>
                                  <td className="px-1.5 py-1 border-r border-slate-200">{fmt(specs.rmLenMin, 3)}</td>
                                  <td className="px-1.5 py-1 border-r border-slate-200">{fmt(specs.rmLenMax, 3)}</td>
                                  <td className="px-1.5 py-1 border-r border-slate-200 font-bold">{fmt(specs.weightKg, 2)}</td>
                                  <td className="px-1.5 py-1 border-r border-slate-200 font-bold text-indigo-700">{specs.nos}</td>
                                  <td className="px-1.5 py-1 border-r border-slate-200 font-bold text-emerald-700">{fmt(specs.mton, 2)}</td>
                                  <td className="px-1.5 py-1 border-r border-slate-200">{fmt(specs.billetWtWhf, 2)}</td>
                                  <td className="px-1.5 py-1 border-r border-slate-200">{fmt(specs.pmOd, 2)}</td>
                                  <td className="px-1.5 py-1 border-r border-slate-200">{fmt(specs.pmWt, 2)}</td>
                                  <td className="px-1.5 py-1 border-r border-slate-200">{fmt(specs.pmKgMtr, 2)}</td>
                                  <td className="px-1.5 py-1 border-r border-slate-200">{fmt(specs.pmLen, 2)}</td>
                                  <td className="px-1.5 py-1 border-r border-slate-200">{fmt(specs.wtWbf, 2)}</td>
                                  <td className="px-1.5 py-1 border-r border-slate-200">{fmt(specs.custOd, 2)}</td>
                                  <td className="px-1.5 py-1 border-r border-slate-200">{fmt(specs.custWt, 2)}</td>
                                  <td className="px-1.5 py-1 border-r border-slate-200">{fmt(specs.rollingWt, 2)}</td>
                                  <td className="px-1.5 py-1 border-r border-slate-200">{fmt(specs.smKgMtr, 2)}</td>
                                  <td className="px-1.5 py-1 border-r border-slate-200">{fmt(specs.smLen, 2)}</td>
                                  <td className="px-1.5 py-1 border-r border-slate-200">{fmt(specs.feLen, 3)}</td>
                                  <td className="px-1.5 py-1 border-r border-slate-200">{fmt(specs.feWg, 2)}</td>
                                  <td className="px-1.5 py-1 border-r border-slate-200">{fmt(specs.beLen, 3)}</td>
                                  <td className="px-1.5 py-1 border-r border-slate-200">{fmt(specs.beWg, 2)}</td>
                                  <td className="px-1.5 py-1 border-r border-slate-200 font-bold">{fmt(specs.effectiveWg, 2)}</td>
                                  <td className="px-1.5 py-1 border-r border-slate-200 font-bold text-emerald-800">{fmt(specs.effectiveLen, 2)}</td>
                                  <td className="px-1.5 py-1 border-r border-slate-200 font-bold">{specs.erStatus}</td>
                                  <td className="px-1.5 py-1 border-r border-slate-200">{fmt(specs.minLen, 2)}</td>
                                  <td className="px-1.5 py-1 border-r border-slate-200">{fmt(specs.maxLen, 2)}</td>
                                  <td className="px-1.5 py-1 font-bold">{specs.multi}</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Campaign Consolidated Summary & Live Sheet Breakdown Preview */}
          {groups.length > 0 && (
            <div className="space-y-3">
              {/* Campaign Totals Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-100 bg-indigo-50/60 p-3.5 text-xs shadow-2xs">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-bold text-indigo-950 flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4 text-indigo-600" />
                    Consolidated Campaign Totals:
                  </span>
                  <span className="text-slate-700 font-medium">
                    <b>{groups.length}</b> Setup{groups.length === 1 ? '' : 's'}
                  </span>
                  <span className="text-slate-400">|</span>
                  <span className="text-slate-700 font-medium">
                    <b>{groups.reduce((acc, g) => acc + g.children.length, 0)}</b> Child Order(s)
                  </span>
                </div>

                <div className="flex items-center gap-4 font-mono font-bold text-sm">
                  <span className="text-indigo-950">
                    Total Pcs: <span className="text-indigo-700">{fmt(campaignSummary.grandTotalPcs)}</span>
                  </span>
                  <span className="text-indigo-950">
                    Total MTR: <span className="text-indigo-700">{fmt(campaignSummary.grandTotalMtr)} m</span>
                  </span>
                  <span className="text-indigo-950">
                    Total MT: <span className="text-emerald-700">{fmt(campaignSummary.grandTotalMt)} MT</span>
                  </span>
                </div>
              </div>

              {/* Live Sheet Breakdown Preview */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 font-bold text-slate-800">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    Factory Cutting Sheet Live Preview:
                  </span>
                  <div className="flex items-center gap-3 font-mono">
                    <span>Rolling mtr: <b className="text-blue-700">{fmt(campaignSummary.grandTotalMtr, 0)}</b></span>
                    <span>Total Orders: <b className="text-indigo-700">{groups.reduce((acc, g) => acc + 1 + g.children.length, 0)}</b></span>
                    <span>Plan MT: <b className="text-emerald-700">{fmt(campaignSummary.grandTotalMt, 1)}</b></span>
                  </div>
                </div>

                {/* Sub-row pills preview */}
                <div className="space-y-1 pt-1 font-mono text-[11px]">
                  {groups.flatMap((g, gIdx) => {
                    const gSum = campaignSummary.groupSummaries.find((s) => s.groupId === g.id);
                    const pMtr = gSum?.parentMtr || 0;
                    const fs = `${fmt(g.wo.size_od, 2)}x${fmt(g.wo.size_wt, 2)}`;
                    const fl = `${fmt(g.wo.l1, 2)}-${fmt(g.wo.l2, 2)}`;

                    const parentPill = (
                      <div
                        key={`p-${g.id}`}
                        className="bg-white border border-slate-200 rounded px-2.5 py-1 text-slate-800 shadow-2xs"
                      >
                        <span className="font-bold text-indigo-700 mr-1.5">Setup #{gIdx + 1} [Master]:</span>
                        <span className="font-bold">{g.catg}</span>(finish size-{fs})(Final len - {fl})(OA-{g.wo.work_order_no})(Cust.- {g.wo.customer_name || '—'})(HTC mtr-{fmt(pMtr, 0)})
                      </div>
                    );

                    const childPills = g.children.map((c) => {
                      const cSumEntry = gSum?.childSummaries.find((cs) => cs.id === c.id);
                      const cMtr = cSumEntry?.mtr || 0;
                      const cfs = `${fmt(c.wo.size_od, 2)}x${fmt(c.wo.size_wt, 2)}`;
                      const cfl = `${fmt(c.wo.l1, 2)}-${fmt(c.wo.l2, 2)}`;

                      return (
                        <div
                          key={`c-${c.wo.id}`}
                          className="bg-emerald-50/70 border border-emerald-200 rounded px-2.5 py-1 text-slate-800 ml-4 shadow-2xs"
                        >
                          <span className="font-bold text-emerald-800 mr-1.5">↳ Child of #{g.wo.work_order_no}:</span>
                          <span className="font-bold">{g.catg}</span>(finish size-{cfs})(Final len - {cfl})(OA-{c.wo.work_order_no})(Cust.- {c.wo.customer_name || '—'})(HTC mtr-{fmt(cMtr, 0)})
                        </div>
                      );
                    });

                    return [parentPill, ...childPills];
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Submit Button - All setups in one go */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="submit"
              disabled={loading || !canManagePlans || groups.length === 0}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-2.5 rounded-lg cursor-pointer text-sm shadow-md transition"
            >
              {loading ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Issuing Rolling Plan in One Go...
                </>
              ) : (
                <>
                  <Layers className="mr-2 h-4 w-4" />
                  Issue Rolling Plan ({groups.length} Setup{groups.length === 1 ? '' : 's'} in One Go)
                </>
              )}
            </Button>
          </div>
        </form>
      </div>

      {/* Rolling Plans Management Table */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Active Rolling Plans</h2>
            <p className="text-xs text-slate-500">
              Showing master campaigns and linked child plans with routing parameters.
            </p>
          </div>

          {/* Filter Tabs: All / Master / Child */}
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 text-xs">
            <button
              type="button"
              onClick={() => setPlanTypeFilter('all')}
              className={`rounded-md px-3 py-1.5 font-semibold transition-colors cursor-pointer ${
                planTypeFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Plans ({plans.length})
            </button>
            <button
              type="button"
              onClick={() => setPlanTypeFilter('master')}
              className={`rounded-md px-3 py-1.5 font-semibold transition-colors cursor-pointer flex items-center gap-1 ${
                planTypeFilter === 'master'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Crown className="h-3 w-3 text-indigo-600" />
              Master Plans
            </button>
            <button
              type="button"
              onClick={() => setPlanTypeFilter('child')}
              className={`rounded-md px-3 py-1.5 font-semibold transition-colors cursor-pointer flex items-center gap-1 ${
                planTypeFilter === 'child'
                  ? 'bg-white text-teal-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Link2 className="h-3 w-3 text-teal-600" />
              Child Plans
            </button>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              type="text"
              placeholder="Search plan no, WO no, customer, grade..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <Select
            value={filterRoute}
            onChange={(e) => setFilterRoute(e.target.value)}
            className="w-44"
          >
            <option value="">All Routes</option>
            {routes.map((r) => (
              <option key={r.id} value={r.route_code}>
                {r.route_code}
              </option>
            ))}
          </Select>

          <Button
            type="button"
            variant="outline"
            onClick={() => void loadPlans()}
            disabled={plansLoading}
            className="cursor-pointer"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${plansLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Plans Table */}
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2.5 font-bold">Plan No</th>
                <th className="px-3 py-2.5 font-bold">Type</th>
                <th className="px-3 py-2.5 font-bold">Date</th>
                <th className="px-3 py-2.5 font-bold">Work Order</th>
                <th className="px-3 py-2.5 font-bold">Customer & Grade</th>
                <th className="px-3 py-2.5 font-bold">Final Size (OD × WT × Len)</th>
                <th className="px-3 py-2.5 font-bold">Route</th>
                <th className="px-3 py-2.5 font-bold text-right">Planned PCS</th>
                <th className="px-3 py-2.5 font-bold text-right">Planned MTR</th>
                <th className="px-3 py-2.5 font-bold text-right">Planned MT</th>
                <th className="px-3 py-2.5 font-bold">MH Size</th>
                <th className="px-3 py-2.5 font-bold text-center">Pass</th>
                <th className="px-3 py-2.5 font-bold">Status</th>
                <th className="px-3 py-2.5 text-center font-bold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {plansLoading ? (
                <tr>
                  <td colSpan={14} className="p-8 text-center text-slate-400">
                    <RefreshCw className="inline h-5 w-5 animate-spin mr-2" />
                    Loading rolling plans...
                  </td>
                </tr>
              ) : filteredPlans.length === 0 ? (
                <tr>
                  <td colSpan={14} className="p-8 text-center text-slate-500">
                    No rolling plans found matching the filters.
                  </td>
                </tr>
              ) : (
                filteredPlans.map((p) => {
                  let parsedStatus: any = {};
                  try {
                    parsedStatus = typeof p.status === 'string' ? JSON.parse(p.status) : p.status;
                  } catch {}

                  const isMaster = !!parsedStatus?.is_master;
                  const isChild = !!parsedStatus?.is_child;
                  const rawChildOrders: any[] = parsedStatus?.child_work_orders || [];
                  // Exclude the master plan itself if it was mistakenly stored in child_work_orders
                  const childOrders = rawChildOrders.filter((c: any) => {
                    if (c.work_order_id && p.work_order_id && c.work_order_id === p.work_order_id) return false;
                    const cDigits = String(c.work_order_no || '').replace(/\D/g, '');
                    const pDigits = String(p.work_order_no || '').replace(/\D/g, '');
                    if (cDigits && pDigits && cDigits === pDigits) return false;
                    return true;
                  });
                  const isExpanded = expandedMasterPlans[p.id];

                  return (
                    <>
                      <tr
                        key={p.id}
                        className={
                          isMaster
                            ? 'bg-indigo-50/20 hover:bg-indigo-50/40'
                            : isChild
                            ? 'bg-slate-50/40 hover:bg-slate-50'
                            : 'hover:bg-slate-50/60'
                        }
                      >
                        <td className="px-3 py-2 font-mono font-bold text-slate-900 whitespace-nowrap">
                          {p.plan_no}
                        </td>

                        {/* Plan Type Badge */}
                        <td className="px-3 py-2 whitespace-nowrap">
                          {isMaster ? (
                            <div className="flex items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 text-indigo-800 px-2 py-0.5 text-[11px] font-bold">
                                <Crown className="h-3 w-3" />
                                Master
                              </span>
                              {childOrders.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedMasterPlans((prev) => ({
                                      ...prev,
                                      [p.id]: !prev[p.id],
                                    }))
                                  }
                                  className="text-indigo-600 hover:text-indigo-800 text-[10px] font-semibold underline cursor-pointer inline-flex items-center"
                                >
                                  {childOrders.length} Child{childOrders.length === 1 ? '' : 'ren'}
                                  {isExpanded ? (
                                    <ChevronUp className="h-3 w-3 ml-0.5" />
                                  ) : (
                                    <ChevronDown className="h-3 w-3 ml-0.5" />
                                  )}
                                </button>
                              )}
                            </div>
                          ) : isChild ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-teal-100 text-teal-800 px-2 py-0.5 text-[11px] font-semibold">
                              <Link2 className="h-3 w-3" />
                              Child (Master: {parsedStatus.master_wo_no || '—'})
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px]">Standard</span>
                          )}
                        </td>

                        <td className="px-3 py-2 font-mono text-slate-600 whitespace-nowrap">
                          {p.planned_rolling_date}
                        </td>

                        <td className="px-3 py-2 font-bold text-slate-800 whitespace-nowrap">
                          {p.work_order_no}
                        </td>

                        <td className="px-3 py-2 max-w-[150px] truncate text-slate-600">
                          <div className="font-semibold text-slate-800">{p.customer_name || '—'}</div>
                          <div className="text-[10px] text-slate-500">{p.grade}</div>
                        </td>

                        <td className="px-3 py-2 font-mono whitespace-nowrap">
                          <div className="font-semibold">{fmt(p.od)} × {fmt(p.wt)} mm</div>
                          {(() => {
                            const lenStr = formatFinalSizeLength(p);
                            return lenStr ? <div className="text-[10px] text-slate-500">{lenStr}</div> : null;
                          })()}
                        </td>

                        <td className="px-3 py-2">
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-700">
                            {p.route_code}
                          </span>
                        </td>

                        {(() => {
                          const hl1Num = Number(p.mh_l1 || 0);
                          const hl2Num = Number(p.mh_l2 || 0);
                          const hlAvg = (hl1Num > 0 && hl2Num > 0)
                            ? (hl1Num + hl2Num) / 2
                            : (hl1Num > 0 ? hl1Num : (hl2Num > 0 ? hl2Num : p.avg_length || 6.0));
                          const hod = Number(p.mh_od || 0) > 0 ? Number(p.mh_od) : Number(p.od || 0);
                          const hwt = Number(p.mh_wt || 0) > 0 ? Number(p.mh_wt) : Number(p.wt || 0);
                          const pcs = Number(p.planned_pcs || 0);
                          const mtr = p.planned_mtr || (pcs > 0 ? Number((pcs * hlAvg).toFixed(2)) : 0);
                          const mt = p.planned_mt || ((hod > 0 && hwt > 0 && hod > hwt)
                            ? Number(((hod - hwt) * hwt * 0.0246615 * 0.001 * mtr).toFixed(3))
                            : 0);

                          return (
                            <>
                              <td className="px-3 py-2 text-right font-mono font-bold text-slate-900">
                                {pcs > 0 ? fmt(pcs) : '—'}
                              </td>
                              <td className="px-3 py-2 text-right font-mono font-bold text-indigo-900">
                                {mtr > 0 ? `${fmt(mtr)} m` : '—'}
                              </td>
                              <td className="px-3 py-2 text-right font-mono font-bold text-emerald-900">
                                {mt > 0 ? `${fmt(mt)} MT` : '—'}
                              </td>
                            </>
                          );
                        })()}

                        <td className="px-3 py-2 font-mono whitespace-nowrap text-slate-700">
                          {p.mh_od && p.mh_wt ? (
                            <div>
                              <span className="font-semibold">{fmt(p.mh_od)} × {fmt(p.mh_wt)} mm</span>
                              {(p.mh_l1 || p.mh_l2) && (
                                <div className="text-[10px] text-slate-400">
                                  L: {fmt(p.mh_l1)}–{fmt(p.mh_l2)}m
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>

                        <td className="px-3 py-2 text-center font-bold">{p.pass_required}</td>

                        <td className="px-3 py-2">
                          <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                            {isMaster ? 'Master Campaign' : isChild ? 'Child Linked' : 'Scheduled'}
                          </span>
                        </td>

                        <td className="px-2.5 py-1.5 whitespace-nowrap text-center">
                          {canManagePlans ? (
                            <div className="flex items-center justify-center gap-1.5">
                              {!p.can_modify && (
                                <span
                                  className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 border border-amber-200"
                                  title="Production entries have already been recorded for this Work Order"
                                >
                                  <Lock className="h-2.5 w-2.5 text-amber-600" />
                                  In Prod
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => startEdit(p)}
                                className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer shadow-2xs"
                                title={!p.can_modify ? 'Edit plan specifications (Admin override)' : 'Edit plan'}
                              >
                                <Edit2 className="h-3 w-3 text-slate-500" />
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => openDeleteModal(p)}
                                className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 cursor-pointer shadow-2xs"
                                title={isMaster ? 'Delete Master Campaign & All Child Plans' : 'Delete rolling plan'}
                              >
                                <Trash2 className="h-3 w-3" />
                                Delete
                              </button>
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                              <Lock className="h-3 w-3" />
                              Locked
                            </span>
                          )}
                        </td>
                      </tr>

                      {/* Expanded Sub-table for Master Plan's Child Orders */}
                      {isMaster && isExpanded && childOrders.length > 0 && (
                        <tr className="bg-indigo-50/40">
                          <td colSpan={14} className="p-3 pl-8">
                            <div className="rounded-lg border border-indigo-200 bg-white p-3 shadow-xs">
                              <div className="mb-2 flex items-center justify-between">
                                <h4 className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                                  <Link2 className="h-3.5 w-3.5 text-indigo-600" />
                                  Linked Child Work Orders in Campaign {p.plan_no}
                                </h4>
                                <span className="text-[11px] text-slate-500">
                                  Will be available at Finishing for bundling (Rule 2)
                                </span>
                              </div>
                              <table className="w-full text-left text-xs">
                                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                                  <tr>
                                    <th className="px-2 py-1.5 font-semibold">Child WO No</th>
                                    <th className="px-2 py-1.5 font-semibold">Customer</th>
                                    <th className="px-2 py-1.5 font-semibold">Grade</th>
                                    <th className="px-2 py-1.5 font-semibold">Size</th>
                                    <th className="px-2 py-1.5 font-semibold text-right">Planned PCS</th>
                                    <th className="px-2 py-1.5 font-semibold text-right">Planned MTR</th>
                                    <th className="px-2 py-1.5 font-semibold text-right">Planned MT</th>
                                    {canManagePlans && (
                                      <th className="px-2 py-1.5 font-semibold text-center w-20">Actions</th>
                                    )}
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {childOrders.map((c: any, idx: number) => {
                                    const childPlan = plans.find(
                                      (pl) => pl.id === c.plan_id || pl.work_order_id === c.work_order_id
                                    );
                                    return (
                                      <tr key={idx} className="hover:bg-slate-50">
                                        <td className="px-2 py-1.5 font-bold text-slate-800">
                                          {c.work_order_no}
                                        </td>
                                        <td className="px-2 py-1.5 text-slate-600">
                                          {c.customer_name || '—'}
                                        </td>
                                        <td className="px-2 py-1.5 text-slate-600">{c.grade || '—'}</td>
                                        <td className="px-2 py-1.5 font-mono">
                                          {(() => {
                                            const childWoMatch = wos.find(
                                              (w) => w.id === c.work_order_id || (w.work_order_no && c.work_order_no && String(w.work_order_no).replace(/\D/g, '') === String(c.work_order_no).replace(/\D/g, ''))
                                            );
                                            const dispOd = childWoMatch?.size_od ?? (c.size_od && Number(c.size_od) > 0 ? c.size_od : p.od);
                                            const dispWt = childWoMatch?.size_wt ?? (c.size_wt && Number(c.size_wt) > 0 && Number(c.size_wt) !== 4.73 ? c.size_wt : (childWoMatch?.size_wt ?? p.wt));
                                            return (
                                              <>
                                                <div className="font-semibold">{fmt(dispOd)} × {fmt(dispWt)} mm</div>
                                                {(() => {
                                                  const childLenStr = formatFinalSizeLength({
                                                    l1: childWoMatch?.l1 ?? c.l1,
                                                    l2: childWoMatch?.l2 ?? c.l2,
                                                    avg_length: (c.l1 && c.l2) ? (Number(c.l1) + Number(c.l2)) / 2 : (c.l1 || c.l2 || p.avg_length),
                                                  });
                                                  return childLenStr ? <div className="text-[10px] text-slate-500">{childLenStr}</div> : null;
                                                })()}
                                              </>
                                            );
                                          })()}
                                        </td>
                                        {(() => {
                                          const cPcs = Number(c.planned_pcs || 0);
                                          const hl1Num = Number(p.mh_l1 || 0);
                                          const hl2Num = Number(p.mh_l2 || 0);
                                          const hlAvg = (hl1Num > 0 && hl2Num > 0)
                                            ? (hl1Num + hl2Num) / 2
                                            : (hl1Num > 0 ? hl1Num : (hl2Num > 0 ? hl2Num : p.avg_length || 6.0));
                                          const hod = Number(p.mh_od || 0) > 0 ? Number(p.mh_od) : Number(c.size_od || 0);
                                          const hwt = Number(p.mh_wt || 0) > 0 ? Number(p.mh_wt) : Number(c.size_wt || 0);
                                          const cMtr = Number(c.planned_mtr || (cPcs > 0 ? Number((cPcs * hlAvg).toFixed(2)) : 0));
                                          const cMt = Number(c.planned_mt || ((hod > 0 && hwt > 0 && hod > hwt) ? Number(((hod - hwt) * hwt * 0.0246615 * 0.001 * cMtr).toFixed(3)) : 0));

                                          return (
                                            <>
                                              <td className="px-2 py-1.5 text-right font-mono font-bold text-slate-800">
                                                {cPcs > 0 ? fmt(cPcs) : '—'}
                                              </td>
                                              <td className="px-2 py-1.5 text-right font-mono font-bold text-indigo-900">
                                                {cMtr > 0 ? `${fmt(cMtr)} m` : '—'}
                                              </td>
                                              <td className="px-2 py-1.5 text-right font-mono font-bold text-emerald-900">
                                                {cMt > 0 ? `${fmt(cMt)} MT` : '—'}
                                              </td>
                                            </>
                                          );
                                        })()}
                                        {canManagePlans && (
                                          <td className="px-2 py-1.5 text-center whitespace-nowrap">
                                            {childPlan ? (
                                              <div className="flex items-center justify-center gap-1">
                                                <button
                                                  type="button"
                                                  onClick={() => startEdit(childPlan)}
                                                  className="p-1 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 cursor-pointer"
                                                  title="Edit child plan"
                                                >
                                                  <Edit2 className="h-3 w-3" />
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => openDeleteModal(childPlan)}
                                                  className="p-1 rounded text-rose-500 hover:text-rose-700 hover:bg-rose-100/60 cursor-pointer"
                                                  title="Delete & unlink child plan"
                                                >
                                                  <Trash2 className="h-3 w-3" />
                                                </button>
                                              </div>
                                            ) : (
                                              <span className="text-[10px] text-slate-400">Linked</span>
                                            )}
                                          </td>
                                        )}
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Single Plan Edit Modal */}
      {editing && (() => {
        let editingIsMaster = false;
        let editingIsChild = false;
        let editingMasterPlanNo = '';
        let editingMasterWoNo = '';
        try {
          const st = typeof editing.status === 'string' ? JSON.parse(editing.status) : editing.status;
          if (st?.is_master) editingIsMaster = true;
          if (st?.is_child) {
            editingIsChild = true;
            editingMasterPlanNo = st.master_plan_no || '';
            editingMasterWoNo = st.master_wo_no || '';
          }
        } catch {}

        const editHollowSpecs: HollowDimensions = {
          od: editMhOd || editing.mh_od,
          wt: editMhWt || editing.mh_wt,
          l1: editMhL1 || editing.mh_l1,
          l2: editMhL2 || editing.mh_l2,
        };

        const masterPcsNum = Number(editQtyPcs) || 0;
        const masterMetrics = calcHollowMetrics(
          {
            id: editing.work_order_id,
            work_order_no: editing.work_order_no,
            size_od: editing.od,
            size_wt: editing.wt,
            l1: editing.l1,
            l2: editing.l2,
          } as WO,
          masterPcsNum,
          editHollowSpecs
        );
        const masterAvg = masterMetrics.avg;
        const masterMtrVal = masterMetrics.mtr;
        const masterMtVal = masterMetrics.mt;

        // Child orders live calculation based on Mother Hollow dimensions
        let totalChildPcs = 0;
        let totalChildMtr = 0;
        let totalChildMt = 0;

        const computedChildren = editChildOrders.map((c) => {
          const cPcs = Number(c.planned_pcs) || 0;
          const cMetrics = calcHollowMetrics(
            {
              id: c.work_order_id,
              work_order_no: c.work_order_no,
              size_od: c.size_od,
              size_wt: c.size_wt,
              l1: c.l1,
              l2: c.l2,
            } as WO,
            cPcs,
            editHollowSpecs
          );

          totalChildPcs += cPcs;
          totalChildMtr += cMetrics.mtr;
          totalChildMt += cMetrics.mt;

          return { ...c, avg: cMetrics.avg, mtr: cMetrics.mtr, mt: cMetrics.mt, pcsNum: cPcs };
        });

        const totalCampaignPcs = masterPcsNum + totalChildPcs;
        const totalCampaignMtr = masterMtrVal + totalChildMtr;
        const totalCampaignMt = masterMtVal + totalChildMt;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900">
                      Edit Rolling Plan {editing.plan_no}
                    </h3>
                    {editingIsMaster ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-200">
                        👑 Master Campaign Plan
                      </span>
                    ) : editingIsChild ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
                        🔗 Child Linked Plan
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                        Single Plan
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Work Order: <span className="font-semibold text-slate-700">{editing.work_order_no}</span>
                    {editing.customer_name ? ` • ${editing.customer_name}` : ''}
                    {editing.od && editing.wt ? ` • ${editing.od} × ${editing.wt} mm` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="rounded-lg p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Notice if production logs have already been recorded */}
              {!editing.can_modify && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-semibold text-amber-950">Active Production Detected:</strong> Production entries have already been recorded for this Work Order.
                    Saving will update the rolling schedule, route, mother hollow specs, and planned quantities under Admin override.
                  </div>
                </div>
              )}

              {/* Notice for Master Campaign Plan */}
              {editingIsMaster && (
                <div className="rounded-xl border border-purple-200 bg-purple-50/70 p-3 text-xs text-purple-900 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-purple-950">
                    <CheckCircle2 className="h-4 w-4 text-purple-700" />
                    <span>Master Campaign Synchronization Active</span>
                  </div>
                  <p className="text-purple-800">
                    Modifying the <strong className="font-semibold">Planned Rolling Date</strong>,{' '}
                    <strong className="font-semibold">Target Route</strong>, and{' '}
                    <strong className="font-semibold">Mother Hollow specifications</strong> will
                    automatically propagate and update all{' '}
                    <strong className="font-semibold">{editChildOrders.length} linked Child Work Orders</strong>{' '}
                    in this rolling campaign.
                  </p>
                </div>
              )}

              {/* Notice for Child Plan */}
              {editingIsChild && (
                <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3 text-xs text-blue-900">
                  <div className="flex items-center gap-1.5 font-bold text-blue-950">
                    <Info className="h-4 w-4 text-blue-700" />
                    <span>Linked to Master Campaign {editingMasterPlanNo || editingMasterWoNo}</span>
                  </div>
                  <p className="text-blue-800 mt-1">
                    Rolling Date, Route, and Mother Hollow specifications are synchronized from the Master Plan.
                    You can adjust this Child Work Order&apos;s Planned Quantity below, and the Campaign totals will automatically rebalance.
                  </p>
                </div>
              )}

              {/* Master / Main Order Parameters */}
              <div className="bg-slate-50/80 rounded-xl p-4 border border-slate-200 space-y-3">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                  {editingIsMaster ? 'Master Work Order Planning' : 'Plan Parameters'}
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Planned Quantity (PCS) *
                    </label>
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      value={editQtyPcs}
                      onChange={(e) => setEditQtyPcs(e.target.value)}
                    />
                    <div className="text-[11px] text-slate-500 font-mono mt-1">
                      {fmt(masterMtrVal)} m • {fmt(masterMtVal)} MT
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Planned Rolling Date * {editingIsMaster && <span className="text-purple-600 font-normal">(Sync)</span>}
                    </label>
                    <Input
                      type="date"
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Target Route * {editingIsMaster && <span className="text-purple-600 font-normal">(Sync)</span>}
                    </label>
                    <Select value={editRoute} onChange={(e) => setEditRoute(e.target.value)}>
                      {routes.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.route_code} — {r.route_name}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Multiple {editingIsMaster && <span className="text-purple-600 font-normal">(Sync)</span>}
                    </label>
                    <Input
                      type="number"
                      step="0.001"
                      value={editMultiple}
                      onChange={(e) => setEditMultiple(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      MH OD (mm) {editingIsMaster && <span className="text-purple-600 font-normal">(Sync)</span>}
                    </label>
                    <Input
                      type="number"
                      step="0.001"
                      value={editMhOd}
                      onChange={(e) => setEditMhOd(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      MH WT (mm) {editingIsMaster && <span className="text-purple-600 font-normal">(Sync)</span>}
                    </label>
                    <Input
                      type="number"
                      step="0.001"
                      value={editMhWt}
                      onChange={(e) => setEditMhWt(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      MH L1 (m) {editingIsMaster && <span className="text-purple-600 font-normal">(Sync)</span>}
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      value={editMhL1}
                      onChange={(e) => setEditMhL1(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      MH L2 (m) {editingIsMaster && <span className="text-purple-600 font-normal">(Sync)</span>}
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      value={editMhL2}
                      onChange={(e) => setEditMhL2(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Pass Required {editingIsMaster && <span className="text-purple-600 font-normal">(Sync)</span>}
                    </label>
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      value={editPassRequired}
                      onChange={(e) => setEditPassRequired(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Setup Specifications (35-Column Standards) */}
              {(() => {
                const liveRmOd = Number(editRmOd) || 63.0;
                const rawLiveRmMin = Number(editRmLenMin) || 2.030;
                const liveRmMin = rawLiveRmMin > 20 ? Number((rawLiveRmMin / 1000).toFixed(3)) : rawLiveRmMin;
                const liveWeightKg = Number((((liveRmOd * liveRmOd * 3.14 * 0.007856) / 4) * liveRmMin).toFixed(2));
                const liveBilletWhf = Number((liveWeightKg * 0.97).toFixed(2));

                const liveCustOd = Number(editCustOd) || 47.0;
                const liveCustWt = Number(editCustWt) || 6.25;
                const liveRollingWt = Number(editRollingWt) || liveCustWt;

                const livePmOd = Number(editPmOd) || 66.0;
                const livePmWt = Number(editPmWt) || 6.00;
                const livePmKgMtr = (livePmOd > livePmWt && livePmWt > 0) ? Number(((livePmOd - livePmWt) * livePmWt * 0.02467).toFixed(3)) : 8.88;
                const livePmLen = livePmKgMtr > 0 ? Number((liveBilletWhf / livePmKgMtr).toFixed(2)) : 5.37;

                const liveSmKgMtr = (liveCustOd > liveCustWt && liveCustWt > 0) ? Number(((liveCustOd - liveCustWt) * liveCustWt * 0.02467).toFixed(3)) : 6.28;
                const liveSmLen = liveSmKgMtr > 0 ? Number((liveBilletWhf / liveSmKgMtr).toFixed(2)) : 7.67;

                const liveFeLen = Number(editFeLen) || 0;
                const liveBeLen = Number(editBeLen) || 0;
                const liveFeWg = Number((liveSmKgMtr * liveFeLen).toFixed(2));
                const liveBeWg = Number((liveSmKgMtr * liveBeLen).toFixed(2));
                const liveEffectiveWg = Number(Math.max(0, liveBilletWhf - liveFeWg - liveBeWg).toFixed(2));
                const liveEffLen = liveSmKgMtr > 0 ? Number((liveEffectiveWg / liveSmKgMtr).toFixed(2)) : liveSmLen;

                return (
                  <div className="bg-slate-50/80 rounded-xl p-4 border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                        <Flame className="h-4 w-4 text-orange-600" />
                        <span>Setup Specifications (35-Column Standards)</span>
                      </h4>
                      <span className="text-[11px] text-slate-500 font-medium">Billet & Hollow Parameters</span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Catg</label>
                        <Input value={editCatg} onChange={(e) => setEditCatg(e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Spec</label>
                        <Input value={editSpec} onChange={(e) => setEditSpec(e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Grade</label>
                        <Input value={editGrade} onChange={(e) => setEditGrade(e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">IBR / NIBR</label>
                        <Select value={editIbrStatus} onChange={(e) => setEditIbrStatus(e.target.value)}>
                          <option value="IBR">IBR</option>
                          <option value="NIBR">NIBR</option>
                        </Select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">RM OD (mm)</label>
                        <Input type="number" step="0.01" value={editRmOd} onChange={(e) => setEditRmOd(e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">RM Len Min (m)</label>
                        <Input type="number" step="0.001" value={editRmLenMin} onChange={(e) => setEditRmLenMin(e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">RM Len Max (m)</label>
                        <Input type="number" step="0.001" value={editRmLenMax} onChange={(e) => setEditRmLenMax(e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">PM OD (mm)</label>
                        <Input type="number" step="0.1" value={editPmOd} onChange={(e) => setEditPmOd(e.target.value)} />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">PM Wt (mm)</label>
                        <Input type="number" step="0.01" value={editPmWt} onChange={(e) => setEditPmWt(e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Cust OD (mm)</label>
                        <Input
                          type="number"
                          step="0.01"
                          value={editCustOd}
                          onChange={(e) => {
                            setEditCustOd(e.target.value);
                            setEditMhOd(e.target.value);
                          }}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Cust WT (mm)</label>
                        <Input type="number" step="0.01" value={editCustWt} onChange={(e) => setEditCustWt(e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Rolling WT (mm)</label>
                        <Input
                          type="number"
                          step="0.01"
                          value={editRollingWt}
                          onChange={(e) => {
                            setEditRollingWt(e.target.value);
                            setEditMhWt(e.target.value);
                          }}
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">FE Lg (m)</label>
                        <Input type="number" step="0.001" value={editFeLen} onChange={(e) => setEditFeLen(e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">BE Lg (m)</label>
                        <Input type="number" step="0.001" value={editBeLen} onChange={(e) => setEditBeLen(e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">E/R (EL / RL)</label>
                        <Select value={editReqLenEr} onChange={(e) => setEditReqLenEr(e.target.value)}>
                          <option value="EL">EL (Exact Length)</option>
                          <option value="RL">RL (Random Length)</option>
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">Min Len (m)</label>
                          <Input
                            type="number"
                            step="0.01"
                            value={editReqLenMin}
                            onChange={(e) => {
                              setEditReqLenMin(e.target.value);
                              setEditMhL1(e.target.value);
                            }}
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">Max Len (m)</label>
                          <Input
                            type="number"
                            step="0.01"
                            value={editReqLenMax}
                            onChange={(e) => {
                              setEditReqLenMax(e.target.value);
                              setEditMhL2(e.target.value);
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Real-Time Calculation Preview Banner */}
                    <div className="rounded-lg bg-indigo-50/70 border border-indigo-200 p-2.5 grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs">
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
                        <span className="font-mono font-black text-indigo-950">{fmt(livePmKgMtr, 2)} kg/m • {fmt(livePmLen, 2)}m</span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-500 font-bold uppercase">SM (Kg/m • Len)</span>
                        <span className="font-mono font-black text-indigo-950">{fmt(liveSmKgMtr, 2)} kg/m • {fmt(liveSmLen, 2)}m</span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-500 font-bold uppercase">Effective Len</span>
                        <span className="font-mono font-black text-emerald-800">{fmt(liveEffLen, 2)} m</span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Tolerances & Process Yield */}
              <div className="bg-slate-50/80 rounded-xl p-4 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-teal-600" />
                    <span>Tolerances & Process Yield</span>
                  </h4>
                  <span className="text-[11px] text-slate-500 font-medium">Quality Tolerances</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">OD Min (mm)</label>
                    <Input type="number" step="0.01" value={editTolOdMin} onChange={(e) => setEditTolOdMin(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">OD Max (mm)</label>
                    <Input type="number" step="0.01" value={editTolOdMax} onChange={(e) => setEditTolOdMax(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">WT Min (mm)</label>
                    <Input type="number" step="0.01" value={editTolWtMin} onChange={(e) => setEditTolWtMin(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">WT Max (mm)</label>
                    <Input type="number" step="0.01" value={editTolWtMax} onChange={(e) => setEditTolWtMax(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Process Yield (%)</label>
                    <Input type="number" step="0.01" value={editProcessYieldPct} onChange={(e) => setEditProcessYieldPct(e.target.value)} />
                  </div>
                </div>
              </div>

              {/* Linked Child Orders Section (When editing Master Plan) */}
              {editingIsMaster && computedChildren.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                      <Layers className="h-4 w-4 text-purple-600" />
                      <span>Linked Child Work Orders in Campaign ({computedChildren.length})</span>
                    </h4>
                    <span className="text-xs text-slate-500 font-medium">
                      You can adjust individual child quantities here
                    </span>
                  </div>

                  <div className="rounded-xl border border-slate-200 overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100/80 text-slate-700 font-semibold border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2">Work Order & Customer</th>
                          <th className="px-3 py-2">Pipe Size</th>
                          <th className="px-3 py-2 w-32">Planned PCS</th>
                          <th className="px-3 py-2 text-right">Planned MTR</th>
                          <th className="px-3 py-2 text-right">Planned MT</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {computedChildren.map((c) => (
                          <tr key={c.work_order_id} className="hover:bg-slate-50/50">
                            <td className="px-3 py-2">
                              <span className="font-mono font-bold text-slate-900">{c.work_order_no}</span>
                              <div className="text-[11px] text-slate-500 truncate max-w-[200px]">
                                {c.customer_name || c.grade || '—'}
                              </div>
                            </td>
                            <td className="px-3 py-2 font-mono text-slate-700">
                              {c.size_od} × {c.size_wt} mm
                            </td>
                            <td className="px-3 py-2">
                              <Input
                                type="number"
                                min="1"
                                step="1"
                                className="h-8 text-xs py-1"
                                value={c.planned_pcs}
                                onChange={(e) =>
                                  handleUpdateEditChildPcs(c.work_order_id, e.target.value)
                                }
                              />
                            </td>
                            <td className="px-3 py-2 text-right font-mono font-bold text-indigo-700">
                              {fmt(c.mtr)} m
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-slate-700">
                              {fmt(c.mt)} MT
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Campaign Summary Footer Box */}
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-indigo-950">Updated Campaign Total:</span>
                      <span className="text-slate-600 font-mono">
                        Master ({fmt(masterMtrVal)} m) + Children ({fmt(totalChildMtr)} m)
                      </span>
                    </div>
                    <div className="flex items-center gap-4 font-mono font-bold">
                      <span className="text-indigo-900">
                        {fmt(totalCampaignPcs)} <span className="font-normal text-xs text-indigo-700">PCS</span>
                      </span>
                      <span className="text-indigo-900">
                        {fmt(totalCampaignMtr)} <span className="font-normal text-xs text-indigo-700">MTR</span>
                      </span>
                      <span className="text-indigo-900">
                        {fmt(totalCampaignMt)} <span className="font-normal text-xs text-indigo-700">MT</span>
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={saveEdit}
                  disabled={editSaving}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
                >
                  {editSaving ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Delete Confirmation Modal */}
      {deletingPlan && (() => {
        let isMaster = false;
        let isChild = false;
        let childOrders: any[] = [];
        let masterPlanNo = '';
        let masterWoNo = '';
        try {
          const parsed = typeof deletingPlan.status === 'string' ? JSON.parse(deletingPlan.status) : deletingPlan.status;
          if (parsed?.is_master) {
            isMaster = true;
            childOrders = parsed.child_work_orders || [];
          }
          if (parsed?.is_child) {
            isChild = true;
            masterPlanNo = parsed.master_plan_no || '';
            masterWoNo = parsed.master_wo_no || '';
          }
        } catch {}

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
                    <Trash2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      {isMaster
                        ? 'Delete Master Campaign Plan'
                        : isChild
                        ? 'Delete Linked Child Plan'
                        : 'Delete Rolling Plan'}
                    </h3>
                    <div className="text-xs text-slate-500">
                      Plan No: <span className="font-mono font-bold text-slate-800">{deletingPlan.plan_no}</span>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDeletingPlan(null)}
                  disabled={isDeleting}
                  className="rounded-lg p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Target Plan Summary */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Work Order:</span>
                  <span className="font-bold text-slate-800 font-mono">{deletingPlan.work_order_no}</span>
                </div>
                {deletingPlan.customer_name && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Customer:</span>
                    <span className="font-medium text-slate-800">{deletingPlan.customer_name}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Target Size & Grade:</span>
                  <span className="font-mono text-slate-800">
                    {deletingPlan.od} × {deletingPlan.wt} mm ({deletingPlan.grade || '—'})
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Planned Quantity:</span>
                  <span className="font-bold text-indigo-900 font-mono">
                    {fmt(deletingPlan.planned_pcs)} PCS • {fmt(deletingPlan.planned_mtr)} m
                  </span>
                </div>
              </div>

              {/* Master Plan Cascade Warning */}
              {isMaster && (
                <div className="rounded-xl border border-purple-200 bg-purple-50/70 p-3 text-xs text-purple-900 space-y-2">
                  <div className="flex items-center gap-1.5 font-bold text-purple-950">
                    <AlertTriangle className="h-4 w-4 text-purple-700 shrink-0" />
                    <span>Multi-WO Campaign Cascade Notice</span>
                  </div>
                  <p className="text-purple-900 leading-relaxed">
                    This Master Plan coordinates a rolling campaign. Deleting this Master Plan will{' '}
                    <strong className="font-semibold text-purple-950 underline">
                      also delete all {childOrders.length} linked Child Work Order plans
                    </strong>{' '}
                    in this campaign.
                  </p>
                  {childOrders.length > 0 && (
                    <div className="max-h-32 overflow-y-auto rounded-lg border border-purple-200/80 bg-white p-2 space-y-1">
                      {childOrders.map((c: any, idx: number) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between text-[11px] text-slate-700 py-0.5 border-b border-slate-100 last:border-0"
                        >
                          <span className="font-mono font-bold text-purple-950">{c.work_order_no}</span>
                          <span className="text-slate-500">{c.size_od} × {c.size_wt} mm</span>
                          <span className="font-mono font-semibold text-slate-800">{fmt(c.planned_pcs)} PCS</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-[11px] text-purple-800 font-medium">
                    All {childOrders.length + 1} Work Orders will be automatically returned to &apos;Pending Plan&apos; status so they can be re-scheduled.
                  </p>
                </div>
              )}

              {/* Child Plan Notice */}
              {isChild && (
                <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3 text-xs text-blue-900 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-blue-950">
                    <Info className="h-4 w-4 text-blue-700 shrink-0" />
                    <span>Individual Child Plan Unlink & Delete</span>
                  </div>
                  <p className="text-blue-800 leading-relaxed">
                    Deleting this Child Plan will return Work Order <strong className="font-semibold">{deletingPlan.work_order_no}</strong> to &apos;Pending Plan&apos;.
                    The Master Campaign ({masterPlanNo || masterWoNo}) will automatically recalculate and rebalance its total PCS, MTR, and MT.
                  </p>
                </div>
              )}

              {/* Active Production Logs Checkbox */}
              {!deletingPlan.can_modify && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950 space-y-2">
                  <div className="flex items-center gap-1.5 font-bold text-amber-900">
                    <Lock className="h-4 w-4 text-amber-700 shrink-0" />
                    <span>Production Logs Detected (Admin Override)</span>
                  </div>
                  <p className="text-amber-900 leading-relaxed">
                    Production entries have already been logged for this Work Order. An Admin override is applied to permit this deletion.
                  </p>
                  <label className="flex items-start gap-2 rounded-lg border border-amber-300/80 bg-white p-2.5 cursor-pointer hover:bg-amber-50/50">
                    <input
                      type="checkbox"
                      checked={deleteClearLogs}
                      onChange={(e) => setDeleteClearLogs(e.target.checked)}
                      className="mt-0.5 rounded border-amber-400 text-rose-600 focus:ring-rose-500"
                    />
                    <div>
                      <strong className="block font-semibold text-amber-950">
                        Also delete recorded production logs for these work orders
                      </strong>
                      <span className="block text-[11px] text-amber-800 font-normal mt-0.5">
                        Clean reset: removes all recorded shift logs so work orders return to 0% progress. If unchecked, logs remain in history but unlinked.
                      </span>
                    </div>
                  </label>
                </div>
              )}

              {/* Modal Buttons */}
              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  disabled={isDeleting}
                  onClick={() => setDeletingPlan(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={isDeleting}
                  onClick={executeDeletePlan}
                  className="bg-rose-600 hover:bg-rose-700 text-white font-bold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="h-4 w-4" />
                  {isDeleting
                    ? 'Deleting...'
                    : isMaster
                    ? 'Delete Master & All Child Plans'
                    : 'Delete Rolling Plan'}
                </Button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal Dialog for Multi-Work Order Selection */}
      {isMultiPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-4xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900">
                  Select Multiple Work Orders for Rolling Plan
                </h3>
                <span className="rounded-full bg-indigo-50 text-indigo-700 px-2.5 py-0.5 text-xs font-semibold">
                  {modalSelectedIds.length} Selected
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsMultiPickerOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Filters in Modal */}
            <div className="my-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2 relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by WO#, customer, grade, or size (e.g. 38.1)..."
                  value={modalSearch}
                  onChange={(e) => setModalSearch(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:outline-hidden"
                />
              </div>

              <div>
                <select
                  value={modalGradeFilter}
                  onChange={(e) => setModalGradeFilter(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 focus:border-indigo-500 focus:outline-hidden"
                >
                  <option value="ALL">All Material Grades</option>
                  {availableGrades.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Quick Grade Filter Chips */}
            <div className="flex flex-wrap items-center gap-1.5 mb-3 text-xs">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Quick Filter:</span>
              <button
                type="button"
                onClick={() => setModalGradeFilter('ALL')}
                className={`px-2 py-0.5 rounded-md font-semibold cursor-pointer transition ${
                  modalGradeFilter === 'ALL'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                All ({wos.length})
              </button>
              {availableGrades.slice(0, 5).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setModalGradeFilter(g)}
                  className={`px-2 py-0.5 rounded-md font-semibold cursor-pointer transition ${
                    modalGradeFilter === g
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>

            {/* Modal Work Orders Table */}
            <div className="flex-1 overflow-y-auto border border-slate-200 rounded-xl min-h-[250px]">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 text-slate-700">
                  <tr>
                    <th className="p-2.5 text-center w-10">
                      <input
                        type="checkbox"
                        checked={
                          modalFilteredWos.length > 0 &&
                          modalFilteredWos.every((w) => modalSelectedIds.includes(w.id))
                        }
                        onChange={(e) => {
                          if (e.target.checked) {
                            const allIds = Array.from(
                              new Set([...modalSelectedIds, ...modalFilteredWos.map((w) => w.id)])
                            );
                            setModalSelectedIds(allIds);
                          } else {
                            const unselected = new Set(modalFilteredWos.map((w) => w.id));
                            setModalSelectedIds(modalSelectedIds.filter((id) => !unselected.has(id)));
                          }
                        }}
                        className="rounded border-slate-300 text-indigo-600 cursor-pointer"
                      />
                    </th>
                    <th className="px-3 py-2 font-bold">Work Order #</th>
                    <th className="px-3 py-2 font-bold">Customer</th>
                    <th className="px-3 py-2 font-bold">Grade</th>
                    <th className="px-3 py-2 font-bold">Size (OD × WT)</th>
                    <th className="px-3 py-2 font-bold">Length</th>
                    <th className="px-3 py-2 font-bold text-right">Balance Unplanned</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {modalFilteredWos.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-slate-400">
                        No work orders found matching your search or filters.
                      </td>
                    </tr>
                  ) : (
                    modalFilteredWos.map((w) => {
                      const isChecked = modalSelectedIds.includes(w.id);
                      return (
                        <tr
                          key={w.id}
                          onClick={() => {
                            setModalSelectedIds((prev) =>
                              prev.includes(w.id) ? prev.filter((x) => x !== w.id) : [...prev, w.id]
                            );
                          }}
                          className={`cursor-pointer transition ${
                            isChecked ? 'bg-indigo-50/70 font-semibold' : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="p-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                setModalSelectedIds((prev) =>
                                  prev.includes(w.id) ? prev.filter((x) => x !== w.id) : [...prev, w.id]
                                );
                              }}
                              className="rounded border-slate-300 text-indigo-600 cursor-pointer"
                            />
                          </td>
                          <td className="px-3 py-2 font-mono font-bold text-slate-900">{w.work_order_no}</td>
                          <td className="px-3 py-2 text-slate-700">{w.customer_name || 'Standard Stock'}</td>
                          <td className="px-3 py-2 font-mono text-slate-600">{w.grade}</td>
                          <td className="px-3 py-2 font-mono font-semibold">
                            {w.size_od} × {w.size_wt} mm
                          </td>
                          <td className="px-3 py-2 font-mono text-slate-500">
                            {w.l1 && w.l2 ? `${w.l1}–${w.l2} m` : w.l1 || w.l2 ? `${w.l1 || w.l2} m` : '—'}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-slate-900">
                            {fmt(w.balance_qty_mtr)} MTR
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Modal Footer Actions */}
            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
              <div className="text-xs text-slate-500">
                Selected: <span className="font-bold text-indigo-700">{modalSelectedIds.length}</span> order(s)
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsMultiPickerOpen(false)}
                  className="rounded-lg border border-slate-300 px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={modalSelectedIds.length === 0}
                  onClick={() => handleBatchAddOrders(modalSelectedIds)}
                  className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-50 transition cursor-pointer"
                >
                  Add Selected ({modalSelectedIds.length}) Orders
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Dialog for Adding Child Work Orders to a Specific Setup Group */}
      {activeChildTargetGroupId !== null && (() => {
        const targetGroup = groups.find((g) => g.id === activeChildTargetGroupId);
        if (!targetGroup) return null;
        const targetGroupIndex = groups.indexOf(targetGroup);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
            <div className="w-full max-w-4xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link2 className="h-5 w-5 text-emerald-600" />
                  <h3 className="text-base font-bold text-slate-900">
                    Add Child Work Order to Setup #{targetGroupIndex + 1}
                  </h3>
                  <span className="rounded-full bg-emerald-50 text-emerald-700 px-2.5 py-0.5 text-xs font-bold border border-emerald-200">
                    Parent WO: {targetGroup.wo.work_order_no} ({targetGroup.wo.size_od}×{targetGroup.wo.size_wt}mm)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveChildTargetGroupId(null)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Filters Bar */}
              <div className="my-3 flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search by WO No, customer, size, grade..."
                    value={childModalSearch}
                    onChange={(e) => setChildModalSearch(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 py-1.5 pl-9 pr-3 text-xs focus:border-emerald-500 focus:outline-hidden"
                  />
                </div>
                <select
                  value={childModalGradeFilter}
                  onChange={(e) => setChildModalGradeFilter(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium cursor-pointer"
                >
                  <option value="ALL">All Grades</option>
                  {availableGrades.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>

              {/* Work Orders Table */}
              <div className="flex-1 overflow-y-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-100 text-slate-700 font-bold border-b border-slate-200 shadow-2xs">
                    <tr>
                      <th className="px-3 py-2.5">Work Order</th>
                      <th className="px-3 py-2.5">Customer</th>
                      <th className="px-3 py-2.5">Grade</th>
                      <th className="px-3 py-2.5">Size (OD × WT)</th>
                      <th className="px-3 py-2.5">Length</th>
                      <th className="px-3 py-2.5 text-right">Available Balance</th>
                      <th className="px-3 py-2.5 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {childModalFilteredWos.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-slate-400">
                          No eligible work orders available to add as child.
                        </td>
                      </tr>
                    ) : (
                      childModalFilteredWos.map((w) => (
                        <tr key={w.id} className="hover:bg-emerald-50/40 transition">
                          <td className="px-3 py-2 font-mono font-bold text-slate-900">{w.work_order_no}</td>
                          <td className="px-3 py-2 text-slate-700">{w.customer_name || 'Standard Stock'}</td>
                          <td className="px-3 py-2 font-mono text-slate-600">{w.grade}</td>
                          <td className="px-3 py-2 font-mono font-semibold">
                            {w.size_od} × {w.size_wt} mm
                          </td>
                          <td className="px-3 py-2 font-mono text-slate-500">
                            {w.l1 && w.l2 ? `${w.l1}–${w.l2} m` : w.l1 || w.l2 ? `${w.l1 || w.l2} m` : '—'}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-slate-900">
                            {fmt(w.balance_qty_mtr)} MTR
                          </td>
                          <td className="px-3 py-2 text-center">
                            <Button
                              type="button"
                              onClick={() => handleAddChildToGroup(targetGroup.id, w)}
                              className="h-7 px-2.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-md cursor-pointer inline-flex items-center gap-1 shadow-2xs"
                            >
                              <Plus className="h-3 w-3" />
                              Add as Child
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Modal Footer Actions */}
              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                <div className="text-xs text-slate-500">
                  Current children in this setup:{' '}
                  <span className="font-bold text-emerald-700">{targetGroup.children.length}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    onClick={() => setActiveChildTargetGroupId(null)}
                    className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold px-4 py-1.5 rounded-lg cursor-pointer"
                  >
                    Done Adding Children
                  </Button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
