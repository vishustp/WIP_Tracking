'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { mtFromMtr, fmt } from '@/lib/productionUtils';
import * as XLSX from 'xlsx';
import {
  Search,
  Filter,
  Download,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  Layers,
  Crown,
  Calendar,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Flame,
  ArrowRight,
  ShieldCheck,
  TrendingUp,
  SlidersHorizontal,
  FileSpreadsheet,
  X,
  ClipboardCheck,
  XCircle,
  PackageCheck,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import Link from 'next/link';

interface WorkOrder {
  id: string;
  work_order_no: string;
  customer_name: string | null;
  size_od: number | null;
  size_wt: number | null;
  l1: number | null;
  l2: number | null;
  grade: string | null;
  specification: string | null;
  ordered_qty: number;
  ordered_qty_pcs?: number | null;
  ordered_qty_mtr?: number | null;
  ordered_qty_mt?: number | null;
  balance_qty_pcs?: number | null;
  balance_qty_mtr?: number | null;
  balance_qty_mt?: number | null;
  uom: string;
  target_date: string | null;
  status: string;
  created_at: string;
}

interface RollingPlan {
  id: string;
  plan_no: string;
  work_order_id: string;
  status: any;
  process_route_id?: string | null;
  planned_qty: number;
  mh_od: number | null;
  mh_wt: number | null;
  mh_l1: number | null;
  mh_l2: number | null;
  created_at: string;
  rolling_date?: string | null;
}

interface StageWipRow {
  work_order_id: string;
  work_order_no: string;
  route_id?: string;
  route_code?: string;
  route_name?: string;
  stage_code: string;
  stage_name: string;
  sequence_no: number;
  incoming_qty: number;
  production_qty: number;
  rejection_qty: number;
  current_wip: number;
  current_wip_pcs?: number;
  current_wip_mt?: number;
}

interface ProductionLog {
  id: string;
  work_order_id: string;
  stage_code: string;
  stage_name: string;
  shift_date: string;
  shift: string | null;
  heat_no: string | null;
  lot_no: string | null;
  output_qty: number;
  output_pcs: number;
  rejection_qty: number;
  rejection_pcs: number;
  htc_ok_qty?: number;
  htc_ok_pcs?: number;
  operator_name: string | null;
  remarks: string | null;
  created_at: string;
}

interface StageTrackingMetric {
  code: string;
  label: string;
  short: string;
  bg: string;
  isBundled: boolean;
  planMtr: number;
  planPcs: number;
  outMtr: number;
  outPcs: number;
  rejMtr: number;
  rejPcs: number;
  htcOkMtr: number;
  htcOkPcs: number;
  wipMtr: number;
  wipPcs: number;
  wipMt: number;
  logsCount: number;
  targetMtr?: number;
  targetPcs?: number;
  isNotInRoute?: boolean;
  dwellDays?: number;
  agingSeverity?: 'NORMAL' | 'WARNING' | 'CRITICAL';
}

const STAGES_ORDER = [
  { code: 'ROLLING', label: 'Rolling Mill', short: 'ROLL', bg: 'bg-blue-50 text-blue-900 border-blue-200' },
  { code: 'HOLLOW_HEAT_TREATMENT', label: 'Hollow Heat Treatment', short: 'HTC', bg: 'bg-amber-50 text-amber-900 border-amber-200' },
  { code: 'DRAW', label: 'Draw Bench', short: 'DRAW', bg: 'bg-indigo-50 text-indigo-900 border-indigo-200' },
  { code: 'HEAT_TREATMENT', label: 'Heat Treatment', short: 'HT', bg: 'bg-orange-50 text-orange-900 border-orange-200' },
  { code: 'FINISHING', label: 'Finishing Line', short: 'FINISH', bg: 'bg-emerald-50 text-emerald-900 border-emerald-200' },
];

export default function WorkOrderTrackingClient() {
  const supabase = createClient();

  // Raw Database Data
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [rollingPlans, setRollingPlans] = useState<RollingPlan[]>([]);
  const [stageWip, setStageWip] = useState<StageWipRow[]>([]);
  const [productionLogs, setProductionLogs] = useState<ProductionLog[]>([]);
  const [processRoutes, setProcessRoutes] = useState<{ id: string; route_code: string; route_name: string }[]>([]);
  const [qcInspections, setQcInspections] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Filters
  const [filterWo, setFilterWo] = useState<string>('');
  const [filterCustomer, setFilterCustomer] = useState<string>('');
  const [fromOd, setFromOd] = useState<string>('');
  const [toOd, setToOd] = useState<string>('');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');

  // UI state
  const [expandedWos, setExpandedWos] = useState<Record<string, boolean>>({});
  const [selectedFinishingWo, setSelectedFinishingWo] = useState<{
    wo: WorkOrder;
    stagesData: StageTrackingMetric[];
    isMaster: boolean;
    childInfo?: any;
    qcItems: any[];
    finishingLogs: ProductionLog[];
  } | null>(null);

  // Fetch initial data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [woRes, plansRes, wipRes, logsRes, routesRes, qcRes] = await Promise.all([
        supabase.from('work_orders').select('*').order('created_at', { ascending: false }),
        supabase.from('rolling_plans').select('*').not('status', 'is', null).order('created_at', { ascending: false }),
        supabase.from('vw_route_stage_wip').select('*'),
        supabase
          .from('production_logs')
          .select('*, process_stages(stage_code, stage_name)')
          .order('created_at', { ascending: false })
          .limit(10000),
        supabase.from('process_routes').select('id, route_code, route_name'),
        supabase.from('qc_inspections').select('*').order('inspection_date', { ascending: false }),
      ]);

      if (woRes.data) setWorkOrders(woRes.data);
      if (plansRes.data) setRollingPlans(plansRes.data);
      if (wipRes.data) setStageWip(wipRes.data);
      if (routesRes?.data) setProcessRoutes(routesRes.data);
      if (qcRes?.data) setQcInspections(qcRes.data);

      if (logsRes.data) {
        const mappedLogs: ProductionLog[] = logsRes.data.map((l: any) => ({
          id: l.id,
          work_order_id: l.work_order_id,
          stage_code: l.process_stages?.stage_code || '',
          stage_name: l.process_stages?.stage_name || '',
          shift_date: l.shift_date || l.created_at?.slice(0, 10),
          shift: l.shift || null,
          heat_no: l.heat_no || null,
          lot_no: l.lot_no || null,
          output_qty: Number(l.output_qty || 0),
          output_pcs: Number(l.output_pcs || 0),
          rejection_qty: Number(l.rejection_qty || 0),
          rejection_pcs: Number(l.rejection_pcs || 0),
          htc_ok_qty: Number(l.htc_ok ?? l.htc_ok_qty ?? 0),
          htc_ok_pcs: Number(l.htc_ok_pcs || 0),
          operator_name: l.operator_name || null,
          remarks: l.remarks || null,
          created_at: l.created_at,
        }));
        setProductionLogs(mappedLogs);
      }
    } catch (err) {
      console.error('Failed to load tracking data:', err);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Read URL search query param if opened from Aging or Dashboard
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const q = params.get('wo') || params.get('search');
      if (q) setFilterWo(q);
    }
  }, []);

  // Campaign Mapping
  const campaignMeta = useMemo(() => {
    const masterMap = new Map<string, any>(); // key: master_wo_id -> plan
    const childMap = new Map<string, { master_wo_id: string; master_wo_no: string; master_plan_no: string; planned_mtr?: number; planned_pcs?: number }>();

    for (const p of rollingPlans) {
      try {
        const parsed = typeof p.status === 'string' ? JSON.parse(p.status) : p.status;
        if (parsed?.is_master && Array.isArray(parsed?.child_work_orders)) {
          masterMap.set(p.work_order_id, {
            ...p,
            parsed,
            child_work_orders: parsed.child_work_orders,
          });
          for (const c of parsed.child_work_orders) {
            const childId = c.work_order_id || c.id;
            if (childId) {
              childMap.set(childId, {
                master_wo_id: p.work_order_id,
                master_wo_no: parsed.master_wo_no,
                master_plan_no: p.plan_no,
                planned_mtr: Number(c.planned_mtr || 0),
                planned_pcs: Number(c.planned_pcs || 0),
              });
            }
          }
        } else if (parsed?.is_child) {
          childMap.set(p.work_order_id, {
            master_wo_id: parsed.master_wo_id,
            master_wo_no: parsed.master_wo_no,
            master_plan_no: parsed.master_plan_no,
            planned_mtr: Number(parsed.planned_mtr || p.planned_qty || 0),
            planned_pcs: Number(parsed.planned_pcs || 0),
          });
        }
      } catch {}
    }

    return { masterMap, childMap };
  }, [rollingPlans]);

  // Set of work order IDs for which rolling has been done
  // RULE: Work Order Tracking Sheet strictly displays ONLY work orders for which rolling has been performed.
  const rolledWoIdSet = useMemo(() => {
    const rolledSet = new Set<string>();
    const masterWithRolling = new Set<string>();

    // 1. Production logs: any ROLLING log with output/HTC OK/rejection/pcs, or any downstream stage output
    for (const log of productionLogs) {
      const isRolling = log.stage_code === 'ROLLING';
      const hasRollingOutput =
        Number(log.output_qty || 0) > 0 ||
        Number(log.htc_ok_qty || 0) > 0 ||
        Number(log.output_pcs || 0) > 0 ||
        Number(log.rejection_qty || 0) > 0;

      const isDownstream = ['HOLLOW_HEAT_TREATMENT', 'DRAW', 'HEAT_TREATMENT', 'FINISHING'].includes(log.stage_code);
      const hasDownstreamOutput = Number(log.output_qty || 0) > 0 || Number(log.output_pcs || 0) > 0;

      if ((isRolling && hasRollingOutput) || (isDownstream && hasDownstreamOutput)) {
        rolledSet.add(log.work_order_id);
        if (isRolling && hasRollingOutput) {
          masterWithRolling.add(log.work_order_id);
        }
      }
    }

    // 2. Multi-WO campaigns: In a campaign, rolling is performed under the master work order.
    // If the master campaign has had rolling done, all linked child work orders are also considered rolled.
    campaignMeta.childMap.forEach((childMeta, childWoId) => {
      if (masterWithRolling.has(childMeta.master_wo_id) || rolledSet.has(childMeta.master_wo_id)) {
        rolledSet.add(childWoId);
      }
    });

    campaignMeta.masterMap.forEach((masterPlan, masterWoId) => {
      if (rolledSet.has(masterWoId) && Array.isArray(masterPlan.child_work_orders)) {
        for (const child of masterPlan.child_work_orders) {
          const cId = child.work_order_id || child.id;
          if (cId) rolledSet.add(cId);
        }
      }
    });

    return rolledSet;
  }, [productionLogs, campaignMeta]);

  // Total rolled orders count in database
  const totalRolledCount = useMemo(() => {
    return workOrders.filter((wo) => rolledWoIdSet.has(wo.id)).length;
  }, [workOrders, rolledWoIdSet]);

  // Filtered Work Orders: ONLY work for which rolling has been done will be shown
  const filteredWorkOrders = useMemo(() => {
    return workOrders.filter((wo) => {
      // MANDATORY RULE: ONLY work for which rolling has been done will be shown
      if (!rolledWoIdSet.has(wo.id)) {
        return false;
      }

      // 1. Work Order No Filter
      if (filterWo.trim()) {
        const match = wo.work_order_no.toLowerCase().includes(filterWo.trim().toLowerCase());
        if (!match) return false;
      }

      // 2. Customer Filter
      if (filterCustomer.trim()) {
        const match = (wo.customer_name || '').toLowerCase().includes(filterCustomer.trim().toLowerCase());
        if (!match) return false;
      }

      // 3. OD Range Filter (From OD to To OD)
      const od = Number(wo.size_od || 0);
      if (fromOd !== '' && !isNaN(Number(fromOd))) {
        if (od < Number(fromOd)) return false;
      }
      if (toOd !== '' && !isNaN(Number(toOd))) {
        if (od > Number(toOd)) return false;
      }

      // 4. Date Range Filter (From Date to To Date)
      const d = (wo.target_date || wo.created_at || '').slice(0, 10);
      if (fromDate && d < fromDate) return false;
      if (toDate && d > toDate) return false;

      // 5. Status Filter
      if (filterStatus && wo.status !== filterStatus) return false;

      return true;
    });
  }, [workOrders, rolledWoIdSet, filterWo, filterCustomer, fromOd, toOd, fromDate, toDate, filterStatus]);

  // Helper to get aggregated stage metrics for a work order
  // RULE 1: WIP is strictly calculated AFTER rolling production is done, and ONLY from HTC OK quantity.
  // RULE 2: In multi-WO campaigns, child work orders are bundled under the master campaign for pre-finishing stages.
  const getWoTrackingData = useCallback(
    (wo: WorkOrder) => {
      const avgLen = wo.l1 && wo.l2 ? (wo.l1 + wo.l2) / 2 : wo.l1 || wo.l2 || 6.0;
      const isMaster = campaignMeta.masterMap.has(wo.id);
      const masterInfo = campaignMeta.masterMap.get(wo.id);
      const childInfo = campaignMeta.childMap.get(wo.id);

      // Associated rolling plan
      const plan = rollingPlans.find((p) => p.work_order_id === wo.id);

      // Determine master work order ID if this is a child order
      const effectiveMasterWoId = childInfo ? childInfo.master_wo_id : wo.id;
      const masterLogs = productionLogs.filter((l) => l.work_order_id === effectiveMasterWoId);
      const woLogs = productionLogs.filter((l) => l.work_order_id === wo.id);

      // Route determination: check stageWip (from vw_route_stage_wip) or rolling plan route
      const planRoute = processRoutes.find((r) => r.id === plan?.process_route_id);
      const woWipRows = stageWip.filter((s) => s.work_order_id === wo.id || s.work_order_id === effectiveMasterWoId);
      const routeCode = (planRoute?.route_code || woWipRows[0]?.route_code || '').toUpperCase();
      const hasHtcInRoute = routeCode === 'ALLOY_CDS' || routeCode.includes('ALLOY') || woWipRows.some((s) => s.stage_code === 'HOLLOW_HEAT_TREATMENT');

      // Rolling production stats (tracked under master campaign or single order)
      const mhAvgLen = (plan?.mh_l1 && plan?.mh_l2 ? (plan.mh_l1 + plan.mh_l2) / 2 : plan?.mh_l1 || plan?.mh_l2) || avgLen;
      const masterRollLogs = masterLogs.filter((l) => l.stage_code === 'ROLLING');
      const rollingOutMtr = masterRollLogs.reduce((sum, l) => sum + Number(l.output_qty || 0), 0);
      const rollingOutPcsLogged = masterRollLogs.reduce((sum, l) => sum + Number(l.output_pcs || 0), 0);
      const rollingOutPcs = rollingOutPcsLogged > 0 ? rollingOutPcsLogged : (mhAvgLen > 0 ? Math.round(rollingOutMtr / mhAvgLen) : 0);

      const rollingRejMtr = masterRollLogs.reduce((sum, l) => sum + Number(l.rejection_qty || 0), 0);
      const rollingRejPcsLogged = masterRollLogs.reduce((sum, l) => sum + Number(l.rejection_pcs || 0), 0);
      const rollingRejPcs = rollingRejPcsLogged > 0 ? rollingRejPcsLogged : (mhAvgLen > 0 ? Math.round(rollingRejMtr / mhAvgLen) : 0);

      // Strictly HTC OK quantity from rolling!
      const rollingHtcOkMtr = masterRollLogs.reduce((sum, l) => sum + Number(l.htc_ok_qty || 0), 0);
      const rollingHtcOkPcsLogged = masterRollLogs.reduce((sum, l) => sum + Number(l.htc_ok_pcs || 0), 0);
      const rollingHtcOkPcs = rollingHtcOkPcsLogged > 0 ? rollingHtcOkPcsLogged : (mhAvgLen > 0 ? Math.round(rollingHtcOkMtr / mhAvgLen) : 0);

      // Hollow Heat Treatment (HTC) stats
      const masterHtcLogs = masterLogs.filter((l) => l.stage_code === 'HOLLOW_HEAT_TREATMENT');
      const htcOutMtr = masterHtcLogs.reduce((sum, l) => sum + Number(l.output_qty || 0), 0);
      const htcOutPcsLogged = masterHtcLogs.reduce((sum, l) => sum + Number(l.output_pcs || 0), 0);
      const htcOutPcs = htcOutPcsLogged > 0 ? htcOutPcsLogged : (mhAvgLen > 0 ? Math.round(htcOutMtr / mhAvgLen) : 0);

      const htcRejMtr = masterHtcLogs.reduce((sum, l) => sum + Number(l.rejection_qty || 0), 0);
      const htcRejPcsLogged = masterHtcLogs.reduce((sum, l) => sum + Number(l.rejection_pcs || 0), 0);
      const htcRejPcs = htcRejPcsLogged > 0 ? htcRejPcsLogged : (mhAvgLen > 0 ? Math.round(htcRejMtr / mhAvgLen) : 0);

      const htcOkMtr = masterHtcLogs.reduce((sum, l) => sum + Number(l.htc_ok_qty || 0), 0);
      const htcOkPcsLogged = masterHtcLogs.reduce((sum, l) => sum + Number(l.htc_ok_pcs || 0), 0);
      const htcOkPcs = htcOkPcsLogged > 0 ? htcOkPcsLogged : (mhAvgLen > 0 ? Math.round(htcOkMtr / mhAvgLen) : 0);

      // Draw Bench stats
      const masterDrawLogs = masterLogs.filter((l) => l.stage_code === 'DRAW');
      const drawOutMtr = masterDrawLogs.reduce((sum, l) => sum + Number(l.output_qty || 0), 0);
      const drawOutPcsLogged = masterDrawLogs.reduce((sum, l) => sum + Number(l.output_pcs || 0), 0);
      const drawOutPcs = drawOutPcsLogged > 0 ? drawOutPcsLogged : (avgLen > 0 ? Math.round(drawOutMtr / avgLen) : 0);

      const drawRejMtr = masterDrawLogs.reduce((sum, l) => sum + Number(l.rejection_qty || 0), 0);
      const drawRejPcsLogged = masterDrawLogs.reduce((sum, l) => sum + Number(l.rejection_pcs || 0), 0);
      const drawRejPcs = drawRejPcsLogged > 0 ? drawRejPcsLogged : (avgLen > 0 ? Math.round(drawRejMtr / avgLen) : 0);

      // Heat Treatment stats
      const masterHtLogs = masterLogs.filter((l) => l.stage_code === 'HEAT_TREATMENT');
      const htOutMtr = masterHtLogs.reduce((sum, l) => sum + Number(l.output_qty || 0), 0);
      const htOutPcsLogged = masterHtLogs.reduce((sum, l) => sum + Number(l.output_pcs || 0), 0);
      const htOutPcs = htOutPcsLogged > 0 ? htOutPcsLogged : (avgLen > 0 ? Math.round(htOutMtr / avgLen) : 0);

      const htRejMtr = masterHtLogs.reduce((sum, l) => sum + Number(l.rejection_qty || 0), 0);
      const htRejPcsLogged = masterHtLogs.reduce((sum, l) => sum + Number(l.rejection_pcs || 0), 0);
      const htRejPcs = htRejPcsLogged > 0 ? htRejPcsLogged : (avgLen > 0 ? Math.round(htRejMtr / avgLen) : 0);

      // Finishing stats (tracked PER WORK ORDER)
      const finLogs = woLogs.filter((l) => l.stage_code === 'FINISHING');
      const finOutMtr = finLogs.reduce((sum, l) => sum + Number(l.output_qty || 0), 0);
      const finOutPcsLogged = finLogs.reduce((sum, l) => sum + Number(l.output_pcs || 0), 0);
      const finOutPcs = finOutPcsLogged > 0 ? finOutPcsLogged : (avgLen > 0 ? Math.round(finOutMtr / avgLen) : 0);

      const finRejMtr = finLogs.reduce((sum, l) => sum + Number(l.rejection_qty || 0), 0);
      const finRejPcsLogged = finLogs.reduce((sum, l) => sum + Number(l.rejection_pcs || 0), 0);
      const finRejPcs = finRejPcsLogged > 0 ? finRejPcsLogged : (avgLen > 0 ? Math.round(finRejMtr / avgLen) : 0);

      // Planned rolling target
      let rollPlanMtr = Number(plan?.planned_qty || 0);
      let rollPlanPcs = rollPlanMtr > 0 && mhAvgLen > 0 ? Math.round(rollPlanMtr / mhAvgLen) : 0;
      if (isMaster && masterInfo) {
        rollPlanMtr = Number(masterInfo.parsed?.total_campaign_mtr || rollPlanMtr);
        rollPlanPcs = Number(masterInfo.parsed?.total_campaign_pcs || rollPlanPcs);
      }

      // Stage-by-stage stats
      const todayTime = new Date().getTime();
      const getStageAging = (wip: number, logs: ProductionLog[], upstreamLogs: ProductionLog[]) => {
        if (wip <= 0) return { dwellDays: 0, agingSeverity: 'NORMAL' as const };
        const logDate = logs[0]?.shift_date || logs[0]?.created_at?.slice(0, 10);
        const upDate = upstreamLogs[0]?.shift_date || upstreamLogs[0]?.created_at?.slice(0, 10);
        const planDate = plan?.rolling_date || plan?.created_at?.slice(0, 10) || wo.created_at?.slice(0, 10);
        const actDateStr = logDate || upDate || planDate;
        if (!actDateStr) return { dwellDays: 0, agingSeverity: 'NORMAL' as const };
        const days = Math.max(0, Math.floor((todayTime - new Date(actDateStr).getTime()) / (1000 * 60 * 60 * 24)));
        const sev: 'NORMAL' | 'WARNING' | 'CRITICAL' = days > 5 ? 'CRITICAL' : days >= 3 ? 'WARNING' : 'NORMAL';
        return { dwellDays: days, agingSeverity: sev };
      };

      const stagesData: StageTrackingMetric[] = STAGES_ORDER.map((stageDef): StageTrackingMetric => {
        const stageCode = stageDef.code;

        // RULE 2: Child work orders in campaigns are bundled under master for pre-finishing stages
        if (childInfo && stageCode !== 'FINISHING') {
          return {
            ...stageDef,
            isBundled: true,
            planMtr: Number(childInfo.planned_mtr || wo.ordered_qty),
            planPcs: 0,
            outMtr: 0,
            outPcs: 0,
            rejMtr: 0,
            rejPcs: 0,
            htcOkMtr: 0,
            htcOkPcs: 0,
            wipMtr: 0,
            wipPcs: 0,
            wipMt: 0,
            logsCount: 0,
            dwellDays: 0,
            agingSeverity: 'NORMAL',
          };
        }

        if (stageCode === 'ROLLING') {
          // RULE 1: WIP is strictly calculated AFTER rolling production is done, and ONLY from HTC OK qty!
          let wipMtr = 0;
          let wipPcs = 0;
          if (rollingOutMtr > 0) {
            const downstreamConsumed = hasHtcInRoute ? (htcOutMtr + htcRejMtr) : (drawOutMtr + drawRejMtr);
            wipMtr = Math.max(0, rollingHtcOkMtr - downstreamConsumed);
            const downstreamConsumedPcs = hasHtcInRoute ? (htcOutPcs + htcRejPcs) : (drawOutPcs + drawRejPcs);
            wipPcs = rollingHtcOkPcs > 0
              ? Math.max(0, rollingHtcOkPcs - downstreamConsumedPcs)
              : (mhAvgLen > 0 ? Math.round(wipMtr / mhAvgLen) : (avgLen > 0 ? Math.round(wipMtr / avgLen) : 0));
          }
          const mhOd = plan?.mh_od || wo.size_od || 0;
          const mhWt = plan?.mh_wt || wo.size_wt || 0;
          const wipMt = mtFromMtr(wipMtr, mhOd, mhWt);
          const { dwellDays, agingSeverity } = getStageAging(wipMtr, masterRollLogs, []);

          return {
            ...stageDef,
            isBundled: false,
            targetMtr: rollPlanMtr,
            targetPcs: rollPlanPcs,
            planMtr: rollPlanMtr,
            planPcs: rollPlanPcs,
            outMtr: rollingOutMtr,
            outPcs: rollingOutPcs,
            rejMtr: rollingRejMtr,
            rejPcs: rollingRejPcs,
            htcOkMtr: rollingHtcOkMtr,
            htcOkPcs: rollingHtcOkPcs,
            wipMtr,
            wipPcs,
            wipMt,
            logsCount: masterRollLogs.length,
            dwellDays,
            agingSeverity,
          };
        }

        if (stageCode === 'HOLLOW_HEAT_TREATMENT') {
          if (!hasHtcInRoute) {
            return {
              ...stageDef,
              isBundled: false,
              isNotInRoute: true,
              planMtr: 0,
              planPcs: 0,
              outMtr: 0,
              outPcs: 0,
              rejMtr: 0,
              rejPcs: 0,
              htcOkMtr: 0,
              htcOkPcs: 0,
              wipMtr: 0,
              wipPcs: 0,
              wipMt: 0,
              logsCount: 0,
              dwellDays: 0,
              agingSeverity: 'NORMAL',
            };
          }

          // Downstream WIP only exists after rolling production is done, and strictly from HTC OK!
          let wipMtr = 0;
          let wipPcs = 0;
          if (rollingHtcOkMtr > 0) {
            wipMtr = Math.max(0, rollingHtcOkMtr - htcOutMtr - htcRejMtr);
            const consumedPcs = htcOutPcs + htcRejPcs;
            wipPcs = rollingHtcOkPcs > 0
              ? Math.max(0, rollingHtcOkPcs - consumedPcs)
              : (mhAvgLen > 0 ? Math.round(wipMtr / mhAvgLen) : (avgLen > 0 ? Math.round(wipMtr / avgLen) : 0));
          }
          const mhOd = plan?.mh_od || wo.size_od || 0;
          const mhWt = plan?.mh_wt || wo.size_wt || 0;
          const wipMt = mtFromMtr(wipMtr, mhOd, mhWt);
          const { dwellDays, agingSeverity } = getStageAging(wipMtr, masterHtcLogs, masterRollLogs);

          return {
            ...stageDef,
            isBundled: false,
            isNotInRoute: false,
            planMtr: 0,
            planPcs: 0,
            outMtr: htcOutMtr,
            outPcs: htcOutPcs,
            rejMtr: htcRejMtr,
            rejPcs: htcRejPcs,
            htcOkMtr,
            htcOkPcs,
            wipMtr,
            wipPcs,
            wipMt,
            logsCount: masterHtcLogs.length,
            dwellDays,
            agingSeverity,
          };
        }

        if (stageCode === 'DRAW') {
          // If Hollow HT is in route, incoming stock to Draw Bench is strictly Hollow HT net output.
          // If Hollow HT is not in route (e.g. CDS), incoming stock is directly Rolling HTC OK.
          const incomingMtr = hasHtcInRoute ? Math.max(0, htcOutMtr - htcRejMtr) : rollingHtcOkMtr;
          const incomingPcs = hasHtcInRoute ? Math.max(0, htcOutPcs - htcRejPcs) : rollingHtcOkPcs;
          let wipMtr = 0;
          let wipPcs = 0;
          if (incomingMtr > 0) {
            wipMtr = Math.max(0, incomingMtr - drawOutMtr - drawRejMtr);
            const consumedPcs = drawOutPcs + drawRejPcs;
            wipPcs = incomingPcs > 0
              ? Math.max(0, incomingPcs - consumedPcs)
              : (mhAvgLen > 0 ? Math.round(wipMtr / mhAvgLen) : (avgLen > 0 ? Math.round(wipMtr / avgLen) : 0));
          }
          const mhOd = plan?.mh_od || wo.size_od || 0;
          const mhWt = plan?.mh_wt || wo.size_wt || 0;
          const wipMt = mtFromMtr(wipMtr, mhOd, mhWt);
          const { dwellDays, agingSeverity } = getStageAging(
            wipMtr,
            masterDrawLogs,
            hasHtcInRoute ? (masterHtcLogs.length > 0 ? masterHtcLogs : masterRollLogs) : masterRollLogs
          );

          return {
            ...stageDef,
            isBundled: false,
            planMtr: 0,
            planPcs: 0,
            outMtr: drawOutMtr,
            outPcs: drawOutPcs,
            rejMtr: drawRejMtr,
            rejPcs: drawRejPcs,
            htcOkMtr: 0,
            htcOkPcs: 0,
            wipMtr,
            wipPcs,
            wipMt,
            logsCount: masterDrawLogs.length,
            dwellDays,
            agingSeverity,
          };
        }

        if (stageCode === 'HEAT_TREATMENT') {
          let wipMtr = 0;
          let wipPcs = 0;
          const drawNetMtr = Math.max(0, drawOutMtr - drawRejMtr);
          const drawNetPcs = Math.max(0, drawOutPcs - drawRejPcs);
          if (drawNetMtr > 0) {
            wipMtr = Math.max(0, drawNetMtr - htOutMtr - htRejMtr);
            const consumedPcs = htOutPcs + htRejPcs;
            wipPcs = drawNetPcs > 0
              ? Math.max(0, drawNetPcs - consumedPcs)
              : (avgLen > 0 ? Math.round(wipMtr / avgLen) : 0);
          }
          const wipMt = mtFromMtr(wipMtr, wo.size_od || 0, wo.size_wt || 0);
          const { dwellDays, agingSeverity } = getStageAging(wipMtr, masterHtLogs, masterDrawLogs);

          return {
            ...stageDef,
            isBundled: false,
            planMtr: 0,
            planPcs: 0,
            outMtr: htOutMtr,
            outPcs: htOutPcs,
            rejMtr: htRejMtr,
            rejPcs: htRejPcs,
            htcOkMtr: 0,
            htcOkPcs: 0,
            wipMtr,
            wipPcs,
            wipMt,
            logsCount: masterHtLogs.length,
            dwellDays,
            agingSeverity,
          };
        }

        // FINISHING stage:
        // Target is the actual Customer Ordered Quantity for this work order!
        const isUomPcs = String(wo.uom || '').toUpperCase() === 'PCS';
        const targetPcs = childInfo?.planned_pcs
          ? Number(childInfo.planned_pcs)
          : Number(wo.ordered_qty_pcs || (isUomPcs ? wo.ordered_qty : 0)) ||
            (avgLen > 0 ? Math.round(Number(wo.ordered_qty_mtr || wo.ordered_qty) / avgLen) : Number(wo.ordered_qty));

        const targetMtr = childInfo?.planned_mtr
          ? Number(childInfo.planned_mtr)
          : Number(wo.ordered_qty_mtr || 0) > 0
          ? Number(wo.ordered_qty_mtr)
          : !isUomPcs
          ? Number(wo.ordered_qty)
          : targetPcs > 0 && avgLen > 0
          ? targetPcs * avgLen
          : Number(wo.ordered_qty);

        const precedingOutMtr = htOutMtr > 0 ? Math.max(0, htOutMtr - htRejMtr) : Math.max(0, drawOutMtr - drawRejMtr);
        const precedingOutPcs = htOutMtr > 0 ? Math.max(0, htOutPcs - htRejPcs) : Math.max(0, drawOutPcs - drawRejPcs);

        const woQcList = qcInspections.filter(
          (q: any) => q.work_order_id === wo.id || (childInfo && q.work_order_id === childInfo.master_wo_id)
        );
        const qcOkPcs = woQcList.reduce((sum: number, q: any) => sum + Number(q.vdi_ok_pcs || 0), 0);
        const qcSalvagePcs = woQcList.reduce((sum: number, q: any) => sum + Number(q.vdi_salvage_pcs || 0), 0);
        const qcPassedPcs = qcOkPcs;
        const qcPassedMtr = woQcList.reduce(
          (sum: number, q: any) => sum + Number(q.vdi_ok_mtr || 0),
          0
        );

        let wipMtr = 0;
        let wipPcs = 0;
        if (woQcList.length > 0) {
          // Strictly from VDI OK Nos!
          const consumedPcs = finOutPcs + finRejPcs;
          wipPcs = Math.max(0, Math.min(targetPcs, qcPassedPcs) - consumedPcs);
          wipMtr = avgLen > 0 ? Number((wipPcs * avgLen).toFixed(3)) : Math.max(0, qcPassedMtr - finOutMtr - finRejMtr);
        } else if (precedingOutMtr > 0) {
          wipMtr = Math.max(0, Math.min(targetMtr, precedingOutMtr) - finOutMtr - finRejMtr);
          const consumedPcs = finOutPcs + finRejPcs;
          wipPcs = precedingOutPcs > 0
            ? Math.max(0, Math.min(targetPcs, precedingOutPcs) - consumedPcs)
            : (avgLen > 0 ? Math.round(wipMtr / avgLen) : 0);
        }
        const wipMt = mtFromMtr(wipMtr, wo.size_od || 0, wo.size_wt || 0);
        const { dwellDays, agingSeverity } = getStageAging(wipMtr, finLogs, masterHtLogs.length > 0 ? masterHtLogs : masterDrawLogs);

        return {
          ...stageDef,
          isBundled: false,
          targetMtr,
          targetPcs,
          planMtr: targetMtr,
          planPcs: targetPcs,
          outMtr: finOutMtr,
          outPcs: finOutPcs,
          rejMtr: finRejMtr,
          rejPcs: finRejPcs,
          htcOkMtr: 0,
          htcOkPcs: 0,
          wipMtr,
          wipPcs,
          wipMt,
          logsCount: finLogs.length,
          dwellDays,
          agingSeverity,
        };
      });

      // Overall Progress & Yield
      const totalOutMtr = stagesData.reduce((sum, s) => sum + s.outMtr, 0);
      const totalOutPcs = stagesData.reduce((sum, s) => sum + s.outPcs, 0);
      const totalRejMtr = stagesData.reduce((sum, s) => sum + s.rejMtr, 0);
      const totalRejPcs = stagesData.reduce((sum, s) => sum + s.rejPcs, 0);
      const finishingOutMtr = stagesData.find((s) => s.code === 'FINISHING')?.outMtr || 0;
      const finishingOutPcs = stagesData.find((s) => s.code === 'FINISHING')?.outPcs || 0;
      const targetVolumeMtr = stagesData.find((s) => s.code === 'FINISHING')?.targetMtr || wo.ordered_qty;
      const targetVolumePcs = stagesData.find((s) => s.code === 'FINISHING')?.targetPcs || (avgLen > 0 ? Math.round(wo.ordered_qty / avgLen) : 0);

      const completionPct = targetVolumeMtr > 0 ? Math.min(100, Math.round((finishingOutMtr / targetVolumeMtr) * 100)) : 0;
      const processYieldPct =
        finishingOutMtr + totalRejMtr > 0
          ? Math.round((finishingOutMtr / (finishingOutMtr + totalRejMtr)) * 100)
          : 100;

      const woQcList = qcInspections.filter(
        (q: any) => q.work_order_id === wo.id || (childInfo && q.work_order_id === childInfo.master_wo_id)
      );

      return {
        wo,
        avgLen,
        isMaster,
        masterInfo,
        childInfo,
        plan,
        stagesData,
        finishingOutMtr,
        finishingOutPcs,
        totalRejMtr,
        totalRejPcs,
        targetVolumeMtr,
        targetVolumePcs,
        completionPct,
        processYieldPct,
        logs: woLogs,
        qcList: woQcList,
      };
    },
    [campaignMeta, rollingPlans, productionLogs, processRoutes, stageWip, qcInspections]
  );

  // Toggle single work order details
  const toggleWo = (id: string) => {
    setExpandedWos((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Toggle all
  const toggleAll = () => {
    const anyExpanded = filteredWorkOrders.some((w) => expandedWos[w.id]);
    const nextState: Record<string, boolean> = {};
    filteredWorkOrders.forEach((w) => {
      nextState[w.id] = !anyExpanded;
    });
    setExpandedWos(nextState);
  };

  // Reset Filters
  const resetFilters = () => {
    setFilterWo('');
    setFilterCustomer('');
    setFromOd('');
    setToOd('');
    setFromDate('');
    setToDate('');
    setFilterStatus('');
  };

  // KPI calculations across filtered rolled work orders
  const kpis = useMemo(() => {
    let totalOrderedMtr = 0;
    let totalTargetPcs = 0;
    let totalRollingOutMtr = 0;
    let totalRollingOutPcs = 0;
    let totalPendingRollingMtr = 0;
    let totalPendingRollingPcs = 0;
    let totalRolledStockWipMtr = 0;
    let totalRolledStockWipPcs = 0;
    let totalRolledStockWipMt = 0;
    let totalFinishingOutMtr = 0;
    let totalFinishingOutPcs = 0;
    let totalRejMtr = 0;
    let totalRejPcs = 0;

    filteredWorkOrders.forEach((wo) => {
      const avgLen = wo.l1 && wo.l2 ? (wo.l1 + wo.l2) / 2 : wo.l1 || wo.l2 || 6.0;
      const isUomPcs = String(wo.uom || '').toUpperCase() === 'PCS';
      const ordPcs = Number(wo.ordered_qty_pcs || (isUomPcs ? wo.ordered_qty : (avgLen > 0 ? Math.round(Number(wo.ordered_qty) / avgLen) : 0)));
      const ordMtr = Number(wo.ordered_qty_mtr || (!isUomPcs ? wo.ordered_qty : ordPcs * avgLen));
      totalOrderedMtr += ordMtr;
      totalTargetPcs += ordPcs;
      const row = getWoTrackingData(wo);
      const rollStage = row.stagesData.find((s) => s.code === 'ROLLING');
      const finStage = row.stagesData.find((s) => s.code === 'FINISHING');

      // Do NOT double-count child plans in rolling totals
      if (!row.childInfo) {
        totalRollingOutMtr += Number(rollStage?.outMtr || 0);
        totalRollingOutPcs += Number(rollStage?.outPcs || 0);
        const pendingMtr = Math.max(0, Number(rollStage?.planMtr || 0) - Number(rollStage?.outMtr || 0));
        const pendingPcs = Math.max(0, Number(rollStage?.planPcs || 0) - Number(rollStage?.outPcs || 0));
        totalPendingRollingMtr += pendingMtr;
        totalPendingRollingPcs += pendingPcs;
      }
      totalRolledStockWipMtr += rollStage?.wipMtr || 0;
      totalRolledStockWipPcs += rollStage?.wipPcs || 0;
      totalRolledStockWipMt += rollStage?.wipMt || 0;
      totalFinishingOutMtr += finStage?.outMtr || 0;
      totalFinishingOutPcs += finStage?.outPcs || 0;
      totalRejMtr += row.totalRejMtr;
      totalRejPcs += row.totalRejPcs;
    });

    const factoryYield =
      totalFinishingOutMtr + totalRejMtr > 0
        ? ((totalFinishingOutMtr / (totalFinishingOutMtr + totalRejMtr)) * 100).toFixed(1)
        : '100';

    return {
      totalOrders: filteredWorkOrders.length,
      totalOrderedMtr,
      totalTargetPcs,
      totalRollingOutMtr,
      totalRollingOutPcs,
      totalPendingRollingMtr,
      totalPendingRollingPcs,
      totalRolledStockWipMtr,
      totalRolledStockWipPcs,
      totalRolledStockWipMt,
      totalFinishingOutMtr,
      totalFinishingOutPcs,
      factoryYield,
    };
  }, [filteredWorkOrders, getWoTrackingData]);

  // Export to Excel
  const exportToExcel = () => {
    const rows = filteredWorkOrders.map((wo) => {
      const row = getWoTrackingData(wo);
      const rRoll = row.stagesData.find((s) => s.code === 'ROLLING');
      const rHtc = row.stagesData.find((s) => s.code === 'HOLLOW_HEAT_TREATMENT');
      const rDraw = row.stagesData.find((s) => s.code === 'DRAW');
      const rHt = row.stagesData.find((s) => s.code === 'HEAT_TREATMENT');
      const rFin = row.stagesData.find((s) => s.code === 'FINISHING');

      return {
        'WO No.': wo.work_order_no,
        'Customer': wo.customer_name || '—',
        'Grade': wo.grade || wo.specification || '—',
        'Finished OD (mm)': wo.size_od,
        'Finished WT (mm)': wo.size_wt,
        'Length L1-L2 (m)': `${wo.l1 || '—'} - ${wo.l2 || '—'}`,
        'Ordered Qty (Mtr)': wo.ordered_qty,
        'Status': wo.status,
        'Campaign Type': row.isMaster ? 'Master Campaign' : row.childInfo ? 'Child Order' : 'Single Order',
        'Mother Hollow OD (mm)': row.plan?.mh_od || '—',
        'Mother Hollow WT (mm)': row.plan?.mh_wt || '—',
        // Rolling Mill
        'Rolling Target (Pcs)': rRoll?.planPcs || 0,
        'Rolling Plan (Mtr)': rRoll?.planMtr || 0,
        'Rolling Output (Nos)': rRoll?.outPcs || 0,
        'Rolling Output (Mtr)': rRoll?.outMtr || 0,
        'Rolling Rejection (Nos)': rRoll?.rejPcs || 0,
        'Rolling Rejection (Mtr)': rRoll?.rejMtr || 0,
        'Rolling WIP (Pcs)': rRoll?.wipPcs || 0,
        'Rolling WIP (Mtr)': rRoll?.wipMtr || 0,
        'Rolling WIP (MT)': Number(rRoll?.wipMt || 0).toFixed(2),
        // HTC
        'HTC Output (Nos)': rHtc?.outPcs || 0,
        'HTC Output (Mtr)': rHtc?.outMtr || 0,
        'HTC Rejection (Nos)': rHtc?.rejPcs || 0,
        'HTC Rejection (Mtr)': rHtc?.rejMtr || 0,
        'HTC OK (Nos)': rHtc?.htcOkPcs || 0,
        'HTC OK (Mtr)': rHtc?.htcOkMtr || 0,
        'HTC WIP (Pcs)': rHtc?.wipPcs || 0,
        'HTC WIP (Mtr)': rHtc?.wipMtr || 0,
        // Draw Bench
        'Draw Output (Nos)': rDraw?.outPcs || 0,
        'Draw Output (Mtr)': rDraw?.outMtr || 0,
        'Draw Rejection (Nos)': rDraw?.rejPcs || 0,
        'Draw Rejection (Mtr)': rDraw?.rejMtr || 0,
        'Draw WIP (Pcs)': rDraw?.wipPcs || 0,
        'Draw WIP (Mtr)': rDraw?.wipMtr || 0,
        // Heat Treatment
        'HT Output (Nos)': rHt?.outPcs || 0,
        'HT Output (Mtr)': rHt?.outMtr || 0,
        'HT Rejection (Nos)': rHt?.rejPcs || 0,
        'HT Rejection (Mtr)': rHt?.rejMtr || 0,
        'HT WIP (Pcs)': rHt?.wipPcs || 0,
        'HT WIP (Mtr)': rHt?.wipMtr || 0,
        // QC / VDI Inspection
        'VDI Inspected (Nos)': (row.qcList || []).reduce((sum: number, q: any) => sum + Number(q.inspected_pcs || 0), 0),
        'VDI OK (Nos)': (row.qcList || []).reduce((sum: number, q: any) => sum + Number(q.vdi_ok_pcs || 0), 0),
        'VDI Salvage (Nos)': (row.qcList || []).reduce((sum: number, q: any) => sum + Number(q.vdi_salvage_pcs || 0), 0),
        'VDI Rejection (Nos)': (row.qcList || []).reduce((sum: number, q: any) => sum + Number(q.vdi_rejection_pcs || 0), 0),
        // Finishing
        'Finishing Target (Pcs)': rFin?.targetPcs || 0,
        'Finishing Output (Nos)': rFin?.outPcs || 0,
        'Finishing Output (Mtr)': rFin?.outMtr || 0,
        'Finishing Rejection (Nos)': rFin?.rejPcs || 0,
        'Finishing Rejection (Mtr)': rFin?.rejMtr || 0,
        'Final Goods WIP (Pcs)': rFin?.wipPcs || 0,
        'Final Goods WIP (Mtr)': rFin?.wipMtr || 0,
        // Summary
        'Completion (%)': `${row.completionPct}%`,
        'Process Yield (%)': `${row.processYieldPct}%`,
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'WO Tracking');
    const dateStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `work-order-tracking-sheet-${dateStr}.xlsx`);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2 flex-wrap">
            <span>Work Order Tracking Sheet</span>
            <span className="text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-2.5 py-0.5">
              Live Stage Flow
            </span>
            <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-0.5 flex items-center gap-1">
              <CheckCircle2 size={11} className="text-emerald-600" />
              Rolled Work Orders Only
            </span>
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            End-to-end station tracking for work orders with rolling completed or in progress: Rolling Mill &rarr; HTC &rarr; Draw Bench &rarr; Heat Treatment &rarr; Finishing Line
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => window.location.href = '/reports/aging'}
            className="inline-flex items-center gap-1.5 text-xs h-9 border-slate-300 text-slate-700 hover:bg-slate-50"
            title="Open WIP Aging & Bottlenecks Analysis"
          >
            <Clock size={14} className="text-[#0078d4]" /> Aging Analysis
          </Button>
          <Button
            type="button"
            onClick={exportToExcel}
            className="inline-flex items-center gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs text-sm h-9"
          >
            <Download size={14} /> Export to Excel
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={fetchData}
            className="text-sm h-9 gap-1.5"
            title="Refresh live tracking data"
          >
            <RotateCcw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </Button>
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Card className="border-slate-200 bg-white">
          <CardContent className="p-4">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Filtered Orders</div>
            <div className="mt-1 text-2xl font-bold text-slate-900 font-mono">{kpis.totalOrders}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">Active in view</div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white">
          <CardContent className="p-4">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Target Volume</div>
            <div className="mt-1 text-2xl font-bold text-slate-900 font-mono">{fmt(kpis.totalTargetPcs)} Pcs</div>
            <div className="text-[11px] text-slate-400 mt-0.5">{fmt(kpis.totalOrderedMtr, 'm')} customer ordered</div>
          </CardContent>
        </Card>

        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="p-4">
            <div className="text-xs font-semibold text-blue-700 uppercase tracking-wider">Rolled Mill Output</div>
            <div className="mt-1 text-2xl font-bold text-blue-900 font-mono">{fmt(kpis.totalRollingOutPcs)} Nos</div>
            <div className="text-[11px] text-blue-600 mt-0.5">{fmt(kpis.totalRollingOutMtr, 'm')} mother hollows rolled</div>
          </CardContent>
        </Card>

        <Card className="border-indigo-200 bg-indigo-50/50">
          <CardContent className="p-4">
            <div className="text-xs font-semibold text-indigo-700 uppercase tracking-wider">Rolled Stock WIP</div>
            <div className="mt-1 text-2xl font-bold text-indigo-900 font-mono">{fmt(kpis.totalRolledStockWipPcs)} Pcs</div>
            <div className="text-[11px] text-indigo-600 mt-0.5">{fmt(kpis.totalRolledStockWipMt.toFixed(2), ' MT')} ({fmt(kpis.totalRolledStockWipMtr, 'm')}) inventory</div>
          </CardContent>
        </Card>

        <Card className="border-emerald-200 bg-emerald-50/50">
          <CardContent className="p-4">
            <div className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Finished Output</div>
            <div className="mt-1 text-2xl font-bold text-emerald-900 font-mono">{fmt(kpis.totalFinishingOutPcs)} Nos</div>
            <div className="text-[11px] text-emerald-600 mt-0.5">{fmt(kpis.totalFinishingOutMtr, 'm')} final inspected</div>
          </CardContent>
        </Card>
      </div>

      {/* Responsive Filter Panel */}
      <Card className="border-slate-200/90 bg-white shadow-xs">
        <CardHeader className="bg-slate-50/80 px-4 py-3 border-b border-slate-200 flex flex-row items-center justify-between">
          <div className="font-bold text-slate-800 text-sm flex items-center gap-2">
            <SlidersHorizontal size={15} className="text-blue-600" />
            <span>Filter Tracking Sheet</span>
          </div>
          <button
            type="button"
            onClick={resetFilters}
            className="text-xs font-semibold text-slate-500 hover:text-blue-600 transition flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw size={11} /> Reset Filters
          </button>
        </CardHeader>

        <CardContent className="p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6 text-sm">
            {/* Work Order No search */}
            <div>
              <label className="text-xs font-semibold text-slate-600">Work Order No.</label>
              <div className="relative mt-1">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <Input
                  className="pl-8 text-sm h-9"
                  placeholder="e.g. WO-2026-101"
                  value={filterWo}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFilterWo(e.target.value)}
                />
              </div>
            </div>

            {/* Customer Search */}
            <div>
              <label className="text-xs font-semibold text-slate-600">Customer</label>
              <Input
                className="mt-1 text-sm h-9"
                placeholder="e.g. Apex Energy"
                value={filterCustomer}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFilterCustomer(e.target.value)}
              />
            </div>

            {/* From OD (mm) */}
            <div>
              <label className="text-xs font-semibold text-slate-600">From OD (mm)</label>
              <Input
                type="number"
                step="0.1"
                className="mt-1 text-sm h-9"
                placeholder="Min OD (e.g. 40)"
                value={fromOd}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFromOd(e.target.value)}
              />
            </div>

            {/* To OD (mm) */}
            <div>
              <label className="text-xs font-semibold text-slate-600">To OD (mm)</label>
              <Input
                type="number"
                step="0.1"
                className="mt-1 text-sm h-9"
                placeholder="Max OD (e.g. 90)"
                value={toOd}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setToOd(e.target.value)}
              />
            </div>

            {/* From Date */}
            <div>
              <label className="text-xs font-semibold text-slate-600">From Date</label>
              <Input
                type="date"
                className="mt-1 text-sm h-9"
                value={fromDate}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFromDate(e.target.value)}
              />
            </div>

            {/* To Date */}
            <div>
              <label className="text-xs font-semibold text-slate-600">To Date</label>
              <Input
                type="date"
                className="mt-1 text-sm h-9"
                value={toDate}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setToDate(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-500">Status:</label>
              <Select
                className="text-xs h-8 max-w-[150px]"
                value={filterStatus}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilterStatus(e.target.value)}
              >
                <option value="">All Statuses</option>
                <option value="Scheduled">Scheduled</option>
                <option value="In Progress">In Progress</option>
                <option value="Completed">Completed</option>
                <option value="Pending Plan">Pending Plan</option>
                <option value="Diverted">Diverted</option>
              </Select>
            </div>

            <div className="text-xs text-slate-500 font-medium">
              Showing <span className="font-bold text-slate-800">{filteredWorkOrders.length}</span> of{' '}
              <span className="font-bold text-slate-800">{totalRolledCount}</span> rolled work orders{' '}
              <span className="text-slate-400">({workOrders.length} total in system)</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Tracking Sheet Table */}
      <div className="rounded-xl border border-slate-200/90 bg-white shadow-xs overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200/80 px-4 py-3 bg-slate-50/70">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800 text-sm">Station Progress Matrix</span>
            <span className="text-xs text-slate-500">
              (Rolling &rarr; Hollow HT &rarr; Draw Bench &rarr; HT &rarr; Finishing)
            </span>
          </div>
          <button
            type="button"
            onClick={toggleAll}
            className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition cursor-pointer flex items-center gap-1"
          >
            <Layers size={12} />
            {filteredWorkOrders.some((w) => expandedWos[w.id]) ? 'Collapse All History' : 'Expand All History'}
          </button>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-12 text-center text-sm text-slate-500">Loading work order tracking data...</div>
          ) : filteredWorkOrders.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-500">
              <Layers size={32} className="mx-auto mb-2 text-slate-300" />
              <p className="font-medium text-slate-700">No work orders with completed rolling found.</p>
              <p className="text-xs text-slate-400 mt-1">
                The Work Order Tracking Sheet strictly displays work orders for which rolling production has been recorded.
              </p>
            </div>
          ) : (
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50/90 border-b border-slate-200 text-slate-700">
                <tr>
                  <th className="py-3 px-3 text-left font-bold min-w-[200px]">Work Order & Specs</th>
                  <th className="py-3 px-3 text-center font-bold min-w-[130px] bg-blue-50/70 border-x border-blue-100 text-blue-900">
                    1. Rolling Mill
                  </th>
                  <th className="py-3 px-3 text-center font-bold min-w-[120px] bg-amber-50/70 border-r border-amber-100 text-amber-900">
                    2. Hollow HT (HTC)
                  </th>
                  <th className="py-3 px-3 text-center font-bold min-w-[120px] bg-indigo-50/70 border-r border-indigo-100 text-indigo-900">
                    3. Draw Bench
                  </th>
                  <th className="py-3 px-3 text-center font-bold min-w-[120px] bg-orange-50/70 border-r border-orange-100 text-orange-900">
                    4. Heat Treatment
                  </th>
                  <th className="py-3 px-3 text-center font-bold min-w-[130px] bg-emerald-50/70 border-r border-emerald-100 text-emerald-900">
                    5. Finishing Line
                  </th>
                  <th className="py-3 px-3 text-right font-bold min-w-[110px]">Progress & Yield</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filteredWorkOrders.map((wo) => {
                  const data = getWoTrackingData(wo);
                  const isExpanded = !!expandedWos[wo.id];
                  const rRoll = data.stagesData.find((s) => s.code === 'ROLLING');
                  const rHtc = data.stagesData.find((s) => s.code === 'HOLLOW_HEAT_TREATMENT');
                  const rDraw = data.stagesData.find((s) => s.code === 'DRAW');
                  const rHt = data.stagesData.find((s) => s.code === 'HEAT_TREATMENT');
                  const rFin = data.stagesData.find((s) => s.code === 'FINISHING');

                  return (
                    <React.Fragment key={wo.id}>
                      <tr className="hover:bg-slate-50/50 transition-colors">
                        {/* Work Order Info */}
                        <td className="py-3 px-3 align-top">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-slate-900 font-mono text-sm">{wo.work_order_no}</span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold border ${
                                wo.status === 'Completed'
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  : wo.status === 'In Progress'
                                  ? 'bg-blue-50 text-blue-800 border-blue-200'
                                  : 'bg-slate-100 text-slate-700 border-slate-200'
                              }`}
                            >
                              {wo.status}
                            </span>
                          </div>

                          <div className="text-slate-600 font-medium truncate max-w-[190px] mt-0.5">
                            {wo.customer_name || '—'}
                          </div>

                          <div className="font-mono text-slate-800 mt-1">
                            {wo.size_od} × {wo.size_wt} mm
                            {wo.l1 != null && wo.l2 != null
                              ? wo.l1 === wo.l2
                                ? ` (${wo.l1}m)`
                                : ` (${wo.l1}-${wo.l2}m)`
                              : wo.l1 != null
                              ? ` (${wo.l1}m)`
                              : ''}
                          </div>

                          <div className="text-slate-500 text-[11px]">
                            Ord: <strong className="text-slate-800">{fmt(wo.ordered_qty)} {wo.uom}</strong> · {wo.grade || wo.specification || '—'}
                          </div>

                          {/* Master / Child Badge */}
                          {data.isMaster && (
                            <div className="mt-1.5 inline-flex items-center gap-1 rounded bg-indigo-50 border border-indigo-200/80 px-1.5 py-0.5 text-[10px] font-bold text-indigo-900">
                              <Crown size={10} className="text-indigo-600" />
                              Master Campaign ({data.masterInfo?.child_work_orders?.length || 0} Children)
                            </div>
                          )}
                          {data.childInfo && (
                            <div className="mt-1.5 inline-flex items-center gap-1 rounded bg-slate-100 border border-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
                              Child of {data.childInfo.master_wo_no}
                            </div>
                          )}

                          {data.logs.length > 0 && (
                            <div className="mt-2">
                              <button
                                type="button"
                                onClick={() => toggleWo(wo.id)}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 transition cursor-pointer"
                              >
                                {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                {data.logs.length} Logged Entries
                              </button>
                            </div>
                          )}
                        </td>

                        {/* 1. Rolling Mill */}
                        <td className="py-3 px-3 align-top bg-blue-50/30 border-x border-blue-100">
                          {data.childInfo ? (
                            <div className="rounded border border-indigo-200 bg-indigo-50/60 p-2 text-center">
                              <span className="text-[10px] font-bold text-indigo-800 uppercase tracking-wider block">
                                Planned in Work Order No 
                              </span>
                              <span className="font-mono text-xs text-indigo-950 font-bold block mt-0.5">
                                {data.childInfo.master_wo_no}
                              </span>
                              <span className="text-[10px] text-indigo-600 block mt-0.5 font-medium">
                                WIP: 0 Nos
                              </span>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              {data.plan?.mh_od ? (
                                <div className="text-[10px] font-mono text-blue-900 bg-blue-100/60 rounded px-1 py-0.5">
                                  MH: {data.plan.mh_od} × {data.plan.mh_wt}mm
                                </div>
                              ) : null}

                              <div className="flex justify-between text-slate-600">
                                <span>Target:</span>
                                <span className="font-mono font-bold text-slate-800">{fmt(rRoll?.planPcs || 0)} Pcs</span>
                              </div>

                              <div className="flex justify-between text-slate-600">
                                <span>Rolled:</span>
                                <span className="font-mono font-bold text-emerald-700">{fmt(rRoll?.outPcs || 0)} Nos</span>
                              </div>

                              <div className="flex justify-between text-indigo-700 font-medium">
                                <span>HTC OK:</span>
                                <span className="font-mono font-bold text-indigo-700">{fmt(rRoll?.htcOkPcs || 0)} Nos</span>
                              </div>

                              {Number(rRoll?.rejPcs || 0) > 0 && (
                                <div className="flex justify-between text-rose-600">
                                  <span>Rej:</span>
                                  <span className="font-mono">{fmt(rRoll?.rejPcs || 0)} Nos</span>
                                </div>
                              )}

                              <div className="flex justify-between pt-1 border-t border-blue-200/60 text-blue-900 font-bold">
                                <span>Rolled WIP:</span>
                                <span className="font-mono">{fmt(rRoll?.wipPcs || 0)} Nos</span>
                              </div>

                              {Number(rRoll?.wipPcs || 0) > 0 && rRoll?.dwellDays !== undefined && (
                                <div className="mt-1 flex items-center justify-end">
                                  <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-mono font-bold ${
                                    rRoll.agingSeverity === 'CRITICAL'
                                      ? 'bg-red-100 text-red-700 border border-red-200'
                                      : rRoll.agingSeverity === 'WARNING'
                                      ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                      : 'bg-slate-100 text-slate-600 border border-slate-200'
                                  }`}>
                                    <Clock size={9} />
                                    {rRoll.dwellDays}d at station
                                  </span>
                                </div>
                              )}

                              {Number(rRoll?.outMtr || 0) === 0 && (
                                <div className="text-[10px] text-amber-700 bg-amber-50 rounded px-1 py-0.5 border border-amber-200/70 text-center font-semibold">
                                  Pending Rolling
                                </div>
                              )}
                            </div>
                          )}
                        </td>

                        {/* 2. Hollow Heat Treatment (HTC) */}
                        <td className="py-3 px-3 align-top bg-amber-50/30 border-r border-amber-100">
                          {data.childInfo ? (
                            <div className="rounded border border-indigo-200 bg-indigo-50/60 p-2 text-center">
                              <span className="text-[10px] font-bold text-indigo-800 uppercase tracking-wider block">
                                Planned in Work order No
                              </span>
                              <span className="font-mono text-xs text-indigo-950 font-bold block mt-0.5">
                                {data.childInfo.master_wo_no}
                              </span>
                              <span className="text-[10px] text-indigo-600 block mt-0.5 font-medium">
                                WIP: 0 Nos
                              </span>
                            </div>
                          ) : rHtc?.isNotInRoute ? (
                            <div className="text-[11px] text-slate-400 italic text-center py-4 bg-slate-50/50 rounded-lg border border-dashed border-slate-200">
                              <div className="font-semibold text-slate-400">Not in Route</div>
                              <div className="text-[10px] text-slate-400 font-mono mt-0.5">WIP: 0 Nos</div>
                            </div>
                          ) : Number(rRoll?.outMtr || 0) === 0 ? (
                            <div className="text-[10px] text-slate-400 italic text-center py-2 bg-slate-50/50 rounded border border-dashed border-slate-200">
                              Waiting Rolling HTC OK
                              <div className="font-mono font-bold text-slate-500 mt-0.5">WIP: 0 Nos</div>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <div className="flex justify-between text-slate-600">
                                <span>Output:</span>
                                <span className="font-mono font-bold text-emerald-700">{fmt(rHtc?.outPcs || 0)} Nos</span>
                              </div>

                              {Number(rHtc?.htcOkPcs || 0) > 0 && (
                                <div className="flex justify-between text-indigo-700 font-medium">
                                  <span>HTC OK:</span>
                                  <span className="font-mono">{fmt(rHtc?.htcOkPcs || 0)} Nos</span>
                                </div>
                              )}

                              {Number(rHtc?.rejPcs || 0) > 0 && (
                                <div className="flex justify-between text-rose-600">
                                  <span>Rej:</span>
                                  <span className="font-mono">{fmt(rHtc?.rejPcs || 0)} Nos</span>
                                </div>
                              )}

                              <div className="flex justify-between pt-1 border-t border-amber-200/60 text-amber-900 font-bold">
                                <span>WIP:</span>
                                <span className="font-mono">{fmt(rHtc?.wipPcs || 0)} Nos</span>
                              </div>

                              {Number(rHtc?.wipPcs || 0) > 0 && rHtc?.dwellDays !== undefined && (
                                <div className="mt-1 flex items-center justify-end">
                                  <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-mono font-bold ${
                                    rHtc.agingSeverity === 'CRITICAL'
                                      ? 'bg-red-100 text-red-700 border border-red-200'
                                      : rHtc.agingSeverity === 'WARNING'
                                      ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                      : 'bg-slate-100 text-slate-600 border border-slate-200'
                                  }`}>
                                    <Clock size={9} />
                                    {rHtc.dwellDays}d at station
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                        </td>

                        {/* 3. Draw Bench */}
                        <td className="py-3 px-3 align-top bg-indigo-50/30 border-r border-indigo-100">
                          {data.childInfo ? (
                            <div className="rounded border border-indigo-200 bg-indigo-50/60 p-2 text-center">
                              <span className="text-[10px] font-bold text-indigo-800 uppercase tracking-wider block">
                                Planned in Work order No
                              </span>
                              <span className="font-mono text-xs text-indigo-950 font-bold block mt-0.5">
                                {data.childInfo.master_wo_no}
                              </span>
                              <span className="text-[10px] text-indigo-600 block mt-0.5 font-medium">
                                WIP: 0 Nos
                              </span>
                            </div>
                          ) : Number(rRoll?.outMtr || 0) === 0 ? (
                            <div className="text-[10px] text-slate-400 italic text-center py-2 bg-slate-50/50 rounded border border-dashed border-slate-200">
                              Waiting Upstream
                              <div className="font-mono font-bold text-slate-500 mt-0.5">WIP: 0 Nos</div>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <div className="flex justify-between text-slate-600">
                                <span>Output:</span>
                                <span className="font-mono font-bold text-emerald-700">{fmt(rDraw?.outPcs || 0)} Nos</span>
                              </div>

                              {Number(rDraw?.rejPcs || 0) > 0 && (
                                <div className="flex justify-between text-rose-600">
                                  <span>Rej:</span>
                                  <span className="font-mono">{fmt(rDraw?.rejPcs || 0)} Nos</span>
                                </div>
                              )}

                              <div className="flex justify-between pt-1 border-t border-indigo-200/60 text-indigo-900 font-bold">
                                <span>WIP:</span>
                                <span className="font-mono">{fmt(rDraw?.wipPcs || 0)} Nos</span>
                              </div>

                              {Number(rDraw?.wipPcs || 0) > 0 && rDraw?.dwellDays !== undefined && (
                                <div className="mt-1 flex items-center justify-end">
                                  <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-mono font-bold ${
                                    rDraw.agingSeverity === 'CRITICAL'
                                      ? 'bg-red-100 text-red-700 border border-red-200'
                                      : rDraw.agingSeverity === 'WARNING'
                                      ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                      : 'bg-slate-100 text-slate-600 border border-slate-200'
                                  }`}>
                                    <Clock size={9} />
                                    {rDraw.dwellDays}d at station
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                        </td>

                        {/* 4. Heat Treatment */}
                        <td className="py-3 px-3 align-top bg-orange-50/30 border-r border-orange-100">
                          {data.childInfo ? (
                            <div className="rounded border border-indigo-200 bg-indigo-50/60 p-2 text-center">
                              <span className="text-[10px] font-bold text-indigo-800 uppercase tracking-wider block">
                                Planned in Work order No
                              </span>
                              <span className="font-mono text-xs text-indigo-950 font-bold block mt-0.5">
                                {data.childInfo.master_wo_no}
                              </span>
                              <span className="text-[10px] text-indigo-600 block mt-0.5 font-medium">
                                WIP: 0 Nos
                              </span>
                            </div>
                          ) : Number(rRoll?.outMtr || 0) === 0 ? (
                            <div className="text-[10px] text-slate-400 italic text-center py-2 bg-slate-50/50 rounded border border-dashed border-slate-200">
                              Waiting Upstream
                              <div className="font-mono font-bold text-slate-500 mt-0.5">WIP: 0 Nos</div>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <div className="flex justify-between text-slate-600">
                                <span>Output:</span>
                                <span className="font-mono font-bold text-emerald-700">{fmt(rHt?.outPcs || 0)} Nos</span>
                              </div>

                              {Number(rHt?.rejPcs || 0) > 0 && (
                                <div className="flex justify-between text-rose-600">
                                  <span>Rej:</span>
                                  <span className="font-mono">{fmt(rHt?.rejPcs || 0)} Nos</span>
                                </div>
                              )}

                              <div className="flex justify-between pt-1 border-t border-orange-200/60 text-orange-900 font-bold">
                                <span>WIP:</span>
                                <span className="font-mono">{fmt(rHt?.wipPcs || 0)} Nos</span>
                              </div>

                              {Number(rHt?.wipPcs || 0) > 0 && rHt?.dwellDays !== undefined && (
                                <div className="mt-1 flex items-center justify-end">
                                  <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-mono font-bold ${
                                    rHt.agingSeverity === 'CRITICAL'
                                      ? 'bg-red-100 text-red-700 border border-red-200'
                                      : rHt.agingSeverity === 'WARNING'
                                      ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                      : 'bg-slate-100 text-slate-600 border border-slate-200'
                                  }`}>
                                    <Clock size={9} />
                                    {rHt.dwellDays}d at station
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                        </td>

                        {/* 5. Finishing Line */}
                        <td
                          onClick={() => {
                            setSelectedFinishingWo({
                              wo,
                              stagesData: data.stagesData,
                              isMaster: data.isMaster,
                              childInfo: data.childInfo,
                              qcItems: data.qcList || [],
                              finishingLogs: data.logs.filter((l) => l.stage_code === 'FINISHING'),
                            });
                          }}
                          className="py-3 px-3 align-top bg-emerald-50/30 border-r border-emerald-100 cursor-pointer hover:bg-emerald-100/60 hover:shadow-inner transition-colors group relative select-none"
                          title="Click to view VDI Inspected, VDI OK, VDI Salvage, VDI Rejection & Finishing Done breakdown"
                        >
                          <div className="space-y-1">
                            <div className="flex justify-between items-center text-slate-500 text-[11px]">
                              <span>Target:</span>
                              <div className="flex items-center gap-1">
                                <span className="font-mono font-bold text-slate-700">
                                  {fmt(rFin?.targetPcs || 0)} Pcs
                                </span>
                                <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 px-1 py-0.2 rounded opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                                  QC <ArrowRight size={8} />
                                </span>
                              </div>
                            </div>

                            <div className="flex justify-between text-slate-600">
                              <span>Finished:</span>
                              <span className="font-mono font-bold text-emerald-800 text-[13px]">{fmt(rFin?.outPcs || 0)} Nos</span>
                            </div>

                            {Number(rFin?.rejPcs || 0) > 0 && (
                              <div className="flex justify-between text-rose-600">
                                <span>Rej:</span>
                                <span className="font-mono">{fmt(rFin?.rejPcs || 0)} Nos</span>
                              </div>
                            )}

                            <div className="flex justify-between pt-1 border-t border-emerald-200/60 text-emerald-900 font-bold">
                              <span>Stock WIP:</span>
                              <span className="font-mono">{fmt(rFin?.wipPcs || 0)} Nos</span>
                            </div>

                            {Number(rFin?.wipPcs || 0) > 0 && rFin?.dwellDays !== undefined && (
                              <div className="mt-1 flex items-center justify-end">
                                <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-mono font-bold ${
                                  rFin.agingSeverity === 'CRITICAL'
                                    ? 'bg-red-100 text-red-700 border border-red-200'
                                    : rFin.agingSeverity === 'WARNING'
                                    ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                                }`}>
                                  <Clock size={9} />
                                  {rFin.dwellDays}d at station
                                </span>
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Overall Completion & Yield */}
                        <td className="py-3 px-3 align-top text-right">
                          <div className="space-y-1.5">
                            <div>
                              <div className="flex justify-between text-[11px]">
                                <span className="text-slate-500">Completed:</span>
                                <span className="font-bold text-slate-900 font-mono">{data.completionPct}%</span>
                              </div>
                              <div className="w-full bg-slate-100 rounded-full h-1.5 mt-0.5 overflow-hidden">
                                <div
                                  className="bg-emerald-600 h-1.5 rounded-full transition-all"
                                  style={{ width: `${data.completionPct}%` }}
                                />
                              </div>
                            </div>

                            <div className="text-[11px] flex justify-between">
                              <span className="text-slate-500">Yield:</span>
                              <span className="font-bold font-mono text-indigo-700">{data.processYieldPct}%</span>
                            </div>

                            {data.totalRejPcs > 0 && (
                              <div className="text-[10px] text-rose-600 font-mono">
                                Total Scrap: {fmt(data.totalRejPcs)} Nos
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Expanded Production History Rows */}
                      {isExpanded && (
                        <tr className="bg-slate-50/80 border-b border-slate-200">
                          <td colSpan={7} className="p-3">
                            <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2 shadow-2xs">
                              <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                                  <Clock size={13} className="text-blue-600" />
                                  Shift Production Log History for {wo.work_order_no}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => toggleWo(wo.id)}
                                  className="text-[11px] font-semibold text-slate-500 hover:text-slate-900 cursor-pointer"
                                >
                                  Close History
                                </button>
                              </div>

                              <div className="overflow-x-auto">
                                <table className="min-w-full text-[11px]">
                                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                                    <tr>
                                      <th className="py-1.5 px-2 text-left font-semibold">Date & Shift</th>
                                      <th className="py-1.5 px-2 text-left font-semibold">Stage</th>
                                      <th className="py-1.5 px-2 text-left font-semibold">Heat / Lot</th>
                                      <th className="py-1.5 px-2 text-right font-semibold">Output</th>
                                      <th className="py-1.5 px-2 text-right font-semibold">Rejection</th>
                                      <th className="py-1.5 px-2 text-right font-semibold">HTC OK</th>
                                      <th className="py-1.5 px-2 text-left font-semibold">Operator</th>
                                      <th className="py-1.5 px-2 text-left font-semibold">Remarks</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 font-mono">
                                    {data.logs.map((log) => {
                                      const isMh = log.stage_code === 'ROLLING' || log.stage_code === 'HOLLOW_HEAT_TREATMENT';
                                      const mhLen = (data.plan?.mh_l1 && data.plan?.mh_l2 ? (data.plan.mh_l1 + data.plan.mh_l2) / 2 : data.plan?.mh_l1 || data.plan?.mh_l2) || data.avgLen;
                                      const effLen = isMh && mhLen > 0 ? mhLen : (data.avgLen > 0 ? data.avgLen : 6.0);
                                      const outPcs = log.output_pcs > 0 ? log.output_pcs : (effLen > 0 && log.output_qty > 0 ? Math.round(log.output_qty / effLen) : 0);
                                      const rejPcs = log.rejection_pcs > 0 ? log.rejection_pcs : (effLen > 0 && log.rejection_qty > 0 ? Math.round(log.rejection_qty / effLen) : 0);
                                      const htcPcs = Number(log.htc_ok_pcs || 0) > 0 ? Number(log.htc_ok_pcs) : (effLen > 0 && Number(log.htc_ok_qty || 0) > 0 ? Math.round(Number(log.htc_ok_qty) / effLen) : 0);

                                      return (
                                        <tr key={log.id} className="hover:bg-slate-50/60">
                                          <td className="py-1.5 px-2 text-slate-800 font-sans">
                                            {log.shift_date} {log.shift ? `(${log.shift})` : ''}
                                          </td>
                                          <td className="py-1.5 px-2 text-slate-900 font-sans font-medium">
                                            {log.stage_name}
                                          </td>
                                          <td className="py-1.5 px-2 text-slate-600">
                                            {log.heat_no || '—'} / {log.lot_no || '—'}
                                          </td>
                                          <td className="py-1.5 px-2 text-right font-bold text-emerald-700">
                                            {fmt(outPcs)} Nos
                                            {log.output_qty > 0 && (
                                              <span className="text-[10px] text-slate-400 font-normal ml-1 font-sans">
                                                ({fmt(log.output_qty)}m)
                                              </span>
                                            )}
                                          </td>
                                          <td className="py-1.5 px-2 text-right text-rose-600">
                                            {rejPcs > 0 ? `${fmt(rejPcs)} Nos` : '0'}
                                          </td>
                                          <td className="py-1.5 px-2 text-right text-indigo-700 font-semibold">
                                            {htcPcs > 0 ? `${fmt(htcPcs)} Nos` : '—'}
                                          </td>
                                          <td className="py-1.5 px-2 text-slate-600 font-sans">
                                            {log.operator_name || '—'}
                                          </td>
                                          <td className="py-1.5 px-2 text-slate-500 font-sans truncate max-w-[200px]">
                                            {log.remarks || '—'}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* QC & Finishing Breakdown Modal (Requirement 5) */}
      {selectedFinishingWo && (
        <FinishingQcModal
          data={selectedFinishingWo}
          onClose={() => setSelectedFinishingWo(null)}
        />
      )}
    </div>
  );
}

interface FinishingQcModalProps {
  data: {
    wo: WorkOrder;
    stagesData: StageTrackingMetric[];
    isMaster: boolean;
    childInfo?: any;
    qcItems: any[];
    finishingLogs: ProductionLog[];
  };
  onClose: () => void;
}

function FinishingQcModal({ data, onClose }: FinishingQcModalProps) {
  const { wo, childInfo, isMaster, qcItems, finishingLogs } = data;
  const od = Number(wo.size_od || 0);
  const wt = Number(wo.size_wt || 0);
  const l1 = Number(wo.l1 || 6);
  const l2 = Number(wo.l2 || 6.5);
  const avgLen = l1 > 0 && l2 > 0 ? (l1 + l2) / 2 : l1 || 6.25;

  // VDI QC Totals
  const totalInspectedPcs = qcItems.reduce((sum: number, q: any) => sum + Number(q.inspected_pcs || 0), 0);
  const totalInspectedMtr = qcItems.reduce((sum: number, q: any) => sum + Number(q.inspected_mtr || 0), 0);
  const totalInspectedMt = qcItems.reduce((sum: number, q: any) => sum + Number(q.inspected_mt || 0), 0) || mtFromMtr(totalInspectedMtr, od, wt);

  const totalVdiOkPcs = qcItems.reduce((sum: number, q: any) => sum + Number(q.vdi_ok_pcs || 0), 0);
  const totalVdiOkMtr = qcItems.reduce((sum: number, q: any) => sum + Number(q.vdi_ok_mtr || 0), 0);
  const totalVdiOkMt = qcItems.reduce((sum: number, q: any) => sum + Number(q.vdi_ok_mt || 0), 0) || mtFromMtr(totalVdiOkMtr, od, wt);

  const totalVdiSalvagePcs = qcItems.reduce((sum: number, q: any) => sum + Number(q.vdi_salvage_pcs || 0), 0);
  const totalVdiSalvageMtr = qcItems.reduce((sum: number, q: any) => sum + Number(q.vdi_salvage_mtr || 0), 0);
  const totalVdiSalvageMt = qcItems.reduce((sum: number, q: any) => sum + Number(q.vdi_salvage_mt || 0), 0) || mtFromMtr(totalVdiSalvageMtr, od, wt);

  const totalVdiRejPcs = qcItems.reduce((sum: number, q: any) => sum + Number(q.vdi_rejection_pcs || 0), 0);
  const totalVdiRejMtr = qcItems.reduce((sum: number, q: any) => sum + Number(q.vdi_rejection_mtr || 0), 0);
  const totalVdiRejMt = qcItems.reduce((sum: number, q: any) => sum + Number(q.vdi_rejection_mt || 0), 0) || mtFromMtr(totalVdiRejMtr, od, wt);

  // Finishing Production Totals
  const finishingDonePcs = finishingLogs.reduce((sum: number, l: any) => sum + Number(l.output_pcs || 0), 0);
  const finishingDoneMtr = finishingLogs.reduce((sum: number, l: any) => sum + Number(l.output_qty || 0), 0);
  const finishingDoneMt = mtFromMtr(finishingDoneMtr, od, wt);

  const finishingRejPcs = finishingLogs.reduce((sum: number, l: any) => sum + Number(l.rejection_pcs || 0), 0);
  const finishingRejMtr = finishingLogs.reduce((sum: number, l: any) => sum + Number(l.rejection_qty || 0), 0);

  // Approved for Finishing (Strictly VDI OK)
  const totalPassedPcs = totalVdiOkPcs;
  const totalPassedMt = totalVdiOkMt;

  // Current WIP Available in Finishing
  const finishingWipPcs = Math.max(0, totalPassedPcs - finishingDonePcs - finishingRejPcs);
  const finishingWipMtr = avgLen > 0 ? Number((finishingWipPcs * avgLen).toFixed(3)) : 0;
  const finishingWipMt = mtFromMtr(finishingWipMtr, od, wt);

  // Flatten all salvage reasons across QC inspection entries
  const allSalvageReasons: { reason: string; pcs: number; mt: number; description?: string }[] = [];
  qcItems.forEach((q: any) => {
    if (Array.isArray(q.salvage_reasons)) {
      q.salvage_reasons.forEach((sr: any) => {
        allSalvageReasons.push({
          reason: sr.reason || 'General Defect',
          pcs: Number(sr.pcs || 0),
          mt: Number(sr.mt || 0),
          description: sr.description || '',
        });
      });
    }
  });

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden my-8">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white p-5 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
                QC / VDI Breakdown
              </span>
              <h2 className="text-xl font-bold font-mono tracking-tight text-white">
                {wo.work_order_no}
              </h2>
              {isMaster && (
                <span className="bg-indigo-500/30 text-indigo-200 border border-indigo-400/40 text-xs px-2 py-0.5 rounded-full font-semibold">
                  Master Campaign
                </span>
              )}
              {childInfo && (
                <span className="bg-amber-500/30 text-amber-200 border border-amber-400/40 text-xs px-2 py-0.5 rounded-full font-semibold">
                  Child of {childInfo.master_wo_no}
                </span>
              )}
            </div>
            <div className="text-slate-300 text-sm mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>Customer: <strong className="text-white">{wo.customer_name || '—'}</strong></span>
              <span>·</span>
              <span>Grade: <strong className="text-white">{wo.grade || '—'}</strong></span>
              <span>·</span>
              <span>Size: <strong className="text-white font-mono">{od} × {wt} mm</strong></span>
              <span>·</span>
              <span>Length: <strong className="text-white font-mono">{l1} - {l2} m</strong></span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[calc(85vh-120px)] overflow-y-auto">
          {/* 5 Primary Highlighted Metric Cards (Requirement 5) */}
          <div>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
              Quality Inspection & Finishing Metrics
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
              {/* 1. VDI Inspected */}
              <div className="bg-blue-50/80 border border-blue-200 rounded-xl p-3.5 flex flex-col justify-between">
                <div className="flex items-center justify-between text-blue-900 mb-1">
                  <span className="text-xs font-bold uppercase tracking-wider">VDI Inspected</span>
                  <ClipboardCheck size={16} className="text-blue-600" />
                </div>
                <div>
                  <div className="text-2xl font-extrabold font-mono text-blue-950">
                    {fmt(totalInspectedPcs)} <span className="text-sm font-semibold font-sans text-blue-700">Nos</span>
                  </div>
                  <div className="text-xs font-medium text-blue-800 mt-0.5">
                    {fmt(totalInspectedMt)} MT
                  </div>
                  <div className="text-[11px] text-blue-600/80 font-mono">
                    {fmt(totalInspectedMtr)} Mtr
                  </div>
                </div>
              </div>

              {/* 2. VDI OK */}
              <div className="bg-emerald-50/80 border border-emerald-200 rounded-xl p-3.5 flex flex-col justify-between">
                <div className="flex items-center justify-between text-emerald-900 mb-1">
                  <span className="text-xs font-bold uppercase tracking-wider">VDI OK</span>
                  <CheckCircle2 size={16} className="text-emerald-600" />
                </div>
                <div>
                  <div className="text-2xl font-extrabold font-mono text-emerald-950">
                    {fmt(totalVdiOkPcs)} <span className="text-sm font-semibold font-sans text-emerald-700">Nos</span>
                  </div>
                  <div className="text-xs font-medium text-emerald-800 mt-0.5">
                    {fmt(totalVdiOkMt)} MT
                  </div>
                  <div className="text-[11px] text-emerald-600/80 font-mono">
                    {fmt(totalVdiOkMtr)} Mtr
                  </div>
                </div>
              </div>

              {/* 3. VDI Salvage */}
              <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-3.5 flex flex-col justify-between">
                <div className="flex items-center justify-between text-amber-900 mb-1">
                  <span className="text-xs font-bold uppercase tracking-wider">VDI Salvage</span>
                  <AlertTriangle size={16} className="text-amber-600" />
                </div>
                <div>
                  <div className="text-2xl font-extrabold font-mono text-amber-950">
                    {fmt(totalVdiSalvagePcs)} <span className="text-sm font-semibold font-sans text-amber-700">Nos</span>
                  </div>
                  <div className="text-xs font-medium text-amber-800 mt-0.5">
                    {fmt(totalVdiSalvageMt)} MT
                  </div>
                  <div className="text-[11px] text-amber-600/80 font-mono">
                    {fmt(totalVdiSalvageMtr)} Mtr
                  </div>
                </div>
              </div>

              {/* 4. VDI Rejection */}
              <div className="bg-rose-50/80 border border-rose-200 rounded-xl p-3.5 flex flex-col justify-between">
                <div className="flex items-center justify-between text-rose-900 mb-1">
                  <span className="text-xs font-bold uppercase tracking-wider">VDI Rejection</span>
                  <XCircle size={16} className="text-rose-600" />
                </div>
                <div>
                  <div className="text-2xl font-extrabold font-mono text-rose-950">
                    {fmt(totalVdiRejPcs)} <span className="text-sm font-semibold font-sans text-rose-700">Nos</span>
                  </div>
                  <div className="text-xs font-medium text-rose-800 mt-0.5">
                    {fmt(totalVdiRejMt)} MT
                  </div>
                  <div className="text-[11px] text-rose-600/80 font-mono">
                    {fmt(totalVdiRejMtr)} Mtr
                  </div>
                </div>
              </div>

              {/* 5. Finishing Done */}
              <div className="bg-indigo-50/80 border border-indigo-200 rounded-xl p-3.5 flex flex-col justify-between">
                <div className="flex items-center justify-between text-indigo-900 mb-1">
                  <span className="text-xs font-bold uppercase tracking-wider">Finishing Done</span>
                  <PackageCheck size={16} className="text-indigo-600" />
                </div>
                <div>
                  <div className="text-2xl font-extrabold font-mono text-indigo-950">
                    {fmt(finishingDonePcs)} <span className="text-sm font-semibold font-sans text-indigo-700">Nos</span>
                  </div>
                  <div className="text-xs font-medium text-indigo-800 mt-0.5">
                    {fmt(finishingDoneMt)} MT
                  </div>
                  <div className="text-[11px] text-indigo-600/80 font-mono">
                    {fmt(finishingDoneMtr)} Mtr
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Flow Balance Summary (VDI OK + Salvage -> Finishing Done -> Stock WIP) */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-4 text-xs">
              <div className="flex items-center gap-3">
                <div className="font-semibold text-slate-700">Finishing Input Allowed:</div>
                <div className="font-mono font-bold text-slate-900 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                  {fmt(totalPassedPcs)} Nos ({fmt(totalPassedMt)} MT)
                  <span className="text-[10px] text-slate-500 font-normal ml-1">(VDI OK)</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="font-semibold text-slate-700">Remaining Finishing WIP:</div>
                <div className={`font-mono font-bold px-2.5 py-1 rounded-lg border ${
                  finishingWipPcs > 0
                    ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                    : 'bg-slate-100 text-slate-600 border-slate-200'
                }`}>
                  {fmt(finishingWipPcs)} Nos ({fmt(finishingWipMt)} MT)
                </div>
              </div>
              {finishingRejPcs > 0 && (
                <div className="flex items-center gap-3">
                  <div className="font-semibold text-rose-700">Finishing Line Rejection:</div>
                  <div className="font-mono font-bold text-rose-900 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                    {fmt(finishingRejPcs)} Nos
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Salvage Reasons Breakdown */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle size={14} className="text-amber-500" />
                Itemized Salvage Reasons Breakdown
              </div>
              <span className="text-xs text-slate-500 font-mono">
                Total Salvage: <strong>{fmt(totalVdiSalvagePcs)} Nos</strong> ({fmt(totalVdiSalvageMt)} MT)
              </span>
            </div>

            {allSalvageReasons.length === 0 ? (
              <div className="p-4 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-center text-slate-500 text-xs">
                No salvage defects recorded for this work order.
              </div>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100/90 text-slate-700 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3">Defect Reason</th>
                      <th className="py-2 px-3 text-right">Quantity (Nos)</th>
                      <th className="py-2 px-3 text-right">Weight (MT)</th>
                      <th className="py-2 px-3">Notes / Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {allSalvageReasons.map((sr, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/70">
                        <td className="py-2 px-3 font-medium text-slate-800">
                          <span className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-2" />
                          {sr.reason}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-amber-900">
                          {fmt(sr.pcs)} Nos
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-slate-600">
                          {fmt(sr.mt)} MT
                        </td>
                        <td className="py-2 px-3 text-slate-500 italic">
                          {sr.description || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Logged QC Inspection Entries */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <ClipboardCheck size={14} className="text-blue-600" />
                QC / VDI Inspection History ({qcItems.length} Logged Entries)
              </div>
              <Link
                href="/qc"
                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 hover:underline"
              >
                Open QC Form <ExternalLink size={12} />
              </Link>
            </div>

            {qcItems.length === 0 ? (
              <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-xs flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertCircle size={16} className="text-amber-600 flex-shrink-0" />
                  <span>No QC / VDI inspections logged yet for this work order. Heat Treatment OK stock must be inspected in the QC form before it becomes available in Finishing.</span>
                </div>
                <Link
                  href="/qc"
                  className="ml-3 bg-amber-600 hover:bg-amber-700 text-white font-semibold px-3 py-1.5 rounded-lg transition text-xs whitespace-nowrap"
                >
                  Enter QC Inspection
                </Link>
              </div>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100/90 text-slate-700 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3">Date</th>
                      <th className="py-2 px-3 text-right">Inspected Nos</th>
                      <th className="py-2 px-3 text-right text-emerald-700">VDI OK Nos</th>
                      <th className="py-2 px-3 text-right text-amber-700">Salvage Nos</th>
                      <th className="py-2 px-3 text-right text-rose-700">Rejection Nos</th>
                      <th className="py-2 px-3">Inspector</th>
                      <th className="py-2 px-3">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {qcItems.map((q: any) => (
                      <tr key={q.id} className="hover:bg-slate-50/70">
                        <td className="py-2 px-3 font-mono text-slate-700">
                          {q.inspection_date || '—'}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-blue-900">
                          {fmt(q.inspected_pcs || 0)} Nos
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-emerald-700">
                          {fmt(q.vdi_ok_pcs || 0)} Nos
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-amber-700">
                          {fmt(q.vdi_salvage_pcs || 0)} Nos
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-rose-700">
                          {fmt(q.vdi_rejection_pcs || 0)} Nos
                        </td>
                        <td className="py-2 px-3 text-slate-600">
                          {q.inspected_by || q.created_by || '—'}
                        </td>
                        <td className="py-2 px-3 text-slate-500 truncate max-w-[180px]">
                          {q.remarks || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 border-t border-slate-200 p-4 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            Clicking the Finishing Line field opens this detailed VDI & Finishing view.
          </span>
          <Button
            variant="outline"
            onClick={onClose}
            className="px-5 cursor-pointer"
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
