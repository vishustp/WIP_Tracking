import { describe, it, expect } from 'vitest';
import {
  calcCutSplitRemnant,
  validateColdDrawReduction,
  checkStpHollowLimit,
  calcOrderBalanceSurplus,
  type CutSplitItem,
} from '@/lib/diversionCalculations';

describe('Diversion & Cut-Split Calculations (Mill Rules)', () => {
  describe('calcCutSplitRemnant (Rule 5B & Rule 5C)', () => {
    it('classifies remnant >= 3.0m as USABLE_OFFCUT when 10m pipe is cut to 7m', () => {
      const splits: CutSplitItem[] = [
        {
          target_wo_id: 'wo-target-1',
          target_stage_code: 'DRAW',
          cut_length: 7.0,
        },
      ];

      const result = calcCutSplitRemnant(10.0, 1, splits);

      expect(result.remnant_length).toBe(3.0);
      expect(result.total_remnant_mtr).toBe(3.0);
      expect(result.classification).toBe('USABLE_OFFCUT');
      expect(result.is_usable_offcut).toBe(true);
      expect(result.is_scrap).toBe(false);
    });

    it('classifies remnant < 3.0m as SCRAP under Rule 5B hard floor when 10m pipe is cut to 8.5m', () => {
      const splits: CutSplitItem[] = [
        {
          target_wo_id: 'wo-target-1',
          target_stage_code: 'BAND_SAW',
          cut_length: 8.5,
        },
      ];

      const result = calcCutSplitRemnant(10.0, 1, splits);

      expect(result.remnant_length).toBe(1.5);
      expect(result.total_remnant_mtr).toBe(1.5);
      expect(result.classification).toBe('SCRAP');
      expect(result.is_scrap).toBe(true);
      expect(result.is_usable_offcut).toBe(false);
    });

    it('handles 2-way split across two work orders and computes residual balance for multiple pipes', () => {
      const splits: CutSplitItem[] = [
        {
          target_wo_id: 'wo-a',
          target_stage_code: 'DRAW',
          cut_length: 6.0,
        },
        {
          target_wo_id: 'wo-b',
          target_stage_code: 'BAND_SAW',
          cut_length: 3.5,
        },
      ];

      // 4 mother pipes of 10.0m each = 40.0m total
      // 6.0 + 3.5 = 9.5m cut per pipe. Remnant = 0.5m per pipe (< 3.0m => SCRAP)
      const result = calcCutSplitRemnant(10.0, 4, splits);

      expect(result.remnant_length).toBe(0.5);
      expect(result.total_remnant_mtr).toBe(2.0);
      expect(result.classification).toBe('SCRAP');
      expect(result.is_scrap).toBe(true);
    });

    it('throws error or clamps if cut length exceeds mother pipe length', () => {
      const splits: CutSplitItem[] = [
        {
          target_wo_id: 'wo-a',
          target_stage_code: 'DRAW',
          cut_length: 11.0,
        },
      ];

      expect(() => calcCutSplitRemnant(10.0, 1, splits)).toThrow('exceeds mother pipe length');
    });
  });

  describe('checkStpHollowLimit (STP 9.5m Constraint)', () => {
    it('flags hollows exceeding standard 9.5m STP limit', () => {
      expect(checkStpHollowLimit(10.0).exceedsLimit).toBe(true);
      expect(checkStpHollowLimit(9.5).exceedsLimit).toBe(false);
      expect(checkStpHollowLimit(8.0).exceedsLimit).toBe(false);
      expect(checkStpHollowLimit(10.0).limitMtr).toBe(9.5);
    });
  });

  describe('validateColdDrawReduction (Area Reduction & Elongation)', () => {
    it('validates successful cold draw pass with positive reduction and elongation > 1.0', () => {
      // 38.1 x 3.5 mm -> 30.0 x 2.6 mm
      const res = validateColdDrawReduction(38.1, 3.5, 30.0, 2.6);

      expect(res.isValid).toBe(true);
      expect(res.areaReductionPct).toBeGreaterThan(0);
      expect(res.elongationFactor).toBeGreaterThan(1.0);
    });

    it('rejects physically impossible draw pass where target OD exceeds source OD', () => {
      // Cannot draw 30.0 x 2.6 into 38.1 x 3.5 (drawing cannot expand OD)
      const res = validateColdDrawReduction(30.0, 2.6, 38.1, 3.5);

      expect(res.isValid).toBe(false);
      expect(res.errorReason).toContain('exceeds source');
    });
  });

  describe('calcOrderBalanceSurplus (Soft Over-allocation Warning)', () => {
    it('detects over-allocation without blocking', () => {
      // Target order: 1000m ordered, 800m already produced -> remaining = 200m
      // Diverting in: 300m -> surplus = 100m
      const res = calcOrderBalanceSurplus(300, 1000, 800);

      expect(res.remainingBefore).toBe(200);
      expect(res.surplusMtr).toBe(100);
      expect(res.isOverAllocated).toBe(true);
    });

    it('reports no surplus when within remaining order balance', () => {
      // Diverting in: 150m for 200m remaining
      const res = calcOrderBalanceSurplus(150, 1000, 800);

      expect(res.remainingBefore).toBe(200);
      expect(res.surplusMtr).toBe(0);
      expect(res.isOverAllocated).toBe(false);
    });
  });
});
