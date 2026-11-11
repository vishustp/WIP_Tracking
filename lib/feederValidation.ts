import { StageCode } from '@/types';
import { extractPcsFromRemarks, extractBandSawCutsFromRemarks } from './productionUtils';

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

export interface DiversionPlanRecord {
  id?: string;
  source_wo_id: string;
  target_wo_id: string;
  diverted_qty?: number | null;
  diverted_pcs?: number | null;
  work_center?: string | null;
  multiple?: number | null;
  reason?: string | null;
  status?: string | null;
  ppc_approved_at?: string | null;
}

export function computeFeederBalanceForWorkOrder(params: {
  workOrder: WorkOrderSummary & { diversion_in_pcs?: number; diversion_in_mtr?: number };
  targetStage: StageCode;
  routeCode: string;
  logs: ProductionLogRecord[];
  stageCodeToId: Map<string, string>;
  rollingPlans?: RollingPlanRecord[];
  qcInspections?: QcInspectionRecord[];
  diversions?: DiversionPlanRecord[];
}): FeederBalance {
  const { workOrder, targetStage, routeCode, logs, stageCodeToId, rollingPlans = [], qcInspections = [], diversions = [] } = params;

  const rowL1 = workOrder.l1;
  const rowL2 = workOrder.l2;
  const avgLen = rowL1 && rowL2 ? (rowL1 + rowL2) / 2 : rowL1 || rowL2 || 6.0;

  const isAlloy = routeCode.toUpperCase().includes('ALLOY');
  const isCds = routeCode.toUpperCase().includes('CDS');
  const isSsSteel = routeCode.toUpperCase().includes('SS') || routeCode.toUpperCase().includes('STAINLESS');

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
    return stageLogs.reduce((sum, l) => {
      const htc = Number(l.htc_ok || 0);
      if (htc > 0) return sum + htc;
      const out = Number(l.output_qty || 0);
      const rej = Number(l.rejection_qty || 0);
      return sum + Math.max(0, out - rej);
    }, 0);
  };

  const sumStageHtcOkPcs = (stageLogs: ProductionLogRecord[]) => {
    return stageLogs.reduce((sum, l) => {
      const htc = Number(l.htc_ok || 0);
      if (htc > 0 && avgLen > 0) {
        return sum + Math.round(htc / avgLen);
      }
      const outP = extractPcsFromRemarks(l.remarks).pcs;
      const rejP = extractPcsFromRemarks(l.remarks).rejPcs;
      if (outP !== null) {
        return sum + Math.max(0, outP - (rejP || 0));
      }
      const out = Number(l.output_qty || 0);
      const rej = Number(l.rejection_qty || 0);
      const netMtr = Math.max(0, out - rej);
      return sum + (avgLen > 0 ? Math.round(netMtr / avgLen) : 0);
    }, 0);
  };

  // 1. ROLLING - Rolling Production is uncapped (No 110% capping)
  if (targetStage === 'ROLLING') {
    return {
      feederStageCode: 'ROLLING_PLAN',
      feederLabel: 'Active Rolling Plan (Uncapped)',
      availPcs: Infinity,
      availMtr: Infinity,
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

  // 3. PILGER (Cold Pilger Mill - Stainless Steel route)
  const pilgerLogs = getStageLogs('PILGER');
  const pilgerOutPcs = sumStagePcs(pilgerLogs);
  const pilgerRejPcs = sumStageRejPcs(pilgerLogs);
  const pilgerNetPcs = Math.max(0, pilgerOutPcs - pilgerRejPcs);
  const pilgerOutMtr = sumStageOutMtr(pilgerLogs);
  const pilgerRejMtr = sumStageRejMtr(pilgerLogs);
  const pilgerNetMtr = Math.max(0, Number((pilgerOutMtr - pilgerRejMtr).toFixed(2)));

  if (targetStage === 'PILGER') {
    const availPcs = Math.max(0, rollHtcOkPcs - pilgerOutPcs);
    const availMtr = Math.max(0, Number((rollHtcOkMtr - pilgerOutMtr).toFixed(2)));
    return {
      feederStageCode: 'ROLLING',
      feederLabel: 'Rolling HTC OK',
      availPcs,
      availMtr,
      routeCode,
    };
  }

  // 4. DRAW
  const drawIncomingPcs = isAlloy ? (hhtNetPcs > 0 ? hhtNetPcs : rollHtcOkPcs) : rollHtcOkPcs;
  const drawIncomingMtr = isAlloy ? (hhtNetMtr > 0 ? hhtNetMtr : rollHtcOkMtr) : rollHtcOkMtr;
  const drawFeederLabel = isAlloy && hhtNetPcs > 0 ? 'Hollow Heat Treatment Net OK' : 'Rolling HTC OK';

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
      feederStageCode: isAlloy && hhtNetPcs > 0 ? 'HOLLOW_HEAT_TREATMENT' : 'ROLLING',
      feederLabel: drawFeederLabel,
      availPcs,
      availMtr,
      routeCode,
    };
  }

  // 5. HEAT_TREATMENT
  const htLogs = getStageLogs('HEAT_TREATMENT');
  const htOutPcs = sumStagePcs(htLogs);
  const htRejPcs = sumStageRejPcs(htLogs);
  const htNetPcs = Math.max(0, htOutPcs - htRejPcs);
  const htOutMtr = sumStageOutMtr(htLogs);
  const htRejMtr = sumStageRejMtr(htLogs);
  const htNetMtr = Math.max(0, Number((htOutMtr - htRejMtr).toFixed(2)));

  if (targetStage === 'HEAT_TREATMENT') {
    const htIncomingPcs = isSsSteel
      ? pilgerNetPcs
      : (isCds ? drawNetPcs : (isAlloy ? hhtNetPcs : rollHtcOkPcs));
    const htIncomingMtr = isSsSteel
      ? pilgerNetMtr
      : (isCds ? drawNetMtr : (isAlloy ? hhtNetMtr : rollHtcOkMtr));
    const htFeederLabel = isSsSteel
      ? 'Cold Pilger Mill Net OK'
      : (isCds ? 'Draw Bench Net OK' : (isAlloy ? 'Hollow Heat Treatment Net OK' : 'Rolling HTC OK'));

    const availPcs = Math.max(0, htIncomingPcs - htOutPcs);
    const availMtr = Math.max(0, Number((htIncomingMtr - htOutMtr).toFixed(2)));
    return {
      feederStageCode: isSsSteel ? 'PILGER' : (isCds ? 'DRAW' : (isAlloy ? 'HOLLOW_HEAT_TREATMENT' : 'ROLLING')),
      feederLabel: htFeederLabel,
      availPcs,
      availMtr,
      routeCode,
    };
  }

  // 6. BAND_SAW
  // Incoming material comes from 3 routes:
  // 1. Heat Treatment (HT) for CDS / SS_STEEL
  // 2. Rolling HTC for HFS (or Hollow HT for ALLOY_HFS)
  // 3. Diversion Work Center (incoming approved diverted material to Band Saw)
  const isAlloyHfs = isAlloy && !isCds;
  const bsFeederStageCode = (isSsSteel || isCds) ? 'HEAT_TREATMENT' : (isAlloyHfs ? 'HOLLOW_HEAT_TREATMENT' : 'ROLLING');
  const bsFeederLabel = (isSsSteel || isCds) ? 'Heat Treatment Net OK' : (isAlloyHfs ? 'Hollow Heat Treatment Net OK' : 'Rolling HTC OK');
  const bsIncomingPcs = (isSsSteel || isCds) ? htNetPcs : (isAlloyHfs ? hhtNetPcs : rollHtcOkPcs);
  const bsIncomingMtr = (isSsSteel || isCds) ? htNetMtr : (isAlloyHfs ? hhtNetMtr : rollHtcOkMtr);

  // Parse diversions into / out of Band Saw
  const parseDivStages = (d: DiversionPlanRecord) => {
    const fromMatch = typeof d.reason === 'string' ? d.reason.match(/\[FROM_STAGE:\s*([A-Z_]+)\]/i) : null;
    const toMatch = typeof d.reason === 'string' ? d.reason.match(/\[TO_STAGE:\s*([A-Z_]+)\]/i) : null;
    const sourceStage = fromMatch ? fromMatch[1].toUpperCase() : (d.work_center || 'ROLLING');
    const targetStage = toMatch ? toMatch[1].toUpperCase() : (d.work_center || 'ROLLING');
    return { sourceStage, targetStage };
  };

  const isApprovedDiv = (d: DiversionPlanRecord) => {
    if (d.status === 'APPROVED') return true;
    if (d.status === 'PENDING_PPC' || d.status === 'REJECTED_BY_PPC' || d.status === 'CANCELLED') return false;
    if (d.ppc_approved_at) return true;
    return true;
  };

  const approvedDiversions = (diversions || []).filter(isApprovedDiv);
  const bsDivInLogs = approvedDiversions.filter(
    (d) => d.target_wo_id === workOrder.id && (parseDivStages(d).targetStage === 'BAND_SAW' || parseDivStages(d).targetStage === 'IP_CUTTING')
  );
  const bsDivOutLogs = approvedDiversions.filter(
    (d) => d.source_wo_id === workOrder.id && (parseDivStages(d).sourceStage === 'BAND_SAW' || parseDivStages(d).sourceStage === 'IP_CUTTING')
  );

  const bsDivInMtr = bsDivInLogs.reduce((sum, d) => sum + Number(d.diverted_qty || 0), 0) + Number(workOrder.diversion_in_mtr || 0);
  const bsDivInPcs = bsDivInLogs.reduce((sum, d) => {
    if (d.diverted_pcs != null && Number(d.diverted_pcs) > 0) return sum + Number(d.diverted_pcs);
    const pcsMatch = typeof d.reason === 'string' ? d.reason.match(/\[PCS:\s*([0-9]+)\]/i) : null;
    if (pcsMatch) return sum + Number(pcsMatch[1]);
    const dQty = Number(d.diverted_qty || 0);
    return sum + (avgLen > 0 ? Math.round(dQty / avgLen) : 0);
  }, 0) + Number(workOrder.diversion_in_pcs || 0);

  const bsDivOutMtr = bsDivOutLogs.reduce((sum, d) => sum + Number(d.diverted_qty || 0), 0);
  const bsDivOutPcs = bsDivOutLogs.reduce((sum, d) => {
    if (d.diverted_pcs != null && Number(d.diverted_pcs) > 0) return sum + Number(d.diverted_pcs);
    const pcsMatch = typeof d.reason === 'string' ? d.reason.match(/\[PCS:\s*([0-9]+)\]/i) : null;
    if (pcsMatch) return sum + Number(pcsMatch[1]);
    const dQty = Number(d.diverted_qty || 0);
    return sum + (avgLen > 0 ? Math.round(dQty / avgLen) : 0);
  }, 0);

  const totalBsIncomingPcs = Math.max(0, bsIncomingPcs + bsDivInPcs - bsDivOutPcs);
  const totalBsIncomingMtr = Math.max(0, Number((bsIncomingMtr + bsDivInMtr - bsDivOutMtr).toFixed(2)));

  let dynamicBsFeederLabel = bsFeederLabel;
  let dynamicBsFeederCode = bsFeederStageCode;
  if (bsDivInPcs > 0 && bsIncomingPcs === 0) {
    dynamicBsFeederLabel = 'Diverted Material In';
    dynamicBsFeederCode = 'DIVERSION';
  } else if (bsDivInPcs > 0 && bsIncomingPcs > 0) {
    dynamicBsFeederLabel = `${bsFeederLabel} + Diversion`;
  }

  const bandSawLogs = getStageLogs('BAND_SAW');
  const bandSawOutPcs = sumStagePcs(bandSawLogs);
  const bandSawRejPcs = sumStageRejPcs(bandSawLogs);
  const bandSawNetPcs = Math.max(0, bandSawOutPcs - bandSawRejPcs);
  const bandSawOutMtr = sumStageOutMtr(bandSawLogs);
  const bandSawRejMtr = sumStageRejMtr(bandSawLogs);
  const bandSawNetMtr = Math.max(0, Number((bandSawOutMtr - bandSawRejMtr).toFixed(2)));

  const bandSawMotherPcs = bandSawLogs.reduce((sum, l) => {
    const { motherPcs } = extractBandSawCutsFromRemarks(l.remarks);
    if (motherPcs && motherPcs > 0) return sum + motherPcs;
    const { pcs } = extractPcsFromRemarks(l.remarks);
    if (pcs && pcs > 0) return sum + pcs;
    const inMtr = Number(l.input_qty || l.output_qty || 0);
    return sum + (avgLen > 0 ? Math.round(inMtr / avgLen) : 0);
  }, 0);
  const bandSawInputMtr = bandSawLogs.reduce((sum, l) => sum + Number(l.input_qty || l.output_qty || 0), 0);

  if (targetStage === 'BAND_SAW') {
    const availPcs = Math.max(0, totalBsIncomingPcs - bandSawMotherPcs);
    const availMtr = Math.max(0, Number((totalBsIncomingMtr - bandSawInputMtr).toFixed(2)));
    return {
      feederStageCode: dynamicBsFeederCode,
      feederLabel: dynamicBsFeederLabel,
      availPcs,
      availMtr,
      routeCode,
    };
  }

  // 7. VDI (QC Inspection)
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
      feederStageCode: bandSawOutPcs > 0 ? 'BAND_SAW' : ((isSsSteel || isCds) ? 'HEAT_TREATMENT' : 'ROLLING'),
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
