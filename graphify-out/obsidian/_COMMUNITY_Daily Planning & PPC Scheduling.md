---
type: community
cohesion: 0.16
members: 28
---

# Daily Planning & PPC Scheduling

**Cohesion:** 0.16 - loosely connected
**Members:** 28 nodes

## Members
- [[DailyPlanItemWithWorkOrder]] - code - types/dailyPlanning.ts
- [[DailyPlanRecord]] - code - types/dailyPlanning.ts
- [[DailyPlanShift]] - code - types/dailyPlanning.ts
- [[DailyPlanStatus]] - code - types/dailyPlanning.ts
- [[DailyPlanWorkCenter]] - code - types/dailyPlanning.ts
- [[DailyPlanningConsoleClient()]] - code - components/planning/DailyPlanningConsoleClient.tsx
- [[DailyPlanningConsoleClient.tsx]] - code - components/planning/DailyPlanningConsoleClient.tsx
- [[DailyPlanningPage()]] - code - app/daily-plans/page.tsx
- [[MachinePresetOption]] - code - types/dailyPlanning.ts
- [[SHIFT_LABELS]] - code - lib/planning/dailyPlanningHelper.ts
- [[STATION_GROUPS]] - code - components/planning/DailyPlanningConsoleClient.tsx
- [[STATION_LABELS]] - code - lib/planning/dailyPlanningHelper.ts
- [[STATION_MACHINE_PRESETS]] - code - lib/planning/dailyPlanningHelper.ts
- [[StationDailySummary]] - code - types/dailyPlanning.ts
- [[StationGroup]] - code - components/planning/DailyPlanningConsoleClient.tsx
- [[buildDailyPlanCsv()]] - code - lib/planning/dailyPlanningHelper.ts
- [[calculatePlanCompliance()]] - code - lib/planning/dailyPlanningHelper.ts
- [[calculateStationPlannedTotals()]] - code - lib/planning/dailyPlanningHelper.ts
- [[daily-planspage.tsx]] - code - app/daily-plans/page.tsx
- [[dailyPlanning.ts]] - code - types/dailyPlanning.ts
- [[dailyPlanningHelper.ts]] - code - lib/planning/dailyPlanningHelper.ts
- [[filterEligibleWipQueue()]] - code - lib/planning/dailyPlanningHelper.ts
- [[filterUnplannedWipQueue()]] - code - lib/planning/dailyPlanningHelper.ts
- [[fmt()_1]] - code - components/planning/DailyPlanningConsoleClient.tsx
- [[getStageBadgeInfo()]] - code - components/planning/DailyPlanningConsoleClient.tsx
- [[groupFurnaceChargesByGrade()]] - code - lib/planning/dailyPlanningHelper.ts
- [[isWorkOrderPlanned()]] - code - lib/planning/dailyPlanningHelper.ts
- [[metadata_1]] - code - app/daily-plans/page.tsx

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Daily_Planning__PPC_Scheduling
SORT file.name ASC
```

## Connections to other communities
- 8 edges to [[_COMMUNITY_Production Entry & Queue Grid]]
- 5 edges to [[_COMMUNITY_Production Recording & Mutations]]
- 3 edges to [[_COMMUNITY_API Route Handlers & Server Endpoints]]
- 3 edges to [[_COMMUNITY_Excel Master Import & Ingestion]]
- 2 edges to [[_COMMUNITY_Band Saw Cutting & Multiplier Split]]
- 2 edges to [[_COMMUNITY_Authentication & Session State]]
- 1 edge to [[_COMMUNITY_Route Access Guards & Authorization]]
- 1 edge to [[_COMMUNITY_Salvage Disposition & Approvals]]

## Top bridge nodes
- [[DailyPlanningConsoleClient.tsx]] - degree 29, connects to 4 communities
- [[dailyPlanning.ts]] - degree 13, connects to 3 communities
- [[daily-planspage.tsx]] - degree 7, connects to 3 communities
- [[DailyPlanItemWithWorkOrder]] - degree 6, connects to 2 communities
- [[dailyPlanningHelper.ts]] - degree 18, connects to 1 community