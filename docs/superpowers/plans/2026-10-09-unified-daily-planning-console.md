# Unified Daily Planning Console Implementation Plan (DB, HT, Finishing & Pilger)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **CRITICAL RULE:** **ALL CHANGES REMAIN LOCAL ON BRANCH `feature/unified-daily-planning` ONLY.** Do **NOT** upload/push to `origin/main` until explicitly tested and authorized by the user.

**Goal:** Build a **Unified Daily Planning Console** (`/daily-plans`) allowing PPC and plant managers to allocate daily shift production targets across **Draw Bench (DB)**, **Heat Treatment (HT)**, **Finishing (Band Saw, VDI, Bundling)**, and **Cold Pilger Mill (PILGER)**, backed by live active stage WIP queues and reflected as highlighted priority targets on shop floor production screens.

---

## 1. Subsystem Architecture & Mill Rules

```
                      ┌────────────────────────────────────────┐
                      │    Unified Daily Planning Console      │
                      │             (/daily-plans)             │
                      └───────────────────┬────────────────────┘
                                          │
            ┌─────────────────────────────┼─────────────────────────────┐
            ▼                             ▼                             ▼
   ┌─────────────────┐           ┌─────────────────┐           ┌─────────────────┐
   │ 01. Draw Bench  │           │ 02. Furnace HT  │           │ 03. Finishing   │
   │ (DB & Pilger)   │           │ (Hollow & Final)│           │ (Cut, VDI, Bdl) │
   └────────┬────────┘           └────────┬────────┘           └────────┬────────┘
            │                             │                             │
            ▼                             ▼                             ▼
   ┌─────────────────┐           ┌─────────────────┐           ┌─────────────────┐
   │ Bench 1, 2, 3   │           │ Furnace 1 & 2   │           │ Band Saw, VDI,  │
   │ Passes & Dims   │           │ Heat Charges    │           │ Bundling Line   │
   └────────┬────────┘           └────────┬────────┘           └────────┬────────┘
            │                             │                             │
            └─────────────────────────────┼─────────────────────────────┘
                                          │
                                          ▼
                      ┌────────────────────────────────────────┐
                      │       Shop Floor Production Entry      │
                      │  ★ TODAY'S TARGET: 28/40 PCS COMPLETED │
                      └────────────────────────────────────────┘
```

### Mill Operating Rules:
1. **WIP-Bounded Planning**:
   - PPC can only schedule work orders with active WIP at that stage:
     $$\text{Available to Plan} \le \text{Preceding Stage OK} - \text{Current Stage OK}$$
2. **Equipment & Batching Specifics**:
   - **Draw Bench (DB)**: Bench selection (`Bench #1`, `Bench #2`, `Bench #3`), planned passes, target pieces (`PCS`), elongated meters (`MTR`), target tonnage (`MT`).
   - **Heat Treatment (HT)**: Furnace selection (`Roller Hearth #1`, `Bogie Hearth #2`), charge/batch number (`Charge No`), grade compatibility, target PCS/MT, soaking cycle/temp.
   - **Finishing Line**: Band Saw cutting pieces, VDI inspection targets, bundling/packaging lots for outgoing dispatch.
   - **Cold Pilger Mill (PILGER)**: Supports the held stainless steel (`SS_STEEL`) route as an alternative cold reduction stage.
3. **Shop Floor Target Reflection**:
   - When an operator opens `/production`, `/band-saw`, or `/vdi`, work orders with active daily plan targets for today appear pinned with a prominent target status pill and progress meter (`Produced / Target PCS`).

---

## 2. File Structure & Responsibilities

| File | Purpose |
|---|---|
| `supabase/migrations/067_create_daily_production_plans.sql` | Supabase schema for `daily_production_plans` table and RLS policies |
| `types/dailyPlanning.ts` | Domain TypeScript interfaces for daily plans, station targets, and shift summaries |
| `lib/planning/dailyPlanningHelper.ts` | Pure business logic: queue filtering, metric calculations, CSV building, target progress |
| `app/api/daily-plans/route.ts` | Next.js API route for CRUD operations on daily production plans |
| `components/planning/DailyPlanningConsoleClient.tsx` | Full Impeccable console UI with date/shift switcher, 3 coordinated station tabs, target entry modals, and compliance summary |
| `app/daily-plans/page.tsx` | Route entry page with `RouteAccessGuard` |
| `components/AppShell.tsx` | Navigation link entry under `PLANNING` section |
| `components/production/ProductionToolbar.tsx` | Daily plan active filter / target indicator toggle |
| `components/production/ProductionQueueTable.tsx` | Target progress badge for scheduled work orders |
| `tests/daily-planning.test.ts` | Comprehensive Vitest suite for daily plan validation, calculations, and state management |

---

## 3. Implementation Tasks

### Task 1: Database Migration for `daily_production_plans`

**Files:**
- Create: `supabase/migrations/067_create_daily_production_plans.sql`

- [ ] **Step 1: Draft migration SQL**
  - Table `daily_production_plans`:
    - `id` (uuid, primary key, default `gen_random_uuid()`)
    - `plan_date` (date, not null)
    - `shift` (text, not null, check in `'ALL_DAY', 'SHIFT_A', 'SHIFT_B', 'SHIFT_C'`)
    - `work_center` (text, not null, check in `'DRAW', 'PILGER', 'HOLLOW_HEAT_TREATMENT', 'HEAT_TREATMENT', 'BAND_SAW', 'VDI', 'FINISHING'`)
    - `work_order_id` (uuid, references `public.work_orders(id)`)
    - `target_pcs` (integer, not null, default 0)
    - `target_mtr` (numeric(12,2), not null, default 0)
    - `target_mt` (numeric(12,3), not null, default 0)
    - `machine_id` (text, nullable — e.g. "Draw Bench #1", "Furnace #2")
    - `charge_no` (text, nullable — for Heat Treatment charges)
    - `pass_no` (text, nullable — for Draw Bench pass info)
    - `priority_rank` (integer, default 1)
    - `notes` (text, nullable)
    - `status` (text, default `'PLANNED'`, check in `'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'`)
    - `created_by` (text, nullable)
    - `created_at` (timestamptz, default `now()`)
    - `updated_at` (timestamptz, default `now()`)
  - Create indexes on `(plan_date, work_center)`, `(work_order_id)`, and `(status)`.
  - Enable RLS with public/authenticated read and write policies matching existing tables.

---

### Task 2: Core Domain Types & Pure Helper Functions

**Files:**
- Create: `types/dailyPlanning.ts`
- Create: `lib/planning/dailyPlanningHelper.ts`
- Create: `tests/daily-planning.test.ts`

- [ ] **Step 1: Write failing unit test in `tests/daily-planning.test.ts`**
  - Test calculation of planned vs actual compliance percentage.
  - Test filtering of active queue items eligible for stage planning.
  - Test grouping of furnace charges by steel grade.
- [ ] **Step 2: Define TypeScript models in `types/dailyPlanning.ts`**
  - `DailyPlanRecord`, `DailyPlanShift`, `DailyPlanWorkCenter`, `DailyPlanTargetProgress`, `DailyPlanStationSummary`.
- [ ] **Step 3: Implement pure helper functions in `lib/planning/dailyPlanningHelper.ts`**
  - `calculatePlanCompliance(target, actual)`
  - `groupFurnaceChargesByGrade(items)`
  - `buildDailyPlanCsv(plans, date, shift)`
  - `calculateStationPlannedTotals(plans)`
- [ ] **Step 4: Run Vitest to verify all tests pass**
  - Run: `npx vitest run tests/daily-planning.test.ts`

---

### Task 3: Backend API Route (`/api/daily-plans`)

**Files:**
- Create: `app/api/daily-plans/route.ts`

- [ ] **Step 1: Implement `GET` handler**
  - Accepts `date`, `shift`, and optional `work_center`.
  - Joins with `work_orders` to fetch work order metadata (size, grade, customer, order qty).
  - Joins with today's `production_entries` to calculate live `actual_pcs`, `actual_mtr`, `actual_mt`.
  - Returns plans array with calculated progress.
- [ ] **Step 2: Implement `POST` handler**
  - Upserts or inserts daily production plan records.
  - Validates `target_pcs > 0` and valid `work_center`.
- [ ] **Step 3: Implement `DELETE` handler**
  - Deletes a daily plan record by `id`.

---

### Task 4: Unified Daily Planning Console Component & Page

**Files:**
- Create: `components/planning/DailyPlanningConsoleClient.tsx`
- Create: `app/daily-plans/page.tsx`
- Modify: `components/AppShell.tsx`

- [ ] **Step 1: Build `DailyPlanningConsoleClient.tsx` using Impeccable industrial standards**
  - **Top Bar**: Date picker, shift switcher (`General / All Day`, `Shift A`, `Shift B`, `Shift C`), export CSV, print button.
  - **Station Track**: Tabs for:
    - `01. Draw Bench & Pilger`
    - `02. Heat Treatment Furnaces`
    - `03. Finishing Line (Band Saw, VDI, Bundling)`
  - **Live WIP Queue Drawer**: Shows available pipes at selected station, with 1-click "Add to Today's Plan" button.
  - **Scheduled Target Grid**:
    - Machine / Furnace assignment dropdown or text.
    - Target PCS, MTR, MT input fields with instant mass conservation calculation.
    - Charge No / Pass info.
    - Live Progress Bar: `Actual Produced vs Planned Target`.
  - **Station Summary Ticker**: Total Planned MT, Total Planned PCS, and current station fulfillment rate.
- [ ] **Step 2: Create `app/daily-plans/page.tsx`**
  - Wraps client component in `RouteAccessGuard`.
- [ ] **Step 3: Update `components/AppShell.tsx`**
  - Add `{ href: '/daily-plans', label: 'Daily Planning', icon: CalendarDays }` to the `PLANNING` section.

---

### Task 5: Shop Floor Integration in Production Entry Screens

**Files:**
- Modify: `components/production/ProductionQueueTable.tsx`
- Modify: `components/production/ProductionToolbar.tsx`

- [ ] **Step 1: Add "Today's Target" badge in `ProductionQueueTable.tsx`**
  - When a work order has a daily plan target for today:
    - Displays a prominent `TODAY'S TARGET: X PCS` badge.
    - Displays a progress bar showing completion percentage.
  - Moves planned work orders to the top of the queue for the active shift.
- [ ] **Step 2: Add quick filter toggle in `ProductionToolbar.tsx`**
  - "Show Today's Planned Targets Only" quick filter chip.

---

### Task 6: Stainless Steel (`SS_STEEL`) & `PILGER` Integration Verification

**Files:**
- Verify: `components/planning/DailyPlanningConsoleClient.tsx`
- Verify: `lib/wipReconciliation.ts`
- Verify: `hooks/useQueue.ts`

- [ ] **Step 1: Verify `PILGER` option in Draw Bench tab**
  - Ensure planner can allocate Cold Pilger Mill targets for stainless steel (`SS_STEEL`) work orders.
- [ ] **Step 2: Verify queue feeder for Pilger**
  - Confirm available pieces compute correctly as `Rolling HTC OK - Pilger OK`.

---

### Task 7: Comprehensive Verification & Test Suite

**Files:**
- Run: `tests/daily-planning.test.ts`
- Run: `npm test`
- Run: `npx tsc --noEmit`

- [ ] **Step 1: Run all unit tests**
  - Verify all 26+ test files and tests pass.
- [ ] **Step 2: Run TypeScript compile verification**
  - Verify zero TypeScript compiler errors.
- [ ] **Step 3: Run Impeccable UI check**
  - Verify contrast, typography, and responsive layouts.

---

### Task 8: Local Testing Review (NO GIT PUSH)

- [ ] **Verify git status on `feature/unified-daily-planning`**
- [ ] **Ensure `origin/main` remains untouched**
- [ ] **Present local preview and testing instructions to user**
