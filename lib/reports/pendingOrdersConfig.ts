export interface ColumnDef {
  key: string;
  label: string;
}

export const pendingOrderColumns: ColumnDef[] = [
  ['work_order_no', 'WO No.'],
  ['customer', 'Customer'],
  ['od', 'OD'],
  ['wt', 'WT'],
  ['grade', 'Grade'],
  ['ordered_qty', 'Ordered Qty (m)'],
  ['uom', 'UOM'],
  ['planned_qty', 'Planned Qty (m)'],
  ['produced_qty', 'Produced Qty (m)'],
  ['route', 'Route'],
  ['total_pending', 'Balance Pending (m)'],
  ['target_date', 'Target Date'],
  ['status', 'Status'],
].map(([key, label]) => ({ key, label }));
