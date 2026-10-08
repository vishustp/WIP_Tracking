// lib/mill-rejections/types.ts

export type MillRejectionCategory =
  | 'ALL'
  | 'ROLLING'
  | 'DRAW'
  | 'HEAT_TREATMENT'
  | 'VDI_SALVAGE'
  | 'VDI_REJECTION'
  | 'BAND_SAW'
  | 'FINISHING'
  | 'OTHER';

export type DefectDispositionType = 'REJECTION' | 'SALVAGE';

export interface MillRejectionEntry {
  id: string;
  source: 'PRODUCTION_LOG' | 'QC_INSPECTION';
  date: string; // YYYY-MM-DD
  category: MillRejectionCategory;
  workCenterName: string;
  stageCode?: string;
  dispositionType: DefectDispositionType;

  // Work Order Details
  workOrderId: string;
  workOrderNo: string;
  customerName: string;
  grade: string;
  sizeOd: number;
  sizeWt: number;
  avgLength: number;
  heatLotNo?: string;

  // Quantities
  pcs: number;
  mtr: number;
  mt: number;

  // Audit
  remarks: string;
  loggedBy?: string;
  createdAt: string;
}

export interface MillRejectionSummaryKpis {
  totalRollingPcs: number;
  totalRollingMt: number;
  totalDrawPcs: number;
  totalDrawMt: number;
  totalHtPcs: number;
  totalHtMt: number;
  totalVdiSalvagePcs: number;
  totalVdiSalvageMt: number;
  totalVdiRejPcs: number;
  totalVdiRejMt: number;
  grandTotalPcs: number;
  grandTotalMtr: number;
  grandTotalMt: number;
}

export interface MillRejectionFilterOptions {
  category?: MillRejectionCategory;
  dispositionType?: DefectDispositionType | 'ALL';
  search?: string;
  fromDate?: string;
  toDate?: string;
}

export const CATEGORY_LABELS: Record<string, string> = {
  ALL: 'All Stations',
  ROLLING: 'Rolling Rejection',
  DRAW: 'Draw Bench Rejection',
  HEAT_TREATMENT: 'Heat Treatment Rejection',
  VDI_SALVAGE: 'VDI Salvage',
  VDI_REJECTION: 'VDI Rejection',
  BAND_SAW: 'Band Saw Rejection',
  FINISHING: 'Finishing Line Rejection',
  OTHER: 'Other Stages',
};

export const CATEGORY_COLORS: Record<string, string> = {
  ROLLING: 'bg-orange-100 text-orange-800 border-orange-200',
  DRAW: 'bg-blue-100 text-blue-800 border-blue-200',
  HEAT_TREATMENT: 'bg-rose-100 text-rose-800 border-rose-200',
  VDI_SALVAGE: 'bg-amber-100 text-amber-800 border-amber-200',
  VDI_REJECTION: 'bg-red-100 text-red-800 border-red-200',
  BAND_SAW: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  FINISHING: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  OTHER: 'bg-slate-100 text-slate-800 border-slate-200',
};

/**
 * Generates RFC 4180 compliant CSV for Mill Rejection and Salvage Report
 */
export function generateMillRejectionCsv(entries: MillRejectionEntry[]): string {
  const headers = [
    'Date',
    'Work Order',
    'Customer',
    'Grade',
    'OD (mm)',
    'WT (mm)',
    'Avg Length (m)',
    'Work Center',
    'Category',
    'Type',
    'Heat / Lot No',
    'Pieces (Nos)',
    'Meters (m)',
    'Weight (MT)',
    'Logged Remarks & Reason',
    'Logged By',
    'Created At',
  ];

  const rows = entries.map((e) => [
    e.date,
    e.workOrderNo,
    e.customerName || '—',
    e.grade || '—',
    e.sizeOd ? e.sizeOd.toFixed(2) : '—',
    e.sizeWt ? e.sizeWt.toFixed(2) : '—',
    e.avgLength ? e.avgLength.toFixed(2) : '—',
    e.workCenterName,
    CATEGORY_LABELS[e.category] || e.category,
    e.dispositionType,
    e.heatLotNo || '—',
    e.pcs,
    e.mtr.toFixed(2),
    e.mt.toFixed(3),
    e.remarks ? `"${e.remarks.replace(/"/g, '""')}"` : '""',
    e.loggedBy || '—',
    e.createdAt,
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
}
