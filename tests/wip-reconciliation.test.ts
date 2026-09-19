import { describe, it, expect } from 'vitest';
import { reconcileWorkOrderWip, StageWipInput } from '../lib/wipReconciliation';

describe('PCS-First Route-Aware WIP Reconciliation', () => {
  it('excludes Rolling from Plant WIP and calculates Standard CDS WIP strictly in PCS', () => {
    // 100 Mother Hollow pieces rolled (6.0m length)
    // 40 pieces drawn on Draw Bench (12.0m length)
    // 30 pieces heat treated at Final HT (12.0m length)
    // 0 pieces cut at Band Saw yet
    const stages: StageWipInput[] = [
      {
        stage_code: 'ROLLING',
        sequence_no: 1,
        gross_output_mtr: 600,
        gross_output_pcs: 100,
        rejection_mtr: 0,
        rejection_pcs: 0,
        net_output_mtr: 600,
        net_output_pcs: 100,
        od: 60.3,
        wt: 5.5,
        avg_length: 6.0,
      },
      {
        stage_code: 'DRAW',
        sequence_no: 2,
        gross_output_mtr: 480,
        gross_output_pcs: 40,
        rejection_mtr: 0,
        rejection_pcs: 0,
        net_output_mtr: 480,
        net_output_pcs: 40,
        od: 38.1,
        wt: 3.2,
        avg_length: 6.0,
      },
      {
        stage_code: 'HEAT_TREATMENT',
        sequence_no: 3,
        gross_output_mtr: 360,
        gross_output_pcs: 30,
        rejection_mtr: 0,
        rejection_pcs: 0,
        net_output_mtr: 360,
        net_output_pcs: 30,
        od: 38.1,
        wt: 3.2,
        avg_length: 12.0,
      },
      {
        stage_code: 'BAND_SAW',
        sequence_no: 4,
        gross_output_mtr: 0,
        gross_output_pcs: 0,
        rejection_mtr: 0,
        rejection_pcs: 0,
        net_output_mtr: 0,
        net_output_pcs: 0,
        od: 38.1,
        wt: 3.2,
        avg_length: 12.0,
      },
    ];

    const result = reconcileWorkOrderWip(stages, {
      route_code: 'CDS',
      mh_od: 60.3,
      mh_wt: 5.5,
      mh_avg_length: 6.0,
      final_avg_length: 12.0,
    });

    // 1. Rolling must be marked as feeder stage with 0 Plant WIP
    const rollStage = result.stages.find((s) => s.stage_code === 'ROLLING');
    expect(rollStage).toBeDefined();
    expect(rollStage!.is_feeder_stage).toBe(true);
    expect(rollStage!.reconciled_wip_pcs).toBe(0);

    // 2. Draw Bench: 100 rolled - 40 drawn = 60 Mother Hollow pieces waiting
    const drawStage = result.stages.find((s) => s.stage_code === 'DRAW');
    expect(drawStage!.reconciled_wip_pcs).toBe(60);
    expect(drawStage!.reconciled_wip_mtr).toBe(360); // 60 pcs * 6m

    // 3. Final Heat Treatment: 40 drawn - 30 heat treated = 10 tubes waiting
    const htStage = result.stages.find((s) => s.stage_code === 'HEAT_TREATMENT');
    expect(htStage!.reconciled_wip_pcs).toBe(10);
    expect(htStage!.reconciled_wip_mtr).toBe(120); // 10 pcs * 12m

    // 4. Band Saw: 30 heat treated - 0 cut = 30 mother tubes waiting
    const bsStage = result.stages.find((s) => s.stage_code === 'BAND_SAW');
    expect(bsStage!.reconciled_wip_pcs).toBe(30);
    expect(bsStage!.reconciled_wip_mtr).toBe(360); // 30 pcs * 12m

    // 5. Total Plant WIP = 60 + 10 + 30 = 100 pieces!
    expect(result.plant_total_wip_pcs).toBe(100);
  });

  it('calculates Standard HFS WIP starting directly at Band Saw', () => {
    // 50 pieces rolled (6.0m length)
    // HFS route: goes straight from Rolling to Band Saw
    // 20 pieces cut at Band Saw
    const stages: StageWipInput[] = [
      {
        stage_code: 'ROLLING',
        sequence_no: 1,
        gross_output_mtr: 300,
        gross_output_pcs: 50,
        rejection_mtr: 0,
        rejection_pcs: 0,
        net_output_mtr: 300,
        net_output_pcs: 50,
        od: 88.9,
        wt: 11.13,
        avg_length: 6.0,
      },
      {
        stage_code: 'BAND_SAW',
        sequence_no: 2,
        gross_output_mtr: 120,
        gross_output_pcs: 20,
        rejection_mtr: 0,
        rejection_pcs: 0,
        net_output_mtr: 120,
        net_output_pcs: 20,
        od: 88.9,
        wt: 11.13,
        avg_length: 6.0,
      },
    ];

    const result = reconcileWorkOrderWip(stages, {
      route_code: 'HFS',
      final_avg_length: 6.0,
    });

    // Rolling is excluded from Plant WIP
    const rollStage = result.stages.find((s) => s.stage_code === 'ROLLING');
    expect(rollStage!.is_feeder_stage).toBe(true);

    // Band Saw: 50 incoming from Rolling - 20 cut = 30 pieces waiting
    const bsStage = result.stages.find((s) => s.stage_code === 'BAND_SAW');
    expect(bsStage!.reconciled_wip_pcs).toBe(30);
    expect(bsStage!.reconciled_wip_mtr).toBe(180); // 30 pcs * 6m

    expect(result.plant_total_wip_pcs).toBe(30);
  });

  it('calculates Option B HFS WIP starting at Heat Treatment', () => {
    // Option B HFS: Rolling -> Heat Treatment -> Band Saw
    // 80 pieces rolled
    // 50 pieces heat-treated
    const stages: StageWipInput[] = [
      {
        stage_code: 'ROLLING',
        sequence_no: 1,
        gross_output_mtr: 480,
        gross_output_pcs: 80,
        rejection_mtr: 0,
        rejection_pcs: 0,
        net_output_mtr: 480,
        net_output_pcs: 80,
        od: 73.0,
        wt: 7.0,
        avg_length: 6.0,
      },
      {
        stage_code: 'HEAT_TREATMENT',
        sequence_no: 2,
        gross_output_mtr: 300,
        gross_output_pcs: 50,
        rejection_mtr: 0,
        rejection_pcs: 0,
        net_output_mtr: 300,
        net_output_pcs: 50,
        od: 73.0,
        wt: 7.0,
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
        od: 73.0,
        wt: 7.0,
        avg_length: 6.0,
      },
    ];

    const result = reconcileWorkOrderWip(stages, {
      route_code: 'ALLOY_HFS',
      final_avg_length: 6.0,
    });

    // Heat Treatment: 80 from rolling - 50 treated = 30 pieces waiting for HT
    const htStage = result.stages.find((s) => s.stage_code === 'HEAT_TREATMENT');
    expect(htStage!.reconciled_wip_pcs).toBe(30);

    // Band Saw: 50 from HT - 0 cut = 50 pieces waiting for Band Saw
    const bsStage = result.stages.find((s) => s.stage_code === 'BAND_SAW');
    expect(bsStage!.reconciled_wip_pcs).toBe(50);

    // Total Plant WIP = 30 + 50 = 80 pieces
    expect(result.plant_total_wip_pcs).toBe(80);
  });
});
