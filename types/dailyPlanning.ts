// types/dailyPlanning.ts

import { StageCode } from '@/types';

export type DailyPlanShift = 'ALL_DAY' | 'SHIFT_A' | 'SHIFT_B' | 'SHIFT_C';

export type DailyPlanWorkCenter =
  | 'DRAW'
  | 'PILGER'
  | 'HOLLOW_HEAT_TREATMENT'
  | 'HEAT_TREATMENT'
  | 'BAND_SAW'
  | 'VDI'
  | 'FINISHING';

export type DailyPlanStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface DailyPlanRecord {
  id: string;
  plan_date: string; // YYYY-MM-DD
  shift: DailyPlanShift;
  work_center: DailyPlanWorkCenter;
  work_order_id: string;
  target_pcs: number;
  target_mtr: number;
  target_mt: number;
  machine_id?: string | null;
  charge_no?: string | null;
  pass_no?: string | null;
  priority_rank: number;
  notes?: string | null;
  status: DailyPlanStatus;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DailyPlanItemWithWorkOrder extends DailyPlanRecord {
  work_order_no: string;
  customer_name?: string | null;
  grade?: string | null;
  specification?: string | null;
  size_od?: number | null;
  size_wt?: number | null;
  ordered_qty_pcs?: number;
  ordered_qty_mtr?: number | null;
  route_code?: string | null;
  available_wip_pcs?: number;
  available_wip_mtr?: number;
  
  // Live Actuals from Production Logs
  actual_pcs: number;
  actual_mtr: number;
  actual_mt: number;
  compliance_pct: number;
}

export interface StationDailySummary {
  work_center: DailyPlanWorkCenter;
  label: string;
  total_plans: number;
  total_target_pcs: number;
  total_target_mtr: number;
  total_target_mt: number;
  total_actual_pcs: number;
  total_actual_mtr: number;
  total_actual_mt: number;
  overall_compliance_pct: number;
}

export interface MachinePresetOption {
  id: string;
  label: string;
  work_center: DailyPlanWorkCenter;
  description?: string;
}
