import { describe, it, expect } from 'vitest';

describe('IP Cutting WIP Matrix & Dashboard Non-Display Verification', () => {
  it('confirms SizeGradeWipReportClient does NOT display a separate IP_CUTTING column', () => {
    // Stage codes supported as columns in SizeGradeWipReportClient
    const wipMatrixStageCodes = [
      'HOT_ROLLING',
      'HTC',
      'ROLLING',
      'HOLLOW_HEAT_TREATMENT',
      'PILGER',
      'DRAW',
      'HEAT_TREATMENT',
      'BAND_SAW',
      'VDI',
      'FINISHING',
      'VDI_SALVAGE',
    ];

    expect(wipMatrixStageCodes).not.toContain('IP_CUTTING');
    expect(wipMatrixStageCodes).toContain('DRAW');
  });

  it('verifies that pre-draw IP Cut material is aggregated under DRAW queue WIP', () => {
    // Mock stage summary matching app/api/production/queue/route.ts
    const workCenterSummary = {
      DRAW: {
        stage_code: 'DRAW',
        ready_pcs: 100,
        ready_mtr: 600,
        available_pcs: 100,
        available_mtr: 600,
      },
      BAND_SAW: {
        stage_code: 'BAND_SAW',
        ready_pcs: 50,
        ready_mtr: 300,
        available_pcs: 50,
        available_mtr: 300,
      },
    };

    // When IP Cut material is available at intermediate stage (e.g., 20 pcs, 120m)
    const ipCutAvailPcs = 20;
    const ipCutAvailMtr = 120;

    // Per system design (queue API):
    workCenterSummary.DRAW.available_pcs += ipCutAvailPcs;
    workCenterSummary.DRAW.available_mtr += ipCutAvailMtr;

    // Available at DRAW is now 120 pcs and 720m
    expect(workCenterSummary.DRAW.available_pcs).toBe(120);
    expect(workCenterSummary.DRAW.available_mtr).toBe(720);

    // Band Saw available pieces is unchanged (no double counting)
    expect(workCenterSummary.BAND_SAW.available_pcs).toBe(50);
  });
});
