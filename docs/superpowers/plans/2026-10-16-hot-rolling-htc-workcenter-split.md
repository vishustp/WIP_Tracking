# HOT_ROLLING & HTC Work Center Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a dedicated `HOT_ROLLING` work center for Hot Mill Rolling operators, repurpose existing `ROLLING` into `HTC` for QC inspection, establish the `HOT_ROLLING` → `HTC` → Downstream queue hand-off, enforce role-based permissions, and display both stages across all reports and forms locally.

**Architecture:** Split the upstream entry point into two distinct stages: `HOT_ROLLING` (hot piercing/rolling capped by Rolling Plan piece balance) and `HTC` (Hot Test Check QC inspection fed by Hot Rolling OK output). Downstream stages (`DRAW`, `HOLLOW_HEAT_TREATMENT`, `PILGER`, `BAND_SAW`) draw their incoming WIP balance from `HTC OK`. Role permissions restrict `HOT_ROLLING` entry to Hot Mill operators and `HTC` to QC inspectors.

**Tech Stack:** Next.js 15 (App Router), TypeScript, React 19, Vitest, TailwindCSS, Supabase / PostgreSQL.

**Spec:** [`docs/superpowers/specs/2026-10-16-hot-rolling-htc-workcenter-split-design.md`](file:///c:/Users/Kallol%20Bera/Downloads/Backups/Tracking/WIP_Tracking/docs/superpowers/specs/2026-10-16-hot-rolling-htc-workcenter-split-design.md)

## Global Constraints

- **STRICT LOCAL EXECUTION:** No `git push origin` or live deployment. All testing and verification remain strictly local until explicit user sign-off.
- **MASS & PIECE CONSERVATION:** Production at `HOT_ROLLING` uses Mother Hollow dimensions; downstream WIP preserves geometry and aggregates under the final customer size (`od` & `wt`).
- **ROLLING PLAN CAPPING:** `HOT_ROLLING` gross output is strictly capped by the authorized Rolling Plan remaining piece balance (`balance_to_make_pcs`).
- **DIRECT BALANCING:** No intermediate supply process. $\text{HTC Queue} = \text{HOT\_ROLLING Net OK} - \text{HTC Tested}$; $\text{Downstream Queue} = \text{HTC OK} - \text{Current Stage Output}$.

## Review Focus

1. **Plan Balance Enforcement at HOT_ROLLING:** Attempting to record more pieces than the remaining plan balance at `HOT_ROLLING` must be blocked with an explicit error.
2. **Queue Over-consumption at HTC:** Attempting to record more HTC tested pieces than the available `HOT_ROLLING Net OK` must be blocked.
3. **Downstream Feeding from HTC:** Verification that CDS Draw Bench and HFS Band Saw queues receive their balance directly from `HTC OK`, never directly from `HOT_ROLLING`.
4. **Role Isolation:** Hot Mill Operator cannot submit entries for `HTC`; QC Inspector cannot submit entries for `HOT_ROLLING`.
5. **WIP Matrix Sizing Consistency:** Both `HOT_ROLLING` and `HTC` quantities must group under the work order's final customer OD & WT in the Size-Grade WIP Matrix.

---

### Task 1: Type Definitions & Route Stage Schema

**Files:**
- Modify: `types/index.ts:1-35`
- Modify: `types/dailyPlanning.ts:1-30`
- Test: `tests/hot-rolling-htc-types.test.ts`

**Interfaces:**
- Produces: Updated `StageCode` containing `'HOT_ROLLING'` and `'HTC'`, updated `DailyPlanWorkCenter`.

- [ ] **Step 1: Write the failing test for new stage types**

```typescript
// tests/hot-rolling-htc-types.test.ts
import { describe, it, expect } from 'vitest';
import type { StageCode } from '@/types';
import type { DailyPlanWorkCenter } from '@/types/dailyPlanning';

describe('StageCode and DailyPlanWorkCenter types', () => {
  it('supports HOT_ROLLING and HTC stage codes', () => {
    const hotRollingStage: StageCode = 'HOT_ROLLING';
    const htcStage: StageCode = 'HTC';
    expect(hotRollingStage).toBe('HOT_ROLLING');
    expect(htcStage).toBe('HTC');
  });

  it('supports HOT_ROLLING and HTC daily plan work centers', () => {
    const hotRollingWc: DailyPlanWorkCenter = 'HOT_ROLLING';
    const htcWc: DailyPlanWorkCenter = 'HTC';
    expect(hotRollingWc).toBe('HOT_ROLLING');
    expect(htcWc).toBe('HTC');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/hot-rolling-htc-types.test.ts`
Expected: FAIL due to TypeScript type mismatch.

- [ ] **Step 3: Update `types/index.ts` and `types/dailyPlanning.ts`**

Update `StageCode` in `types/index.ts`:
```typescript
export type StageCode =
  | "HOT_ROLLING"
  | "ROLLING" // backward compatibility alias for existing logs
  | "HTC"
  | "HOLLOW_HEAT_TREATMENT"
  | "DRAW"
  | "PILGER"
  | "HEAT_TREATMENT"
  | "BAND_SAW"
  | "VDI"
  | "FINISHING";
```
Update `DailyPlanWorkCenter` in `types/dailyPlanning.ts`:
```typescript
export type DailyPlanWorkCenter =
  | "HOT_ROLLING"
  | "ROLLING"
  | "HTC"
  | "HOLLOW_HEAT_TREATMENT"
  | "COLD_DRAWING"
  | "DRAW"
  | "HEAT_TREATMENT"
  | "FINISHING_CUTTING"
  | "BAND_SAW"
  | "FINISHING";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/hot-rolling-htc-types.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit locally**

```bash
git add types/index.ts types/dailyPlanning.ts tests/hot-rolling-htc-types.test.ts
git commit -m "feat(types): add HOT_ROLLING and HTC stage codes and planning work centers"
```

---

### Task 2: Permissions Matrix & User Management

**Files:**
- Modify: `lib/users/types.ts:1-60`
- Modify: `lib/permissions.ts:10-120`
- Modify: `components/admin/UserManagementPanel.tsx` (Work Center selector)
- Test: `tests/hot-rolling-htc-permissions.test.ts`

**Interfaces:**
- Produces: `production_hot_rolling` and `production_htc` keys in `FormPermissions`, updated `STAGE_TO_PERMISSION_KEY`, `MODULE_DEFINITIONS`, and `getDefaultPermissions`.

- [ ] **Step 1: Write failing test for permissions**

```typescript
// tests/hot-rolling-htc-permissions.test.ts
import { describe, it, expect } from 'vitest';
import { getDefaultPermissions, STAGE_TO_PERMISSION_KEY } from '@/lib/permissions';

describe('HOT_ROLLING and HTC Permissions', () => {
  it('maps stage codes to correct permission keys', () => {
    expect(STAGE_TO_PERMISSION_KEY['HOT_ROLLING']).toBe('production_hot_rolling');
    expect(STAGE_TO_PERMISSION_KEY['HTC']).toBe('production_htc');
  });

  it('assigns edit access for HOT_ROLLING operator strictly to HOT_ROLLING', () => {
    const perms = getDefaultPermissions('user', 'HOT_ROLLING');
    expect(perms.production_hot_rolling).toBe('edit');
    expect(perms.production_htc).toBe('view');
  });

  it('assigns edit access for QC / HTC operator strictly to HTC and VDI', () => {
    const perms = getDefaultPermissions('user', 'HTC');
    expect(perms.production_hot_rolling).toBe('view');
    expect(perms.production_htc).toBe('edit');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/hot-rolling-htc-permissions.test.ts`
Expected: FAIL with missing keys / undefined.

- [ ] **Step 3: Update `lib/users/types.ts` and `lib/permissions.ts`**

In `lib/users/types.ts`, add `production_hot_rolling: AccessLevel` and `production_htc: AccessLevel`.
In `lib/permissions.ts`:
- Update `STAGE_TO_PERMISSION_KEY` to include `'HOT_ROLLING': 'production_hot_rolling'` and `'HTC': 'production_htc'`.
- Update `MODULE_DEFINITIONS` with `{ key: 'production_hot_rolling', label: 'Hot Rolling Mill', ... }` and `{ key: 'production_htc', label: 'Hot Test Check (HTC)', ... }`.
- Update `getDefaultPermissions` to grant edit rights for `workCenter === 'HOT_ROLLING'` and `workCenter === 'HTC'`.
- Update `WORK_CENTER_LABELS` and User Management Work Center select dropdown options to include `HOT_ROLLING` and `HTC`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/hot-rolling-htc-permissions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit locally**

```bash
git add lib/users/types.ts lib/permissions.ts components/admin/UserManagementPanel.tsx tests/hot-rolling-htc-permissions.test.ts
git commit -m "feat(permissions): add production_hot_rolling and production_htc permission rules"
```

---

### Task 3: Stage Calculations & Production Validation

**Files:**
- Modify: `lib/productionUtils.ts:50-130`
- Modify: `lib/productionValidation.ts:40-120`
- Test: `tests/hot-rolling-htc-validation.test.ts`

**Interfaces:**
- Consumes: `StageCode`, `calc()`, `validateProductionEntry()`
- Produces: Correct MH-dimension calculation for `HOT_ROLLING`, plan piece capping at `HOT_ROLLING`, and queue balance validation at `HTC`.

- [ ] **Step 1: Write failing test for calculation and validation**

```typescript
// tests/hot-rolling-htc-validation.test.ts
import { describe, it, expect } from 'vitest';
import { calc } from '@/lib/productionUtils';
import { validateProductionEntry } from '@/lib/productionValidation';

describe('HOT_ROLLING and HTC Calculations & Validation', () => {
  it('calculates HOT_ROLLING tonnage using Mother Hollow dimensions', () => {
    const result = calc({
      stage_code: 'HOT_ROLLING',
      pcs: '10',
      mtr: '100',
      rejection_pcs: '1',
      rejection_mtr: '10',
      htc_ok_pcs: '0',
      htc_ok_mtr: '0',
      od: 25.4,
      wl: 2.11,
      mh_od: 88.9,
      mh_wt: 6.35,
      mh_avg_length: 10,
      avg_length: 10,
    });
    // Net MTR = 90. Weight factor for 88.9x6.35 = (88.9-6.35)*6.35*0.0246615*0.001 = 0.012928 MT/m.
    // 90 * 0.012928 = ~1.16 MT
    expect(result.net_output_mtr).toBe(90);
    expect(result.net_output_mt).toBeGreaterThan(1.1);
  });

  it('enforces rolling plan balance capping at HOT_ROLLING', () => {
    const error = validateProductionEntry({
      stage_code: 'HOT_ROLLING',
      pcs: 50,
      mtr: 500,
      rejection_pcs: 0,
      rejection_mtr: 0,
      balance_to_make_pcs: 30, // Plan balance is 30 PCS
    });
    expect(error).toContain('exceeds remaining Rolling Plan balance');
  });

  it('enforces available queue limit at HTC', () => {
    const error = validateProductionEntry({
      stage_code: 'HTC',
      pcs: 40,
      mtr: 400,
      rejection_pcs: 0,
      rejection_mtr: 0,
      available_pcs: 25, // Only 25 PCS rolled by Hot Mill
    });
    expect(error).toContain('exceeds available queue');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/hot-rolling-htc-validation.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement calculation and validation updates**

In `lib/productionUtils.ts`:
- Ensure `sc === 'HOT_ROLLING' || sc === 'ROLLING'` triggers Mother Hollow dimension usage.
- At `HOT_ROLLING`, `net_output_pcs = gross - rejection` and `net_output_mtr = gross - rejection`.
- At `HTC`, `net_output_pcs = Number(row.htc_ok_pcs || row.pcs || 0)`.
In `lib/productionValidation.ts`:
- Enforce `HOT_ROLLING` plan balance piece check:
  `if (stage === 'HOT_ROLLING' && pcs > balance_to_make_pcs) return 'Production exceeds remaining Rolling Plan balance...'`
- Enforce `HTC` queue availability check:
  `if (stage === 'HTC' && (htc_ok_pcs + rejection_pcs) > available_pcs) return 'HTC entries exceed available Hot Rolling queue...'`

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/hot-rolling-htc-validation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit locally**

```bash
git add lib/productionUtils.ts lib/productionValidation.ts tests/hot-rolling-htc-validation.test.ts
git commit -m "feat(validation): implement HOT_ROLLING plan capping and HTC queue checks"
```

---

### Task 4: Queue API Generation (`app/api/production/queue/route.ts`)

**Files:**
- Modify: `app/api/production/queue/route.ts:1300-1650`
- Test: `tests/hot-rolling-htc-queue-api.test.ts`

**Interfaces:**
- Produces: Emitted queue items for both `HOT_ROLLING` and `HTC`, with downstream stages drawing from `HTC OK`.

- [ ] **Step 1: Write failing test for queue sequence**

```typescript
// tests/hot-rolling-htc-queue-api.test.ts
import { describe, it, expect } from 'vitest';

describe('HOT_ROLLING -> HTC Queue Pipeline', () => {
  it('correctly calculates HTC queue from HOT_ROLLING OK minus HTC tested', () => {
    const hotRollingNetOkPcs = 100;
    const htcTestedPcs = 40;
    const htcAvailableQueuePcs = hotRollingNetOkPcs - htcTestedPcs;
    expect(htcAvailableQueuePcs).toBe(60);
  });

  it('correctly feeds downstream Draw Bench from HTC OK, not HOT_ROLLING gross', () => {
    const htcOkPcs = 38;
    const drawGrossOutputPcs = 20;
    const drawAvailableQueuePcs = htcOkPcs - drawGrossOutputPcs;
    expect(drawAvailableQueuePcs).toBe(18);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run tests/hot-rolling-htc-queue-api.test.ts`

- [ ] **Step 3: Update `app/api/production/queue/route.ts`**

1. Define `HOT_ROLLING` queue:
   - Condition: Active rolling plan exists (`isRollingPlanIssued && rollAvailPcs >= 1`).
   - Stage Code: `'HOT_ROLLING'`.
   - Stage Name: `'Hot Rolling Mill'`.
   - Balance: `balance_to_make_pcs: rollAvailPcs`.
2. Define `HTC` queue:
   - Condition: Hot rolling output exists (`hotRollingNetOkPcs > 0`).
   - Stage Code: `'HTC'`.
   - Stage Name: `'Hot Test Check (HTC)'`.
   - Feeder: `'HOT_ROLLING'`.
   - Balance: `hotRollingNetOkPcs - htcTestedPcs`.
3. Update downstream feeders:
   - For `HOLLOW_HEAT_TREATMENT`, `DRAW`, `PILGER`, and `BAND_SAW`:
     Update feeder source to reference `HTC OK` (`htcOkPcs` / `htcOkMtr`) instead of `Rolling HTC OK`.

- [ ] **Step 4: Run all queue tests**

Run: `npx vitest run tests/completed-wo-wip-matrix.test.ts tests/hot-rolling-htc-queue-api.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit locally**

```bash
git add app/api/production/queue/route.ts tests/hot-rolling-htc-queue-api.test.ts
git commit -m "feat(queue): emit HOT_ROLLING and HTC stages with direct stage balancing"
```

---

### Task 5: Production Entry UI (`/production`)

**Files:**
- Modify: `components/production/ProductionEntryGrid.tsx`
- Modify: `app/production/page.tsx`
- Test: Build check (`npm run build`)

**Interfaces:**
- Consumes: `useQueue()`, `STAGE_OPTIONS`, `useUserSession()`
- Produces: Separate tabs for "Hot Rolling" and "Hot Test Check (HTC)", respecting user roles.

- [ ] **Step 1: Update stage tab configuration in `ProductionEntryGrid.tsx`**

Add `'HOT_ROLLING'` and `'HTC'` into the stage selector tabs:
```typescript
{ code: 'HOT_ROLLING', label: 'Hot Rolling Mill' },
{ code: 'HTC', label: 'Hot Test Check (HTC)' },
```
- In `HOT_ROLLING` tab: Show Rolling Plan details, target mother size, MH OD/WT, Gross Output, Rejections, and Net Rolling OK.
- In `HTC` tab: Show Rolled Pipes available queue, HTC OK input, QC Rejections, and Net Passed to downstream.
- Enforce role check: Hot Mill Rolling operators are locked into `HOT_ROLLING`; QC inspectors are locked into `HTC` / `VDI`.

- [ ] **Step 2: Run build to verify type safety**

Run: `npm run build`
Expected: Compile cleanly with 0 type errors.

- [ ] **Step 3: Commit locally**

```bash
git add components/production/ProductionEntryGrid.tsx app/production/page.tsx
git commit -m "feat(ui): add Hot Rolling and HTC entry tabs with operator authorization"
```

---

### Task 6: Reports & Matrix Integration

**Files:**
- Modify: `components/reports/SizeGradeWipReportClient.tsx` (WIP Matrix)
- Modify: `components/reports/ProcessSheetClient.tsx` (Process Sheet)
- Modify: `components/reports/PendingWorkOrdersReportClient.tsx`
- Modify: `components/daily-plans/DailyPlanClient.tsx`
- Modify: `app/dashboard/DashboardClient.tsx`
- Test: `tests/hot-rolling-htc-reports.test.ts`

**Interfaces:**
- Produces: Distinct columns and WIP totals for `HOT_ROLLING` and `HTC` across all analytical screens.

- [ ] **Step 1: Write failing test for WIP Matrix stage columns**

```typescript
// tests/hot-rolling-htc-reports.test.ts
import { describe, it, expect } from 'vitest';

describe('WIP Matrix Stage Aggregation', () => {
  it('separately tracks Hot Rolling and HTC quantities under final size', () => {
    const rowHotRolling = {
      od: 25.4,
      wt: 2.11,
      grade: 'SA213-T22',
      stage_code: 'HOT_ROLLING',
      current_wip_pcs: 50,
      current_wip_mtr: 500,
    };
    const rowHtc = {
      od: 25.4,
      wt: 2.11,
      grade: 'SA213-T22',
      stage_code: 'HTC',
      current_wip_pcs: 30,
      current_wip_mtr: 300,
    };

    const group = {
      hot_rolling_pcs: rowHotRolling.current_wip_pcs,
      htc_pcs: rowHtc.current_wip_pcs,
    };

    expect(group.hot_rolling_pcs).toBe(50);
    expect(group.htc_pcs).toBe(30);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run tests/hot-rolling-htc-reports.test.ts`

- [ ] **Step 3: Update `SizeGradeWipReportClient.tsx`**

- In `STAGES` definition:
  Replace or prepend:
  ```typescript
  { code: 'HOT_ROLLING', label: 'Hot Rolling', shortLabel: 'Roll' },
  { code: 'HTC', label: 'HTC (QC)', shortLabel: 'HTC' },
  ```
- Map `HOT_ROLLING` rows to `hot_rolling_pcs` / `hot_rolling_mtr` and `HTC` rows to `htc_pcs` / `htc_mtr`.
- Update summary KPI cards and table header columns to display both Hot Rolling and HTC.

- [ ] **Step 4: Update Process Sheet, Daily Planning, and Dashboard**

- In `components/reports/ProcessSheetClient.tsx`: Set sequence 1 to Hot Rolling and sequence 2 to HTC.
- In `components/daily-plans/DailyPlanClient.tsx`: Add `HOT_ROLLING` and `HTC` in the work center filters and daily scheduler.
- In `app/dashboard/DashboardClient.tsx`: Display Hot Rolling throughput and HTC QC clearance KPIs.

- [ ] **Step 5: Run tests and build**

Run: `npx vitest run`
Run: `npm run build`
Expected: All tests pass and production build completes successfully.

- [ ] **Step 6: Commit locally**

```bash
git add components/reports/SizeGradeWipReportClient.tsx components/reports/ProcessSheetClient.tsx components/daily-plans/DailyPlanClient.tsx app/dashboard/DashboardClient.tsx tests/hot-rolling-htc-reports.test.ts
git commit -m "feat(reports): integrate HOT_ROLLING and HTC columns across WIP matrix and dashboards"
```

---

### Task 7: Full End-to-End Local Verification

**Files:**
- Test: All unit and integration test files (`tests/**/*.test.ts`)
- Local Next.js dev server verification

- [ ] **Step 1: Run comprehensive test suite**

Run: `npx vitest run`
Expected: All test suites PASS with 100% green status.

- [ ] **Step 2: Run Next.js production build**

Run: `npm run build`
Expected: `Compiled successfully` with static pages generated without type or lint errors.

- [ ] **Step 3: Review git status to ensure zero remote pushes**

Run: `git status`
Verify: Everything is safely committed to local branch only. `git log -n 5` verifies clean local history.
