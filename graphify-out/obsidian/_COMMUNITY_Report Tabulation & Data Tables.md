---
type: community
cohesion: 0.24
members: 11
---

# Report Tabulation & Data Tables

**Cohesion:** 0.24 - loosely connected
**Members:** 11 nodes

## Members
- [[ColumnDef]] - code - lib/reports/pendingOrdersConfig.ts
- [[DataReport()]] - code - components/reports/DataReport.tsx
- [[DataReport.tsx]] - code - components/reports/DataReport.tsx
- [[Page()_4]] - code - app/reports/pending-orders/page.tsx
- [[Props_3]] - code - components/reports/DataReport.tsx
- [[STANDARD_STATUSES]] - code - components/reports/DataReport.tsx
- [[contexts_usersessioncontext]] - concept
- [[contexts_usersessioncontext_useoptionalusersession]] - concept
- [[pending-orderspage.tsx]] - code - app/reports/pending-orders/page.tsx
- [[pendingOrderColumns]] - code - lib/reports/pendingOrdersConfig.ts
- [[pendingOrdersConfig.ts]] - code - lib/reports/pendingOrdersConfig.ts

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Report_Tabulation__Data_Tables
SORT file.name ASC
```

## Connections to other communities
- 6 edges to [[_COMMUNITY_Production Entry & Queue Grid]]
- 4 edges to [[_COMMUNITY_Salvage Disposition & Approvals]]
- 3 edges to [[_COMMUNITY_Route Access Guards & Authorization]]
- 3 edges to [[_COMMUNITY_Authentication & Session State]]
- 2 edges to [[_COMMUNITY_App Shell, Navigation & Layout]]
- 2 edges to [[_COMMUNITY_Production Recording & Mutations]]
- 2 edges to [[_COMMUNITY_API Route Handlers & Server Endpoints]]
- 1 edge to [[_COMMUNITY_Excel Master Import & Ingestion]]

## Top bridge nodes
- [[DataReport.tsx]] - degree 19, connects to 7 communities
- [[DataReport()]] - degree 8, connects to 4 communities
- [[contexts_usersessioncontext]] - degree 5, connects to 3 communities
- [[contexts_usersessioncontext_useoptionalusersession]] - degree 2, connects to 1 community