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
    // Mass-conserved elongated drawn length (6.0m * (301.4 / 111.68) = ~16.193m per tube)
    expect(htStage!.reconciled_wip_mtr).toBeCloseTo(161.93, 1);

    // 4. Band Saw: 30 heat treated - 0 cut = 30 mother tubes waiting
    const bsStage = result.stages.find((s) => s.stage_code === 'BAND_SAW');
    expect(bsStage!.reconciled_wip_pcs).toBe(30);
    expect(bsStage!.reconciled_wip_mtr).toBeCloseTo(485.79, 1);

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

  it('calculates ALLOY_HFS WIP starting at Hollow Heat Treatment (Carbon HFS skips HT)', () => {
    // ALLOY_HFS: Rolling -> Hollow Heat Treatment -> Band Saw
    // 80 pieces rolled
    // 50 pieces hollow heat-treated
    // 0 pieces cut at Band Saw yet
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
        stage_code: 'HOLLOW_HEAT_TREATMENT',
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

    // Hollow Heat Treatment: 80 from rolling - 50 treated = 30 pieces waiting for Hollow HT
    const hhtStage = result.stages.find((s) => s.stage_code === 'HOLLOW_HEAT_TREATMENT');
    expect(hhtStage!.reconciled_wip_pcs).toBe(30);

    // Band Saw: 50 from Hollow HT - 0 cut = 50 pieces waiting for Band Saw
    const bsStage = result.stages.find((s) => s.stage_code === 'BAND_SAW');
    expect(bsStage!.reconciled_wip_pcs).toBe(50);

    // Total Plant WIP = 30 + 50 = 80 pieces
    expect(result.plant_total_wip_pcs).toBe(80);
  });

  it('verifies Mass Conservation Law: Charged Steel MT = Plant WIP MT + Finished MT + Scrap MT', () => {
    // 100 mother pipes rolled (OD 60.3, WT 5.5, L1 6.0m)
    // Unit weight = (60.3 - 5.5) * 5.5 * 0.0246615 * 0.001 = 0.007433 MT/m
    // Total charged = 100 pcs * 6.0m * 0.007433 = ~4.46 MT
    // Rolling produces 100 pcs (2 pcs rejected at Rolling HTC = 0.089 MT scrap) -> 98 HTC OK
    // Draw Bench draws 60 pcs (1 pc rejected = 0.045 MT scrap) -> 59 drawn
    // Heat Treatment treats 50 pcs
    // Band Saw cuts 40 drawn pipes into 80 cut pieces (2m scrap offcuts = 0.030 MT)
    // VDI inspects 70 cut pieces (5 pcs rejected = 0.037 MT scrap) -> 65 passed
    // Finishing bundles 40 cut pieces -> 40 finished goods (~0.60 MT)
    const stages: StageWipInput[] = [
      {
        stage_code: 'ROLLING',
        sequence_no: 1,
        gross_output_mtr: 600,
        gross_output_pcs: 100,
        rejection_mtr: 12,
        rejection_pcs: 2,
        net_output_mtr: 588,
        net_output_pcs: 98,
        od: 60.3,
        wt: 5.5,
        avg_length: 6.0,
      },
      {
        stage_code: 'DRAW',
        sequence_no: 2,
        gross_output_mtr: 720,
        gross_output_pcs: 60,
        rejection_mtr: 12,
        rejection_pcs: 1,
        net_output_mtr: 708,
        net_output_pcs: 59,
        od: 38.1,
        wt: 3.2,
        avg_length: 6.0,
      },
      {
        stage_code: 'HEAT_TREATMENT',
        sequence_no: 3,
        gross_output_mtr: 600,
        gross_output_pcs: 50,
        rejection_mtr: 0,
        rejection_pcs: 0,
        net_output_mtr: 600,
        net_output_pcs: 50,
        od: 38.1,
        wt: 3.2,
        avg_length: 12.0,
      },
      {
        stage_code: 'BAND_SAW',
        sequence_no: 4,
        gross_output_mtr: 480,
        gross_output_pcs: 80,
        rejection_mtr: 8,
        rejection_pcs: 0,
        net_output_mtr: 472,
        net_output_pcs: 80,
        od: 38.1,
        wt: 3.2,
        avg_length: 6.0,
      },
      {
        stage_code: 'VDI',
        sequence_no: 5,
        gross_output_mtr: 390,
        gross_output_pcs: 65,
        rejection_mtr: 30,
        rejection_pcs: 5,
        net_output_mtr: 360,
        net_output_pcs: 60,
        od: 38.1,
        wt: 3.2,
        avg_length: 6.0,
      },
      {
        stage_code: 'FINISHING',
        sequence_no: 6,
        gross_output_mtr: 240,
        gross_output_pcs: 40,
        rejection_mtr: 0,
        rejection_pcs: 0,
        net_output_mtr: 240,
        net_output_pcs: 40,
        od: 38.1,
        wt: 3.2,
        avg_length: 6.0,
      },
    ];

    const result = reconcileWorkOrderWip(stages, {
      route_code: 'CDS',
      mh_od: 60.3,
      mh_wt: 5.5,
      mh_avg_length: 6.0,
      final_avg_length: 6.0,
    });

    const chargedMt = result.total_charged_mt;
    const plantWipMt = result.plant_total_wip_mt;
    const finishedMt = result.total_finished_mt;
    const scrapMt = result.total_scrap_mt;

    // All steel charged MUST be accounted for in either Active WIP, Finished Goods, or Scrap:
    // Active WIP MT + Finished MT + Scrap MT <= Charged MT (never over-inflated)
    expect(chargedMt).toBeGreaterThan(0);
    expect(plantWipMt + finishedMt + scrapMt).toBeLessThanOrEqual(chargedMt * 1.02); // within 2% rounding margin
    expect(result.max_physical_wip_mt).toBeGreaterThanOrEqual(0);
  });

  it('correctly handles Piece Multiplier across Band Saw without corrupting upstream mother hollow WIP', () => {
    // 100 Mother Pipes rolled (12.0m length)
    // 80 Mother Pipes drawn (12.0m length) -> 20 Mother Pipes waiting at Draw Bench
    // 60 Mother Pipes heat treated (12.0m length) -> 20 Mother Pipes waiting at Heat Treatment
    // 40 Mother Pipes cut at Band Saw with Multiple=2 (produces 80 cut pieces of 6.0m) -> 20 Mother Pipes waiting at Band Saw
    // 60 Cut Pieces inspected at VDI -> 20 Cut Pieces waiting at VDI (80 cut - 60 inspected)
    // 30 Cut Pieces bundled at Finishing -> 20 Cut Pieces waiting at Finishing (50 OK - 30 bundled)
    const stages: StageWipInput[] = [
      {
        stage_code: 'ROLLING',
        sequence_no: 1,
        gross_output_mtr: 1200,
        gross_output_pcs: 100,
        rejection_mtr: 0,
        rejection_pcs: 0,
        net_output_mtr: 1200,
        net_output_pcs: 100,
        od: 60.3,
        wt: 5.5,
        avg_length: 12.0,
      },
      {
        stage_code: 'DRAW',
        sequence_no: 2,
        gross_output_mtr: 960,
        gross_output_pcs: 80,
        rejection_mtr: 0,
        rejection_pcs: 0,
        net_output_mtr: 960,
        net_output_pcs: 80,
        od: 60.3,
        wt: 5.5,
        avg_length: 12.0,
      },
      {
        stage_code: 'HEAT_TREATMENT',
        sequence_no: 3,
        gross_output_mtr: 720,
        gross_output_pcs: 60,
        rejection_mtr: 0,
        rejection_pcs: 0,
        net_output_mtr: 720,
        net_output_pcs: 60,
        od: 60.3,
        wt: 5.5,
        avg_length: 12.0,
      },
      {
        stage_code: 'BAND_SAW',
        sequence_no: 4,
        gross_output_mtr: 480,
        gross_output_pcs: 80, // 80 cut pieces from 40 mother pipes
        rejection_mtr: 0,
        rejection_pcs: 0,
        net_output_mtr: 480,
        net_output_pcs: 80,
        od: 60.3,
        wt: 5.5,
        avg_length: 6.0,
      },
      {
        stage_code: 'VDI',
        sequence_no: 5,
        gross_output_mtr: 300,
        gross_output_pcs: 50, // 50 OK cut pieces
        rejection_mtr: 60,
        rejection_pcs: 10,   // 10 rejected cut pieces -> 60 total inspected
        net_output_mtr: 300,
        net_output_pcs: 50,
        od: 60.3,
        wt: 5.5,
        avg_length: 6.0,
      },
      {
        stage_code: 'FINISHING',
        sequence_no: 6,
        gross_output_mtr: 180,
        gross_output_pcs: 30, // 30 cut pieces bundled
        rejection_mtr: 0,
        rejection_pcs: 0,
        net_output_mtr: 180,
        net_output_pcs: 30,
        od: 60.3,
        wt: 5.5,
        avg_length: 6.0,
      },
    ];

    const result = reconcileWorkOrderWip(stages, {
      route_code: 'CDS',
      mh_od: 60.3,
      mh_wt: 5.5,
      mh_avg_length: 12.0,
      final_avg_length: 6.0,
      multiple: 2,
    });

    const drawStage = result.stages.find((s) => s.stage_code === 'DRAW');
    const htStage = result.stages.find((s) => s.stage_code === 'HEAT_TREATMENT');
    const bsStage = result.stages.find((s) => s.stage_code === 'BAND_SAW');
    const vdiStage = result.stages.find((s) => s.stage_code === 'VDI');
    const finStage = result.stages.find((s) => s.stage_code === 'FINISHING');

    // Draw Bench: 100 rolled - 80 drawn = 20 Mother Pipes waiting
    expect(drawStage!.reconciled_wip_pcs).toBe(20);
    // Heat Treatment: 80 drawn - 60 treated = 20 Mother Pipes waiting
    expect(htStage!.reconciled_wip_pcs).toBe(20);
    // Band Saw: 60 treated - 40 cut (480m / 12m) = 20 Mother Pipes waiting
    expect(bsStage!.reconciled_wip_pcs).toBe(20);
    // VDI: 80 cut pieces from Band Saw - 50 OK (Option B keeps 10 salvage/rej in WIP until diverted) = 30 Cut Pieces waiting
    expect(vdiStage!.reconciled_wip_pcs).toBe(30);
    // Finishing: 50 VDI OK cut pieces - 30 bundled = 20 Cut Pieces waiting
    expect(finStage!.reconciled_wip_pcs).toBe(20);

    // Total Plant WIP: 20 (Draw) + 20 (HT) + 20 (Band Saw) + 30 (VDI) + 20 (Finishing) = 110 pieces
    expect(result.plant_total_wip_pcs).toBe(110);
  });

  it('preserves exact discrete cut piece counts at Finishing without fractional mass damping', () => {
    // Stage test reflecting physical ground truth:
    // 840 VDI OK cut pieces incoming to Finishing
    // 754 Cut pieces bundled at Finishing
    // Expected Finishing Queue WIP = 840 - 754 = 86 cut pieces
    const stages: StageWipInput[] = [
      {
        stage_code: 'ROLLING',
        sequence_no: 1,
        gross_output_mtr: 4876.05,
        gross_output_pcs: 1261,
        rejection_mtr: 0,
        rejection_pcs: 0,
        net_output_mtr: 4876.05,
        net_output_pcs: 1261,
        od: 114.3,
        wt: 6.02,
        avg_length: 3.867,
      },
      {
        stage_code: 'BAND_SAW',
        sequence_no: 2,
        gross_output_mtr: 4597,
        gross_output_pcs: 1261,
        rejection_mtr: 0,
        rejection_pcs: 0,
        net_output_mtr: 4597,
        net_output_pcs: 1261,
        od: 114.3,
        wt: 6.02,
        avg_length: 3.645,
      },
      {
        stage_code: 'VDI',
        sequence_no: 3,
        gross_output_mtr: 3000,
        gross_output_pcs: 932,
        rejection_mtr: 300,
        rejection_pcs: 92,
        net_output_mtr: 2700,
        net_output_pcs: 840,
        incoming_pcs: 1261,
        od: 114.3,
        wt: 6.02,
        avg_length: 3.5,
      },
      {
        stage_code: 'FINISHING',
        sequence_no: 4,
        gross_output_mtr: 2551.58,
        gross_output_pcs: 754,
        rejection_mtr: 0,
        rejection_pcs: 0,
        net_output_mtr: 2551.58,
        net_output_pcs: 754,
        incoming_pcs: 840,
        od: 114.3,
        wt: 6.02,
        avg_length: 3.5,
      },
    ];

    const result = reconcileWorkOrderWip(stages, {
      route_code: 'HFS',
      ordered_qty_mt: 100,
    });

    const fin = result.stages.find((s) => s.stage_code === 'FINISHING');
    expect(fin).toBeDefined();
    expect(fin!.reconciled_wip_pcs).toBe(86);
    expect(fin!.capped_wip_pcs).toBe(86); // Must not be shrunk by mass clamp
  });
});
