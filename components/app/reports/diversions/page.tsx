import DataReport from '@/components/reports/DataReport';
const columns=[['diversion_date','Date'],['source_wo_id','Source WO ID'],['target_wo_id','Target WO ID'],['diverted_qty','Qty'],['process_route_id','Route ID'],['reason','Reason']].map(([key,label])=>({key,label}));
export default function Page(){return <DataReport title="Diversion History" view="diversion_plans" columns={columns} searchKeys={columns.map(x=>x.key)}/>;}
