---
type: community
cohesion: 0.17
members: 28
---

# Aging Notification & Alerts

**Cohesion:** 0.17 - loosely connected
**Members:** 28 nodes

## Members
- [[AGING_STAGES]] - code - lib/reports/agingReportHelper.ts
- [[AgingAlert]] - code - components/common/AgingNotificationBell.tsx
- [[AgingKpiSummary]] - code - lib/reports/agingReportHelper.ts
- [[AgingNotificationBell()]] - code - components/common/AgingNotificationBell.tsx
- [[AgingNotificationBell.tsx]] - code - components/common/AgingNotificationBell.tsx
- [[AgingPage()]] - code - app/reports/aging/page.tsx
- [[AgingReportClient()]] - code - components/reports/AgingReportClient.tsx
- [[AgingReportClient.tsx]] - code - components/reports/AgingReportClient.tsx
- [[AgingRow]] - code - lib/reports/agingReportHelper.ts
- [[AgingSeverity]] - code - lib/reports/agingReportHelper.ts
- [[RawAcknowledgement]] - code - lib/reports/agingReportHelper.ts
- [[RawProductionLog]] - code - lib/reports/agingReportHelper.ts
- [[RawQcInspection]] - code - lib/reports/agingReportHelper.ts
- [[RawRollingPlan]] - code - lib/reports/agingReportHelper.ts
- [[RawRouteStage]] - code - lib/reports/agingReportHelper.ts
- [[RawWipRow]] - code - lib/reports/agingReportHelper.ts
- [[RawWorkOrder]] - code - lib/reports/agingReportHelper.ts
- [[agingpage.tsx]] - code - app/reports/aging/page.tsx
- [[agingReportHelper.ts]] - code - lib/reports/agingReportHelper.ts
- [[calculateAgingSeverity()]] - code - lib/reports/agingReportHelper.ts
- [[calculateDaysStuck()]] - code - lib/reports/agingReportHelper.ts
- [[computeAgingKpis()]] - code - lib/reports/agingReportHelper.ts
- [[computeAgingReportRows()]] - code - lib/reports/agingReportHelper.ts
- [[determineStageEffectiveActivityDate()]] - code - lib/reports/agingReportHelper.ts
- [[filterAgingRows()]] - code - lib/reports/agingReportHelper.ts
- [[fmt()_3]] - code - components/reports/AgingReportClient.tsx
- [[metadata_6]] - code - app/reports/aging/page.tsx
- [[normalizeAgingRow()]] - code - lib/reports/agingReportHelper.ts

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Aging_Notification__Alerts
SORT file.name ASC
```

## Connections to other communities
- 8 edges to [[_COMMUNITY_Production Entry & Queue Grid]]
- 6 edges to [[_COMMUNITY_Authentication & Session State]]
- 5 edges to [[_COMMUNITY_Executive WIP Matrix & Summary Caches]]
- 4 edges to [[_COMMUNITY_API Route Handlers & Server Endpoints]]
- 4 edges to [[_COMMUNITY_Salvage Disposition & Approvals]]
- 3 edges to [[_COMMUNITY_App Shell, Navigation & Layout]]
- 3 edges to [[_COMMUNITY_Work Order Tracking & QC History]]
- 2 edges to [[_COMMUNITY_User Roles & Permission Controls]]
- 1 edge to [[_COMMUNITY_Excel Master Import & Ingestion]]

## Top bridge nodes
- [[AgingReportClient.tsx]] - degree 31, connects to 6 communities
- [[AgingNotificationBell.tsx]] - degree 22, connects to 6 communities
- [[AgingReportClient()]] - degree 13, connects to 4 communities
- [[AgingNotificationBell()]] - degree 6, connects to 2 communities
- [[agingReportHelper.ts]] - degree 21, connects to 1 community