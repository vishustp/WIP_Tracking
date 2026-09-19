import { StageCode } from '@/types';
import { extractPcsFromRemarks } from './productionUtils';

export interface FeederBalance {
  feederStageCode: string;
  feederLabel: string;
  availPcs: number;
  availMtr: number;
  routeCode: string;
}

export interface WorkOrderSummary {
  id: string;
  work_order_no: string;
  l1?: number | null;
  l2?: number | null;
}

export interface ProductionLogRecord {
  id?: string;
  work_order_id: string;
  stage_id: string;
  process_date?: string;
  input_qty?: number | null;
  output_qty?: number | null;
  rejection_qty?: number | null;
  htc_ok?: number | null;
  remarks?: string | null;
  heat_lot_no?: string | null;
}

export interface RollingPlanRecord {
  id?: string;
  work_order_id: string;
  planned_qty?: number | null;
  status?: string | null;
}

export interface QcInspectionRecord {
  id?: string;
  work_order_id: string;
  inspected_pcs?: number | null;
  inspected_mtr?: number | null;
  vdi_ok_pcs?: number | null;
  vdi_ok_mtr?: number | null;
  vdi_salvage_pcs?: number | null;
  vdi_rejection_pcs?: number | null;
}

export function computeFeederBalanceForWorkOrder(params: {
  workOrder: WorkOrderSummary;
  targetStage: StageCode;
  routeCode: string;
  logs: ProductionLogRecord[];
  stageCodeToId: Map<string, string>;
  rollingPlans?: RollingPlanRecord[];
  qcInspections?: QcInspectionRecord[];
}): FeederBalance {
  const { workOrder, targetStage, routeCode, logs, stageCodeToId, rollingPlans = [], qcInspections = [] } = params;

  const rowL1 = workOrder.l1;
  const rowL2 = workOrder.l2;
  const avgLen = rowL1 && rowL2 ? (rowL1 + rowL2) / 2 : rowL1 || rowL2 || 6.0;

  const isAlloy = routeCode.toUpperCase().includes('ALLOY');
  const isCds = routeCode.toUpperCase().includes('CDS');

  const getStageLogs = (stageCode: string) => {
    const sId = stageCodeToId.get(stageCode);
    if (!sId) return [];
    return logs.filter((l) => l.work_order_id === workOrder.id && l.stage_id === sId);
  };

  const sumStagePcs = (stageLogs: ProductionLogRecord[]) => {
    return stageLogs.reduce((sum, l) => {
      const p = extractPcsFromRemarks(l.remarks).pcs;
      if (p !== null && p > 0) return sum + p;
      return sum + (avgLen > 0 ? Math.round(Number(l.output_qty || 0) / avgLen) : 0);
    }, 0);
  };

  const sumStageRejPcs = (stageLogs: ProductionLogRecord[]) => {
    return stageLogs.reduce((sum, l) => {
      const rp = extractPcsFromRemarks(l.remarks).rejPcs;
      if (rp !== null && rp > 0) return sum + rp;
      return sum + (avgLen > 0 ? Math.round(Number(l.rejection_qty || 0) / avgLen) : 0);
    }, 0);
  };

  const sumStageOutMtr = (stageLogs: ProductionLogRecord[]) => {
    return stageLogs.reduce((sum, l) => sum + Number(l.output_qty || 0), 0);
  };

  const sumStageRejMtr = (stageLogs: ProductionLogRecord[]) => {
    return stageLogs.reduce((sum, l) => sum + Number(l.rejection_qty || 0), 0);
  };

  const sumStageHtcOkMtr = (stageLogs: ProductionLogRecord[]) => {
    return stageLogs.reduce((sum, l) => sum + Number(l.htc_ok || 0), 0);
  };

  const sumStageHtcOkPcs = (stageLogs: ProductionLogRecord[]) => {
    return stageLogs.reduce((sum, l) => {
      if (Number(l.htc_ok || 0) > 0 && avgLen > 0) {
        return sum + Math.round(Number(l.htc_ok) / avgLen);
      }
      const outP = extractPcsFromRemarks(l.remarks).pcs;
      const rejP = extractPcsFromRemarks(l.remarks).rejPcs;
      if (outP !== null) {
        return sum + Math.max(0, outP - (rejP || 0));
      }
      return sum + (avgLen > 0 ? Math.round(Number(l.output_qty || 0) / avgLen) : 0);
    }, 0);
  };

  // 1. ROLLING
  if (targetStage === 'ROLLING') {
    const plans = rollingPlans.filter((p) => p.work_order_id === workOrder.id);
    const plannedMtr = plans.reduce((sum, p) => sum + Number(p.planned_qty || 0), 0);
    const max110Mtr = Number((plannedMtr * 1.10).toFixed(2));
    const rollingLogs = getStageLogs('ROLLING');
    const rolledMtr = sumStageOutMtr(rollingLogs);
    const rolledPcs = sumStagePcs(rollingLogs);

    const availMtr = plannedMtr > 0 ? Math.max(0, Number((max110Mtr - rolledMtr).toFixed(2))) : 0;
    const availPcs = avgLen > 0 ? Math.round(availMtr / avgLen) : 0;

    return {
      feederStageCode: 'ROLLING_PLAN',
      feederLabel: 'Active Rolling Plan (+10% Tolerance)',
      availPcs,
      availMtr,
      routeCode,
    };
  }

  // 2. HOLLOW_HEAT_TREATMENT
  const rollingLogs = getStageLogs('ROLLING');
  const rollHtcOkMtr = sumStageHtcOkMtr(rollingLogs);
  const rollHtcOkPcs = sumStageHtcOkPcs(rollingLogs);

  const hhtLogs = getStageLogs('HOLLOW_HEAT_TREATMENT');
  const hhtOutPcs = sumStagePcs(hhtLogs);
  const hhtRejPcs = sumStageRejPcs(hhtLogs);
  const hhtNetPcs = Math.max(0, hhtOutPcs - hhtRejPcs);
  const hhtOutMtr = sumStageOutMtr(hhtLogs);
  const hhtRejMtr = sumStageRejMtr(hhtLogs);
  const hhtNetMtr = Math.max(0, Number((hhtOutMtr - hhtRejMtr).toFixed(2)));

  if (targetStage === 'HOLLOW_HEAT_TREATMENT') {
    const availPcs = Math.max(0, rollHtcOkPcs - hhtOutPcs);
    const availMtr = Math.max(0, Number((rollHtcOkMtr - hhtOutMtr).toFixed(2)));
    return {
      feederStageCode: 'ROLLING',
      feederLabel: 'Rolling HTC OK',
      availPcs,
      availMtr,
      routeCode,
    };
  }

  // 3. DRAW
  const drawIncomingPcs = isAlloy ? hhtNetPcs : rollHtcOkPcs;
  const drawIncomingMtr = isAlloy ? hhtNetMtr : rollHtcOkMtr;
  const drawFeederLabel = isAlloy ? 'Hollow Heat Treatment Net OK' : 'Rolling HTC OK';

  const drawLogs = getStageLogs('DRAW');
  const drawOutPcs = sumStagePcs(drawLogs);
  const drawRejPcs = sumStageRejPcs(drawLogs);
  const drawNetPcs = Math.max(0, drawOutPcs - drawRejPcs);
  const drawOutMtr = sumStageOutMtr(drawLogs);
  const drawRejMtr = sumStageRejMtr(drawLogs);
  const drawNetMtr = Math.max(0, Number((drawOutMtr - drawRejMtr).toFixed(2)));

  if (targetStage === 'DRAW') {
    const availPcs = Math.max(0, drawIncomingPcs - drawOutPcs);
    const availMtr = Math.max(0, Number((drawIncomingMtr - drawOutMtr).toFixed(2)));
    return {
      feederStageCode: isAlloy ? 'HOLLOW_HEAT_TREATMENT' : 'ROLLING',
      feederLabel: drawFeederLabel,
      availPcs,
      availMtr,
      routeCode,
    };
  }

  // 4. HEAT_TREATMENT
  const htLogs = getStageLogs('HEAT_TREATMENT');
  const htOutPcs = sumStagePcs(htLogs);
  const htRejPcs = sumStageRejPcs(htLogs);
  const htNetPcs = Math.max(0, htOutPcs - htRejPcs);
  const htOutMtr = sumStageOutMtr(htLogs);
  const htRejMtr = sumStageRejMtr(htLogs);
  const htNetMtr = Math.max(0, Number((htOutMtr - htRejMtr).toFixed(2)));

  if (targetStage === 'HEAT_TREATMENT') {
    const htIncomingPcs = isCds ? drawNetPcs : (isAlloy ? hhtNetPcs : rollHtcOkPcs);
    const htIncomingMtr = isCds ? drawNetMtr : (isAlloy ? hhtNetMtr : rollHtcOkMtr);
    const htFeederLabel = isCds ? 'Draw Bench Net OK' : (isAlloy ? 'Hollow Heat Treatment Net OK' : 'Rolling HTC OK');

    const availPcs = Math.max(0, htIncomingPcs - htOutPcs);
    const availMtr = Math.max(0, Number((htIncomingMtr - htOutMtr).toFixed(2)));
    return {
      feederStageCode: isCds ? 'DRAW' : (isAlloy ? 'HOLLOW_HEAT_TREATMENT' : 'ROLLING'),
      feederLabel: htFeederLabel,
      availPcs,
      availMtr,
      routeCode,
    };
  }

  // 5. BAND_SAW
  const bsIncomingPcs = isCds ? htNetPcs : (isAlloy ? hhtNetPcs : rollHtcOkPcs);
  const bsIncomingMtr = isCds ? htNetMtr : (isAlloy ? hhtNetMtr : rollHtcOkMtr);
  const bsFeederLabel = isCds ? 'Heat Treatment Net OK' : (isAlloy ? 'Hollow Heat Treatment Net OK' : 'Rolling HTC OK');

  const bandSawLogs = getStageLogs('BAND_SAW');
  const bandSawOutPcs = sumStagePcs(bandSawLogs);
  const bandSawRejPcs = sumStageRejPcs(bandSawLogs);
  const bandSawNetPcs = Math.max(0, bandSawOutPcs - bandSawRejPcs);
  const bandSawOutMtr = sumStageOutMtr(bandSawLogs);
  const bandSawRejMtr = sumStageRejMtr(bandSawLogs);
  const bandSawNetMtr = Math.max(0, Number((bandSawOutMtr - bandSawRejMtr).toFixed(2)));

  if (targetStage === 'BAND_SAW') {
    const availPcs = Math.max(0, bsIncomingPcs - bandSawOutPcs);
    const availMtr = Math.max(0, Number((bsIncomingMtr - bandSawOutMtr).toFixed(2)));
    return {
      feederStageCode: isCds ? 'HEAT_TREATMENT' : (isAlloy ? 'HOLLOW_HEAT_TREATMENT' : 'ROLLING'),
      feederLabel: bsFeederLabel,
      availPcs,
      availMtr,
      routeCode,
    };
  }

  // 6. VDI (QC Inspection)
  const woQc = qcInspections.filter((q) => q.work_order_id === workOrder.id);
  const vdiInspectedPcs = woQc.reduce((sum, q) => sum + Number(q.inspected_pcs || 0), 0);
  const vdiInspectedMtr = woQc.reduce((sum, q) => sum + Number(q.inspected_mtr || 0), 0);
  const vdiOkPcs = woQc.reduce((sum, q) => sum + Number(q.vdi_ok_pcs || 0), 0);
  const vdiOkMtr = woQc.reduce((sum, q) => sum + Number(q.vdi_ok_mtr || 0), 0);

  const vdiIncomingPcs = bandSawOutPcs > 0 ? bandSawNetPcs : bsIncomingPcs;
  const vdiIncomingMtr = bandSawOutMtr > 0 ? bandSawNetMtr : bsIncomingMtr;
  const vdiFeederLabel = bandSawOutPcs > 0 ? 'Band Saw Net Output' : bsFeederLabel;

  if (targetStage === 'VDI') {
    const availPcs = Math.max(0, vdiIncomingPcs - vdiInspectedPcs);
    const availMtr = Math.max(0, Number((vdiIncomingMtr - vdiInspectedMtr).toFixed(2)));
    return {
      feederStageCode: bandSawOutPcs > 0 ? 'BAND_SAW' : (isCds ? 'HEAT_TREATMENT' : 'ROLLING'),
      feederLabel: vdiFeederLabel,
      availPcs,
      availMtr,
      routeCode,
    };
  }

  // 7. FINISHING
  const finLogs = getStageLogs('FINISHING');
  const finOutPcs = sumStagePcs(finLogs);
  const finOutMtr = sumStageOutMtr(finLogs);

  if (targetStage === 'FINISHING') {
    const availPcs = Math.max(0, vdiOkPcs - finOutPcs);
    const availMtr = Math.max(0, Number((vdiOkMtr - finOutMtr).toFixed(2)));
    return {
      feederStageCode: 'VDI',
      feederLabel: 'VDI Inspection (QC Passed)',
      availPcs,
      availMtr,
      routeCode,
    };
  }

  return {
    feederStageCode: 'UNKNOWN',
    feederLabel: 'Preceding Stage Production',
    availPcs: 999999,
    availMtr: 999999,
    routeCode,
  };
}
