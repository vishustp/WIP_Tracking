---
type: community
cohesion: 0.19
members: 19
---

# Authentication & Session State

**Cohesion:** 0.19 - loosely connected
**Members:** 19 nodes

## Members
- [[ALL_STAGES]] - code - lib/users/client.ts
- [[LoginPage()]] - code - app/login/page.tsx
- [[ProfilePage()]] - code - app/profile/page.tsx
- [[ROLE_MAP]] - code - lib/users/client.ts
- [[UserProfileClient()]] - code - components/profile/UserProfileClient.tsx
- [[UserRole]] - code - lib/users/types.ts
- [[checkExistingSession()]] - code - app/login/page.tsx
- [[createClient()]] - code - lib/supabase/client.ts
- [[getAppUsers()]] - code - lib/users/client.ts
- [[getCurrentAppUser()]] - code - lib/users/client.ts
- [[invalidateCurrentUserCache()]] - code - lib/users/client.ts
- [[loadOrders()_1]] - code - components/rejections/DeclareRejectionModal.tsx
- [[loadUser()]] - code - components/bandsaw/BandSawCuttingClient.tsx
- [[loginpage.tsx]] - code - app/login/page.tsx
- [[mapAppUser()]] - code - lib/users/client.ts
- [[profilepage.tsx]] - code - app/profile/page.tsx
- [[supabaseclient.ts]] - code - lib/supabase/client.ts
- [[useHistory.ts]] - code - hooks/useHistory.ts
- [[usersclient.ts]] - code - lib/users/client.ts

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Authentication__Session_State
SORT file.name ASC
```

## Connections to other communities
- 34 edges to [[_COMMUNITY_Production Entry & Queue Grid]]
- 18 edges to [[_COMMUNITY_Mill Rejections & Hollow Allocation]]
- 16 edges to [[_COMMUNITY_User Roles & Permission Controls]]
- 13 edges to [[_COMMUNITY_Salvage Disposition & Approvals]]
- 12 edges to [[_COMMUNITY_Band Saw Cutting & Multiplier Split]]
- 7 edges to [[_COMMUNITY_Excel Master Import & Ingestion]]
- 7 edges to [[_COMMUNITY_Route Access Guards & Authorization]]
- 6 edges to [[_COMMUNITY_API Route Handlers & Server Endpoints]]
- 6 edges to [[_COMMUNITY_Aging Notification & Alerts]]
- 4 edges to [[_COMMUNITY_Process Routes & Mill Config]]
- 3 edges to [[_COMMUNITY_WIP Stage Balancing & Flow Control]]
- 3 edges to [[_COMMUNITY_App Shell, Navigation & Layout]]
- 3 edges to [[_COMMUNITY_User Management & Mock Fallbacks]]
- 3 edges to [[_COMMUNITY_Hollow Bank Inventory & Diversions]]
- 3 edges to [[_COMMUNITY_Dashboard KPIs & Station Aging]]
- 3 edges to [[_COMMUNITY_Report Tabulation & Data Tables]]
- 3 edges to [[_COMMUNITY_Scrap Generation & Loss Audits]]
- 3 edges to [[_COMMUNITY_Size-Grade WIP Matrix Reports]]
- 3 edges to [[_COMMUNITY_Work Order Tracking & QC History]]
- 3 edges to [[_COMMUNITY_Rolling Plan & Hollow Metrics]]
- 2 edges to [[_COMMUNITY_Daily Planning & PPC Scheduling]]
- 1 edge to [[_COMMUNITY_Production Queue & Plan Enrichment]]
- 1 edge to [[_COMMUNITY_Service Role Security & Backend Auth]]

## Top bridge nodes
- [[createClient()]] - degree 88, connects to 21 communities
- [[supabaseclient.ts]] - degree 39, connects to 21 communities
- [[getCurrentAppUser()]] - degree 15, connects to 5 communities
- [[usersclient.ts]] - degree 18, connects to 3 communities
- [[loginpage.tsx]] - degree 13, connects to 3 communities