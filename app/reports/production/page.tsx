import DataReport from '@/components/reports/DataReport';
const columns=[['process_date','Date'],['work_order_id','WO ID'],['process_route_id','Route ID'],['stage_id','Stage ID'],['input_qty','Input'],['output_qty','Output'],['rejection_qty','Rejection'],['heat_lot_no','Heat/Lot'],['qa_clearance','QA'],['remarks','Remarks']].map(([key,label])=>({key,label}));
export default function Page(){return <DataReport title="Production History" view="production_logs" columns={columns} searchKeys={columns.map(x=>x.key)}/>;}
