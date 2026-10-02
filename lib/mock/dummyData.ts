// lib/mock/dummyData.ts
// Local Dummy Database for offline / local-server testing and development.

export interface MockStore {
  workOrders: any[];
  processStages: any[];
  processRoutes: any[];
  rollingPlans: any[];
  productionLogs: any[];
  qcInspections: any[];
  diversionPlans: any[];
}

export const INITIAL_MOCK_STAGES = [
  { id: 'stg-rolling', stage_code: 'ROLLING', stage_name: 'Rolling Mill', sequence_no: 1 },
  { id: 'stg-hollow-ht', stage_code: 'HOLLOW_HEAT_TREATMENT', stage_name: 'Hollow Heat Treatment', sequence_no: 2 },
  { id: 'stg-draw', stage_code: 'DRAW', stage_name: 'Cold Draw Bench', sequence_no: 3 },
  { id: 'stg-ht', stage_code: 'HEAT_TREATMENT', stage_name: 'Heat Treatment', sequence_no: 4 },
  { id: 'stg-bandsaw', stage_code: 'BAND_SAW', stage_name: 'Band Saw Cutting', sequence_no: 5 },
  { id: 'stg-vdi', stage_code: 'VDI', stage_name: 'QC & VDI Inspection', sequence_no: 6 },
  { id: 'stg-finishing', stage_code: 'FINISHING', stage_name: 'Finishing Line', sequence_no: 7 },
];

export const INITIAL_MOCK_ROUTES = [
  { id: 'rt-cds', route_code: 'CDS', route_name: 'Cold Drawn Seamless' },
  { id: 'rt-alloy-cds', route_code: 'ALLOY_CDS', route_name: 'Alloy Cold Drawn Seamless' },
  { id: 'rt-hfs', route_code: 'HFS', route_name: 'Hot Finished Seamless' },
  { id: 'rt-alloy-hfs', route_code: 'ALLOY_HFS', route_name: 'Alloy Hot Finished Seamless' },
];

export const INITIAL_MOCK_WORK_ORDERS = [
  {
    id: 'wo-101',
    work_order_no: 'WO-2026-101',
    customer_name: 'Apex Energy Systems',
    grade: 'ASTM A106 Gr.B',
    specification: 'ASTM A106 Gr.B',
    size_od: 48.3,
    size_wt: 3.68,
    l1: 6.0,
    l2: 6.5,
    ordered_qty_mtr: 1200,
    ordered_qty_pcs: 200,
    ordered_qty_mt: 4.86,
    balance_qty_mtr: 1200,
    balance_qty_pcs: 200,
    balance_qty_mt: 4.86,
    process_route_id: 'rt-cds',
    status: 'In Progress',
  },
  {
    id: 'wo-102',
    work_order_no: 'WO-2026-102',
    customer_name: 'Bharat Heavy Engineering',
    grade: 'ASTM A335 P11',
    specification: 'ASTM A335 P11',
    size_od: 60.3,
    size_wt: 4.5,
    l1: 5.8,
    l2: 6.2,
    ordered_qty_mtr: 900,
    ordered_qty_pcs: 150,
    ordered_qty_mt: 5.57,
    balance_qty_mtr: 900,
    balance_qty_pcs: 150,
    balance_qty_mt: 5.57,
    process_route_id: 'rt-alloy-cds',
    status: 'In Progress',
  },
  {
    id: 'wo-103',
    work_order_no: 'WO-2026-103',
    customer_name: 'Gujarat Petrochem Corp',
    grade: 'ASTM A106 Gr.B',
    specification: 'ASTM A106 Gr.B',
    size_od: 88.9,
    size_wt: 5.49,
    l1: 6.1,
    l2: 6.5,
    ordered_qty_mtr: 800,
    ordered_qty_pcs: 127,
    ordered_qty_mt: 9.02,
    balance_qty_mtr: 800,
    balance_qty_pcs: 127,
    balance_qty_mt: 9.02,
    process_route_id: 'rt-cds',
    status: 'In Progress',
  },
  {
    id: 'wo-104',
    work_order_no: 'WO-2026-104',
    customer_name: 'Larsen & Toubro Ltd',
    grade: 'ASTM A312 TP304L',
    specification: 'ASTM A312 TP304L',
    size_od: 42.4,
    size_wt: 3.2,
    l1: 6.0,
    l2: 6.0,
    ordered_qty_mtr: 600,
    ordered_qty_pcs: 100,
    ordered_qty_mt: 1.88,
    balance_qty_mtr: 600,
    balance_qty_pcs: 100,
    balance_qty_mt: 1.88,
    process_route_id: 'rt-cds',
    status: 'In Progress',
  },
];

export const INITIAL_MOCK_ROLLING_PLANS = [
  {
    id: 'plan-101',
    plan_no: 'RP-2026-001',
    work_order_id: 'wo-101',
    process_route_id: 'rt-cds',
    planned_qty: 1250,
    planned_rolling_date: '2026-09-15',
    status: JSON.stringify({ is_issued: true, master_planned_mtr: 1250, master_planned_pcs: 200 }),
    mh_od: 60.3,
    mh_wt: 4.5,
    mh_l1: 4.5,
    mh_l2: 5.0,
    multiple: 2,
    created_at: '2026-09-15T08:00:00Z',
  },
  {
    id: 'plan-102',
    plan_no: 'RP-2026-002',
    work_order_id: 'wo-102',
    process_route_id: 'rt-alloy-cds',
    planned_qty: 950,
    planned_rolling_date: '2026-09-16',
    status: JSON.stringify({ is_issued: true, master_planned_mtr: 950, master_planned_pcs: 155 }),
    mh_od: 73.0,
    mh_wt: 5.5,
    mh_l1: 4.5,
    mh_l2: 4.8,
    multiple: 2,
    created_at: '2026-09-16T08:00:00Z',
  },
  {
    id: 'plan-103',
    plan_no: 'RP-2026-003',
    work_order_id: 'wo-103',
    process_route_id: 'rt-cds',
    planned_qty: 850,
    planned_rolling_date: '2026-09-18',
    status: JSON.stringify({ is_issued: true, master_planned_mtr: 850, master_planned_pcs: 135 }),
    mh_od: 108.0,
    mh_wt: 7.0,
    mh_l1: 4.6,
    mh_l2: 5.0,
    multiple: 2,
    created_at: '2026-09-18T08:00:00Z',
  },
];

// Production logs showing complete chain from Rolling -> HT -> Band Saw -> VDI
// Every HT entry has an explicit heat_lot_no!
export const INITIAL_MOCK_PRODUCTION_LOGS = [
  // WO-101: Rolling -> Draw -> Heat Treatment (HT Lot: HT-2026-A101) -> Ready for Band Saw!
  {
    id: 'log-101-roll',
    work_order_id: 'wo-101',
    stage_id: 'stg-rolling',
    process_route_id: 'rt-cds',
    process_date: '2026-09-20',
    input_qty: 1240,
    output_qty: 1240,
    rejection_qty: 20,
    htc_ok: 1220,
    heat_lot_no: 'R-8841',
    remarks: 'Mother Pipes Rolled [PCS:200] [REJ_PCS:3] [HTC_PCS:197]',
    created_at: '2026-09-20T10:00:00Z',
  },
  {
    id: 'log-101-draw',
    work_order_id: 'wo-101',
    stage_id: 'stg-draw',
    process_route_id: 'rt-cds',
    process_date: '2026-09-21',
    input_qty: 1220,
    output_qty: 1220,
    rejection_qty: 0,
    htc_ok: 0,
    heat_lot_no: null,
    remarks: 'Drawn to 48.3 x 3.68 [PCS:197]',
    created_at: '2026-09-21T11:00:00Z',
  },
  {
    id: 'log-101-ht',
    work_order_id: 'wo-101',
    stage_id: 'stg-ht',
    process_route_id: 'rt-cds',
    process_date: '2026-09-22',
    input_qty: 1220,
    output_qty: 1220,
    rejection_qty: 0,
    htc_ok: 0,
    heat_lot_no: 'HT-2026-A101', // HT Lot Number!
    remarks: 'Normalizing Furnace 910°C [PCS:197] Shift A',
    created_at: '2026-09-22T14:30:00Z',
  },

  // WO-102: Rolling -> Hollow HT (HT Lot: HHT-9942) -> Draw -> Heat Treatment (HT Lot: HT-2026-P11) -> Band Saw (Inherited HT Lot) -> Ready for VDI!
  {
    id: 'log-102-roll',
    work_order_id: 'wo-102',
    stage_id: 'stg-rolling',
    process_route_id: 'rt-alloy-cds',
    process_date: '2026-09-21',
    input_qty: 940,
    output_qty: 940,
    rejection_qty: 10,
    htc_ok: 930,
    heat_lot_no: 'R-8855',
    remarks: 'Alloy Mother Hollows [PCS:155] [HTC_PCS:153]',
    created_at: '2026-09-21T10:00:00Z',
  },
  {
    id: 'log-102-hht',
    work_order_id: 'wo-102',
    stage_id: 'stg-hollow-ht',
    process_route_id: 'rt-alloy-cds',
    process_date: '2026-09-22',
    input_qty: 930,
    output_qty: 930,
    rejection_qty: 0,
    htc_ok: 0,
    heat_lot_no: 'HHT-9942', // Hollow HT Lot Number!
    remarks: 'Pre-draw Annealing [PCS:153]',
    created_at: '2026-09-22T11:00:00Z',
  },
  {
    id: 'log-102-draw',
    work_order_id: 'wo-102',
    stage_id: 'stg-draw',
    process_route_id: 'rt-alloy-cds',
    process_date: '2026-09-23',
    input_qty: 930,
    output_qty: 930,
    rejection_qty: 0,
    htc_ok: 0,
    heat_lot_no: null,
    remarks: 'Drawn to 60.3 x 4.5 [PCS:153]',
    created_at: '2026-09-23T12:00:00Z',
  },
  {
    id: 'log-102-ht',
    work_order_id: 'wo-102',
    stage_id: 'stg-ht',
    process_route_id: 'rt-alloy-cds',
    process_date: '2026-09-24',
    input_qty: 930,
    output_qty: 930,
    rejection_qty: 0,
    htc_ok: 0,
    heat_lot_no: 'HT-2026-P11', // Final HT Lot Number!
    remarks: 'Alloy Normalizing & Tempering [PCS:153]',
    created_at: '2026-09-24T15:00:00Z',
  },
  {
    id: 'log-102-bandsaw',
    work_order_id: 'wo-102',
    stage_id: 'stg-bandsaw',
    process_route_id: 'rt-alloy-cds',
    process_date: '2026-09-25',
    input_qty: 900,
    output_qty: 900,
    rejection_qty: 12,
    htc_ok: 0,
    heat_lot_no: 'HT-2026-P11', // Preserved from HT!
    remarks: 'Band Saw Cuts: [CUT:150x6.0m:PRIME] [PCS:150] [REJ_PCS:2] Offcut: 12m',
    created_at: '2026-09-25T16:00:00Z',
  },

  // WO-103: Rolling -> Draw -> Heat Treatment (HT Lot: 25D01974) -> Ready for Band Saw!
  {
    id: 'log-103-roll',
    work_order_id: 'wo-103',
    stage_id: 'stg-rolling',
    process_route_id: 'rt-cds',
    process_date: '2026-09-24',
    input_qty: 820,
    output_qty: 820,
    rejection_qty: 0,
    htc_ok: 820,
    heat_lot_no: 'R-8860',
    remarks: 'Rolled [PCS:130] [HTC_PCS:130]',
    created_at: '2026-09-24T10:00:00Z',
  },
  {
    id: 'log-103-draw',
    work_order_id: 'wo-103',
    stage_id: 'stg-draw',
    process_route_id: 'rt-cds',
    process_date: '2026-09-25',
    input_qty: 820,
    output_qty: 820,
    rejection_qty: 0,
    htc_ok: 0,
    heat_lot_no: null,
    remarks: 'Cold Drawn [PCS:130]',
    created_at: '2026-09-25T11:00:00Z',
  },
  {
    id: 'log-103-ht-1',
    work_order_id: 'wo-103',
    stage_id: 'stg-ht',
    process_route_id: 'rt-cds',
    process_date: '2026-09-26',
    input_qty: 450,
    output_qty: 450,
    rejection_qty: 0,
    htc_ok: 0,
    heat_lot_no: '25D01974', // Batch 1
    remarks: 'Annealing Batch 1 [PCS:70]',
    created_at: '2026-09-26T10:00:00Z',
  },
  {
    id: 'log-103-ht-2',
    work_order_id: 'wo-103',
    stage_id: 'stg-ht',
    process_route_id: 'rt-cds',
    process_date: '2026-09-26',
    input_qty: 370,
    output_qty: 370,
    rejection_qty: 0,
    htc_ok: 0,
    heat_lot_no: '25D01980', // Batch 2
    remarks: 'Annealing Batch 2 [PCS:60]',
    created_at: '2026-09-26T14:00:00Z',
  },
];

// Initial QC Inspections (with heat_lot_no)
export const INITIAL_MOCK_QC_INSPECTIONS = [
  {
    id: 'qc-102-1',
    work_order_id: 'wo-102',
    process_route_id: 'rt-alloy-cds',
    inspection_date: '2026-09-26',
    inspected_pcs: 75,
    inspected_mtr: 450,
    inspected_mt: 2.78,
    vdi_ok_pcs: 70,
    vdi_ok_mtr: 420,
    vdi_ok_mt: 2.6,
    vdi_salvage_pcs: 3,
    vdi_salvage_mtr: 18,
    vdi_salvage_mt: 0.11,
    vdi_rejection_pcs: 2,
    vdi_rejection_mtr: 12,
    vdi_rejection_mt: 0.07,
    salvage_reasons: [{ id: 'sal-1', reason: 'OD / WT Dimensional Variation', pcs: 3 }],
    heat_lot_no: 'HT-2026-P11', // HT Lot Number attached to VDI!
    remarks: 'Batch 1 visual & ultrasonic inspection passed. Lot: HT-2026-P11',
    created_by: 'QC Inspector',
    created_at: '2026-09-26T16:30:00Z',
  },
];

export function isMockDbEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_USE_MOCK_DB === 'true') return true;
  if (typeof window !== 'undefined') {
    return localStorage.getItem('seamless_use_mock_db') === 'true';
  }
  return false;
}
