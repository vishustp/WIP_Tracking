# Intermediate Pipe Cutting (IP Cutting) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable an optional "IP Cutting" option in Rolling Plans where mother hollows after HTC are intermediate-cut at the Band Saw before Cold Drawing, while keeping standard work orders unchanged and accounting pre-draw WIP cleanly under the Cold Draw Bench.

**Architecture:** Add `IP_CUTTING` stage into `process_stages` and configure `is_ip_cutting`, `ip_cut_length`, and `ip_multiple` in `rolling_plans.status`. When active, `app/api/production/queue/route.ts` routes HTC output to the Band Saw IP Cutting queue, whose cut output feeds the Cold Draw Bench, while post-HT material routes to standard final Band Saw cutting. The WIP Matrix preserves standard column layout by aggregating pre-draw inventory under Cold Draw WIP.

**Tech Stack:** Next.js (App Router), TypeScript, React, Supabase PostgreSQL, Tailwind CSS, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-27-ip-cutting-workflow-design.md`

## Global Constraints
- Master process routes (`CDS`, `ALLOY_CDS`, `HFS`, `ALLOY_HFS`, `SS_STEEL`) remain unchanged.
- Standard work orders without IP Cutting must follow 100% existing flow: $\text{Rolling HTC OK} \rightarrow \text{Draw Bench}$.
- No separate "IP Cut" column in the WIP Matrix or Executive Dashboard; pre-draw WIP is accounted under Cold Draw WIP.
- Band Saw and Finishing operators share mutual authority over `IP_CUTTING` (Rule 8).
- Strict mass balance: $\text{Scrap Meters} = \text{Incoming Mother Meters} - \text{Prime Cut Meters}$.

## Review Focus
- Orders where `is_ip_cutting: false` must never show in the Band Saw pre-draw queue.
- When `is_ip_cutting: true`, the Draw Bench queue must consume actual cut pieces from `IP_CUTTING`, not raw uncut mother pipes.
- An order with IP Cutting must allow Band Saw cutting twice: once at `IP_CUTTING` before Draw, and once at `BAND_SAW` after Heat Treatment without collision or double-counting.
- Piece and meter calculations must correctly reflect the `ip_multiple` and `ip_cut_length` configured in the Rolling Plan.
- Rejection or scrap generated during IP Cutting must follow Rule 2 and Rule 5 scrap flooring.

---

### Task 1: Database Migration & Schema Types

**Files:**
- Create: `supabase/migrations/083_add_ip_cutting_stage.sql`
- Modify: `types/index.ts:15-45, 120-145`
- Test: `tests/ip-cutting-schema.test.ts`

**Interfaces:**
- Produces: `StageCode = ... | 'IP_CUTTING'`
- Produces: `is_ip_cutting?: boolean; ip_cut_length?: number | null; ip_multiple?: number | null;` on `Row`, `ProductionEntry`, `RollingPlan`

- [ ] **Step 1: Write the failing test for schema and stage code**
```ts
import { describe, it, expect } from 'vitest';
import type { StageCode, Row } from '@/types';

describe('IP Cutting Schema & Types', () => {
  it('recognizes IP_CUTTING as a valid StageCode and Row property', () => {
    const stage: StageCode = 'IP_CUTTING';
    expect(stage).toBe('IP_CUTTING');

    const row: Partial<Row> = {
      is_ip_cutting: true,
      ip_cut_length: 6.25,
      ip_multiple: 2,
    };
    expect(row.is_ip_cutting).toBe(true);
    expect(row.ip_cut_length).toBe(6.25);
    expect(row.ip_multiple).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run tests/ip-cutting-schema.test.ts`
Expected: FAIL (Type '"IP_CUTTING"' is not assignable to type 'StageCode').

- [ ] **Step 3: Implement database migration and update `types/index.ts`**
Create `supabase/migrations/083_add_ip_cutting_stage.sql`:
```sql
INSERT INTO public.process_stages (stage_code, stage_name, active)
VALUES ('IP_CUTTING', 'IP Cutting (Band Saw)', true)
ON CONFLICT (stage_code) DO UPDATE
  SET stage_name = 'IP Cutting (Band Saw)', active = true;
```
Add `'IP_CUTTING'` to `StageCode` and add `is_ip_cutting`, `ip_cut_length`, `ip_multiple` to `Row`, `ProductionEntry`, and `RollingPlan` in `types/index.ts`.

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run tests/ip-cutting-schema.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add supabase/migrations/083_add_ip_cutting_stage.sql types/index.ts tests/ip-cutting-schema.test.ts
git commit -m "feat(schema): add IP_CUTTING stage code and rolling plan types"
```

---

### Task 2: Rolling Plan Form IP Cutting Inputs

**Files:**
- Modify: `components/rolling-plans/RollingPlanForm.tsx:105-130, 435-475, 1200-1280`
- Test: `tests/rolling-plan-ip-cutting.test.ts`

**Interfaces:**
- Consumes: `types/index.ts`
- Produces: `rolling_plans.status` containing `{ is_ip_cutting, ip_cut_length, ip_multiple }`

- [ ] **Step 1: Write the failing test for Rolling Plan IP cutting payload generation**
```ts
import { describe, it, expect } from 'vitest';

describe('Rolling Plan IP Cutting Configuration', () => {
  it('correctly serializes and deserializes IP Cutting parameters in status JSON', () => {
    const rawStatus = {
      type: 'SINGLE_WO',
      is_master: false,
      is_ip_cutting: true,
      ip_cut_length: 6.25,
      ip_multiple: 2,
    };
    const json = JSON.stringify(rawStatus);
    const parsed = JSON.parse(json);

    expect(parsed.is_ip_cutting).toBe(true);
    expect(parsed.ip_cut_length).toBe(6.25);
    expect(parsed.ip_multiple).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**
Run: `npx vitest run tests/rolling-plan-ip-cutting.test.ts`

- [ ] **Step 3: Update `RollingPlanForm.tsx`**
In `WorkOrderGroup`:
- Add `isIpCutting: boolean; ipCutLength: string; ipMultiple: string;`
In `createDefaultGroup`:
- Initialize `isIpCutting: false, ipCutLength: '', ipMultiple: '1'`.
In UI under Process Route & Tolerances:
- Add an "IP Cutting (Pre-Draw Band Saw Cut)" card:
  - Checkbox: `Require IP Cutting before Cold Draw`
  - When checked, render inputs for `Target IP Cut Length (m)` and `IP Multiple (Pieces per Mother Pipe)`.
When saving/submitting rolling plan:
- Serialize `is_ip_cutting: g.isIpCutting`, `ip_cut_length: Number(g.ipCutLength) || null`, `ip_multiple: Number(g.ipMultiple) || 1` into plan status JSON.
When editing existing plan:
- Parse and pre-populate `isIpCutting`, `ipCutLength`, `ipMultiple`.

- [ ] **Step 4: Verify typecheck passes**
Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 5: Commit**
```bash
git add components/rolling-plans/RollingPlanForm.tsx tests/rolling-plan-ip-cutting.test.ts
git commit -m "feat(rolling-plans): add IP cutting configuration fields and status persistence"
```

---

### Task 3: Queue API (`/api/production/queue/route.ts`) Routing Logic

**Files:**
- Modify: `app/api/production/queue/route.ts:760-840, 1610-1650, 1920-2020`
- Test: `tests/ip-cutting-queue-routing.test.ts`

**Interfaces:**
- Consumes: `production_logs` with `stage_code = 'IP_CUTTING'`, `rolling_plans.status`
- Produces: `queueRows.IP_CUTTING` (at Band Saw) and feeds `queueRows.DRAW` with IP Cut OK output

- [ ] **Step 1: Write the failing test for IP Cutting vs standard Draw Bench feed**
```ts
import { describe, it, expect } from 'vitest';

describe('IP Cutting Queue Feeder Routing', () => {
  it('routes HTC output directly to DRAW when is_ip_cutting is false', () => {
    const isIpCutting = false;
    const htcOkMtr = 120;
    const htcOkPcs = 10;
    const ipCutOkPcs = 0;

    const drawFeederPcs = isIpCutting ? ipCutOkPcs : htcOkPcs;
    const drawFeederMtr = isIpCutting ? ipCutOkPcs * 6.0 : htcOkMtr;

    expect(drawFeederPcs).toBe(10);
    expect(drawFeederMtr).toBe(120);
  });

  it('routes HTC output to IP_CUTTING and feeds DRAW from IP_CUTTING output when is_ip_cutting is true', () => {
    const isIpCutting = true;
    const htcOkMtr = 120;
    const htcOkPcs = 10;
    const ipCutInputMotherPcs = 10;
    const ipCutOkPieces = 20; // 10 mother pipes cut into 20 draw pieces
    const ipCutLength = 6.0;

    const ipCutQueuePcs = Math.max(0, htcOkPcs - ipCutInputMotherPcs);
    const drawFeederPcs = isIpCutting ? ipCutOkPieces : htcOkPcs;
    const drawFeederMtr = isIpCutting ? ipCutOkPieces * ipCutLength : htcOkMtr;

    expect(ipCutQueuePcs).toBe(0); // all cut
    expect(drawFeederPcs).toBe(20); // 20 draw pieces available at draw bench
    expect(drawFeederMtr).toBe(120);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**
Run: `npx vitest run tests/ip-cutting-queue-routing.test.ts`

- [ ] **Step 3: Update `app/api/production/queue/route.ts`**
1. Read `is_ip_cutting`, `ip_cut_length`, `ip_multiple` from plan status.
2. In `baseRowData`, attach `is_ip_cutting`, `ip_cut_length`, `ip_multiple`.
3. If `is_ip_cutting === true`:
   - Compute `ipCutLogs = logs.filter(l => l.stage_id === ipCuttingStageId)`
   - Create `queueRows.IP_CUTTING` with incoming queue from `htc_ok` minus `ipCutLogs.input_pcs/mtr`.
   - Set Draw Bench incoming feeder pieces/meters to `sumQty(ipCutLogs, "output_pcs")` and `sumQty(ipCutLogs, "output_qty")`.
   - Compute Draw Bench active WIP = `ipCutOkPieces - drawnPieces`.
4. If `is_ip_cutting !== true`:
   - Retain 100% current logic: Draw Bench feeder = `htc_ok`.
5. Keep Final Band Saw (`BAND_SAW`) queue strictly fed from `HEAT_TREATMENT`.

- [ ] **Step 4: Verify typecheck passes**
Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 5: Commit**
```bash
git add app/api/production/queue/route.ts tests/ip-cutting-queue-routing.test.ts
git commit -m "feat(queue): route HTC through IP_CUTTING to DRAW when enabled on rolling plan"
```

---

### Task 4: Band Saw Console Dual-Mode Execution

**Files:**
- Modify: `components/bandsaw/BandSawCuttingClient.tsx:35-90, 480-550, 650-700`
- Modify: `components/production/modals/BandSawCuttingModal.tsx:40-110, 200-280`
- Test: `tests/bandsaw-ip-cutting.test.ts`

**Interfaces:**
- Consumes: `Row` with `stage_code = 'IP_CUTTING'` or `'BAND_SAW'`
- Produces: `production_logs` entry with `stage_id = IP_CUTTING` or `BAND_SAW`

- [ ] **Step 1: Write the failing test for Band Saw IP cutting modal defaults**
```ts
import { describe, it, expect } from 'vitest';

describe('Band Saw IP Cutting Modal Pre-fill', () => {
  it('pre-fills IP cut length and multiple when cutting an IP_CUTTING row', () => {
    const row = {
      stage_code: 'IP_CUTTING',
      is_ip_cutting: true,
      ip_cut_length: 6.25,
      ip_multiple: 2,
      multiple: 4, // final customer multiple
      l1: 3.0,
      l2: 3.5,
    };

    const isIpCut = row.stage_code === 'IP_CUTTING' || row.is_ip_cutting;
    const effectiveMultiple = isIpCut ? (row.ip_multiple || 2) : row.multiple;
    const targetLength = isIpCut ? row.ip_cut_length : row.l1;

    expect(effectiveMultiple).toBe(2);
    expect(targetLength).toBe(6.25);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**
Run: `npx vitest run tests/bandsaw-ip-cutting.test.ts`

- [ ] **Step 3: Update `BandSawCuttingClient.tsx` & `BandSawCuttingModal.tsx`**
In `BandSawCuttingClient.tsx`:
- Add a view filter in the queue tab: `All Cuts` | `Final Cuts` | `IP Cuts (Draw Prep)`.
- For `row.stage_code === 'IP_CUTTING'`, render an eye-catching cyan badge: `[IP CUT]`.
- Pass `isIpCutting: row.stage_code === 'IP_CUTTING'` to `BandSawCuttingModal`.
In `BandSawCuttingModal.tsx`:
- When `isIpCutting === true`:
  - Display header: `Record Intermediate Pipe Cut (IP Cutting - Draw Prep)`.
  - Default cut length to `row.ip_cut_length` and pieces-per-pipe to `row.ip_multiple`.
  - Post production log to API using `stage_code: 'IP_CUTTING'`.

- [ ] **Step 4: Verify typecheck passes**
Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 5: Commit**
```bash
git add components/bandsaw/BandSawCuttingClient.tsx components/production/modals/BandSawCuttingModal.tsx tests/bandsaw-ip-cutting.test.ts
git commit -m "feat(bandsaw): add IP cutting filter, badge, and pre-filled cutting modal"
```

---

### Task 5: WIP Matrix & Reports Clean Accounting

**Files:**
- Modify: `components/reports/SizeGradeWipReportClient.tsx:300-335, 680-725`
- Test: `tests/wip-matrix-ip-cutting.test.ts`

**Interfaces:**
- Consumes: `/api/production/queue` response including `IP_CUTTING` rows
- Produces: Consolidated `DRAW` WIP in Matrix (no separate IP column)

- [ ] **Step 1: Write test verifying pre-draw IP cutting stock maps to Cold Draw column in WIP Matrix**
```ts
import { describe, it, expect } from 'vitest';

describe('WIP Matrix IP Cutting Accounting', () => {
  it('consolidates IP Cutting stock under Cold Draw Bench column', () => {
    const rawRows = [
      {
        work_order_id: 'wo-ip-1',
        work_order_no: 'WO-6601',
        stage_code: 'IP_CUTTING',
        current_wip_pcs: 10,
        current_wip: 120,
        od: 50.8,
        wt: 3.5,
        grade: 'ASTM A106 Gr B',
      },
      {
        work_order_id: 'wo-ip-1',
        work_order_no: 'WO-6601',
        stage_code: 'DRAW',
        current_wip_pcs: 20,
        current_wip: 120,
        od: 50.8,
        wt: 3.5,
        grade: 'ASTM A106 Gr B',
      },
    ];

    // In Matrix, IP_CUTTING inventory awaiting draw maps to DRAW column
    const matrixGroup = { draw_pcs: 0, draw_mtr: 0 };
    rawRows.forEach((r) => {
      if (r.stage_code === 'IP_CUTTING' || r.stage_code === 'DRAW') {
        matrixGroup.draw_pcs += r.current_wip_pcs;
        matrixGroup.draw_mtr += r.current_wip;
      }
    });

    expect(matrixGroup.draw_pcs).toBe(30);
    expect(matrixGroup.draw_mtr).toBe(240);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**
Run: `npx vitest run tests/wip-matrix-ip-cutting.test.ts`

- [ ] **Step 3: Update `SizeGradeWipReportClient.tsx`**
- In row mapping (around line 310): if `stCode === 'IP_CUTTING'`, map `stage_name: 'IP Cutting (Draw Prep)'`.
- In matrix aggregation (around line 935): map `IP_CUTTING` WIP into `group.draw_mtr`, `group.draw_pcs`, and `group.draw_mt` so pre-draw inventory cleanly belongs to the Cold Draw column without altering existing table layout.

- [ ] **Step 4: Verify typecheck passes**
Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 5: Commit**
```bash
git add components/reports/SizeGradeWipReportClient.tsx tests/wip-matrix-ip-cutting.test.ts
git commit -m "feat(reports): aggregate IP cutting pre-draw inventory under Cold Draw WIP in matrix"
```

---

### Task 6: End-to-End Regression & Verification

**Files:**
- Test: `tests/ip-cutting-e2e.test.ts`

- [ ] **Step 1: Write comprehensive end-to-end integration test**
Verify:
1. Standard order with `is_ip_cutting: false` flows directly from HTC to DRAW with single Band Saw cut.
2. IP Cutting order with `is_ip_cutting: true` generates pre-draw cut at Band Saw and feeds cut pieces to DRAW.
3. Draw Bench draws the cut pieces and advances to Final HT and Final Customer Cutting.
4. WIP Matrix groups inventory correctly without errors.

- [ ] **Step 2: Run all vitest tests**
Run: `npx vitest run`
Expected: All domain unit tests PASS.

- [ ] **Step 3: Run full TypeScript check**
Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Commit**
```bash
git add tests/ip-cutting-e2e.test.ts
git commit -m "test: add comprehensive end-to-end test suite for IP Cutting workflow"
```
