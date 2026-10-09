// lib/planning/dailyPlanningHelper.ts

import {
  DailyPlanItemWithWorkOrder,
  DailyPlanWorkCenter,
  DailyPlanShift,
  StationDailySummary,
  MachinePresetOption,
} from '@/types/dailyPlanning';

export const STATION_LABELS: Record<DailyPlanWorkCenter, string> = {
  DRAW: 'Cold Draw Bench',
  PILGER: 'Cold Pilger Mill',
  HOLLOW_HEAT_TREATMENT: 'Hollow Heat Treatment',
  HEAT_TREATMENT: 'Final Heat Treatment',
  BAND_SAW: 'Band Saw Cutting',
  VDI: 'VDI Inspection',
  FINISHING: 'Bundling & Dispatch Line',
};

export const SHIFT_LABELS: Record<DailyPlanShift, string> = {
  ALL_DAY: 'All Day (General)',
  SHIFT_A: 'Shift A (07:00 - 15:00)',
  SHIFT_B: 'Shift B (15:00 - 23:00)',
  SHIFT_C: 'Shift C (23:00 - 07:00)',
};

export const STATION_MACHINE_PRESETS: Record<DailyPlanWorkCenter, MachinePresetOption[]> = {
  DRAW: [
    { id: 'Bench #1 (Heavy)', label: 'Bench #1 (Heavy 60-120mm)', work_center: 'DRAW' },
    { id: 'Bench #2 (Medium)', label: 'Bench #2 (Medium 35-70mm)', work_center: 'DRAW' },
    { id: 'Bench #3 (Light)', label: 'Bench #3 (Light < 35mm)', work_center: 'DRAW' },
  ],
  PILGER: [
    { id: 'Pilger Mill #1', label: 'Pilger Mill #1 (LG-60)', work_center: 'PILGER' },
    { id: 'Pilger Mill #2', label: 'Pilger Mill #2 (LG-30)', work_center: 'PILGER' },
  ],
  HOLLOW_HEAT_TREATMENT: [
    { id: 'Furnace #1 (Roller Hearth)', label: 'Furnace #1 (Roller Hearth)', work_center: 'HOLLOW_HEAT_TREATMENT' },
    { id: 'Bogie Hearth #1', label: 'Bogie Hearth #1', work_center: 'HOLLOW_HEAT_TREATMENT' },
  ],
  HEAT_TREATMENT: [
    { id: 'Furnace #1 (Normalizing/Annealing)', label: 'Furnace #1 (Normalizing)', work_center: 'HEAT_TREATMENT' },
    { id: 'Furnace #2 (Quench & Temper)', label: 'Furnace #2 (Quench & Temper)', work_center: 'HEAT_TREATMENT' },
    { id: 'Bogie Hearth #2', label: 'Bogie Hearth #2', work_center: 'HEAT_TREATMENT' },
  ],
  BAND_SAW: [
    { id: 'Band Saw #1', label: 'Band Saw #1 (Main)', work_center: 'BAND_SAW' },
    { id: 'Band Saw #2', label: 'Band Saw #2 (High Speed)', work_center: 'BAND_SAW' },
  ],
  VDI: [
    { id: 'VDI Line #1', label: 'VDI Line #1 (Visual & Dimension)', work_center: 'VDI' },
    { id: 'NDT Ultrasonic Station', label: 'NDT Ultrasonic Station', work_center: 'VDI' },
  ],
  FINISHING: [
    { id: 'Bundling Bed #1', label: 'Bundling Bed #1 (Stenciling & Strapping)', work_center: 'FINISHING' },
    { id: 'Dispatch Staging Bay', label: 'Dispatch Staging Bay (Lorry Loading)', work_center: 'FINISHING' },
  ],
};

/**
 * Calculates percentage completion (compliance) of actual output against target.
 * Returns 100% if target is 0.
 */
export function calculatePlanCompliance(target: number, actual: number): number {
  if (target <= 0) return 100;
  return Number(((actual / target) * 100).toFixed(1));
}

/**
 * Computes station total targets and actuals.
 */
export function calculateStationPlannedTotals(
  wc: DailyPlanWorkCenter,
  plans: DailyPlanItemWithWorkOrder[]
): StationDailySummary {
  const stationPlans = plans.filter((p) => p.work_center === wc);

  let total_target_pcs = 0;
  let total_target_mtr = 0;
  let total_target_mt = 0;
  let total_actual_pcs = 0;
  let total_actual_mtr = 0;
  let total_actual_mt = 0;

  stationPlans.forEach((p) => {
    total_target_pcs += Number(p.target_pcs || 0);
    total_target_mtr += Number(p.target_mtr || 0);
    total_target_mt += Number(p.target_mt || 0);
    total_actual_pcs += Number(p.actual_pcs || 0);
    total_actual_mtr += Number(p.actual_mtr || 0);
    total_actual_mt += Number(p.actual_mt || 0);
  });

  const overall_compliance_pct =
    total_target_pcs > 0 ? calculatePlanCompliance(total_target_pcs, total_actual_pcs) : 100;

  return {
    work_center: wc,
    label: STATION_LABELS[wc] || wc,
    total_plans: stationPlans.length,
    total_target_pcs,
    total_target_mtr: Number(total_target_mtr.toFixed(2)),
    total_target_mt: Number(total_target_mt.toFixed(3)),
    total_actual_pcs,
    total_actual_mtr: Number(total_actual_mtr.toFixed(2)),
    total_actual_mt: Number(total_actual_mt.toFixed(3)),
    overall_compliance_pct,
  };
}

/**
 * Groups heat treatment charges by charge number and steel grade.
 */
export function groupFurnaceChargesByGrade(
  items: DailyPlanItemWithWorkOrder[]
): Record<string, DailyPlanItemWithWorkOrder[]> {
  const groups: Record<string, DailyPlanItemWithWorkOrder[]> = {};

  items.forEach((item) => {
    const charge = item.charge_no?.trim() || 'UNASSIGNED';
    const grade = item.grade?.trim() || 'STANDARD';
    const key = `${charge}_${grade}`;
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(item);
  });

  return groups;
}

/**
 * Filters live stage WIP queue items that are eligible for daily scheduling.
 */
export function filterEligibleWipQueue(queue: any[]): any[] {
  return (queue || []).filter((item) => {
    const pcs = Number(item.balance_to_make_pcs ?? item.available_pcs ?? 0);
    const mtr = Number(item.balance_to_make_mtr ?? item.available_mtr ?? 0);
    return pcs > 0 || mtr > 0;
  });
}

/**
 * Formats daily plans into CSV export format.
 */
export function buildDailyPlanCsv(
  plans: DailyPlanItemWithWorkOrder[],
  date: string,
  shift: string
): string {
  const headers = [
    'Plan Date',
    'Shift',
    'Work Center',
    'Work Order',
    'Customer',
    'Grade',
    'Pipe Size (ODxWT)',
    'Machine / Furnace',
    'Charge / Pass',
    'Target PCS',
    'Target MTR',
    'Target MT',
    'Actual PCS',
    'Actual MTR',
    'Actual MT',
    'Compliance %',
    'Priority',
    'Status',
    'Notes',
  ];

  const rows = plans.map((p) => {
    const sizeStr = p.size_od && p.size_wt ? `${p.size_od} x ${p.size_wt}` : '—';
    const cust = `"${(p.customer_name || 'Standard Stock').replace(/"/g, '""')}"`;
    const notes = `"${(p.notes || '').replace(/"/g, '""')}"`;
    const chargeOrPass = p.charge_no || p.pass_no || '—';

    return [
      p.plan_date,
      p.shift,
      STATION_LABELS[p.work_center] || p.work_center,
      p.work_order_no,
      cust,
      p.grade || '—',
      sizeStr,
      p.machine_id || '—',
      chargeOrPass,
      p.target_pcs,
      p.target_mtr,
      p.target_mt,
      p.actual_pcs,
      p.actual_mtr,
      p.actual_mt,
      `${p.compliance_pct}%`,
      p.priority_rank,
      p.status,
      notes,
    ];
  });

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}
