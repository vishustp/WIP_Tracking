import { describe, it, expect } from 'vitest';
import { reconcileWorkOrderWip, StageWipInput } from '@/lib/wipReconciliation';

describe('Heat Treatment WIP Reconciliation Suite', () => {
  it('correctly calculates 58 pcs / 580m remaining at Heat Treatment when actual drawn length is 10m', () => {
    const stages: StageWipInput[] = [
      {
        stage_code: 'ROLLING',
        sequence_no: 1,
        gross_output_pcs: 492,
        gross_output_mtr: 4923.84,
        rejection_pcs: 0,
        rejection_mtr: 0,
        net_output_pcs: 492,
        net_output_mtr: 4923.84,
        avg_length: 10.0,
        od: 47,
        wt: 6.25,
      },
      {
        stage_code: 'DRAW',
        sequence_no: 2,
        gross_output_pcs: 736,
        gross_output_mtr: 7360,
        rejection_pcs: 0,
        rejection_mtr: 0,
        net_output_pcs: 736,
        net_output_mtr: 7360,
        avg_length: 10.0,
        od: 38.1,
        wt: 4.5,
      },
      {
        stage_code: 'HEAT_TREATMENT',
        sequence_no: 3,
        incoming_pcs: 736,
        incoming_mtr: 7360,
        gross_output_pcs: 678,
        gross_output_mtr: 6780,
        rejection_pcs: 0,
        rejection_mtr: 0,
        net_output_pcs: 678,
        net_output_mtr: 6780,
        avg_length: 10.0,
        od: 38.1,
        wt: 4.5,
      },
      {
        stage_code: 'BAND_SAW',
        sequence_no: 4,
        incoming_pcs: 678,
        incoming_mtr: 6780,
        gross_output_pcs: 678,
        gross_output_mtr: 6780,
        rejection_pcs: 0,
        rejection_mtr: 0,
        net_output_pcs: 678,
        net_output_mtr: 6780,
        avg_length: 10.0,
        od: 38.1,
        wt: 4.5,
      },
      {
        stage_code: 'VDI',
        sequence_no: 5,
        incoming_pcs: 678,
        incoming_mtr: 6780,
        gross_output_pcs: 599,
        gross_output_mtr: 5990,
        rejection_pcs: 76,
        rejection_mtr: 760,
        net_output_pcs: 599,
        net_output_mtr: 5990,
        avg_length: 10.0,
        od: 38.1,
        wt: 4.5,
      },
    ];

    const summary = reconcileWorkOrderWip(stages, {
      route_code: 'ALLOY_CDS',
      final_avg_length: 10.0,
      multiple: 1,
      is_order_completed: false,
    });

    const htStage = summary.stages.find((s) => s.stage_code === 'HEAT_TREATMENT');
    expect(htStage).toBeDefined();
    expect(htStage?.capped_wip_pcs).toBe(58);
    expect(htStage?.capped_wip_mtr).toBe(580);
    expect(htStage?.avg_length).toBe(10);
  });
});
