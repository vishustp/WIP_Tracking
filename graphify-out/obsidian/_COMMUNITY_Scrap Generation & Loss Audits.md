---
type: community
cohesion: 0.19
members: 21
---

# Scrap Generation & Loss Audits

**Cohesion:** 0.19 - loosely connected
**Members:** 21 nodes

## Members
- [[SCRAP_TYPE_LABELS]] - code - lib/reports/scrapReportHelper.ts
- [[SCRAP_TYPE_OPTIONS]] - code - components/reports/ScrapGenerationReportClient.tsx
- [[STAGE_FILTERS]] - code - components/reports/ScrapGenerationReportClient.tsx
- [[STAGE_NAME_MAP]] - code - lib/reports/scrapReportHelper.ts
- [[ScrapFilterOptions]] - code - lib/reports/scrapReportHelper.ts
- [[ScrapGenerationReportClient()]] - code - components/reports/ScrapGenerationReportClient.tsx
- [[ScrapGenerationReportClient.tsx]] - code - components/reports/ScrapGenerationReportClient.tsx
- [[ScrapRecord]] - code - lib/reports/scrapReportHelper.ts
- [[ScrapReportPage()]] - code - app/reports/scrap/page.tsx
- [[ScrapSourceType]] - code - lib/reports/scrapReportHelper.ts
- [[ScrapSummaryKpis]] - code - lib/reports/scrapReportHelper.ts
- [[StageScrapSummary]] - code - lib/reports/scrapReportHelper.ts
- [[calculateScrapKpis()]] - code - lib/reports/scrapReportHelper.ts
- [[calculateStageScrapSummary()]] - code - lib/reports/scrapReportHelper.ts
- [[extractRejectionReason()]] - code - lib/reports/scrapReportHelper.ts
- [[extractScrapRecordsFromEntries()]] - code - lib/reports/scrapReportHelper.ts
- [[filterScrapRecords()]] - code - lib/reports/scrapReportHelper.ts
- [[fmt()_8]] - code - components/reports/ScrapGenerationReportClient.tsx
- [[generateScrapReportCsv()]] - code - lib/reports/scrapReportHelper.ts
- [[scrappage.tsx]] - code - app/reports/scrap/page.tsx
- [[scrapReportHelper.ts]] - code - lib/reports/scrapReportHelper.ts

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Scrap_Generation__Loss_Audits
SORT file.name ASC
```

## Connections to other communities
- 11 edges to [[_COMMUNITY_Production Entry & Queue Grid]]
- 3 edges to [[_COMMUNITY_Authentication & Session State]]
- 3 edges to [[_COMMUNITY_Production Queue & Plan Enrichment]]
- 2 edges to [[_COMMUNITY_Band Saw Cutting & Multiplier Split]]
- 2 edges to [[_COMMUNITY_API Route Handlers & Server Endpoints]]
- 1 edge to [[_COMMUNITY_Route Access Guards & Authorization]]
- 1 edge to [[_COMMUNITY_Salvage Disposition & Approvals]]

## Top bridge nodes
- [[ScrapGenerationReportClient.tsx]] - degree 23, connects to 4 communities
- [[scrapReportHelper.ts]] - degree 22, connects to 2 communities
- [[extractScrapRecordsFromEntries()]] - degree 6, connects to 2 communities
- [[scrappage.tsx]] - degree 5, connects to 2 communities
- [[ScrapGenerationReportClient()]] - degree 10, connects to 1 community