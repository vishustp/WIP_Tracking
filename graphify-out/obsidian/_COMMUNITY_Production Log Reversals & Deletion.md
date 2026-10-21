---
type: community
cohesion: 0.83
members: 4
---

# Production Log Reversals & Deletion

**Cohesion:** 0.83 - tightly connected
**Members:** 4 nodes

## Members
- [[DELETE()_2]] - code - app/api/production/delete/route.ts
- [[POST()_5]] - code - app/api/production/delete/route.ts
- [[deleteroute.ts]] - code - app/api/production/delete/route.ts
- [[handleDelete()]] - code - app/api/production/delete/route.ts

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Production_Log_Reversals__Deletion
SORT file.name ASC
```

## Connections to other communities
- 3 edges to [[_COMMUNITY_Production Queue & Plan Enrichment]]
- 2 edges to [[_COMMUNITY_Service Role Security & Backend Auth]]
- 2 edges to [[_COMMUNITY_Admin Authentication Verification]]
- 2 edges to [[_COMMUNITY_Production Recording & Mutations]]
- 1 edge to [[_COMMUNITY_Production Entry & Queue Grid]]

## Top bridge nodes
- [[deleteroute.ts]] - degree 10, connects to 5 communities
- [[handleDelete()]] - degree 6, connects to 3 communities