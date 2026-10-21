---
type: community
cohesion: 0.20
members: 22
---

# Production Queue & Plan Enrichment

**Cohesion:** 0.20 - loosely connected
**Members:** 22 nodes

## Members
- [[CachePayload]] - code - lib/cache/queueCache.ts
- [[GET()_2]] - code - app/api/production/history/route.ts
- [[GET()_3]] - code - app/api/production/queue/route.ts
- [[POST()_6]] - code - app/api/production/record/route.ts
- [[POST()_7]] - code - app/api/production/update/route.ts
- [[QUEUE_CACHE_TTL_MS]] - code - lib/cache/queueCache.ts
- [[WorkCenterWipInfo]] - code - types/index.ts
- [[dynamic_1]] - code - app/api/production/queue/route.ts
- [[enrichWithDailyPlans()]] - code - app/api/production/queue/route.ts
- [[extractBandSawCutsFromRemarks()]] - code - lib/productionUtils.ts
- [[extractPcsFromRemarks()]] - code - lib/productionUtils.ts
- [[fetchAllLogs()]] - code - app/api/production/queue/route.ts
- [[getQueueCache()]] - code - lib/cache/queueCache.ts
- [[historyroute.ts]] - code - app/api/production/history/route.ts
- [[invalidateQueueCache()]] - code - lib/cache/queueCache.ts
- [[isHollowBankOrder()]] - code - app/api/production/queue/route.ts
- [[queueroute.ts]] - code - app/api/production/queue/route.ts
- [[queueCache.ts]] - code - lib/cache/queueCache.ts
- [[recordroute.ts]] - code - app/api/production/record/route.ts
- [[revalidate]] - code - app/api/production/queue/route.ts
- [[setQueueCache()]] - code - lib/cache/queueCache.ts
- [[updateroute.ts]] - code - app/api/production/update/route.ts

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Production_Queue__Plan_Enrichment
SORT file.name ASC
```

## Connections to other communities
- 41 edges to [[_COMMUNITY_Production Entry & Queue Grid]]
- 8 edges to [[_COMMUNITY_Admin Authentication Verification]]
- 6 edges to [[_COMMUNITY_Service Role Security & Backend Auth]]
- 6 edges to [[_COMMUNITY_Executive WIP Matrix & Summary Caches]]
- 4 edges to [[_COMMUNITY_Production Recording & Mutations]]
- 4 edges to [[_COMMUNITY_Band Saw Cutting & Multiplier Split]]
- 3 edges to [[_COMMUNITY_Production Log Reversals & Deletion]]
- 3 edges to [[_COMMUNITY_Scrap Generation & Loss Audits]]
- 2 edges to [[_COMMUNITY_Size-Grade WIP Matrix Reports]]
- 2 edges to [[_COMMUNITY_Work Order Tracking & QC History]]
- 2 edges to [[_COMMUNITY_Feeder Balance Calculation & Validation]]
- 2 edges to [[_COMMUNITY_Mill Rejections & Hollow Allocation]]
- 1 edge to [[_COMMUNITY_Authentication & Session State]]

## Top bridge nodes
- [[extractPcsFromRemarks()]] - degree 33, connects to 9 communities
- [[extractBandSawCutsFromRemarks()]] - degree 23, connects to 5 communities
- [[recordroute.ts]] - degree 12, connects to 4 communities
- [[updateroute.ts]] - degree 11, connects to 4 communities
- [[queueroute.ts]] - degree 20, connects to 3 communities