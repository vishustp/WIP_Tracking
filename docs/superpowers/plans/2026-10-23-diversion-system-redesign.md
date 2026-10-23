# Material Diversion System & Mobile-First Interface Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the mill diversion workflow with dual transfer modes (Direct Transfer vs. Cut & Divert), STP 9.5m hollow constraint enforcement, automatic remnant pool ($\ge 3.0\text{ m}$) & scrap floor ($< 3.0\text{ m}$) handling, cold draw elongation calculation, soft target over-allocation warning, and a mobile-friendly responsive UI.

**Architecture:** Split the monolithic diversion form into modular components (`DirectTransferSection`, `CutAndDivertSection`, `OffcutPoolManager`, `DrawReductionBadge`) backed by thoroughly tested pure calculation utilities (`lib/diversionCalculations.ts`). Use tabbed navigation to separate entry, remnants pool, and logs, with a mobile sticky action drawer for field usability.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, Lucide Icons, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-23-diversion-system-redesign.md`

## Global Constraints
- WCAG 2.1 AA accessibility and minimum $44\text{px}$ touch targets on all mobile inputs.
- Mill Rule 5B: Remnants $< 3.0\text{ m}$ are automatically logged as Cutting Scrap.
- Mill Rule 5C: Remnants $\ge 3.0\text{ m}$ are tracked as Usable Off-cuts.
- Standard STP Hollow limit: Warning and cut prompt when hollow length $> 9.5\text{ m}$.
- Target Over-allocation: Informational warning only, never blocks submission.
- Zero fractional rounding discrepancies between Pieces and Meters.

## Review Focus
1. Remnant under $3.0\text{ m}$ must never be eligible for diversion pool; must be marked as scrap.
2. Cold draw pass with $\text{OD}_{\text{source}} < \text{OD}_{\text{target}}$ must return invalid/error.
3. Mobile layout on small viewports ($< 640\text{px}$) must display all controls without horizontal overflow.
4. Pieces and meters synchronization must preserve discrete physical piece counts.
5. Soft warning on target order over-allocation must allow successful form submission.

---

### Task 1: Core Diversion & Cut-Split Calculation Library with Unit Tests

**Files:**
- Create: `lib/diversionCalculations.ts`
- Create: `tests/diversion-calculations.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export interface CutSplitItem {
    target_wo_id: string;
    target_stage_code: string;
    cut_length: number;
    cuts_per_pipe?: number;
  }

  export interface RemnantAnalysis {
    remnant_length: number;
    total_remnant_mtr: number;
    classification: 'SCRAP' | 'USABLE_OFFCUT';
    is_scrap: boolean;
    is_usable_offcut: boolean;
  }

  export function calcCutSplitRemnant(
    motherLength: number,
    motherPcs: number,
    splits: CutSplitItem[]
  ): RemnantAnalysis;

  export function validateColdDrawReduction(
    sourceOd: number,
    sourceWt: number,
    targetOd: number,
    targetWt: number
  ): {
    isValid: boolean;
    errorReason?: string;
    areaReductionPct: number;
    elongationFactor: number;
  };

  export function checkStpHollowLimit(lengthMtr: number): {
    exceedsLimit: boolean;
    limitMtr: number;
  };

  export function calcOrderBalanceSurplus(
    divertedMtr: number,
    orderedMtr: number,
    producedMtr: number
  ): {
    remainingBefore: number;
    surplusMtr: number;
    isOverAllocated: boolean;
  };
  ```

- [ ] **Step 1: Write the failing unit tests in `tests/diversion-calculations.test.ts`**
  Cover:
  - 10m pipe cut to 7m $\implies$ 3m remnant (USABLE_OFFCUT, Rule 5C).
  - 10m pipe cut to 8.5m $\implies$ 1.5m remnant (SCRAP, Rule 5B hard floor).
  - 10m hollow entering STP $\implies$ `exceedsLimit: true` ($> 9.5\text{ m}$).
  - Cold draw $38.1\times 3.5 \to 30.0\times 2.6$ valid with positive area reduction and elongation factor $> 1.0$.
  - Cold draw $30.0\times 2.6 \to 38.1\times 3.5$ invalid (expansion impossible).
  - Target order 1000m ordered, 800m produced, 300m diverted $\implies$ 100m surplus, `isOverAllocated: true`.

- [ ] **Step 2: Run test to verify it fails**
  Run: `npx vitest run tests/diversion-calculations.test.ts`
  Expected: FAIL (module not found).

- [ ] **Step 3: Implement `lib/diversionCalculations.ts`**
  Implement pure calculation logic with mathematical precision.

- [ ] **Step 4: Run test to verify it passes**
  Run: `npx vitest run tests/diversion-calculations.test.ts`
  Expected: PASS (all tests pass).

- [ ] **Step 5: Commit**
  Run: `git add lib/diversionCalculations.ts tests/diversion-calculations.test.ts; git commit -m "feat(diversion): add pure calculation utilities for cut splits and draw reduction"`

---

### Task 2: Cold Draw Metallurgy & STP Limit UI Badge Components

**Files:**
- Create: `components/diversions/DrawReductionBadge.tsx`
- Create: `components/diversions/StpConstraintAlert.tsx`

**Interfaces:**
- Consumes: `validateColdDrawReduction`, `checkStpHollowLimit` from `lib/diversionCalculations.ts`.
- Produces:
  ```typescript
  export function DrawReductionBadge({
    sourceOd,
    sourceWt,
    targetOd,
    targetWt,
    divertedMtr
  }: { sourceOd: number; sourceWt: number; targetOd: number; targetWt: number; divertedMtr: number }): JSX.Element | null;

  export function StpConstraintAlert({
    pipeLength,
    onSwitchToCutMode
  }: { pipeLength: number; onSwitchToCutMode?: () => void }): JSX.Element | null;
  ```

- [ ] **Step 1: Create `components/diversions/DrawReductionBadge.tsx`**
  Renders clean industrial badges for Area Reduction %, Elongation Factor, and Expected Drawn Meters when target stage is `DRAW`.

- [ ] **Step 2: Create `components/diversions/StpConstraintAlert.tsx`**
  Renders an amber alert with a 1-click button to switch to "Cut & Divert" mode when pipe length $> 9.5\text{ m}$ for STP stages.

- [ ] **Step 3: Verify TypeScript compilation**
  Run: `npx tsc --noEmit`
  Expected: PASS with 0 errors.

- [ ] **Step 4: Commit**
  Run: `git add components/diversions/DrawReductionBadge.tsx components/diversions/StpConstraintAlert.tsx; git commit -m "feat(diversion): add draw reduction badge and STP constraint alert components"`

---

### Task 3: Cut & Divert Multi-Split Form Section (Mode B)

**Files:**
- Create: `components/diversions/CutAndDivertSection.tsx`

**Interfaces:**
- Consumes: `calcCutSplitRemnant`, `CutSplitItem` from `lib/diversionCalculations.ts`.
- Produces: Interactive mobile-first split cutting form allowing:
  - Mother pipe length and count input.
  - Cut Split 1 (Target WO A).
  - Optional Cut Split 2 (Target WO B).
  - Live Remnant & Scrap calculation pill: shows remaining length, total meters, and classifies as `USABLE_OFFCUT` ($\ge 3.0\text{ m}$) or `SCRAP` ($< 3.0\text{ m}$).

- [ ] **Step 1: Build `CutAndDivertSection.tsx`**
  Implement responsive grid layout, touch-friendly inputs, live remnant balance bar, and validation blocking cut lengths exceeding mother pipe length.

- [ ] **Step 2: Verify TypeScript compilation**
  Run: `npx tsc --noEmit`
  Expected: PASS with 0 errors.

- [ ] **Step 3: Commit**
  Run: `git add components/diversions/CutAndDivertSection.tsx; git commit -m "feat(diversion): add CutAndDivertSection component for multi-split cutting"`

---

### Task 4: Dedicated Off-cuts & Remnants Pool Manager

**Files:**
- Create: `components/diversions/OffcutPoolManager.tsx`

**Interfaces:**
- Produces:
  ```typescript
  export function OffcutPoolManager({
    onDivertRemnant,
    canManagePlans
  }: {
    onDivertRemnant: (remnant: any) => void;
    canManagePlans: boolean;
  }): JSX.Element;
  ```
- Queries `diversion_plans` or remnant records with `[OFFCUT_REMNANT: ...]` tags.
- Renders responsive table/card list with:
  - Source WO, Grade, Size, Piece Length, Pieces, Total Meters.
  - Quick action buttons: **[Divert to Order]**, **[Declare Commercial]**, **[Scrap]**.

- [ ] **Step 1: Implement `OffcutPoolManager.tsx`**
  Include mobile card layout for small screens and compact tabular view for desktop.

- [ ] **Step 2: Verify TypeScript compilation**
  Run: `npx tsc --noEmit`
  Expected: PASS with 0 errors.

- [ ] **Step 3: Commit**
  Run: `git add components/diversions/OffcutPoolManager.tsx; git commit -m "feat(diversion): add OffcutPoolManager for tracking and reallocating usable remnants"`

---

### Task 5: Mobile-First Responsive Shell Integration & Sticky Action Bar

**Files:**
- Modify: `components/diversions/DiversionForm.tsx`

**Interfaces:**
- Integrates:
  - Top View Tabs: `[Issue Diversion]`, `[Off-cuts & Remnants Pool]`, `[Diversion History]`.
  - Operational Mode Switch: `[Direct Transfer]` vs `[Cut & Divert]`.
  - Draw Reduction Badge and STP Constraint Alert.
  - Soft Target Over-allocation Alert (amber warning badge, does not disable submit).
  - Mobile Sticky Bottom Action Drawer (shows active net transfer meters/pcs and submit button).
  - Synchronized Pieces $\longleftrightarrow$ Meters input handlers.

- [ ] **Step 1: Refactor `DiversionForm.tsx`**
  Integrate all modular sections, mobile responsive classes (`min-h-[44px]` touch targets, responsive grid stacking, sticky bottom bar on mobile).

- [ ] **Step 2: Run test suite to verify no regressions**
  Run: `npm test`
  Expected: All test suites PASS.

- [ ] **Step 3: Run full production build**
  Run: `npm run build`
  Expected: Compiled successfully with exit code 0.

- [ ] **Step 4: Commit and Push**
  Run: `git add components/diversions/DiversionForm.tsx; git commit -m "feat(diversion): complete mobile-friendly diversion console with dual modes and remnants pool"; git push origin main`
