---
type: community
cohesion: 0.21
members: 15
---

# WIP Stage Balancing & Flow Control

**Cohesion:** 0.21 - loosely connected
**Members:** 15 nodes

## Members
- [[FormAccessBanner()]] - code - components/common/FormAccessBanner.tsx
- [[FormAccessBanner.tsx]] - code - components/common/FormAccessBanner.tsx
- [[FormAccessBannerProps]] - code - components/common/FormAccessBanner.tsx
- [[FormAccessResult]] - code - lib/permissions.ts
- [[Skeleton()]] - code - components/ui/Skeleton.tsx
- [[Skeleton.tsx]] - code - components/ui/Skeleton.tsx
- [[SkeletonProps]] - code - components/ui/Skeleton.tsx
- [[TableRowSkeleton()]] - code - components/ui/Skeleton.tsx
- [[WO]] - code - app/work-orders/page.tsx
- [[WipStage]] - code - app/work-orders/page.tsx
- [[WorkOrderFormData]] - code - lib/productionUtils.ts
- [[WorkOrders()]] - code - app/work-orders/page.tsx
- [[buildWorkOrderPayload()]] - code - lib/productionUtils.ts
- [[getFormAccess()]] - code - lib/permissions.ts
- [[work-orderspage.tsx]] - code - app/work-orders/page.tsx

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/WIP_Stage_Balancing__Flow_Control
SORT file.name ASC
```

## Connections to other communities
- 27 edges to [[_COMMUNITY_Production Entry & Queue Grid]]
- 9 edges to [[_COMMUNITY_Route Access Guards & Authorization]]
- 7 edges to [[_COMMUNITY_Rolling Plan & Hollow Metrics]]
- 6 edges to [[_COMMUNITY_Excel Master Import & Ingestion]]
- 5 edges to [[_COMMUNITY_API Route Handlers & Server Endpoints]]
- 5 edges to [[_COMMUNITY_Hollow Bank Inventory & Diversions]]
- 4 edges to [[_COMMUNITY_User Roles & Permission Controls]]
- 3 edges to [[_COMMUNITY_Work Order Tracking & QC History]]
- 3 edges to [[_COMMUNITY_Salvage Disposition & Approvals]]
- 3 edges to [[_COMMUNITY_Authentication & Session State]]
- 2 edges to [[_COMMUNITY_Band Saw Cutting & Multiplier Split]]
- 2 edges to [[_COMMUNITY_User Management & Mock Fallbacks]]

## Top bridge nodes
- [[work-orderspage.tsx]] - degree 32, connects to 9 communities
- [[WorkOrders()]] - degree 15, connects to 7 communities
- [[getFormAccess()]] - degree 15, connects to 7 communities
- [[FormAccessBanner.tsx]] - degree 13, connects to 7 communities
- [[FormAccessBanner()]] - degree 13, connects to 6 communities