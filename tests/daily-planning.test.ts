// tests/daily-planning.test.ts
import { describe, it, expect } from 'vitest';
import {
  calculatePlanCompliance,
  calculateStationPlannedTotals,
  groupFurnaceChargesByGrade,
  buildDailyPlanCsv,
  filterEligibleWipQueue,
  STATION_MACHINE_PRESETS,
} from '@/lib/planning/dailyPlanningHelper';
import { DailyPlanItemWithWorkOrder } from '@/types/dailyPlanning';

describe('Daily Planning Helper Utilities', () => {
  describe('calculatePlanCompliance', () => {
    it('returns 100% when target is 0 or actual matches target', () => {
      expect(calculatePlanCompliance(0, 0)).toBe(100);
      expect(calculatePlanCompliance(50, 50)).toBe(100);
    });

    it('calculates proportional completion percentage accurately', () => {
      expect(calculatePlanCompliance(100, 50)).toBe(50);
      expect(calculatePlanCompliance(80, 20)).toBe(25);
    });

    it('handles over-performance beyond 100%', () => {
      expect(calculatePlanCompliance(50, 60)).toBe(120);
    });

    it('handles 0 actual production gracefully', () => {
      expect(calculatePlanCompliance(50, 0)).toBe(0);
    });
  });

  describe('calculateStationPlannedTotals', () => {
    const mockPlans: DailyPlanItemWithWorkOrder[] = [
      {
        id: '1',
        plan_date: '2026-10-09',
        shift: 'SHIFT_A',
        work_center: 'DRAW',
        work_order_id: 'wo-1',
        work_order_no: 'WO-6278',
        target_pcs: 30,
        target_mtr: 180,
        target_mt: 1.5,
        actual_pcs: 15,
        actual_mtr: 90,
        actual_mt: 0.75,
        compliance_pct: 50,
        priority_rank: 1,
        status: 'IN_PROGRESS',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: '2',
        plan_date: '2026-10-09',
        shift: 'SHIFT_A',
        work_center: 'DRAW',
        work_order_id: 'wo-2',
        work_order_no: 'WO-6279',
        target_pcs: 20,
        target_mtr: 120,
        target_mt: 1.0,
        actual_pcs: 20,
        actual_mtr: 120,
        actual_mt: 1.0,
        compliance_pct: 100,
        priority_rank: 2,
        status: 'COMPLETED',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    it('aggregates target and actual metrics correctly', () => {
      const summary = calculateStationPlannedTotals('DRAW', mockPlans);
      expect(summary.total_plans).toBe(2);
      expect(summary.total_target_pcs).toBe(50);
      expect(summary.total_target_mtr).toBe(300);
      expect(summary.total_target_mt).toBe(2.5);
      expect(summary.total_actual_pcs).toBe(35);
      expect(summary.total_actual_mtr).toBe(210);
      expect(summary.total_actual_mt).toBe(1.75);
      expect(summary.overall_compliance_pct).toBe(70);
    });

    it('handles empty plans gracefully', () => {
      const summary = calculateStationPlannedTotals('HEAT_TREATMENT', []);
      expect(summary.total_plans).toBe(0);
      expect(summary.total_target_pcs).toBe(0);
      expect(summary.overall_compliance_pct).toBe(100);
    });
  });

  describe('groupFurnaceChargesByGrade', () => {
    it('groups heat treatment items with same charge or grade', () => {
      const items: Partial<DailyPlanItemWithWorkOrder>[] = [
        { id: '1', grade: 'SA106B', charge_no: 'CH-101', target_pcs: 10 },
        { id: '2', grade: 'SA106B', charge_no: 'CH-101', target_pcs: 15 },
        { id: '3', grade: 'SA335 P11', charge_no: 'CH-102', target_pcs: 20 },
      ];

      const groups = groupFurnaceChargesByGrade(items as DailyPlanItemWithWorkOrder[]);
      expect(Object.keys(groups)).toHaveLength(2);
      expect(groups['CH-101_SA106B']).toHaveLength(2);
      expect(groups['CH-102_SA335 P11']).toHaveLength(1);
    });
  });

  describe('filterEligibleWipQueue', () => {
    it('only returns queue items with positive available pieces or meters', () => {
      const queue = [
        { work_order_id: '1', available_pcs: 10, available_mtr: 60 },
        { work_order_id: '2', available_pcs: 0, available_mtr: 0 },
        { work_order_id: '3', available_pcs: -2, available_mtr: 0 },
        { work_order_id: '4', available_pcs: 5, available_mtr: 30 },
      ];

      const eligible = filterEligibleWipQueue(queue as any[]);
      expect(eligible).toHaveLength(2);
      expect(eligible.map((i) => i.work_order_id)).toEqual(['1', '4']);
    });

    it('correctly filters queue rows structured with balance_to_make_pcs and balance_to_make_mtr', () => {
      const queue = [
        { work_order_id: 'w1', balance_to_make_pcs: 60, balance_to_make_mtr: 387 },
        { work_order_id: 'w2', balance_to_make_pcs: 0, balance_to_make_mtr: 0 },
        { work_order_id: 'w3', balance_to_make_pcs: 234, balance_to_make_mtr: 1659.06 },
      ];

      const eligible = filterEligibleWipQueue(queue as any[]);
      expect(eligible).toHaveLength(2);
      expect(eligible.map((i) => i.work_order_id)).toEqual(['w1', 'w3']);
    });
  });

  describe('buildDailyPlanCsv', () => {
    it('generates standard CSV with correct headers and quoted fields', () => {
      const plans: DailyPlanItemWithWorkOrder[] = [
        {
          id: '1',
          plan_date: '2026-10-09',
          shift: 'SHIFT_A',
          work_center: 'DRAW',
          work_order_id: 'wo-1',
          work_order_no: 'WO-6278',
          customer_name: 'BHEL, Trichy',
          grade: 'SA106B',
          size_od: 60.3,
          size_wt: 3.91,
          target_pcs: 40,
          target_mtr: 240,
          target_mt: 1.3,
          machine_id: 'Bench #1',
          actual_pcs: 20,
          actual_mtr: 120,
          actual_mt: 0.65,
          compliance_pct: 50,
          priority_rank: 1,
          status: 'IN_PROGRESS',
          notes: 'High priority boiler order',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      const csv = buildDailyPlanCsv(plans, '2026-10-09', 'SHIFT_A');
      expect(csv).toContain('Plan Date,Shift,Work Center,Work Order,Customer,Grade');
      expect(csv).toContain('WO-6278');
      expect(csv).toContain('"BHEL, Trichy"');
      expect(csv).toContain('Bench #1');
    });
  });

  describe('STATION_MACHINE_PRESETS', () => {
    it('includes presets for Draw Bench, Pilger Mill, Heat Treatment, and Finishing', () => {
      expect(STATION_MACHINE_PRESETS.DRAW.length).toBeGreaterThan(0);
      expect(STATION_MACHINE_PRESETS.PILGER.length).toBeGreaterThan(0);
      expect(STATION_MACHINE_PRESETS.HEAT_TREATMENT.length).toBeGreaterThan(0);
      expect(STATION_MACHINE_PRESETS.BAND_SAW.length).toBeGreaterThan(0);
    });
  });
});
