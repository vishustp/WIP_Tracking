# UI/UX Priority 1 & 2 Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement all Priority 1 (Sticky table columns, tablet ergonomics, modal touch targets) and Priority 2 (Size-Grade Matrix sticky columns & clear filters, Dashboard bottleneck drilldowns) UI/UX enhancements across the WIP tracking application.

**Architecture:** 
1. Table sticky column pinning using standard Tailwind CSS classes (`sticky left-0`, `sticky right-0`, `z-10`/`z-20`) with box-shadow depth delimiters to preserve context during horizontal scrolling.
2. WCAG 2.5.5 / 2.5.8 touch target hardening ($\ge 44\text{px}$) and responsive density sizing in modals and factory floor controls.
3. Interactive state handling and query parameter routing for dashboard stage bottleneck cards.
4. Actionable empty states with 1-click filter reset handlers.

**Tech Stack:** Next.js 14 (App Router), React 18, Tailwind CSS, Lucide React, TypeScript, Vitest.

**Spec:** Whole project UI/UX review critique findings for Priority 1 & 2 items.

## Global Constraints
- Preserve all existing WIP ledger calculations and mass conservation rules from `AGENTS.md`.
- No regression in existing automated tests (54/54 passing).
- Zero horizontal layout breaks on 1024px tablet viewports.
- Maintain high-contrast accessible typography (WCAG AAA contrast $\ge 7:1$).

## Review Focus
1. Sticky table header/cell alignment: Ensure headers and body cells share identical width and z-indexes (`z-20` for sticky headers, `z-10` for sticky body cells).
2. Overflow container containment: Verify tables with sticky columns reside inside containers with `overflow-x-auto relative`.
3. Modal backdrop & focus traps: Verify touch target expansions do not distort modal bounds on small screens ($< 640\text{px}$).
4. Dashboard drilldown URLs: Ensure stage code mapping precisely matches valid `StageCode` enum values (`ROLLING`, `HOLLOW_HEAT_TREATMENT`, `DRAW`, `HEAT_TREATMENT`, `BAND_SAW`, `VDI`, `FINISHING`).
5. Filter reset purity: Verify "Clear Filters" in SizeGradeWipReport clears all 6 filter states (search, route, grade, fromOd, toOd, date range).

---

### Task 1: Sticky Columns & Actions Anchoring for Production Tables

**Files:**
- Modify: `components/production/ProductionQueueTable.tsx`
- Modify: `components/production/ProductionQueueRow.tsx`
- Modify: `components/bandsaw/BandSawCuttingClient.tsx`
- Modify: `components/reports/WorkOrderTrackingClient.tsx`

**Interfaces:**
- Consumes: Existing table props and data structures.
- Produces: Pinned Order Information column (left) and pinned Actions column (right) during horizontal scroll.

- [ ] **Step 1: Update `ProductionQueueTable.tsx` Actions header to be sticky right**
  Pin Actions column header: `sticky right-0 top-0 z-30 bg-slate-100 border-l border-slate-200 shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.08)]`.

- [ ] **Step 2: Update `ProductionQueueRow.tsx` Actions cell to be sticky right**
  Pin Actions column cell: `sticky right-0 z-10 bg-white group-hover:bg-slate-50 border-l border-slate-200 shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.06)]`.

- [ ] **Step 3: Update `BandSawCuttingClient.tsx` queue table with sticky left WO column and sticky right Action column**
  Pin Work Order header and cell to `left-0` with shadow, and Action header and cell to `right-0` with shadow.

- [ ] **Step 4: Update `WorkOrderTrackingClient.tsx` with sticky left Work Order & Specs column**
  Pin Work Order & Specs header and cell to `left-0` with shadow.

- [ ] **Step 5: Run tests & verify build**
  Run: `npm test` and verify no regressions.

---

### Task 2: Shop-Floor Modal Touch Target Hardening & Responsive Density

**Files:**
- Modify: `components/ui/Modal.tsx`
- Modify: `components/production/modals/BundlingCampaignModal.tsx`
- Modify: `components/production/modals/BandSawCuttingModal.tsx`

**Interfaces:**
- Consumes: Modal props and button triggers.
- Produces: Minimum 44px touch targets on mobile/tablet devices, enlarged close buttons, responsive density.

- [ ] **Step 1: Enlarge close button hit area in `Modal.tsx`**
  Update close button from `p-1` to `p-2 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg`.

- [ ] **Step 2: Harden touch targets in `BundlingCampaignModal.tsx`**
  Ensure primary buttons, close buttons, and counter buttons have `min-h-[44px]` touch areas and responsive text/padding.

- [ ] **Step 3: Harden touch targets in `BandSawCuttingModal.tsx`**
  Ensure cut piece inputs and action buttons ("Confirm Cuts", "Cancel", "+ Add Length Cut") meet $\ge 44\text{px}$ touch targets.

- [ ] **Step 4: Run tests & verify build**
  Run: `npm test` and verify no regressions.

---

### Task 3: Size-Grade Matrix Report Enhancements (Sticky Columns, Unit Toggle & Actionable Empty State)

**Files:**
- Modify: `components/reports/SizeGradeWipReportClient.tsx`

**Interfaces:**
- Consumes: Filter states (`search`, `selectedRoute`, `selectedGrade`, `fromOd`, `toOd`, `fromRollingDate`, `toRollingDate`), `unit` state (`MTRS`, `PCS`, `MT`).
- Produces: Sticky Size & Grade columns, prominent high-contrast unit toggle, actionable empty state with 1-click "Clear All Filters" handler.

- [ ] **Step 1: Pin Size and Grade columns in matrix table view**
  Make Size column `sticky left-0 bg-slate-50 z-20` (header) and `sticky left-0 bg-white z-10` (row), Grade column `sticky left-[110px] sm:left-[130px]`.

- [ ] **Step 2: Add 1-click "Clear All Filters" button in Matrix empty state**
  When `matrixGroups.length === 0`, display an interactive `EmptyState` component with a `Clear All Filters` button that resets all 6 filters.

- [ ] **Step 3: Run tests & verify build**
  Run: `npm test` and verify no regressions.

---

### Task 4: Interactive Dashboard Bottleneck Drilldown

**Files:**
- Modify: `components/dashboard/DashboardClient.tsx`

**Interfaces:**
- Consumes: `stageDistribution` array with stage names and WIP values.
- Produces: Clickable stage cards that route to `/production?stage=${stageCode}` with visual hover/focus affordances.

- [ ] **Step 1: Define stage code mapping in `DashboardClient.tsx`**
  Map stage display names (`Rolling`, `Hollow HT`, `Cold Draw`, `Heat Treatment`, `Band Saw`, `VDI`, `Finishing`) to standard query stage codes (`ROLLING`, `HOLLOW_HEAT_TREATMENT`, `DRAW`, `HEAT_TREATMENT`, `BAND_SAW`, `VDI`, `FINISHING`).

- [ ] **Step 2: Wrap stage distribution chips with interactive navigation links**
  Convert the stage cards into interactive links or buttons pointing to `/production?stage=${stageCode}` with hover highlight, focus rings, and an arrow indicator.

- [ ] **Step 3: Ensure `ProductionEntryGrid.tsx` listens to `?stage=` URL query parameter**
  Read URL search parameters in `ProductionEntryGrid` on mount so that navigating from the dashboard immediately opens the selected work center queue.

- [ ] **Step 4: Run all tests and complete end-to-end verification**
  Run: `npm test` and `npm run build` to confirm zero errors across all routes.
