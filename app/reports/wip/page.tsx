import DataReport from '@/components/reports/DataReport';
const columns=[['work_order_no','WO No.'],['route_code','Route'],['stage_name','Stage'],['sequence_no','Seq'],['input_qty','Input'],['output_qty','Output'],['rejection_qty','Rejection'],['current_wip','Current WIP']].map(([key,label])=>({key,label}));
export default function Page(){return <DataReport title="Route-aware WIP" view="vw_route_stage_wip" columns={columns} searchKeys={['work_order_no','route_code','stage_name']}/>;}
