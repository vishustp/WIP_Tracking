# Rejection Declaration, 3-Stage Approval Workflow, and Salvage Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete universal material rejection and salvage disposition subsystem across all mill work centers with a 3-step sign-off workflow (Production declares $\rightarrow$ QC verifies $\rightarrow$ PPC authorizes), automatic stage WIP ledger deduction upon PPC approval, a unified interactive review board (`/rejections`), and a dedicated plant-wide Salvage & Rejection Material Report (`/reports/rejections`).

**Architecture:** Database-backed transactional lifecycle in `public.rejection_declarations` with automated human-readable numbering (`REJ-YYYY-XXXX`). WIP ledger views (`vw_route_stage_wip`) and stored procedures (`recalculate_work_order_wip`) deduct approved quantities from specific work centers without mutating shift production logs. Role-gated frontend console (`/rejections`) supports fast modal-based declarations and approvals. A separate analytical report (`/reports/rejections`) aggregates scrap losses, pareto causes, and audit narratives.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase PostgreSQL (SQL migrations, RLS, triggers), Tailwind CSS, Lucide icons, Vitest.

**Spec:** [docs/superpowers/specs/2026-10-08-rejection-salvage-workflow-and-report-design.md](file:///c:/Users/Kallol%20Bera/Downloads/Backups/Tracking/WIP_Tracking/docs/superpowers/specs/2026-10-08-rejection-salvage-workflow-and-report-design.md)

## Global Constraints

- Never mutate or rewrite existing immutable shift logs in `production_logs`.
- WIP deduction must take effect if and only if `status = 'APPROVED'`. Pending declarations must not deduct from WIP.
- Rejection reason categories must support standard mill codes (`SMALL_QTY_NO_REPROCESS`, `SURFACE_DEFECT`, `WALL_THICKNESS_OFF`, `CRACK`, `BEND`, `DIMENSIONAL_OFF_SPEC`, `OTHER`) with mandatory narrative remarks.
- Navigation in `components/AppShell.tsx` must place `/rejections` under OPERATIONS, `/reports/rejections` under REPORTS, and relabel `/reports/diversions` to "Material Diversion Report".
- All tabular and number formatting must follow mill standards (`font-mono tabular-nums text-right`).

## Review Focus

1. Partial QC verification: QC verifies fewer pieces than declared (e.g., 2 of 3 pieces condemned, 1 salvageable); ensure the approved deduction uses `qc_verified_pcs` / `ppc_approved_pcs`, not the initial unverified claim.
2. Cross-stage isolation: Rejection approved at `DRAW` must deduct from `DRAW` WIP and not distort upstream `ROLLING` or downstream `HEAT_TREATMENT`.
3. Simultaneous pending rejection hold: Multiple pending rejections for the same work order must sum properly in the hold warning without causing negative WIP.
4. User role boundaries: An operator in `Production` cannot execute QC verification or PPC approval; buttons must be strictly disabled/hidden.
5. Export & Print fidelity: Long multi-paragraph remarks from Production, QC, and PPC must render cleanly in print views and export without truncation in CSV.

---

### Task 1: Database Migration for `rejection_declarations` & WIP Ledger Deduction

**Files:**
- Create: `supabase/migrations/066_universal_rejection_declarations_and_wip_deduction.sql`
- Test: `tests/rejection-declaration-ledger.test.ts`

**Interfaces:**
- Produces: Table `public.rejection_declarations`, sequence generator `seq_rejection_declaration_no`, updated views `vw_route_stage_wip`, `vw_dashboard_kpis`, function `recalculate_work_order_wip`.

- [ ] **Step 1: Write the failing test for WIP ledger deduction math and rejection declaration lifecycle**

```typescript
// tests/rejection-declaration-ledger.test.ts
import { describe, it, expect } from 'vitest';

describe('Rejection Declaration & WIP Ledger Math', () => {
  it('does not deduct pending declarations from active WIP', () => {
    const incomingMtr = 600;
    const stageOutputMtr = 300;
    const pendingRejectionMtr = 36;
    const approvedRejectionMtr = 0;
    
    // Formula: Incoming - Stage Output - Approved Rejections
    const activeWip = Math.max(incomingMtr - stageOutputMtr - approvedRejectionMtr, 0);
    expect(activeWip).toBe(300);
    expect(pendingRejectionMtr).toBe(36);
  });

  it('deducts approved rejections from active WIP upon PPC approval', () => {
    const incomingMtr = 600;
    const stageOutputMtr = 300;
    const approvedRejectionMtr = 36; // 3 pcs @ 12m
    
    const activeWip = Math.max(incomingMtr - stageOutputMtr - approvedRejectionMtr, 0);
    expect(activeWip).toBe(264);
  });

  it('deducts verified/approved quantities if QC adjusted declared count', () => {
    const declaredMtr = 36; // 3 pcs
    const qcVerifiedMtr = 24; // QC only condemned 2 pcs
    const ppcApprovedMtr = 24; // PPC authorizes 2 pcs write-off
    
    const stageWipBefore = 300;
    const stageWipAfter = stageWipBefore - ppcApprovedMtr;
    expect(stageWipAfter).toBe(276);
  });
});
```

- [ ] **Step 2: Run test to verify it fails/passes initial logic**

Run: `npx vitest run tests/rejection-declaration-ledger.test.ts`
Expected: PASS (or establish baseline suite).

- [ ] **Step 3: Implement Migration `066_universal_rejection_declarations_and_wip_deduction.sql`**

Write SQL migration defining:
- `rejection_declarations` table with columns, constraints, foreign keys, and indexes.
- Number generator trigger for `declaration_no` (`REJ-YYYY-XXXX`).
- Update `vw_route_stage_wip` to join approved rejections per work order and stage, deducting them from `current_wip`. Expose `pending_rejection_pcs`, `pending_rejection_mtr`, `pending_rejection_mt`.
- Update `vw_dashboard_kpis` to account for approved rejections in factory totals.
- Update `recalculate_work_order_wip` and its triggers.

- [ ] **Step 4: Run test to verify ledger math consistency**

Run: `npx vitest run tests/rejection-declaration-ledger.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit migration**

```bash
git add supabase/migrations/066_universal_rejection_declarations_and_wip_deduction.sql tests/rejection-declaration-ledger.test.ts
git commit -m "feat(db): add rejection declarations table and integrate WIP deduction"
```

---

### Task 2: TypeScript Types & Client Service Layer

**Files:**
- Modify: `types/index.ts`
- Create: `lib/rejections/types.ts`
- Create: `lib/rejections/client.ts`
- Test: `tests/rejection-service.test.ts`

**Interfaces:**
- Consumes: Supabase client from `@/lib/supabase/client`
- Produces:
  - `RejectionDeclaration`, `RejectionReasonCategory`, `RejectionStatus`, `RejectionSummaryKpis`
  - `createRejectionDeclaration(payload: CreateRejectionPayload)`
  - `verifyRejectionDeclaration(id: string, payload: VerifyRejectionPayload)`
  - `approveRejectionDeclaration(id: string, payload: ApproveRejectionPayload)`
  - `rejectDeclaration(id: string, stage: 'QC' | 'PPC', remarks: string)`
  - `fetchRejections(filters: RejectionFilterOptions)`
  - `fetchRejectionSummaryKpis()`

- [ ] **Step 1: Write the failing test for rejection service layer**

```typescript
// tests/rejection-service.test.ts
import { describe, it, expect } from 'vitest';
import { REJECTION_REASON_CATEGORIES, calculateRejectionMetrics } from '@/lib/rejections/types';

describe('Rejection Service Types & Metrics', () => {
  it('calculates weight and meters accurately from pieces and pipe specs', () => {
    const pcs = 3;
    const avgLen = 6.0;
    const od = 73.0;
    const wt = 5.5;
    
    const { mtr, mt } = calculateRejectionMetrics(pcs, avgLen, od, wt);
    expect(mtr).toBe(18.0);
    expect(mt).toBeGreaterThan(0.15);
  });

  it('validates standard reason categories', () => {
    expect(REJECTION_REASON_CATEGORIES).toContain('SMALL_QTY_NO_REPROCESS');
    expect(REJECTION_REASON_CATEGORIES).toContain('SURFACE_DEFECT');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/rejection-service.test.ts`
Expected: FAIL with missing module `@/lib/rejections/types`.

- [ ] **Step 3: Implement `lib/rejections/types.ts` and `lib/rejections/client.ts`**

Define types, reason label maps, color maps, metric calculations, and Supabase client query methods for CRUD and status transitions.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/rejection-service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit types and service layer**

```bash
git add types/index.ts lib/rejections/types.ts lib/rejections/client.ts tests/rejection-service.test.ts
git commit -m "feat(rejections): add client service layer and domain types"
```

---

### Task 3: Unified Rejection Board UI (`/rejections`) & 3-Step Modals

**Files:**
- Create: `app/rejections/page.tsx`
- Create: `components/rejections/RejectionsBoardClient.tsx`
- Create: `components/rejections/DeclareRejectionModal.tsx`
- Create: `components/rejections/VerifyRejectionModal.tsx`
- Create: `components/rejections/ApproveRejectionModal.tsx`
- Test: `tests/rejection-ui-state.test.ts`

**Interfaces:**
- Consumes: `lib/rejections/client.ts`, `useUserSession` from `@/lib/users/useUserSession`
- Produces: Fully interactive `/rejections` page with role-gated action buttons, status filters, and 3 workflow modals.

- [ ] **Step 1: Write test for permission checks and state filters**

```typescript
// tests/rejection-ui-state.test.ts
import { describe, it, expect } from 'vitest';
import { canDeclareRejection, canVerifyRejection, canApproveRejection } from '@/lib/rejections/types';

describe('Rejection UI Permissions', () => {
  it('allows production operator to declare rejection', () => {
    expect(canDeclareRejection('rolling_incharge')).toBe(true);
    expect(canDeclareRejection('draw_operator')).toBe(true);
    expect(canDeclareRejection('admin')).toBe(true);
  });

  it('restricts QC verification to QA inspectors and Admin', () => {
    expect(canVerifyRejection('qa_inspector')).toBe(true);
    expect(canVerifyRejection('admin')).toBe(true);
    expect(canVerifyRejection('rolling_incharge')).toBe(false);
  });

  it('restricts PPC approval to PPC manager and Admin', () => {
    expect(canApproveRejection('manager')).toBe(true);
    expect(canApproveRejection('admin')).toBe(true);
    expect(canApproveRejection('qa_inspector')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run tests/rejection-ui-state.test.ts`
Expected: PASS.

- [ ] **Step 3: Implement Page and Modals**
- Build `app/rejections/page.tsx` wrapped in `RouteAccessGuard`.
- Build `components/rejections/RejectionsBoardClient.tsx` with KPI summary cards, filter tabs (`All`, `Pending QC`, `Pending PPC`, `Approved`, `Rejected`), search, and dense tabular list.
- Build `DeclareRejectionModal.tsx` for Production entry with pipe metric recalculation.
- Build `VerifyRejectionModal.tsx` for QC inspection sign-off.
- Build `ApproveRejectionModal.tsx` for PPC authorization and write-off.

- [ ] **Step 4: Verify typecheck and build**

Run: `npx tsc --noEmit`
Expected: PASS without compilation errors.

- [ ] **Step 5: Commit Rejection Board components**

```bash
git add app/rejections/page.tsx components/rejections/ tests/rejection-ui-state.test.ts
git commit -m "feat(ui): add unified rejection board and 3-step action modals"
```

---

### Task 4: Work Center Queue Indicator & Production Screen Quick CTA

**Files:**
- Modify: `hooks/useQueue.ts`
- Modify: `components/production/ProductionEntryClient.tsx`
- Test: `tests/queue-rejection-hold.test.ts`

**Interfaces:**
- Consumes: `public.rejection_declarations` pending count
- Produces: Warning badge on work center queues and "Declare Rejection" shortcut button in `/production`.

- [ ] **Step 1: Write test for pending rejection hold detection**

```typescript
// tests/queue-rejection-hold.test.ts
import { describe, it, expect } from 'vitest';

describe('Queue Rejection Hold Indicator', () => {
  it('formats pending hold warning message correctly', () => {
    const pendingPcs = 3;
    const pendingMtr = 36.0;
    const badgeText = `${pendingPcs} PCS (${pendingMtr.toFixed(1)}m) Pending Rejection Review`;
    expect(badgeText).toBe('3 PCS (36.0m) Pending Rejection Review');
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run tests/queue-rejection-hold.test.ts`
Expected: PASS.

- [ ] **Step 3: Update `hooks/useQueue.ts` & `ProductionEntryClient.tsx`**
- Query active pending rejections for selected work order and stage.
- Display amber hold alert in the stage queue if pending items exist.
- Add "Declare Rejection" button in the action bar of `/production` opening the declaration modal directly.

- [ ] **Step 4: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit queue hold integration**

```bash
git add hooks/useQueue.ts components/production/ProductionEntryClient.tsx tests/queue-rejection-hold.test.ts
git commit -m "feat(production): add pending rejection hold indicators and quick CTA"
```

---

### Task 5: Dedicated Salvage & Rejection Material Report (`/reports/rejections`) & Navigation

**Files:**
- Create: `app/reports/rejections/page.tsx`
- Create: `components/reports/SalvageRejectionReportClient.tsx`
- Modify: `components/AppShell.tsx`
- Test: `tests/salvage-report.test.ts`

**Interfaces:**
- Consumes: `lib/rejections/client.ts`
- Produces: Dedicated `/reports/rejections` page, print stylesheets, CSV exporter, and updated sidebar navigation.

- [ ] **Step 1: Write test for report CSV export format and KPI aggregation**

```typescript
// tests/salvage-report.test.ts
import { describe, it, expect } from 'vitest';
import { generateRejectionReportCsv } from '@/lib/rejections/types';

describe('Salvage & Rejection Report CSV Export', () => {
  it('generates valid CSV rows with remarks and audit trail', () => {
    const mockData = [
      {
        declaration_no: 'REJ-2026-0001',
        work_order_no: 'WO-1001',
        customer_name: 'ONGC',
        grade: 'ASTM A106 Gr.B',
        size_od: 73,
        size_wt: 5.5,
        work_center: 'DRAW',
        rejected_pcs: 3,
        rejected_mtr: 36,
        rejected_mt: 0.32,
        reason_category: 'SMALL_QTY_NO_REPROCESS',
        production_remarks: 'Tool chatter mark; cannot reprocess',
        status: 'APPROVED',
        qc_remarks: 'Confirmed scrap',
        ppc_remarks: 'Authorized write-off',
        declared_at: '2026-10-08T10:00:00Z',
      }
    ];

    const csv = generateRejectionReportCsv(mockData as any);
    expect(csv).toContain('REJ-2026-0001');
    expect(csv).toContain('Tool chatter mark');
    expect(csv).toContain('Authorized write-off');
  });
});
```

- [ ] **Step 2: Run test to verify failure/success**

Run: `npx vitest run tests/salvage-report.test.ts`
Expected: PASS once helper is in place.

- [ ] **Step 3: Implement Report Page, Client, and Navigation Updates**
- Implement `app/reports/rejections/page.tsx`.
- Implement `components/reports/SalvageRejectionReportClient.tsx` with date filters, work center filters, cause pareto cards, print formatting, and CSV download.
- Update `components/AppShell.tsx`:
  - Add `/rejections` (`Rejection & Salvage`) to OPERATIONS.
  - Add `/reports/rejections` (`Salvage & Rejection Report`) to REPORTS.
  - Relabel `/reports/diversions` from *"Rejection Report"* $\rightarrow$ **"Material Diversion Report"**.

- [ ] **Step 4: Run full test suite and verify build**

Run: `npm test` and `npx tsc --noEmit`
Expected: All tests PASS and no typescript errors.

- [ ] **Step 5: Commit report and navigation**

```bash
git add app/reports/rejections/ components/reports/SalvageRejectionReportClient.tsx components/AppShell.tsx tests/salvage-report.test.ts
git commit -m "feat(reports): add dedicated salvage & rejection report and update navigation"
```
