import DataReport from '@/components/reports/DataReport';
const columns=[['work_order_no','WO No.'],['customer','Customer'],['od','OD'],['wt','WT'],['grade','Grade'],['ordered_qty','Ordered Qty'],['planned_qty','Planned Qty'],['produced_qty','Produced Qty'],['route','Route'],['total_pending','Balance Pending'],['target_date','Target Date'],['status','Status']].map(([key,label])=>({key,label}));
export default function Page(){return <DataReport title="Pending Orders" view="vw_work_order_summary" columns={columns} searchKeys={columns.map(x=>x.key)}/>;}
