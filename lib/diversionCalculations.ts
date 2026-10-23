/**
 * Material Diversion & Cut-Split Calculation Utilities
 * Enforces Mill Rules (Rule 5B: 3m Scrap Floor, Rule 5C: 3m Usable Off-cut,
 * STP 9.5m Hollow Limit, Cold Draw Metallurgy & Elongation).
 */

export interface CutSplitItem {
  target_wo_id: string;
  target_stage_code: string;
  cut_length: number;
  cuts_per_pipe?: number;
}

export interface RemnantAnalysis {
  remnant_length: number;
  total_remnant_mtr: number;
  classification: 'SCRAP' | 'USABLE_OFFCUT';
  is_scrap: boolean;
  is_usable_offcut: boolean;
}

export const STP_HOLLOW_LIMIT_MTR = 9.5;
export const REMNANT_SCRAP_FLOOR_MTR = 3.0;

/**
 * Calculates remnant per pipe and total remnant across all mother pipes.
 * Enforces Rule 5B (< 3.0m is SCRAP) and Rule 5C (>= 3.0m is USABLE_OFFCUT).
 */
export function calcCutSplitRemnant(
  motherLength: number,
  motherPcs: number,
  splits: CutSplitItem[]
): RemnantAnalysis {
  const mLen = Number(motherLength || 0);
  const mPcs = Math.max(0, Number(motherPcs || 0));

  const totalCutPerPipe = (splits || []).reduce(
    (sum, s) => sum + Number(s.cut_length || 0) * (s.cuts_per_pipe || 1),
    0
  );

  if (totalCutPerPipe > mLen + 0.0001) {
    throw new Error(
      `Total cut length (${totalCutPerPipe.toFixed(2)}m) exceeds mother pipe length (${mLen.toFixed(2)}m)`
    );
  }

  const rawRemnant = Math.max(0, mLen - totalCutPerPipe);
  const remnantLength = Number(rawRemnant.toFixed(3));
  const totalRemnantMtr = Number((remnantLength * mPcs).toFixed(2));

  // Rule 5B: Any remnant < 3.0m is strictly scrap.
  // Rule 5C: Any remnant >= 3.0m is a usable off-cut.
  const isUsable = remnantLength >= REMNANT_SCRAP_FLOOR_MTR;
  const classification: 'SCRAP' | 'USABLE_OFFCUT' = isUsable ? 'USABLE_OFFCUT' : 'SCRAP';

  return {
    remnant_length: remnantLength,
    total_remnant_mtr: totalRemnantMtr,
    classification,
    is_scrap: !isUsable,
    is_usable_offcut: isUsable,
  };
}

/**
 * Checks if a pipe/hollow exceeds the standard STP 9.5m length constraint.
 */
export function checkStpHollowLimit(lengthMtr: number): {
  exceedsLimit: boolean;
  limitMtr: number;
} {
  const len = Number(lengthMtr || 0);
  return {
    exceedsLimit: len > STP_HOLLOW_LIMIT_MTR,
    limitMtr: STP_HOLLOW_LIMIT_MTR,
  };
}

/**
 * Validates cross-section reduction and elongation factor for Cold Draw Bench passes.
 */
export function validateColdDrawReduction(
  sourceOd: number,
  sourceWt: number,
  targetOd: number,
  targetWt: number
): {
  isValid: boolean;
  errorReason?: string;
  areaReductionPct: number;
  elongationFactor: number;
} {
  const sOd = Number(sourceOd || 0);
  const sWt = Number(sourceWt || 0);
  const tOd = Number(targetOd || 0);
  const tWt = Number(targetWt || 0);

  if (sOd <= 0 || sWt <= 0 || tOd <= 0 || tWt <= 0) {
    return {
      isValid: false,
      errorReason: 'Invalid dimensions: OD and WT must be greater than zero.',
      areaReductionPct: 0,
      elongationFactor: 1.0,
    };
  }

  if (tOd > sOd) {
    return {
      isValid: false,
      errorReason: `Target OD (${tOd}mm) exceeds source OD (${sOd}mm). Cold drawing cannot expand outer diameter.`,
      areaReductionPct: 0,
      elongationFactor: 1.0,
    };
  }

  if (tWt > sWt) {
    return {
      isValid: false,
      errorReason: `Target WT (${tWt}mm) exceeds source WT (${sWt}mm). Cold drawing cannot increase wall thickness.`,
      areaReductionPct: 0,
      elongationFactor: 1.0,
    };
  }

  // Cross-sectional areas: A = π * (OD - WT) * WT
  const areaSource = Math.PI * (sOd - sWt) * sWt;
  const areaTarget = Math.PI * (tOd - tWt) * tWt;

  if (areaTarget <= 0 || areaSource <= 0 || areaTarget >= areaSource) {
    return {
      isValid: false,
      errorReason: 'Invalid reduction: target cross-sectional area must be less than source cross-sectional area.',
      areaReductionPct: 0,
      elongationFactor: 1.0,
    };
  }

  const areaReductionPct = Number((((areaSource - areaTarget) / areaSource) * 100).toFixed(2));
  const elongationFactor = Number((areaSource / areaTarget).toFixed(4));

  return {
    isValid: true,
    areaReductionPct,
    elongationFactor,
  };
}

/**
 * Computes whether diverted material exceeds the target order's remaining balance.
 * Returns surplus amount without blocking operations.
 */
export function calcOrderBalanceSurplus(
  divertedMtr: number,
  orderedMtr: number,
  producedMtr: number
): {
  remainingBefore: number;
  surplusMtr: number;
  isOverAllocated: boolean;
} {
  const dMtr = Math.max(0, Number(divertedMtr || 0));
  const oMtr = Math.max(0, Number(orderedMtr || 0));
  const pMtr = Math.max(0, Number(producedMtr || 0));

  const remainingBefore = Math.max(0, Number((oMtr - pMtr).toFixed(2)));
  const surplusMtr = Number(Math.max(0, dMtr - remainingBefore).toFixed(2));

  return {
    remainingBefore,
    surplusMtr,
    isOverAllocated: surplusMtr > 0,
  };
}
