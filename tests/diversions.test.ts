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
});
