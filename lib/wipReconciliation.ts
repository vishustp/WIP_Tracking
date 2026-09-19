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
}

export interface ReconciledStageWip {
  stage_code: string;
  sequence_no: number;
  raw_wip_mtr: number;
  raw_wip_pcs: number;
  raw_wip_mt: number;
  reconciled_wip_mtr: number;
  reconciled_wip_pcs: number;
  reconciled_wip_mt: number;
  capped_wip_mtr: number;
  capped_wip_pcs: number;
  capped_wip_mt: number;
  od: number;
  wt: number;
}

export interface WorkOrderWipSummary {
  work_order_id: string;
  work_order_no: string;
  total_charged_mt: number;
  total_finished_mt: number;
  total_scrap_mt: number;
  max_physical_wip_mt: number;
  raw_total_wip_mt: number;
  reconciled_total_wip_mt: number;
  stages: ReconciledStageWip[];
}

/**
 * Reconciles stage WIP for a work order by:
 * 1. Automatically deducting downstream production from upstream queues
 * 2. Capping total WIP by remaining physical charged steel mass
 */
export function reconcileWorkOrderWip(
  stages: StageWipInput[],
  options: {
    charged_billet_mt?: number;
    ordered_qty_mt?: number;
    rolling_plan_qty_mtr?: number;
    mh_od?: number;
    mh_wt?: number;
  } = {}
): WorkOrderWipSummary {
  const sortedStages = [...stages].sort((a, b) => a.sequence_no - b.sequence_no);

  // 1. Calculate mass per stage
  const stageMass = sortedStages.map((s) => {
    const grossMt = mtFromMtr(s.gross_output_mtr, s.od, s.wt);
    const rejMt = mtFromMtr(s.rejection_mtr, s.od, s.wt);
    const netMt = mtFromMtr(s.net_output_mtr, s.od, s.wt);
    return {
      ...s,
      grossMt,
      rejMt,
      netMt,
    };
  });

  // 2. Compute charged billet MT
  const rollStage = stageMass.find((s) => s.stage_code === 'ROLLING');
  let chargedBilletMt = options.charged_billet_mt || 0;
  if (!chargedBilletMt && rollStage && rollStage.grossMt > 0) {
    chargedBilletMt = rollStage.grossMt;
  }
  if (!chargedBilletMt && options.rolling_plan_qty_mtr && options.mh_od && options.mh_wt) {
    chargedBilletMt = mtFromMtr(options.rolling_plan_qty_mtr, options.mh_od, options.mh_wt);
  }
  if (!chargedBilletMt && options.ordered_qty_mt) {
    chargedBilletMt = options.ordered_qty_mt;
  }

  // Total scrap rejection MT across all stages
  const totalScrapMt = stageMass.reduce((sum, s) => sum + s.rejMt, 0);

  // Total finished output MT (from finishing stage)
  const finStage = stageMass.find((s) => s.stage_code === 'FINISHING');
  const totalFinishedMt = finStage ? finStage.netMt : 0;

  // Strict physical conservation of mass ceiling:
  const maxPhysicalWipMt = Math.max(0, chargedBilletMt - totalScrapMt - totalFinishedMt);

  // 3. Universal Downstream Deduction
  // For each stage i, calculate highest downstream quantity processed past this stage
  const reconciledStages: ReconciledStageWip[] = [];

  for (let i = 0; i < stageMass.length; i++) {
    const cur = stageMass[i];
    
    // Find maximum passed through any downstream stage (j > i)
    let maxDownstreamPassedMt = 0;
    let maxDownstreamPassedPcs = 0;
    let maxDownstreamPassedMtr = 0;

    for (let j = i + 1; j < stageMass.length; j++) {
      const down = stageMass[j];
      const downTotalMt = down.grossMt + down.rejMt;
      const downTotalPcs = down.gross_output_pcs + down.rejection_pcs;
      const downTotalMtr = down.gross_output_mtr + down.rejection_mtr;
      if (downTotalMt > maxDownstreamPassedMt) maxDownstreamPassedMt = downTotalMt;
      if (downTotalPcs > maxDownstreamPassedPcs) maxDownstreamPassedPcs = downTotalPcs;
      if (downTotalMtr > maxDownstreamPassedMtr) maxDownstreamPassedMtr = downTotalMtr;
    }

    // Material that entered this stage:
    // If sequence 1 (ROLLING), incoming is planned rolling or gross rolled.
    // If subsequent stage, incoming is previous stage's net output.
    let inMtr = cur.incoming_mtr || 0;
    let inPcs = cur.incoming_pcs || 0;
    if (i > 0) {
      const prev = stageMass[i - 1];
      if (!inMtr) inMtr = prev.net_output_mtr;
      if (!inPcs) inPcs = prev.net_output_pcs;
    }

    // Raw WIP (without downstream deduction):
    const rawWipMtr = Math.max(0, inMtr - cur.net_output_mtr - cur.rejection_mtr);
    const rawWipPcs = cur.avg_length > 0 ? Math.round(rawWipMtr / cur.avg_length) : Math.max(0, inPcs - cur.net_output_pcs - cur.rejection_pcs);
    const rawWipMt = mtFromMtr(rawWipMtr, cur.od, cur.wt);

    // Reconciled WIP with Downstream Deduction:
    // Any quantity processed by cur stage OR any downstream stage has left this queue!
    const effectivePassedMtr = Math.max(cur.net_output_mtr + cur.rejection_mtr, maxDownstreamPassedMtr);
    const effectivePassedPcs = Math.max(cur.net_output_pcs + cur.rejection_pcs, maxDownstreamPassedPcs);

    let recWipMtr = 0;
    let recWipPcs = 0;

    if (cur.stage_code === 'ROLLING') {
      // Hot Rolling WIP = rolled HTC OK minus material consumed by downstream (Draw, HT, Saw, Finishing)
      recWipMtr = Math.max(0, cur.net_output_mtr - maxDownstreamPassedMtr);
      recWipPcs = cur.avg_length > 0 ? Math.round(recWipMtr / cur.avg_length) : Math.max(0, cur.net_output_pcs - maxDownstreamPassedPcs);
    } else {
      recWipMtr = Math.max(0, inMtr - effectivePassedMtr);
      recWipPcs = cur.avg_length > 0 ? Math.round(recWipMtr / cur.avg_length) : Math.max(0, inPcs - effectivePassedPcs);
    }

    const recWipMt = mtFromMtr(recWipMtr, cur.od, cur.wt);

    reconciledStages.push({
      stage_code: cur.stage_code,
      sequence_no: cur.sequence_no,
      raw_wip_mtr: rawWipMtr,
      raw_wip_pcs: rawWipPcs,
      raw_wip_mt: rawWipMt,
      reconciled_wip_mtr: recWipMtr,
      reconciled_wip_pcs: recWipPcs,
      reconciled_wip_mt: recWipMt,
      capped_wip_mtr: recWipMtr,
      capped_wip_pcs: recWipPcs,
      capped_wip_mt: recWipMt,
      od: cur.od,
      wt: cur.wt,
    });
  }

  // 4. Mass Conservation Capping
  const rawTotalMt = reconciledStages.reduce((s, r) => s + r.raw_wip_mt, 0);
  const recTotalMt = reconciledStages.reduce((s, r) => s + r.reconciled_wip_mt, 0);

  if (chargedBilletMt > 0 && recTotalMt > maxPhysicalWipMt && recTotalMt > 0) {
    const scaleFactor = maxPhysicalWipMt / recTotalMt;
    for (const st of reconciledStages) {
      st.capped_wip_mt = Number((st.reconciled_wip_mt * scaleFactor).toFixed(3));
      st.capped_wip_mtr = Number((st.reconciled_wip_mtr * scaleFactor).toFixed(2));
      st.capped_wip_pcs = Math.round(st.reconciled_wip_pcs * scaleFactor);
    }
  }

  return {
    work_order_id: '',
    work_order_no: '',
    total_charged_mt: chargedBilletMt,
    total_finished_mt: totalFinishedMt,
    total_scrap_mt: totalScrapMt,
    max_physical_wip_mt: maxPhysicalWipMt,
    raw_total_wip_mt: rawTotalMt,
    reconciled_total_wip_mt: Math.min(recTotalMt, maxPhysicalWipMt > 0 ? maxPhysicalWipMt : recTotalMt),
    stages: reconciledStages,
  };
}
