export type HollowBankStatus = 'AVAILABLE' | 'PARTIALLY_ALLOCATED' | 'FULLY_ALLOCATED' | 'SCRAPPED';

export interface HollowBankLot {
  id: string;
  lot_no: string;
  source_wo_id: string;
  source_wo_no?: string;
  source_customer?: string;
  source_stage_code: string;
  heat_no?: string | null;
  od: number;
  wt: number;
  grade: string;
  pcs: number;
  avg_length: number;
  total_meters: number;
  weight_mt: number;
  status: HollowBankStatus;
  available_pcs: number;
  available_meters: number;
  available_mt: number;
  banked_date: string;
  banked_by?: string | null;
  remarks?: string | null;
  created_at: string;
  updated_at: string;
  allocations_count?: number;
}

export interface HollowBankAllocation {
  id: string;
  hollow_bank_id: string;
  lot_no?: string;
  od?: number;
  wt?: number;
  grade?: string;
  heat_no?: string | null;
  source_stage_code?: string;
  source_wo_no?: string;
  source_customer?: string;
  target_wo_id: string;
  target_wo_no?: string;
  target_customer?: string;
  target_stage_code: string;
  allocated_pcs: number;
  allocated_meters: number;
  allocated_mt: number;
  allocated_date: string;
  allocated_by?: string | null;
  remarks?: string | null;
  created_at: string;
}

export interface HollowBankFilters {
  status?: string; // 'ALL' | 'AVAILABLE' | 'ALLOCATED'
  searchQuery?: string;
  stageCode?: string;
  grade?: string;
  od?: number;
  wt?: number;
  heatNo?: string;
}

export interface CreateHollowBankEntryPayload {
  source_wo_id: string;
  source_stage_code: string;
  heat_no?: string;
  od: number;
  wt: number;
  grade: string;
  pcs: number;
  avg_length: number;
  total_meters: number;
  weight_mt?: number;
  banked_date?: string;
  remarks?: string;
}

export interface AllocateHollowLotPayload {
  hollow_bank_id: string;
  target_wo_id: string;
  target_stage_code: string;
  allocated_pcs: number;
  allocated_meters: number;
  allocated_mt?: number;
  allocated_date?: string;
  remarks?: string;
}

export interface HollowBankKpis {
  totalLots: number;
  availableLots: number;
  totalAvailablePcs: number;
  totalAvailableMtr: number;
  totalAvailableMt: number;
  stageBreakdown: Record<string, { count: number; pcs: number; mtr: number; mt: number }>;
}

/**
 * Standard seamless steel pipe metallurgical weight factor (ASTM / ASME):
 * Weight MT = (OD - WT) * WT * 0.0246615 * 0.001 * Meters
 */
export function calculatePipeWeightMt(od: number, wt: number, meters: number): number {
  if (od <= 0 || wt <= 0 || meters <= 0) return 0;
  return Number((Math.max(od - wt, 0) * Math.max(wt, 0) * 0.0246615 * 0.001 * meters).toFixed(3));
}
