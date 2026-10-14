// lib/rejections/types.ts
import { RejectionReasonCategory, RejectionStatus, StageCode, RejectionDeclaration } from '@/types';

export type { RejectionDeclaration, RejectionReasonCategory, RejectionStatus };

export const REJECTION_REASON_CATEGORIES: RejectionReasonCategory[] = [
  'SMALL_QTY_NO_REPROCESS',
  'SURFACE_DEFECT',
  'WALL_THICKNESS_OFF',
  'CRACK',
  'BEND',
  'DIMENSIONAL_OFF_SPEC',
  'OTHER',
];

export const REJECTION_REASON_LABELS: Record<RejectionReasonCategory, string> = {
  SMALL_QTY_NO_REPROCESS: 'Small Quantity (Cannot Reprocess / Short Remnant)',
  SURFACE_DEFECT: 'Surface Defect / Heavy Scratches / Pitting',
  WALL_THICKNESS_OFF: 'Wall Thickness Out of Tolerance (Thin/Heavy)',
  CRACK: 'Crack / Seam / Metallurgical Fracture',
  BEND: 'Severe Bending / Ovality Distortion',
  DIMENSIONAL_OFF_SPEC: 'OD / Dimensional Size Off-Spec',
  OTHER: 'Other Operational Defect / Unspecified',
};

export const REJECTION_STATUS_LABELS: Record<RejectionStatus, string> = {
  PENDING_QC: 'Pending QC Verification',
  PENDING_PPC: 'Pending PPC Approval',
  APPROVED: 'Approved (WIP Deducted)',
  REJECTED_BY_QC: 'Rejected by QC',
  REJECTED_BY_PPC: 'Rejected by PPC',
};

export const REJECTION_STATUS_BADGES: Record<RejectionStatus, { label: string; className: string }> = {
  PENDING_QC: {
    label: 'Pending QC',
    className: 'bg-amber-50 text-amber-800 border-amber-300 ring-1 ring-amber-200',
  },
  PENDING_PPC: {
    label: 'Pending PPC',
    className: 'bg-blue-50 text-blue-800 border-blue-300 ring-1 ring-blue-200',
  },
  APPROVED: {
    label: 'Approved & Deducted',
    className: 'bg-emerald-50 text-emerald-800 border-emerald-300 ring-1 ring-emerald-200',
  },
  REJECTED_BY_QC: {
    label: 'Rejected by QC',
    className: 'bg-rose-50 text-rose-800 border-rose-300 ring-1 ring-rose-200',
  },
  REJECTED_BY_PPC: {
    label: 'Rejected by PPC',
    className: 'bg-rose-50 text-rose-800 border-rose-300 ring-1 ring-rose-200',
  },
};

export const WORK_CENTER_OPTIONS: { code: string; label: string }[] = [
  { code: 'ALL', label: 'All Work Centers' },
  { code: 'ROLLING', label: 'Hot Rolling Mill' },
  { code: 'HOLLOW_HEAT_TREATMENT', label: 'Hollow HT' },
  { code: 'DRAW', label: 'Cold Draw Bench' },
  { code: 'PILGER', label: 'Pilger Mill' },
  { code: 'HEAT_TREATMENT', label: 'Final Heat Treatment' },
  { code: 'BAND_SAW', label: 'Band Saw Cutting' },
  { code: 'VDI', label: 'VDI Inspection' },
  { code: 'FINISHING', label: 'Finishing Line' },
];

/**
 * Standard Seamless Pipe Weight Factor:
 * MT = (OD - WT) * WT * 0.0246615 * 0.001 * Meters
 */
export function calculateRejectionMetrics(
  pcs: number,
  avgLength: number,
  od: number,
  wt: number
): { mtr: number; mt: number } {
  const safePcs = Math.max(0, Number(pcs) || 0);
  const safeLen = Math.max(0, Number(avgLength) || 0);
  const mtr = Number((safePcs * safeLen).toFixed(2));
  
  if (od > 0 && wt > 0 && mtr > 0) {
    const factor = (od - wt) * wt * 0.0246615 * 0.001;
    const mt = Number((mtr * factor).toFixed(3));
    return { mtr, mt };
  }
  return { mtr, mt: 0 };
}

/**
 * Role permissions checks
 */
export function canDeclareRejection(roleOrTitle?: string | null): boolean {
  if (!roleOrTitle) return true;
  const lower = roleOrTitle.toLowerCase();
  return (
    lower.includes('admin') ||
    lower.includes('manager') ||
    lower.includes('ppc') ||
    lower.includes('rolling') ||
    lower.includes('draw') ||
    lower.includes('production') ||
    lower.includes('operator') ||
    lower.includes('incharge') ||
    lower.includes('finishing') ||
    lower.includes('saw') ||
    lower.includes('qa') ||
    lower.includes('inspector') ||
    lower.includes('user')
  );
}

export function canVerifyRejection(roleOrTitle?: string | null): boolean {
  if (!roleOrTitle) return false;
  const lower = roleOrTitle.toLowerCase();
  return (
    lower.includes('admin') ||
    lower.includes('qa') ||
    lower.includes('qc') ||
    lower.includes('inspector') ||
    lower.includes('quality')
  );
}

export function canApproveRejection(roleOrTitle?: string | null): boolean {
  if (!roleOrTitle) return false;
  const lower = roleOrTitle.toLowerCase();
  return (
    lower.includes('admin') ||
    lower.includes('manager') ||
    lower.includes('ppc') ||
    lower.includes('super_user')
  );
}

export interface RejectionFilterOptions {
  search?: string;
  status?: string;
  workCenter?: string;
  reasonCategory?: string;
  fromDate?: string;
  toDate?: string;
}

export interface RejectionSummaryKpis {
  pendingQcCount: number;
  pendingPpcCount: number;
  approvedCount: number;
  approvedTotalMt: number;
  approvedTotalPcs: number;
  totalPendingHoldMtr: number;
}

/**
 * Formats rejection declarations into clean, typed key-value pairs for Excel and CSV export.
 */
export function formatRejectionsForExport(records: RejectionDeclaration[]): Record<string, any>[] {
  return records.map((r) => ({
    'Declaration No': r.declaration_no || '',
    'Date': r.declared_at ? r.declared_at.slice(0, 10) : '',
    'Work Order #': r.work_orders?.work_order_no || '',
    'Customer': r.work_orders?.customer_name || '',
    'Grade': r.work_orders?.grade || '',
    'Size (ODxWT mm)': r.work_orders?.size_od && r.work_orders?.size_wt ? `${r.work_orders.size_od} x ${r.work_orders.size_wt}` : '',
    'Work Center': r.work_center || '',
    'Declared PCS': r.rejected_pcs ?? 0,
    'Declared MTR': r.rejected_mtr ?? 0,
    'Declared MT': r.rejected_mt ?? 0,
    'Heat / Lot #': r.heat_lot_no || '',
    'Reason Category': REJECTION_REASON_LABELS[r.reason_category] || r.reason_category || '',
    'Production Remarks': r.production_remarks || '',
    'Declared By': r.declared_by || '',
    'Status': REJECTION_STATUS_LABELS[r.status] || r.status || '',
    'QC Verified PCS': r.qc_verified_pcs ?? '',
    'QC Verified MTR': r.qc_verified_mtr ?? '',
    'QC Verified MT': r.qc_verified_mt ?? '',
    'QC Remarks': r.qc_remarks || '',
    'QC Verified By': r.qc_verified_by || '',
    'QC Date': r.qc_verified_at ? r.qc_verified_at.slice(0, 10) : '',
    'PPC Approved PCS': r.ppc_approved_pcs ?? '',
    'PPC Approved MTR': r.ppc_approved_mtr ?? '',
    'PPC Approved MT': r.ppc_approved_mt ?? '',
    'PPC Remarks': r.ppc_remarks || '',
    'PPC Approved By': r.ppc_approved_by || '',
    'PPC Date': r.ppc_approved_at ? r.ppc_approved_at.slice(0, 10) : '',
  }));
}

/**
 * Clean CSV Exporter for Salvage & Rejection Material Report
 */
export function generateRejectionReportCsv(records: RejectionDeclaration[]): string {
  if (records.length === 0) return '';
  const rows = formatRejectionsForExport(records);
  const headers = Object.keys(rows[0]);

  const escapeCsv = (val: any) => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const csvRows = rows.map((r) => headers.map((h) => escapeCsv(r[h])).join(','));
  return [headers.join(','), ...csvRows].join('\r\n');
}
