'use client';

import DataReport from '@/components/reports/DataReport';
import RouteAccessGuard from '@/components/common/RouteAccessGuard';

const columns = [
  ['plan_no', 'Plan No.'],
  ['work_order_id', 'WO ID'],
  ['planned_rolling_date', 'Rolling Date'],
  ['planned_qty', 'Planned Qty'],
  ['process_route_id', 'Route ID'],
  ['target_mother_size', 'Target Mother Size'],
  ['status', 'Status'],
].map(([key, label]) => ({ key, label }));

export default function Page() {
  return (
    <RouteAccessGuard allowedGroups={['admin', 'super_user']} formTitle="Rolling Plans Report">
      <DataReport
        title="Rolling Plans"
        view="rolling_plans"
        columns={columns}
        searchKeys={['plan_no', 'work_order_id', 'process_route_id', 'status']}
      />
    </RouteAccessGuard>
  );
}
