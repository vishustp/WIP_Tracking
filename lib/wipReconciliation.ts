// lib/wipReconciliation.ts
import { mtFromMtr } from './productionUtils';

export interface StageWipInput {
  stage_code: string;
  sequence_no: number;
  gross_output_mtr: number;
  gross_output_pcs: number;
  rejection_mtr: number;
  rejection_pcs: number;
  net_output_mtr: number;
  net_output_pcs: number;
  incoming_mtr?: number;
  incoming_pcs?: number;
  od: number;
  wt: number;
  avg_length: number;
  mh_od?: number;
  mh_wt?: number;
  mh_avg_length?: number;
}

export interface ReconciledStageWip {
  stage_code: string;
  sequence_no: number;
  is_feeder_stage: boolean;
  incoming_pcs: number;
  incoming_mtr: number;
  production_pcs: number;
  production_mtr: number;
  rejection_pcs: number;
  rejection_mtr: number;
  reconciled_wip_pcs: number;
  reconciled_wip_mtr: number;
  reconciled_wip_mt: number;
  capped_wip_pcs: number;
  capped_wip_mtr: number;
  capped_wip_mt: number;
  od: number;
  wt: number;
  avg_length: number;
}

export interface WorkOrderWipSummary {
  work_order_id: string;
  work_order_no: string;
  route_code: string;
  total_charged_mt: number;
  total_finished_mt: number;
  total_scrap_mt: number;
  max_physical_wip_mt: number;
  plant_total_wip_pcs: number;
  plant_total_wip_mtr: number;
  plant_total_wip_mt: number;
  stages: ReconciledStageWip[];
}

/**
 * Reconciles stage WIP for a work order from first principles (PCS-first):
 * 1. Rolling is the upstream feeder mill and is excluded from Plant WIP.
 * 2. Plant WIP starts at the first cold/processing station:
 *    - Standard CDS: Starts at DRAW.
 *    - Alloy CDS: Starts at HOLLOW_HEAT_TREATMENT.
 *    - Standard HFS: Starts at BAND_SAW.
 *    - Option B HFS (Heat-treated): Starts at HEAT_TREATMENT.
 * 3. WIP at each stage is calculated in physical PCS:
 *    Queue WIP (PCS) = Incoming Feeder (PCS) - Current Stage Output (PCS)
 * 4. Meters & MT are derived from PCS:
 *    Meters = PCS * Stage Avg Length
 *    MT = Meters * (OD - WT) * WT * 0.0246615 * 1e-3
 * 5. Downstream production automatically consumes upstream queues.
 */
export function reconcileWorkOrderWip(
  stages: StageWipInput[],
  options: {
    route_code?: string;
    charged_billet_mt?: number;
    ordered_qty_mt?: number;
    rolling_plan_qty_mtr?: number;
    mh_od?: number;
    mh_wt?: number;
    mh_avg_length?: number;
    final_avg_length?: number;
  } = {}
): WorkOrderWipSummary {
  const routeCode = (options.route_code || 'CDS').toUpperCase();
  const isCds = routeCode.includes('CDS');
  const isAlloy = routeCode.includes('ALLOY');

  const sortedStages = [...stages].sort((a, b) => a.sequence_no - b.sequence_no);

  // 1. Identify Rolling Feeder HTC OK PCS
  const rollStage = sortedStages.find((s) => s.stage_code === 'ROLLING');
  const rollGrossPcs = rollStage ? Number(rollStage.gross_output_pcs || 0) : 0;
  const rollRejPcs = rollStage ? Number(rollStage.rejection_pcs || 0) : 0;
  const rollHtcPcs = Math.max(0, rollGrossPcs - rollRejPcs);

  const mhAvgLen = Number(options.mh_avg_length || rollStage?.mh_avg_length || rollStage?.avg_length || 6.0);
  const finalAvgLen = Number(options.final_avg_length || sortedStages[sortedStages.length - 1]?.avg_length || 6.0);

  const mhOd = Number(options.mh_od || rollStage?.mh_od || rollStage?.od || 0);
  const mhWt = Number(options.mh_wt || rollStage?.mh_wt || rollStage?.wt || 0);

  // 2. Determine charged billet MT
  let chargedBilletMt = options.charged_billet_mt || 0;
  if (!chargedBilletMt && rollStage && (rollStage.gross_output_mtr || rollGrossPcs)) {
    const rollMtr = rollStage.gross_output_mtr > 0 ? rollStage.gross_output_mtr : rollGrossPcs * mhAvgLen;
    chargedBilletMt = mtFromMtr(rollMtr, mhOd, mhWt);
  }
  if (!chargedBilletMt && options.rolling_plan_qty_mtr && mhOd && mhWt) {
    chargedBilletMt = mtFromMtr(options.rolling_plan_qty_mtr, mhOd, mhWt);
  }
  if (!chargedBilletMt && options.ordered_qty_mt) {
    chargedBilletMt = options.ordered_qty_mt;
  }

  // 3. Collect stage production & rejection in PCS
  const stageProdMap = new Map<string, { prodPcs: number; rejPcs: number; prodMtr: number; rejMtr: number }>();
  for (const s of sortedStages) {
    const prodPcs = Number(s.gross_output_pcs || s.net_output_pcs || 0);
    const rejPcs = Number(s.rejection_pcs || 0);
    const prodMtr = Number(s.gross_output_mtr || s.net_output_mtr || 0);
    const rejMtr = Number(s.rejection_mtr || 0);
    stageProdMap.set(s.stage_code, { prodPcs, rejPcs, prodMtr, rejMtr });
  }

  // 4. Calculate stage WIP in PCS along the physical route
  const reconciledStages: ReconciledStageWip[] = [];

  for (let i = 0; i < sortedStages.length; i++) {
    const cur = sortedStages[i];
    const sc = cur.stage_code;

    // ROLLING is the feeder mill: WIP represents Mother Hollows Awaiting after HTC OK
    if (sc === 'ROLLING') {
      let maxDownstreamPcs = 0;
      for (let j = i + 1; j < sortedStages.length; j++) {
        const down = sortedStages[j];
        const downData = stageProdMap.get(down.stage_code);
        if (downData && (downData.prodPcs + downData.rejPcs) > maxDownstreamPcs) {
          maxDownstreamPcs = downData.prodPcs + downData.rejPcs;
        }
      }

      const awaitingHtcPcs = Math.max(0, rollHtcPcs - maxDownstreamPcs);
      const awaitingHtcMtr = Number((awaitingHtcPcs * mhAvgLen).toFixed(2));
      const awaitingHtcMt = mtFromMtr(awaitingHtcMtr, mhOd, mhWt);

      reconciledStages.push({
        stage_code: 'ROLLING',
        sequence_no: cur.sequence_no,
        is_feeder_stage: true,
        incoming_pcs: rollGrossPcs,
        incoming_mtr: rollStage?.gross_output_mtr || (rollGrossPcs * mhAvgLen),
        production_pcs: rollHtcPcs,
        production_mtr: rollStage?.net_output_mtr || (rollHtcPcs * mhAvgLen),
        rejection_pcs: rollRejPcs,
        rejection_mtr: rollStage?.rejection_mtr || (rollRejPcs * mhAvgLen),
        reconciled_wip_pcs: awaitingHtcPcs,
        reconciled_wip_mtr: awaitingHtcMtr,
        reconciled_wip_mt: awaitingHtcMt,
        capped_wip_pcs: awaitingHtcPcs,
        capped_wip_mtr: awaitingHtcMtr,
        capped_wip_mt: awaitingHtcMt,
        od: mhOd,
        wt: mhWt,
        avg_length: mhAvgLen,
      });
      continue;
    }

    // Determine incoming feeder PCS based on route
    let incomingPcs = 0;
    let stageLen = finalAvgLen;
    let stageOd = Number(cur.od || 0);
    let stageWt = Number(cur.wt || 0);

    if (sc === 'HOLLOW_HEAT_TREATMENT') {
      // Alloy CDS: Feeder is Rolling HTC OK (awaiting Hollow Heat Treatment)
      incomingPcs = isAlloy ? rollHtcPcs : 0;
      stageLen = mhAvgLen;
      stageOd = mhOd > 0 ? mhOd : stageOd;
      stageWt = mhWt > 0 ? mhWt : stageWt;
    } else if (sc === 'DRAW') {
      // CDS: Feeder is HHT (if alloy) or directly Rolling HTC OK (if carbon CDS)
      const hhtProd = stageProdMap.get('HOLLOW_HEAT_TREATMENT');
      const hhtProdPcs = hhtProd?.prodPcs || 0;
      incomingPcs = isAlloy ? hhtProdPcs : rollHtcPcs;
      stageLen = mhAvgLen; // Mother hollow pieces waiting to be drawn
      stageOd = mhOd > 0 ? mhOd : stageOd;
      stageWt = mhWt > 0 ? mhWt : stageWt;
    } else if (sc === 'HEAT_TREATMENT') {
      // CDS: Feeder is Draw Bench
      // Option B HFS: Feeder is Rolling HTC OK
      if (isCds) {
        const drawProd = stageProdMap.get('DRAW');
        incomingPcs = drawProd?.prodPcs || 0;
      } else {
        incomingPcs = rollHtcPcs;
      }
      stageLen = finalAvgLen;
    } else if (sc === 'BAND_SAW') {
      // Standard HFS: Feeder is Rolling HTC OK
      // CDS / Option B HFS: Feeder is Final Heat Treatment
      if (routeCode === 'HFS') {
        incomingPcs = rollHtcPcs;
      } else {
        const htProd = stageProdMap.get('HEAT_TREATMENT');
        incomingPcs = htProd?.prodPcs || 0;
      }
      stageLen = finalAvgLen;
    } else if (sc === 'VDI') {
      // Feeder is cut pieces from Band Saw
      const bsProd = stageProdMap.get('BAND_SAW');
      incomingPcs = bsProd?.prodPcs || 0;
      stageLen = finalAvgLen;
    } else if (sc === 'FINISHING') {
      // Feeder is VDI OK pieces
      const vdiProd = stageProdMap.get('VDI');
      incomingPcs = Math.max(0, (vdiProd?.prodPcs || 0) - (vdiProd?.rejPcs || 0));
      stageLen = finalAvgLen;
    } else {
      // Fallback: previous stage production
      const prevStage = sortedStages[i - 1];
      const prevProd = prevStage ? stageProdMap.get(prevStage.stage_code) : null;
      incomingPcs = prevProd?.prodPcs || 0;
    }

    // Downstream passed pcs: maximum quantity processed by any downstream stage
    let maxDownstreamPcs = 0;
    for (let j = i + 1; j < sortedStages.length; j++) {
      const down = sortedStages[j];
      const downData = stageProdMap.get(down.stage_code);
      if (downData && (downData.prodPcs + downData.rejPcs) > maxDownstreamPcs) {
        maxDownstreamPcs = downData.prodPcs + downData.rejPcs;
      }
    }

    const curProd = stageProdMap.get(sc) || { prodPcs: 0, rejPcs: 0, prodMtr: 0, rejMtr: 0 };
    const effectivePassedPcs = Math.max(curProd.prodPcs + curProd.rejPcs, maxDownstreamPcs);

    // Core Formula: Queue WIP (PCS) = Incoming - Effective Passed
    const wipPcs = Math.max(0, incomingPcs - effectivePassedPcs);
    const wipMtr = stageLen > 0 ? Number((wipPcs * stageLen).toFixed(2)) : 0;
    const wipMt = mtFromMtr(wipMtr, stageOd, stageWt);

    reconciledStages.push({
      stage_code: sc,
      sequence_no: cur.sequence_no,
      is_feeder_stage: false,
      incoming_pcs: incomingPcs,
      incoming_mtr: stageLen > 0 ? Number((incomingPcs * stageLen).toFixed(2)) : 0,
      production_pcs: curProd.prodPcs,
      production_mtr: curProd.prodMtr,
      rejection_pcs: curProd.rejPcs,
      rejection_mtr: curProd.rejMtr,
      reconciled_wip_pcs: wipPcs,
      reconciled_wip_mtr: wipMtr,
      reconciled_wip_mt: wipMt,
      capped_wip_pcs: wipPcs,
      capped_wip_mtr: wipMtr,
      capped_wip_mt: wipMt,
      od: stageOd,
      wt: stageWt,
      avg_length: stageLen,
    });
  }

  // 5. Total Plant WIP (sum across post-rolling stages)
  const plantStages = reconciledStages.filter((s) => !s.is_feeder_stage);
  const totalPlantWipPcs = plantStages.reduce((sum, s) => sum + s.reconciled_wip_pcs, 0);
  const totalPlantWipMtr = plantStages.reduce((sum, s) => sum + s.reconciled_wip_mtr, 0);
  let totalPlantWipMt = plantStages.reduce((sum, s) => sum + s.reconciled_wip_mt, 0);

  // 6. Mass Conservation Capping
  const finStage = reconciledStages.find((s) => s.stage_code === 'FINISHING');
  const finNetMt = finStage ? mtFromMtr(finStage.production_mtr, finStage.od, finStage.wt) : 0;

  // Scrap generated at Band Saw / VDI / Finishing
  const totalScrapMt = plantStages.reduce((sum, s) => {
    return sum + mtFromMtr(s.rejection_mtr, s.od, s.wt);
  }, 0);

  const maxPhysicalWipMt = Math.max(0, chargedBilletMt - totalScrapMt - finNetMt);

  if (chargedBilletMt > 0 && totalPlantWipMt > maxPhysicalWipMt && totalPlantWipMt > 0) {
    const scaleFactor = maxPhysicalWipMt / totalPlantWipMt;
    for (const st of plantStages) {
      st.capped_wip_mt = Number((st.reconciled_wip_mt * scaleFactor).toFixed(3));
      st.capped_wip_mtr = Number((st.reconciled_wip_mtr * scaleFactor).toFixed(2));
      st.capped_wip_pcs = Math.round(st.reconciled_wip_pcs * scaleFactor);
    }
    totalPlantWipMt = maxPhysicalWipMt;
  }

  return {
    work_order_id: '',
    work_order_no: '',
    route_code: routeCode,
    total_charged_mt: chargedBilletMt,
    total_finished_mt: finNetMt,
    total_scrap_mt: totalScrapMt,
    max_physical_wip_mt: maxPhysicalWipMt,
    plant_total_wip_pcs: totalPlantWipPcs,
    plant_total_wip_mtr: totalPlantWipMtr,
    plant_total_wip_mt: Number(totalPlantWipMt.toFixed(3)),
    stages: reconciledStages,
  };
}
