/**
 * Excel Work Order Import Logic & Rules
 *
 * Rule 1: Balance to make (balance_qty_pcs, balance_qty_mtr, balance_qty_mt)
 * is NOT updated for existing work orders in the database. Mill shop-floor
 * balance and WIP ledgers remain authoritative.
 *
 * Rule 2: If an existing work order in the database has balance_to_make < 5 meters
 * or is marked as completed/closed/done in Excel, its status is updated to 'Completed'.
 */

export interface WorkOrderImportRow {
  work_order_no: string;
  customer_name?: string;
  specification?: string;
  od?: number | null;
  wl?: number | null;
  l1?: number | null;
  l2?: number | null;
  ordered_qty_pcs?: number;
  ordered_qty_mtr?: number;
  ordered_qty_mt?: number;
  balance_qty_pcs?: number;
  balance_qty_mtr?: number;
  balance_qty_mt?: number;
  balance_to_make_mtr?: number;
  current_status?: string;
  po_no?: string | null;
  po_date?: string | null;
  material_code?: string | null;
  destination?: string | null;
  target_date?: string;
}

const COMPLETED_STATUSES = new Set(['completed', 'closed', 'done', 'dispatched']);
const VALID_WORK_ORDER_STATUSES = new Set([
  'pending',
  'in progress',
  'open',
  'scheduled',
  'planned',
  'completed',
  'closed',
  'done',
  'dispatched',
  '',
]);

/**
 * Checks whether an incoming row should be treated as Completed.
 * Matches if balance_to_make < 5 meters or status string indicates completed.
 */
export function isOrderCompletedForImport(row: {
  balance_to_make_mtr?: number | null;
  balance_qty_mtr?: number | null;
  current_status?: string | null;
}): boolean {
  const normStatus = String(row.current_status || '').toLowerCase().trim();
  if (COMPLETED_STATUSES.has(normStatus)) {
    return true;
  }

  const bMake = row.balance_to_make_mtr;
  if (bMake !== undefined && bMake !== null && Number(bMake) < 5 && Number(bMake) >= 0) {
    return true;
  }

  const bQty = row.balance_qty_mtr;
  if (bQty !== undefined && bQty !== null && Number(bQty) < 5 && Number(bQty) >= 0) {
    return true;
  }

  return false;
}

/**
 * Builds the update payload for an existing work order.
 * EXCLUDES all balance fields (Rule 1).
 * Sets status = 'Completed' if Rule 2 criteria are met.
 */
export function buildWorkOrderUpdatePayload(
  row: WorkOrderImportRow,
  opts: { existsInDb: boolean; currentDbStatus?: string }
): Record<string, any> {
  const updateObj: Record<string, any> = {};

  if (row.l1 !== undefined) updateObj.l1 = row.l1;
  if (row.l2 !== undefined) updateObj.l2 = row.l2;
  if (row.ordered_qty_pcs !== undefined) updateObj.ordered_qty_pcs = row.ordered_qty_pcs;
  if (row.ordered_qty_mtr !== undefined) updateObj.ordered_qty_mtr = row.ordered_qty_mtr;
  if (row.ordered_qty_mt !== undefined) updateObj.ordered_qty_mt = row.ordered_qty_mt;

  // RULE 1: DO NOT include balance_qty_pcs, balance_qty_mtr, balance_qty_mt or balance_to_make_mtr!

  if (row.po_no) updateObj.po_no = row.po_no;
  if (row.po_date) updateObj.po_date = row.po_date;
  if (row.material_code) updateObj.material_code = row.material_code;
  if (row.destination) updateObj.destination = row.destination;

  // RULE 2: If balance < 5 mtr or status completed in Excel, mark status as 'Completed'
  const isCompleted = isOrderCompletedForImport(row);
  const wasAlreadyCompleted = String(opts.currentDbStatus || '').toLowerCase().trim() === 'completed';

  if (isCompleted || wasAlreadyCompleted) {
    updateObj.status = 'Completed';
  }

  return updateObj;
}

/**
 * Builds the initial insert payload for a brand new work order.
 * Includes initial balance quantities and appropriate status.
 */
export function buildWorkOrderInsertPayload(row: WorkOrderImportRow): Record<string, any> {
  const isCompleted = isOrderCompletedForImport(row);

  return {
    work_order_no: row.work_order_no,
    customer_name: row.customer_name || null,
    specification: row.specification || null,
    size_od: row.od,
    size_wt: row.wl,
    l1: row.l1,
    l2: row.l2,
    ordered_qty_pcs: row.ordered_qty_pcs || 0,
    ordered_qty_mtr: row.ordered_qty_mtr || 0,
    ordered_qty_mt: row.ordered_qty_mt || 0,
    balance_qty_pcs: row.balance_qty_pcs || row.ordered_qty_pcs || 0,
    balance_qty_mtr: row.balance_qty_mtr || row.balance_to_make_mtr || row.ordered_qty_mtr || 0,
    balance_qty_mt: row.balance_qty_mt || row.ordered_qty_mt || 0,
    status: isCompleted ? 'Completed' : 'Pending Plan',
    po_no: row.po_no || null,
    po_date: row.po_date || null,
    material_code: row.material_code || null,
    destination: row.destination || null,
  };
}

/**
 * Validates a parsed row for Work Orders import.
 */
export function validateWorkOrderImportRow(
  row: WorkOrderImportRow,
  opts: { existsInDb: boolean }
): string[] {
  const errors: string[] = [];

  if (!row.work_order_no) errors.push('Work Order No missing');
  if (row.od === null || row.od === undefined || row.od <= 0) errors.push('OD missing or invalid');
  if (row.wl === null || row.wl === undefined || row.wl <= 0) errors.push('WT/WL missing or invalid');
  if (row.od && row.wl && row.od <= row.wl) errors.push('OD must be greater than WT');

  const orderedPcs = Number(row.ordered_qty_pcs || 0);
  const orderedMtr = Number(row.ordered_qty_mtr || 0);
  const orderedMt = Number(row.ordered_qty_mt || 0);
  const balToMake = Number(row.balance_to_make_mtr || 0);

  if (orderedPcs <= 0 && orderedMtr <= 0 && orderedMt <= 0 && balToMake <= 0) {
    errors.push('Order Qty missing');
  }

  const normStatus = String(row.current_status || '').toLowerCase().trim();
  if (row.current_status && !VALID_WORK_ORDER_STATUSES.has(normStatus)) {
    errors.push(`Status "${row.current_status}" is not eligible`);
  }

  // Only reject for bal <= 5 if the order does NOT already exist in DB and ordered qty <= 5
  if (!opts.existsInDb && balToMake <= 5 && orderedMtr <= 5) {
    errors.push(`Bal to Make MTR (${balToMake}) ≤ 5`);
  }

  return errors;
}
