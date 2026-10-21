---
type: community
cohesion: 0.60
members: 6
---

# AI Spec Lookup & Metallurgical Standards

**Cohesion:** 0.60 - moderately connected
**Members:** 6 nodes

## Members
- [[FetchedSpecData]] - code - lib/specAiService.ts
- [[METALLURGICAL_STANDARDS_DB]] - code - lib/specAiService.ts
- [[POST()_11]] - code - app/api/specs/ai-lookup/route.ts
- [[ai-lookuproute.ts]] - code - app/api/specs/ai-lookup/route.ts
- [[findMatchingStandard()]] - code - lib/specAiService.ts
- [[specAiService.ts]] - code - lib/specAiService.ts

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/AI_Spec_Lookup__Metallurgical_Standards
SORT file.name ASC
```

## Connections to other communities
- 2 edges to [[_COMMUNITY_Production Recording & Mutations]]
- 1 edge to [[_COMMUNITY_Service Role Security & Backend Auth]]
- 1 edge to [[_COMMUNITY_Production Entry & Queue Grid]]

## Top bridge nodes
- [[ai-lookuproute.ts]] - degree 8, connects to 3 communities
- [[POST()_11]] - degree 3, connects to 1 community