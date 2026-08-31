'use client';

import DataReport from '@/components/reports/DataReport';
import RouteAccessGuard from '@/components/common/RouteAccessGuard';

const columns = [
  ['diversion_date', 'Date'],
  ['source_wo_id', 'Source WO ID'],
  ['target_wo_id', 'Target WO ID'],
  ['diverted_qty', 'Qty'],
  ['process_route_id', 'Route ID'],
  ['reason', 'Reason'],
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
