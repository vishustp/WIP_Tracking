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

    it('supports cutting pipes from middle: allocating half to same work order and half to another order', () => {
      // Mill scenario: WO 5978 has 9 mother pipes of 11.8m (106.20m total).
      // Cut from middle: Split 1 = 5.8m to same order WO 5978, Split 2 = 5.8m diverted to WO 6307.
      // Remnant per pipe = 11.8 - (5.8 + 5.8) = 0.2m (< 3.0m => Rule 5B Scrap).
      const splits: CutSplitItem[] = [
        {
          target_wo_id: 'wo-5978-same-order',
          target_stage_code: 'FINISHING',
          cut_length: 5.8,
        },
        {
          target_wo_id: 'wo-6307-target-order',
          target_stage_code: 'DRAW',
          cut_length: 5.8,
        },
      ];

      const result = calcCutSplitRemnant(11.8, 9, splits);

      expect(result.remnant_length).toBe(0.2);
      expect(result.total_remnant_mtr).toBe(1.8);
      expect(result.classification).toBe('SCRAP');
      expect(result.is_scrap).toBe(true);

      // Verify allocated quantities
      const sameOrderMtr = Number((splits[0].cut_length * 9).toFixed(2));
      const externalMtr = Number((splits[1].cut_length * 9).toFixed(2));
      expect(sameOrderMtr).toBe(52.2);
      expect(externalMtr).toBe(52.2);
      expect(Number((sameOrderMtr + externalMtr + result.total_remnant_mtr).toFixed(2))).toBe(106.2);
    });

    it('supports internal pipe cut: both halves allocated to same work order', () => {
      // 9 mother pipes of 11.8m cut into 18 customer pieces of 5.8m, all for WO 5978
      const splits: CutSplitItem[] = [
        {
          target_wo_id: 'wo-5978',
          target_stage_code: 'FINISHING',
          cut_length: 5.8,
        },
        {
          target_wo_id: 'wo-5978',
          target_stage_code: 'FINISHING',
          cut_length: 5.8,
        },
      ];

      const result = calcCutSplitRemnant(11.8, 9, splits);

      expect(result.remnant_length).toBe(0.2);
      expect(result.total_remnant_mtr).toBe(1.8);
      expect(result.classification).toBe('SCRAP');

      const totalRetainedMtr = Number(((splits[0].cut_length + splits[1].cut_length) * 9).toFixed(2));
      expect(totalRetainedMtr).toBe(104.4);
    });

    it('supports cutting for same order and auto-saving remaining offcut >= 3.0m under Rule 5C', () => {
      // 9 mother pipes of 11.8m cut: 6.0m to same WO, remaining 5.8m auto-classified as USABLE_OFFCUT
      const splits: CutSplitItem[] = [
        {
          target_wo_id: 'wo-5978',
          target_stage_code: 'FINISHING',
          cut_length: 6.0,
        },
      ];

      const result = calcCutSplitRemnant(11.8, 9, splits);

      expect(result.remnant_length).toBe(5.8);
      expect(result.total_remnant_mtr).toBe(52.2);
      expect(result.classification).toBe('USABLE_OFFCUT');
      expect(result.is_usable_offcut).toBe(true);
      expect(result.is_scrap).toBe(false);
    });

    it('supports Example 1: 14 Nos in 10m length across the 3 diversion pathways', () => {
      // Pathway 1: Divert to single work order after cutting from the middle (2 cuts/pipe => 28 pcs @ 5.0m)
      const singleOrderSplits: CutSplitItem[] = [
        {
          target_wo_id: 'wo-target-single',
          target_stage_code: 'DRAW',
          cut_length: 5.0,
          cuts_per_pipe: 2, // cut from middle yields 2 pieces per mother pipe
        },
      ];
      const singleRes = calcCutSplitRemnant(10.0, 14, singleOrderSplits);
      expect(singleRes.remnant_length).toBe(0);
      expect(singleRes.total_remnant_mtr).toBe(0);
      const totalPiecesSingle = 14 * 2;
      const totalMtrSingle = totalPiecesSingle * 5.0;
      expect(totalPiecesSingle).toBe(28);
      expect(totalMtrSingle).toBe(140.0);

      // Pathway 2: After cutting, divert to multiple work orders (14 pcs @ 5m to WO 1, 14 pcs @ 5m to WO 2)
      const multiOrderSplits: CutSplitItem[] = [
        {
          target_wo_id: 'wo-target-1',
          target_stage_code: 'DRAW',
          cut_length: 5.0,
          cuts_per_pipe: 1,
        },
        {
          target_wo_id: 'wo-target-2',
          target_stage_code: 'BAND_SAW',
          cut_length: 5.0,
          cuts_per_pipe: 1,
        },
      ];
      const multiRes = calcCutSplitRemnant(10.0, 14, multiOrderSplits);
      expect(multiRes.remnant_length).toBe(0);
      expect(multiRes.total_remnant_mtr).toBe(0);
      expect(14 * 5.0 + 14 * 5.0).toBe(140.0);

      // Pathway 3: Send without cutting (14 pcs @ 10.0m as-is => 140.0m)
      const noCutSplits: CutSplitItem[] = [
        {
          target_wo_id: 'wo-target-direct',
          target_stage_code: 'DRAW',
          cut_length: 10.0,
          cuts_per_pipe: 1,
        },
      ];
      const noCutRes = calcCutSplitRemnant(10.0, 14, noCutSplits);
      expect(noCutRes.remnant_length).toBe(0);
      expect(noCutRes.total_remnant_mtr).toBe(0);
      expect(14 * 10.0).toBe(140.0);
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
