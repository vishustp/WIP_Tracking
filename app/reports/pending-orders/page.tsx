import DataReport from '@/components/reports/DataReport';
import { pendingOrderColumns } from '@/lib/reports/pendingOrdersConfig';

export default function Page() {
  return (
    <DataReport
      title="Pending Orders"
      view="vw_work_order_summary"
      columns={pendingOrderColumns}
      searchKeys={pendingOrderColumns.map((x) => x.key)}
      statusKey="status"
    />
  );
}
