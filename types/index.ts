// types/index.ts
export type StageCode =
  | "ROLLING"
  | "HOLLOW_HEAT_TREATMENT"
  | "DRAW"
  | "HEAT_TREATMENT"
  | "FINISHING";

export interface WorkCenterWipInfo {
  stage_code: StageCode;
  stage_name: string;
  sequence_no: number;
  available_mtr: number;
  available_pcs: number;
  available_mt?: number;
  gross_output_mtr: number;
  gross_output_pcs: number;
  gross_output_mt?: number;
  rejection_mtr: number;
  rejection_pcs: number;
  rejection_mt?: number;
  net_output_mtr: number;
  net_output_pcs: number;
  net_output_mt?: number;
  htc_ok_mtr?: number;
  htc_ok_pcs?: number;
  htc_ok_mt?: number;
}

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
  max_allowed_mtr?: number | null;
  max_allowed_pcs?: number | null;
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

  // Work Center WIP Breakdown across the entire route
  work_centers_wip?: WorkCenterWipInfo[];

  // Total Order & Balance to Make Metrics (for Finishing & Planning)
  total_order_pcs?: number | null;
  total_order_mtr?: number | null;
  total_order_mt?: number | null;
  balance_to_make_order_pcs?: number | null;
  balance_to_make_order_mtr?: number | null;
  balance_to_make_order_mt?: number | null;
  finished_output_mtr?: number | null;
  finished_output_pcs?: number | null;
  order_capping_mtr?: number | null;
  order_capping_pcs?: number | null;

  // Master / Child Work Order & Rolling Campaign fields
  is_master?: boolean;
  is_child?: boolean;
  master_wo_id?: string;
  master_wo_no?: string;
  master_plan_no?: string;
  campaign_total_mtr?: number;
  campaign_total_pcs?: number;
  child_work_orders?: Array<{
    id?: string;
    work_order_id?: string;
    work_order_no: string;
    customer_name?: string | null;
    grade?: string | null;
    size_od?: number | null;
    size_wt?: number | null;
    l1?: number | null;
    l2?: number | null;
    planned_pcs?: number;
    planned_mtr?: number;
    planned_mt?: number;
    total_order_pcs?: number;
    total_order_mtr?: number;
    total_order_mt?: number;
    balance_to_make_pcs?: number;
    balance_to_make_mtr?: number;
    balance_to_make_mt?: number;
    finished_output_mtr?: number;
    finished_output_pcs?: number;
    order_capping_mtr?: number;
    order_capping_pcs?: number;
    balance_to_bundle_mtr?: number;
    balance_to_bundle_pcs?: number;
  }>;
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
  htc_ok_pcs?: number;
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