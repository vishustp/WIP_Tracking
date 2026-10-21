---
type: community
cohesion: 0.47
members: 6
---

# User Management & Mock Fallbacks

**Cohesion:** 0.47 - moderately connected
**Members:** 6 nodes

## Members
- [[AdminControlPanelClient()]] - code - components/admin/AdminControlPanelClient.tsx
- [[AdminPage()]] - code - app/admin/page.tsx
- [[UserPermissionsModal()]] - code - components/admin/UserPermissionsModal.tsx
- [[adminpage.tsx]] - code - app/admin/page.tsx
- [[getDefaultPermissions()]] - code - lib/permissions.ts
- [[mapAppUserToMockUser()]] - code - components/admin/AdminControlPanelClient.tsx

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/User_Management__Mock_Fallbacks
SORT file.name ASC
```

## Connections to other communities
- 7 edges to [[_COMMUNITY_User Roles & Permission Controls]]
- 4 edges to [[_COMMUNITY_Route Access Guards & Authorization]]
- 3 edges to [[_COMMUNITY_Authentication & Session State]]
- 2 edges to [[_COMMUNITY_Band Saw Cutting & Multiplier Split]]
- 2 edges to [[_COMMUNITY_WIP Stage Balancing & Flow Control]]

## Top bridge nodes
- [[AdminControlPanelClient()]] - degree 12, connects to 4 communities
- [[adminpage.tsx]] - degree 5, connects to 3 communities
- [[getDefaultPermissions()]] - degree 6, connects to 2 communities
- [[UserPermissionsModal()]] - degree 4, connects to 1 community
- [[AdminPage()]] - degree 3, connects to 1 community