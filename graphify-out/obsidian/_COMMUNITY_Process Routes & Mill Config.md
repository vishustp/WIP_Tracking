---
type: community
cohesion: 0.38
members: 7
---

# Process Routes & Mill Config

**Cohesion:** 0.38 - loosely connected
**Members:** 7 nodes

## Members
- [[Page()_9]] - code - app/settings/page.tsx
- [[ProcessRoute]] - code - components/settings/SettingsClient.tsx
- [[ProcessStage]] - code - components/settings/SettingsClient.tsx
- [[SettingsClient()]] - code - components/settings/SettingsClient.tsx
- [[SettingsClient.tsx]] - code - components/settings/SettingsClient.tsx
- [[loadData()]] - code - components/settings/SettingsClient.tsx
- [[settingspage.tsx]] - code - app/settings/page.tsx

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Process_Routes__Mill_Config
SORT file.name ASC
```

## Connections to other communities
- 4 edges to [[_COMMUNITY_Authentication & Session State]]
- 2 edges to [[_COMMUNITY_Band Saw Cutting & Multiplier Split]]
- 2 edges to [[_COMMUNITY_API Route Handlers & Server Endpoints]]
- 1 edge to [[_COMMUNITY_Route Access Guards & Authorization]]

## Top bridge nodes
- [[SettingsClient.tsx]] - degree 10, connects to 4 communities
- [[SettingsClient()]] - degree 6, connects to 2 communities
- [[loadData()]] - degree 2, connects to 1 community