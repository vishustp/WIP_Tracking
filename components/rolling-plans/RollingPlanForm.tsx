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

export interface SelectedOrderEntry {
  wo: WO;
  isMaster: boolean;
  plannedPcs: string;
  availableMtr: number;
}

const fmt = (n: number | null | undefined) =>
  n == null
    ? '—'
    : Number(n).toLocaleString(undefined, {
        maximumFractionDigits: 3,
      });

export interface HollowDimensions {
  od?: number | string | null;
  wt?: number | string | null;
  l1?: number | string | null;
  l2?: number | string | null;
}

// Calculate Planned MTR and MT based on Mother Hollow OD, WT, and Average Length
const calcHollowMetrics = (
  wo: WO | null,
  pcs: number,
  hollow?: HollowDimensions
) => {
  if (!wo && pcs <= 0) return { avg: 0, mtr: 0, mt: 0, hod: 0, hwt: 0 };

  const hl1 = Number(hollow?.l1 || 0);
  const hl2 = Number(hollow?.l2 || 0);
  const wol1 = Number(wo?.l1 || 0);
  const wol2 = Number(wo?.l2 || 0);

  // 1. Hollow average length takes priority; falls back to WO length or 6.0m
  const avg = (hl1 > 0 && hl2 > 0)
    ? (hl1 + hl2) / 2
    : (hl1 > 0 ? hl1 : (hl2 > 0 ? hl2 : ((wol1 > 0 && wol2 > 0) ? (wol1 + wol2) / 2 : wol1 || wol2 || 6.0)));

  // 2. Planned MTR = Planned PCS * Hollow Average Length
  const mtr = Number((pcs * avg).toFixed(2));

  // 3. Hollow OD & WT take priority; falls back to WO OD & WT if hollow not yet specified
  const hod = Number(hollow?.od || 0) > 0 ? Number(hollow?.od) : Number(wo?.size_od || 0);
  const hwt = Number(hollow?.wt || 0) > 0 ? Number(hollow?.wt) : Number(wo?.size_wt || 0);

  // 4. Planned MT = (Hollow OD - Hollow WT) * Hollow WT * 0.0246615 * 0.001 * Planned MTR
  const mt = Number(
    (Math.max(hod - hwt, 0) * Math.max(hwt, 0) * 0.0246615 * 0.001 * mtr).toFixed(3)
  );

  return { avg, mtr, mt, hod, hwt };
};

export default function RollingPlanForm() {
  const searchParams = useSearchParams();
  const initialWoId = searchParams?.get('wo') || '';

  const [wos, setWos] = useState<WO[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);

  // Selected work orders for the campaign (Rule 1)
  const [selectedOrders, setSelectedOrders] = useState<SelectedOrderEntry[]>([]);
  const [woSearchQuery, setWoSearchQuery] = useState('');
  const [addWoSelectValue, setAddWoSelectValue] = useState('');

  // Common campaign parameters
  const [route, setRoute] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [mhOd, setMhOd] = useState('');
  const [mhWt, setMhWt] = useState('');
  const [mhL1, setMhL1] = useState('6.0');
  const [mhL2, setMhL2] = useState('6.5');
  const [passRequired, setPassRequired] = useState('1');
  const [multiple, setMultiple] = useState('1');
  const [loading, setLoading] = useState(false);

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
      let mhMap: Record<string, any> = {};
      if (planIds.length > 0) {
        const { data: rpDetails } = await s
          .from('rolling_plans')
          .select('id, mh_od, mh_wt, mh_l1, mh_l2, pass_required, multiple, status, planned_qty')
          .in('id', planIds);

        if (rpDetails) {
          for (const d of rpDetails) {
            mhMap[d.id] = d;
          }
        }
      }

      const enrichedPlans: Plan[] = rawPlans.map((p) => {
        const detail = mhMap[p.id];
        let parsedSt: any = {};
        try {
          parsedSt = typeof detail?.status === 'string'
            ? JSON.parse(detail.status)
            : detail?.status || (typeof p.status === 'string' ? JSON.parse(p.status) : p.status || {});
        } catch {}

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
          : (hl1 > 0 ? hl1 : (hl2 > 0 ? hl2 : Number(p.avg_length || 6.0)));

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
        const hod = Number(mhOd || 0) > 0 ? Number(mhOd) : Number(p.od || 0);
        const hwt = Number(mhWt || 0) > 0 ? Number(mhWt) : Number(p.wt || 0);
        const mt = (hod > 0 && hwt > 0 && hod > hwt)
          ? Number(((hod - hwt) * hwt * 0.0246615 * 0.001 * mtr).toFixed(3))
          : (Number(parsedSt?.master_planned_mt || parsedSt?.planned_mt || p.planned_mt) || 0);

        return {
          ...p,
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

  // Helper to suggest standard Mother Hollow dimensions based on finished pipe size
  const suggestMhDimensions = useCallback((wo: WO) => {
    const od = Number(wo.size_od || 0);
    const wt = Number(wo.size_wt || 0);
    if (od > 0 && wt > 0) {
      // Standard Mother Hollow expansion: OD typically +10-25%, WT +20-35%
      const suggestedOd = Number((od * 1.18).toFixed(1));
      const suggestedWt = Number((wt * 1.25).toFixed(2));
      setMhOd(String(suggestedOd));
      setMhWt(String(suggestedWt));
    }
  }, []);

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
        if (initialWoId && woList.length > 0) {
          const match = woList.find((x) => x.id === initialWoId);
          if (match) {
            const availMtr = await fetchUnplannedQty(match.id);
            const lAvg = match.l1 && match.l2 ? (match.l1 + match.l2) / 2 : match.l1 || 6;
            const initPcs = availMtr > 0 ? Math.floor(availMtr / lAvg) : 100;
            setSelectedOrders([
              {
                wo: match,
                isMaster: true,
                plannedPcs: String(initPcs),
                availableMtr: availMtr,
              },
            ]);
            suggestMhDimensions(match);
          }
        }
      })
      .catch((error) => {
        setWos([]);
        setRoutes([]);
        toast.error(error instanceof Error ? error.message : 'Failed to load rolling plan masters.');
      });
  }, [initialWoId, fetchUnplannedQty, suggestMhDimensions]);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  // Add work order to campaign
  const handleAddOrder = async (woId: string) => {
    if (!woId) return;
    if (selectedOrders.some((s) => s.wo.id === woId)) {
      toast.info('This work order is already selected in the campaign.');
      setAddWoSelectValue('');
      return;
    }

    const targetWo = wos.find((w) => w.id === woId);
    if (!targetWo) return;

    const availMtr = await fetchUnplannedQty(woId);
    const avgLen = targetWo.l1 && targetWo.l2 ? (targetWo.l1 + targetWo.l2) / 2 : targetWo.l1 || 6;
    const defaultPcs = availMtr > 0 ? Math.min(100, Math.floor(availMtr / avgLen)) : 50;

    const isFirst = selectedOrders.length === 0;

    setSelectedOrders((prev) => [
      ...prev,
      {
        wo: targetWo,
        isMaster: isFirst, // First one is Master by default (Rule 1)
        plannedPcs: String(defaultPcs),
        availableMtr: availMtr,
      },
    ]);

    if (isFirst) {
      suggestMhDimensions(targetWo);
    }

    setAddWoSelectValue('');
    toast.success(
      `Added ${targetWo.work_order_no} as ${isFirst ? 'Master Work Order' : 'Child Work Order'}.`
    );
  };

  // Remove work order from campaign
  const handleRemoveOrder = (woId: string) => {
    const remaining = selectedOrders.filter((s) => s.wo.id !== woId);
    // If the master was removed and there are other orders, designate the first remaining as Master
    const hasMaster = remaining.some((s) => s.isMaster);
    if (!hasMaster && remaining.length > 0) {
      remaining[0].isMaster = true;
    }
    setSelectedOrders(remaining);
  };

  // Set designated Master Work Order (Rule 1)
  const handleSetMaster = (woId: string) => {
    setSelectedOrders((prev) =>
      prev.map((s) => ({
        ...s,
        isMaster: s.wo.id === woId,
      }))
    );
    const newMaster = selectedOrders.find((s) => s.wo.id === woId);
    if (newMaster) {
      suggestMhDimensions(newMaster.wo);
      toast.success(`${newMaster.wo.work_order_no} assigned as Master Work Order.`);
    }
  };

  // Update planned PCS for a specific order
  const handleUpdatePcs = (woId: string, val: string) => {
    setSelectedOrders((prev) =>
      prev.map((s) => (s.wo.id === woId ? { ...s, plannedPcs: val } : s))
    );
  };

  // Active master work order entry
  const masterEntry = useMemo(() => selectedOrders.find((s) => s.isMaster), [selectedOrders]);
  const childEntries = useMemo(() => selectedOrders.filter((s) => !s.isMaster), [selectedOrders]);

  // Campaign Calculations based on Mother Hollow OD, WT, and Average Length
  const campaignSummary = useMemo(() => {
    let totalPcs = 0;
    let totalMtr = 0;
    let totalMt = 0;

    const hollowSpecs: HollowDimensions = { od: mhOd, wt: mhWt, l1: mhL1, l2: mhL2 };

    const orderCalculations = selectedOrders.map((entry) => {
      const pcs = Number(entry.plannedPcs || 0);
      const metrics = calcHollowMetrics(entry.wo, pcs, hollowSpecs);
      totalPcs += pcs;
      totalMtr += metrics.mtr;
      totalMt += metrics.mt;

      const availPcs = entry.availableMtr > 0 && metrics.avg > 0 ? Math.floor(entry.availableMtr / metrics.avg) : 0;
      const exceeds = metrics.mtr > entry.availableMtr + 0.001;

      return {
        id: entry.wo.id,
        work_order_no: entry.wo.work_order_no,
        isMaster: entry.isMaster,
        pcs,
        mtr: metrics.mtr,
        mt: metrics.mt,
        avgLen: metrics.avg,
        availMtr: entry.availableMtr,
        availPcs,
        exceeds,
      };
    });

    return {
      totalPcs,
      totalMtr,
      totalMt,
      orderCalculations,
      hasErrors: orderCalculations.some((o) => o.exceeds || o.pcs <= 0),
    };
  }, [selectedOrders, mhOd, mhWt, mhL1, mhL2]);

  // Submit Multi-WO Rolling Plan (Rule 1)
  async function submitMultiWoPlan(e: React.FormEvent) {
    e.preventDefault();

    if (selectedOrders.length === 0) {
      toast.error('Please select at least one Work Order for the Rolling Plan.');
      return;
    }

    if (!masterEntry) {
      toast.error('Please assign one Work Order as the Master Work Order.');
      return;
    }

    if (!route) {
      toast.error('Please select a Target Process Route.');
      return;
    }

    if (campaignSummary.hasErrors) {
      const overErr = campaignSummary.orderCalculations.find((o) => o.exceeds);
      if (overErr) {
        toast.error(
          `${overErr.work_order_no} planned quantity (${fmt(overErr.mtr)} MTR) exceeds available unplanned balance (${fmt(overErr.availMtr)} MTR).`
        );
        return;
      }
      const zeroErr = campaignSummary.orderCalculations.find((o) => o.pcs <= 0);
      if (zeroErr) {
        toast.error(`Please enter a valid Planned PCS for ${zeroErr.work_order_no}.`);
        return;
      }
    }

    const mhOdVal = Number(mhOd);
    const mhWtVal = Number(mhWt);
    const mhL1Val = Number(mhL1);
    const mhL2Val = Number(mhL2);

    if (!Number.isFinite(mhOdVal) || mhOdVal <= 0) {
      toast.error('Enter valid Mother Hollow OD.');
      return;
    }
    if (!Number.isFinite(mhWtVal) || mhWtVal <= 0) {
      toast.error('Enter valid Mother Hollow WT.');
      return;
    }
    if (!Number.isFinite(mhL1Val) || mhL1Val <= 0) {
      toast.error('Enter valid Mother Hollow L1.');
      return;
    }
    if (!Number.isFinite(mhL2Val) || mhL2Val <= 0) {
      toast.error('Enter valid Mother Hollow L2.');
      return;
    }

    setLoading(true);

    try {
      const masterCalc = campaignSummary.orderCalculations.find((o) => o.isMaster)!;

      const payload = {
        master_work_order_id: masterEntry.wo.id,
        master_planned_pcs: masterCalc.pcs,
        master_planned_mtr: masterCalc.mtr,
        master_planned_mt: masterCalc.mt,
        child_work_orders: childEntries.map((c) => {
          const cCalc = campaignSummary.orderCalculations.find((o) => o.id === c.wo.id)!;
          return {
            id: c.wo.id,
            work_order_no: c.wo.work_order_no,
            customer_name: c.wo.customer_name,
            grade: c.wo.grade,
            size_od: c.wo.size_od,
            size_wt: c.wo.size_wt,
            l1: c.wo.l1,
            l2: c.wo.l2,
            planned_pcs: cCalc.pcs,
            planned_mtr: cCalc.mtr,
            planned_mt: cCalc.mt,
          };
        }),
        rolling_date: date,
        route_id: route,
        mh_od: mhOdVal,
        mh_wt: mhWtVal,
        mh_l1: mhL1Val,
        mh_l2: mhL2Val,
        pass_required: Number(passRequired),
        multiple: Number(multiple),
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
        `Rolling Plan ${data.plan_no} created successfully! (Master WO: ${masterEntry.wo.work_order_no}, ${data.child_count || 0} Child Orders Linked)`
      );

      // Reset form
      setSelectedOrders([]);
      setMhOd('');
      setMhWt('');
      setPassRequired('1');
      setMultiple('1');

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

  // Available Work Orders for addition (exclude already selected)
  const availableWosToAdd = useMemo(() => {
    const selectedIds = new Set(selectedOrders.map((s) => s.wo.id));
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
  }, [wos, selectedOrders, woSearchQuery]);

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
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-indigo-600" />
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Issue Rolling Plan</h1>
            <span className="rounded-full bg-indigo-50 border border-indigo-200/80 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
              Campaign Planning
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500">
              {selectedOrders.length} Order{selectedOrders.length === 1 ? '' : 's'} in Campaign
            </span>
          </div>
        </div>

        <form onSubmit={submitMultiWoPlan} className="space-y-5">
          {/* Section 1: Work Order Selection & Role Assignment */}
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <span>Work Orders & Campaign Roles</span>
                <span className="text-rose-500">*</span>
              </h3>

              {/* Work Order Picker Dropdown */}
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Select
                  value={addWoSelectValue}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val) handleAddOrder(val);
                  }}
                  disabled={!canManagePlans}
                  className="w-full sm:w-80 bg-white"
                >
                  <option value="">+ Add Work Order to Campaign...</option>
                  {availableWosToAdd.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.work_order_no} · {w.size_od}×{w.size_wt}mm · {w.grade} · {fmt(w.balance_qty_mtr)} MTR
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            {/* Selected Work Orders Table / Cards */}
            {selectedOrders.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-slate-200 bg-white p-8 text-center">
                <Layers className="mx-auto h-8 w-8 text-slate-400" />
                <p className="mt-2 text-sm font-semibold text-slate-700">No Work Orders Selected</p>
                <p className="text-xs text-slate-400 mt-0.5">Select orders above to start this campaign</p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="overflow-x-auto rounded-xl border border-slate-200/80 bg-white shadow-2xs">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-700 border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2.5 font-bold">Role</th>
                        <th className="px-3 py-2.5 font-bold">Work Order</th>
                        <th className="px-3 py-2.5 font-bold">Customer & Grade</th>
                        <th className="px-3 py-2.5 font-bold">Size (OD × WT)</th>
                        <th className="px-3 py-2.5 font-bold">Length</th>
                        <th className="px-3 py-2.5 font-bold text-right">Available Unplanned</th>
                        <th className="px-3 py-2.5 font-bold text-center w-32">Planned PCS *</th>
                        <th className="px-3 py-2.5 font-bold text-right">Planned MTR</th>
                        <th className="px-3 py-2.5 font-bold text-right">Planned MT</th>
                        <th className="px-3 py-2.5 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedOrders.map((entry) => {
                        const pcsNum = Number(entry.plannedPcs || 0);
                        const metrics = calcHollowMetrics(entry.wo, pcsNum, {
                          od: mhOd,
                          wt: mhWt,
                          l1: mhL1,
                          l2: mhL2,
                        });
                        const exceeds = metrics.mtr > entry.availableMtr + 0.001;

                        return (
                          <tr
                            key={entry.wo.id}
                            className={
                              entry.isMaster
                                ? 'bg-indigo-50/40 font-medium'
                                : 'hover:bg-slate-50'
                            }
                          >
                            {/* Role Selector Button */}
                            <td className="px-3 py-2 whitespace-nowrap">
                              {entry.isMaster ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-indigo-600 px-2.5 py-1 text-xs font-bold text-white shadow-xs">
                                  <Crown className="h-3.5 w-3.5" />
                                  Master Order
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleSetMaster(entry.wo.id)}
                                  className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:border-indigo-400 hover:text-indigo-600 cursor-pointer transition-colors"
                                  title="Click to designate this as the Master Work Order"
                                >
                                  <Link2 className="h-3.5 w-3.5 text-slate-400" />
                                  Child Order (Set Master)
                                </button>
                              )}
                            </td>

                            <td className="px-3 py-2 font-bold text-slate-900 whitespace-nowrap">
                              {entry.wo.work_order_no}
                            </td>

                            <td className="px-3 py-2 max-w-[160px] truncate text-slate-600">
                              <span className="font-semibold text-slate-800">
                                {entry.wo.customer_name || '—'}
                              </span>
                              <div className="text-[11px] text-slate-500">{entry.wo.grade}</div>
                            </td>

                            <td className="px-3 py-2 font-mono whitespace-nowrap">
                              {entry.wo.size_od} × {entry.wo.size_wt} mm
                            </td>

                            <td className="px-3 py-2 font-mono whitespace-nowrap text-slate-500">
                              <div>{entry.wo.l1}–{entry.wo.l2} m (WO)</div>
                              <div className="text-[10px] text-indigo-600 font-semibold">
                                Hollow: {fmt(metrics.avg)} m avg
                              </div>
                            </td>

                            <td className="px-3 py-2 text-right font-mono whitespace-nowrap">
                              <span className="font-bold text-slate-700">
                                {fmt(entry.availableMtr)}
                              </span>{' '}
                              MTR
                              <div className="text-[10px] text-slate-400">
                                ~{metrics.avg > 0 ? Math.floor(entry.availableMtr / metrics.avg) : 0} Pcs
                              </div>
                            </td>

                            {/* Planned PCS Input */}
                            <td className="px-3 py-2 text-center">
                              <Input
                                type="number"
                                min="1"
                                step="1"
                                value={entry.plannedPcs}
                                onChange={(e) => handleUpdatePcs(entry.wo.id, e.target.value)}
                                disabled={!canManagePlans}
                                className={`h-8 w-28 text-center font-mono font-bold ${
                                  exceeds ? 'border-rose-500 text-rose-700 bg-rose-50' : 'bg-white'
                                }`}
                                required
                              />
                              {exceeds && (
                                <div className="text-[10px] text-rose-600 font-semibold mt-0.5">
                                  Exceeds available!
                                </div>
                              )}
                            </td>

                            <td className="px-3 py-2 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                              {fmt(metrics.mtr)} m
                            </td>

                            <td className="px-3 py-2 text-right font-mono text-slate-700 whitespace-nowrap">
                              {fmt(metrics.mt)} MT
                            </td>

                            <td className="px-3 py-2 text-center">
                              {selectedOrders.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveOrder(entry.wo.id)}
                                  className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                                  title="Remove order from campaign"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Campaign Totals Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-indigo-100 bg-indigo-50/50 p-3 text-xs">
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-indigo-950 flex items-center gap-1.5">
                      <Sparkles className="h-4 w-4 text-indigo-600" />
                      Consolidated Campaign Totals:
                    </span>
                    <span className="text-slate-700">
                      Master: <b>{masterEntry?.wo.work_order_no || 'None'}</b>
                    </span>
                    <span className="text-slate-500">|</span>
                    <span className="text-slate-700">
                      Child Orders: <b>{childEntries.length}</b> ({childEntries.map((c) => c.wo.work_order_no).join(', ') || 'None'})
                    </span>
                  </div>

                  <div className="flex items-center gap-4 font-mono font-bold">
                    <span className="text-indigo-900">
                      Total Pcs: <span className="text-indigo-700">{fmt(campaignSummary.totalPcs)}</span>
                    </span>
                    <span className="text-indigo-900">
                      Total MTR: <span className="text-indigo-700">{fmt(campaignSummary.totalMtr)}</span>
                    </span>
                    <span className="text-indigo-900">
                      Total MT: <span className="text-indigo-700">{fmt(campaignSummary.totalMt)}</span>
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Process Route, Date & Mother Hollow Parameters */}
          <div className="grid gap-4 md:grid-cols-4">
            {/* Route */}
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-semibold text-slate-700">
                Target Process Route *
              </label>
              <Select
                value={route}
                disabled={!canManagePlans}
                onChange={(e) => setRoute(e.target.value)}
                required
              >
                <option value="">Select Route</option>
                {routes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.route_code} — {r.route_name} ({r.material_category})
                  </option>
                ))}
              </Select>
            </div>

            {/* Rolling Date */}
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">
                Planned Rolling Date *
              </label>
              <Input
                type="date"
                value={date}
                disabled={!canManagePlans}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>

            {/* Multiple */}
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">
                Multiple *
              </label>
              <Input
                type="number"
                min="0.001"
                step="0.001"
                disabled={!canManagePlans}
                value={multiple}
                onChange={(e) => setMultiple(e.target.value)}
                required
              />
            </div>

            {/* MH OD */}
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">
                Mother Hollow OD (mm) *
              </label>
              <Input
                type="number"
                min="0"
                step="0.001"
                disabled={!canManagePlans}
                value={mhOd}
                onChange={(e) => setMhOd(e.target.value)}
                placeholder="e.g. 60.3"
                required
              />
            </div>

            {/* MH WT */}
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">
                Mother Hollow WT (mm) *
              </label>
              <Input
                type="number"
                min="0"
                step="0.001"
                disabled={!canManagePlans}
                value={mhWt}
                onChange={(e) => setMhWt(e.target.value)}
                placeholder="e.g. 4.5"
                required
              />
            </div>

            {/* MH L1 */}
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">
                Mother Hollow L1 (m) *
              </label>
              <Input
                type="number"
                min="0"
                step="0.001"
                disabled={!canManagePlans}
                value={mhL1}
                onChange={(e) => setMhL1(e.target.value)}
                required
              />
            </div>

            {/* MH L2 */}
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">
                Mother Hollow L2 (m) *
              </label>
              <Input
                type="number"
                min="0"
                step="0.001"
                disabled={!canManagePlans}
                value={mhL2}
                onChange={(e) => setMhL2(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Mother Hollow Live Calculation Summary */}
          {(() => {
            const hl1Num = Number(mhL1 || 0);
            const hl2Num = Number(mhL2 || 0);
            const mhAvgLen = hl1Num > 0 && hl2Num > 0 ? (hl1Num + hl2Num) / 2 : hl1Num || hl2Num || 0;
            const mhOdNum = Number(mhOd || 0);
            const mhWtNum = Number(mhWt || 0);
            const mhKgPerMtr = (mhOdNum > 0 && mhWtNum > 0 && mhOdNum > mhWtNum)
              ? Number(((mhOdNum - mhWtNum) * mhWtNum * 0.0246615).toFixed(3))
              : 0;

            return (
              <div className="rounded-lg border border-teal-200 bg-teal-50/70 p-3 text-xs text-teal-900 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-medium">
                  <span className="font-bold flex items-center gap-1 text-teal-950">
                    <span className="inline-block h-2 w-2 rounded-full bg-teal-500 animate-pulse" />
                    Hollow Dimensions Calculation:
                  </span>
                  <span>
                    Avg Length: <b className="font-mono">{fmt(mhAvgLen)} m</b>
                  </span>
                  <span className="text-teal-400">|</span>
                  <span>
                    Unit Weight: <b className="font-mono">{fmt(mhKgPerMtr)} kg/m</b> ({((mhKgPerMtr * 0.001) || 0).toFixed(5)} MT/m)
                  </span>
                </div>
                <div className="text-[11px] text-teal-700 italic">
                  Planned MTR = Planned Pcs × Hollow Avg Length ({fmt(mhAvgLen)}m) • Planned MT = Hollow Unit Wt × Planned MTR
                </div>
              </div>
            );
          })()}

          {/* Submit Button */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="submit"
              disabled={loading || !canManagePlans || selectedOrders.length === 0 || campaignSummary.hasErrors}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-2 rounded-lg cursor-pointer"
            >
              {loading ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Issuing Campaign Plan...
                </>
              ) : (
                <>
                  <Layers className="mr-2 h-4 w-4" />
                  Issue Rolling Plan ({selectedOrders.length} Order{selectedOrders.length === 1 ? '' : 's'})
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
                <th className="px-3 py-2.5 font-bold">Pipe Size</th>
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
                          {fmt(p.od)} × {fmt(p.wt)} mm
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
                                          {c.size_od} × {c.size_wt} mm
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

    </div>
  );
}
