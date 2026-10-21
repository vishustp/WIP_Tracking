---
type: community
cohesion: 0.18
members: 19
---

# Executive WIP Matrix & Summary Caches

**Cohesion:** 0.18 - loosely connected
**Members:** 19 nodes

## Members
- [[CampaignHierarchyMaps]] - code - lib/campaignWipUtils.ts
- [[Dashboard()]] - code - app/dashboard/page.tsx
- [[DashboardCachePayload]] - code - app/dashboard/page.tsx
- [[MotherHollowInfo]] - code - lib/campaignWipUtils.ts
- [[PrepareCampaignWipParams]] - code - lib/campaignWipUtils.ts
- [[PreparedCampaignWipResult]] - code - lib/campaignWipUtils.ts
- [[ReconciledStageWip]] - code - lib/wipReconciliation.ts
- [[StageWipInput]] - code - lib/wipReconciliation.ts
- [[WorkOrderWipSummary]] - code - lib/wipReconciliation.ts
- [[buildCampaignHierarchyMaps()]] - code - lib/campaignWipUtils.ts
- [[campaignWipUtils.ts]] - code - lib/campaignWipUtils.ts
- [[createClient()_1]] - code - lib/supabase/server.ts
- [[dashboardpage.tsx]] - code - app/dashboard/page.tsx
- [[dynamic_2]] - code - app/dashboard/page.tsx
- [[fetchWipSummary()]] - code - components/diversions/DiversionForm.tsx
- [[reconcileCampaignWorkOrderWip()]] - code - lib/campaignWipUtils.ts
- [[reconcileWorkOrderWip()]] - code - lib/wipReconciliation.ts
- [[server.ts]] - code - lib/supabase/server.ts
- [[wipReconciliation.ts]] - code - lib/wipReconciliation.ts

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Executive_WIP_Matrix__Summary_Caches
SORT file.name ASC
```

## Connections to other communities
- 8 edges to [[_COMMUNITY_Production Entry & Queue Grid]]
- 6 edges to [[_COMMUNITY_Production Queue & Plan Enrichment]]
- 5 edges to [[_COMMUNITY_Aging Notification & Alerts]]
- 5 edges to [[_COMMUNITY_Hollow Bank Inventory & Diversions]]
- 3 edges to [[_COMMUNITY_Dashboard KPIs & Station Aging]]
- 3 edges to [[_COMMUNITY_Size-Grade WIP Matrix Reports]]
- 1 edge to [[_COMMUNITY_Service Role Security & Backend Auth]]

## Top bridge nodes
- [[dashboardpage.tsx]] - degree 16, connects to 4 communities
- [[campaignWipUtils.ts]] - degree 16, connects to 4 communities
- [[Dashboard()]] - degree 9, connects to 4 communities
- [[reconcileCampaignWorkOrderWip()]] - degree 10, connects to 3 communities
- [[server.ts]] - degree 4, connects to 2 communities