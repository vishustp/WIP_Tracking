// lib/reports/agingReportHelper.ts

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
  last_activity_date: string;
  days_stuck: number;
  severity: AgingSeverity;
  is_acknowledged?: boolean;
  acknowledged_by?: string | null;
  ack_notes?: string | null;
  ack_snooze_until?: string | null;
}

export interface AgingKpiSummary {
  totalLots: number;
  criticalLots: number;
  warningLots: number;
  normalLots: number;
  criticalMtr: number;
  criticalMt: number;
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
}

export interface RawProductionLog {
  work_order_id: string;
  stage_id: string;
  process_date: string;
  output_qty?: number;
  htc_ok?: number;
  created_at?: string;
}

export interface RawQcInspection {
  work_order_id: string;
  inspection_date: string;
  vdi_ok_mtr?: number;
  created_at?: string;
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

  // 3. Fallbacks: Rolling plan date or work order creation date
  const fallbackDate =
    rollingPlanDate?.slice(0, 10) ||
    workOrderCreatedDate?.slice(0, 10) ||
    new Date().toISOString().slice(0, 10);

  // 4. Determine effective date:
  // If both current and upstream have dates, take the latest one (most recent activity or inflow)
  if (currentStageDate && upstreamDate) {
    return currentStageDate > upstreamDate ? currentStageDate : upstreamDate;
  }
  if (currentStageDate) {
    return currentStageDate;
  }
  if (upstreamDate) {
    return upstreamDate;
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

  const rows: AgingRow[] = wipRows
    .filter((r) => (r.stage_code || '').toUpperCase() !== 'ROLLING' && Number(r.current_wip || 0) > 0)
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
      const currentWipMtr = Number(r.current_wip) || 0;
      const currentWipPcs = Number(r.current_wip_pcs) || 0;

      // Conserved mass formula (OD - WT) * WT * 0.0246615 * 0.001 * meters
      const computedMt = Math.max(od - wt, 0) * Math.max(wt, 0) * 0.0246615 * 0.001 * currentWipMtr;
      const availMt = isMhStage
        ? Number(computedMt.toFixed(3))
        : Number(r.current_wip_mt || r.available_mt || 0) > 0
        ? Number(r.current_wip_mt || r.available_mt)
        : Number(computedMt.toFixed(3));

      // Calculate effective activity date
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
      });

      const daysStuck = calculateDaysStuck(effDate, asOfDate);
      const severity = calculateAgingSeverity(daysStuck);

      // Check acknowledgement
      const ackKey = `${r.work_order_id}_${r.stage_code}`;
      const ack = ackMap.get(ackKey);
      const isAcked = Boolean(
        ack && (!ack.snooze_until || ack.snooze_until >= todayStr)
      );

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
        last_activity_date: effDate,
        days_stuck: daysStuck,
        severity,
        is_acknowledged: isAcked,
        acknowledged_by: ack?.acknowledged_by || null,
        ack_notes: ack?.notes || null,
        ack_snooze_until: ack?.snooze_until || null,
      };
    });

  // Sort descending by days stuck
  return rows.sort((a, b) => b.days_stuck - a.days_stuck);
}

/**
 * Computes executive KPI summary metrics for the Aging Report.
 */
export function computeAgingKpis(rows: AgingRow[]): AgingKpiSummary {
  const totalLots = rows.length;
  const criticalLots = rows.filter((r) => r.severity === 'CRITICAL').length;
  const warningLots = rows.filter((r) => r.severity === 'WARNING').length;
  const normalLots = rows.filter((r) => r.severity === 'NORMAL').length;

  const criticalMtr = rows
    .filter((r) => r.severity === 'CRITICAL')
    .reduce((sum, r) => sum + r.current_wip, 0);
  const criticalMt = rows
    .filter((r) => r.severity === 'CRITICAL')
    .reduce((sum, r) => sum + r.available_mt, 0);

  const totalWipMtr = rows.reduce((sum, r) => sum + r.current_wip, 0);
  const totalWipMt = rows.reduce((sum, r) => sum + r.available_mt, 0);

  const avgDays = totalLots > 0 ? rows.reduce((sum, r) => sum + r.days_stuck, 0) / totalLots : 0;

  // Work center with highest critical (or warning) count
  const stageCritCounts: Record<string, number> = {};
  rows
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
    rows
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
        criticalMtr,
        criticalMt,
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
      criticalMtr,
      criticalMt,
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
    criticalMtr,
    criticalMt,
    totalWipMtr,
    totalWipMt,
    avgDays,
    topBottleneck: `${topStage} (${topCount} lots)`,
  };
}

/**
 * Filters aging rows by selected stage, severity tier, and text query.
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
    if (selectedStage !== 'ALL' && r.stage_code !== selectedStage) {
      return false;
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
