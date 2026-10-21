---
type: community
cohesion: 0.14
members: 24
---

# Work Order Tracking & QC History

**Cohesion:** 0.14 - loosely connected
**Members:** 24 nodes

## Members
- [[Card()]] - code - components/ui/card.tsx
- [[CardContent()]] - code - components/ui/card.tsx
- [[CardHeader()]] - code - components/ui/card.tsx
- [[CardProps]] - code - components/ui/card.tsx
- [[FinishingQcModalProps]] - code - components/reports/WorkOrderTrackingClient.tsx
- [[ProductionLog]] - code - components/reports/WorkOrderTrackingClient.tsx
- [[RollingPlan]] - code - components/reports/WorkOrderTrackingClient.tsx
- [[STAGES_ORDER]] - code - components/reports/WorkOrderTrackingClient.tsx
- [[Select()]] - code - components/ui/select.tsx
- [[SelectProps]] - code - components/ui/select.tsx
- [[StageTrackingMetric]] - code - components/reports/WorkOrderTrackingClient.tsx
- [[StageWipRow]] - code - components/reports/WorkOrderTrackingClient.tsx
- [[WorkOrder]] - code - components/reports/WorkOrderTrackingClient.tsx
- [[WorkOrderTrackingClient()]] - code - components/reports/WorkOrderTrackingClient.tsx
- [[WorkOrderTrackingClient.tsx]] - code - components/reports/WorkOrderTrackingClient.tsx
- [[WorkOrderTrackingPage()]] - code - app/reports/tracking/page.tsx
- [[card.tsx]] - code - components/ui/card.tsx
- [[cn()]] - code - lib/utils.ts
- [[metadata_7]] - code - app/reports/tracking/page.tsx
- [[ref_clsx]] - concept
- [[ref_tailwind_merge]] - concept
- [[select.tsx]] - code - components/ui/select.tsx
- [[trackingpage.tsx]] - code - app/reports/tracking/page.tsx
- [[utils.ts]] - code - lib/utils.ts

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Work_Order_Tracking__QC_History
SORT file.name ASC
```

## Connections to other communities
- 18 edges to [[_COMMUNITY_Production Entry & Queue Grid]]
- 5 edges to [[_COMMUNITY_API Route Handlers & Server Endpoints]]
- 3 edges to [[_COMMUNITY_WIP Stage Balancing & Flow Control]]
- 3 edges to [[_COMMUNITY_Hollow Bank Inventory & Diversions]]
- 3 edges to [[_COMMUNITY_Aging Notification & Alerts]]
- 3 edges to [[_COMMUNITY_Size-Grade WIP Matrix Reports]]
- 3 edges to [[_COMMUNITY_Authentication & Session State]]
- 3 edges to [[_COMMUNITY_Rolling Plan & Hollow Metrics]]
- 2 edges to [[_COMMUNITY_Salvage Disposition & Approvals]]
- 2 edges to [[_COMMUNITY_Production Queue & Plan Enrichment]]
- 2 edges to [[_COMMUNITY_Band Saw Cutting & Multiplier Split]]
- 1 edge to [[_COMMUNITY_Excel Master Import & Ingestion]]

## Top bridge nodes
- [[WorkOrderTrackingClient.tsx]] - degree 32, connects to 7 communities
- [[select.tsx]] - degree 11, connects to 6 communities
- [[WorkOrderTrackingClient()]] - degree 16, connects to 5 communities
- [[Select()]] - degree 14, connects to 5 communities
- [[trackingpage.tsx]] - degree 6, connects to 2 communities