---
type: community
cohesion: 0.18
members: 17
---

# Production Recording & Mutations

**Cohesion:** 0.18 - loosely connected
**Members:** 17 nodes

## Members
- [[ChildWoPayload]] - code - app/api/rolling-plans/route.ts
- [[CreateMultiWoRollingPlanPayload]] - code - app/api/rolling-plans/route.ts
- [[DELETE()_1]] - code - app/api/daily-plans/route.ts
- [[DELETE()_3]] - code - app/api/rolling-plans/route.ts
- [[GET()_1]] - code - app/api/daily-plans/route.ts
- [[MasterGroupPayload]] - code - app/api/rolling-plans/route.ts
- [[POST()_3]] - code - app/api/daily-plans/route.ts
- [[POST()_8]] - code - app/api/qc/rework/route.ts
- [[POST()_9]] - code - app/api/rolling-plans/route.ts
- [[PUT()_1]] - code - app/api/rolling-plans/route.ts
- [[UpdateRollingPlanPayload]] - code - app/api/rolling-plans/route.ts
- [[daily-plansroute.ts]] - code - app/api/daily-plans/route.ts
- [[dynamic]] - code - app/api/daily-plans/route.ts
- [[isPpcOrAdminUser()]] - code - lib/permissions.ts
- [[requireAuth()]] - code - lib/supabase/authGuard.ts
- [[reworkroute.ts]] - code - app/api/qc/rework/route.ts
- [[rolling-plansroute.ts]] - code - app/api/rolling-plans/route.ts

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Production_Recording__Mutations
SORT file.name ASC
```

## Connections to other communities
- 10 edges to [[_COMMUNITY_Admin Authentication Verification]]
- 8 edges to [[_COMMUNITY_Service Role Security & Backend Auth]]
- 6 edges to [[_COMMUNITY_Production Entry & Queue Grid]]
- 5 edges to [[_COMMUNITY_Daily Planning & PPC Scheduling]]
- 4 edges to [[_COMMUNITY_Route Access Guards & Authorization]]
- 4 edges to [[_COMMUNITY_Production Queue & Plan Enrichment]]
- 2 edges to [[_COMMUNITY_API Route Handlers & Server Endpoints]]
- 2 edges to [[_COMMUNITY_Feeder Balance Calculation & Validation]]
- 2 edges to [[_COMMUNITY_Production Log Reversals & Deletion]]
- 2 edges to [[_COMMUNITY_Rolling Plan & Hollow Metrics]]
- 2 edges to [[_COMMUNITY_AI Spec Lookup & Metallurgical Standards]]
- 2 edges to [[_COMMUNITY_Report Tabulation & Data Tables]]

## Top bridge nodes
- [[requireAuth()]] - degree 23, connects to 6 communities
- [[daily-plansroute.ts]] - degree 15, connects to 5 communities
- [[rolling-plansroute.ts]] - degree 13, connects to 4 communities
- [[reworkroute.ts]] - degree 8, connects to 3 communities
- [[isPpcOrAdminUser()]] - degree 8, connects to 2 communities