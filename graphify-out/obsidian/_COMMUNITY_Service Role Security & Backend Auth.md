---
type: community
cohesion: 0.20
members: 16
---

# Service Role Security & Backend Auth

**Cohesion:** 0.20 - loosely connected
**Members:** 16 nodes

## Members
- [[AuthContext]] - code - lib/supabase/authGuard.ts
- [[POST()]] - code - app/api/admin/reset-factory/route.ts
- [[POST()_10]] - code - app/api/seed-work-orders/route.ts
- [[admin.ts]] - code - lib/supabase/admin.ts
- [[authGuard.ts]] - code - lib/supabase/authGuard.ts
- [[getAuthenticatedUser()]] - code - lib/supabase/authGuard.ts
- [[getServiceRoleKey()]] - code - lib/supabase/admin.ts
- [[getSupabaseUrl()]] - code - lib/supabase/admin.ts
- [[readEnvVarFromFile()]] - code - lib/supabase/admin.ts
- [[ref_fs]] - concept
- [[ref_path]] - concept
- [[ref_supabase_ssr]] - concept
- [[ref_supabase_supabase_js]] - concept
- [[requireAdmin()]] - code - lib/supabase/authGuard.ts
- [[reset-factoryroute.ts]] - code - app/api/admin/reset-factory/route.ts
- [[seed-work-ordersroute.ts]] - code - app/api/seed-work-orders/route.ts

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Service_Role_Security__Backend_Auth
SORT file.name ASC
```

## Connections to other communities
- 12 edges to [[_COMMUNITY_Admin Authentication Verification]]
- 8 edges to [[_COMMUNITY_Production Recording & Mutations]]
- 6 edges to [[_COMMUNITY_Production Queue & Plan Enrichment]]
- 3 edges to [[_COMMUNITY_Production Entry & Queue Grid]]
- 2 edges to [[_COMMUNITY_Feeder Balance Calculation & Validation]]
- 2 edges to [[_COMMUNITY_Production Log Reversals & Deletion]]
- 1 edge to [[_COMMUNITY_API Route Handlers & Server Endpoints]]
- 1 edge to [[_COMMUNITY_AI Spec Lookup & Metallurgical Standards]]
- 1 edge to [[_COMMUNITY_Authentication & Session State]]
- 1 edge to [[_COMMUNITY_Executive WIP Matrix & Summary Caches]]

## Top bridge nodes
- [[authGuard.ts]] - degree 19, connects to 8 communities
- [[admin.ts]] - degree 20, connects to 5 communities
- [[ref_supabase_ssr]] - degree 5, connects to 3 communities
- [[reset-factoryroute.ts]] - degree 6, connects to 2 communities
- [[seed-work-ordersroute.ts]] - degree 6, connects to 2 communities