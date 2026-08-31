export type Role='Admin'|'PPC'|'Production'|'QA'|'Viewer';
export type RouteCode='HFS'|'CDS'|'ALLOY_HFS'|'ALLOY_CDS';
export type QAStatus='Pending'|'Cleared'|'Hold'|'Rejected';
export type WorkOrderStatus='Pending Plan'|'Scheduled'|'In Progress'|'Completed'|'Diverted';
export interface RouteStage{stage_code:string;stage_name:string;sequence_no:number}
