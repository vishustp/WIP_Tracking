// lib/campaignWipUtils.ts
import { reconcileWorkOrderWip, StageWipInput, WorkOrderWipSummary } from './wipReconciliation';
import { extractPcsFromRemarks } from './productionUtils';

export interface MotherHollowInfo {
  mh_od?: number | null;
  mh_wt?: number | null;
  mh_l1?: number | null;
  mh_l2?: number | null;
  mh_avg_length?: number | null;
  planned_qty?: number | null;
  multiple?: number | null;
}

export interface CampaignHierarchyMaps {
  campaignMembersMap: Map<string, Set<string>>;
  childToMasterMap: Map<string, string>;
  mhMap: Map<string, MotherHollowInfo>;
}

/**
 * Builds campaign hierarchy and Mother Hollow specification lookups from rolling plans
 */
export function buildCampaignHierarchyMaps(rollingPlans: any[]): CampaignHierarchyMaps {
  const campaignMembersMap = new Map<string, Set<string>>();
  const childToMasterMap = new Map<string, string>();
  const mhMap = new Map<string, MotherHollowInfo>();

  for (const p of rollingPlans) {
    try {
      const parsed = typeof p.status === 'string' ? JSON.parse(p.status) : p.status;
      if (parsed?.is_master && Array.isArray(parsed?.child_work_orders) && parsed.child_work_orders.length > 0) {
        const members = new Set<string>();
        if (p.work_order_id) members.add(p.work_order_id);
        for (const c of parsed.child_work_orders) {
          const cId = c.work_order_id || c.id;
          if (cId) {
            members.add(cId);
            childToMasterMap.set(cId, p.work_order_id);
          }
        }
        if (p.work_order_id) campaignMembersMap.set(p.work_order_id, members);
      } else if (parsed?.is_child && parsed?.master_wo_id && p.work_order_id) {
        childToMasterMap.set(p.work_order_id, parsed.master_wo_id);
        const members = campaignMembersMap.get(parsed.master_wo_id) || new Set<string>([parsed.master_wo_id]);
        members.add(p.work_order_id);
        campaignMembersMap.set(parsed.master_wo_id, members);
      }

      const mhOd = Number(p.mh_od || parsed?.mh_od || parsed?.cust_od || parsed?.sm?.cust_od || parsed?.sizing_mill?.cust_od || 0) || null;
      const mhWt = Number(p.mh_wt || parsed?.mh_wt || parsed?.cust_wt || parsed?.sm?.rolling_wt || parsed?.sm?.cust_wt || parsed?.sizing_mill?.rolling_wt || 0) || null;
      const mhL1 = Number(p.mh_l1 || parsed?.mh_l1 || parsed?.sm?.sm_len || 0) || null;
      const mhL2 = Number(p.mh_l2 || parsed?.mh_l2 || parsed?.sm?.sm_len || 0) || null;
      const mhAvg = mhL1 && mhL2 ? (mhL1 + mhL2) / 2 : mhL1 || mhL2 || null;
      const multiple = Number(p.multiple || parsed?.multiple || 1);

      const info: MotherHollowInfo = {
        mh_od: mhOd,
        mh_wt: mhWt,
        mh_l1: mhL1,
        mh_l2: mhL2,
        mh_avg_length: mhAvg,
        planned_qty: p.planned_qty,
        multiple,
      };

      if (p.work_order_id) mhMap.set(p.work_order_id, info);
      if (parsed?.master_wo_id) mhMap.set(parsed.master_wo_id, info);
      if (parsed?.master_wo_no) mhMap.set(String(parsed.master_wo_no).trim(), info);
      if (parsed?.is_master && Array.isArray(parsed?.child_work_orders)) {
        for (const c of parsed.child_work_orders) {
          const cId = c.work_order_id || c.id;
          if (cId) mhMap.set(cId, info);
        }
      }
    } catch {}
  }

  return { campaignMembersMap, childToMasterMap, mhMap };
}

export interface PrepareCampaignWipParams {
  woId: string;
  wo: any;
  rows: any[];
  qcInspections: any[];
  productionLogs: any[];
  hierarchyMaps: CampaignHierarchyMaps;
  finishingStageId?: string;
}

export interface PreparedCampaignWipResult {
  summary: WorkOrderWipSummary;
  isChild: boolean;
  isMaster: boolean;
  planMh: MotherHollowInfo | undefined;
  routeCode: string;
  actualMhLen: number;
  mhOd: number;
  mhWt: number;
}

/**
 * Reconciles WIP for a work order, handling campaign pooling, direct vs child QC inspection allocation,
 * and downstream finishing stage synthesis.
 */
export function reconcileCampaignWorkOrderWip(params: PrepareCampaignWipParams): PreparedCampaignWipResult {
  const { woId, wo, rows, qcInspections, productionLogs, hierarchyMaps, finishingStageId } = params;
  const { campaignMembersMap, childToMasterMap, mhMap } = hierarchyMaps;

  const planMh = mhMap.get(woId) || mhMap.get(String(wo?.work_order_no).trim());
  const routeCode = rows[0]?.route_code || 'CDS';

  const rollStage = rows.find((r: any) => (r.stage_code || '').toUpperCase() === 'ROLLING');
  const rollPcs = Number(rollStage?.gross_output_pcs || 0);
  const rollMtr = Number(rollStage?.gross_output_mtr || rollStage?.production_qty || 0);
  const actualMhLen = (rollPcs > 0 && rollMtr > 0)
    ? Number((rollMtr / rollPcs).toFixed(3))
    : Number(planMh?.mh_avg_length || 6.0);

  const mhOd = Number(planMh?.mh_od || rollStage?.mh_od || rollStage?.od || wo?.size_od || 0);
  const mhWt = Number(planMh?.mh_wt || rollStage?.mh_wt || rollStage?.wt || wo?.size_wt || 0);

  // Direct QC inspections for this specific work order
  let directVdiOkMtr = 0;
  let directVdiOkPcs = 0;
  let directVdiRejMtr = 0;
  let directVdiRejPcs = 0;
  qcInspections.forEach((qc: any) => {
    if (qc.work_order_id === woId) {
      directVdiOkMtr += Number(qc.vdi_ok_mtr || 0);
      directVdiOkPcs += Number(qc.vdi_ok_pcs || 0);
      directVdiRejMtr += Number(qc.vdi_rejection_mtr || 0) + Number(qc.vdi_salvage_mtr || 0);
      directVdiRejPcs += Number(qc.vdi_rejection_pcs || 0) + Number(qc.vdi_salvage_pcs || 0);
    }
  });

  // Direct Finishing production logs for this specific work order
  let directFinMtr = 0;
  let directFinPcs = 0;
  productionLogs.forEach((l: any) => {
    if (l.work_order_id === woId) {
      const sc = (l.process_stages?.stage_code || l.stage_code || '').toUpperCase();
      const isFinLog = (finishingStageId && l.stage_id === finishingStageId) || sc === 'FINISHING' || sc === 'CUTTING';
      if (isFinLog) {
        directFinMtr += Number(l.output_qty || 0);
        const { pcs: pPcs } = extractPcsFromRemarks(l.remarks);
        directFinPcs += pPcs || 0;
      }
    }
  });

  // Campaign aggregation for Master work orders
  const campaignMembers = campaignMembersMap.get(woId);
  let campaignVdiOkMtr = directVdiOkMtr;
  let campaignVdiOkPcs = directVdiOkPcs;
  let campaignVdiRejMtr = directVdiRejMtr;
  let campaignVdiRejPcs = directVdiRejPcs;
  let campaignFinMtr = 0;
  let campaignFinPcs = 0;

  if (campaignMembers && campaignMembers.size > 1) {
    qcInspections.forEach((qc: any) => {
      if (qc.work_order_id !== woId && campaignMembers.has(qc.work_order_id)) {
        campaignVdiOkMtr += Number(qc.vdi_ok_mtr || 0);
        campaignVdiOkPcs += Number(qc.vdi_ok_pcs || 0);
        campaignVdiRejMtr += Number(qc.vdi_rejection_mtr || 0) + Number(qc.vdi_salvage_mtr || 0);
        campaignVdiRejPcs += Number(qc.vdi_rejection_pcs || 0) + Number(qc.vdi_salvage_pcs || 0);
      }
    });
    productionLogs.forEach((l: any) => {
      const sc = (l.process_stages?.stage_code || l.stage_code || '').toUpperCase();
      const isFinLog = (finishingStageId && l.stage_id === finishingStageId) || sc === 'FINISHING' || sc === 'CUTTING';
      if (campaignMembers.has(l.work_order_id) && isFinLog) {
        campaignFinMtr += Number(l.output_qty || 0);
        const { pcs: pPcs } = extractPcsFromRemarks(l.remarks);
        campaignFinPcs += pPcs || (actualMhLen > 0 ? Math.round(Number(l.output_qty || 0) / actualMhLen) : 0);
      }
    });
  }

  const isChild = childToMasterMap.has(woId);
  const isMaster = Boolean(campaignMembers && campaignMembers.size > 1);

  // Ensure finishing stage is present if child order has VDI output
  let stageRows = [...rows];
  if (isChild && directVdiOkPcs > 0 && !stageRows.some((r) => (r.stage_code || '').toUpperCase() === 'FINISHING')) {
    const maxSeq = Math.max(...stageRows.map((r) => Number(r.sequence_no || 0)), 6);
    stageRows.push({
      work_order_id: woId,
      stage_code: 'FINISHING',
      sequence_no: maxSeq + 1,
      gross_output_mtr: 0,
      gross_output_pcs: 0,
      rejection_mtr: 0,
      rejection_pcs: 0,
      net_output_mtr: 0,
      net_output_pcs: 0,
    });
  }

  const summary = reconcileWorkOrderWip(
    stageRows.map((r: any) => {
      const sc = (r.stage_code || '').toUpperCase();
      const isRoll = sc === 'ROLLING';
      const isVdi = sc === 'VDI';
      const isFin = sc === 'FINISHING';

      const rawMtr = Number(r.production_qty || r.gross_output_mtr || 0);
      const rawPcs = Number(r.gross_output_pcs || 0);
      const rawRejMtr = Number(r.rejection_mtr || 0);
      const rawRejPcs = Number(r.rejection_pcs || 0);

      let grossMtr = rawMtr;
      let grossPcs = rawPcs;
      let rejMtr = rawRejMtr;
      let rejPcs = rawRejPcs;
      let netMtr = Number(r.net_output_mtr || 0);
      let netPcs = Number(r.net_output_pcs || 0);
      let incomingPcsOverride: number | undefined = undefined;
      let incomingMtrOverride: number | undefined = undefined;

      const stageAvgLen = Number(r.avg_length || (r.l1 && r.l2 ? (Number(r.l1) + Number(r.l2)) / 2 : r.l1 || r.l2 || 6.0));

      if (isRoll) {
        grossMtr = rollMtr > 0 ? rollMtr : rawMtr;
        grossPcs = rollPcs > 0 ? rollPcs : rawPcs;
        rejMtr = rawRejMtr;
        rejPcs = rawRejPcs;
        netMtr = Math.max(0, grossMtr - rejMtr);
        netPcs = Math.max(0, grossPcs - rejPcs);
      } else if (isVdi) {
        if (isMaster) {
          grossMtr = Math.max(rawMtr, campaignVdiOkMtr + campaignVdiRejMtr);
          grossPcs = Math.max(rawPcs, campaignVdiOkPcs + campaignVdiRejPcs);
          rejMtr = Math.max(rawRejMtr, campaignVdiRejMtr);
          rejPcs = Math.max(rawRejPcs, campaignVdiRejPcs);
          netMtr = campaignVdiOkMtr > 0 ? campaignVdiOkMtr : Math.max(0, rawMtr - rawRejMtr);
          netPcs = campaignVdiOkPcs > 0 ? campaignVdiOkPcs : Math.max(0, rawPcs - rawRejPcs);
        } else {
          grossMtr = Math.max(rawMtr, directVdiOkMtr + directVdiRejMtr);
          grossPcs = Math.max(rawPcs, directVdiOkPcs + directVdiRejPcs);
          rejMtr = Math.max(rawRejMtr, directVdiRejMtr);
          rejPcs = Math.max(rawRejPcs, directVdiRejPcs);
          netMtr = directVdiOkMtr > 0 ? directVdiOkMtr : Math.max(0, rawMtr - rawRejMtr);
          netPcs = directVdiOkPcs > 0 ? directVdiOkPcs : Math.max(0, rawPcs - rawRejPcs);
          if (isChild) {
            incomingPcsOverride = 0; // Cut pieces are pooled under Master
            incomingMtrOverride = 0;
          }
        }
      } else if (isFin) {
        if (isMaster && campaignMembers && campaignMembers.size > 1) {
          // In a master-child rolling campaign, finishing bundling is tracked under individual child work orders.
          // The master work order itself has no active finishing queue to prevent double-counting.
          grossMtr = 0;
          grossPcs = 0;
          rejMtr = 0;
          rejPcs = 0;
          netMtr = 0;
          netPcs = 0;
          incomingPcsOverride = 0;
          incomingMtrOverride = 0;
        } else {
          grossMtr = Math.max(rawMtr, directFinMtr);
          grossPcs = Math.max(rawPcs, directFinPcs);
          netMtr = Math.max(0, grossMtr - rejMtr);
          netPcs = Math.max(0, grossPcs - rejPcs);
          const vdiPassedPcs = isMaster ? campaignVdiOkPcs : directVdiOkPcs;
          const vdiPassedMtr = isMaster ? campaignVdiOkMtr : directVdiOkMtr;
          incomingPcsOverride = vdiPassedPcs > 0 ? vdiPassedPcs : Number(r.incoming_qty_pcs || (stageAvgLen > 0 ? Math.round(Number(r.incoming_qty || 0) / stageAvgLen) : 0));
          incomingMtrOverride = vdiPassedMtr > 0 ? vdiPassedMtr : Number(r.incoming_qty || 0);
        }
      }

      const divInMtr = Number(r.diversion_in || 0);
      const divOutMtr = Number(r.diversion_out || 0);
      const divInPcs = stageAvgLen > 0 ? Math.round(divInMtr / stageAvgLen) : 0;
      const divOutPcs = stageAvgLen > 0 ? Math.round(divOutMtr / stageAvgLen) : 0;

      return {
        stage_code: sc,
        sequence_no: Number(r.sequence_no || 0),
        gross_output_mtr: grossMtr,
        gross_output_pcs: grossPcs,
        rejection_mtr: rejMtr,
        rejection_pcs: rejPcs,
        net_output_mtr: netMtr,
        net_output_pcs: netPcs,
        incoming_pcs: incomingPcsOverride,
        incoming_mtr: incomingMtrOverride !== undefined ? incomingMtrOverride : Number(r.incoming_qty || 0),
        diversion_in_mtr: divInMtr,
        diversion_in_pcs: divInPcs,
        diversion_out_mtr: divOutMtr,
        diversion_out_pcs: divOutPcs,
        od: Number(r.od || r.size_od || wo?.size_od || 0),
        wt: Number(r.wt || r.size_wt || wo?.size_wt || 0),
        avg_length: stageAvgLen,
        mh_od: mhOd > 0 ? mhOd : undefined,
        mh_wt: mhWt > 0 ? mhWt : undefined,
        mh_avg_length: actualMhLen > 0 ? actualMhLen : undefined,
      };
    }),
    {
      route_code: routeCode,
      ordered_qty_mt: Number(wo?.ordered_qty_mt || 0),
      rolling_plan_qty_mtr: Number(planMh?.planned_qty || 0),
      mh_od: mhOd > 0 ? mhOd : undefined,
      mh_wt: mhWt > 0 ? mhWt : undefined,
      mh_avg_length: actualMhLen > 0 ? actualMhLen : undefined,
      multiple: planMh?.multiple || undefined,
    }
  );

  return {
    summary,
    isChild,
    isMaster,
    planMh,
    routeCode,
    actualMhLen,
    mhOd,
    mhWt,
  };
}
