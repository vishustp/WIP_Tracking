export type StageCode =
  | "ROLLING"
  | "HOLLOW_HEAT_TREATMENT"
  | "DRAW"
  | "PILGER"
  | "HEAT_TREATMENT"
  | "BAND_SAW"
  | "VDI"
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
  id?: string;
  work_order_id: string;
  work_order_no: string;
  customer_name: string | null;
  specification: string | null;
  od: number | null;
  wl: number | null;
  l1: number | null;
  l2: number | null;
  avg_length: number | null;
  len_type?: string | null;

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
  feeder_source_label?: string;
  feeder_stage_code?: string;
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
  input_l1?: string;
  input_l2?: string;
  pcs: string;
  mtr: string;
  rejection_pcs: string;
  rejection_mtr: string;
  htc_ok_pcs: string;
  htc_ok_mtr: string;
  heat_lot_no: string;
  heat_lots?: HeatLotInfo[];
  remarks: string;

  // Pending Rejection Hold info
  pending_rejection_pcs?: number | null;
  pending_rejection_mtr?: number | null;

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
  plan_no?: string;
  plan_id?: string;
  lifecycle_status?: string;
  revision_no?: number;
  campaign_total_mtr?: number;
  campaign_total_pcs?: number;
  planned_pcs?: number | null;
  planned_mtr?: number | null;
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
  work_order_id?: string;
  work_order_no: string;
  customer_name: string | null;
  grade?: string | null;
  specification?: string | null;
  route_code: string;
  stage_code: StageCode;
  process_date: string;
  od: number | null;
  wl: number | null;
  l1: number | null;
  l2: number | null;
  avg_length: number | null;
  mh_od?: number | null;
  mh_wt?: number | null;
  mh_avg_length?: number | null;
  mh_l1?: number | null;
  mh_l2?: number | null;
  plan_no?: string;
  revision_no?: number;
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
  created_by?: string | null;
  operator_name?: string | null;
  operator_role?: string | null;
  can_modify: boolean;
}

export const STAGES: { code: StageCode; label: string }[] = [
  { code: "ROLLING", label: "Rolling" },
  { code: "HOLLOW_HEAT_TREATMENT", label: "Hollow Heat Treatment" },
  { code: "DRAW", label: "Draw" },
  { code: "PILGER", label: "Cold Pilger Mill" },
  { code: "HEAT_TREATMENT", label: "Heat Treatment" },
  { code: "BAND_SAW", label: "Band Saw" },
  { code: "VDI", label: "VDI / QC" },
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
  | "input_l1"
  | "input_l2"
>): Row => {
  const isMh = r.stage_code === "ROLLING" || r.stage_code === "HOLLOW_HEAT_TREATMENT";
  const defL1 = isMh && r.mh_l1 ? String(r.mh_l1) : r.l1 ? String(r.l1) : "";
  const defL2 = isMh && r.mh_l2 ? String(r.mh_l2) : r.l2 ? String(r.l2) : "";
  return {
    ...r,
    input_l1: defL1,
    input_l2: defL2,
    ht_input_nos: "",
    pcs: "",
    mtr: "",
    rejection_pcs: "",
    rejection_mtr: "",
    htc_ok_pcs: "",
    htc_ok_mtr: "",
    heat_lot_no: "",
    remarks: "",
  };
};

export interface WorkOrder {
  id: string;
  work_order_no: string;
  customer_name?: string | null;
  size_od?: number | null;
  size_wt?: number | null;
  l1?: number | null;
  l2?: number | null;
  grade?: string | null;
  specification?: string | null;
  process_route_id?: string | null;
  ordered_qty?: number;
  ordered_qty_pcs?: number | null;
  ordered_qty_mtr?: number | null;
  ordered_qty_mt?: number | null;
  balance_qty_pcs?: number | null;
  balance_qty_mtr?: number | null;
  balance_qty_mt?: number | null;
  uom?: string;
  target_date?: string | null;
  status?: string;
  po_no?: string | null;
  po_date?: string | null;
  purchase_order_no?: string | null;
  purchase_order_date?: string | null;
  material_code?: string | null;
  destination?: string | null;
  created_at?: string;
}

export interface ProductionLog {
  id: string;
  work_order_id: string;
  stage_id?: string;
  stage_code?: string;
  stage_name?: string;
  route_id?: string | null;
  process_route_id?: string | null;
  shift_date?: string;
  process_date?: string;
  shift?: string | null;
  heat_no?: string | null;
  lot_no?: string | null;
  heat_lot_no?: string | null;
  input_qty?: number;
  output_qty?: number;
  output_pcs?: number;
  rejection_qty?: number;
  rejection_pcs?: number;
  htc_ok?: number;
  htc_ok_qty?: number;
  htc_ok_pcs?: number;
  operator_name?: string | null;
  remarks?: string | null;
  created_at?: string;
}

export interface SalvageReasonItem {
  id: string;
  reason: string;
  pcs: number;
  mtr?: number;
  mt?: number;
  remarks?: string;
}

export interface ReworkHistoryItem {
  id: string;
  date: string;
  processed_pcs: number;
  vdi_ok_pcs: number;
  diverted_pcs: number;
  diverted_to_wo_id?: string | null;
  diverted_to_wo_no?: string | null;
  rejection_pcs: number;
  remarks?: string;
  processed_by?: string | null;
  created_at: string;
}

export interface QcInspection {
  id: string;
  work_order_id: string;
  work_order_no?: string;
  customer_name?: string | null;
  specification?: string | null;
  size_od?: number | null;
  size_wt?: number | null;
  process_route_id?: string | null;
  inspection_date: string;
  inspected_pcs: number;
  inspected_mtr: number;
  inspected_mt: number;
  vdi_ok_pcs: number;
  vdi_ok_mtr: number;
  vdi_ok_mt: number;
  vdi_salvage_pcs: number;
  vdi_salvage_mtr: number;
  vdi_salvage_mt: number;
  vdi_rejection_pcs: number;
  vdi_rejection_mtr: number;
  vdi_rejection_mt: number;
  salvage_reasons: SalvageReasonItem[];
  rework_history?: ReworkHistoryItem[];
  heat_lot_no?: string | null;
  remarks?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface QcQueueItem {
  work_order_id: string;
  work_order_no: string;
  customer_name: string | null;
  specification: string | null;
  size_od: number;
  size_wt: number;
  l1?: number | null;
  l2?: number | null;
  avg_length: number;
  process_route_id?: string | null;
  route_code?: string;
  feeder_source_label?: string;
  feeder_stage_code?: string;
  heat_lot_no?: string | null;
  heat_lots?: HeatLotInfo[];
  ht_ok_pcs: number;
  ht_ok_mtr: number;
  ht_ok_mt: number;
  already_inspected_pcs: number;
  available_ht_ok_pcs: number;
  available_ht_ok_mtr: number;
  available_ht_ok_mt: number;
  is_master?: boolean;
  is_child?: boolean;
  master_wo_id?: string;
  master_wo_no?: string;
  master_plan_no?: string;
  child_work_orders?: any[];
}

export interface HeatLotInfo {
  lot_no: string;
  pcs?: number;
  mtr?: number;
}

export interface QcSalvageQueueItem {
  work_order_id: string;
  work_order_no: string;
  customer_name: string | null;
  specification: string | null;
  size_od: number;
  size_wt: number;
  avg_length: number;
  process_route_id?: string | null;
  total_salvage_pcs: number;
  total_salvage_mtr: number;
  total_salvage_mt: number;
  salvage_reasons: SalvageReasonItem[];
  inspections: QcInspection[];
}

export type BandSawCutCategory = 'PRIME' | 'SECONDARY' | 'OFFCUT' | 'SCRAP_TRIM' | 'SCRAP_NOT_REQUIRED';

export interface BandSawCutItem {
  id: string;
  length_mtr: number;
  cut_pcs: number;
  cut_category: BandSawCutCategory;
  total_mtr: number;
  total_mt?: number;
  remarks?: string;
}

export interface BandSawQueueItem {
  work_order_id: string;
  work_order_no: string;
  customer_name: string | null;
  specification: string | null;
  size_od: number;
  size_wt: number;
  l1?: number | null;
  l2?: number | null;
  avg_length: number;
  mh_od?: number | null;
  mh_wt?: number | null;
  mh_l1?: number | null;
  mh_l2?: number | null;
  mh_avg_length?: number | null;
  route_id: string;
  route_code: string;
  route_name?: string;
  feeder_source_label?: string;
  feeder_stage_code?: string;
  heat_lot_no?: string | null;
  heat_lots?: HeatLotInfo[];
  available_mother_pcs: number;
  available_mother_mtr: number;
  available_mother_mt: number;
  plan_no?: string;
  is_master?: boolean;
}

export type RejectionReasonCategory =
  | 'SMALL_QTY_NO_REPROCESS'
  | 'SURFACE_DEFECT'
  | 'WALL_THICKNESS_OFF'
  | 'CRACK'
  | 'BEND'
  | 'DIMENSIONAL_OFF_SPEC'
  | 'OTHER';

export type RejectionStatus =
  | 'PENDING_QC'
  | 'PENDING_PPC'
  | 'APPROVED'
  | 'REJECTED_BY_QC'
  | 'REJECTED_BY_PPC';

export interface RejectionDeclaration {
  id: string;
  declaration_no: string;
  work_order_id: string;
  process_route_id?: string | null;
  stage_id?: string | null;
  work_center: StageCode | string;
  rejected_pcs: number;
  rejected_mtr: number;
  rejected_mt: number;
  heat_lot_no?: string | null;
  reason_category: RejectionReasonCategory;
  production_remarks: string;
  declared_by: string;
  declared_by_user_id?: string | null;
  declared_at: string;
  status: RejectionStatus;
  qc_verified_pcs?: number | null;
  qc_verified_mtr?: number | null;
  qc_verified_mt?: number | null;
  qc_remarks?: string | null;
  qc_verified_by?: string | null;
  qc_verified_by_user_id?: string | null;
  qc_verified_at?: string | null;
  ppc_approved_pcs?: number | null;
  ppc_approved_mtr?: number | null;
  ppc_approved_mt?: number | null;
  ppc_remarks?: string | null;
  ppc_approved_by?: string | null;
  ppc_approved_by_user_id?: string | null;
  ppc_approved_at?: string | null;
  created_at: string;
  updated_at?: string;

  // Joined work order fields
  work_orders?: {
    id: string;
    work_order_no: string;
    customer_name?: string | null;
    grade?: string | null;
    size_od?: number | null;
    size_wt?: number | null;
    avg_length?: number | null;
  };
}
