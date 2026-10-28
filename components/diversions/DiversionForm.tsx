'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Lock,
  ArrowRight,
  Workflow,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Factory,
  Search,
  RefreshCw,
  Edit2,
  Trash2,
  X,
  Shuffle,
  Calendar,
  Layers,
  Scissors,
  Recycle,
  ArrowRightLeft,
  Clock,
  Check,
  XCircle,
  ShieldCheck,
} from 'lucide-react';
import { usePermissions, getFormAccess } from '@/lib/permissions';
import { useOptionalUserSession } from '@/contexts/UserSessionContext';
import FormAccessBanner from '@/components/common/FormAccessBanner';
import { buildCampaignHierarchyMaps, reconcileCampaignWorkOrderWip } from '@/lib/campaignWipUtils';
import { DrawReductionBadge } from '@/components/diversions/DrawReductionBadge';
import { StpConstraintAlert } from '@/components/diversions/StpConstraintAlert';
import { CutAndDivertSection } from '@/components/diversions/CutAndDivertSection';
import { OffcutPoolManager } from '@/components/diversions/OffcutPoolManager';
import { calcOrderBalanceSurplus } from '@/lib/diversionCalculations';
import { WorkOrderSelect } from '@/components/ui/WorkOrderSelect';
import { approveDiversion, rejectDiversion } from '@/lib/diversions/client';

type WO = {
  id: string;
  work_order_no: string;
  customer_name: string | null;
  grade: string | null;
  specification?: string | null;
  size_od: number | null;
  size_wt: number | null;
  od?: number | null;
  wt?: number | null;
  l1: number | null;
  l2: number | null;
  ordered_qty: number;
  uom: 'Pcs' | 'Mtrs';
  balance_qty_pcs?: number;
  balance_qty_mtr?: number;
  balance_qty_mt?: number;
  status?: string;
  target_date?: string | null;
  process_route_id?: string | null;
};

type Route = { id: string; route_code: string; route_name: string };

type DiversionPlanItem = {
  id: string;
  source_wo_id: string;
  source_wo_no: string;
  source_customer: string;
  source_grade: string;
  source_size: string;
  target_wo_id: string;
  target_wo_no: string;
  target_customer: string;
  target_grade: string;
  target_size: string;
  diverted_qty: number;
  diverted_pcs: number;
  diverted_mt: number;
  work_center: string;
  work_center_name: string;
  source_work_center?: string;
  target_work_center?: string;
  route_id: string;
  route_code: string;
  route_name: string;
  multiple: number;
  reason: string;
  approved_by: string;
  diversion_date: string;
  created_at: string;
  updated_at?: string;
  can_modify: boolean;
  status?: string;
  ppc_approved_by?: string | null;
  ppc_approved_at?: string | null;
  ppc_rejection_reason?: string | null;
  ppc_remarks?: string | null;
};

const getWcShortName = (code?: string) => {
  if (!code) return '—';
  const map: Record<string, string> = {
    ROLLING: 'Rolling',
    HOLLOW_HEAT_TREATMENT: 'Hollow HT',
    DRAW: 'Draw',
    HEAT_TREATMENT: 'Heat Treatment',
    BAND_SAW: 'Band Saw',
    VDI: 'VDI',
    FINISHING: 'Finishing',
  };
  return map[code] || code.replace(/_/g, ' ');
};

type WoWipSummary = {
  wo: WO;
  od: number;
  wt: number;
  l1: number;
  l2: number;
  avgLength: number;
  orderedMtr: number;
  orderedPcs: number;
  orderedMt: number;
  rollingGrossMtr: number;
  rollingRejMtr: number;
  rollingNetMtr: number;
  rollingHtcOkMtr: number;
  rollingHtcOkPcs: number;
  rollingHtcOkMt: number;
  divertedOutMtr: number;
  divertedOutPcs: number;
  divertedOutMt: number;
  divertedInMtr: number;
  divertedInPcs: number;
  divertedInMt: number;
  physicalAvailableMtr: number;
  unplannedOrderMtr: number;
  balanceWipMtr: number;
  balanceWipPcs: number;
  balanceWipMt: number;
  stageBreakdown: {
    stage_code: string;
    stage_name: string;
    sequence_no: number;
    available_mtr: number;
    available_pcs: number;
    available_mt: number;
    input_qty: number;
    output_qty: number;
    rejection_qty: number;
    net_output_qty: number;
  }[];
  planMultiple?: number;
  effectiveHtcOkFinishedMtr?: number;
  finishingDoneMtr?: number;
  qcVdiRejMtr?: number;
  primeAvailableMtr?: number;
  salvageAvailableMtr?: number;
  pendingDrawDiversionsMtr?: number;
  pendingDrawDiversionsCount?: number;
};

type WipViewRow = {
  work_order_id: string;
  stage_code: string;
  stage_name: string;
  sequence_no: number;
  incoming_qty?: number | null;
  production_qty?: number | null;
  rejection_qty?: number | null;
  current_wip?: number | null;
  current_rejection?: number | null;
  diversion_out?: number | null;
  total_wip_mtr?: number | null;
  total_wip_pcs?: number | null;
  total_wip_mt?: number | null;
  net_output_mtr?: number | null;
};

async function fetchWipSummary(supabase: ReturnType<typeof createClient>, id: string, wo: WO): Promise<WoWipSummary> {
  // Query actual production logs, diversion plans, rolling plans, routes, and QC inspections
  const [logsRes, divRes, plansRes, routesRes, qcRes, stageWipRes, stagesRes] = await Promise.all([
    supabase
      .from('production_logs')
      .select('*, process_stages(stage_code, stage_name)')
      .eq('work_order_id', id),
    supabase
      .from('diversion_plans')
      .select('*')
      .or(`source_wo_id.eq.${id},target_wo_id.eq.${id}`),
    supabase
      .from('rolling_plans')
      .select('*')
      .not('status', 'is', null),
    supabase
      .from('process_routes')
      .select('id, route_code, route_name'),
    supabase
      .from('qc_inspections')
      .select('*')
      .eq('work_order_id', id),
    supabase
      .from('vw_route_stage_wip')
      .select('*')
      .eq('work_order_id', id)
      .order('sequence_no', { ascending: true }),
    supabase
      .from('process_stages')
      .select('*'),
  ]);

  const logs = logsRes.data || [];
  const divs = divRes.data || [];
  const plans = plansRes.data || [];
  const routes = routesRes.data || [];
  const qcList = qcRes.data || [];
  const stageRows = stageWipRes.data || [];
  const stagesList = stagesRes.data || [];

  const stageCodeById = new Map<string, string>();
  stagesList.forEach((s: any) => {
    if (s.id && s.stage_code) stageCodeById.set(s.id, s.stage_code.toUpperCase());
  });
  const finishingStageId = stagesList.find((s: any) => (s.stage_code || '').toUpperCase() === 'FINISHING')?.id;

  // Determine active route for this work order
  const plan = plans.find((p: any) => p.work_order_id === id);
  const routeId = plan?.process_route_id || wo.process_route_id;
  const route = routes.find((r: any) => r.id === routeId);
  const routeCode = (route?.route_code || 'CDS').toUpperCase();

  const isHfs = routeCode === 'HFS' || routeCode === 'ALLOY_HFS';
  const hasHtcInRoute = routeCode === 'ALLOY_HFS' || routeCode === 'ALLOY_CDS';
  const hasDrawInRoute = routeCode === 'CDS' || routeCode === 'ALLOY_CDS';
  const hasPilgerInRoute = routeCode === 'SS_STEEL';
  const hasHtInRoute = routeCode === 'CDS' || routeCode === 'ALLOY_CDS' || routeCode === 'SS_STEEL';

  // Check campaign / child mapping
  const hierarchyMaps = buildCampaignHierarchyMaps(plans);
  const masterWoId = hierarchyMaps.childToMasterMap.get(id) || id;
  const campaignMembers = hierarchyMaps.campaignMembersMap.get(masterWoId);
  const memberIds = campaignMembers && campaignMembers.size > 0 ? Array.from(campaignMembers) : [id];
  const isCampaignMaster = masterWoId === id && Boolean(campaignMembers && campaignMembers.size > 1);
  const isOrderCompleted = (wo.status || '').toLowerCase() === 'completed';

  // Fetch campaign-wide QC inspections and production logs if this order is part of a multi-WO campaign
  let effectiveLogs = logs;
  let allQcList = qcList;
  if (memberIds.length > 1) {
    const [campaignQcRes, campaignLogsRes] = await Promise.all([
      supabase.from('qc_inspections').select('*').in('work_order_id', memberIds),
      supabase.from('production_logs').select('*, process_stages(stage_code, stage_name)').in('work_order_id', memberIds),
    ]);
    if (campaignQcRes.data) allQcList = campaignQcRes.data;
    if (campaignLogsRes.data) effectiveLogs = campaignLogsRes.data;
  } else if (masterWoId !== id) {
    const { data: masterLogs } = await supabase
      .from('production_logs')
      .select('*, process_stages(stage_code, stage_name)')
      .eq('work_order_id', masterWoId);
    if (masterLogs) {
      effectiveLogs = [...logs, ...masterLogs.filter((ml: any) => ml.process_stages?.stage_code !== 'FINISHING')];
    }
  }

  const avgLength = Number(wo.l1 ?? 0) > 0 && Number(wo.l2 ?? 0) > 0
    ? (Number(wo.l1) + Number(wo.l2)) / 2
    : Number(wo.l1 ?? wo.l2 ?? 0) || 6;
  const od = Number(wo.size_od ?? 0);
  const wt = Number(wo.size_wt ?? 0);
  const mtPerMtr = od > wt ? (od - wt) * wt * 0.0246615 * 0.001 : 0;

  // Real ordered metrics
  const orderedMtr = Number(wo.ordered_qty || 0);
  const orderedPcs = avgLength > 0 ? Math.round(orderedMtr / avgLength) : 0;
  const orderedMt = orderedMtr * mtPerMtr;

  // Actual production logs per stage
  const rollLogs = effectiveLogs.filter((l: any) => (l.process_stages?.stage_code || l.stage_code) === 'ROLLING');
  const htcLogs = effectiveLogs.filter((l: any) => (l.process_stages?.stage_code || l.stage_code) === 'HOLLOW_HEAT_TREATMENT');
  const drawLogs = effectiveLogs.filter((l: any) => (l.process_stages?.stage_code || l.stage_code) === 'DRAW');
  const pilgerLogs = effectiveLogs.filter((l: any) => (l.process_stages?.stage_code || l.stage_code) === 'PILGER');
  const htLogs = effectiveLogs.filter((l: any) => (l.process_stages?.stage_code || l.stage_code) === 'HEAT_TREATMENT');
  const finLogs = effectiveLogs.filter((l: any) => (l.process_stages?.stage_code || l.stage_code) === 'FINISHING' && l.work_order_id === id);

  const rollingGrossMtr = rollLogs.reduce((sum: number, l: any) => sum + Number(l.output_qty || 0), 0);
  const rollingRejMtr = rollLogs.reduce((sum: number, l: any) => sum + Number(l.rejection_qty || 0), 0);
  const rollingNetMtr = Math.max(0, rollingGrossMtr - rollingRejMtr);
  const rollingHtcOkMtr = rollLogs.reduce((sum: number, l: any) => sum + Number(l.htc_ok ?? l.htc_ok_qty ?? 0), 0);
  const rollingHtcOkPcs = avgLength > 0 ? Math.round(rollingHtcOkMtr / avgLength) : 0;
  const rollingHtcOkMt = rollingHtcOkMtr * mtPerMtr;

  const htcOutMtr = htcLogs.reduce((sum: number, l: any) => sum + Number(l.output_qty || 0), 0);
  const htcRejMtr = htcLogs.reduce((sum: number, l: any) => sum + Number(l.rejection_qty || 0), 0);
  const htcNetMtr = Math.max(0, htcOutMtr - htcRejMtr);

  const drawOutMtr = drawLogs.reduce((sum: number, l: any) => sum + Number(l.output_qty || 0), 0);
  const drawRejMtr = drawLogs.reduce((sum: number, l: any) => sum + Number(l.rejection_qty || 0), 0);
  const drawNetMtr = Math.max(0, drawOutMtr - drawRejMtr);

  const pilgerOutMtr = pilgerLogs.reduce((sum: number, l: any) => sum + Number(l.output_qty || 0), 0);
  const pilgerRejMtr = pilgerLogs.reduce((sum: number, l: any) => sum + Number(l.rejection_qty || 0), 0);
  const pilgerNetMtr = Math.max(0, pilgerOutMtr - pilgerRejMtr);

  const htOutMtr = htLogs.reduce((sum: number, l: any) => sum + Number(l.output_qty || 0), 0);
  const htRejMtr = htLogs.reduce((sum: number, l: any) => sum + Number(l.rejection_qty || 0), 0);
  const htNetMtr = Math.max(0, htOutMtr - htRejMtr);

  const finOutMtr = finLogs.reduce((sum: number, l: any) => sum + Number(l.output_qty || 0), 0);
  const finRejMtr = finLogs.reduce((sum: number, l: any) => sum + Number(l.rejection_qty || 0), 0);

  const qcInspectedMtr = allQcList.reduce((sum: number, q: any) => sum + Number(q.inspected_mtr || 0), 0);
  const qcOkMtr = allQcList.reduce((sum: number, q: any) => sum + Number(q.vdi_ok_mtr || 0), 0);
  const qcSalvageMtr = allQcList.reduce((sum: number, q: any) => sum + Number(q.vdi_salvage_mtr || 0), 0);
  const qcVdiRejMtr = allQcList.reduce((sum: number, q: any) => sum + Number(q.vdi_rejection_mtr || 0), 0);

  // Reconcile WIP using piece-governed mass-conserving campaign logic
  const reconciled = reconcileCampaignWorkOrderWip({
    woId: id,
    wo,
    rows: stageRows,
    qcInspections: allQcList,
    productionLogs: effectiveLogs,
    hierarchyMaps,
    routeCode,
    stageCodeById,
    finishingStageId,
  });

  // Elongation multiple for this work order
  const planMultiple = Number(plan?.multiple || 1) > 0 ? Number(plan?.multiple || 1) : 1;

  // Filter approved diversions: unapproved diversions (e.g. PENDING_PPC) do NOT deduct WIP
  const isApproved = (d: any) => !d.status || d.status === 'APPROVED';
  const approvedDivs = divs.filter(isApproved);
  const pendingDrawDivs = divs.filter(
    (d: any) => d.status === 'PENDING_PPC' && (d.work_center === 'DRAW' || (d.reason || '').includes('[TO_STAGE: DRAW]'))
  );

  // Diversions per stage (strictly uses approved diversions for WIP balance)
  const getDivOut = (stageCode: string) =>
    approvedDivs.filter((d: any) => d.source_wo_id === id && (d.work_center || 'ROLLING') === stageCode)
        .reduce((sum: number, d: any) => sum + Number(d.diverted_qty || 0), 0);

  const getDivIn = (stageCode: string) =>
    approvedDivs.filter((d: any) => d.target_wo_id === id && (d.work_center || 'ROLLING') === stageCode)
        .reduce((sum: number, d: any) => sum + Number(d.diverted_qty || 0), 0);

  const totalDivertedOutMtr = approvedDivs
    .filter((d: any) => d.source_wo_id === id)
    .reduce((sum: number, d: any) => sum + Number(d.diverted_qty || 0), 0);
  const totalDivertedInMtr = approvedDivs
    .filter((d: any) => d.target_wo_id === id)
    .reduce((sum: number, d: any) => sum + Number(d.diverted_qty || 0), 0);

  const pendingDrawDiversionsMtr = pendingDrawDivs
    .filter((d: any) => d.source_wo_id === id)
    .reduce((sum: number, d: any) => sum + Number(d.diverted_qty || 0), 0);
  const pendingDrawDiversionsCount = pendingDrawDivs.filter((d: any) => d.source_wo_id === id).length;

  // FORMULA (RULE 2): ALL material (Prime or Salvage/Rejected) can be diverted!
  // Rejections do NOT vanish as dead scrap and are NOT deducted from the diversion pool.
  const rollingHtcOkBaseMtr = rollingHtcOkMtr > 0 ? rollingHtcOkMtr : rollingNetMtr;
  const effectiveHtcOkFinishedMtr = rollingHtcOkBaseMtr * planMultiple;
  const finishingShippedMtr = finOutMtr; // Only actual dispatched finished goods leave the plant
  const totalRejectionSalvageMtr = Math.max(0, qcVdiRejMtr + rollingRejMtr + htcRejMtr + drawRejMtr + pilgerRejMtr + htRejMtr + finRejMtr);

  let stageBreakdown: any[] = [];

  if (stageRows.length > 0) {
    stageBreakdown = stageRows.map((stg: any) => {
      const sc = stg.stage_code;
      const recStage = reconciled.summary.stages.find((s: any) => s.stage_code === sc);

      let curWipPcs = Number(recStage?.capped_wip_pcs ?? recStage?.reconciled_wip_pcs ?? 0);
      let curWipMtr = Number(recStage?.capped_wip_mtr ?? recStage?.reconciled_wip_mtr ?? 0);
      let curWipMt = Number(recStage?.capped_wip_mt ?? recStage?.reconciled_wip_mt ?? (curWipMtr * mtPerMtr));

      // Reconcile VDI WIP under Rule 2 Option B:
      // Rejections/salvage logged by QC inspections remain active WIP and are available for diversion.
      if (sc === 'VDI') {
        const totalVdiRejMtr = allQcList.reduce((sum: number, q: any) => sum + Number(q.vdi_rejection_mtr || 0) + Number(q.vdi_salvage_mtr || 0), 0);
        const totalVdiRejPcs = allQcList.reduce((sum: number, q: any) => sum + Number(q.vdi_rejection_pcs || 0) + Number(q.vdi_salvage_pcs || 0), 0);
        const vdiDivOutMtr = Number(stg.diversion_out || 0);

        // Distinguish salvage/rejection diversions from prime diversions:
        // Diversions of prime material reallocate prime queue and do not consume the salvage pool.
        const vdiSalvageDivOutMtr = divs
          .filter((d: any) => {
            if (d.source_wo_id !== id) return false;
            const fromMatch = d.reason?.match(/\[FROM_STAGE:\s*([A-Z_]+)\]/i);
            const fromStage = fromMatch ? fromMatch[1].toUpperCase() : (d.work_center || '').toUpperCase();
            if (fromStage !== 'VDI') return false;
            const r = (d.reason || '').toLowerCase();
            return r.includes('salvage') || r.includes('rejection') || r.includes('second') || r.includes('scrap');
          })
          .reduce((sum: number, d: any) => sum + Number(d.diverted_qty || 0), 0);

        const availableVdiRejMtr = Math.max(0, totalVdiRejMtr - vdiSalvageDivOutMtr);
        const availableVdiRejPcs = totalVdiRejMtr > 0
          ? Math.max(0, Math.round(totalVdiRejPcs * (availableVdiRejMtr / totalVdiRejMtr)))
          : 0;

        // When prime uninspected material has fully passed downstream, active WIP at VDI is strictly the undispositioned salvage pool
        if (curWipPcs === 0 && availableVdiRejPcs > 0) {
          curWipPcs = availableVdiRejPcs;
          curWipMtr = availableVdiRejMtr > 0 ? availableVdiRejMtr : (avgLength > 0 ? Number((availableVdiRejPcs * avgLength).toFixed(2)) : 0);
          curWipMt = curWipMtr * mtPerMtr;
        } else if (availableVdiRejPcs > 0 && curWipPcs < availableVdiRejPcs) {
          curWipPcs = availableVdiRejPcs;
          curWipMtr = availableVdiRejMtr > 0 ? availableVdiRejMtr : (avgLength > 0 ? Number((availableVdiRejPcs * avgLength).toFixed(2)) : 0);
          curWipMt = curWipMtr * mtPerMtr;
        }
      }

      // Reconcile Finishing WIP:
      // If work order is completed or is a campaign master, no finishing WIP remains.
      // For active work orders with unbundled material (curWipPcs > 0), reconcile Finishing WIP
      // against this order's own inspected OK pieces, capped by incoming material surviving VDI diversions.
      if (sc === 'FINISHING') {
        if (isCampaignMaster || isOrderCompleted) {
          curWipPcs = 0;
          curWipMtr = 0;
          curWipMt = 0;
        } else if (qcList.length > 0 && curWipPcs > 0) {
          const totalVdiOkMtr = qcList.reduce((sum: number, q: any) => sum + Number(q.vdi_ok_mtr || 0), 0);
          const totalVdiOkPcs = qcList.reduce((sum: number, q: any) => sum + Number(q.vdi_ok_pcs || 0), 0);
          if (totalVdiOkMtr > 0) {
            const vdiRow = stageRows.find((sr: any) => (sr.stage_code || '').toUpperCase() === 'VDI');
            const vdiDivOutMtr = Number(vdiRow?.diversion_out || 0);
            const effectiveVdiOkMtr = Math.max(0, totalVdiOkMtr - vdiDivOutMtr);
            const effectiveVdiOkPcs = avgLength > 0 ? Math.round(effectiveVdiOkMtr / avgLength) : Math.max(0, totalVdiOkPcs - Math.round(vdiDivOutMtr / 6));

            const divIn = Number(stg.diversion_in || 0);
            const divOut = Number(stg.diversion_out || 0);
            const prodMtr = Number(stg.production_qty || 0);
            const prodPcs = Number(stg.production_qty_pcs || (avgLength > 0 ? Math.round(prodMtr / avgLength) : 0));
            const rejMtr = Number(stg.rejection_qty || 0);
            const trueFinWipMtr = Math.max(0, effectiveVdiOkMtr + divIn - prodMtr - rejMtr - divOut);
            const trueFinWipPcs = Math.max(0, effectiveVdiOkPcs - prodPcs);
            if (trueFinWipPcs === 0 || trueFinWipMtr === 0) {
              curWipMtr = 0;
              curWipPcs = 0;
              curWipMt = 0;
            } else if (Math.abs(trueFinWipMtr - curWipMtr) > 0.01 || trueFinWipPcs !== curWipPcs) {
              curWipMtr = Number(trueFinWipMtr.toFixed(3));
              curWipPcs = trueFinWipPcs > 0 ? trueFinWipPcs : (avgLength > 0 ? Math.round(curWipMtr / avgLength) : 0);
              curWipMt = curWipMtr * mtPerMtr;
            }
          }
        } else if (curWipPcs === 0) {
          curWipMtr = 0;
          curWipMt = 0;
        }
      }

      // Fallback: if reconciled WIP is 0, only use db current_wip if downstream hasn't consumed it
      // Do not apply fallback to completed orders or master orders at FINISHING
      if (
        curWipPcs === 0 &&
        curWipMtr === 0 &&
        Number(stg.current_wip || 0) > 0 &&
        sc !== 'VDI' &&
        !isOrderCompleted &&
        !(isCampaignMaster && sc === 'FINISHING')
      ) {
        const downstreamProduced = stageRows
          .filter((sr: any) => sr.sequence_no > stg.sequence_no)
          .some((sr: any) => Number(sr.production_qty || 0) > 0);
        if (!downstreamProduced) {
          curWipMtr = Number(stg.current_wip || 0);
          curWipPcs = Number(stg.current_wip_pcs || (avgLength > 0 ? Math.round(curWipMtr / avgLength) : 0));
          curWipMt = curWipMtr * mtPerMtr;
        }
      }

      // Rule 1 & Rule 4: Discrete piece governance.
      // If 0 pieces remain physically, phantom scrap meters cannot be diverted as prime stock.
      if (curWipPcs <= 0 && curWipMtr > 0 && avgLength > 0) {
        curWipPcs = Math.max(1, Math.round(curWipMtr / avgLength));
      }
      if (curWipPcs <= 0 || curWipMtr <= 0) {
        curWipPcs = 0;
        curWipMtr = 0;
        curWipMt = 0;
      }

      return {
        stage_code: sc,
        stage_name: stg.stage_name || WORK_CENTERS.find(w => w.code === sc)?.name || sc,
        sequence_no: Number(stg.sequence_no || 0),
        is_in_route: true,
        available_mtr: curWipMtr,
        available_pcs: curWipPcs,
        available_mt: curWipMt,
        diverted_out_mtr: Number(stg.diversion_out || 0),
        diverted_in_mtr: Number(stg.diversion_in || 0),
        input_qty: Number(stg.incoming_qty || 0),
        output_qty: Number(stg.production_qty || 0),
        rejection_qty: Number(stg.rejection_qty || 0),
        net_output_qty: Number(stg.net_output_mtr || Math.max(0, Number(stg.production_qty || 0) - Number(stg.rejection_qty || 0))),
      };
    });
  } else {
    const stageDefinitions = [
      { stage_code: 'ROLLING', stage_name: 'Rolling Mill (Mother Hollow)', sequence_no: 1, is_in_route: true },
      { stage_code: 'HOLLOW_HEAT_TREATMENT', stage_name: 'Hollow Heat Treatment', sequence_no: 2, is_in_route: hasHtcInRoute },
      { stage_code: 'PILGER', stage_name: 'Cold Pilger Mill', sequence_no: 3, is_in_route: hasPilgerInRoute },
      { stage_code: 'DRAW', stage_name: 'Cold Draw Bench', sequence_no: 4, is_in_route: hasDrawInRoute },
      { stage_code: 'HEAT_TREATMENT', stage_name: 'Final Heat Treatment', sequence_no: 5, is_in_route: hasHtInRoute },
      { stage_code: 'BAND_SAW', stage_name: 'Band Saw Cutting', sequence_no: 6, is_in_route: isHfs || routeCode === 'SS_STEEL' },
      { stage_code: 'VDI', stage_name: 'VDI / QC Inspection', sequence_no: 7, is_in_route: true },
      { stage_code: 'FINISHING', stage_name: 'Finishing & Inspection', sequence_no: 8, is_in_route: true },
    ];
    stageBreakdown = stageDefinitions.map((stg) => {
      const sc = stg.stage_code;
      const divOut = getDivOut(sc);
      const divIn = getDivIn(sc);
      return {
        stage_code: sc,
        stage_name: stg.stage_name,
        sequence_no: stg.sequence_no,
        is_in_route: stg.is_in_route,
        available_mtr: 0,
        available_pcs: 0,
        available_mt: 0,
        diverted_out_mtr: divOut,
        diverted_in_mtr: divIn,
        input_qty: 0,
        output_qty: 0,
        rejection_qty: 0,
        net_output_qty: 0,
      };
    });
  }

  // Active WIP currently sitting in the mill (sum of physical stage queues)
  const totalActiveWipMtr = stageBreakdown.reduce((sum: number, s: any) => sum + Number(s.available_mtr || 0), 0);
  const totalActiveWipPcs = stageBreakdown.reduce((sum: number, s: any) => sum + Number(s.available_pcs || 0), 0);
  const totalActiveWipMt = stageBreakdown.reduce((sum: number, s: any) => sum + Number(s.available_mt || 0), 0);

  const salvageAvailableMtr = Math.min(totalActiveWipMtr, totalRejectionSalvageMtr);
  const primeAvailableMtr = Math.max(0, totalActiveWipMtr - salvageAvailableMtr);

  return {
    wo,
    od,
    wt,
    l1: Number(wo.l1 ?? 0),
    l2: Number(wo.l2 ?? 0),
    avgLength,
    orderedMtr,
    orderedPcs,
    orderedMt,
    rollingGrossMtr,
    rollingRejMtr,
    rollingNetMtr,
    rollingHtcOkMtr,
    rollingHtcOkPcs,
    rollingHtcOkMt,
    planMultiple,
    effectiveHtcOkFinishedMtr,
    finishingDoneMtr: finishingShippedMtr,
    qcVdiRejMtr,
    primeAvailableMtr,
    salvageAvailableMtr,
    pendingDrawDiversionsMtr,
    pendingDrawDiversionsCount,
    divertedOutMtr: totalDivertedOutMtr,
    divertedOutPcs: avgLength > 0 ? totalDivertedOutMtr / avgLength : 0,
    divertedOutMt: totalDivertedOutMtr * mtPerMtr,
    divertedInMtr: totalDivertedInMtr,
    divertedInPcs: avgLength > 0 ? totalDivertedInMtr / avgLength : 0,
    divertedInMt: totalDivertedInMtr * mtPerMtr,
    physicalAvailableMtr: totalActiveWipMtr,
    unplannedOrderMtr: Math.max(0, orderedMtr - rollingGrossMtr),
    balanceWipMtr: totalActiveWipMtr,
    balanceWipPcs: totalActiveWipPcs,
    balanceWipMt: totalActiveWipMt,
    stageBreakdown,
  };
}

const WORK_CENTERS = [
  { code: 'ROLLING', name: 'Rolling Mill (Mother Hollow)' },
  { code: 'HOLLOW_HEAT_TREATMENT', name: 'Hollow Heat Treatment' },
  { code: 'PILGER', name: 'Cold Pilger Mill' },
  { code: 'DRAW', name: 'Cold Draw Bench' },
  { code: 'HEAT_TREATMENT', name: 'Final Heat Treatment' },
  { code: 'BAND_SAW', name: 'Band Saw Cutting' },
  { code: 'VDI', name: 'VDI / QC Inspection' },
  { code: 'FINISHING', name: 'Finishing & Inspection' },
];

const fmt = (n: number | null | undefined, digits = 2) =>
  n == null || isNaN(n) ? '—' : Number(n).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });

export default function DiversionForm() {
  const { user } = usePermissions();
  const session = useOptionalUserSession();
  const formAccess = useMemo(() => getFormAccess(user, 'diversion'), [user]);
  const canManagePlans = formAccess.isAllowed;

  const [wos, setWos] = useState<WO[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [source, setSource] = useState('');
  const [target, setTarget] = useState('');
  const [sourceWorkCenter, setSourceWorkCenter] = useState('ROLLING');
  const [targetWorkCenter, setTargetWorkCenter] = useState('ROLLING');
  const workCenter = sourceWorkCenter;
  const [qty, setQty] = useState('');
  const [route, setRoute] = useState('');
  const [multiple, setMultiple] = useState('1');
  const [reason, setReason] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<'ISSUE' | 'PENDING_PPC' | 'REMNANTS' | 'LOGS'>('ISSUE');
  const [transferMode, setTransferMode] = useState<'DIRECT' | 'CUT_DIVERT'>('DIRECT');
  const [isStpExempt, setIsStpExempt] = useState(false);
  const [pcsInput, setPcsInput] = useState('');
  const [ppcAutoApprove, setPpcAutoApprove] = useState(true);

  // PPC User check (Admin, Super User, or PPC role/group)
  const isPpcUser = useMemo(() => {
    if (!user) return false;
    const ug = (user.group || '').toLowerCase();
    const role = (user.role || '').toLowerCase();
    const dept = (user.department || '').toLowerCase();
    return (
      ug === 'admin' ||
      ug === 'super_user' ||
      dept.includes('ppc') ||
      role.includes('ppc') ||
      role.includes('manager') ||
      role.includes('admin')
    );
  }, [user]);

  // WIP summaries for Source and Target
  const [sourceWip, setSourceWip] = useState<WoWipSummary | null>(null);
  const [targetWip, setTargetWip] = useState<WoWipSummary | null>(null);

  // Issued Diversion Plans List & Filter states
  const [plans, setPlans] = useState<DiversionPlanItem[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterRoute, setFilterRoute] = useState('');
  const [filterWorkCenter, setFilterWorkCenter] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // PPC Action Modals
  const [approveModalPlan, setApproveModalPlan] = useState<DiversionPlanItem | null>(null);
  const [approveRemarks, setApproveRemarks] = useState('');
  const [approveBusy, setApproveBusy] = useState(false);

  const [rejectModalPlan, setRejectModalPlan] = useState<DiversionPlanItem | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectBusy, setRejectBusy] = useState(false);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  // Editing modal states
  const [editing, setEditing] = useState<DiversionPlanItem | null>(null);
  const [editQty, setEditQty] = useState('');
  const [editSourceWorkCenter, setEditSourceWorkCenter] = useState('ROLLING');
  const [editTargetWorkCenter, setEditTargetWorkCenter] = useState('ROLLING');
  const editWorkCenter = editTargetWorkCenter;
  const [editRoute, setEditRoute] = useState('');
  const [editMultiple, setEditMultiple] = useState('1');
  const [editDate, setEditDate] = useState('');
  const [editReason, setEditReason] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const s = createClient();
      const [woRes, routeRes] = await Promise.all([
        s
          .from('work_orders')
          .select(
            'id,work_order_no,customer_name,grade,specification,size_od,size_wt,l1,l2,ordered_qty,uom,balance_qty_pcs,balance_qty_mtr,balance_qty_mt,status,target_date'
          )
          .order('work_order_no'),
        s.from('process_routes').select('id,route_code,route_name').eq('active', true).order('route_code'),
      ]);

      if (woRes?.error) throw new Error(woRes.error.message);
      if (routeRes?.error) throw new Error(routeRes.error.message);
      const woList = (woRes?.data ?? []) as WO[];
      setWos(woList);

      const routeList = (routeRes?.data ?? []) as Route[];
      setRoutes(routeList);
      if (routeList.length) {
        setRoute(prev => prev || routeList[0].id);
      }
    } catch (error) {
      setWos([]);
      setRoutes([]);
      toast.error(error instanceof Error ? error.message : 'Failed to load diversion masters.');
    }
  }, []);

  const loadPlans = useCallback(async () => {
    setPlansLoading(true);
    try {
      const { data, error } = await createClient().rpc('get_diversion_plans', {
        p_search: debouncedSearch.trim() || null,
        p_route_code: filterRoute || null,
        p_work_center: filterWorkCenter || null,
        p_from_date: fromDate || null,
        p_to_date: toDate || null,
      });

      if (error) throw new Error(error.message);
      const mapped = ((data ?? []) as any[]).map((p) => {
        const fromMatch = p.reason?.match(/\[FROM_STAGE:\s*([A-Z_]+)\]/i);
        const toMatch = p.reason?.match(/\[TO_STAGE:\s*([A-Z_]+)\]/i);
        const src = fromMatch ? fromMatch[1].toUpperCase() : (p.work_center || 'ROLLING');
        const tgt = toMatch ? toMatch[1].toUpperCase() : (p.work_center || 'ROLLING');
        return {
          ...p,
          source_work_center: src,
          target_work_center: tgt,
          status: p.status || 'APPROVED',
        };
      });
      setPlans(mapped as DiversionPlanItem[]);
    } catch (error) {
      setPlans([]);
      toast.error(error instanceof Error ? error.message : 'Failed to load diversion plans.');
    } finally {
      setPlansLoading(false);
    }
  }, [debouncedSearch, filterRoute, filterWorkCenter, fromDate, toDate]);

  const handleApprove = async () => {
    if (!approveModalPlan) return;
    setApproveBusy(true);
    const res = await approveDiversion({ id: approveModalPlan.id, remarks: approveRemarks });
    setApproveBusy(false);
    if (res.success) {
      toast.success(`Draw Bench diversion ${approveModalPlan.id} approved. Source WIP deducted and target Draw Bench queue credited.`);
      setApproveModalPlan(null);
      setApproveRemarks('');
      await loadPlans();
      if (source) await handleSourceChange(source);
      if (target) await handleTargetChange(target);
    } else {
      toast.error(res.error || 'Failed to approve diversion');
    }
  };

  const handleReject = async () => {
    if (!rejectModalPlan) return;
    if (!rejectReason.trim()) {
      toast.error('Rejection reason is required');
      return;
    }
    setRejectBusy(true);
    const res = await rejectDiversion({ id: rejectModalPlan.id, reason: rejectReason });
    setRejectBusy(false);
    if (res.success) {
      toast.info(`Draw Bench diversion ${rejectModalPlan.id} rejected. WIP hold released.`);
      setRejectModalPlan(null);
      setRejectReason('');
      await loadPlans();
      if (source) await handleSourceChange(source);
      if (target) await handleTargetChange(target);
    } else {
      toast.error(res.error || 'Failed to reject diversion');
    }
  };

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  // WIP is always read from Supabase. Diversion availability is global for the source WO,
  // independent of the selected target work center.
  const handleSourceChange = async (id: string) => {
    setSource(id);
    if (!id) {
      setSourceWip(null);
      return;
    }
    const sel = wos.find(w => w.id === id);
    if (!sel) {
      setSourceWip(null);
      return;
    }
    try {
      setSourceWip(await fetchWipSummary(createClient(), id, sel));
    } catch (error) {
      setSourceWip(null);
      toast.error(error instanceof Error ? error.message : 'Failed to load source WIP.');
    }
  };

  const handleTargetChange = async (id: string) => {
    setTarget(id);
    if (!id) {
      setTargetWip(null);
      return;
    }
    const sel = wos.find(w => w.id === id);
    if (!sel) {
      setTargetWip(null);
      return;
    }
    try {
      setTargetWip(await fetchWipSummary(createClient(), id, sel));
    } catch (error) {
      setTargetWip(null);
      toast.error(error instanceof Error ? error.message : 'Failed to load target WIP.');
    }
  };

  const selectedSource = useMemo(() => wos.find((x) => x.id === source), [wos, source]);
  const selectedTarget = useMemo(() => wos.find((x) => x.id === target), [wos, target]);
  const selectedRouteObj = useMemo(() => routes.find(r => r.id === route), [routes, route]);
  const selectedSourceWcObj = useMemo(() => WORK_CENTERS.find(w => w.code === sourceWorkCenter), [sourceWorkCenter]);
  const selectedTargetWcObj = useMemo(() => WORK_CENTERS.find(w => w.code === targetWorkCenter), [targetWorkCenter]);
  const selectedWorkCenterObj = selectedSourceWcObj;

  // Work centers available for the selected Source Work Order (only active stages in its route)
  const availableWorkCenters = useMemo(() => {
    if (!sourceWip?.stageBreakdown?.length) return WORK_CENTERS;
    return WORK_CENTERS.filter((wc) => {
      const stg = sourceWip.stageBreakdown.find((s) => s.stage_code === wc.code);
      return stg ? (stg as any).is_in_route !== false : true;
    });
  }, [sourceWip]);

  // If current sourceWorkCenter is not valid or has 0 WIP, default to the first stage with active WIP
  useEffect(() => {
    if (sourceWip?.stageBreakdown?.length) {
      const currentValid = sourceWip.stageBreakdown.some((s) => s.stage_code === sourceWorkCenter && s.available_mtr > 0);
      if (!currentValid) {
        const stageWithWip = sourceWip.stageBreakdown.find((s) => s.available_mtr > 0);
        if (stageWithWip) {
          setSourceWorkCenter(stageWithWip.stage_code);
          setTargetWorkCenter(stageWithWip.stage_code === 'VDI' ? 'FINISHING' : stageWithWip.stage_code);
        } else if (availableWorkCenters.length > 0 && !availableWorkCenters.some((wc) => wc.code === sourceWorkCenter)) {
          setSourceWorkCenter(availableWorkCenters[0].code);
          setTargetWorkCenter(availableWorkCenters[0].code);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceWip]);

  // Selected Work Center WIP for Source (where material will be deducted)
  const sourceStageWip = useMemo(() => {
    if (!sourceWip?.stageBreakdown?.length) return null;
    return sourceWip.stageBreakdown.find(s => s.stage_code === sourceWorkCenter);
  }, [sourceWip, sourceWorkCenter]);

  // Physical WIP available at the selected work center (Rule 1 & 2)
  const availableAtWorkCenterMtr = useMemo(() => {
    if (!sourceWip) return 0;
    if (sourceStageWip) return Math.max(0, sourceStageWip.available_mtr || 0);
    return 0;
  }, [sourceWip, sourceStageWip]);

  const availableAtWorkCenterPcs = useMemo(() => {
    if (sourceStageWip && sourceStageWip.available_pcs >= 0) return sourceStageWip.available_pcs;
    const avg = sourceWip?.avgLength || 6.0;
    return avg > 0 ? Math.round(availableAtWorkCenterMtr / avg) : 0;
  }, [sourceStageWip, availableAtWorkCenterMtr, sourceWip]);

  const availableAtWorkCenterMt = useMemo(() => {
    if (sourceStageWip && sourceStageWip.available_mt >= 0) return sourceStageWip.available_mt;
    const od = sourceWip?.od || 0;
    const wt = sourceWip?.wt || 0;
    return od > wt ? (od - wt) * wt * 0.0246615 * 0.001 * availableAtWorkCenterMtr : 0;
  }, [sourceStageWip, availableAtWorkCenterMtr, sourceWip]);

  // Calculations for Transfer Impact (Rule 2)
  const diversionMtr = Number(qty) || 0;
  const numMultiple = Math.max(1, Number(multiple) || 1);

  // Source deduction metrics
  const sourceAvgLen = sourceWip?.avgLength || 6.0;
  const sourceOd = sourceWip?.od || 0;
  const sourceWt = sourceWip?.wt || 0;

  // Discrete stage piece length:
  // If the source stage has tracked pieces and meters (e.g. at VDI 237 pcs = 1422 m => 6.0 m/pc),
  // use the exact stage piece length so piece deductions match physical inventory.
  const sourceStagePieceLen = useMemo(() => {
    if (sourceStageWip && sourceStageWip.available_pcs > 0 && sourceStageWip.available_mtr > 0) {
      return sourceStageWip.available_mtr / sourceStageWip.available_pcs;
    }
    const isCutStage = sourceWorkCenter === 'VDI' || sourceWorkCenter === 'FINISHING' || sourceWorkCenter === 'BAND_SAW';
    const mult = Number(sourceWip?.planMultiple || 1);
    if (isCutStage && mult > 1 && sourceAvgLen > 0) {
      return sourceAvgLen / mult;
    }
    return sourceAvgLen;
  }, [sourceStageWip, sourceWorkCenter, sourceWip, sourceAvgLen]);

  const sourceDivPcs = useMemo(() => {
    if (!diversionMtr || diversionMtr <= 0) return 0;
    if (availableAtWorkCenterMtr > 0 && Math.abs(diversionMtr - availableAtWorkCenterMtr) < 0.01) {
      return availableAtWorkCenterPcs;
    }
    return sourceStagePieceLen > 0 ? Math.round(diversionMtr / sourceStagePieceLen) : 0;
  }, [diversionMtr, availableAtWorkCenterMtr, availableAtWorkCenterPcs, sourceStagePieceLen]);

  const sourceDivMt = sourceOd > sourceWt ? (sourceOd - sourceWt) * sourceWt * 0.0246615 * 0.001 * diversionMtr : 0;

  // STRICT: Source initial balance for diversion is strictly the physical WIP at the selected work center!
  const sourceInitialBalanceMtr = availableAtWorkCenterMtr;
  const sourceRemainingBalanceMtr = Math.max(0, sourceInitialBalanceMtr - diversionMtr);
  const sourceRemainingBalancePcs = useMemo(() => {
    if (sourceRemainingBalanceMtr <= 0) return 0;
    return Math.max(0, availableAtWorkCenterPcs - sourceDivPcs);
  }, [sourceRemainingBalanceMtr, availableAtWorkCenterPcs, sourceDivPcs]);
  const sourceRemainingBalanceMt =
    sourceOd > sourceWt ? (sourceOd - sourceWt) * sourceWt * 0.0246615 * 0.001 * sourceRemainingBalanceMtr : 0;

  // Target addition metrics
  const targetAvgLen = targetWip?.avgLength || 6.0;
  const targetOd = targetWip?.od || 0;
  const targetWt = targetWip?.wt || 0;
  const targetDivPcs = useMemo(() => {
    if (numMultiple > 1) {
      return Math.round(sourceDivPcs * numMultiple);
    }
    if (targetAvgLen > 0 && diversionMtr > 0) {
      return Math.round(diversionMtr / targetAvgLen);
    }
    return sourceDivPcs;
  }, [numMultiple, sourceDivPcs, targetAvgLen, diversionMtr]);

  const targetCutLen = numMultiple > 1 && sourceStagePieceLen > 0
    ? Number((sourceStagePieceLen / numMultiple).toFixed(2))
    : targetAvgLen;
  const targetDivMt = targetOd > targetWt ? (targetOd - targetWt) * targetWt * 0.0246615 * 0.001 * diversionMtr : 0;

  const targetInitialWipMtr = (targetWip?.rollingHtcOkMtr || 0) + (targetWip?.divertedInMtr || 0);
  const targetInitialWipPcs = (targetWip?.rollingHtcOkPcs || 0) + (targetWip?.divertedInPcs || 0);
  const targetPostWipMtr = targetInitialWipMtr + diversionMtr;
  const targetPostWipPcs = targetInitialWipPcs + targetDivPcs;
  const targetPostWipMt = targetOd > targetWt ? (targetOd - targetWt) * targetWt * 0.0246615 * 0.001 * targetPostWipMtr : 0;

  const isExceeding = diversionMtr > sourceInitialBalanceMtr;

  const overAlloc = useMemo(() => {
    if (!targetWip || diversionMtr <= 0) return null;
    return calcOrderBalanceSurplus(diversionMtr, targetWip.orderedMtr || 0, targetWip.finishingDoneMtr || 0);
  }, [targetWip, diversionMtr]);

  const handleMtrChange = (val: string) => {
    setQty(val);
    const m = Number(val);
    if (m > 0 && sourceStagePieceLen > 0) {
      setPcsInput(String(Math.round(m / sourceStagePieceLen)));
    } else {
      setPcsInput('');
    }
  };

  const handlePcsChange = (val: string) => {
    setPcsInput(val);
    const p = Number(val);
    if (p > 0 && sourceStagePieceLen > 0) {
      setQty(String(Number((p * sourceStagePieceLen).toFixed(2))));
    } else {
      setQty('');
    }
  };

  const handleExecuteCutDivert = async (payload: {
    strategy?: 'SINGLE_ORDER' | 'MULTI_ORDER' | 'NO_CUT';
    motherLength: number;
    motherPcs: number;
    splits: any[];
    remnantMtr: number;
    remnantClassification: 'SCRAP' | 'USABLE_OFFCUT';
  }) => {
    if (!canManagePlans) {
      toast.error('Permission denied: Diversion planning requires Admin or Super User group');
      return;
    }
    setBusy(true);
    try {
      const supabase = createClient();
      const sourceWo = wos.find((w) => w.id === source);
      const sourceWoNo = sourceWo?.work_order_no || 'Unknown';

      const externalSplits = payload.splits.filter((s) => s.target_wo_id && s.target_wo_id !== source);
      const sameOrderSplits = payload.splits.filter((s) => s.target_wo_id === source);

      const remnantTag = payload.remnantClassification === 'USABLE_OFFCUT'
        ? `[OFFCUT_REMNANT: ${(payload.remnantMtr / payload.motherPcs).toFixed(2)}m x ${payload.motherPcs} = ${payload.remnantMtr}m]`
        : payload.remnantMtr > 0
        ? `[SCRAP_REMNANT: ${(payload.remnantMtr / payload.motherPcs).toFixed(2)}m x ${payload.motherPcs} = ${payload.remnantMtr}m]`
        : '';

      const sameOrderDesc = sameOrderSplits.length > 0
        ? `[RETAINED_IN_SOURCE: ${sameOrderSplits.map((s) => `${payload.motherPcs * (s.cuts_per_pipe || 1)} pcs @ ${s.cut_length}m = ${(s.cut_length * payload.motherPcs * (s.cuts_per_pipe || 1)).toFixed(2)}m at ${s.target_stage_code}`).join(', ')}]`
        : '';

      // Record external diversions into diversion_plans
      for (let i = 0; i < externalSplits.length; i++) {
        const split = externalSplits[i];
        const cutsPerPipe = split.cuts_per_pipe || 1;
        const totalPieces = payload.motherPcs * cutsPerPipe;
        const splitMtr = Number((split.cut_length * totalPieces).toFixed(2));
        const targetWoObj = wos.find((w) => w.id === split.target_wo_id);
        const targetWoNo = targetWoObj?.work_order_no || 'Target';

        const stageTag = `[FROM_STAGE: ${sourceWorkCenter || 'BAND_SAW'}] [TO_STAGE: ${split.target_stage_code}] [PCS: ${totalPieces}]`;
        let finalReason = '';
        if (payload.strategy === 'NO_CUT') {
          finalReason = `Direct Transfer (Without Cutting): ${payload.motherPcs} whole pipes @ ${payload.motherLength}m (${splitMtr}m) to WO #${targetWoNo} at [${split.target_stage_code}] ${stageTag}`.trim();
        } else if (payload.strategy === 'SINGLE_ORDER') {
          finalReason = `Cut from Middle & Diverted: ${payload.motherPcs} mother pipes @ ${payload.motherLength}m cut into ${totalPieces} pcs (${cutsPerPipe} cuts/pipe @ ${split.cut_length}m = ${splitMtr}m) to WO #${targetWoNo} at [${split.target_stage_code}] ${remnantTag} ${stageTag}`.trim();
        } else {
          finalReason = `Cut & Multi-Order Diversion (#${i + 1}/${externalSplits.length}): Mother ${payload.motherPcs} pcs @ ${payload.motherLength}m cut from middle. Diverting ${payload.motherPcs} pcs @ ${split.cut_length}m (${splitMtr}m) to WO #${targetWoNo} at [${split.target_stage_code}]. ${sameOrderDesc} ${remnantTag} ${stageTag}`.trim();
        }

        const isDrawTarget = split.target_stage_code === 'DRAW';
        const planStatus = isDrawTarget
          ? (isPpcUser && ppcAutoApprove ? 'APPROVED' : 'PENDING_PPC')
          : 'APPROVED';

        const approverAuthId = user?.auth_user_id || session?.user?.id || null;
        const insertPayload: any = {
          source_wo_id: source,
          target_wo_id: split.target_wo_id,
          diverted_qty: splitMtr,
          work_center: split.target_stage_code,
          process_route_id: route || (routes.length ? routes[0].id : ''),
          multiple: cutsPerPipe,
          reason: finalReason,
          approved_by: approverAuthId,
          diversion_date: date,
          status: planStatus,
        };
        if (planStatus === 'APPROVED' && isDrawTarget && approverAuthId) {
          insertPayload.ppc_approved_by = approverAuthId;
          insertPayload.ppc_approved_at = new Date().toISOString();
        }
        let { error: insErr } = await supabase.from('diversion_plans').insert(insertPayload);
        if (insErr && insErr.message?.includes('status')) {
          delete insertPayload.status;
          delete insertPayload.ppc_approved_by;
          delete insertPayload.ppc_approved_at;
          const retry = await supabase.from('diversion_plans').insert(insertPayload);
          insErr = retry.error;
        }
        if (insErr && insErr.message?.includes('diversion_plans_approved_by_fkey')) {
          insertPayload.approved_by = null;
          const retry = await supabase.from('diversion_plans').insert(insertPayload);
          insErr = retry.error;
        }
        if (insErr) throw new Error(insErr.message);
      }

      const totalRetainedMtr = Number(sameOrderSplits.reduce((acc, s) => acc + (s.cut_length * payload.motherPcs * (s.cuts_per_pipe || 1)), 0).toFixed(2));
      const totalDivertedMtr = Number(externalSplits.reduce((acc, s) => acc + (s.cut_length * payload.motherPcs * (s.cuts_per_pipe || 1)), 0).toFixed(2));

      if (payload.strategy === 'NO_CUT') {
        const targetWoObj = wos.find((w) => w.id === externalSplits[0]?.target_wo_id);
        toast.success(
          `Successfully diverted ${payload.motherPcs} whole pipes (${totalDivertedMtr}m) without cutting to WO #${targetWoObj?.work_order_no || 'Target'}!`
        );
      } else if (payload.strategy === 'SINGLE_ORDER') {
        const targetWoObj = wos.find((w) => w.id === externalSplits[0]?.target_wo_id);
        const cutsPerPipe = externalSplits[0]?.cuts_per_pipe || 1;
        toast.success(
          `Successfully cut ${payload.motherPcs} mother pipes into ${payload.motherPcs * cutsPerPipe} pieces (${totalDivertedMtr}m) and diverted all to WO #${targetWoObj?.work_order_no || 'Target'}!`
        );
      } else if (externalSplits.length === 0) {
        toast.success(
          `Internal Cut Confirmed for WO #${sourceWoNo}: ${payload.motherPcs} mother pipes (${payload.motherLength}m) cut into customer pieces (${totalRetainedMtr}m) at ${sourceWorkCenter}! Remnant: ${payload.remnantMtr}m (${payload.remnantClassification}).`
        );
      } else {
        toast.success(
          `Successfully cut and split ${payload.motherPcs} mother pipes into multiple target work orders!`
        );
      }

      await handleSourceChange(source);
      await loadData();
      await loadPlans();
      if (externalSplits.length > 0) {
        setActiveTab('LOGS');
      }
    } catch (err: any) {
      toast.error('Failed to execute cut & divert: ' + err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDivertRemnant = async (remnant: any) => {
    setActiveTab('ISSUE');
    setTransferMode('DIRECT');
    await handleSourceChange(remnant.source_wo_id);
    setSource(remnant.source_wo_id);
    setSourceWorkCenter(remnant.work_center);
    setQty(String(remnant.total_mtr));
    setPcsInput(String(remnant.pcs));
    setReason(`Off-cut Remnant Diversion (${remnant.length_mtr}m)`);
    toast.info(`Pre-filled diversion with ${remnant.pcs} pcs (${remnant.total_mtr}m) from WO ${remnant.source_wo_no}`);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManagePlans) {
      toast.error('Permission denied: Diversion planning requires Admin or Super User group');
      return;
    }
    if (!source || !target || !route) return toast.error('Select source WO, target WO and route');
    if (source === target) return toast.error('Source and target WO must be different');
    
    if (!Number.isFinite(diversionMtr) || diversionMtr <= 0)
      return toast.error('Enter a valid diversion quantity in Mtrs');

    if (sourceInitialBalanceMtr <= 0) {
      return toast.error(
        `Cannot divert: 0 Mtrs WIP available for this work order. Material can only be diverted after production is completed.`
      );
    }

    if (diversionMtr > sourceInitialBalanceMtr) {
      return toast.error(
        `Diversion quantity (${fmt(diversionMtr)} m) exceeds available WIP (${fmt(sourceInitialBalanceMtr)} m)`
      );
    }

    const cleanedUserReason = reason
      .replace(/\[FROM_STAGE:\s*[A-Z_]+\]/gi, '')
      .replace(/\[TO_STAGE:\s*[A-Z_]+\]/gi, '')
      .replace(/\[PCS:\s*\d+\]/gi, '')
      .trim();
    const pcsNum = Number(pcsInput);
    const pcsTag = Number.isFinite(pcsNum) && pcsNum > 0 ? ` [PCS: ${pcsNum}]` : '';
    const finalReason = `${cleanedUserReason}${numMultiple > 1 ? ` [MULTIPLE: ${numMultiple}]` : ''} [FROM_STAGE: ${sourceWorkCenter}] [TO_STAGE: ${targetWorkCenter}]${pcsTag}`.trim();

    const isDrawBenchTarget = targetWorkCenter === 'DRAW';
    const planStatus = isDrawBenchTarget
      ? (isPpcUser && ppcAutoApprove ? 'APPROVED' : 'PENDING_PPC')
      : 'APPROVED';

    setBusy(true);
    let success = false;
    try {
      const { error } = await createClient().rpc('create_diversion', {
        p_source: source,
        p_target: target,
        p_qty: diversionMtr,
        p_work_center: targetWorkCenter,
        p_route: route,
        p_multiple: numMultiple,
        p_reason: finalReason,
        p_date: date,
        p_status: planStatus,
      });
      if (error) {
        console.warn('RPC create_diversion error, attempting direct insert:', error.message);
        const approverAuthId = user?.auth_user_id || session?.user?.id || null;
        const insertPayload: any = {
          source_wo_id: source,
          target_wo_id: target,
          diverted_qty: diversionMtr,
          work_center: targetWorkCenter,
          process_route_id: route,
          multiple: numMultiple,
          reason: finalReason,
          approved_by: approverAuthId,
          diversion_date: date,
          status: planStatus,
        };
        if (planStatus === 'APPROVED' && isDrawBenchTarget && approverAuthId) {
          insertPayload.ppc_approved_by = approverAuthId;
          insertPayload.ppc_approved_at = new Date().toISOString();
        }
        let { error: insertErr } = await createClient().from('diversion_plans').insert(insertPayload);
        if (insertErr && insertErr.message?.includes('status')) {
          delete insertPayload.status;
          delete insertPayload.ppc_approved_by;
          delete insertPayload.ppc_approved_at;
          const retry = await createClient().from('diversion_plans').insert(insertPayload);
          insertErr = retry.error;
        }
        if (insertErr && insertErr.message?.includes('diversion_plans_approved_by_fkey')) {
          insertPayload.approved_by = null;
          const retry = await createClient().from('diversion_plans').insert(insertPayload);
          insertErr = retry.error;
        }
        if (insertErr) throw new Error(insertErr.message);
      }
      success = true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create diversion plan');
    }

    setBusy(false);
    if (success) {
      if (planStatus === 'PENDING_PPC') {
        toast.info(
          `Diversion of ${fmt(diversionMtr)} Mtrs to Draw Bench submitted for PPC Approval. WIP remains in source WO until approved.`
        );
      } else {
        toast.success(
          `Diversion of ${fmt(diversionMtr)} Mtrs from ${getWcShortName(sourceWorkCenter)} to ${getWcShortName(targetWorkCenter)} successfully issued!`
        );
      }
      setQty('');
      setReason('');
      setMultiple('1');
      await handleSourceChange(source);
      if (target) handleTargetChange(target);
      await loadData();
      await loadPlans();
    }
  };

  // Start Edit Modal
  const startEdit = (p: DiversionPlanItem) => {
    setEditing(p);
    setEditQty(String(p.diverted_qty));
    const fromMatch = p.reason?.match(/\[FROM_STAGE:\s*([A-Z_]+)\]/i);
    const toMatch = p.reason?.match(/\[TO_STAGE:\s*([A-Z_]+)\]/i);
    const srcWc = fromMatch ? fromMatch[1].toUpperCase() : (p.source_work_center || p.work_center || 'ROLLING');
    const tgtWc = toMatch ? toMatch[1].toUpperCase() : (p.target_work_center || p.work_center || 'ROLLING');
    setEditSourceWorkCenter(srcWc);
    setEditTargetWorkCenter(tgtWc);
    setEditRoute(p.route_id);
    setEditMultiple(String(p.multiple || 1));
    setEditDate(p.diversion_date || new Date().toISOString().slice(0, 10));
    setEditReason(
      p.reason ? p.reason.replace(/\[FROM_STAGE:\s*[A-Z_]+\]/gi, '').replace(/\[TO_STAGE:\s*[A-Z_]+\]/gi, '').trim() : ''
    );
  };

  // Save Edit Modal
  const saveEdit = async () => {
    if (!editing) return;
    const qtyVal = Number(editQty);
    if (!Number.isFinite(qtyVal) || qtyVal <= 0) {
      toast.error('Please enter a valid positive quantity in Mtrs.');
      return;
    }
    const multVal = Number(editMultiple);
    if (!Number.isFinite(multVal) || multVal <= 0) {
      toast.error('Multiple must be a positive number.');
      return;
    }

    const cleanedReason = editReason
      .replace(/\[FROM_STAGE:\s*[A-Z_]+\]/gi, '')
      .replace(/\[TO_STAGE:\s*[A-Z_]+\]/gi, '')
      .trim();
    const finalReason = `${cleanedReason} [FROM_STAGE: ${editSourceWorkCenter}] [TO_STAGE: ${editTargetWorkCenter}]`.trim();

    setEditSaving(true);
    let editSuccess = false;
    try {
      const { error } = await createClient().rpc('update_diversion', {
        p_diversion_id: editing.id,
        p_qty: qtyVal,
        p_work_center: editTargetWorkCenter,
        p_route: editRoute,
        p_multiple: multVal,
        p_date: editDate,
        p_reason: finalReason,
      });
      if (error) throw new Error(error.message);
      editSuccess = true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update diversion plan.');
    }

    setEditSaving(false);

    if (editSuccess) {
      toast.success(`Diversion ${editing.id} updated successfully.`);
      setEditing(null);
      await loadPlans();
      if (source) await handleSourceChange(source);
      if (target) handleTargetChange(target);
    } else {
      toast.error('Failed to update diversion plan.');
    }
  };

  // Delete Plan
  const removePlan = async (p: DiversionPlanItem) => {
    if (!window.confirm(`Delete Diversion Plan ${p.id} (${p.diverted_qty} Mtrs from WO ${p.source_wo_no} to ${p.target_wo_no})?`)) {
      return;
    }

    let deleteSuccess = false;
    try {
      const { error } = await createClient().rpc('delete_diversion', { p_diversion_id: p.id });
      if (error) throw new Error(error.message);
      deleteSuccess = true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete diversion plan.');
    }

    if (deleteSuccess) {
      toast.success(`Diversion ${p.id} deleted successfully.`);
      await loadPlans();
      if (source) await handleSourceChange(source);
      if (target) handleTargetChange(target);
    } else {
      toast.error('Failed to delete diversion plan.');
    }
  };

  const routesInPlans = useMemo(
    () => Array.from(new Set(plans.map(p => p.route_code))).sort(),
    [plans]
  );

  const totalDivertedMtr = useMemo(
    () => plans.reduce((s, p) => s + Number(p.diverted_qty || 0), 0),
    [plans]
  );
  const totalDivertedPcs = useMemo(
    () => plans.reduce((s, p) => s + Number(p.diverted_pcs || 0), 0),
    [plans]
  );
  const totalDivertedMt = useMemo(
    () => plans.reduce((s, p) => s + Number(p.diverted_mt || 0), 0),
    [plans]
  );

  const pendingPpcPlans = useMemo(() => {
    return plans.filter((p) => {
      const isPending = p.status === 'PENDING_PPC';
      const isDrawTarget = p.work_center === 'DRAW' || p.target_work_center === 'DRAW' || (p.reason || '').includes('[TO_STAGE: DRAW]');
      return isPending && isDrawTarget;
    });
  }, [plans]);

  const filteredPlans = useMemo(() => {
    return plans.filter((p) => {
      if (filterStatus) {
        if (filterStatus === 'APPROVED') {
          if (p.status && p.status !== 'APPROVED') return false;
        } else {
          if (p.status !== filterStatus) return false;
        }
      }
      return true;
    });
  }, [plans, filterStatus]);

  return (
    <div className="space-y-6 pb-20 sm:pb-6">
      {/* Form Accessibility Banner */}
      <FormAccessBanner access={formAccess} />

      {/* Top View Tabs (Mobile-Friendly Pill Bar) */}
      <div className="flex border-b border-slate-200 gap-1 sm:gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setActiveTab('ISSUE')}
          className={`px-3 sm:px-4 py-2.5 text-xs font-bold border-b-2 cursor-pointer transition flex items-center gap-1.5 whitespace-nowrap min-h-[44px] ${
            activeTab === 'ISSUE'
              ? 'border-[#0078d4] text-[#0078d4]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <ArrowRightLeft className="h-4 w-4" /> Issue Diversion
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('PENDING_PPC')}
          className={`px-3 sm:px-4 py-2.5 text-xs font-bold border-b-2 cursor-pointer transition flex items-center gap-1.5 whitespace-nowrap min-h-[44px] ${
            activeTab === 'PENDING_PPC'
              ? 'border-amber-500 text-amber-700 font-black'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Clock className="h-4 w-4 text-amber-600" />
          <span>Pending PPC Approvals</span>
          {pendingPpcPlans.length > 0 && (
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-white">
              {pendingPpcPlans.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('REMNANTS')}
          className={`px-3 sm:px-4 py-2.5 text-xs font-bold border-b-2 cursor-pointer transition flex items-center gap-1.5 whitespace-nowrap min-h-[44px] ${
            activeTab === 'REMNANTS'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Recycle className="h-4 w-4 text-emerald-600" /> Off-cuts &amp; Remnants Pool
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('LOGS')}
          className={`px-3 sm:px-4 py-2.5 text-xs font-bold border-b-2 cursor-pointer transition flex items-center gap-1.5 whitespace-nowrap min-h-[44px] ${
            activeTab === 'LOGS'
              ? 'border-slate-800 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Layers className="h-4 w-4" /> Diversion History &amp; Logs ({plans.length})
        </button>
      </div>

      {/* TAB 1: ISSUE DIVERSION CONSOLE */}
      {activeTab === 'ISSUE' && (
        <div className="space-y-5">
          {/* Mode Switch Bar: Direct Transfer vs Cut & Divert */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                Operational Mode:
              </span>
              <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg border border-slate-200">
                <button
                  type="button"
                  onClick={() => setTransferMode('DIRECT')}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold cursor-pointer transition flex items-center gap-1.5 min-h-[36px] ${
                    transferMode === 'DIRECT'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <ArrowRightLeft className="h-3.5 w-3.5 text-[#0078d4]" />
                  Mode A: Direct Transfer
                </button>

                <button
                  type="button"
                  onClick={() => setTransferMode('CUT_DIVERT')}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold cursor-pointer transition flex items-center gap-1.5 min-h-[36px] ${
                    transferMode === 'CUT_DIVERT'
                      ? 'bg-white text-purple-900 shadow-2xs font-black'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Scissors className="h-3.5 w-3.5 text-purple-600" />
                  Mode B: Cut &amp; Divert (Split)
                </button>
              </div>
            </div>

            <span className="text-[11px] text-slate-500">
              {transferMode === 'DIRECT'
                ? 'Standard 1-to-1 material reallocation without cutting'
                : 'Cut long mother pipes into multiple target pieces with auto-scrap & remnant tracking'}
            </span>
          </div>

          {/* MODE B: CUT & DIVERT SECTION */}
          {transferMode === 'CUT_DIVERT' ? (
            <div className="rounded-xl border border-purple-200 bg-white p-5 shadow-xs space-y-4">
              <div className="border-b border-purple-100 pb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-purple-950 flex items-center gap-2">
                    <Scissors className="h-5 w-5 text-purple-600" />
                    Cut &amp; Divert Workflow (STP Trimming &amp; Multi-WO Split)
                  </h2>
                  <p className="text-slate-500 text-xs">
                    Cut mother hollows into target lengths for up to 2 work orders. Balance &ge; 3.0m is saved as usable off-cut; balance &lt; 3.0m is logged as scrap.
                  </p>
                </div>
              </div>

              {/* Source Work Order & Stage Selector */}
              <div className="grid gap-4 md:grid-cols-2 bg-purple-50/30 p-3.5 rounded-lg border border-purple-200/60">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Source Work Order (From) *
                  </label>
                  <WorkOrderSelect
                    value={source}
                    onChange={(val) => void handleSourceChange(val)}
                    workOrders={wos}
                    required
                    disabled={!canManagePlans}
                    placeholder="Select Source Work Order..."
                    searchPlaceholder="Search source order by WO#, customer, grade, size..."
                    buttonClassName="font-mono text-sm min-h-[44px]"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Deduct From Stage (Source WO) *
                  </label>
                  <Select
                    value={sourceWorkCenter}
                    onChange={(e) => setSourceWorkCenter(e.target.value)}
                    required
                    disabled={!canManagePlans}
                    className="font-semibold text-slate-900 border-amber-400 bg-amber-50/20 min-h-[44px]"
                  >
                    {availableWorkCenters.map((wc) => {
                      const stg = sourceWip?.stageBreakdown?.find((s) => s.stage_code === wc.code);
                      const availMtr = stg ? stg.available_mtr : null;
                      const availPcs = stg ? stg.available_pcs : (sourceAvgLen > 0 && availMtr != null ? Math.round(availMtr / sourceAvgLen) : null);
                      return (
                        <option key={wc.code} value={wc.code}>
                          {wc.name} {availMtr != null ? `(${fmt(availPcs, 0)} Pcs / ${fmt(availMtr)} Mtr)` : ''}
                        </option>
                      );
                    })}
                  </Select>
                </div>
              </div>

              {source && sourceWip ? (
                <CutAndDivertSection
                  wos={wos}
                  routes={routes}
                  workCenters={WORK_CENTERS}
                  sourceWoId={source}
                  sourceStageCode={sourceWorkCenter}
                  defaultMotherLength={sourceStagePieceLen || sourceWip.avgLength || 10.0}
                  availableStageMtr={availableAtWorkCenterMtr}
                  availableStagePcs={availableAtWorkCenterPcs}
                  canManagePlans={canManagePlans}
                  onExecuteCutDivert={handleExecuteCutDivert}
                  busy={busy}
                />
              ) : (
                <div className="p-8 text-center text-slate-400 text-xs bg-slate-50 rounded-lg border border-dashed border-slate-300">
                  Select a Source Work Order above to configure pipe cutting and destination splits.
                </div>
              )}
            </div>
          ) : (
            /* MODE A: DIRECT TRANSFER (AS-IS) */
            <form onSubmit={submit} className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Shuffle className="h-5 w-5 text-blue-600" />
                  <h1 className="text-xl font-bold text-slate-900 tracking-tight">Direct Material Diversion</h1>
                </div>
                {!canManagePlans && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1">
                    <Lock size={12} /> View-Only Access
                  </span>
                )}
              </div>

              {/* Work Order Selection Section */}
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Source Work Order (From) <span className="text-red-500">*</span>
                  </label>
                  <WorkOrderSelect
                    value={source}
                    onChange={(val) => void handleSourceChange(val)}
                    workOrders={wos}
                    required
                    disabled={!canManagePlans}
                    placeholder="Select Source Work Order..."
                    searchPlaceholder="Search source order by WO#, customer, grade, size..."
                    buttonClassName="font-mono text-sm min-h-[44px]"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Target Work Order (To) <span className="text-red-500">*</span>
                  </label>
                  <WorkOrderSelect
                    value={target}
                    onChange={(val) => handleTargetChange(val)}
                    workOrders={wos}
                    excludeId={source}
                    required
                    disabled={!canManagePlans}
                    placeholder="Select Target Work Order..."
                    searchPlaceholder="Search target order by WO#, customer, grade, size..."
                    buttonClassName="font-mono text-sm min-h-[44px]"
                  />
                </div>
              </div>

              {/* Work Center Fields: Divert From Stage (Source WO) and Divert To Stage (Target WO) */}
              <div className="grid gap-4 md:grid-cols-4">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Divert From (Source WO) <span className="text-red-500">*</span>
                  </label>
                  <Select
                    value={sourceWorkCenter}
                    onChange={(e) => setSourceWorkCenter(e.target.value)}
                    required
                    disabled={!canManagePlans}
                    className="font-semibold text-slate-900 border-amber-400 bg-amber-50/20 min-h-[44px]"
                  >
                    {availableWorkCenters.map((wc) => {
                      const stg = sourceWip?.stageBreakdown?.find((s) => s.stage_code === wc.code);
                      const availMtr = stg ? stg.available_mtr : null;
                      const availPcs = stg ? stg.available_pcs : (sourceAvgLen > 0 && availMtr != null ? Math.round(availMtr / sourceAvgLen) : null);
                      return (
                        <option key={wc.code} value={wc.code}>
                          {wc.name} {availMtr != null ? `(${fmt(availPcs, 0)} Pcs / ${fmt(availMtr)} Mtr)` : ''}
                        </option>
                      );
                    })}
                  </Select>
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    Stage deducted on source WO
                  </span>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Divert To (Target WO) <span className="text-red-500">*</span>
                  </label>
                  <Select
                    value={targetWorkCenter}
                    onChange={(e) => setTargetWorkCenter(e.target.value)}
                    required
                    disabled={!canManagePlans}
                    className="font-semibold text-slate-900 border-emerald-400 bg-emerald-50/20 min-h-[44px]"
                  >
                    {WORK_CENTERS.map((wc) => (
                      <option key={wc.code} value={wc.code}>
                        {wc.name}
                      </option>
                    ))}
                  </Select>
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    Stage credited on target WO
                  </span>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Target Process Route <span className="text-red-500">*</span>
                  </label>
                  <Select value={route} onChange={(e) => setRoute(e.target.value)} required disabled={!canManagePlans} className="min-h-[44px]">
                    <option value="">Select Route...</option>
                    {routes.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.route_code} — {r.route_name}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Mother Pipe Multiple
                  </label>
                  <Input
                    type="number"
                    min="1"
                    step="0.1"
                    value={multiple}
                    onChange={(e) => setMultiple(e.target.value)}
                    required
                    disabled={!canManagePlans}
                    className="font-mono min-h-[44px]"
                  />
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    1 Mother Pipe = {multiple} Output Pipe(s)
                  </span>
                </div>
              </div>

              {/* STP Constraint Alert & Draw Reduction Metallurgy Indicators */}
              {sourceWip && (
                <div className="space-y-3">
                  <StpConstraintAlert
                    pipeLength={sourceStagePieceLen || sourceWip.avgLength || 0}
                    targetStageCode={targetWorkCenter}
                    isExempt={isStpExempt}
                    onToggleExempt={setIsStpExempt}
                    onSwitchToCutMode={() => setTransferMode('CUT_DIVERT')}
                  />

                  {targetWorkCenter === 'DRAW' && selectedSource && selectedTarget && (
                    <DrawReductionBadge
                      sourceOd={Number(selectedSource.size_od || selectedSource.od || 0)}
                      sourceWt={Number(selectedSource.size_wt || selectedSource.wt || 0)}
                      targetOd={Number(selectedTarget.size_od || selectedTarget.od || 0)}
                      targetWt={Number(selectedTarget.size_wt || selectedTarget.wt || 0)}
                      divertedMtr={diversionMtr}
                    />
                  )}

                  {/* Draw Bench PPC Approval Protocol Bar (Option 1) */}
                  {targetWorkCenter === 'DRAW' && (
                    <div className={`p-3.5 rounded-lg border text-xs transition-colors ${
                      isPpcUser ? 'bg-blue-50/70 border-blue-200 text-blue-950' : 'bg-amber-50/70 border-amber-200 text-amber-950'
                    }`}>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                        <div className="flex items-center gap-2">
                          <Factory className="h-4 w-4 text-[#0078d4]" />
                          <span className="font-bold uppercase tracking-wider text-[11px]">
                            Draw Bench PPC Approval Protocol
                          </span>
                        </div>
                        {isPpcUser ? (
                          <label className="flex items-center gap-2 cursor-pointer font-bold text-xs select-none">
                            <input
                              type="checkbox"
                              checked={ppcAutoApprove}
                              onChange={(e) => setPpcAutoApprove(e.target.checked)}
                              className="rounded border-slate-300 text-[#0078d4] focus:ring-[#0078d4] h-4 w-4"
                            />
                            <span>Approve &amp; Issue Immediately (PPC Direct Authorization)</span>
                          </label>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold text-[11px]">
                            <Clock className="h-3 w-3 text-amber-600" /> Requires PPC Approval
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-[11.5px] text-slate-600">
                        {isPpcUser && ppcAutoApprove
                          ? 'As authorized PPC Admin/Manager, this Draw Bench diversion will be immediately approved. Source WO WIP will be deducted and target Draw Bench queue credited instantly.'
                          : 'Standard Draw Bench Rule: This diversion will be submitted as Pending PPC Approval. Source WO retains physical WIP balance and target Draw Bench queue is un-credited until approved by PPC.'}
                      </p>
                    </div>
                  )}
                </div>
              )}

        {/* ========================================================================= */}
        {/* RULE 1 & 4: SOURCE WO BALANCE WIP DISPLAYED ACCORDING TO SELECTED WORK CENTER */}
        {/* ========================================================================= */}
        {source && sourceWip && (
          <div className="rounded-lg border border-blue-200 bg-blue-50/30 p-4 space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-200/70 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded bg-[#0078d4] text-xs font-bold text-white">
                  1
                </span>
                <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                  Source Work Order WIP Status (Selected Work Center: {selectedSourceWcObj?.name || sourceWorkCenter})
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded bg-blue-100 border border-blue-200 px-2 py-0.5 text-xs font-bold text-[#0078d4] font-mono">
                  WO: {sourceWip.wo.work_order_no}
                </span>
                <span className="text-xs text-slate-600 font-medium">
                  {sourceWip.wo.customer_name || 'No Customer'}
                </span>
              </div>
            </div>

            {/* Pending PPC Approval Hold Notice on Source WO (Option 2) */}
            {sourceWip.pendingDrawDiversionsCount != null && sourceWip.pendingDrawDiversionsCount > 0 && (
              <div className="flex items-start gap-2.5 p-3 rounded-md bg-amber-50 border border-amber-300 text-amber-900 text-xs shadow-2xs">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5 flex-1">
                  <div className="font-bold flex items-center gap-2">
                    <span>Draw Bench Diversion Pending PPC Approval</span>
                    <span className="px-1.5 py-0.2 rounded bg-amber-200/80 text-amber-950 text-[10px] uppercase font-mono font-bold">
                      {sourceWip.pendingDrawDiversionsCount} Pending
                    </span>
                  </div>
                  <p className="text-amber-800 text-[11.5px] leading-relaxed">
                    <strong>{fmt(sourceWip.pendingDrawDiversionsMtr)} Mtrs</strong> of material are currently awaiting PPC approval for Draw Bench diversion. In accordance with Mill WIP Rule 1 &amp; 2, this material <strong>remains in active source WIP balance</strong> until approved.
                  </p>
                </div>
              </div>
            )}

            {/* Source Order Specs Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-white p-2.5 rounded border border-slate-200">
              <div>
                <span className="text-slate-500 block">Grade / Spec:</span>
                <span className="font-semibold text-slate-800">{sourceWip.wo.specification || sourceWip.wo.grade || '—'}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Size (OD × WT):</span>
                <span className="font-semibold text-slate-800 font-mono">
                  {sourceWip.od > 0 ? `${sourceWip.od} × ${sourceWip.wt} mm` : '—'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Length Spec (L1 - L2):</span>
                <span className="font-semibold text-slate-800 font-mono">
                  {sourceWip.l1 ?? 6.0} - {sourceWip.l2 ?? 6.5} m (Avg: {sourceWip.avgLength}m)
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Total Ordered:</span>
                <span className="font-bold text-slate-900 font-mono">
                  {fmt(sourceWip.orderedMtr)} Mtrs ({fmt(sourceWip.orderedPcs, 0)} Pcs · {fmt(sourceWip.orderedMt, 3)} MT)
                </span>
              </div>
            </div>

            {/* Prominent WIP Available for Diversion (Pcs primary) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Available WIP for Diversion across Stages */}
              <div className={`rounded-md border-2 p-3 shadow-2xs ${
                availableAtWorkCenterMtr > 0
                  ? 'border-[#0078d4] bg-white'
                  : 'border-amber-300 bg-amber-50/40'
              }`}>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-[#0078d4] uppercase tracking-wider">
                    Available WIP at {selectedSourceWcObj?.name.split(' ')[0] || sourceWorkCenter}
                  </span>
                  <span className={`rounded text-[10px] font-bold px-1.5 py-0.5 ${
                    availableAtWorkCenterMtr > 0
                      ? 'bg-[#0078d4] text-white'
                      : 'bg-amber-600 text-white'
                  }`}>
                    {availableAtWorkCenterMtr > 0 ? `${fmt(availableAtWorkCenterPcs, 0)} Pcs Available` : '0 Pcs at Stage'}
                  </span>
                </div>
                <div className="mt-1.5">
                  <span className={`text-2xl font-black font-mono tracking-tight ${
                    availableAtWorkCenterMtr > 0 ? 'text-slate-900' : 'text-amber-800'
                  }`}>
                    {fmt(availableAtWorkCenterPcs, 0)}
                  </span>
                  <span className={`text-xs font-bold ml-1 uppercase ${
                    availableAtWorkCenterMtr > 0 ? 'text-[#0078d4]' : 'text-amber-700'
                  }`}>
                    Pcs at Selected Stage
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-slate-600 font-mono">
                  <span className="font-semibold text-slate-800">{fmt(availableAtWorkCenterMtr)} Mtrs</span>
                  <span>•</span>
                  <span>{fmt(availableAtWorkCenterMt, 3)} MT</span>
                </div>
                <div className="mt-2 pt-2 border-t border-slate-100 flex flex-wrap gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded bg-blue-50 border border-blue-200 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800">
                    Total Order WIP: {fmt(sourceWip.balanceWipPcs, 0)} Pcs ({fmt(sourceWip.balanceWipMtr)} m)
                  </span>
                  {sourceWip.salvageAvailableMtr != null && sourceWip.salvageAvailableMtr > 0 && (
                    <span className="inline-flex items-center gap-1 rounded bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800" title="Universal Rejection Handling: Salvage and rejections remain active WIP and are divertible.">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                      Salvage: {fmt(sourceAvgLen > 0 ? Math.round(sourceWip.salvageAvailableMtr / sourceAvgLen) : 0, 0)} Pcs ({fmt(sourceWip.salvageAvailableMtr)} m)
                    </span>
                  )}
                </div>
                <div className="mt-1.5 text-[10px] text-slate-500 font-mono">
                  Formula: Stage Active WIP = Preceding Stage OK − Current Stage OK
                </div>
                {availableAtWorkCenterMtr <= 0 && (
                  <p className="mt-1.5 text-[11px] text-amber-700 font-medium leading-tight">
                    {sourceWip.balanceWipMtr > 0
                      ? `0 physical WIP currently at ${selectedSourceWcObj?.name || sourceWorkCenter}. Material has moved downstream (${fmt(sourceWip.balanceWipPcs, 0)} Pcs / ${fmt(sourceWip.balanceWipMtr)} m active in mill).`
                      : 'No physical WIP remaining for this work order.'}
                  </p>
                )}
              </div>

              {/* Rolling Production Output (HTC OK) */}
              <div className="rounded-md border border-slate-300 bg-white p-3 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                    Rolling Output (HTC OK)
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    Multiple: {sourceWip.planMultiple || 1}x
                  </span>
                </div>
                <div className="mt-1.5">
                  <span className="text-2xl font-black text-slate-900 font-mono tracking-tight">
                    {fmt(sourceWip.rollingHtcOkPcs || (sourceAvgLen > 0 ? Math.round((sourceWip.rollingHtcOkMtr || sourceWip.rollingNetMtr) / sourceAvgLen) : 0), 0)}
                  </span>
                  <span className="text-xs font-bold text-slate-600 ml-1 uppercase">Pcs Rolled</span>
                </div>
                <div className="mt-1 text-xs text-slate-500 font-mono">
                  {fmt(sourceWip.rollingHtcOkMtr || sourceWip.rollingNetMtr)} Mtrs · {fmt(sourceWip.rollingHtcOkMt, 3)} MT
                </div>
                <div className="mt-2 text-[10px] text-slate-400">
                  Initial feeder output from Hot Rolling Mill
                </div>
              </div>

              {/* Deductions & Material Disposition */}
              <div className="rounded-md border border-slate-300 bg-white p-3 shadow-2xs">
                <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
                  Deductions & Dispositions
                </span>
                <div className="mt-1.5 space-y-1 text-xs font-mono">
                  <div className="flex justify-between text-slate-700">
                    <span className="text-slate-500">Shipped / FG Done:</span>
                    <strong className="text-slate-900">{fmt(sourceWip.finishingDoneMtr || 0)} m</strong>
                  </div>
                  <div className="flex justify-between text-amber-700">
                    <span className="text-slate-500">Diverted Out:</span>
                    <strong>{fmt(sourceWip.divertedOutMtr || 0)} m</strong>
                  </div>
                  <div className="flex justify-between items-center bg-blue-50/80 rounded px-1.5 py-0.5 border border-blue-200/60 text-blue-900">
                    <span className="text-[11px] font-sans font-semibold">Active Mill WIP:</span>
                    <strong className="font-mono text-xs">{fmt(sourceWip.balanceWipMtr || 0)} m</strong>
                  </div>
                  {sourceWip.salvageAvailableMtr != null && sourceWip.salvageAvailableMtr > 0 && (
                    <div className="flex justify-between items-center bg-amber-50/80 rounded px-1.5 py-0.5 border border-amber-200/60 text-amber-800">
                      <span className="text-[11px] font-sans font-semibold">Salvage Pool:</span>
                      <strong className="font-mono text-xs">{fmt(sourceWip.salvageAvailableMtr)} m (Divertible)</strong>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Station-wise WIP Breakdown Pills with Active Highlight (Showing Pcs) */}
            {sourceWip.stageBreakdown && sourceWip.stageBreakdown.length > 0 && (
              <div className="bg-white p-2.5 rounded border border-slate-200">
                <div className="text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <Factory className="h-3.5 w-3.5 text-slate-500" />
                  Station-Wise Work-In-Progress Breakdown (Pcs & Mtrs):
                </div>
                <div className="flex flex-wrap gap-2">
                  {sourceWip.stageBreakdown.map((stg, idx) => {
                    const isCurrent = stg.stage_code === sourceWorkCenter;
                    return (
                      <div
                        key={idx}
                        onClick={() => setSourceWorkCenter(stg.stage_code)}
                        className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-mono border transition cursor-pointer ${
                          isCurrent
                            ? 'bg-blue-50 border-[#0078d4] text-[#0078d4] font-bold ring-1 ring-[#0078d4]'
                            : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <span>{stg.stage_name || stg.stage_code}:</span>
                        <span className={stg.available_mtr > 0 ? 'font-bold text-slate-900' : 'text-slate-400'}>
                          {fmt(stg.available_pcs, 0)} Pcs
                        </span>
                        <span className="text-slate-500 text-[11px]">({fmt(stg.available_mtr)} m)</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Warning if 0 physical WIP available at selected work center */}
            {availableAtWorkCenterMtr <= 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 flex items-start gap-2.5">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <strong className="font-semibold text-amber-900">
                    Cannot Divert: 0 Mtrs Physical WIP at {selectedSourceWcObj?.name || sourceWorkCenter}
                  </strong>
                  <p className="mt-0.5 text-amber-800">
                    Only physically produced material can be diverted. Unrolled / unproduced order quantities ({fmt(sourceWip.orderedMtr)} Mtrs) cannot be transferred. Physical production entry and inspection must occur first.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Diversion Quantity & Details: Synchronized Pieces <-> Meters Entry */}
        <div className="grid gap-4 sm:grid-cols-2 pt-1">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Diversion Quantity <span className="text-red-500">*</span>
              </label>
              {sourceStagePieceLen > 0 && (
                <span className="text-[11px] font-mono text-slate-500">
                  Piece Length: <strong>{fmt(sourceStagePieceLen)} m/pc</strong>
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-[10px] text-slate-500 block mb-0.5">Quantity in Meters</span>
                <Input
                  type="number"
                  min="0.001"
                  step="0.001"
                  placeholder="Meters..."
                  value={qty}
                  onChange={(e) => handleMtrChange(e.target.value)}
                  required
                  disabled={!canManagePlans}
                  className="font-mono font-bold text-sm min-h-[44px]"
                />
              </div>

              <div>
                <span className="text-[10px] text-slate-500 block mb-0.5">Quantity in Pieces</span>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  placeholder="Pieces..."
                  value={pcsInput}
                  onChange={(e) => handlePcsChange(e.target.value)}
                  disabled={!canManagePlans}
                  className="font-mono font-bold text-sm min-h-[44px]"
                />
              </div>
            </div>

            {sourceWip && (
              <div className="mt-1 text-xs text-slate-500 flex justify-between">
                <span>Available at {selectedSourceWcObj?.name.split(' ')[0] || sourceWorkCenter}: <strong className="font-mono text-[#0078d4]">{fmt(availableAtWorkCenterPcs, 0)} Pcs</strong> ({fmt(availableAtWorkCenterMtr)} m)</span>
                {diversionMtr > 0 && (
                  <span className="font-mono font-bold text-slate-800">Transfer: {fmt(sourceDivPcs, 0)} Pcs</span>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Diversion Date <span className="text-red-500">*</span>
            </label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required disabled={!canManagePlans} />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Reason / Engineering Justification <span className="text-red-500">*</span>
            </label>
            <span className="text-[11px] text-slate-400">Select standard reason or type custom</span>
          </div>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            disabled={!canManagePlans}
            placeholder="e.g. Urgent customer dispatch, mother pipe size pairing, salvage disposition"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[
              'Prime Material Reallocation',
              'Salvage / QC Rejection Diversion',
              'Off-cut Remnant Diversion (≥ 3.0m)',
              'Commercial Secondary Downgrade',
              'Urgent Customer Dispatch Pairing',
            ].map((tag) => (
              <button
                type="button"
                key={tag}
                onClick={() => setReason(tag)}
                disabled={!canManagePlans}
                className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
                  reason === tag
                    ? 'bg-blue-100 text-blue-800 border-blue-300 font-semibold'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-800'
                }`}
              >
                + {tag}
              </button>
            ))}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* RULE 2: DIVERTED QTY DISPLAYED IN TARGET WO AND DEDUCTED FROM SOURCE WO */}
        {/* ========================================================================= */}
        {source && target && (
          <div className="rounded-lg border border-emerald-300 bg-emerald-50/30 p-4 space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-200/70 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded bg-[#107c41] text-xs font-bold text-white">
                  2
                </span>
                <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                  Rule 2: WIP Transfer & Deduction Real-Time Preview ({getWcShortName(sourceWorkCenter)} → {getWcShortName(targetWorkCenter)})
                </h2>
              </div>
              {isExceeding ? (
                <span className="inline-flex items-center gap-1 rounded bg-red-100 border border-red-300 px-2 py-0.5 text-xs font-bold text-red-800">
                  <AlertTriangle size={12} /> Diversion Exceeds Available WIP
                </span>
              ) : diversionMtr > 0 ? (
                <span className="inline-flex items-center gap-1 rounded bg-emerald-100 border border-emerald-300 px-2 py-0.5 text-xs font-bold text-emerald-800">
                  <CheckCircle2 size={12} /> Valid Material Transfer
                </span>
              ) : null}
            </div>

            {/* Side-by-side Transfer Flow Matrix */}
            <div className="grid grid-cols-1 md:grid-cols-11 gap-3 items-center">
              {/* SOURCE WORK ORDER (DEDUCTION) */}
              <div className="md:col-span-5 rounded border border-red-200 bg-white p-3 shadow-2xs space-y-2">
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-red-700 bg-red-50 border border-red-200 rounded px-1.5 py-0.5">
                      Source (Deducting WIP)
                    </span>
                    <div className="font-mono font-bold text-xs text-slate-900 mt-1">
                      {selectedSource?.work_order_no}
                    </div>
                  </div>
                  <span className="text-xs text-slate-500 text-right max-w-[130px] truncate">
                    {selectedSource?.customer_name || 'No Customer'}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between items-center text-slate-600">
                    <span>Work Center WIP:</span>
                    <span className="font-mono font-semibold text-slate-900">
                      {fmt(availableAtWorkCenterPcs, 0)} Pcs ({fmt(sourceInitialBalanceMtr)} Mtr)
                    </span>
                  </div>

                  <div className="flex justify-between items-center bg-red-50 p-1.5 rounded border border-red-100">
                    <span className="font-bold text-red-800 flex items-center gap-1">
                      <TrendingDown size={13} /> Diverted Out Qty:
                    </span>
                    <span className="font-mono font-black text-red-700 text-xs">
                      - {fmt(sourceDivPcs, 0)} Pcs (- {fmt(diversionMtr)} Mtr)
                    </span>
                  </div>

                  <div className="flex justify-between items-center pt-1 border-t border-slate-100 font-medium">
                    <span className="text-slate-800 font-bold">Remaining WIP:</span>
                    <span
                      className={`font-mono font-bold text-xs ${
                        isExceeding ? 'text-red-600' : 'text-emerald-700'
                      }`}
                    >
                      {fmt(sourceRemainingBalancePcs, 0)} Pcs ({fmt(sourceRemainingBalanceMtr)} Mtr)
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-400 font-mono text-right">
                    Weight: {fmt(sourceRemainingBalanceMt, 3)} MT
                  </div>
                </div>
              </div>

              {/* TRANSFER FLOW CONNECTOR */}
              <div className="md:col-span-1 flex flex-col items-center justify-center py-1">
                <div className="h-7 w-7 rounded-full bg-[#107c41] text-white flex items-center justify-center shadow-xs">
                  <ArrowRight className="h-3.5 w-3.5" />
                </div>
                <span className="text-[10px] font-bold text-slate-500 font-mono mt-1 text-center">
                  {selectedRouteObj?.route_code || 'Route'}
                </span>
              </div>

              {/* TARGET WORK ORDER (ADDITION) */}
              <div className="md:col-span-5 rounded border border-emerald-200 bg-white p-3 shadow-2xs space-y-2">
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
                      Target (Adding WIP)
                    </span>
                    <div className="font-mono font-bold text-xs text-slate-900 mt-1">
                      {selectedTarget?.work_order_no}
                    </div>
                  </div>
                  <span className="text-xs text-slate-500 text-right max-w-[130px] truncate">
                    {selectedTarget?.customer_name || 'No Customer'}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between items-center text-slate-600">
                    <span>Target Size & Grade:</span>
                    <span className="font-mono font-semibold text-slate-800">
                      {selectedTarget?.size_od || selectedTarget?.od}×{selectedTarget?.size_wt || selectedTarget?.wt} mm ({selectedTarget?.specification || selectedTarget?.grade || 'Grade N/A'})
                    </span>
                  </div>

                  <div className="flex justify-between items-center bg-emerald-50 p-1.5 rounded border border-emerald-100">
                    <span className="font-bold text-emerald-800 flex items-center gap-1">
                      <TrendingUp size={13} /> Incoming Diverted WIP:
                    </span>
                    <div className="text-right">
                      <span className="font-mono font-black text-emerald-700 text-xs block">
                        + {fmt(targetDivPcs, 0)} Pcs (+ {fmt(diversionMtr)} Mtr)
                      </span>
                      {numMultiple > 1 && (
                        <span className="text-[10px] text-emerald-700 font-mono block">
                          ({fmt(sourceDivPcs, 0)} mother pipes × {numMultiple} cuts @ {fmt(targetCutLen)}m)
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-1 border-t border-slate-100 font-medium">
                    <span className="text-slate-800 font-bold">New Available WIP:</span>
                    <span className="font-mono font-bold text-xs text-emerald-700">
                      {fmt(targetPostWipPcs, 0)} Pcs ({fmt(targetPostWipMtr)} Mtr)
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-400 font-mono text-right">
                    Weight: {fmt(targetPostWipMt, 3)} MT ready for downstream
                  </div>
                </div>
              </div>
            </div>

            {/* Target Over-allocation Warning (Soft Warning Only, Non-Blocking) */}
            {overAlloc && overAlloc.isOverAllocated && (
              <div className="rounded border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Target Order Over-allocation Notice:</span> Incoming diversion of{' '}
                  <strong>{fmt(diversionMtr)} Mtrs</strong> exceeds remaining required balance on{' '}
                  <strong>{selectedTarget?.work_order_no}</strong> ({fmt(overAlloc.remainingBefore)} Mtrs needed).
                  This will generate <strong>{fmt(overAlloc.surplusMtr)} Mtrs</strong> surplus finished stock upon completion.
                </div>
              </div>
            )}

            {/* Status Explanation Banner */}
            <div className="rounded bg-emerald-100/60 p-2.5 border border-emerald-200 text-xs text-emerald-950 flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-[#107c41] mt-0.5 shrink-0" />
              <div>
                <strong>Deduction &amp; Allocation Rule Enforced:</strong> On submission, <strong>{fmt(diversionMtr)} Mtrs</strong> will be automatically deducted from <strong>{selectedSource?.work_order_no}</strong> at <strong>{selectedSourceWcObj?.name || sourceWorkCenter}</strong> and credited to <strong>{selectedTarget?.work_order_no}</strong> at <strong>{selectedTargetWcObj?.name || targetWorkCenter}</strong>.
              </div>
            </div>
          </div>
        )}

        {/* Mobile Sticky Action Drawer (< sm screens) */}
        {source && target && diversionMtr > 0 && (
          <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-300 p-3 shadow-2xl flex items-center justify-between sm:hidden">
            <div>
              <span className="text-[10px] text-slate-500 uppercase font-bold block">Diversion Total</span>
              <span className="text-sm font-mono font-black text-slate-900">
                {fmt(diversionMtr)} m <span className="text-xs text-blue-600 font-normal">({fmt(sourceDivPcs, 0)} pcs)</span>
              </span>
            </div>
            <Button
              type="submit"
              disabled={busy || !canManagePlans || isExceeding || availableAtWorkCenterMtr <= 0}
              className="bg-[#0078d4] hover:bg-[#106ebe] text-white font-bold text-xs px-4 min-h-[44px] shadow-sm"
            >
              {busy ? 'Issuing...' : 'Issue Plan'}
            </Button>
          </div>
        )}

        {/* Form Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-200">
          {!canManagePlans ? (
            <span className="text-xs text-amber-700 font-medium flex items-center gap-1.5">
              <Lock size={13} />
              Diversion creation is restricted to Admin & Super User groups.
            </span>
          ) : <div />}

          <Button
            type="submit"
            disabled={busy || !canManagePlans || isExceeding || !source || !target || diversionMtr <= 0 || availableAtWorkCenterMtr <= 0}
            className={
              canManagePlans && !isExceeding && diversionMtr > 0 && availableAtWorkCenterMtr > 0
                ? 'bg-[#0078d4] text-white hover:bg-[#106ebe] px-5 font-semibold min-h-[44px]'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed px-5 min-h-[44px]'
            }
          >
            {busy
              ? 'Processing Diversion...'
              : canManagePlans
              ? availableAtWorkCenterMtr <= 0 && source
                ? 'Cannot Divert (0 Mtrs Physical WIP)'
                : 'Execute & Transfer Diversion Plan'
              : 'Execute Diversion (View-Only)'}
          </Button>
        </div>
      </form>
          )}
        </div>
      )}

      {/* TAB: PENDING PPC APPROVALS */}
      {activeTab === 'PENDING_PPC' && (
        <section className="rounded-lg border border-amber-300 bg-white p-5 shadow-2xs space-y-4">
          <div className="border-b border-amber-200 pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                  <Clock className="h-5 w-5 text-amber-600" />
                  Draw Bench Diversions — Pending PPC Authorization
                </h2>
                <p className="text-xs text-slate-500">
                  Review and authorize requested Draw Bench diversions. Approving deducts material from the source work order and credits the Draw Bench queue. Rejecting releases the hold and discards the addition.
                </p>
              </div>

              <button
                type="button"
                onClick={() => void loadPlans()}
                disabled={plansLoading}
                className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer shadow-2xs"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${plansLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            {/* Metrics cards for Pending PPC */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-3">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <div className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">Pending Requests</div>
                <div className="mt-1 text-xl font-bold font-mono text-amber-950">{pendingPpcPlans.length}</div>
                <div className="text-[11px] text-amber-700 mt-0.5">Awaiting PPC Action</div>
              </div>

              <div className="bg-blue-50/60 border border-blue-200 rounded-lg p-3">
                <div className="text-[11px] font-bold text-blue-700 uppercase tracking-wider">Pending Meters</div>
                <div className="mt-1 text-xl font-bold font-mono text-blue-950">
                  {fmt(pendingPpcPlans.reduce((sum, p) => sum + Number(p.diverted_qty || 0), 0))} Mtr
                </div>
                <div className="text-[11px] text-blue-600 mt-0.5 font-mono">Held at source</div>
              </div>

              <div className="bg-purple-50/60 border border-purple-200 rounded-lg p-3">
                <div className="text-[11px] font-bold text-purple-700 uppercase tracking-wider">Pending Pieces</div>
                <div className="mt-1 text-xl font-bold font-mono text-purple-950">
                  {fmt(pendingPpcPlans.reduce((sum, p) => sum + Number(p.diverted_pcs || 0), 0), 0)} Pcs
                </div>
                <div className="text-[11px] text-purple-600 mt-0.5 font-mono">Draw Bench infeed</div>
              </div>

              <div className="bg-emerald-50/60 border border-emerald-200 rounded-lg p-3">
                <div className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Estimated Mass</div>
                <div className="mt-1 text-xl font-bold font-mono text-emerald-950">
                  {fmt(pendingPpcPlans.reduce((sum, p) => sum + Number(p.diverted_mt || 0), 0), 2)} MT
                </div>
                <div className="text-[11px] text-emerald-600 mt-0.5">Physical weight</div>
              </div>
            </div>
          </div>

          {/* Pending Table */}
          <div className="overflow-x-auto border border-amber-200 rounded shadow-2xs">
            <table className="min-w-[1200px] w-full text-xs border-collapse">
              <thead className="bg-amber-50/60 border-b border-amber-200 text-slate-800">
                <tr>
                  <th className="px-3 py-2 text-left font-bold border-r border-amber-200">Plan ID</th>
                  <th className="px-3 py-2 text-left font-bold border-r border-amber-200">Date</th>
                  <th className="px-3 py-2 text-left font-bold border-r border-amber-200">Source WO #</th>
                  <th className="px-3 py-2 text-left font-bold border-r border-amber-200">Source Customer</th>
                  <th className="px-3 py-2 text-left font-bold border-r border-amber-200">Target WO # (Draw Bench)</th>
                  <th className="px-3 py-2 text-left font-bold border-r border-amber-200">Target Customer</th>
                  <th className="px-3 py-2 text-right font-bold border-r border-amber-200">Meters</th>
                  <th className="px-3 py-2 text-right font-bold border-r border-amber-200">Pieces</th>
                  <th className="px-3 py-2 text-right font-bold border-r border-amber-200">Weight (MT)</th>
                  <th className="px-3 py-2 text-left font-bold border-r border-amber-200">Reason / Notes</th>
                  <th className="px-3 py-2 text-center font-bold sticky right-0 bg-amber-50 border-l border-amber-200 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.08)]">
                    PPC Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-100">
                {pendingPpcPlans.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="p-8 text-center text-slate-500">
                      <div className="flex flex-col items-center justify-center gap-1.5">
                        <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                        <span className="font-semibold text-slate-700">All clear! No Draw Bench diversions pending PPC approval.</span>
                        <span className="text-xs text-slate-400">Any newly submitted Draw Bench diversions will appear here for authorization.</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  pendingPpcPlans.map((p) => (
                    <tr key={p.id} className="hover:bg-amber-50/50">
                      <td className="px-3 py-2.5 font-bold font-mono text-slate-900 border-r border-slate-200">
                        {p.id}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-slate-700 border-r border-slate-200 whitespace-nowrap">
                        {p.diversion_date}
                      </td>
                      <td className="px-3 py-2.5 font-bold font-mono text-red-700 border-r border-slate-200">
                        {p.source_wo_no}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 border-r border-slate-200 max-w-[130px] truncate" title={p.source_customer}>
                        {p.source_customer}
                      </td>
                      <td className="px-3 py-2.5 font-bold font-mono text-emerald-700 border-r border-slate-200">
                        {p.target_wo_no}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 border-r border-slate-200 max-w-[130px] truncate" title={p.target_customer}>
                        {p.target_customer}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-900 border-r border-slate-200">
                        {fmt(p.diverted_qty)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-slate-700 border-r border-slate-200">
                        {fmt(p.diverted_pcs, 0)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-slate-700 border-r border-slate-200">
                        {fmt(p.diverted_mt, 3)}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 border-r border-slate-200 max-w-[200px] truncate" title={p.reason}>
                        {p.reason}
                      </td>
                      <td className="px-3 py-2.5 sticky right-0 bg-white border-l border-amber-200 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.08)] whitespace-nowrap">
                        {isPpcUser ? (
                          <div className="flex items-center gap-1.5 justify-center">
                            <button
                              type="button"
                              onClick={() => {
                                setApproveModalPlan(p);
                                setApproveRemarks('');
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer shadow-2xs transition"
                            >
                              <Check className="h-3.5 w-3.5" />
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRejectModalPlan(p);
                                setRejectReason('');
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs cursor-pointer shadow-2xs transition"
                            >
                              <X className="h-3.5 w-3.5" />
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800">
                            <Lock className="h-3 w-3" /> PPC Required
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* TAB 2: OFFCUTS & REMNANTS POOL */}
      {activeTab === 'REMNANTS' && (
        <OffcutPoolManager onDivertRemnant={handleDivertRemnant} canManagePlans={canManagePlans} />
      )}

      {/* TAB 3: DIVERSION LOGS & HISTORY TABLE */}
      {(activeTab === 'LOGS' || activeTab === 'ISSUE') && (
      /* ========================================================================= */
      /* ISSUED DIVERSION PLANS TABLE WITH EDIT & DELETE (OFFICE / SPREADSHEET STYLE) */
      /* ========================================================================= */
      <section className="rounded-lg border border-slate-300 bg-white p-5 shadow-2xs space-y-4">
        <div className="border-b border-slate-200 pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <Layers className="h-4 w-4 text-[#0078d4]" />
                Issued Diversion Plans
              </h2>
              <p className="text-xs text-slate-500">
                Track, edit, or remove authorized material diversions across production routes and work centers.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void loadPlans()}
              disabled={plansLoading}
              className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer shadow-2xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${plansLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {/* Summary Metric Cards for Issued Diversion Plans */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-3">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Diversion Plans</div>
              <div className="mt-1 text-xl font-bold font-mono text-slate-900">{plans.length}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">Authorized records</div>
            </div>

            <div className="bg-blue-50/60 border border-blue-200 rounded-lg p-3">
              <div className="text-[11px] font-bold text-blue-700 uppercase tracking-wider">Total Diverted Volume</div>
              <div className="mt-1 text-xl font-bold font-mono text-blue-950">{fmt(totalDivertedPcs, 0)} Pcs</div>
              <div className="text-[11px] text-blue-600 mt-0.5 font-mono">{fmt(totalDivertedMtr)} Mtrs transferred</div>
            </div>

            <div className="bg-emerald-50/60 border border-emerald-200 rounded-lg p-3">
              <div className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Total Diverted Weight</div>
              <div className="mt-1 text-xl font-bold font-mono text-emerald-950">{fmt(totalDivertedMt, 2)} MT</div>
              <div className="text-[11px] text-emerald-600 mt-0.5 font-mono">Net physical mass</div>
            </div>

            <div className="bg-purple-50/60 border border-purple-200 rounded-lg p-3">
              <div className="text-[11px] font-bold text-purple-700 uppercase tracking-wider">Active Process Routes</div>
              <div className="mt-1 text-xl font-bold font-mono text-purple-950">{routesInPlans.length} Routes</div>
              <div className="text-[11px] text-purple-600 mt-0.5">Across work centers</div>
            </div>
          </div>

          {/* Search & Filter Toolbar */}
          <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-12">
            <div className="relative lg:col-span-3">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <Input
                className="h-8.5 pl-8 text-xs w-full"
                placeholder="Search ID / WO / Customer / Reason / Approver..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="lg:col-span-2">
              <Select
                className="h-8.5 text-xs w-full"
                value={filterWorkCenter}
                onChange={(e) => setFilterWorkCenter(e.target.value)}
              >
                <option value="">All Work Centers</option>
                {WORK_CENTERS.map((wc) => (
                  <option key={wc.code} value={wc.code}>
                    {wc.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="lg:col-span-2">
              <Select
                className="h-8.5 text-xs w-full font-semibold"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="">All Statuses</option>
                <option value="APPROVED">Approved Only</option>
                <option value="PENDING_PPC">Pending PPC</option>
                <option value="REJECTED_BY_PPC">Rejected</option>
              </Select>
            </div>

            <div className="lg:col-span-2">
              <Select
                className="h-8.5 text-xs w-full"
                value={filterRoute}
                onChange={(e) => setFilterRoute(e.target.value)}
              >
                <option value="">All Routes</option>
                {routesInPlans.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            </div>

            <div className="lg:col-span-3 flex items-center gap-1.5">
              <div className="flex-1 min-w-0">
                <Input
                  className="h-8.5 text-xs w-full"
                  type="date"
                  title="From Date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                />
              </div>
              <span className="text-slate-400 text-xs shrink-0">to</span>
              <div className="flex-1 min-w-0">
                <Input
                  className="h-8.5 text-xs w-full"
                  type="date"
                  title="To Date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                />
              </div>
              {(fromDate || toDate) && (
                <button
                  type="button"
                  onClick={() => { setFromDate(''); setToDate(''); }}
                  className="rounded p-1 text-slate-400 hover:text-red-600 hover:bg-slate-100 transition shrink-0"
                  title="Clear date filter"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Excel / Spreadsheet Styled Data Table */}
        <div className="overflow-x-auto border border-slate-300 rounded shadow-2xs">
          <table className="min-w-[1400px] w-full text-xs border-collapse">
            <thead className="bg-slate-100 border-b border-slate-300 text-slate-700">
              <tr>
                {[
                  'Diversion ID',
                  'Date',
                  'Source WO #',
                  'Source Customer',
                  'Target WO #',
                  'Target Customer',
                  'Work Center',
                  'Route',
                  'Status',
                  'Diverted Qty (Mtr)',
                  'Diverted Pcs',
                  'Diverted MT',
                  'Multiple',
                  'Reason',
                  'Approved By',
                  'Actions',
                ].map((h) => {
                  const isActions = h === 'Actions';
                  return (
                    <th
                      key={h}
                      className={`px-3 py-2 text-left font-bold border-r border-slate-300 last:border-r-0 whitespace-nowrap ${
                        isActions
                          ? 'sticky right-0 z-20 bg-slate-100 border-l border-slate-300 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.08)]'
                          : ''
                      }`}
                    >
                      {h}
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {plansLoading ? (
                <tr>
                  <td colSpan={16} className="p-8 text-center text-slate-400">
                    Loading diversion records…
                  </td>
                </tr>
              ) : filteredPlans.length === 0 ? (
                <tr>
                  <td colSpan={16} className="p-8 text-center text-slate-500">
                    No diversion plans found matching criteria.
                  </td>
                </tr>
              ) : (
                filteredPlans.map((p) => {
                  const canModifyPlan = p.can_modify && (canManagePlans || !user || user.role !== 'auditor');
                  return (
                    <tr key={p.id} className="group hover:bg-blue-50/40 even:bg-slate-50/50">
                      <td className="px-3 py-2 font-bold font-mono text-slate-900 border-r border-slate-200">
                        {p.id}
                      </td>

                      <td className="px-3 py-2 font-mono text-slate-700 border-r border-slate-200 whitespace-nowrap">
                        {p.diversion_date}
                      </td>

                      <td className="px-3 py-2 font-bold font-mono text-red-700 border-r border-slate-200">
                        {p.source_wo_no}
                      </td>

                      <td className="max-w-[130px] truncate px-3 py-2 text-slate-600 border-r border-slate-200" title={p.source_customer}>
                        {p.source_customer}
                      </td>

                      <td className="px-3 py-2 font-bold font-mono text-emerald-700 border-r border-slate-200">
                        {p.target_wo_no}
                      </td>

                      <td className="max-w-[130px] truncate px-3 py-2 text-slate-600 border-r border-slate-200" title={p.target_customer}>
                        {p.target_customer}
                      </td>

                      <td className="px-3 py-2 border-r border-slate-200 whitespace-nowrap">
                        {p.source_work_center && p.target_work_center && p.source_work_center !== p.target_work_center ? (
                          <div className="flex items-center gap-1 font-semibold text-[11px]">
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200" title={`Deducted from ${getWcShortName(p.source_work_center)} on WO ${p.source_wo_no}`}>
                              {getWcShortName(p.source_work_center)}
                            </span>
                            <span className="text-slate-400 font-bold">→</span>
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200" title={`Credited to ${getWcShortName(p.target_work_center)} on WO ${p.target_wo_no}`}>
                              {getWcShortName(p.target_work_center)}
                            </span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-[#0078d4] border border-blue-200">
                            {p.work_center_name || getWcShortName(p.target_work_center || p.work_center)}
                          </span>
                        )}
                      </td>

                      <td className="px-3 py-2 font-mono font-semibold text-slate-800 border-r border-slate-200">
                        {p.route_code}
                      </td>

                      <td className="px-3 py-2 border-r border-slate-200 whitespace-nowrap">
                        {p.status === 'PENDING_PPC' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-300">
                            <Clock className="h-3 w-3 text-amber-600" />
                            Pending PPC
                          </span>
                        ) : p.status === 'REJECTED_BY_PPC' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200" title={p.ppc_rejection_reason || 'Rejected by PPC'}>
                            <XCircle className="h-3 w-3 text-rose-600" />
                            Rejected
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <Check className="h-3 w-3 text-emerald-600" />
                            Approved
                          </span>
                        )}
                      </td>

                      <td className="px-3 py-2 text-right font-mono font-bold text-slate-900 border-r border-slate-200">
                        {fmt(p.diverted_qty)}
                      </td>

                      <td className="px-3 py-2 text-right font-mono text-slate-700 border-r border-slate-200">
                        {Number(p.multiple || 1) > 1 ? (
                          <div className="flex flex-col items-end">
                            <span className="font-bold text-slate-900">{fmt(Number(p.diverted_pcs || 0) * Number(p.multiple), 0)} cut</span>
                            <span className="text-[10px] text-slate-400 font-normal">({fmt(p.diverted_pcs, 0)} mother × {p.multiple})</span>
                          </div>
                        ) : (
                          fmt(p.diverted_pcs, 0)
                        )}
                      </td>

                      <td className="px-3 py-2 text-right font-mono text-slate-700 border-r border-slate-200">
                        {fmt(p.diverted_mt, 3)}
                      </td>

                      <td className="px-3 py-2 text-center font-mono text-slate-700 border-r border-slate-200">
                        {fmt(p.multiple, 1)}
                      </td>

                      <td className="max-w-[160px] truncate px-3 py-2 text-slate-600 border-r border-slate-200" title={p.reason}>
                        {(p.reason || '—')
                          .replace(/\[FROM_STAGE:\s*[A-Z_]+\]/gi, '')
                          .replace(/\[TO_STAGE:\s*[A-Z_]+\]/gi, '')
                          .trim() || '—'}
                      </td>

                      <td className="px-3 py-2 text-slate-700 border-r border-slate-200 whitespace-nowrap">
                        {p.approved_by || 'Admin'}
                      </td>

                      {/* Action buttons (Edit / Delete / Quick PPC Approve) - Sticky Right */}
                      <td className="sticky right-0 z-10 bg-white group-even:bg-slate-50 group-hover:bg-blue-50/80 border-l border-slate-200 px-3 py-1.5 whitespace-nowrap shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.08)]">
                        {canModifyPlan ? (
                          <div className="flex items-center gap-1.5">
                            {p.status === 'PENDING_PPC' && isPpcUser && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => { setApproveModalPlan(p); setApproveRemarks(''); }}
                                  title="Authorize Draw Bench Diversion"
                                  className="inline-flex items-center gap-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1 text-xs font-bold shadow-2xs transition"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { setRejectModalPlan(p); setRejectReason(''); }}
                                  title="Reject Draw Bench Diversion"
                                  className="inline-flex items-center gap-1 rounded bg-rose-600 hover:bg-rose-700 text-white px-2 py-1 text-xs font-bold shadow-2xs transition"
                                >
                                  <X className="h-3.5 w-3.5" />
                                  Reject
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={() => startEdit(p)}
                              title="Edit Diversion Plan"
                              className="inline-flex items-center gap-1 rounded border border-blue-300 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 text-xs font-semibold text-[#0078d4] cursor-pointer shadow-2xs transition-colors"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                              Edit
                            </button>

                            <button
                              type="button"
                              onClick={() => void removePlan(p)}
                              title="Delete Diversion Plan"
                              className="inline-flex items-center gap-1 rounded border border-rose-300 bg-rose-50 hover:bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-700 cursor-pointer shadow-2xs transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                              Delete
                            </button>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-slate-400 font-medium">
                            <Lock className="h-3.5 w-3.5" />
                            View Only
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
      )}

      {/* ========================================================================= */}
      {/* EDIT DIVERSION MODAL DIALOG */}
      {/* ========================================================================= */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl rounded-lg border border-slate-300 bg-white p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Edit Diversion Plan {editing.id}
                </h3>
                <div className="mt-0.5 text-xs text-slate-500 font-mono">
                  From {editing.source_wo_no} ({editing.source_customer}) → To {editing.target_wo_no} ({editing.target_customer})
                </div>
              </div>

              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded border border-slate-300 p-1.5 text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 text-xs">
              <div>
                <label className="mb-1 block font-bold text-slate-700 uppercase">
                  Diverted Qty (Mtrs) *
                </label>
                <Input
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={editQty}
                  onChange={(e) => setEditQty(e.target.value)}
                  className="font-mono font-bold"
                />
              </div>

              <div>
                <label className="mb-1 block font-bold text-slate-700 uppercase">
                  Deduct From (Source WO Stage) *
                </label>
                <Select
                  value={editSourceWorkCenter}
                  onChange={(e) => setEditSourceWorkCenter(e.target.value)}
                  className="border-amber-400 bg-amber-50/20"
                >
                  {WORK_CENTERS.map((wc) => (
                    <option key={wc.code} value={wc.code}>
                      {wc.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <label className="mb-1 block font-bold text-slate-700 uppercase">
                  Credit To (Target WO Stage) *
                </label>
                <Select
                  value={editTargetWorkCenter}
                  onChange={(e) => setEditTargetWorkCenter(e.target.value)}
                  className="border-emerald-400 bg-emerald-50/20"
                >
                  {WORK_CENTERS.map((wc) => (
                    <option key={wc.code} value={wc.code}>
                      {wc.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <label className="mb-1 block font-bold text-slate-700 uppercase">
                  Process Route *
                </label>
                <Select
                  value={editRoute}
                  onChange={(e) => setEditRoute(e.target.value)}
                >
                  {routes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.route_code} — {r.route_name}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <label className="mb-1 block font-bold text-slate-700 uppercase">
                  Multiple
                </label>
                <Input
                  type="number"
                  min="1"
                  step="0.1"
                  value={editMultiple}
                  onChange={(e) => setEditMultiple(e.target.value)}
                  className="font-mono"
                />
              </div>

              <div>
                <label className="mb-1 block font-bold text-slate-700 uppercase">
                  Diversion Date *
                </label>
                <Input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                />
              </div>

              <div>
                <label className="mb-1 block font-bold text-slate-700 uppercase">
                  Reason *
                </label>
                <Input
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder="Justification for changes"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer shadow-2xs"
              >
                Cancel
              </button>

              <Button
                type="button"
                disabled={editSaving || !editQty}
                onClick={() => void saveEdit()}
                className="bg-[#0078d4] hover:bg-[#106ebe] px-5 text-xs font-semibold shadow-xs"
              >
                {editSaving ? 'Saving Changes…' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* PPC APPROVE CONFIRMATION MODAL */}
      {approveModalPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-2xl border border-emerald-200 space-y-4">
            <div className="flex items-center justify-between border-b border-emerald-100 pb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <h3 className="font-bold text-slate-900 text-base">Authorize Draw Bench Diversion</h3>
              </div>
              <button
                type="button"
                onClick={() => setApproveModalPlan(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="bg-emerald-50/70 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-950 space-y-1">
              <div><strong>Plan ID:</strong> {approveModalPlan.id}</div>
              <div><strong>Transfer:</strong> {fmt(approveModalPlan.diverted_qty)} Mtrs ({fmt(approveModalPlan.diverted_pcs, 0)} Pcs)</div>
              <div><strong>From Source:</strong> WO #{approveModalPlan.source_wo_no} ({approveModalPlan.source_customer})</div>
              <div><strong>To Target:</strong> WO #{approveModalPlan.target_wo_no} ({approveModalPlan.target_customer}) at Draw Bench</div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Approving will deduct this material from Source WO #{approveModalPlan.source_wo_no} WIP and immediately credit Target WO #{approveModalPlan.target_wo_no} Draw Bench infeed queue.
            </p>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                PPC Approval Remarks (Optional)
              </label>
              <Input
                placeholder="e.g. Authorized as per daily rolling schedule revision..."
                value={approveRemarks}
                onChange={(e) => setApproveRemarks(e.target.value)}
                className="text-xs"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <Button
                variant="outline"
                type="button"
                disabled={approveBusy}
                onClick={() => setApproveModalPlan(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={approveBusy}
                onClick={handleApprove}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
              >
                {approveBusy ? 'Approving...' : 'Confirm & Authorize'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* PPC REJECT CONFIRMATION MODAL */}
      {rejectModalPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-2xl border border-rose-200 space-y-4">
            <div className="flex items-center justify-between border-b border-rose-100 pb-3">
              <div className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-rose-600" />
                <h3 className="font-bold text-slate-900 text-base">Reject Draw Bench Diversion</h3>
              </div>
              <button
                type="button"
                onClick={() => setRejectModalPlan(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="bg-rose-50/70 border border-rose-200 rounded-lg p-3 text-xs text-rose-950 space-y-1">
              <div><strong>Plan ID:</strong> {rejectModalPlan.id}</div>
              <div><strong>Transfer:</strong> {fmt(rejectModalPlan.diverted_qty)} Mtrs from WO #{rejectModalPlan.source_wo_no} to WO #{rejectModalPlan.target_wo_no}</div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Rejecting will release the pending hold on Source WO #{rejectModalPlan.source_wo_no}. The material will not be transferred to Target WO #{rejectModalPlan.target_wo_no}.
            </p>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                PPC Rejection Reason <span className="text-rose-600">*</span>
              </label>
              <textarea
                required
                rows={3}
                placeholder="State why this diversion is rejected (e.g. Incompatible metallurgy / target order already fulfilled)..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full text-xs rounded-md border border-slate-300 p-2 focus:ring-rose-500 focus:border-rose-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <Button
                variant="outline"
                type="button"
                disabled={rejectBusy}
                onClick={() => setRejectModalPlan(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={rejectBusy || !rejectReason.trim()}
                onClick={handleReject}
                className="bg-rose-600 hover:bg-rose-700 text-white font-bold"
              >
                {rejectBusy ? 'Rejecting...' : 'Reject Diversion'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
