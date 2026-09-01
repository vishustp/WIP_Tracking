'use client';

import DataReport from '@/components/reports/DataReport';
import RouteAccessGuard from '@/components/common/RouteAccessGuard';

const columns = [
  ['diversion_date', 'Diversion Date'],
  ['source_wo_no', 'Source WO #'],
  ['source_customer', 'Source Customer'],
  ['target_wo_no', 'Target WO #'],
  ['target_customer', 'Target Customer'],
  ['work_center_name', 'Work Center'],
  ['diverted_qty', 'Diverted Qty (Mtrs)'],
  ['multiple', 'Multiple'],
  ['route_code', 'Process Route'],
  ['reason', 'Reason'],
  ['approved_by', 'Approved By'],
].map(([key, label]) => ({ key, label }));

export default function Page() {
  return (
    <RouteAccessGuard allowedGroups={['admin', 'super_user']} formTitle="Diversion History Report">
      <DataReport
        title="Diversion History"
        view="diversion_plans"
        columns={columns}
        searchKeys={columns.map((x) => x.key)}
      />
    </RouteAccessGuard>
  );
}
