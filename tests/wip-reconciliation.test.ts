import { describe, it, expect } from 'vitest';
import { reconcileWorkOrderWip, StageWipInput } from '../lib/wipReconciliation';

describe('WIP Reconciliation & Mass Conservation', () => {
  it('should automatically deduct downstream finishing from Band Saw and Heat Treatment (WO 6257 scenario)', () => {
    // WO 6257:
    // DRAW: 134,657 m out
    // HT: 90,343 m out (44,314 m left in HT)
    // BAND SAW: 0 m logged (before: showed full 90,343 m in Band Saw)
    // FINISHING: 47,915 m out
    const stages: StageWipInput[] = [
      {
        stage_code: 'DRAW',
        sequence_no: 1,
        gross_output_mtr: 134657,
        gross_output_pcs: 22442,
        rejection_mtr: 0,
        rejection_pcs: 0,
        net_output_mtr: 134657,
        net_output_pcs: 22442,
        od: 38.1,
        wt: 3.4,
        avg_length: 6.0,
      },
      {
        stage_code: 'HEAT_TREATMENT',
        sequence_no: 2,
        gross_output_mtr: 90343,
        gross_output_pcs: 15057,
        rejection_mtr: 0,
        rejection_pcs: 0,
        net_output_mtr: 90343,
        net_output_pcs: 15057,
        od: 38.1,
        wt: 3.4,
        avg_length: 6.0,
      },
      {
        stage_code: 'BAND_SAW',
        sequence_no: 3,
        gross_output_mtr: 0,
        gross_output_pcs: 0,
        rejection_mtr: 0,
        rejection_pcs: 0,
        net_output_mtr: 0,
        net_output_pcs: 0,
        od: 38.1,
        wt: 3.4,
        avg_length: 6.0,
      },
      {
        stage_code: 'FINISHING',
        sequence_no: 4,
        gross_output_mtr: 47915,
        gross_output_pcs: 7985,
        rejection_mtr: 0,
        rejection_pcs: 0,
        net_output_mtr: 47915,
        net_output_pcs: 7985,
        od: 38.1,
        wt: 3.4,
        avg_length: 6.0,
      },
    ];

    const result = reconcileWorkOrderWip(stages, {
      charged_billet_mt: 322.08,
      ordered_qty_mt: 300.1,
    });

    // Verify:
    // 1. Total finished = 47,915 m (~139.4 MT)
    expect(result.total_finished_mt).toBeGreaterThan(130);

    // 2. Band Saw WIP must NOT be 90,343 m anymore!
    // Since 47,915 m already passed finishing, remaining in Band Saw queue must be at most 90,343 - 47,915 = 42,428 m
    const bandSawStage = result.stages.find((s) => s.stage_code === 'BAND_SAW');
    expect(bandSawStage).toBeDefined();
    expect(bandSawStage!.reconciled_wip_mtr).toBeLessThanOrEqual(42428);

    // 3. Strict mass capping: Total active WIP MT cannot exceed (Charged MT - Finished MT)
    expect(result.reconciled_total_wip_mt).toBeLessThanOrEqual(result.max_physical_wip_mt);
  });

  it('should deduct downstream finishing from Hot Rolling so rolling is not double counted (WO 6279 scenario)', () => {
    // WO 6279: Rolled 3,387 m, Finished 942 m, Band Saw 0
    const stages: StageWipInput[] = [
      {
        stage_code: 'ROLLING',
        sequence_no: 1,
        gross_output_mtr: 3387,
        gross_output_pcs: 564,
        rejection_mtr: 128,
        rejection_pcs: 21,
        net_output_mtr: 3259,
        net_output_pcs: 543,
        od: 88.9,
        wt: 11.13,
        avg_length: 6.0,
      },
      {
        stage_code: 'BAND_SAW',
        sequence_no: 2,
        gross_output_mtr: 0,
        gross_output_pcs: 0,
        rejection_mtr: 0,
        rejection_pcs: 0,
        net_output_mtr: 0,
        net_output_pcs: 0,
        od: 88.9,
        wt: 11.13,
        avg_length: 6.0,
      },
      {
        stage_code: 'FINISHING',
        sequence_no: 3,
        gross_output_mtr: 942,
        gross_output_pcs: 157,
        rejection_mtr: 0,
        rejection_pcs: 0,
        net_output_mtr: 942,
        net_output_pcs: 157,
        od: 88.9,
        wt: 11.13,
        avg_length: 6.0,
      },
    ];

    const result = reconcileWorkOrderWip(stages, {
      charged_billet_mt: 67.57,
      ordered_qty_mt: 40.02,
    });

    const rollStage = result.stages.find((s) => s.stage_code === 'ROLLING');
    // Rolling net output was 3259. Since 942 was finished downstream, rolling remaining is at most 3259 - 942 = 2317 m
    expect(rollStage!.reconciled_wip_mtr).toBeLessThanOrEqual(2317);

    // Total WIP MT must be <= maxPhysicalWipMt (~45 MT, NOT 158 MT!)
    expect(result.reconciled_total_wip_mt).toBeLessThanOrEqual(50);
  });

  it('strictly caps active WIP mass by charged billet mass when theoretical WIP expands', () => {
    // Theoretical scenario: 10 MT charged billet, but due to calculation errors stages sum to 25 MT
    const stages: StageWipInput[] = [
      {
        stage_code: 'DRAW',
        sequence_no: 1,
        gross_output_mtr: 5000,
        gross_output_pcs: 800,
        rejection_mtr: 0,
        rejection_pcs: 0,
        net_output_mtr: 5000,
        net_output_pcs: 800,
        od: 60.3,
        wt: 5.5,
        avg_length: 6.0,
      },
      {
        stage_code: 'HEAT_TREATMENT',
        sequence_no: 2,
        gross_output_mtr: 2000,
        gross_output_pcs: 300,
        rejection_mtr: 0,
        rejection_pcs: 0,
        net_output_mtr: 2000,
        net_output_pcs: 300,
        od: 60.3,
        wt: 5.5,
        avg_length: 6.0,
      },
    ];

    const result = reconcileWorkOrderWip(stages, {
      charged_billet_mt: 10.0, // Only 10 MT steel charged
    });

    // Total active WIP cannot exceed 10.0 MT!
    expect(result.reconciled_total_wip_mt).toBeLessThanOrEqual(10.0);
    const sumCappedMt = result.stages.reduce((s, r) => s + r.capped_wip_mt, 0);
    expect(sumCappedMt).toBeLessThanOrEqual(10.01);
  });
});
