// tests/process-sheet-calculations-audit.test.ts
import { describe, it, expect } from 'vitest';
import {
  findMatchingSpecMaster,
  autoPopulateProcessSheet,
  cleanOrFallbackSteelGrade,
  inferRouteFromMaterialOrSpec,
} from '../lib/metallurgy/processSheetSpecHelper';
import { DEFAULT_SPEC_MASTER_RECORDS } from '../lib/specMasterDefaults';
import { calculateHydroPressurePsi, calculateStandardTolerances } from '../lib/metallurgy/specEngine';

describe('Process Sheet Mathematical & Metallurgical Audit', () => {
  describe('1. Mother Hollow & Piercer Shell Weight Physical Calculations', () => {
    it('correctly calculates mother hollow kg/mtr from mother hollow dimensions instead of finished pipe weight', () => {
      // CDS Work Order: Finished tube 21.3 x 2.11 mm, Mother Hollow 73.0 x 7.75 mm
      const cdsPlan = {
        work_order_no: '1446',
        size_od: 21.3,
        size_wt: 2.11,
        l1: 6.0,
        l2: 6.0,
        planned_qty: 1000,
        target_mother_size: '73.0x7.75',
        specification: 'ASTM A210 Gr A1',
        grade: 'A210 Gr A1',
        route_code: 'CDS',
      };

      const sheet = autoPopulateProcessSheet(cdsPlan, DEFAULT_SPEC_MASTER_RECORDS);

      // Finished pipe weight: (21.3 - 2.11) * 2.11 * 0.0246615 = 0.9987 ~ 1.00 kg/m
      expect(Number(sheet.finalPipeWeight)).toBeCloseTo(1.00, 2);

      // Mother hollow OD and WT extracted from target_mother_size
      expect(Number(sheet.motherHollowOd)).toBe(73.0);
      expect(Number(sheet.motherHollowWt)).toBe(7.75);

      // Mother Hollow weight: (73.0 - 7.75) * 7.75 * 0.0246615 = 12.47 kg/m
      // MUST NOT equal finished pipe weight of ~1.00 kg/m
      expect(Number(sheet.motherHollowKgMtr)).toBeCloseTo(12.47, 1);
      expect(Number(sheet.motherHollowKgMtr)).not.toBe(Number(sheet.finalPipeWeight));

      // Piercing mill shell weight:
      // Piercer OD = 73.0 * 1.08 = 78.84, Piercer WT = 7.75 * 1.04 = 8.06
      // Shell weight: (78.84 - 8.06) * 8.06 * 0.0246615 = 14.05 kg/m
      expect(Number(sheet.shellWeight)).toBeGreaterThan(10);
      expect(Number(sheet.shellWeight)).toBeLessThan(18);
    });

    it('correctly calculates HFS mother hollow weight when mother hollow equals finished size', () => {
      // HFS Order: 88.9 x 5.49 mm
      const hfsPlan = {
        work_order_no: '1200',
        size_od: 88.9,
        size_wt: 5.49,
        l1: 6.0,
        l2: 6.0,
        planned_qty: 500,
        specification: 'ASTM A106 Gr B',
        grade: 'SAE 1018',
        route_code: 'HFS',
      };

      const sheet = autoPopulateProcessSheet(hfsPlan, DEFAULT_SPEC_MASTER_RECORDS);
      // (88.9 - 5.49) * 5.49 * 0.0246615 = 11.29 kg/m
      expect(Number(sheet.finalPipeWeight)).toBeCloseTo(11.29, 1);
      expect(Number(sheet.motherHollowKgMtr)).toBeCloseTo(11.29, 1);
    });
  });

  describe('2. Spec Master Matching Precision (No Greedy Hijacking)', () => {
    it('accurately resolves ASTM A335 Gr P22 without defaulting to P11', () => {
      const matchP22 = findMatchingSpecMaster('ASTM A335 Gr P22', DEFAULT_SPEC_MASTER_RECORDS);
      expect(matchP22?.spec_key).toBe('A335_P22');
      expect(matchP22?.steel_grade).toContain('2.25Cr - 1Mo');

      const matchP11 = findMatchingSpecMaster('ASTM A335 Gr P11', DEFAULT_SPEC_MASTER_RECORDS);
      expect(matchP11?.spec_key).toBe('A335_P11');
      expect(matchP11?.steel_grade).toContain('1.25Cr - 0.5Mo');
    });

    it('accurately resolves ASTM A213 T22, T12, and T11 independently', () => {
      const matchT22 = findMatchingSpecMaster('ASTM A213 T22', DEFAULT_SPEC_MASTER_RECORDS);
      expect(matchT22?.spec_key).toBe('A213_T22');
      expect(matchT22?.steel_grade).toContain('2.25Cr - 1Mo');

      const matchT12 = findMatchingSpecMaster('ASTM A213 T12', DEFAULT_SPEC_MASTER_RECORDS);
      expect(matchT12?.spec_key).toBe('A213_T12');
      expect(matchT12?.steel_grade).toContain('1Cr - 0.5Mo');

      const matchT11 = findMatchingSpecMaster('ASTM A213 T11', DEFAULT_SPEC_MASTER_RECORDS);
      expect(matchT11?.spec_key).toBe('A213_T11');
      expect(matchT11?.steel_grade).toContain('1.25Cr - 0.5Mo');
    });

    it('accurately resolves ASME SA210 Gr C versus Gr A-1', () => {
      const matchGrC = findMatchingSpecMaster('ASME SA210 Gr C', DEFAULT_SPEC_MASTER_RECORDS);
      expect(matchGrC?.spec_key).toBe('A210_C');
      expect(matchGrC?.smys_mpa).toBe(275);

      const matchGrA1 = findMatchingSpecMaster('ASME SA210 Gr A-1', DEFAULT_SPEC_MASTER_RECORDS);
      expect(matchGrA1?.spec_key).toBe('A210');
      expect(matchGrA1?.smys_mpa).toBe(255);
    });

    it('accurately resolves ASTM A106 Gr C versus Gr B', () => {
      const matchGrC = findMatchingSpecMaster('ASTM A106 Gr C', DEFAULT_SPEC_MASTER_RECORDS);
      expect(matchGrC?.spec_key).toBe('SA106_C');
      expect(matchGrC?.smys_mpa).toBe(275);

      const matchGrB = findMatchingSpecMaster('ASTM A106 Gr B', DEFAULT_SPEC_MASTER_RECORDS);
      expect(matchGrB?.spec_key).toBe('A106');
      expect(matchGrB?.smys_mpa).toBe(240);
    });

    it('accurately resolves BS 3059 Part 2 Gr 620, 440, and 360', () => {
      const match620 = findMatchingSpecMaster('BS 3059 Part 2 Gr 620', DEFAULT_SPEC_MASTER_RECORDS);
      expect(match620?.spec_key).toBe('BS3059_620');
      expect(match620?.smys_mpa).toBe(310);

      const match440 = findMatchingSpecMaster('BS 3059 Part 2 Gr 440', DEFAULT_SPEC_MASTER_RECORDS);
      expect(match440?.spec_key).toBe('BS3059_440');
      expect(match440?.smys_mpa).toBe(255);

      const match360 = findMatchingSpecMaster('BS 3059 Part 2 Gr 360', DEFAULT_SPEC_MASTER_RECORDS);
      expect(match360?.spec_key).toBe('BS3059_360');
      expect(match360?.smys_mpa).toBe(215);
    });
  });

  describe('3. Steel Grade Clean Fallbacks', () => {
    it('returns exact alloy descriptions for T12, P12, T91, P91', () => {
      expect(cleanOrFallbackSteelGrade('ASME SA213 GR.T12', 'ASME SA213 GR.T12')).toBe('1Cr - 0.5Mo');
      expect(cleanOrFallbackSteelGrade('ASME SA335 GR.P12', 'ASME SA335 GR.P12')).toBe('1Cr - 0.5Mo');
      expect(cleanOrFallbackSteelGrade('ASTM A213 T91', 'ASTM A213 T91')).toBe('9Cr - 1Mo - V');
    });
  });

  describe('4. Process Wall & Barlow Hydro Calculations', () => {
    it('calculates Barlow hydrostatic test pressure with proper SMYS and 2500 PSI standard cap', () => {
      // 88.9 mm OD x 5.49 mm WT, SMYS = 240 MPa (A106 Gr B)
      const res = calculateHydroPressurePsi(88.9, 5.49, 240);
      expect(res.pressurePsi).toBeGreaterThanOrEqual(1000);
      expect(res.pressurePsi).toBeLessThanOrEqual(2500);

      // Heavy wall pipe that exceeds cap: 60.3 OD x 11.07 WT, SMYS = 275 MPa
      const heavyRes = calculateHydroPressurePsi(60.3, 11.07, 275);
      expect(heavyRes.pressurePsi).toBe(2500); // capped at 2500
    });

    it('calculates process wall thickness +5% for Min-Wall specifications and -3% for Nominal Wall', () => {
      // Min Wall order (A210): 4.00 * 1.05 = 4.20 mm
      const minWallPlan = {
        work_order_no: '101',
        size_od: 50.8,
        size_wt: 4.0,
        l1: 6.0,
        l2: 6.0,
        specification: 'ASTM A210 Gr A1 (MIN WALL)',
        grade: 'A210 Gr A1',
      };
      const minSheet = autoPopulateProcessSheet(minWallPlan, DEFAULT_SPEC_MASTER_RECORDS);
      expect(Number(minSheet.processWt)).toBeCloseTo(4.20, 2);
      expect(minSheet.isMinWall).toBe(true);

      // Nominal Wall order (A106): 5.49 * 0.97 = 5.33 mm
      const nomWallPlan = {
        work_order_no: '102',
        size_od: 88.9,
        size_wt: 5.49,
        l1: 6.0,
        l2: 6.0,
        specification: 'ASTM A106 Gr B',
        grade: 'A106 Gr B',
      };
      const nomSheet = autoPopulateProcessSheet(nomWallPlan, DEFAULT_SPEC_MASTER_RECORDS);
      expect(Number(nomSheet.processWt)).toBeCloseTo(5.33, 2);
      expect(nomSheet.isMinWall).toBe(false);
    });
  });

  describe('5. Billet Diameter and Section Weight Rules', () => {
    it('assigns 63mm billet (24.49 kg/m) for OD <= 75mm and 90mm billet (49.98 kg/m) for OD > 75mm', () => {
      const smallPlan = {
        work_order_no: '201',
        size_od: 50.8,
        size_wt: 3.66,
        target_mother_size: '60.3x4.5',
      };
      const smallSheet = autoPopulateProcessSheet(smallPlan, DEFAULT_SPEC_MASTER_RECORDS);
      expect(Number(smallSheet.billetDia)).toBe(63.0);
      expect(Number(smallSheet.billetSectWt)).toBeCloseTo(24.49, 1);

      const largePlan = {
        work_order_no: '202',
        size_od: 88.9,
        size_wt: 5.49,
      };
      const largeSheet = autoPopulateProcessSheet(largePlan, DEFAULT_SPEC_MASTER_RECORDS);
      expect(Number(largeSheet.billetDia)).toBe(90.0);
      expect(Number(largeSheet.billetSectWt)).toBeCloseTo(49.98, 1);
    });
  });
});
