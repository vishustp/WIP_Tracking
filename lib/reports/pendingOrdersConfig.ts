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
  ['ordered_qty', 'Ordered Qty'],
  ['uom', 'UOM'],
  ['planned_qty', 'Planned Qty'],
  ['produced_qty', 'Produced Qty'],
  ['route', 'Route'],
  ['total_pending', 'Balance Pending'],
  ['target_date', 'Target Date'],
  ['status', 'Status'],
].map(([key, label]) => ({ key, label }));
