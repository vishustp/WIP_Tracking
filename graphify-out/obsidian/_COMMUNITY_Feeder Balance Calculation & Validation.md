---
type: community
cohesion: 0.31
members: 9
---

# Feeder Balance Calculation & Validation

**Cohesion:** 0.31 - loosely connected
**Members:** 9 nodes

## Members
- [[FeederBalance]] - code - lib/feederValidation.ts
- [[POST()_4]] - code - app/api/excel-import/work-center/route.ts
- [[ProductionLogRecord]] - code - lib/feederValidation.ts
- [[QcInspectionRecord]] - code - lib/feederValidation.ts
- [[RollingPlanRecord_1]] - code - lib/feederValidation.ts
- [[WorkOrderSummary]] - code - lib/feederValidation.ts
- [[computeFeederBalanceForWorkOrder()]] - code - lib/feederValidation.ts
- [[feederValidation.ts]] - code - lib/feederValidation.ts
- [[work-centerroute.ts]] - code - app/api/excel-import/work-center/route.ts

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Feeder_Balance_Calculation__Validation
SORT file.name ASC
```

## Connections to other communities
- 7 edges to [[_COMMUNITY_Production Entry & Queue Grid]]
- 2 edges to [[_COMMUNITY_Service Role Security & Backend Auth]]
- 2 edges to [[_COMMUNITY_Admin Authentication Verification]]
- 2 edges to [[_COMMUNITY_Production Recording & Mutations]]
- 2 edges to [[_COMMUNITY_Production Queue & Plan Enrichment]]

## Top bridge nodes
- [[work-centerroute.ts]] - degree 11, connects to 4 communities
- [[POST()_4]] - degree 5, connects to 3 communities
- [[feederValidation.ts]] - degree 11, connects to 2 communities
- [[computeFeederBalanceForWorkOrder()]] - degree 4, connects to 1 community