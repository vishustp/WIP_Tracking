---
type: community
cohesion: 0.19
members: 21
---

# User Roles & Permission Controls

**Cohesion:** 0.19 - loosely connected
**Members:** 21 nodes

## Members
- [[AccessLevel]] - code - lib/users/types.ts
- [[AdminControlPanelClient.tsx]] - code - components/admin/AdminControlPanelClient.tsx
- [[AppAuditLog]] - code - lib/users/types.ts
- [[AppRoute]] - code - lib/users/types.ts
- [[AppStage]] - code - lib/users/types.ts
- [[AppUserProfile]] - code - lib/users/types.ts
- [[DEFAULT_STAGE_OPTIONS]] - code - components/admin/AdminControlPanelClient.tsx
- [[FormPermissions]] - code - lib/users/types.ts
- [[GROUP_OPTIONS]] - code - components/admin/AdminControlPanelClient.tsx
- [[GroupConfig]] - code - lib/permissions.ts
- [[MODULE_DEFINITIONS]] - code - lib/permissions.ts
- [[ROLE_OPTIONS]] - code - components/admin/AdminControlPanelClient.tsx
- [[ROLE_PERMISSIONS]] - code - components/profile/UserProfileClient.tsx
- [[UserGroup]] - code - lib/users/types.ts
- [[UserPermissionsModal.tsx]] - code - components/admin/UserPermissionsModal.tsx
- [[UserPermissionsModalProps]] - code - components/admin/UserPermissionsModal.tsx
- [[UserProfileClient.tsx]] - code - components/profile/UserProfileClient.tsx
- [[WORK_CENTER_LABELS_1]] - code - lib/permissions.ts
- [[WORK_CENTER_OPTIONS]] - code - components/admin/AdminControlPanelClient.tsx
- [[WorkCenterCode]] - code - lib/users/types.ts
- [[userstypes.ts]] - code - lib/users/types.ts

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/User_Roles__Permission_Controls
SORT file.name ASC
```

## Connections to other communities
- 16 edges to [[_COMMUNITY_Authentication & Session State]]
- 15 edges to [[_COMMUNITY_Route Access Guards & Authorization]]
- 7 edges to [[_COMMUNITY_User Management & Mock Fallbacks]]
- 6 edges to [[_COMMUNITY_API Route Handlers & Server Endpoints]]
- 5 edges to [[_COMMUNITY_Production Entry & Queue Grid]]
- 4 edges to [[_COMMUNITY_WIP Stage Balancing & Flow Control]]
- 3 edges to [[_COMMUNITY_App Shell, Navigation & Layout]]
- 3 edges to [[_COMMUNITY_Salvage Disposition & Approvals]]
- 2 edges to [[_COMMUNITY_Aging Notification & Alerts]]

## Top bridge nodes
- [[AdminControlPanelClient.tsx]] - degree 36, connects to 7 communities
- [[userstypes.ts]] - degree 18, connects to 5 communities
- [[AppUserProfile]] - degree 11, connects to 5 communities
- [[UserProfileClient.tsx]] - degree 17, connects to 4 communities
- [[UserPermissionsModal.tsx]] - degree 16, connects to 4 communities