import { isHollowBankOrder, HOLLOW_BANK_WO_ID, extractPcsFromRemarks, extractBandSawCutsFromRemarks } from '@/lib/productionUtils';

export type AgingSeverity = 'NORMAL' | 'WARNING' | 'CRITICAL';

export interface AgingRow {
  work_order_id: string;
  work_order_no: string;
  customer_name: string | null;
  grade: string | null;
  od: number;
  wt: number;
  l1: number | null;
  l2: number | null;
  stage_id?: string;
  stage_code: string;
  stage_name: string;
  sequence_no?: number;
  current_wip: number;
  current_wip_pcs: number;
  available_mt: number;
  vdi_salvage_pcs?: number;
  vdi_salvage_mtr?: number;
  last_activity_date: string;
  days_stuck: number;
  severity: AgingSeverity;
  is_acknowledged?: boolean;
  acknowledged_by?: string | null;
  ack_notes?: string | null;
  ack_snooze_until?: string | null;
  has_diversion?: boolean;
  diversion_in_pcs?: number;
  diversion_in_mtr?: number;
  diversion_source_wo?: string | null;
  diversion_remarks?: string | null;
  diversion_date?: string | null;
}

export interface AgingKpiSummary {
  totalLots: number;
  criticalLots: number;
  warningLots: number;
  normalLots: number;
  criticalPcs: number;
  criticalMtr: number;
  criticalMt: number;
  totalWipPcs: number;
  totalWipMtr: number;
  totalWipMt: number;
  avgDays: number;
  topBottleneck: string;
}

export interface RawWipRow {
  work_order_id: string;
  work_order_no: string;
  customer_name?: string | null;
  route_id?: string;
  route_code?: string;
  route_name?: string;
  stage_id: string;
  stage_code: string;
  stage_name: string;
  sequence_no: number;
  current_wip: number;
  current_wip_pcs?: number;
  current_wip_mt?: number;
  size_od?: number | null;
  size_wt?: number | null;
  od?: number | null;
  wt?: number | null;
  l1?: number | null;
  l2?: number | null;
  grade?: string | null;
  created_at?: string;
  available_mt?: number | null;
  ready_mt?: number | null;
}

export interface RawProductionLog {
  work_order_id: string;
  stage_id: string;
  process_date: string;
  output_qty?: number;
  htc_ok?: number;
  created_at?: string;
  remarks?: string | null;
  stage_code?: string;
  process_stages?: { stage_code?: string } | null;
}

export interface RawQcInspection {
  work_order_id: string;
  inspection_date: string;
  vdi_ok_mtr?: number;
  vdi_salvage_pcs?: number;
  vdi_salvage_mtr?: number;
  inspected_pcs?: number;
  created_at?: string;
  [key: string]: any;
}

export interface RawRollingPlan {
  work_order_id: string;
  mh_od?: number | null;
  mh_wt?: number | null;
  planned_rolling_date?: string | null;
  rolling_date?: string | null;
  created_at?: string;
  status?: any;
}

export interface RawWorkOrder {
  id: string;
  work_order_no: string;
  customer_name?: string | null;
  grade?: string | null;
  size_od?: number | null;
  size_wt?: number | null;
  l1?: number | null;
  l2?: number | null;
  created_at?: string;
  target_date?: string | null;
}

export interface RawRouteStage {
  route_id: string;
  stage_id: string;
  sequence_no: number;
  stage_code?: string;
  process_stages?: {
    stage_code: string;
    stage_name?: string;
  };
}

export interface RawAcknowledgement {
  work_order_id: string;
  stage_code: string;
  acknowledged_by?: string | null;
  notes?: string | null;
  snooze_until?: string | null;
}

export interface RawRejectionDeclaration {
  work_order_id: string;
  work_center: string;
  rejected_pcs?: number | null;
  rejected_mtr?: number | null;
  qc_verified_pcs?: number | null;
  qc_verified_mtr?: number | null;
  ppc_approved_pcs?: number | null;
  ppc_approved_mtr?: number | null;
  status?: string | null;
}

export interface RawDiversionPlan {
  id?: string;
  source_wo_id?: string;
  source_work_order_id?: string;
  target_wo_id?: string;
  target_work_order_id?: string;
  diverted_qty?: number;
  diverted_pcs?: number;
  diverted_mtr?: number;
  work_center?: string;
  target_work_center?: string;
  source_work_center?: string;
  multiple?: number;
  process_route_id?: string;
  reason?: string | null;
  remarks?: string | null;
  diversion_date?: string | null;
  created_at?: string;
  status?: string | null;
  work_orders?: { work_order_no?: string };
}

export function parseDivStages(d: any) {
  const reasonStr = String(d.reason || d.remarks || "");
  const fromMatch = reasonStr.match(/\[FROM_STAGE:\s*([A-Z_]+)\]/i);
  const toMatch = reasonStr.match(/\[TO_STAGE:\s*([A-Z_]+)\]/i);
  const sourceStage = (fromMatch ? fromMatch[1] : (d.source_work_center || d.work_center || "ROLLING")).toUpperCase();
  const targetStage = (toMatch ? toMatch[1] : (d.target_work_center || d.work_center || "ROLLING")).toUpperCase();
  return { sourceStage, targetStage };
}

export const AGING_STAGES = [
  { code: 'ALL', name: 'All Work Centers' },
  { code: 'HOLLOW_HEAT_TREATMENT', name: 'Hollow Heat Treatment (HTC)' },
  { code: 'DRAW', name: 'Cold Draw Bench' },
  { code: 'HEAT_TREATMENT', name: 'Final Heat Treatment' },
  { code: 'BAND_SAW', name: 'Band Saw Cutting' },
  { code: 'VDI', name: 'Visual & Dimensional Inspection (VDI)' },
  { code: 'FINISHING', name: 'Finishing & Bundling' },
];

/**
 * Categorize dwell days into severity tiers:
 * > 5 days -> CRITICAL
 * 3 - 5 days -> WARNING
 * <= 2 days -> NORMAL
 */
export function calculateAgingSeverity(daysStuck: number): AgingSeverity {
  if (daysStuck > 5) return 'CRITICAL';
  if (daysStuck >= 3) return 'WARNING';
  return 'NORMAL';
}

/**
 * Calculates days stuck between effective date string (YYYY-MM-DD) and reference date.
 */
export function calculateDaysStuck(
  effectiveDateStr: string,
  asOfDate: Date | string = new Date()
): number {
  const asOf = typeof asOfDate === 'string' ? new Date(asOfDate) : asOfDate;
  const actDate = new Date(effectiveDateStr);
  if (isNaN(actDate.getTime()) || isNaN(asOf.getTime())) return 0;

  // Normalize to UTC calendar days
  const utcAsOf = Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate());
  const utcAct = Date.UTC(actDate.getUTCFullYear(), actDate.getUTCMonth(), actDate.getUTCDate());

  const diffMs = utcAsOf - utcAct;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

/**
 * Determines the true effective date when the material at this stage was last affected or arrived.
 */
export function determineStageEffectiveActivityDate(params: {
  workOrderId: string;
  routeId?: string;
  currentStageId: string;
  currentStageCode: string;
  currentStageSeq: number;
  routeStages: RawRouteStage[];
  productionLogs: RawProductionLog[];
  qcInspections: RawQcInspection[];
  rollingPlanDate?: string | null;
  workOrderCreatedDate?: string | null;
  diversions?: RawDiversionPlan[];
}): string {
  const {
    workOrderId,
    routeId,
    currentStageId,
    currentStageCode,
    currentStageSeq,
    routeStages,
    productionLogs,
    qcInspections,
    rollingPlanDate,
    workOrderCreatedDate,
    diversions = [],
  } = params;

  // 1. Check current stage activity
  let currentStageDate: string | null = null;
  if (currentStageCode === 'VDI') {
    const qc = qcInspections.find((q) => q.work_order_id === workOrderId);
    const prod = productionLogs.find(
      (p) => p.work_order_id === workOrderId && p.stage_id === currentStageId
    );
    const dates = [qc?.inspection_date?.slice(0, 10), prod?.process_date?.slice(0, 10)].filter(Boolean) as string[];
    if (dates.length > 0) {
      currentStageDate = dates.sort().reverse()[0];
    }
  } else {
    const prod = productionLogs.find(
      (p) => p.work_order_id === workOrderId && p.stage_id === currentStageId
    );
    if (prod?.process_date) {
      currentStageDate = prod.process_date.slice(0, 10);
    }
  }

  // 2. Check upstream stages activity
  let upstreamDate: string | null = null;
  const stagesInRoute = routeId ? routeStages.filter((rs) => rs.route_id === routeId) : routeStages;
  const upstreamStages = stagesInRoute.filter((s) => s.sequence_no < currentStageSeq);

  for (const u of upstreamStages) {
    const uCode = u.stage_code || u.process_stages?.stage_code;
    if (uCode === 'VDI') {
      const qc = qcInspections.find((q) => q.work_order_id === workOrderId);
      const qcDate = qc?.inspection_date?.slice(0, 10);
      if (qcDate && (!upstreamDate || qcDate > upstreamDate)) {
        upstreamDate = qcDate;
      }
    }
    const uLogs = productionLogs.filter(
      (p) => p.work_order_id === workOrderId && p.stage_id === u.stage_id
    );
    for (const ul of uLogs) {
      const pDate = ul.process_date?.slice(0, 10);
      if (pDate && (!upstreamDate || pDate > upstreamDate)) {
        upstreamDate = pDate;
      }
    }
  }

  // 3. Check diversion activity affecting this stage or upstream feeding stages
  let diversionDate: string | null = null;
  if (Array.isArray(diversions) && diversions.length > 0) {
    const upstreamStageCodes = new Set(
      upstreamStages.map((u) => (u.stage_code || u.process_stages?.stage_code || '').toUpperCase())
    );
    for (const d of diversions) {
      if (d.status && d.status !== 'APPROVED') continue;
      const targetWo = d.target_work_order_id || d.target_wo_id;
      const sourceWo = d.source_work_order_id || d.source_wo_id;
      const isTarget = targetWo === workOrderId;
      const isSource = sourceWo === workOrderId;
      if (!isTarget && !isSource) continue;

      const st = parseDivStages(d);
      const divStage = isTarget ? st.targetStage : st.sourceStage;

      // Diversion at the current work center or into an upstream feeding stage
      if (divStage === currentStageCode || (isTarget && upstreamStageCodes.has(divStage))) {
        const dDate = (d.diversion_date || d.created_at || '').slice(0, 10);
        if (dDate && (!diversionDate || dDate > diversionDate)) {
          diversionDate = dDate;
        }
      }
    }
  }

  // 4. Fallbacks: Rolling plan date or work order creation date
  const fallbackDate =
    rollingPlanDate?.slice(0, 10) ||
    workOrderCreatedDate?.slice(0, 10) ||
    new Date().toISOString().slice(0, 10);

  // 5. Determine effective date:
  // Diversion resets the aging clock if it is the latest event or introduced material
  const candidateDates = [currentStageDate, upstreamDate, diversionDate].filter(Boolean) as string[];
  if (candidateDates.length > 0) {
    return candidateDates.sort().reverse()[0];
  }
  return fallbackDate;
}

/**
 * Computes all aging report rows with domain metrics, sizes, grades, and severity.
 */
export function computeAgingReportRows(options: {
  wipRows: RawWipRow[];
  workOrders?: RawWorkOrder[];
  productionLogs?: RawProductionLog[];
  qcInspections?: RawQcInspection[];
  rollingPlans?: RawRollingPlan[];
  routeStages?: RawRouteStage[];
  acknowledgements?: RawAcknowledgement[];
  rejectionDeclarations?: RawRejectionDeclaration[];
  diversions?: RawDiversionPlan[];
  hollowBankInventory?: Array<{ source_wo_id?: string; source_stage_code?: string; pcs?: number; total_meters?: number }>;
  asOfDate?: Date | string;
}): AgingRow[] {
  const {
    wipRows,
    workOrders = [],
    productionLogs = [],
    qcInspections = [],
    rollingPlans = [],
    routeStages = [],
    acknowledgements = [],
    rejectionDeclarations = [],
    diversions = [],
    hollowBankInventory = [],
    asOfDate = new Date(),
  } = options;

  const todayStr = (typeof asOfDate === 'string' ? new Date(asOfDate) : asOfDate)
    .toISOString()
    .slice(0, 10);

  const woMap = new Map<string, RawWorkOrder>();
  workOrders.forEach((w) => woMap.set(w.id, w));

  const planMap = new Map<string, { mh_od?: number | null; mh_wt?: number | null; rolling_date?: string | null }>();
  rollingPlans.forEach((p) => {
    let mhOd = p.mh_od;
    let mhWt = p.mh_wt;
    try {
      const parsed = typeof p.status === 'string' ? JSON.parse(p.status) : p.status;
      if (!mhOd) mhOd = parsed?.mh_od || parsed?.cust_od || parsed?.sm?.cust_od || parsed?.sizing_mill?.cust_od || null;
      if (!mhWt) mhWt = parsed?.mh_wt || parsed?.cust_wt || parsed?.sm?.rolling_wt || parsed?.sm?.cust_wt || parsed?.sizing_mill?.rolling_wt || null;
    } catch {}
    planMap.set(p.work_order_id, {
      mh_od: mhOd ? Number(mhOd) : null,
      mh_wt: mhWt ? Number(mhWt) : null,
      rolling_date: p.planned_rolling_date || p.rolling_date || p.created_at?.slice(0, 10) || null,
    });
  });

  const ackMap = new Map<string, RawAcknowledgement>();
  acknowledgements.forEach((a) => {
    const key = `${a.work_order_id}_${a.stage_code}`;
    ackMap.set(key, a);
  });

  const rejMap = new Map<string, { pcs: number; mtr: number }>();
  (rejectionDeclarations || []).forEach((rd) => {
    if (rd.status === 'REJECTED_BY_QC' || rd.status === 'REJECTED_BY_PPC') return;
    const key = `${rd.work_order_id}_${(rd.work_center || '').toUpperCase()}`;
    const cur = rejMap.get(key) || { pcs: 0, mtr: 0 };
    const pcs = Number(rd.ppc_approved_pcs ?? rd.qc_verified_pcs ?? rd.rejected_pcs ?? 0);
    const mtr = Number(rd.ppc_approved_mtr ?? rd.qc_verified_mtr ?? rd.rejected_mtr ?? 0);
    rejMap.set(key, { pcs: cur.pcs + pcs, mtr: cur.mtr + mtr });
  });

  const approvedDiversions = (diversions || []).filter((d: any) => {
    if (d.status === 'APPROVED') return true;
    if (d.status === 'PENDING_PPC' || d.status === 'REJECTED_BY_PPC' || d.status === 'CANCELLED') return false;
    if ((d as any).ppc_approved_at) return true;
    return true;
  });


  const rows: AgingRow[] = wipRows
    .filter((r) => {
      if ((r.stage_code || '').toUpperCase() === 'ROLLING') return false;
      if (Number(r.current_wip || 0) <= 0) return false;
      if (isHollowBankOrder(r)) return false;
      const wo = woMap.get(r.work_order_id);
      if (isHollowBankOrder(wo)) return false;

      // Piece-based clearance for DRAW, PILGER, HEAT_TREATMENT, HOLLOW_HEAT_TREATMENT, BAND_SAW, and VDI
      const sc = (r.stage_code || '').toUpperCase();
      if ((sc === 'DRAW' || sc === 'PILGER' || sc === 'HEAT_TREATMENT' || sc === 'HOLLOW_HEAT_TREATMENT' || sc === 'BAND_SAW') && Array.isArray(productionLogs) && productionLogs.length > 0) {
        const stageCodeMap = new Map<string, string>();
        routeStages.forEach((rs) => {
          const code = rs.process_stages?.stage_code || rs.stage_code;
          if (rs.stage_id && code) stageCodeMap.set(rs.stage_id, code.toUpperCase());
        });
        wipRows.forEach((wr) => {
          if (wr.stage_id && wr.stage_code) stageCodeMap.set(wr.stage_id, wr.stage_code.toUpperCase());
        });

        const getLogStageCode = (l: RawProductionLog) =>
          (l.process_stages?.stage_code || l.stage_code || stageCodeMap.get(l.stage_id) || '').toUpperCase();

        const woLogs = productionLogs.filter((l) => l.work_order_id === r.work_order_id);
        const curLogs = woLogs.filter((l) => getLogStageCode(l) === sc || l.stage_id === r.stage_id);
        const curPcs = curLogs.reduce((acc, l) => {
          const { pcs } = extractPcsFromRemarks(l.remarks);
          return acc + (pcs || (r.l1 ? Math.round(Number(l.output_qty || 0) / Number(r.l1)) : 0));
        }, 0);

        const rollLogs = woLogs.filter((l) => {
          const code = getLogStageCode(l);
          return code === 'ROLLING' || code === 'HOT_ROLLING' || code === 'HTC';
        });
        const rollPcs = rollLogs.reduce((acc, l) => {
          const { pcs } = extractPcsFromRemarks(l.remarks);
          return acc + (pcs || 0);
        }, 0);

        const downPcsByStage = new Map<string, number>();
        woLogs.forEach((l) => {
          const lsc = getLogStageCode(l);
          const { pcs } = extractPcsFromRemarks(l.remarks);
          const { motherPcs } = extractBandSawCutsFromRemarks(l.remarks);
          const p = motherPcs || pcs || 0;
          downPcsByStage.set(lsc, (downPcsByStage.get(lsc) || 0) + p);
        });

        const bsMotherPcs = downPcsByStage.get('BAND_SAW') || 0;
        const finPcs = downPcsByStage.get('FINISHING') || 0;
        const woQcList = (qcInspections || []).filter((q) => q.work_order_id === r.work_order_id);
        const qcPcs = woQcList.reduce((sum, q) => sum + Number(q.inspected_pcs || 0), 0);

        const targetRefPcs = rollPcs > 0 ? rollPcs : curPcs;

        // Sum rejections and diversions out for this work order to account for scrapped/diverted material
        const totalWoRejPcs = (rejectionDeclarations || [])
          .filter((rd: any) => rd.work_order_id === r.work_order_id && rd.status !== 'REJECTED_BY_QC' && rd.status !== 'REJECTED_BY_PPC')
          .reduce((sum: number, rd: any) => sum + Number(rd.ppc_approved_pcs ?? rd.qc_verified_pcs ?? rd.rejected_pcs ?? 0), 0);

        const totalWoDivOutPcs = approvedDiversions
          .filter((d: any) => (d.source_work_order_id || d.source_wo_id) === r.work_order_id)
          .reduce((sum: number, d: any) => {
            const motherMatch = typeof d.reason === 'string' ? d.reason.match(/(\d+)\s+mother pipes/i) : null;
            if (motherMatch) return sum + Number(motherMatch[1]);
            if (d.diverted_pcs != null && Number(d.diverted_pcs) > 0) return sum + Number(d.diverted_pcs);
            const pcsMatch = typeof d.reason === 'string' ? d.reason.match(/\[PCS:\s*([0-9]+)\]/i) : null;
            if (pcsMatch) return sum + Number(pcsMatch[1]);
            return sum;
          }, 0);

        if (targetRefPcs > 0) {
          if (sc === 'DRAW' || sc === 'PILGER' || sc === 'HOLLOW_HEAT_TREATMENT' || sc === 'HEAT_TREATMENT') {
            const htPcs = downPcsByStage.get('HEAT_TREATMENT') || 0;
            if (sc !== 'HEAT_TREATMENT' && (htPcs >= targetRefPcs || (htPcs + totalWoRejPcs + totalWoDivOutPcs) >= targetRefPcs)) return false;
            if (bsMotherPcs >= targetRefPcs || (bsMotherPcs + totalWoRejPcs + totalWoDivOutPcs) >= targetRefPcs) return false;
            if (qcPcs >= targetRefPcs || finPcs >= targetRefPcs) return false;
          }
          if (sc === 'BAND_SAW') {
            if (qcPcs >= targetRefPcs || (qcPcs + totalWoDivOutPcs) >= targetRefPcs) return false;
            if (finPcs >= targetRefPcs || (finPcs + totalWoRejPcs + totalWoDivOutPcs) >= targetRefPcs) return false;
          }
        }
      }

      if (sc === 'VDI') {
        const woQcList = (qcInspections || []).filter((q) => q.work_order_id === r.work_order_id);
        const totalQcInspected = woQcList.reduce((sum, q) => sum + Number(q.inspected_pcs || 0), 0);
        const totalQcSalvage = woQcList.reduce((sum, q) => sum + Number(q.vdi_salvage_pcs || 0), 0);
        if (totalQcInspected > 0) {
          const bsLogs = (productionLogs || []).filter((l) => l.work_order_id === r.work_order_id && (l.process_stages?.stage_code || l.stage_code) === 'BAND_SAW');
          const totalCutPcs = bsLogs.reduce((sum, l) => {
            const pcsMatch = l.remarks ? l.remarks.match(/\[PCS:\s*(\d+)\]/i) : null;
            return sum + (pcsMatch ? parseInt(pcsMatch[1], 10) : 0);
          }, 0);
          if (totalCutPcs > 0 && totalCutPcs <= totalQcInspected) {
            const salvageDivOutPcs = approvedDiversions
              .filter((d: any) => (d.source_work_order_id || d.source_wo_id) === r.work_order_id)
              .reduce((sum: number, d: any) => {
                const motherMatch = typeof d.reason === 'string' ? d.reason.match(/(\d+)\s+mother pipes/i) : null;
                if (motherMatch) return sum + Number(motherMatch[1]);
                if (d.diverted_pcs != null && Number(d.diverted_pcs) > 0) return sum + Number(d.diverted_pcs);
                const pcsMatch = typeof d.reason === 'string' ? d.reason.match(/\[PCS:\s*([0-9]+)\]/i) : null;
                if (pcsMatch) return sum + Number(pcsMatch[1]);
                return sum;
              }, 0);
            if (salvageDivOutPcs >= totalQcSalvage || totalQcSalvage <= 0) {
              return false;
            }
          }
        }
      }

      return true;
    })
    .map((r) => {
      const wo = woMap.get(r.work_order_id);
      const plan = planMap.get(r.work_order_id);

      const isHfsBandSaw = r.stage_code === 'BAND_SAW' && (!(r.route_code || '').toUpperCase().includes('CDS'));
      const isMhStage = r.stage_code === 'HOLLOW_HEAT_TREATMENT' || r.stage_code === 'DRAW' || isHfsBandSaw;

      const od = Number(
        isMhStage
          ? plan?.mh_od || r.size_od || wo?.size_od || r.od || 0
          : r.size_od || wo?.size_od || r.od || 0
      );
      const wt = Number(
        isMhStage
          ? plan?.mh_wt || r.size_wt || wo?.size_wt || r.wt || 0
          : r.size_wt || wo?.size_wt || r.wt || 0
      );

      const grade = wo?.grade || r.grade || 'ASTM A106 Gr B';
      const sc = (r.stage_code || '').toUpperCase();
      const rejKey = `${r.work_order_id}_${sc}`;
      const rejDecl = rejMap.get(rejKey) || { pcs: 0, mtr: 0 };

      // Deduct outbound diversions from this stage (Rule 2 Option B: only approved diversions alter active WIP)
      const stageDivOutMtr = approvedDiversions
        .filter((d: any) => {
          const srcId = d.source_work_order_id || d.source_wo_id;
          if (srcId !== r.work_order_id) return false;
          const { sourceStage } = parseDivStages(d);
          if (
            sourceStage === sc ||
            (sc === 'VDI_SALVAGE' && sourceStage === 'VDI') ||
            (sc === 'VDI' && sourceStage === 'VDI_SALVAGE')
          ) return true;
          if (sc === 'VDI' && (sourceStage === 'FINISHING' || d.work_center === 'FINISHING') && (d.reason || '').toLowerCase().includes('hollow bank')) {
            return true;
          }
          return false;
        })
        .reduce((sum, d: any) => sum + Number(d.diverted_mtr ?? d.diverted_qty ?? 0), 0);

      const stageDivOutPcs = approvedDiversions
        .filter((d: any) => {
          const srcId = d.source_work_order_id || d.source_wo_id;
          if (srcId !== r.work_order_id) return false;
          const { sourceStage } = parseDivStages(d);
          if (
            sourceStage === sc ||
            (sc === 'VDI_SALVAGE' && sourceStage === 'VDI') ||
            (sc === 'VDI' && sourceStage === 'VDI_SALVAGE')
          ) return true;
          if (sc === 'VDI' && (sourceStage === 'FINISHING' || d.work_center === 'FINISHING') && (d.reason || '').toLowerCase().includes('hollow bank')) {
            return true;
          }
          return false;
        })
        .reduce((sum, d: any) => {
          const motherMatch = typeof d.reason === 'string' ? d.reason.match(/(\d+)\s+mother pipes/i) : null;
          if (motherMatch) return sum + Number(motherMatch[1]);
          if (d.diverted_pcs != null && Number(d.diverted_pcs) > 0) return sum + Number(d.diverted_pcs);
          const pcsMatch = typeof d.reason === 'string' ? d.reason.match(/\[PCS:\s*([0-9]+)\]/i) : null;
          if (pcsMatch) return sum + Number(pcsMatch[1]);
          const dQty = Number(d.diverted_mtr ?? d.diverted_qty ?? 0);
          const l1 = Number(r.l1 ?? wo?.l1) || 0;
          const l2 = Number(r.l2 ?? wo?.l2) || 0;
          const avgLen = (l1 > 0 && l2 > 0) ? (l1 + l2) / 2 : (l1 || l2 || 6.0);
          return sum + (avgLen > 0 ? Math.round(dQty / avgLen) : 0);
        }, 0);

      let currentWipMtr = Math.max(0, (Number(r.current_wip) || 0) - rejDecl.mtr - stageDivOutMtr);
      let currentWipPcs = Math.max(0, (Number(r.current_wip_pcs) || 0) - rejDecl.pcs - stageDivOutPcs);
      if (currentWipPcs <= 0) {
        if (
          (stageDivOutPcs > 0 && stageDivOutPcs >= (Number(r.current_wip_pcs) || 0)) ||
          (rejDecl.pcs > 0 && rejDecl.pcs >= (Number(r.current_wip_pcs) || 0))
        ) {
          currentWipMtr = 0;
          currentWipPcs = 0;
        } else if (currentWipMtr > 0) {
          const l1 = Number(r.l1 ?? wo?.l1) || 0;
          const l2 = Number(r.l2 ?? wo?.l2) || 0;
          const avgLen = (l1 > 0 && l2 > 0) ? (l1 + l2) / 2 : (l1 || l2 || 6.0);
          if (avgLen > 0) {
            currentWipPcs = Math.max(1, Math.round(currentWipMtr / avgLen));
          }
        }
      }
      if (currentWipMtr <= 0) {
        currentWipPcs = 0;
      }

      // Conserved mass formula (OD - WT) * WT * 0.0246615 * 0.001 * meters
      const computedMt = Math.max(od - wt, 0) * Math.max(wt, 0) * 0.0246615 * 0.001 * currentWipMtr;
      const availMt = isMhStage
        ? Number(computedMt.toFixed(3))
        : Number(r.current_wip_mt || r.available_mt || 0) > 0
        ? Number(r.current_wip_mt || r.available_mt)
        : Number(computedMt.toFixed(3));

      // Calculate effective activity date (reset after diversion if latest)
      const effDate = determineStageEffectiveActivityDate({
        workOrderId: r.work_order_id,
        routeId: r.route_id,
        currentStageId: r.stage_id,
        currentStageCode: r.stage_code,
        currentStageSeq: Number(r.sequence_no) || 0,
        routeStages,
        productionLogs,
        qcInspections,
        rollingPlanDate: plan?.rolling_date,
        workOrderCreatedDate: wo?.created_at || r.created_at,
        diversions: approvedDiversions,
      });

      const daysStuck = calculateDaysStuck(effDate, asOfDate);
      const severity = calculateAgingSeverity(daysStuck);

      // Check acknowledgement
      const ackKey = `${r.work_order_id}_${r.stage_code}`;
      const ack = ackMap.get(ackKey);
      const isAcked = Boolean(
        ack && (!ack.snooze_until || ack.snooze_until >= todayStr)
      );

      const isSalvageStage = (r.stage_code || '').toUpperCase() === 'VDI_SALVAGE' || (r.stage_code || '').toUpperCase() === 'VDI';
      const woQc = isSalvageStage ? qcInspections.filter((q) => q.work_order_id === r.work_order_id) : [];
      const rawVdiSalvagePcs = isSalvageStage ? woQc.reduce((sum, q) => sum + Number(q.vdi_salvage_pcs || 0), 0) : 0;
      const rawVdiSalvageMtr = isSalvageStage ? woQc.reduce((sum, q) => sum + Number(q.vdi_salvage_mtr || 0), 0) : 0;

      // Outbound VDI salvage diversions (including transfers to Hollow Bank)
      const vdiSalvageDivOutMtr = (approvedDiversions || [])
        .filter((d: any) => {
          const srcId = d.source_work_order_id || d.source_wo_id;
          if (srcId !== r.work_order_id) return false;
          if (d.target_wo_id === HOLLOW_BANK_WO_ID || (d.reason || '').toLowerCase().includes('hollow bank')) return true;
          const { sourceStage } = parseDivStages(d);
          return sourceStage === 'VDI' || sourceStage === 'VDI_SALVAGE';
        })
        .reduce((sum, d: any) => sum + Number(d.diverted_mtr ?? d.diverted_qty ?? 0), 0);

      const vdiSalvageDivOutPcs = (approvedDiversions || [])
        .filter((d: any) => {
          const srcId = d.source_work_order_id || d.source_wo_id;
          if (srcId !== r.work_order_id) return false;
          if (d.target_wo_id === HOLLOW_BANK_WO_ID || (d.reason || '').toLowerCase().includes('hollow bank')) return true;
          const { sourceStage } = parseDivStages(d);
          return sourceStage === 'VDI' || sourceStage === 'VDI_SALVAGE';
        })
        .reduce((sum, d: any) => {
          const motherMatch = typeof d.reason === 'string' ? d.reason.match(/(\d+)\s+mother pipes/i) : null;
          if (motherMatch) return sum + Number(motherMatch[1]);
          if (d.diverted_pcs != null && Number(d.diverted_pcs) > 0) return sum + Number(d.diverted_pcs);
          const pcsMatch = typeof d.reason === 'string' ? d.reason.match(/\[PCS:\s*([0-9]+)\]/i) : null;
          if (pcsMatch) return sum + Number(pcsMatch[1]);
          const dQty = Number(d.diverted_mtr ?? d.diverted_qty ?? 0);
          const l1 = Number(r.l1 ?? wo?.l1) || 0;
          const l2 = Number(r.l2 ?? wo?.l2) || 0;
          const avgLen = (l1 > 0 && l2 > 0) ? (l1 + l2) / 2 : (l1 || l2 || 6.0);
          return sum + (avgLen > 0 ? Math.round(dQty / avgLen) : 0);
        }, 0);

      // Direct Hollow Bank inventory deduction (avoiding double count with diversions)
      const hbVdiEntries = (hollowBankInventory || []).filter(
        (hb: any) => hb.source_wo_id === r.work_order_id && (!hb.source_stage_code || hb.source_stage_code === 'VDI' || hb.source_stage_code === 'VDI_SALVAGE')
      );
      const directHbMtr = hbVdiEntries.reduce((sum: number, hb: any) => sum + Number(hb.total_meters || 0), 0);
      const directHbPcs = hbVdiEntries.reduce((sum: number, hb: any) => sum + Number(hb.pcs || 0), 0);

      const divToHbMtr = (approvedDiversions || [])
        .filter((d: any) => (d.source_work_order_id || d.source_wo_id) === r.work_order_id && (d.target_wo_id === HOLLOW_BANK_WO_ID || (d.reason || '').toLowerCase().includes('hollow bank')))
        .reduce((sum: number, d: any) => sum + Number(d.diverted_mtr ?? d.diverted_qty ?? 0), 0);
      const divToHbPcs = (approvedDiversions || [])
        .filter((d: any) => (d.source_work_order_id || d.source_wo_id) === r.work_order_id && (d.target_wo_id === HOLLOW_BANK_WO_ID || (d.reason || '').toLowerCase().includes('hollow bank')))
        .reduce((sum: number, d: any) => {
          const pcsMatch = typeof d.reason === 'string' ? d.reason.match(/\[PCS:\s*([0-9]+)\]/i) : null;
          if (pcsMatch) return sum + Number(pcsMatch[1]);
          const dQty = Number(d.diverted_mtr ?? d.diverted_qty ?? 0);
          const l1 = Number(r.l1 ?? wo?.l1) || 0;
          const l2 = Number(r.l2 ?? wo?.l2) || 0;
          const avgLen = (l1 > 0 && l2 > 0) ? (l1 + l2) / 2 : (l1 || l2 || 6.0);
          return sum + (avgLen > 0 ? Math.round(dQty / avgLen) : 0);
        }, 0);

      const extraHbMtr = Math.max(0, directHbMtr - divToHbMtr);
      const extraHbPcs = Math.max(0, directHbPcs - divToHbPcs);

      const effVdiSalvageDivOutMtr = vdiSalvageDivOutMtr + extraHbMtr;
      const effVdiSalvageDivOutPcs = vdiSalvageDivOutPcs + extraHbPcs;

      let vdiSalvagePcs = Math.max(0, rawVdiSalvagePcs - effVdiSalvageDivOutPcs);
      let vdiSalvageMtr = Math.max(0, Number((rawVdiSalvageMtr - effVdiSalvageDivOutMtr).toFixed(3)));
      if (vdiSalvagePcs <= 0 || vdiSalvageMtr <= 0) {
        vdiSalvagePcs = 0;
        vdiSalvageMtr = 0;
      }
      if (sc === 'VDI_SALVAGE' && (vdiSalvagePcs <= 0 || vdiSalvageMtr <= 0)) {
        currentWipMtr = 0;
        currentWipPcs = 0;
      }

      // Diversion details
      const divMatching = approvedDiversions.filter((d: any) => {
        const targetWo = d.target_work_order_id || d.target_wo_id;
        return targetWo === r.work_order_id && parseDivStages(d).targetStage === sc;
      });
      const anyWoDiv = approvedDiversions.filter((d: any) => {
        const targetWo = d.target_work_order_id || d.target_wo_id;
        return targetWo === r.work_order_id;
      });
      const hasDiv = divMatching.length > 0 || anyWoDiv.length > 0;
      const targetDivs = divMatching.length > 0 ? divMatching : anyWoDiv;
      const divMtr = targetDivs.reduce((sum, d: any) => sum + Number(d.diverted_mtr ?? d.diverted_qty ?? 0), 0);
      const divPcs = targetDivs.reduce((sum, d: any) => sum + Number(d.diverted_pcs ?? 0), 0) || divMatching.reduce((sum, d: any) => {
        const l1 = Number(r.l1 ?? wo?.l1) || 6.0;
        return sum + (l1 > 0 ? Math.round(Number(d.diverted_qty ?? d.diverted_mtr ?? 0) / l1) : 0);
      }, 0) || Number((r as any).diversion_in_pcs || 0);
      const divSourceWo = Array.from(
        new Set(
          targetDivs
            .map((d: any) => {
              const srcId = d.source_work_order_id || d.source_wo_id;
              return d.work_orders?.work_order_no || woMap.get(srcId)?.work_order_no || srcId?.slice(0, 8);
            })
            .filter(Boolean)
        )
      ).join(', ') || (r as any).diversion_source_wo || null;
      const latestDivDate = targetDivs
        .map((d) => (d.diversion_date || d.created_at || '').slice(0, 10))
        .filter(Boolean)
        .sort()
        .reverse()[0] || null;

      return {
        work_order_id: r.work_order_id,
        work_order_no: r.work_order_no,
        customer_name: r.customer_name || wo?.customer_name || 'Generic Customer',
        grade,
        od,
        wt,
        l1: r.l1 ?? wo?.l1 ?? null,
        l2: r.l2 ?? wo?.l2 ?? null,
        stage_id: r.stage_id,
        stage_code: r.stage_code,
        stage_name: r.stage_name || r.stage_code,
        sequence_no: Number(r.sequence_no) || 0,
        current_wip: currentWipMtr,
        current_wip_pcs: currentWipPcs,
        available_mt: availMt,
        vdi_salvage_pcs: vdiSalvagePcs,
        vdi_salvage_mtr: vdiSalvageMtr,
        last_activity_date: effDate,
        days_stuck: daysStuck,
        severity,
        is_acknowledged: isAcked,
        acknowledged_by: ack?.acknowledged_by || null,
        ack_notes: ack?.notes || null,
        ack_snooze_until: ack?.snooze_until || null,
        has_diversion: hasDiv && (divMtr > 0 || divPcs > 0 || Boolean((r as any).has_diversion)),
        diversion_in_pcs: divPcs,
        diversion_in_mtr: Number(divMtr.toFixed(2)) || Number((r as any).diversion_in_mtr || 0),
        diversion_source_wo: divSourceWo,
        diversion_remarks: targetDivs.map((d: any) => d.reason || d.remarks).filter(Boolean).join('; ') || (r as any).diversion_remarks || null,
        diversion_date: latestDivDate || (r as any).diversion_date || null,
      };
    });

  // Filter active lots and sort descending by days stuck
  return rows
    .filter((r) => r.current_wip_pcs > 0 && r.current_wip > 0)
    .sort((a, b) => b.days_stuck - a.days_stuck);
}

/**
 * Computes executive KPI summary metrics for the Aging Report.
 */
export function computeAgingKpis(rows: AgingRow[]): AgingKpiSummary {
  const activeRows = rows.filter(
    (r) => !isHollowBankOrder(r) && (r.current_wip_pcs || 0) > 0 && (r.current_wip || 0) > 0
  );
  const totalLots = activeRows.length;
  const criticalLots = activeRows.filter((r) => r.severity === 'CRITICAL').length;
  const warningLots = activeRows.filter((r) => r.severity === 'WARNING').length;
  const normalLots = activeRows.filter((r) => r.severity === 'NORMAL').length;

  const criticalPcs = activeRows
    .filter((r) => r.severity === 'CRITICAL')
    .reduce((sum, r) => sum + (r.current_wip_pcs || 0), 0);
  const criticalMtr = activeRows
    .filter((r) => r.severity === 'CRITICAL')
    .reduce((sum, r) => sum + r.current_wip, 0);
  const criticalMt = activeRows
    .filter((r) => r.severity === 'CRITICAL')
    .reduce((sum, r) => sum + r.available_mt, 0);

  const totalWipPcs = activeRows.reduce((sum, r) => sum + (r.current_wip_pcs || 0), 0);
  const totalWipMtr = activeRows.reduce((sum, r) => sum + r.current_wip, 0);
  const totalWipMt = activeRows.reduce((sum, r) => sum + r.available_mt, 0);

  const avgDays = totalLots > 0 ? activeRows.reduce((sum, r) => sum + r.days_stuck, 0) / totalLots : 0;

  // Work center with highest critical (or warning) count
  const stageCritCounts: Record<string, number> = {};
  activeRows
    .filter((r) => r.severity === 'CRITICAL')
    .forEach((r) => {
      stageCritCounts[r.stage_name] = (stageCritCounts[r.stage_name] || 0) + 1;
    });

  let topStage = 'None';
  let topCount = 0;
  Object.entries(stageCritCounts).forEach(([stg, cnt]) => {
    if (cnt > topCount) {
      topCount = cnt;
      topStage = stg;
    }
  });

  if (topCount === 0) {
    // Check warning counts
    const stageWarnCounts: Record<string, number> = {};
    activeRows
      .filter((r) => r.severity === 'WARNING')
      .forEach((r) => {
        stageWarnCounts[r.stage_name] = (stageWarnCounts[r.stage_name] || 0) + 1;
      });
    Object.entries(stageWarnCounts).forEach(([stg, cnt]) => {
      if (cnt > topCount) {
        topCount = cnt;
        topStage = stg;
      }
    });
    if (topCount > 0) {
      return {
        totalLots,
        criticalLots,
        warningLots,
        normalLots,
        criticalPcs,
        criticalMtr,
        criticalMt,
        totalWipPcs,
        totalWipMtr,
        totalWipMt,
        avgDays,
        topBottleneck: `${topStage} (${topCount} attention lots)`,
      };
    }
    return {
      totalLots,
      criticalLots,
      warningLots,
      normalLots,
      criticalPcs,
      criticalMtr,
      criticalMt,
      totalWipPcs,
      totalWipMtr,
      totalWipMt,
      avgDays,
      topBottleneck: 'None (Fluid)',
    };
  }

  return {
    totalLots,
    criticalLots,
    warningLots,
    normalLots,
    criticalPcs,
    criticalMtr,
    criticalMt,
    totalWipPcs,
    totalWipMtr,
    totalWipMt,
    avgDays,
    topBottleneck: `${topStage} (${topCount} lots)`,
  };
}

/**
 * Filters aging rows by selected stage, severity tier, and text query.
 * Strictly eliminates any rows with zero pieces or zero WIP.
 */
export function filterAgingRows(
  rows: AgingRow[],
  filters: {
    selectedStage?: string;
    selectedSeverity?: string;
    search?: string;
  }
): AgingRow[] {
  const { selectedStage = 'ALL', selectedSeverity = 'ALL', search = '' } = filters;
  const q = search.trim().toLowerCase();

  return rows.filter((r) => {
    if (isHollowBankOrder(r)) {
      return false;
    }
    // Strict domain rule: Aging Report displays active physical WIP lots only; eliminate 0-piece and 0-WIP rows
    if (Number(r.current_wip_pcs || 0) <= 0 || Number(r.current_wip || 0) <= 0) {
      return false;
    }
    if (selectedStage !== 'ALL') {
      const rsc = (r.stage_code || '').toUpperCase();
      const sel = selectedStage.toUpperCase();
      if (sel === 'VDI') {
        if (rsc !== 'VDI' && rsc !== 'VDI_SALVAGE') return false;
      } else if (rsc !== sel) {
        return false;
      }
    }
    if (selectedSeverity !== 'ALL' && r.severity !== selectedSeverity) {
      return false;
    }
    if (q) {
      const matchesWo = r.work_order_no.toLowerCase().includes(q);
      const matchesCust = (r.customer_name || '').toLowerCase().includes(q);
      const matchesGrade = (r.grade || '').toLowerCase().includes(q);
      const matchesStage = (r.stage_name || '').toLowerCase().includes(q);
      const matchesSize = `${r.od}x${r.wt}`.toLowerCase().includes(q) ||
        `${r.od} x ${r.wt}`.toLowerCase().includes(q) ||
        String(r.od).includes(q) ||
        String(r.wt).includes(q);

      if (!matchesWo && !matchesCust && !matchesGrade && !matchesStage && !matchesSize) {
        return false;
      }
    }
    return true;
  });
}

/**
 * Normalizes raw rows returned by vw_wip_aging (handling differences across migrations,
 * such as aging_status vs severity and effective_reference_date vs last_activity_date).
 */
export function normalizeAgingRow(
  raw: any,
  localAcks: RawAcknowledgement[] = [],
  todayStr: string = new Date().toISOString().slice(0, 10),
  rejectionDeclarations: RawRejectionDeclaration[] = [],
  diversions: RawDiversionPlan[] = [],
  hollowBankInventory: Array<{ source_wo_id?: string; source_stage_code?: string; pcs?: number; total_meters?: number }> = []
): AgingRow {
  let daysStuck = Number(raw.days_stuck) || 0;

  let lastActivityDate =
    raw.last_activity_date ||
    raw.effective_reference_date ||
    raw.stage_last_log_date ||
    raw.upstream_last_log_date ||
    raw.rolling_plan_date ||
    raw.wo_created_date ||
    '—';

  // Check diversions affecting this work order and stage
  const sc = String(raw.stage_code || '').toUpperCase();
  const divMatching = diversions.filter((d: any) => {
    const targetWo = d.target_work_order_id || d.target_wo_id;
    return targetWo === raw.work_order_id && parseDivStages(d).targetStage === sc;
  });
  const anyWoDiv = diversions.filter((d: any) => {
    const targetWo = d.target_work_order_id || d.target_wo_id;
    return targetWo === raw.work_order_id;
  });
  const targetDivs = divMatching.length > 0 ? divMatching : anyWoDiv;
  const hasDiv = Boolean(raw.has_diversion) || targetDivs.length > 0;
  const latestDivDate = targetDivs
    .map((d: any) => (d.diversion_date || d.created_at || '').slice(0, 10))
    .filter(Boolean)
    .sort()
    .reverse()[0] || null;

  // Reset aging date if diversion is more recent or material arrived via diversion
  if (latestDivDate && (lastActivityDate === '—' || latestDivDate > lastActivityDate)) {
    lastActivityDate = latestDivDate;
    daysStuck = calculateDaysStuck(latestDivDate, todayStr);
  }

  // Strict domain rule: > 5 days is CRITICAL, 3-5 days is WARNING, <= 2 days is NORMAL
  const severity: AgingSeverity = calculateAgingSeverity(daysStuck);

  const matchLocal = localAcks.find(
    (a) => a.work_order_id === raw.work_order_id && a.stage_code === raw.stage_code
  );

  const isLocalAckActive = Boolean(
    matchLocal && (!matchLocal.snooze_until || matchLocal.snooze_until >= todayStr)
  );

  const isDbAckActive = Boolean(
    raw.is_acknowledged && (!raw.ack_snooze_until || raw.ack_snooze_until >= todayStr)
  );

  const isAcknowledged = isLocalAckActive || isDbAckActive;

  const matchingRejs = (rejectionDeclarations || []).filter(
    (rd) =>
      rd.work_order_id === raw.work_order_id &&
      (rd.work_center || '').toUpperCase() === sc &&
      rd.status !== 'REJECTED_BY_QC' &&
      rd.status !== 'REJECTED_BY_PPC'
  );
  const rejDeclPcs = matchingRejs.reduce(
    (sum, rd) => sum + Number(rd.ppc_approved_pcs ?? rd.qc_verified_pcs ?? rd.rejected_pcs ?? 0),
    0
  );
  const rejDeclMtr = matchingRejs.reduce(
    (sum, rd) => sum + Number(rd.ppc_approved_mtr ?? rd.qc_verified_mtr ?? rd.rejected_mtr ?? 0),
    0
  );

  const rawWipMtr = Number(raw.current_wip) || 0;
  let rawWipPcs = Number(raw.current_wip_pcs) || 0;
  if (rawWipPcs <= 0 && rawWipMtr > 0) {
    const l1 = Number(raw.l1) || 0;
    const l2 = Number(raw.l2) || 0;
    const avgLen = (l1 > 0 && l2 > 0) ? (l1 + l2) / 2 : (l1 || l2 || 6.0);
    if (avgLen > 0) {
      rawWipPcs = Math.max(1, Math.round(rawWipMtr / avgLen));
    }
  }

  const approvedDiversions = (diversions || []).filter((d: any) => !d.status || d.status === 'APPROVED');

  // Deduct outbound diversions from this stage (only approved diversions alter active WIP)
  const stageDivOutMtr = approvedDiversions
    .filter((d: any) => {
      const srcId = d.source_work_order_id || d.source_wo_id;
      if (srcId !== raw.work_order_id) return false;
      const { sourceStage } = parseDivStages(d);
      return (
        sourceStage === sc ||
        (sc === 'VDI_SALVAGE' && sourceStage === 'VDI') ||
        (sc === 'VDI' && sourceStage === 'VDI_SALVAGE')
      );
    })
    .reduce((sum, d: any) => sum + Number(d.diverted_mtr ?? d.diverted_qty ?? 0), 0);

  const stageDivOutPcs = approvedDiversions
    .filter((d: any) => {
      const srcId = d.source_work_order_id || d.source_wo_id;
      if (srcId !== raw.work_order_id) return false;
      const { sourceStage } = parseDivStages(d);
      return (
        sourceStage === sc ||
        (sc === 'VDI_SALVAGE' && sourceStage === 'VDI') ||
        (sc === 'VDI' && sourceStage === 'VDI_SALVAGE')
      );
    })
    .reduce((sum, d: any) => {
      const motherMatch = typeof d.reason === 'string' ? d.reason.match(/(\d+)\s+mother pipes/i) : null;
      if (motherMatch) return sum + Number(motherMatch[1]);
      if (d.diverted_pcs != null && Number(d.diverted_pcs) > 0) return sum + Number(d.diverted_pcs);
      const pcsMatch = typeof d.reason === 'string' ? d.reason.match(/\[PCS:\s*([0-9]+)\]/i) : null;
      if (pcsMatch) return sum + Number(pcsMatch[1]);
      const dQty = Number(d.diverted_mtr ?? d.diverted_qty ?? 0);
      const l1 = Number(raw.l1) || 0;
      const l2 = Number(raw.l2) || 0;
      const avgLen = (l1 > 0 && l2 > 0) ? (l1 + l2) / 2 : (l1 || l2 || 6.0);
      return sum + (avgLen > 0 ? Math.round(dQty / avgLen) : 0);
    }, 0);

  let currentWip = Math.max(0, rawWipMtr - rejDeclMtr - stageDivOutMtr);
  let currentWipPcs = Math.max(0, rawWipPcs - rejDeclPcs - stageDivOutPcs);
  if (currentWipPcs <= 0) {
    if (
      (stageDivOutPcs > 0 && stageDivOutPcs >= rawWipPcs) ||
      (rejDeclPcs > 0 && rejDeclPcs >= rawWipPcs)
    ) {
      currentWip = 0;
    }
  }
  if (currentWip <= 0) {
    currentWipPcs = 0;
  }

  const isSalvage = String(raw.stage_code || '').toUpperCase() === 'VDI_SALVAGE' ||
    String(raw.stage_name || '').toUpperCase().includes('SALVAGE');
  const isVdi = String(raw.stage_code || '').toUpperCase() === 'VDI';

  // Deduct VDI salvage diversions (including transfers to Hollow Bank)
  const vdiSalvageDivOutMtr = (diversions || [])
    .filter((d: any) => {
      const srcId = d.source_work_order_id || d.source_wo_id;
      if (srcId !== raw.work_order_id) return false;
      if (d.target_wo_id === HOLLOW_BANK_WO_ID || (d.reason || '').toLowerCase().includes('hollow bank')) return true;
      const { sourceStage } = parseDivStages(d);
      return sourceStage === 'VDI' || sourceStage === 'VDI_SALVAGE';
    })
    .reduce((sum, d: any) => sum + Number(d.diverted_mtr ?? d.diverted_qty ?? 0), 0);

  const vdiSalvageDivOutPcs = (diversions || [])
    .filter((d: any) => {
      const srcId = d.source_work_order_id || d.source_wo_id;
      if (srcId !== raw.work_order_id) return false;
      if (d.target_wo_id === HOLLOW_BANK_WO_ID || (d.reason || '').toLowerCase().includes('hollow bank')) return true;
      const { sourceStage } = parseDivStages(d);
      return sourceStage === 'VDI' || sourceStage === 'VDI_SALVAGE';
    })
    .reduce((sum, d: any) => {
      const motherMatch = typeof d.reason === 'string' ? d.reason.match(/(\d+)\s+mother pipes/i) : null;
      if (motherMatch) return sum + Number(motherMatch[1]);
      if (d.diverted_pcs != null && Number(d.diverted_pcs) > 0) return sum + Number(d.diverted_pcs);
      const pcsMatch = typeof d.reason === 'string' ? d.reason.match(/\[PCS:\s*([0-9]+)\]/i) : null;
      if (pcsMatch) return sum + Number(pcsMatch[1]);
      const dQty = Number(d.diverted_mtr ?? d.diverted_qty ?? 0);
      const l1 = Number(raw.l1) || 0;
      const l2 = Number(raw.l2) || 0;
      const avgLen = (l1 > 0 && l2 > 0) ? (l1 + l2) / 2 : (l1 || l2 || 6.0);
      return sum + (avgLen > 0 ? Math.round(dQty / avgLen) : 0);
    }, 0);

  // Direct Hollow Bank inventory deduction (avoiding double count with diversions)
  const hbVdiEntries = (hollowBankInventory || []).filter(
    (hb: any) => hb.source_wo_id === raw.work_order_id && (!hb.source_stage_code || hb.source_stage_code === 'VDI' || hb.source_stage_code === 'VDI_SALVAGE')
  );
  const directHbMtr = hbVdiEntries.reduce((sum: number, hb: any) => sum + Number(hb.total_meters || 0), 0);
  const directHbPcs = hbVdiEntries.reduce((sum: number, hb: any) => sum + Number(hb.pcs || 0), 0);

  const divToHbMtr = (diversions || [])
    .filter((d: any) => (d.source_work_order_id || d.source_wo_id) === raw.work_order_id && (d.target_wo_id === HOLLOW_BANK_WO_ID || (d.reason || '').toLowerCase().includes('hollow bank')))
    .reduce((sum: number, d: any) => sum + Number(d.diverted_mtr ?? d.diverted_qty ?? 0), 0);
  const divToHbPcs = (diversions || [])
    .filter((d: any) => (d.source_work_order_id || d.source_wo_id) === raw.work_order_id && (d.target_wo_id === HOLLOW_BANK_WO_ID || (d.reason || '').toLowerCase().includes('hollow bank')))
    .reduce((sum: number, d: any) => {
      const pcsMatch = typeof d.reason === 'string' ? d.reason.match(/\[PCS:\s*([0-9]+)\]/i) : null;
      if (pcsMatch) return sum + Number(pcsMatch[1]);
      const dQty = Number(d.diverted_mtr ?? d.diverted_qty ?? 0);
      const l1 = Number(raw.l1) || 0;
      const l2 = Number(raw.l2) || 0;
      const avgLen = (l1 > 0 && l2 > 0) ? (l1 + l2) / 2 : (l1 || l2 || 6.0);
      return sum + (avgLen > 0 ? Math.round(dQty / avgLen) : 0);
    }, 0);

  const extraHbMtr = Math.max(0, directHbMtr - divToHbMtr);
  const extraHbPcs = Math.max(0, directHbPcs - divToHbPcs);

  const effVdiSalvageDivOutMtr = vdiSalvageDivOutMtr + extraHbMtr;
  const effVdiSalvageDivOutPcs = vdiSalvageDivOutPcs + extraHbPcs;

  const rawSalvagePcs = (isSalvage || isVdi)
    ? (Number(raw.vdi_salvage_pcs) > 0 ? Number(raw.vdi_salvage_pcs) : (isSalvage ? currentWipPcs : 0))
    : 0;
  const rawSalvageMtr = (isSalvage || isVdi)
    ? (Number(raw.vdi_salvage_mtr) > 0 ? Number(raw.vdi_salvage_mtr) : (isSalvage ? currentWip : 0))
    : 0;

  let salvagePcs = Math.max(0, rawSalvagePcs - effVdiSalvageDivOutPcs);
  let salvageMtr = Math.max(0, Number((rawSalvageMtr - effVdiSalvageDivOutMtr).toFixed(3)));
  if (salvagePcs <= 0 || salvageMtr <= 0) {
    salvagePcs = 0;
    salvageMtr = 0;
  }
  if (isSalvage && (salvagePcs <= 0 || salvageMtr <= 0)) {
    currentWip = 0;
    currentWipPcs = 0;
  }

  const divMtr = targetDivs.reduce((sum, d: any) => sum + Number(d.diverted_mtr ?? d.diverted_qty ?? 0), 0);
  const divPcs = targetDivs.reduce((sum, d: any) => sum + Number(d.diverted_pcs ?? 0), 0) || Number(raw.diversion_in_pcs) || 0;
  const divSourceWo = Array.from(
    new Set(
      targetDivs
        .map((d: any) => d.work_orders?.work_order_no || (d.source_work_order_id || d.source_wo_id)?.slice(0, 8))
        .filter(Boolean)
    )
  ).join(', ') || raw.diversion_source_wo || null;

  return {
    work_order_id: String(raw.work_order_id || ''),
    work_order_no: String(raw.work_order_no || ''),
    customer_name: raw.customer_name || null,
    grade: raw.grade || null,
    od: Number(raw.od ?? raw.size_od) || 0,
    wt: Number(raw.wt ?? raw.size_wt) || 0,
    l1: raw.l1 != null ? Number(raw.l1) : null,
    l2: raw.l2 != null ? Number(raw.l2) : null,
    stage_id: raw.stage_id ? String(raw.stage_id) : undefined,
    stage_code: String(raw.stage_code || ''),
    stage_name: String(raw.stage_name || raw.stage_code || ''),
    sequence_no: raw.sequence_no != null ? Number(raw.sequence_no) : undefined,
    current_wip: currentWip,
    current_wip_pcs: currentWipPcs,
    available_mt: Number(raw.available_mt ?? raw.current_wip_mt) || 0,
    last_activity_date: lastActivityDate,
    days_stuck: daysStuck,
    severity,
    is_acknowledged: isAcknowledged,
    acknowledged_by: matchLocal?.acknowledged_by || raw.acknowledged_by || null,
    ack_notes: matchLocal?.notes || raw.ack_notes || null,
    ack_snooze_until: matchLocal?.snooze_until || raw.ack_snooze_until || null,
    vdi_salvage_pcs: salvagePcs,
    vdi_salvage_mtr: salvageMtr,
    has_diversion: hasDiv,
    diversion_in_pcs: divPcs,
    diversion_in_mtr: Number(divMtr.toFixed(2)) || Number(raw.diversion_in_mtr) || 0,
    diversion_source_wo: divSourceWo,
    diversion_remarks: targetDivs.map((d: any) => d.reason || d.remarks).filter(Boolean).join('; ') || raw.diversion_remarks || null,
    diversion_date: latestDivDate || raw.diversion_date || null,
  };
}
