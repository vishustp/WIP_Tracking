# Add SS Steel Route & Cold Pilger Mill Work Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **NOTE: All changes must remain LOCAL only for testing.**

**Goal:** Implement the new **`SS_STEEL`** (**Stainless Steel**) manufacturing route and dedicated **`PILGER`** (**Cold Pilger Mill**) work center on the local environment for testing, with full stage-to-stage WIP ledger balancing, elongation physics, permissions, and report tracking.

**Route Sequence:**
`ROLLING` (1) $\rightarrow$ `PILGER` (2) $\rightarrow$ `HEAT_TREATMENT` (3) $\rightarrow$ `BAND_SAW` (4) $\rightarrow$ `VDI` (5) $\rightarrow$ `FINISHING` (6)

**WIP Feeder Balancing Rules:**
- **Pilger Active WIP**: $\text{Rolling HTC OK} - \text{Pilger OK}$
- **Heat Treatment Active WIP**: $\text{Pilger OK} - \text{Heat Treatment OK}$
- **Band Saw Active WIP**: $\text{Heat Treatment OK} - \text{Band Saw OK}$
- **VDI Active WIP**: $\text{Band Saw Cut OK} - \text{VDI Inspected OK}$
- **Finishing Active WIP**: $\text{VDI Passed OK} - \text{Finishing Bundled OK}$

---

### Task 1: Database Migration for `PILGER` Stage & `SS_STEEL` Route

**Files:**
- Create: `supabase/migrations/063_add_ss_steel_route_and_pilger_stage.sql`
- Test: `tests/tracking-routing.test.ts`

- [ ] **Step 1: Write tests in `tests/tracking-routing.test.ts`**
Add unit tests verifying `SS_STEEL` route sequence (ROLLING $\rightarrow$ PILGER $\rightarrow$ HEAT_TREATMENT $\rightarrow$ BAND_SAW $\rightarrow$ VDI $\rightarrow$ FINISHING) and feeder dependencies.

- [ ] **Step 2: Create migration `063_add_ss_steel_route_and_pilger_stage.sql`**
Insert `PILGER` into `public.process_stages`, `SS_STEEL` into `public.process_routes`, and wire the 6-stage sequence into `public.route_stages`.

- [ ] **Step 3: Run Vitest to check test status**
Run: `npx vitest run tests/tracking-routing.test.ts`

---

### Task 2: Core TypeScript Domain Models & Permissions

**Files:**
- Modify: `types/index.ts`
- Modify: `lib/users/types.ts`
- Modify: `lib/permissions.ts`
- Modify: `tests/permissions-and-visibility.test.ts`

- [ ] **Step 1: Update `types/index.ts`**
Add `'PILGER'` to `StageCode` union and add `{ code: "PILGER", label: "Cold Pilger Mill" }` to `STAGES` array.

- [ ] **Step 2: Update `lib/users/types.ts`**
Add `production_pilger?: AccessLevel` to `FormPermissions`, `'PILGER'` to `WorkCenterCode`, and `'pilger_operator'` to `UserRole`.

- [ ] **Step 3: Update `lib/permissions.ts`**
- Map `PILGER: 'production_pilger'` in `STAGE_TO_PERMISSION_KEY`.
- Add `production_pilger` module to `MODULE_DEFINITIONS`.
- Add `PILGER: 'Cold Pilger Mill'` in `WORK_CENTER_LABELS`.
- Update `getDefaultPermissions` to grant edit rights on `PILGER` when `workCenter === 'PILGER'`.

- [ ] **Step 4: Run permissions tests**
Run: `npx vitest run tests/permissions-and-visibility.test.ts`

---

### Task 3: Metallurgical Calculations & WIP Reconciliation

**Files:**
- Modify: `lib/productionUtils.ts`
- Modify: `lib/wipReconciliation.ts`
- Modify: `lib/metallurgy/processSheetSpecHelper.ts`
- Test: `tests/production-utils.test.ts`
- Test: `tests/wip-reconciliation.test.ts`

- [ ] **Step 1: Update `lib/productionUtils.ts`**
Ensure elongation and $L_1 / L_2$ calculations recognize `PILGER` as a cold reduction stage with mass conservation.

- [ ] **Step 2: Update `lib/wipReconciliation.ts`**
Implement `SS_STEEL` routing logic:
- `PILGER` incoming is `Rolling HTC OK`.
- `HEAT_TREATMENT` incoming for `SS_STEEL` is `Pilger OK`.
- `BAND_SAW` incoming for `SS_STEEL` is `Heat Treatment OK`.

- [ ] **Step 3: Update `lib/metallurgy/processSheetSpecHelper.ts`**
Recognize stainless steel grades (`SS 304`, `SS 316`, `ASTM A312`, `TP304`, `TP316`) and assign route `SS_STEEL`.

- [ ] **Step 4: Run reconciliation & production tests**
Run: `npx vitest run tests/wip-reconciliation.test.ts tests/production-utils.test.ts`

---

### Task 4: Queue Feeder Logic & Production Entry APIs

**Files:**
- Modify: `hooks/useQueue.ts`
- Modify: `app/api/production/queue/route.ts`
- Modify: `components/production/modals/EditEntryModal.tsx`

- [ ] **Step 1: Update `hooks/useQueue.ts`**
Add `PILGER` stage calculation in `work_centers_wip`:
- `availPcs` at Pilger = `Rolling HTC OK - Pilger OK`.
- `availPcs` at Heat Treatment for `SS_STEEL` = `Pilger OK - HT OK`.

- [ ] **Step 2: Update `app/api/production/queue/route.ts`**
Ensure backend queue computation handles `PILGER` queue balance and `SS_STEEL` route.

- [ ] **Step 3: Update `EditEntryModal.tsx`**
Add `'PILGER'` to `hasL1L2` and elongation stages so operators can adjust $L_1 / L_2$ cut lengths.

---

### Task 5: UI & Reporting Integration

**Files:**
- Modify: `components/production/ProductionEntryGrid.tsx`
- Modify: `components/reports/WorkCenterProductionReportClient.tsx`
- Modify: `components/reports/WorkOrderTrackingClient.tsx`
- Modify: `components/admin/AdminControlPanelClient.tsx`

- [ ] **Step 1: Update `ProductionEntryGrid.tsx`**
Ensure `getEntryAvgLength` calculates elongated length for `PILGER` stage.

- [ ] **Step 2: Update `WorkCenterProductionReportClient.tsx`**
Add `PILGER` tab to `WORK_CENTERS` array with icon and department description.

- [ ] **Step 3: Update `WorkOrderTrackingClient.tsx`**
Add `hasPilgerInRoute` and render the 6 stages for `SS_STEEL` work orders.

- [ ] **Step 4: Update `AdminControlPanelClient.tsx`**
Add `PILGER` to work center options and `pilger_operator` role option.

---

### Task 6: Comprehensive Verification on Local Server

- [ ] **Step 1: Run complete test suite**
Run: `npx vitest run`
Expected: All test suites PASS.

- [ ] **Step 2: TypeScript typecheck**
Run: `npx tsc --noEmit`
Expected: 0 type errors.
