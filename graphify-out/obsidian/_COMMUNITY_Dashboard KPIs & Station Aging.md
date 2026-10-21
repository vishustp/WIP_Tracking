---
type: community
cohesion: 0.10
members: 34
---

# Dashboard KPIs & Station Aging

**Cohesion:** 0.10 - loosely connected
**Members:** 34 nodes

## Members
- [[AgingItem]] - code - components/dashboard/DashboardClient.tsx
- [[CANONICAL_WIP_WORK_CENTERS]] - code - components/dashboard/DashboardClient.tsx
- [[DATE_FILTER_OPTIONS]] - code - lib/planning/orderPriorityHelper.ts
- [[DashboardClient()]] - code - components/dashboard/DashboardClient.tsx
- [[DashboardClient.tsx]] - code - components/dashboard/DashboardClient.tsx
- [[DateFilterOption]] - code - lib/planning/orderPriorityHelper.ts
- [[DateFilterType]] - code - lib/planning/orderPriorityHelper.ts
- [[KPI]] - code - components/dashboard/DashboardClient.tsx
- [[OrderPriorityPage()]] - code - app/order-priority/page.tsx
- [[OrderPrioritySheetClient()]] - code - components/planning/OrderPrioritySheetClient.tsx
- [[OrderPrioritySheetClient.tsx]] - code - components/planning/OrderPrioritySheetClient.tsx
- [[PRIORITY_CONFIGS]] - code - lib/planning/orderPriorityHelper.ts
- [[PendingRow]] - code - components/dashboard/DashboardClient.tsx
- [[PriorityItem]] - code - lib/planning/orderPriorityHelper.ts
- [[PriorityTier]] - code - lib/planning/orderPriorityHelper.ts
- [[PriorityTierConfig]] - code - lib/planning/orderPriorityHelper.ts
- [[Props]] - code - components/dashboard/DashboardClient.tsx
- [[RecentProductionItem]] - code - components/dashboard/DashboardClient.tsx
- [[TrendDataPoint]] - code - components/dashboard/DashboardClient.tsx
- [[WIPRow]] - code - components/dashboard/DashboardClient.tsx
- [[WorkOrderItem]] - code - components/planning/OrderPrioritySheetClient.tsx
- [[YesterdayProductionData]] - code - components/dashboard/DashboardClient.tsx
- [[YesterdayStation]] - code - components/dashboard/DashboardClient.tsx
- [[buildPriorityCsvContent()]] - code - lib/planning/orderPriorityHelper.ts
- [[filterOrdersByDateBasis()]] - code - lib/planning/orderPriorityHelper.ts
- [[formatNum()]] - code - components/dashboard/DashboardClient.tsx
- [[getEffectiveOrderDate()]] - code - lib/planning/orderPriorityHelper.ts
- [[loadLocalPriorities()]] - code - lib/planning/orderPriorityHelper.ts
- [[metadata_3]] - code - app/order-priority/page.tsx
- [[order-prioritypage.tsx]] - code - app/order-priority/page.tsx
- [[orderPriorityHelper.ts]] - code - lib/planning/orderPriorityHelper.ts
- [[ref_recharts]] - concept
- [[saveLocalPriorities()]] - code - lib/planning/orderPriorityHelper.ts
- [[sortOrdersByPriority()]] - code - lib/planning/orderPriorityHelper.ts

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Dashboard_KPIs__Station_Aging
SORT file.name ASC
```

## Connections to other communities
- 5 edges to [[_COMMUNITY_API Route Handlers & Server Endpoints]]
- 5 edges to [[_COMMUNITY_Production Entry & Queue Grid]]
- 3 edges to [[_COMMUNITY_Executive WIP Matrix & Summary Caches]]
- 3 edges to [[_COMMUNITY_Authentication & Session State]]
- 2 edges to [[_COMMUNITY_Band Saw Cutting & Multiplier Split]]
- 1 edge to [[_COMMUNITY_Route Access Guards & Authorization]]
- 1 edge to [[_COMMUNITY_Salvage Disposition & Approvals]]

## Top bridge nodes
- [[OrderPrioritySheetClient.tsx]] - degree 19, connects to 4 communities
- [[DashboardClient.tsx]] - degree 22, connects to 3 communities
- [[order-prioritypage.tsx]] - degree 7, connects to 3 communities
- [[DashboardClient()]] - degree 6, connects to 2 communities
- [[OrderPrioritySheetClient()]] - degree 10, connects to 1 community