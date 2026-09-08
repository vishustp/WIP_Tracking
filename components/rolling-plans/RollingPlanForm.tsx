'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
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

  // Setup Specifications & Factory Tolerances
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

export function createDefaultGroup(wo: WO, availMtr: number): WorkOrderGroup {
  const lAvg = wo.l1 && wo.l2 ? (wo.l1 + wo.l2) / 2 : wo.l1 || 6;
  const initPcs = availMtr > 0 ? Math.max(1, Math.floor(availMtr / lAvg)) : 100;
  const custOdNum = Number(wo.size_od || 47.0);
  const custWtNum = Number(wo.size_wt || 5.75);
  const smLenNum = Number(wo.l1 || 7.67);

  const pmOdNum = Number((custOdNum * 1.4).toFixed(1));
  const pmWtNum = Number((custWtNum * 0.95).toFixed(2));

  return {
    id: `grp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    wo,
    plannedPcs: String(initPcs),
    availableMtr: availMtr,
    children: [],

    catg: 'CDS',
    spec: 'ASME SA210 Gr.A1',
    grade: wo.grade || 'SAE 1018',
    ibrStatus: 'IBR',
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
    reqLenEr: 'EL',
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
  const [monthStr, setMonthStr] = useState('Sep-26');
  const [planNoOverride, setPlanNoOverride] = useState('02');
  const [prevPlanNo, setPrevPlanNo] = useState('01');

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
        .select('id,work_order_no,customer_name,grade,size_od,size_wt,l1,l2,ordered_qty,uom,balance_qty_mtr')
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
        .select('id,work_order_no,customer_name,grade,size_od,size_wt,l1,l2,ordered_qty,uom,balance_qty_mtr')
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
        // Auto-select initial WO if query param present
        if (initialWoId && woList.length > 0) {
          const match = woList.find((x) => x.id === initialWoId);
          if (match) {
            const availMtr = await fetchUnplannedQty(match.id);
            setGroups([createDefaultGroup(match, availMtr)]);
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
    const newGrp = createDefaultGroup(targetWo, availMtr);
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

    const newGroups: WorkOrderGroup[] = [];
    for (const targetWo of toAdd) {
      const availMtr = await fetchUnplannedQty(targetWo.id);
      newGroups.push(createDefaultGroup(targetWo, availMtr));
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
      prev.map((g) => (g.id === groupId ? { ...g, [field]: value } : g))
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

    const groupSummaries = groups.map((g) => {
      const smLenNum = Number(g.smLen || g.effLen || g.wo.l1 || 6.0);
      const avgLen = smLenNum > 0 ? smLenNum : 6.0;
      const custOdNum = Number(g.custOd || g.wo.size_od || 0);
      const custWtNum = Number(g.custWt || g.rollingWt || g.wo.size_wt || 0);

      const calcMtr = (pcs: number) => Number((pcs * avgLen).toFixed(2));
      const calcMt = (mtr: number) =>
        Number((Math.max(custOdNum - custWtNum, 0) * Math.max(custWtNum, 0) * 0.0246615 * 0.001 * mtr).toFixed(3));

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

    if (!route) {
      toast.error('Please select a Target Process Route.');
      return;
    }

    setLoading(true);

    try {
      const payload: CreateMultiWoRollingPlanPayload = {
        mill_name: millName,
        month_str: monthStr,
        plan_no_override: planNoOverride.trim() || undefined,
        prev_plan_no: prevPlanNo,
        rolling_date: date,
        route_id: route,
        multiple: Number(groups[0]?.multipleStr === '2' || groups[0]?.multipleStr === '2-Multi' ? 2 : 1),

        master_groups: groups.map((g) => {
          const gSummary = campaignSummary.groupSummaries.find((s) => s.groupId === g.id)!;
          const parentSmLen = Number(g.smLen || g.effLen || g.wo.l1 || 6.0);
          const parentAvgLen = parentSmLen > 0 ? parentSmLen : 6.0;
          const calcNos = gSummary.totalGroupMtr > 0 ? Math.ceil(gSummary.totalGroupMtr / parentAvgLen) : gSummary.totalGroupPcs;
          const calcMton = gSummary.totalGroupMt;

          return {
            master_work_order_id: g.wo.id,
            master_planned_pcs: gSummary.parentPcs,
            master_planned_mtr: gSummary.parentMtr,
            master_planned_mt: gSummary.parentMt,

            // Setup specifications for this work order
            catg: g.catg,
            spec: g.spec,
            grade: g.grade,
            ibr_status: g.ibrStatus,
            rolling_mtr: gSummary.totalGroupMtr,

            rm_od: Number(g.rmOd),
            rm_len_min: Number(g.rmLenMin),
            rm_len_max: Number(g.rmLenMax),
            plan_qty_nos: calcNos,
            plan_qty_mton: calcMton,

            pm_od: Number(g.pmOd),
            pm_wt: Number(g.pmWt),
            pm_len: Number(g.pmLen),

            cust_od: Number(g.custOd),
            cust_wt: Number(g.custWt),
            rolling_wt: Number(g.rollingWt),
            sm_len: Number(g.smLen),

            fe_len: Number(g.feLen),
            be_len: Number(g.beLen),
            eff_len: Number(g.effLen),

            req_len_er: g.reqLenEr,
            req_len_min: Number(g.reqLenMin),
            req_len_max: Number(g.reqLenMax),
            multiple_str: g.multipleStr,
            multiple: Number(g.multipleStr === '2' || g.multipleStr === '2-Multi' ? 2 : 1),
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
                catg: g.catg,
                finish_size: `${fmt(c.wo.size_od, 2)}x${fmt(c.wo.size_wt, 2)}`,
                final_len: `${fmt(c.wo.l1, 2)}-${fmt(c.wo.l2, 2)}`,
                hollow_len: `${fmt(g.reqLenMin, 2)}-${fmt(g.reqLenMax, 2)}`,
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
    try {
      const parsed = typeof p.status === 'string' ? JSON.parse(p.status) : p.status;
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

    const mhOdVal = Number(editMhOd);
    const mhWtVal = Number(editMhWt);
    const mhL1Val = Number(editMhL1) || 6.0;
    const mhL2Val = Number(editMhL2) || 6.5;

    if (editMhOd && (!Number.isFinite(mhOdVal) || mhOdVal <= 0)) {
      toast.error('Enter valid MH OD.');
      return;
    }
    if (editMhWt && (!Number.isFinite(mhWtVal) || mhWtVal <= 0)) {
      toast.error('Enter valid MH WT.');
      return;
    }

    setEditSaving(true);
    try {
      const payload: any = {
        plan_id: editing.id,
        planned_pcs: pcs,
        planned_rolling_date: editDate,
        route_id: editRoute,
        multiple: Number(editMultiple) || 1,
        pass_required: Number(editPassRequired) || 1,
        force: true,
      };

      if (Number.isFinite(mhOdVal) && mhOdVal > 0) payload.mh_od = mhOdVal;
      if (Number.isFinite(mhWtVal) && mhWtVal > 0) payload.mh_wt = mhWtVal;
      if (Number.isFinite(mhL1Val) && mhL1Val > 0) payload.mh_l1 = mhL1Val;
      if (Number.isFinite(mhL2Val) && mhL2Val > 0) payload.mh_l2 = mhL2Val;

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

      toast.success(data.message || 'Rolling plan updated successfully.');
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

            {/* Campaign Subheaders Grid */}
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-6">
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
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Campaign Month
                </label>
                <Input
                  type="text"
                  value={monthStr}
                  disabled={!canManagePlans}
                  onChange={(e) => setMonthStr(e.target.value)}
                  placeholder="e.g. Sep-26"
                  className="bg-white text-xs font-medium font-mono"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Daily Plan No :-
                </label>
                <Input
                  type="text"
                  value={planNoOverride}
                  disabled={!canManagePlans}
                  onChange={(e) => setPlanNoOverride(e.target.value)}
                  placeholder="e.g. 02"
                  className="bg-white text-xs font-bold font-mono text-indigo-700"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Started after Plan No.
                </label>
                <Input
                  type="text"
                  value={prevPlanNo}
                  disabled={!canManagePlans}
                  onChange={(e) => setPrevPlanNo(e.target.value)}
                  placeholder="e.g. 01"
                  className="bg-white text-xs font-medium font-mono"
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
                  className="bg-white text-xs font-medium"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Process Route *
                </label>
                <Select
                  value={route}
                  disabled={!canManagePlans}
                  onChange={(e) => setRoute(e.target.value)}
                  required
                  className="bg-white text-xs font-medium"
                >
                  <option value="">Select Route</option>
                  {routes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.route_code} — {r.route_name}
                    </option>
                  ))}
                </Select>
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

              {/* Work Order Picker Controls: Batch Dialog Button + Single Select */}
              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                <Button
                  type="button"
                  onClick={() => {
                    setModalSelectedIds([]);
                    setIsMultiPickerOpen(true);
                  }}
                  disabled={!canManagePlans}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs h-9 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Select Multiple Work Orders (Dialog)
                </Button>

                <Select
                  value={addWoSelectValue}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val) handleAddOrder(val);
                  }}
                  disabled={!canManagePlans}
                  className="w-full sm:w-72 bg-white"
                >
                  <option value="">+ Add Single Work Order...</option>
                  {availableWosToAdd.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.work_order_no} · {w.size_od}×{w.size_wt}mm · {w.grade} · {fmt(w.balance_qty_mtr)} MTR
                    </option>
                  ))}
                </Select>
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
                  const pMetrics = { pcs: gSummary?.parentPcs || 0, mtr: gSummary?.parentMtr || 0, mt: gSummary?.parentMt || 0, avg: gSummary?.avgLen || 0 };

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
                              ({group.catg} · RM {group.rmOd}mm · PM {group.pmOd}mm · SM {group.custOd}×{group.custWt})
                            </span>
                          </button>

                          {groups.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveGroup(group.id)}
                              className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer transition"
                              title="Remove this setup group"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          )}
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
                        <div className="border-t border-amber-200 bg-amber-50/40 p-4 space-y-3">
                          <div className="text-xs font-bold text-amber-950 flex items-center justify-between">
                            <span className="flex items-center gap-1.5">
                              <Flame className="h-4 w-4 text-amber-600" />
                              Setup Specifications & Factory Tolerances (Setup #{groupIndex + 1})
                            </span>
                            <span className="text-[11px] text-amber-800 font-normal">
                              Values propagate to shop floor cutting plan for this setup
                            </span>
                          </div>

                          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-5 text-xs">
                            {/* 1. Classification */}
                            <div className="space-y-1.5 p-2 rounded-md bg-white border border-slate-200 shadow-2xs">
                              <span className="font-bold text-slate-800 block text-[11px] uppercase tracking-wider">
                                Classification
                              </span>
                              <div>
                                <label className="text-[10px] text-slate-500 block">Category (Catg)</label>
                                <select
                                  value={group.catg}
                                  onChange={(e) =>
                                    handleUpdateGroupField(group.id, 'catg', e.target.value)
                                  }
                                  className="w-full rounded border border-slate-300 p-1 text-xs font-semibold"
                                >
                                  <option value="CDS">CDS (Cold Drawn)</option>
                                  <option value="HFS">HFS (Hot Finished)</option>
                                </select>
                              </div>
                              <div>
                                <label className="text-[10px] text-slate-500 block">Specification (Spec)</label>
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
                                <label className="text-[10px] text-slate-500 block">Grade & IBR Status</label>
                                <div className="flex gap-1">
                                  <input
                                    type="text"
                                    value={group.grade}
                                    onChange={(e) =>
                                      handleUpdateGroupField(group.id, 'grade', e.target.value)
                                    }
                                    className="w-2/3 rounded border border-slate-300 p-1 text-xs font-mono"
                                  />
                                  <select
                                    value={group.ibrStatus}
                                    onChange={(e) =>
                                      handleUpdateGroupField(group.id, 'ibrStatus', e.target.value)
                                    }
                                    className="w-1/3 rounded border border-slate-300 p-1 text-xs font-bold"
                                  >
                                    <option value="IBR">IBR</option>
                                    <option value="NIBR">NIBR</option>
                                  </select>
                                </div>
                              </div>
                            </div>

                            {/* 2. Billet Dimensions */}
                            <div className="space-y-1.5 p-2 rounded-md bg-white border border-slate-200 shadow-2xs">
                              <span className="font-bold text-slate-800 block text-[11px] uppercase tracking-wider">
                                Billet Dimensions
                              </span>
                              <div>
                                <label className="text-[10px] text-slate-500 block">RM OD (mm)</label>
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
                              <div>
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
                              <div>
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

                            {/* 3. Piercer Mill */}
                            <div className="space-y-1.5 p-2 rounded-md bg-white border border-slate-200 shadow-2xs">
                              <span className="font-bold text-slate-800 block text-[11px] uppercase tracking-wider">
                                Piercer Mill
                              </span>
                              <div>
                                <label className="text-[10px] text-slate-500 block">PM OD (mm)</label>
                                <input
                                  type="number"
                                  step="0.1"
                                  value={group.pmOd}
                                  onChange={(e) =>
                                    handleUpdateGroupField(group.id, 'pmOd', e.target.value)
                                  }
                                  className="w-full rounded border border-slate-300 p-1 text-xs font-mono font-bold"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-slate-500 block">PM Wthk (mm)</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={group.pmWt}
                                  onChange={(e) =>
                                    handleUpdateGroupField(group.id, 'pmWt', e.target.value)
                                  }
                                  className="w-full rounded border border-slate-300 p-1 text-xs font-mono"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-slate-500 block">PM Length (m)</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={group.pmLen}
                                  onChange={(e) =>
                                    handleUpdateGroupField(group.id, 'pmLen', e.target.value)
                                  }
                                  className="w-full rounded border border-slate-300 p-1 text-xs font-mono"
                                />
                              </div>
                            </div>

                            {/* 4. SM / Sizing Mill */}
                            <div className="space-y-1.5 p-2 rounded-md bg-white border border-slate-200 shadow-2xs">
                              <span className="font-bold text-slate-800 block text-[11px] uppercase tracking-wider">
                                SM (Sizing Mill)
                              </span>
                              <div>
                                <label className="text-[10px] text-slate-500 block">Cust. OD × WT (mm)</label>
                                <div className="flex gap-1">
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
                              <div>
                                <label className="text-[10px] text-slate-500 block">Rolling WT (mm)</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={group.rollingWt}
                                  onChange={(e) =>
                                    handleUpdateGroupField(group.id, 'rollingWt', e.target.value)
                                  }
                                  className="w-full rounded border border-slate-300 p-1 text-xs font-mono"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-slate-500 block">SM Length (m)</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={group.smLen}
                                  onChange={(e) =>
                                    handleUpdateGroupField(group.id, 'smLen', e.target.value)
                                  }
                                  className="w-full rounded border border-slate-300 p-1 text-xs font-mono"
                                />
                              </div>
                            </div>

                            {/* 5. Tolerances & Process Yield */}
                            <div className="space-y-1.5 p-2 rounded-md bg-white border border-slate-200 shadow-2xs">
                              <span className="font-bold text-slate-800 block text-[11px] uppercase tracking-wider">
                                Tolerances & Mult
                              </span>
                              <div>
                                <label className="text-[10px] text-slate-500 block">Mult / Multiple</label>
                                <input
                                  type="text"
                                  value={group.multipleStr}
                                  onChange={(e) =>
                                    handleUpdateGroupField(group.id, 'multipleStr', e.target.value)
                                  }
                                  placeholder="e.g. 1 or 2-Multi"
                                  className="w-full rounded border border-slate-300 p-1 text-xs font-mono font-bold"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-slate-500 block">OD Min - Max</label>
                                <div className="flex gap-1">
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={group.tolOdMin}
                                    onChange={(e) =>
                                      handleUpdateGroupField(group.id, 'tolOdMin', e.target.value)
                                    }
                                    className="w-1/2 rounded border border-slate-300 p-1 text-xs font-mono"
                                  />
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={group.tolOdMax}
                                    onChange={(e) =>
                                      handleUpdateGroupField(group.id, 'tolOdMax', e.target.value)
                                    }
                                    className="w-1/2 rounded border border-slate-300 p-1 text-xs font-mono"
                                  />
                                </div>
                              </div>
                              <div>
                                <label className="text-[10px] text-slate-500 block">Process Yield %</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={group.processYieldPct}
                                  onChange={(e) =>
                                    handleUpdateGroupField(group.id, 'processYieldPct', e.target.value)
                                  }
                                  className="w-full rounded border border-slate-300 p-1 text-xs font-mono font-bold text-emerald-700"
                                />
                              </div>
                            </div>
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
                  const childOrders = parsedStatus?.child_work_orders || [];
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
                                          <div className="font-semibold">{c.size_od} × {c.size_wt} mm</div>
                                          {(() => {
                                            const childLenStr = formatFinalSizeLength({
                                              l1: c.l1,
                                              l2: c.l2,
                                              avg_length: (c.l1 && c.l2) ? (Number(c.l1) + Number(c.l2)) / 2 : (c.l1 || c.l2 || p.avg_length),
                                            });
                                            return childLenStr ? <div className="text-[10px] text-slate-500">{childLenStr}</div> : null;
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
                  {Array.from(new Set(availableWosToAdd.map((w) => w.grade).filter(Boolean))).map((g) => (
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
