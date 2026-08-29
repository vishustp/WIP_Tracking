// types/index.ts
export type StageCode =
  | "ROLLING"
  | "HOLLOW_HEAT_TREATMENT"
  | "DRAW"
  | "HEAT_TREATMENT"
  | "FINISHING";

export interface Row {
  work_order_id: string;
  work_order_no: string;
  customer_name: string | null;
  specification: string | null;
  od: number | null;
  wl: number | null;
  l1: number | null;
  l2: number | null;
  avg_length: number | null;

  // Mother Hollow dimensions (for Rolling calculations)
  mh_od?: number | null;
  mh_wt?: number | null;
  mh_l1?: number | null;
  mh_l2?: number | null;
  mh_avg_length?: number | null;
  target_mother_size?: string | null;

  route_id: string;
  route_code: string;
  route_name: string;
  stage_code: StageCode;
  is_hfs?: boolean;
  is_cds?: boolean;
  prev_stage_code?: string;
  prev_stage_name?: string;
  prev_gross_output?: number;
  prev_rejection?: number;
  prev_net_output?: number;
  prev_htc_ok?: number;
  planned_rolling_total?: number;
  max_allowed_mtr?: number;
  max_allowed_pcs?: number;
  balance_to_make_mtr: number | null;
  balance_to_make_pcs: number | null;
  balance_to_make_mt: number | null;
  multiple: number | null;
  ht_nos: number | null;
  ht_prod_nos?: number | null;
  ht_rej_nos?: number | null;
  ht_input_nos: string;
  pcs: string;
  mtr: string;
  rejection_pcs: string;
  rejection_mtr: string;
  htc_ok_pcs: string;
  htc_ok_mtr: string;
  heat_lot_no: string;
  remarks: string;
}

export interface ProductionEntry {
  id: string;
  work_order_no: string;
  customer_name: string | null;
  route_code: string;
  stage_code: StageCode;
  process_date: string;
  od: number | null;
  wl: number | null;
  l1: number | null;
  l2: number | null;
  avg_length: number | null;
  input_mtr: number;
  input_pcs: number;
  input_mt: number;
  output_mtr: number;
  output_pcs: number;
  output_mt: number;
  rejection_mtr: number;
  rejection_pcs: number;
  rejection_mt: number;
  htc_ok_mtr: number;
  heat_lot_no: string | null;
  remarks: string | null;
  created_at: string;
  can_modify: boolean;
}

export const STAGES: { code: StageCode; label: string }[] = [
  { code: "ROLLING", label: "Rolling" },
  { code: "HOLLOW_HEAT_TREATMENT", label: "Hollow Heat Treatment" },
  { code: "DRAW", label: "Draw" },
  { code: "HEAT_TREATMENT", label: "Heat Treatment" },
  { code: "FINISHING", label: "Finishing" },
];

export const emptyRow = (r: Omit<
  Row,
  | "pcs"
  | "mtr"
  | "rejection_pcs"
  | "rejection_mtr"
  | "htc_ok_pcs"
  | "htc_ok_mtr"
  | "heat_lot_no"
  | "remarks"
  | "ht_input_nos"
>): Row => ({
  ...r,
  ht_input_nos: "",
  pcs: "",
  mtr: "",
  rejection_pcs: "",
  rejection_mtr: "",
  htc_ok_pcs: "",
  htc_ok_mtr: "",
  heat_lot_no: "",
  remarks: "",
});