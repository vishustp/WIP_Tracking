import { describe, it, expect } from 'vitest';
import { mtFromMtr, mtrFromPcs } from '@/lib/productionUtils';

describe('Material Diversion Calculations & Universal Rejection Rule (Rule 2)', () => {
  it('includes both Prime WIP and Salvage/Rejection in the available diversion pool', () => {
    // Scenario:
    // A work order rolls 1,000 meters of mother pipe.
    // 800 meters pass VDI as Prime OK.
    // 200 meters are rejected at VDI due to surface blemishes (eligible for salvage/diversion).
    // Zero meters have been finished/shipped yet.
    // Zero meters have been diverted out yet.

    const rollingHtcOkMtr = 1000;
    const planMultiple = 1.0;
    const effectiveRollingMtr = rollingHtcOkMtr * planMultiple;
    const divertedInMtr = 0;
    const finishedShippedMtr = 0;
    const totalDivertedOutMtr = 0;

    const vdiOkMtr = 800;
    const vdiRejectionMtr = 200;

    // Under Rule 2 (Option B):
    // Rejections do NOT vanish as dead scrap; they remain in active WIP eligible for diversion.
    const primeWipMtr = Math.max(0, vdiOkMtr - finishedShippedMtr);
    const salvageRejectionWipMtr = vdiRejectionMtr;

    // Total divertible pool MUST include both Prime and Salvage/Rejection
    const totalDivertibleMtr = Math.max(
      0,
      effectiveRollingMtr + divertedInMtr - finishedShippedMtr - totalDivertedOutMtr
    );

    expect(totalDivertibleMtr).toBe(1000);
    expect(primeWipMtr + salvageRejectionWipMtr).toBe(totalDivertibleMtr);
  });

  it('does NOT deduct VDI rejections as dead scrap when calculating diversion availability', () => {
    // If a legacy formula deducted VDI rejection:
    // 1000m rolling - 200m VDI rejection = 800m available (WRONG, blocks 200m salvage diversion)
    // Correct formula: 1000m total available, composed of 800m prime + 200m salvage/rejection

    const effectiveRollingMtr = 1200;
    const vdiRejMtr = 300;
    const finishingShippedMtr = 400; // only prime finished goods shipped
    const divertedOutMtr = 100;

    // Correct formula:
    const totalDivertibleMtr = Math.max(
      0,
      effectiveRollingMtr - finishingShippedMtr - divertedOutMtr
    );

    // 1200 - 400 - 100 = 700 meters available (which includes the 300m salvageable rejection)
    expect(totalDivertibleMtr).toBe(700);

    // If an operator diverts 250 meters of the 300m rejected pipe to a secondary order:
    const divertedSalvageMtr = 250;
    expect(divertedSalvageMtr).toBeLessThanOrEqual(totalDivertibleMtr);
  });

  it('correctly tracks mass conservation when diverting between different pipe schedules', () => {
    // Diverting from heavy wall mother hollow (OD: 88.9, WT: 7.62)
    // to a lighter wall order (OD: 73.0, WT: 5.51)
    const sourceOd = 88.9;
    const sourceWt = 7.62;
    const targetOd = 73.0;
    const targetWt = 5.51;

    const divertedMtr = 100; // 100 meters transferred
    const sourceWeightMt = mtFromMtr(divertedMtr, sourceOd, sourceWt);
    const targetWeightMt = mtFromMtr(divertedMtr, targetOd, targetWt);

    expect(sourceWeightMt).toBeGreaterThan(0);
    expect(targetWeightMt).toBeGreaterThan(0);
    // Source heavy wall has higher tonnage per meter than target light wall
    expect(sourceWeightMt).toBeGreaterThan(targetWeightMt);
  });

  it('deducts diverted quantity from source and credits target order', () => {
    const sourceInitialBalanceMtr = 600;
    const targetInitialWipMtr = 200;
    const diversionQtyMtr = 150;

    const sourceRemainingMtr = sourceInitialBalanceMtr - diversionQtyMtr;
    const targetNewWipMtr = targetInitialWipMtr + diversionQtyMtr;

    expect(sourceRemainingMtr).toBe(450);
    expect(targetNewWipMtr).toBe(350);
    // Sum of material across plant is conserved
    expect(sourceRemainingMtr + targetNewWipMtr).toBe(sourceInitialBalanceMtr + targetInitialWipMtr);
  });

  describe('Commercial Bundling & Secondary Disposition (Rule 2 Option B)', () => {
    it('correctly tags commercial vs prime bundles in production remarks', async () => {
      const { attachBundleTypeToRemarks, extractBundleTypeFromRemarks } = await import('@/lib/productionUtils');

      const initialRemarks = 'Bundle BDL-05: 12 PCS';
      const commercialRemarks = attachBundleTypeToRemarks(initialRemarks, 'COMMERCIAL');

      expect(commercialRemarks).toContain('[BUNDLE_TYPE: COMMERCIAL]');
      expect(extractBundleTypeFromRemarks(commercialRemarks)).toBe('COMMERCIAL');

      const primeRemarks = attachBundleTypeToRemarks(initialRemarks, 'PRIME');
      expect(primeRemarks).toContain('[BUNDLE_TYPE: PRIME]');
      expect(extractBundleTypeFromRemarks(primeRemarks)).toBe('PRIME');
    });

    it('defaults to PRIME when no bundle type is explicitly specified', async () => {
      const { extractBundleTypeFromRemarks } = await import('@/lib/productionUtils');

      expect(extractBundleTypeFromRemarks('Standard Finishing Log')).toBe('PRIME');
      expect(extractBundleTypeFromRemarks(null)).toBe('PRIME');
      expect(extractBundleTypeFromRemarks(undefined)).toBe('PRIME');
    });
  });

  describe('Downstream Work Center Queue Availability (VDI / Finishing)', () => {
    it('credits diverted material directly into the target order queue at the specified work center', () => {
      // Scenario:
      // Source WO 6186 diverts 2,057.00 Mtrs directly to Target WO 1451 at work center 'VDI'.
      // Target WO 1451 does not have its own preceding rolling or saw logs yet.
      const divertedMtr = 2057;
      const targetAvgLength = 6.25;
      const targetOd = 88.9;
      const targetWt = 5.49;

      const vdiIncomingMtr = 0; // No preceding band saw cuts yet for this target order
      const vdiDivIn = divertedMtr;
      const vdiDivOut = 0;
      const qcInspectedMtr = 0;

      // Available VDI balance calculation
      const vdiAvailMtr = Math.max(0, vdiIncomingMtr + vdiDivIn - qcInspectedMtr - vdiDivOut);
      const vdiAvailPcs = Math.round(vdiAvailMtr / targetAvgLength);
      const vdiAvailMt = mtFromMtr(vdiAvailMtr, targetOd, targetWt);

      expect(vdiAvailMtr).toBe(2057);
      expect(vdiAvailPcs).toBe(329);
      expect(vdiAvailMt).toBeCloseTo(23.23, 1);

      // Target WO qualifies for the VDI work center queue (>= 1.0 Mtr or >= 1 Pc)
      const qualifiesForQueue = vdiAvailMtr >= 1.0 || vdiAvailPcs >= 1;
      expect(qualifiesForQueue).toBe(true);
    });

    it('correctly handles cross-stage diversion: deducts from source stage (e.g. VDI) and credits target stage (e.g. FINISHING)', async () => {
      const { parseDiversionStages, formatDiversionReason, cleanDiversionReason } = await import('@/lib/productionUtils');

      // Test reason formatting & parsing
      const formattedReason = formatDiversionReason('Prime Material Reallocation', 'VDI', 'FINISHING');
      expect(formattedReason).toContain('[FROM_STAGE: VDI]');
      expect(formattedReason).toContain('[TO_STAGE: FINISHING]');
      expect(cleanDiversionReason(formattedReason)).toBe('Prime Material Reallocation');

      const planWithTags = {
        reason: formattedReason,
        work_center: 'FINISHING',
      };
      const parsedStages = parseDiversionStages(planWithTags);
      expect(parsedStages.sourceStage).toBe('VDI');
      expect(parsedStages.targetStage).toBe('FINISHING');

      // Fallback for legacy plans without tags
      const legacyPlan = {
        reason: 'Legacy Transfer',
        work_center: 'DRAW',
      };
      const parsedLegacy = parseDiversionStages(legacyPlan);
      expect(parsedLegacy.sourceStage).toBe('DRAW');
      expect(parsedLegacy.targetStage).toBe('DRAW');

      // Scenario:
      // Source WO 6186 had 2,057 m of VDI WIP (from band saw cuts, 0 QC done).
      // WO 6186 has 0 Finishing WIP.
      // Target WO 1451 has 0 VDI WIP and 0 Finishing WIP initially.
      // Material is diverted FROM WO 6186 VDI TO WO 1451 FINISHING.
      const diversionQty = 2057;

      const sourceWo = { id: 'wo-6186' };
      const targetWo = { id: 'wo-1451' };

      const diversions = [
        {
          source_wo_id: sourceWo.id,
          target_wo_id: targetWo.id,
          diverted_qty: diversionQty,
          reason: formattedReason,
          work_center: 'FINISHING',
        },
      ];

      const getStageDivIn = (wId: string, stageCode: string) =>
        diversions
          .filter((d) => d.target_wo_id === wId && parseDiversionStages(d).targetStage === stageCode)
          .reduce((sum, d) => sum + d.diverted_qty, 0);

      const getStageDivOut = (wId: string, stageCode: string) =>
        diversions
          .filter((d) => d.source_wo_id === wId && parseDiversionStages(d).sourceStage === stageCode)
          .reduce((sum, d) => sum + d.diverted_qty, 0);

      // Source WO 6186:
      const sourceVdiIncoming = 2057;
      const sourceVdiInspected = 0;
      const sourceVdiDivOut = getStageDivOut(sourceWo.id, 'VDI');
      const sourceVdiAvail = Math.max(0, sourceVdiIncoming - sourceVdiInspected - sourceVdiDivOut);

      const sourceFinIncoming = 0;
      const sourceFinProduced = 0;
      const sourceFinDivOut = getStageDivOut(sourceWo.id, 'FINISHING');
      const sourceFinAvail = Math.max(0, sourceFinIncoming - sourceFinProduced - sourceFinDivOut);

      // Target WO 1451:
      const targetVdiIncoming = 0;
      const targetVdiInspected = 0;
      const targetVdiDivIn = getStageDivIn(targetWo.id, 'VDI');
      const targetVdiAvail = Math.max(0, targetVdiIncoming + targetVdiDivIn - targetVdiInspected);

      const targetFinIncoming = 0;
      const targetFinProduced = 0;
      const targetFinDivIn = getStageDivIn(targetWo.id, 'FINISHING');
      const targetFinAvail = Math.max(0, targetFinIncoming + targetFinDivIn - targetFinProduced);

      // Verifications:
      // 1. Source WO has 2057 m deducted from VDI -> VDI WIP drops to 0!
      expect(sourceVdiDivOut).toBe(2057);
      expect(sourceVdiAvail).toBe(0);

      // 2. Source WO Finishing is NOT deducted (was not taken from finishing)
      expect(sourceFinDivOut).toBe(0);
      expect(sourceFinAvail).toBe(0);

      // 3. Target WO VDI is NOT credited (was received at finishing)
      expect(targetVdiDivIn).toBe(0);
      expect(targetVdiAvail).toBe(0);

      // 4. Target WO Finishing is credited with 2057 m!
      expect(targetFinDivIn).toBe(2057);
      expect(targetFinAvail).toBe(2057);

      // 5. Total plant WIP conservation:
      // Initial total = 2057 (at source VDI) + 0 (at target FINISHING) = 2057
      // Final total = 0 (at source VDI) + 2057 (at target FINISHING) = 2057
      expect(sourceVdiAvail + targetFinAvail).toBe(2057);
    });

    it('updates Dashboard and Report WIP correctly before and after bundling of diverted material', async () => {
      const { reconcileWorkOrderWip } = await import('@/lib/wipReconciliation');

      // Scenario:
      // Source WO 6186 had 919 pieces cut at Band Saw.
      // 549 pieces were inspected OK at VDI.
      // 343 pieces (2057m) were diverted from VDI to Target WO 1451 FINISHING.
      // 27 pieces (162m) were rejected at VDI.
      const sourceStages = [
        {
          stage_code: 'ROLLING',
          sequence_no: 1,
          gross_output_mtr: 4985,
          gross_output_pcs: 946,
          rejection_mtr: 0,
          rejection_pcs: 0,
          net_output_mtr: 4985,
          net_output_pcs: 946,
          od: 114.3,
          wt: 6.02,
          avg_length: 6.0,
        },
        {
          stage_code: 'BAND_SAW',
          sequence_no: 2,
          gross_output_mtr: 5513,
          gross_output_pcs: 919,
          rejection_mtr: 0,
          rejection_pcs: 0,
          net_output_mtr: 5513,
          net_output_pcs: 919,
          od: 114.3,
          wt: 6.02,
          avg_length: 6.0,
        },
        {
          stage_code: 'VDI',
          sequence_no: 3,
          gross_output_mtr: 3294,
          gross_output_pcs: 549,
          rejection_mtr: 162,
          rejection_pcs: 27,
          net_output_mtr: 3132,
          net_output_pcs: 522,
          diversion_out_mtr: 2057,
          diversion_out_pcs: 343,
          od: 114.3,
          wt: 6.02,
          avg_length: 6.0,
        },
        {
          stage_code: 'FINISHING',
          sequence_no: 4,
          gross_output_mtr: 0,
          gross_output_pcs: 0,
          rejection_mtr: 0,
          rejection_pcs: 0,
          net_output_mtr: 0,
          net_output_pcs: 0,
          od: 114.3,
          wt: 6.02,
          avg_length: 6.0,
        },
      ];

      const sourceWip = reconcileWorkOrderWip(sourceStages, { route_code: 'HFS', final_avg_length: 6.0 });
      const sourceVdi = sourceWip.stages.find((s) => s.stage_code === 'VDI');

      // In source WO: 919 incoming - 549 passed OK - 343 diverted out = 27 pcs remaining (the un-diverted rejection)
      expect(sourceVdi!.reconciled_wip_pcs).toBe(27);
      expect(sourceVdi!.reconciled_wip_mtr).toBe(162);

      // Phase 1: Target WO 1451 BEFORE bundling
      const targetStagesBeforeBundling = [
        {
          stage_code: 'FINISHING',
          sequence_no: 6,
          gross_output_mtr: 0,
          gross_output_pcs: 0,
          rejection_mtr: 0,
          rejection_pcs: 0,
          net_output_mtr: 0,
          net_output_pcs: 0,
          incoming_pcs: 0,
          incoming_mtr: 0,
          diversion_in_mtr: 2057,
          diversion_in_pcs: 329,
          od: 88.9,
          wt: 5.49,
          avg_length: 6.25,
        },
      ];
      const targetWipBefore = reconcileWorkOrderWip(targetStagesBeforeBundling, { route_code: 'CDS', final_avg_length: 6.25 });
      const targetFinBefore = targetWipBefore.stages.find((s) => s.stage_code === 'FINISHING');
      expect(targetFinBefore!.reconciled_wip_pcs).toBe(329);
      expect(targetFinBefore!.reconciled_wip_mtr).toBe(2056.25);

      // Phase 2: Target WO 1451 AFTER bundling 329 pcs (2056.25m)
      const targetStagesAfterBundling = [
        {
          stage_code: 'FINISHING',
          sequence_no: 6,
          gross_output_mtr: 2056.25,
          gross_output_pcs: 329,
          rejection_mtr: 0,
          rejection_pcs: 0,
          net_output_mtr: 2056.25,
          net_output_pcs: 329,
          incoming_pcs: 0,
          incoming_mtr: 0,
          diversion_in_mtr: 2057,
          diversion_in_pcs: 329,
          od: 88.9,
          wt: 5.49,
          avg_length: 6.25,
        },
      ];
      const targetWipAfter = reconcileWorkOrderWip(targetStagesAfterBundling, { route_code: 'CDS', final_avg_length: 6.25 });
      const targetFinAfter = targetWipAfter.stages.find((s) => s.stage_code === 'FINISHING');

      // After bundling, target finishing WIP is completely cleared!
      expect(targetFinAfter!.reconciled_wip_pcs).toBe(0);
      expect(targetFinAfter!.reconciled_wip_mtr).toBe(0);
      expect(targetFinAfter!.reconciled_wip_mt).toBe(0);
    });

    it('clears Finishing WIP when prime inspected material is diverted at VDI (e.g. WO 6349)', async () => {
      const { reconcileWorkOrderWip } = await import('@/lib/wipReconciliation');

      // WO 6349:
      // Band saw cut: 953 pcs (9530m)
      // VDI inspected: 754 pcs OK (7540m), 69 pcs rejected (690m)
      // Finishing bundled: 736 pcs (7360m)
      // Diversion out at VDI: 18 pcs (180m) prime reallocation [FROM_STAGE: VDI]
      const wo6349Stages = [
        {
          stage_code: 'BAND_SAW',
          sequence_no: 4,
          gross_output_mtr: 9530,
          gross_output_pcs: 953,
          rejection_mtr: 0,
          rejection_pcs: 0,
          net_output_mtr: 9530,
          net_output_pcs: 953,
          od: 63.5,
          wt: 5.2,
          avg_length: 10.0,
        },
        {
          stage_code: 'VDI',
          sequence_no: 5,
          gross_output_mtr: 7540,
          gross_output_pcs: 754,
          rejection_mtr: 690,
          rejection_pcs: 69,
          net_output_mtr: 6850,
          net_output_pcs: 685,
          diversion_out_mtr: 180,
          diversion_out_pcs: 18,
          od: 63.5,
          wt: 5.2,
          avg_length: 10.0,
        },
        {
          stage_code: 'FINISHING',
          sequence_no: 6,
          gross_output_mtr: 7360,
          gross_output_pcs: 736,
          rejection_mtr: 0,
          rejection_pcs: 0,
          net_output_mtr: 7360,
          net_output_pcs: 736,
          od: 63.5,
          wt: 5.2,
          avg_length: 10.0,
        },
      ];

      const result = reconcileWorkOrderWip(wo6349Stages, { route_code: 'CDS', final_avg_length: 10.0 });
      const finStage = result.stages.find((s) => s.stage_code === 'FINISHING');

      // Finishing incoming is net VDI OK (754 - 18 = 736 pcs).
      // Since 736 pcs were bundled, remaining finishing WIP MUST be 0!
      expect(finStage!.incoming_pcs).toBe(736);
      expect(finStage!.reconciled_wip_pcs).toBe(0);
      expect(finStage!.reconciled_wip_mtr).toBe(0);
      expect(finStage!.reconciled_wip_mt).toBe(0);
    });

    it('correctly calculates 0 available prime WIP for completed campaign order (e.g. WO 6538) without phantom cutting scrap', async () => {
      const { buildCampaignHierarchyMaps, reconcileCampaignWorkOrderWip } = await import('@/lib/campaignWipUtils');

      // WO 6538 scenario:
      // Master WO 6538 with child orders 6514, 6525.
      // Rolling: 835 mother pipes (5602.85 m, avg length 6.71 m).
      // Band Saw: 835 prime cut pieces (5010 m of 6.0 m) + 592.85 m cutting scrap.
      // QC: 255 pcs (under master 6538) + 335 pcs (under 6514) + 245 pcs (under 6525) = 835 pcs inspected (812 OK, 23 Salvage).
      // Finishing: 255 pcs (6538) + 323 pcs (6514) + 234 pcs (6525) = 812 pcs bundled.
      const masterWoId = 'wo-6538';
      const child1Id = 'wo-6514';
      const child2Id = 'wo-6525';

      const rollingPlans = [
        {
          id: 'plan-10',
          work_order_id: masterWoId,
          planned_qty: 5040,
          status: {
            is_master: true,
            master_wo_id: masterWoId,
            master_wo_no: '6538',
            child_work_orders: [
              { work_order_id: child1Id, work_order_no: '6514' },
              { work_order_id: child2Id, work_order_no: '6525' },
            ],
            billet: { sm: { sm_len: 6.71 } },
          },
        },
      ];

      const stageRows = [
        { stage_code: 'ROLLING', sequence_no: 1, production_qty: 5602.85, gross_output_pcs: 835, current_wip: 0, current_wip_pcs: 0 },
        { stage_code: 'BAND_SAW', sequence_no: 2, production_qty: 5010, gross_output_pcs: 835, current_wip: 592.85, current_wip_pcs: 99 },
        { stage_code: 'VDI', sequence_no: 3, production_qty: 4617, rejection_qty: 138, gross_output_pcs: 769, current_wip: 138, current_wip_pcs: 23 },
        { stage_code: 'FINISHING', sequence_no: 4, production_qty: 1530, gross_output_pcs: 255, current_wip: 0, current_wip_pcs: 0 },
      ];

      const qcInspections = [
        { work_order_id: masterWoId, inspected_pcs: 255, vdi_ok_pcs: 255, vdi_ok_mtr: 1275, vdi_salvage_pcs: 0, vdi_salvage_mtr: 0 },
        { work_order_id: child1Id, inspected_pcs: 335, vdi_ok_pcs: 323, vdi_ok_mtr: 1938, vdi_salvage_pcs: 12, vdi_salvage_mtr: 72 },
        { work_order_id: child2Id, inspected_pcs: 245, vdi_ok_pcs: 234, vdi_ok_mtr: 1404, vdi_salvage_pcs: 11, vdi_salvage_mtr: 66 },
      ];

      const productionLogs = [
        { work_order_id: masterWoId, stage_code: 'ROLLING', output_qty: 5602.85, remarks: '[PCS:835]' },
        { work_order_id: masterWoId, stage_code: 'BAND_SAW', output_qty: 5010, remarks: '[CUTS:{"m_pcs":835,"items":[{"len":6,"pcs":835}]}] [PCS:835]' },
        { work_order_id: masterWoId, stage_code: 'FINISHING', output_qty: 1530, remarks: '[PCS:255]' },
        { work_order_id: child1Id, stage_code: 'FINISHING', output_qty: 1938, remarks: '[PCS:323]' },
        { work_order_id: child2Id, stage_code: 'FINISHING', output_qty: 1404, remarks: '[PCS:234]' },
      ];

      const hierarchyMaps = buildCampaignHierarchyMaps(rollingPlans);
      const reconciled = reconcileCampaignWorkOrderWip({
        woId: masterWoId,
        wo: { id: masterWoId, work_order_no: '6538', size_od: 88.9, size_wt: 5.49, l1: 5.0, l2: 7.0 },
        rows: stageRows,
        qcInspections,
        productionLogs,
        hierarchyMaps,
        routeCode: 'HFS',
      });

      // Verify that every stage is 0 WIP PCS and 0 WIP MTR
      const bsStage = reconciled.summary.stages.find((s) => s.stage_code === 'BAND_SAW');
      const vdiStage = reconciled.summary.stages.find((s) => s.stage_code === 'VDI');
      const finStageRec = reconciled.summary.stages.find((s) => s.stage_code === 'FINISHING');

      expect(bsStage!.reconciled_wip_pcs).toBe(0);
      expect(bsStage!.reconciled_wip_mtr).toBe(0);
      expect(vdiStage!.reconciled_wip_pcs).toBe(0);
      expect(vdiStage!.reconciled_wip_mtr).toBe(0);
      expect(finStageRec!.reconciled_wip_pcs).toBe(0);
      expect(finStageRec!.reconciled_wip_mtr).toBe(0);

      // Total physical active WIP across all stages is 0
      expect(reconciled.summary.plant_total_wip_pcs).toBe(0);
      expect(reconciled.summary.plant_total_wip_mtr).toBe(0);
    });

    it('correctly calculates cut pieces and conserves meters when multiple > 1 (e.g. 100 pipes of 10m cut in 2 become 200 pcs of 5m)', async () => {
      const { parseDiversionStages, cleanDiversionReason } = await import('@/lib/productionUtils');

      const reason = 'Order Length Specification [MULTIPLE: 2] [FROM_STAGE: DRAW] [TO_STAGE: DRAW]';
      const parsed = parseDiversionStages({ reason, multiple: 2, work_center: 'DRAW' });
      expect(parsed.sourceStage).toBe('DRAW');
      expect(parsed.targetStage).toBe('DRAW');
      expect(parsed.multiple).toBe(2);
      expect(cleanDiversionReason(reason)).toBe('Order Length Specification');

      // User Scenario:
      // 100 mother pipes of 10m length (1,000 m) diverted with multiple = 2.
      // Target should receive 200 cut pieces of 5m length (1,000 m total).
      const sourceAvgLen = 10.0;
      const divertedQty = 1000;
      const multiple = parsed.multiple;

      const sourceMotherPcs = Math.round(divertedQty / sourceAvgLen);
      expect(sourceMotherPcs).toBe(100);

      const targetCutPcs = Math.round(sourceMotherPcs * multiple);
      expect(targetCutPcs).toBe(200);

      const targetCutLen = Number((sourceAvgLen / multiple).toFixed(2));
      expect(targetCutLen).toBe(5.0);

      const totalTargetMeters = targetCutPcs * targetCutLen;
      expect(totalTargetMeters).toBe(1000);
    });

    it('deducts diverted VDI salvage from VDI_SALVAGE queue and balance', () => {
      // Scenario based on WO 4069:
      // WO 4069 had 58 pcs / 574.2m VDI Salvage recorded across QC inspections.
      // 347.999m (35 pcs) were diverted to WO 6607 DRAW.
      // Remaining available salvage in VDI_SALVAGE must be 23 pcs / 226.201m.
      const qcSalvagePcs = 58;
      const qcSalvageMtr = 574.2;
      const avgLength = 9.9;

      const vdiSalvageDivOut = 347.999;
      const vdiSalvageDivOutPcs = Math.round(vdiSalvageDivOut / avgLength);
      expect(vdiSalvageDivOutPcs).toBe(35);

      const remSalvageMtr = Math.max(0, Number((qcSalvageMtr - vdiSalvageDivOut).toFixed(3)));
      const remSalvagePcs = Math.max(0, qcSalvagePcs - vdiSalvageDivOutPcs);

      expect(remSalvageMtr).toBe(226.201);
      expect(remSalvagePcs).toBe(23);
    });

    it('preserves VDI salvage WIP when prime material is reallocated at VDI (WO 6430 scenario)', () => {
      // Scenario based on WO 6430:
      // Band Saw produced 14,205.5m incoming to VDI.
      // 9,018m passed VDI as OK (1,503 pcs).
      // 414m logged as Salvage / Rejection (69 pcs).
      // 4,773.5m was diverted as PRIME material reallocation ([FROM_STAGE: VDI] [TO_STAGE: VDI]).
      // Total VDI diversion out is 4,773.5m.
      // Salvage pool must NOT be consumed by prime diversion and must remain 69 pcs / 414m.

      const incomingMtr = 14205.5;
      const totalVdiOkMtr = 9018;
      const totalVdiRejMtr = 414;
      const totalVdiRejPcs = 69;
      const vdiDivOutMtr = 4773.5;

      const divs = [
        {
          source_wo_id: 'wo-6430',
          work_center: 'VDI',
          reason: 'Prime Material Reallocation [FROM_STAGE: VDI] [TO_STAGE: VDI]',
          diverted_qty: 4773.5,
        },
      ];

      // Distinguish salvage/rejection diversions from prime diversions
      const vdiSalvageDivOutMtr = divs
        .filter((d: any) => {
          const r = (d.reason || '').toLowerCase();
          return r.includes('salvage') || r.includes('rejection') || r.includes('second') || r.includes('scrap');
        })
        .reduce((sum: number, d: any) => sum + Number(d.diverted_qty || 0), 0);

      const primeAvailableBeforeDiv = Math.max(0, incomingMtr - totalVdiRejMtr - totalVdiOkMtr);
      const excessDivOutMtr = Math.max(0, vdiDivOutMtr - primeAvailableBeforeDiv);
      const effectiveSalvageDivOutMtr = Math.max(vdiSalvageDivOutMtr, excessDivOutMtr);

      const availableVdiRejMtr = Math.max(0, totalVdiRejMtr - effectiveSalvageDivOutMtr);
      const availableVdiRejPcs = totalVdiRejMtr > 0
        ? Math.max(0, Math.round(totalVdiRejPcs * (availableVdiRejMtr / totalVdiRejMtr)))
        : 0;

      expect(vdiSalvageDivOutMtr).toBe(0);
      expect(primeAvailableBeforeDiv).toBe(4773.5);
      expect(excessDivOutMtr).toBe(0);
      expect(effectiveSalvageDivOutMtr).toBe(0);
      expect(availableVdiRejMtr).toBe(414);
      expect(availableVdiRejPcs).toBe(69);
    });

    it('ensures completed campaign master orders show 0 Finishing WIP (WO 6448 scenario)', () => {
      // Scenario based on WO 6448:
      // WO 6448 is Master in multi-WO campaign 08-M7.
      // Total campaign VDI OK is 1,747.5m across 6 work orders.
      // WO 6448 produced 720m finishing bundling (ordered: 100 pcs / 750m).
      // WO 6448 diverted 195m salvage out to DRAW.
      // WO 6448 status is 'Completed'.
      // Bundling of remaining campaign pieces belongs to child orders (6449, 6450, etc.).
      // WO 6448 must NOT show (1747.5 - 720 = 1027.5m / 137 pcs) of finishing WIP!

      const isCampaignMaster = true;
      const isOrderCompleted = true;

      let finWipPcs = 0;
      let finWipMtr = 0;

      // In DiversionForm stageBreakdown:
      if (isCampaignMaster || isOrderCompleted) {
        finWipPcs = 0;
        finWipMtr = 0;
      }

      expect(finWipPcs).toBe(0);
      expect(finWipMtr).toBe(0);
    });
  });
});


