# Optimize Process Sheet (Format F-PROD-11) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **NOTE: All changes must remain LOCAL only. DO NOT commit or push.**

**Goal:** Deconstruct the monolithic 3,630-line `ProcessSheetReportClient.tsx` into clean, high-performance modular subcomponents with unified state management and enhance the metallurgical auto-population engine.

**Architecture:** 
1. Create a dedicated spec pre-fill helper in `lib/metallurgy/processSheetSpecHelper.ts` with comprehensive unit tests for auto-populating chemistry limits, mechanical properties, furnace temperatures, Barlow hydro pressure, and minimum-wall tolerances.
2. Decompose the presentation into modular components under `components/reports/process-sheet/` (Order Details, Hot Mill, Metallurgy/Chemistry, Testing/Thermal, Finishing/Marking, and Printable F-PROD-11 Document).
3. Refactor `ProcessSheetReportClient.tsx` into a lightweight, high-performance coordinator (~350 lines) with memoized plan selection and fast initial loading.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, Lucide React, Vitest.

## Global Constraints
- All changes must remain **local**; do not run `git commit` or `git push`.
- Format F-PROD-11 print layout and styling must be strictly preserved for shop floor issuance.
- Respect minimum wall tolerance rules (e.g. ASTM A210, A213, A192, A179: +20% / -0% for MW; +15% / -12.5% for standard).
- Barlow hydrostatic test pressure formula: $P = \frac{2 \cdot S \cdot t}{D}$ with standard capping (e.g. 2500 PSI) and nearest-50 PSI rounding.

## Review Focus
1. Spec master fuzzy matching: correctly handles grade variations (e.g. `A106 Gr B` vs `A106-B` vs `SA106`).
2. Minimum wall tolerance vs nominal wall tolerance toggling preserves accurate OD/WT tolerances.
3. Chemistry element limits (C, Mn, P, S, Si, Cr, Mo, Ni, Cu, V) pre-fill without clobbering user overrides.
4. Clean `@media print` layout without clipping or accidental page breaks.
5. Fast selection response when switching between rolling plans / work orders.

---

### Task 1: Spec Auto-Population & Metallurgical Pre-Fill Helper

**Files:**
- Create: `lib/metallurgy/processSheetSpecHelper.ts`
- Test: `tests/process-sheet-spec-helper.test.ts`

**Interfaces:**
- Consumes: `RollingPlanRecord`, `SpecMasterRecord`, `DEFAULT_SPEC_MASTER_RECORDS`, `calculateHydroPressurePsi`, `calculateStandardTolerances`.
- Produces: `autoPopulateProcessSheet(plan, specMasterList)` returning complete pre-filled form state.

- [ ] **Step 1: Write the failing test**
Create `tests/process-sheet-spec-helper.test.ts` with tests for:
  - Matching ASTM A106 Gr B and auto-populating SMYS (240 MPa), UTS (415 MPa), Barlow hydro pressure, temperatures (WHF 1220°C, Induction 850-880°C).
  - Minimum wall tolerance rule (+20% / -0% min wall) for ASTM A210/A213.
  - Single and triple stencil marking construction.

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run tests/process-sheet-spec-helper.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement `autoPopulateProcessSheet` in `lib/metallurgy/processSheetSpecHelper.ts`**
Implement:
  - `findMatchingSpecMaster(specGrade, specMasterList)`
  - `computeDimensionalTolerances(od, wt, spec, route)`
  - `computeBundleCalculations(kgMtr, avgLen)`
  - `autoPopulateProcessSheet(plan, specMasterList)`

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run tests/process-sheet-spec-helper.test.ts`
Expected: PASS.

---

### Task 2: Modular Sub-components for Process Sheet Form

**Files:**
- Create: `components/reports/process-sheet/ProcessSheetOrderDetails.tsx`
- Create: `components/reports/process-sheet/ProcessSheetHotMillSection.tsx`
- Create: `components/reports/process-sheet/ProcessSheetMetallurgySection.tsx`
- Create: `components/reports/process-sheet/ProcessSheetTestingSection.tsx`
- Create: `components/reports/process-sheet/ProcessSheetFinishingSection.tsx`
- Create: `components/reports/process-sheet/types.ts`

**Interfaces:**
- Consumes: Form state and onChange handlers.
- Produces: Clean, reusable, isolated form section cards with high-density industrial styling.

- [ ] **Step 1: Define shared Process Sheet Form State types in `types.ts`**
Extract all form state fields into clean TypeScript interfaces (`ProcessSheetFormData`, `ProcessSheetFormActions`).

- [ ] **Step 2: Create `ProcessSheetOrderDetails.tsx`**
Section for Sheet No, Rev No, Order Type, WO No, WO Date, Customer, Destination, PO No, PO Date, Material Code, Order Qty, Delivery Date.

- [ ] **Step 3: Create `ProcessSheetHotMillSection.tsx`**
Section for Billet Sizing (Dia, Sect Wt, Length), Piercer Mill (OD, WT, Shell Len, Shell Wt), and Sizing Mill (OD, WT, SM Length, Final HFS Length).

- [ ] **Step 4: Create `ProcessSheetMetallurgySection.tsx`**
Section for Spec Master selection, Minimum Wall toggle, Chemical composition table (C, Mn, P, S, Si, Cr, Mo, Ni, Cu, V, Nb), and Mechanical properties (SMYS, UTS, Elongation, Hardness, Straightness).

- [ ] **Step 5: Create `ProcessSheetTestingSection.tsx`**
Section for Furnace temperatures (WHF, Induction, Sizing outlet), Heat Treatment cycles & conditions, Holding time, Barlow Hydrostatic pressure, and NDT test methods.

- [ ] **Step 6: Create `ProcessSheetFinishingSection.tsx`**
Section for Marking stencil strings (Single & Triple), Pipe color code, RM color code, Coating, End condition, Bundling, Bundle Qty (pcs), Bundle Weight (MT), and End caps.

---

### Task 3: Printable Format F-PROD-11 Document Sub-component

**Files:**
- Create: `components/reports/process-sheet/ProcessSheetPrintDocument.tsx`

**Interfaces:**
- Consumes: `ProcessSheetFormData`.
- Produces: Pixel-perfect, high-contrast print layout for official Rashmi Seamless Format F-PROD-11 issuance.

- [ ] **Step 1: Implement `ProcessSheetPrintDocument.tsx`**
Extract and refine the printable Format F-PROD-11 document:
  - Header: RASHMI SEAMLESS logo, Format No: F-PROD-11, Document Title: PROCESS SHEET FOR SEAMLESS PIPE.
  - Structured tables: Order Details, Piercer/Billet, Sizing/Final, Chemical & Mechanical Specs, Testing & HT, Marking & Bundling.
  - Signatures footer: Prepared By (PPC), Checked By (Quality), Approved By (Plant Head).
  - Print styles with `@media print` pagination and borders.

---

### Task 4: Refactor Main Coordinator `ProcessSheetReportClient.tsx`

**Files:**
- Modify: `components/reports/ProcessSheetReportClient.tsx`

**Interfaces:**
- Consumes: Subcomponents from `components/reports/process-sheet/`, `autoPopulateProcessSheet` from `lib/metallurgy/processSheetSpecHelper.ts`.
- Produces: Main client page with plan selector, tab filter navigation, preview toggle, and quick-save.

- [ ] **Step 1: Simplify `ProcessSheetReportClient.tsx`**
Replace monolithic 3,630-line code with:
  - Unified `formData` state object.
  - Plan search & selection bar.
  - Tab filters (`All`, `Order Details`, `Hot Mill`, `Metallurgy`, `Testing & HT`, `Marking & Packing`).
  - Toggle between Interactive Form mode and Print Preview mode.
  - Fast asynchronous loading and error boundaries.

- [ ] **Step 2: Verify component compiles with zero TypeScript errors**
Run: `npx tsc --noEmit`
Expected: 0 errors.

---

### Task 5: End-to-End Test and Production Build Verification

**Files:**
- Test: Full test suite + production build check

- [ ] **Step 1: Run full Vitest test suite**
Run: `npm test`
Expected: All test suites PASS (including `process-sheet-spec-helper.test.ts`).

- [ ] **Step 2: Run production Next.js build**
Run: `npm run build`
Expected: Build passes with exit code 0.

- [ ] **Step 3: Verify working tree state (NO git commit)**
Ensure all changes are saved locally and no commits were made.
