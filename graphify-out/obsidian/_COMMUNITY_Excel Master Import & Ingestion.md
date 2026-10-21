---
type: community
cohesion: 0.08
members: 47
---

# Excel Master Import & Ingestion

**Cohesion:** 0.08 - loosely connected
**Members:** 47 nodes

## Members
- [[COMPLETED_STATUSES]] - code - lib/excelWorkOrderImport.ts
- [[DailyPlanningReportClient()]] - code - components/reports/DailyPlanningReportClient.tsx
- [[DailyPlanningReportClient.tsx]] - code - components/reports/DailyPlanningReportClient.tsx
- [[DiversionIssueReportClient()]] - code - components/reports/DiversionIssueReportClient.tsx
- [[DiversionIssueReportClient.tsx]] - code - components/reports/DiversionIssueReportClient.tsx
- [[DiversionPlanItem_1]] - code - components/reports/DiversionIssueReportClient.tsx
- [[ExcelImportPage()]] - code - app/excel-import/page.tsx
- [[ExcelImporter()]] - code - components/excel/ExcelImporter.tsx
- [[ExcelImporter.tsx]] - code - components/excel/ExcelImporter.tsx
- [[Page()_2]] - code - app/reports/daily-plan/page.tsx
- [[Page()_3]] - code - app/reports/diversions/page.tsx
- [[ReportFormat]] - code - components/reports/DailyPlanningReportClient.tsx
- [[SAMPLE_DATASETS]] - code - components/excel/ExcelImporter.tsx
- [[VALID_WORK_ORDER_STATUSES]] - code - lib/excelWorkOrderImport.ts
- [[WORK_CENTER_LABELS]] - code - components/reports/DiversionIssueReportClient.tsx
- [[WORK_CENTER_TABS]] - code - components/excel/ExcelImporter.tsx
- [[WorkCenterImportTab]] - code - components/excel/ExcelImporter.tsx
- [[WorkCenterTabConfig]] - code - components/excel/ExcelImporter.tsx
- [[WorkOrderImportRow]] - code - lib/excelWorkOrderImport.ts
- [[buildWorkOrderInsertPayload()]] - code - lib/excelWorkOrderImport.ts
- [[buildWorkOrderUpdatePayload()]] - code - lib/excelWorkOrderImport.ts
- [[clean()]] - code - components/excel/ExcelImporter.tsx
- [[clearImport()]] - code - components/excel/ExcelImporter.tsx
- [[daily-planpage.tsx]] - code - app/reports/daily-plan/page.tsx
- [[excel-importpage.tsx]] - code - app/excel-import/page.tsx
- [[excelUtils.ts]] - code - lib/excelUtils.ts
- [[excelWorkOrderImport.ts]] - code - lib/excelWorkOrderImport.ts
- [[exceljs]] - code - exceljs
- [[executeImport()]] - code - components/excel/ExcelImporter.tsx
- [[exportSheetsToExcel()]] - code - lib/excelUtils.ts
- [[findColumn()]] - code - components/excel/ExcelImporter.tsx
- [[fmt()_4]] - code - components/reports/DiversionIssueReportClient.tsx
- [[getExcelJS()]] - code - lib/excelUtils.ts
- [[getXlsx()]] - code - lib/excelUtils.ts
- [[isOrderCompletedForImport()]] - code - lib/excelWorkOrderImport.ts
- [[normalizeHeader()]] - code - components/excel/ExcelImporter.tsx
- [[num()]] - code - components/excel/ExcelImporter.tsx
- [[parseExcelBuffer()]] - code - lib/excelUtils.ts
- [[parseExcelDate()]] - code - lib/excelUtils.ts
- [[parseExcelWorkbook()]] - code - lib/excelUtils.ts
- [[parseFile()]] - code - components/excel/ExcelImporter.tsx
- [[parseLengthValues()]] - code - components/excel/ExcelImporter.tsx
- [[ref_exceljs]] - concept
- [[ref_xlsx]] - concept
- [[reportsdiversionspage.tsx]] - code - app/reports/diversions/page.tsx
- [[validateWorkOrderImportRow()]] - code - lib/excelWorkOrderImport.ts
- [[xlsx]] - code - xlsx

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Excel_Master_Import__Ingestion
SORT file.name ASC
```

## Connections to other communities
- 8 edges to [[_COMMUNITY_Production Entry & Queue Grid]]
- 7 edges to [[_COMMUNITY_Salvage Disposition & Approvals]]
- 7 edges to [[_COMMUNITY_Authentication & Session State]]
- 6 edges to [[_COMMUNITY_Route Access Guards & Authorization]]
- 6 edges to [[_COMMUNITY_Band Saw Cutting & Multiplier Split]]
- 6 edges to [[_COMMUNITY_WIP Stage Balancing & Flow Control]]
- 6 edges to [[_COMMUNITY_API Route Handlers & Server Endpoints]]
- 3 edges to [[_COMMUNITY_Daily Planning & PPC Scheduling]]
- 1 edge to [[_COMMUNITY_Mill Rejections & Hollow Allocation]]
- 1 edge to [[_COMMUNITY_Aging Notification & Alerts]]
- 1 edge to [[_COMMUNITY_Report Tabulation & Data Tables]]
- 1 edge to [[_COMMUNITY_Size-Grade WIP Matrix Reports]]
- 1 edge to [[_COMMUNITY_Work Order Tracking & QC History]]

## Top bridge nodes
- [[excelUtils.ts]] - degree 20, connects to 7 communities
- [[ExcelImporter.tsx]] - degree 35, connects to 6 communities
- [[ExcelImporter()]] - degree 21, connects to 5 communities
- [[DiversionIssueReportClient.tsx]] - degree 13, connects to 3 communities
- [[DailyPlanningReportClient.tsx]] - degree 11, connects to 3 communities