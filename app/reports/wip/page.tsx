import DataReport from '@/components/reports/DataReport';

const columns = [
  ['work_order_no', 'WO No.'],
  ['customer_name', 'Customer'],
  ['route_code', 'Process Route'],
  ['stage_name', 'Stage / Station'],
  ['sequence_no', 'Seq'],
  ['input_qty', 'Input (Mtrs)'],
  ['output_qty', 'Gross Output (Mtrs)'],
  ['rejection_qty', 'Rejection (Mtrs)'],
  ['net_output_qty', 'Net Output (Mtrs)'],
  ['current_wip', 'Current Physical WIP (Mtrs)'],
  ['current_wip_pcs', 'WIP (Pcs)'],
  ['available_mt', 'WIP (MT)'],
].map(([key, label]) => ({ key, label }));

export default function Page() {
  return (
    <DataReport
      title="Station & Route-Aware WIP Report"
      view="vw_route_stage_wip"
      columns={columns}
      searchKeys={['work_order_no', 'customer_name', 'route_code', 'stage_name']}
    />
  );
}
