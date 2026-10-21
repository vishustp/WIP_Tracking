# Graph Report - WIP_Tracking  (2026-10-17)

## Corpus Check
- 151 files · ~284,272 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 786 nodes · 2571 edges · 30 communities
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Production Entry & Queue Grid
- API Route Handlers & Server Endpoints
- Mill Rejections & Hollow Allocation
- Salvage Disposition & Approvals
- Excel Master Import & Ingestion
- Band Saw Cutting & Multiplier Split
- Dashboard KPIs & Station Aging
- Daily Planning & PPC Scheduling
- Aging Notification & Alerts
- Rolling Plan & Hollow Metrics
- Work Order Tracking & QC History
- Production Queue & Plan Enrichment
- Scrap Generation & Loss Audits
- User Roles & Permission Controls
- Executive WIP Matrix & Summary Caches
- Authentication & Session State
- Route Access Guards & Authorization
- Production Recording & Mutations
- Service Role Security & Backend Auth
- App Shell, Navigation & Layout
- WIP Stage Balancing & Flow Control
- Size-Grade WIP Matrix Reports
- Hollow Bank Inventory & Diversions
- Report Tabulation & Data Tables
- Admin Authentication Verification
- Feeder Balance Calculation & Validation
- Process Routes & Mill Config
- User Management & Mock Fallbacks
- AI Spec Lookup & Metallurgical Standards
- Production Log Reversals & Deletion

## God Nodes (most connected - your core abstractions)
1. `createClient()` - 88 edges
2. `RouteAccessGuard()` - 52 edges
3. `mtFromMtr()` - 45 edges
4. `Button()` - 39 edges
5. `createAdminClient()` - 37 edges
6. `extractPcsFromRemarks()` - 33 edges
7. `ProductionEntryGrid()` - 32 edges
8. `fmt()` - 32 edges
9. `usePermissions()` - 31 edges
10. `StageCode` - 29 edges

## Surprising Connections (you probably didn't know these)
- `POST()` --calls--> `createAdminClient()`  [EXTRACTED]
  app/api/admin/reset-factory/route.ts → lib/supabase/admin.ts
- `WorkCenterTabConfig` --references--> `StageCode`  [EXTRACTED]
  components/excel/ExcelImporter.tsx → types/index.ts
- `loadUser()` --calls--> `getCurrentAppUser()`  [EXTRACTED]
  components/qc/QcInspectionClient.tsx → lib/users/client.ts
- `loadGrades()` --calls--> `createClient()`  [EXTRACTED]
  components/reports/MillRejectionReportClient.tsx → lib/supabase/client.ts
- `loadData()` --calls--> `createClient()`  [EXTRACTED]
  components/settings/SettingsClient.tsx → lib/supabase/client.ts

## Import Cycles
- None detected.

## Communities (30 total, 0 thin omitted)

### Community 0 - "Production Entry & Queue Grid"
Cohesion: 0.05
Nodes (97): ProductionPage(), BandSawCuttingClient(), BandSawEditModal(), BandSawEditModalProps, CutRowItem, BandSawCuttingModal(), BandSawCuttingModalProps, BundlingCampaignModal() (+89 more)

### Community 1 - "API Route Handlers & Server Endpoints"
Cohesion: 0.11
Nodes (40): POST(), Page(), metadata, TrainingReportPage(), DepartmentKey, DEPARTMENTS, DepartmentTrainingManualClient(), DeptTab (+32 more)

### Community 2 - "Mill Rejections & Hollow Allocation"
Cohesion: 0.08
Nodes (44): Page(), MillRejectionReportPage(), AllocateHollowModal(), handleSubmit(), loadOrders(), Props, TARGET_STAGES, DivertInitialValues (+36 more)

### Community 3 - "Salvage Disposition & Approvals"
Cohesion: 0.11
Nodes (41): RejectionsPage(), SalvageRejectionReportPage(), ApproveRejectionModal(), ApproveRejectionModalProps, DeclareRejectionModal(), DeclareRejectionModalProps, WorkOrderOption, fmt() (+33 more)

### Community 4 - "Excel Master Import & Ingestion"
Cohesion: 0.08
Nodes (33): ExcelImportPage(), Page(), Page(), clean(), ExcelImporter(), executeImport(), findColumn(), normalizeHeader() (+25 more)

### Community 5 - "Band Saw Cutting & Multiplier Split"
Cohesion: 0.08
Nodes (33): SpecMasterPage(), BandSawPage(), metadata, metadata, QcPage(), metadata, QcVdiPage(), Page() (+25 more)

### Community 6 - "Dashboard KPIs & Station Aging"
Cohesion: 0.10
Nodes (29): metadata, OrderPriorityPage(), AgingItem, CANONICAL_WIP_WORK_CENTERS, DashboardClient(), formatNum(), KPI, PendingRow (+21 more)

### Community 7 - "Daily Planning & PPC Scheduling"
Cohesion: 0.16
Nodes (23): DailyPlanningPage(), metadata, DailyPlanningConsoleClient(), fmt(), getStageBadgeInfo(), STATION_GROUPS, StationGroup, buildDailyPlanCsv() (+15 more)

### Community 8 - "Aging Notification & Alerts"
Cohesion: 0.17
Nodes (24): AgingPage(), metadata, AgingAlert, AgingNotificationBell(), AgingReportClient(), fmt(), AGING_STAGES, AgingKpiSummary (+16 more)

### Community 9 - "Rolling Plan & Hollow Metrics"
Cohesion: 0.12
Nodes (18): Page(), calcHollowMetrics(), ChildOrderEntry, ComputedGroupSpecs, computeGroupSpecs(), createDefaultGroup(), fmt(), formatFinalSizeLength() (+10 more)

### Community 10 - "Work Order Tracking & QC History"
Cohesion: 0.14
Nodes (17): metadata, WorkOrderTrackingPage(), FinishingQcModalProps, ProductionLog, RollingPlan, STAGES_ORDER, StageTrackingMetric, StageWipRow (+9 more)

### Community 11 - "Production Queue & Plan Enrichment"
Cohesion: 0.20
Nodes (16): GET(), dynamic, enrichWithDailyPlans(), GET(), isHollowBankOrder(), revalidate, POST(), POST() (+8 more)

### Community 12 - "Scrap Generation & Loss Audits"
Cohesion: 0.19
Nodes (18): ScrapReportPage(), fmt(), SCRAP_TYPE_OPTIONS, ScrapGenerationReportClient(), STAGE_FILTERS, calculateScrapKpis(), calculateStageScrapSummary(), extractRejectionReason() (+10 more)

### Community 13 - "User Roles & Permission Controls"
Cohesion: 0.19
Nodes (17): DEFAULT_STAGE_OPTIONS, GROUP_OPTIONS, ROLE_OPTIONS, WORK_CENTER_OPTIONS, UserPermissionsModalProps, ROLE_PERMISSIONS, GroupConfig, MODULE_DEFINITIONS (+9 more)

### Community 14 - "Executive WIP Matrix & Summary Caches"
Cohesion: 0.18
Nodes (15): Dashboard(), DashboardCachePayload, dynamic, fetchWipSummary(), buildCampaignHierarchyMaps(), CampaignHierarchyMaps, MotherHollowInfo, PrepareCampaignWipParams (+7 more)

### Community 15 - "Authentication & Session State"
Cohesion: 0.19
Nodes (13): LoginPage(), checkExistingSession(), ProfilePage(), loadUser(), UserProfileClient(), loadOrders(), createClient(), ALL_STAGES (+5 more)

### Community 16 - "Route Access Guards & Authorization"
Cohesion: 0.22
Nodes (17): RouteAccessGuardProps, canEditProfile(), canSwitchProfile(), checkCanCreate(), checkCanDelete(), checkCanEdit(), checkCanManagePlans(), checkCanManageUsers() (+9 more)

### Community 17 - "Production Recording & Mutations"
Cohesion: 0.18
Nodes (14): DELETE(), dynamic, GET(), POST(), POST(), ChildWoPayload, CreateMultiWoRollingPlanPayload, DELETE() (+6 more)

### Community 18 - "Service Role Security & Backend Auth"
Cohesion: 0.20
Nodes (8): POST(), POST(), getServiceRoleKey(), getSupabaseUrl(), readEnvVarFromFile(), AuthContext, getAuthenticatedUser(), requireAdmin()

### Community 19 - "App Shell, Navigation & Layout"
Cohesion: 0.17
Nodes (9): inter, metadata, RootLayout(), AppShell(), AppTheme, navSections, SearchResultItem, THEMES (+1 more)

### Community 20 - "WIP Stage Balancing & Flow Control"
Cohesion: 0.21
Nodes (12): WipStage, WO, WorkOrders(), FormAccessBanner(), FormAccessBannerProps, Skeleton(), SkeletonProps, TableRowSkeleton() (+4 more)

### Community 21 - "Size-Grade WIP Matrix Reports"
Cohesion: 0.22
Nodes (11): metadata, WipPage(), ContributingOrder, fmt(), getOrderStatusBadge(), getRouteBadgeClass(), SizeGradeGroup, SizeGradeWipReportClient() (+3 more)

### Community 22 - "Hollow Bank Inventory & Diversions"
Cohesion: 0.23
Nodes (10): Page(), DiversionForm(), DiversionPlanItem, fmt(), getWcShortName(), Route, WipViewRow, WO (+2 more)

### Community 23 - "Report Tabulation & Data Tables"
Cohesion: 0.24
Nodes (6): Page(), DataReport(), Props, STANDARD_STATUSES, ColumnDef, pendingOrderColumns

### Community 24 - "Admin Authentication Verification"
Cohesion: 0.53
Nodes (9): AdminAuthResult, bad(), DELETE(), GET(), getAuthenticatedAdmin(), PATCH(), POST(), PUT() (+1 more)

### Community 25 - "Feeder Balance Calculation & Validation"
Cohesion: 0.31
Nodes (7): POST(), computeFeederBalanceForWorkOrder(), FeederBalance, ProductionLogRecord, QcInspectionRecord, RollingPlanRecord, WorkOrderSummary

### Community 26 - "Process Routes & Mill Config"
Cohesion: 0.38
Nodes (5): Page(), ProcessRoute, ProcessStage, SettingsClient(), loadData()

### Community 27 - "User Management & Mock Fallbacks"
Cohesion: 0.47
Nodes (5): AdminPage(), AdminControlPanelClient(), mapAppUserToMockUser(), UserPermissionsModal(), getDefaultPermissions()

### Community 28 - "AI Spec Lookup & Metallurgical Standards"
Cohesion: 0.60
Nodes (4): POST(), FetchedSpecData, findMatchingStandard(), METALLURGICAL_STANDARDS_DB

### Community 29 - "Production Log Reversals & Deletion"
Cohesion: 0.83
Nodes (3): DELETE(), handleDelete(), POST()

## Knowledge Gaps
- **1 isolated node(s):** `RFC-4180`
  These have ≤1 connection - possible missing edges. (Counts symbols only; 188 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createClient()` connect `Authentication & Session State` to `Production Entry & Queue Grid`, `API Route Handlers & Server Endpoints`, `Mill Rejections & Hollow Allocation`, `Salvage Disposition & Approvals`, `Excel Master Import & Ingestion`, `Band Saw Cutting & Multiplier Split`, `Dashboard KPIs & Station Aging`, `Daily Planning & PPC Scheduling`, `Aging Notification & Alerts`, `Rolling Plan & Hollow Metrics`, `Work Order Tracking & QC History`, `Scrap Generation & Loss Audits`, `User Roles & Permission Controls`, `Route Access Guards & Authorization`, `App Shell, Navigation & Layout`, `WIP Stage Balancing & Flow Control`, `Size-Grade WIP Matrix Reports`, `Hollow Bank Inventory & Diversions`, `Report Tabulation & Data Tables`, `Process Routes & Mill Config`, `User Management & Mock Fallbacks`?**
  _High betweenness centrality (0.178) - this node is a cross-community bridge._
- **What connects `RFC-4180` to the rest of the system?**
  _1 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Production Entry & Queue Grid` be split into smaller, more focused modules?**
  _Cohesion score 0.050327966607036374 - nodes in this community are weakly interconnected._
- **Why does `RouteAccessGuard()` connect `Band Saw Cutting & Multiplier Split` to `Production Entry & Queue Grid`, `API Route Handlers & Server Endpoints`, `Mill Rejections & Hollow Allocation`, `Salvage Disposition & Approvals`, `Excel Master Import & Ingestion`, `Dashboard KPIs & Station Aging`, `Daily Planning & PPC Scheduling`, `Rolling Plan & Hollow Metrics`, `Scrap Generation & Loss Audits`, `Route Access Guards & Authorization`, `WIP Stage Balancing & Flow Control`, `Hollow Bank Inventory & Diversions`, `Process Routes & Mill Config`, `User Management & Mock Fallbacks`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **Should `API Route Handlers & Server Endpoints` be split into smaller, more focused modules?**
  _Cohesion score 0.11046171829339567 - nodes in this community are weakly interconnected._
- **Why does `mtFromMtr()` connect `Production Entry & Queue Grid` to `Band Saw Cutting & Multiplier Split`, `Dashboard KPIs & Station Aging`, `Daily Planning & PPC Scheduling`, `Work Order Tracking & QC History`, `Production Queue & Plan Enrichment`, `Scrap Generation & Loss Audits`, `Executive WIP Matrix & Summary Caches`, `Authentication & Session State`, `Production Recording & Mutations`, `WIP Stage Balancing & Flow Control`, `Size-Grade WIP Matrix Reports`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **Should `Mill Rejections & Hollow Allocation` be split into smaller, more focused modules?**
  _Cohesion score 0.08315863032844165 - nodes in this community are weakly interconnected._