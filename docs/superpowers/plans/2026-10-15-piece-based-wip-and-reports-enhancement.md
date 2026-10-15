# Piece-Based WIP Ledger & Reports Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transition upstream WIP balancing to direct physical piece (`PCS`) accounting with campaign downstream clearance, keep work orders 100% live while $\ge 1\text{ PC}$ remains in WIP, add VDI Salvage Qty to the Aging Report, and add Order Status to the Size-Grade WIP Matrix.

**Architecture:** 
1. Database migration updating `vw_route_stage_wip` and `vw_wip_aging` to enforce piece-based stage balancing upstream, campaign-wide downstream deduction, and persistent visibility for any order with $\ge 1\text{ PC}$ in WIP.
2. Frontend and helper updates in `lib/reports/agingReportHelper.ts` and `components/reports/AgingReportClient.tsx` adding the VDI Salvage Qty column directly before Physical WIP.
3. Matrix and ledger enhancement in `components/reports/SizeGradeWipReportClient.tsx` projecting `wo.status` and `balance_qty_pcs` so users can immediately distinguish active balance-to-make orders.

**Tech Stack:** PostgreSQL (Supabase SQL Views), Next.js, React, TypeScript, TailwindCSS.

**Spec:** User instructions in session:
- Base WIP upstream on physical pieces (PCS) instead of elongated meters.
- Work orders MUST remain LIVE as long as even a single PC ($\ge 1\text{ PC}$) remains in WIP against that order.
- Add VDI Salvage QTY column before Physical WIP QTY in the Aging Report.
- Add Order Status in the WIP Matrix (both Matrix contributing drawer and Ledger view) to indicate if an order has balance to make.

## Global Constraints
- WCAG 2.1 AA accessible typography and contrast ratios ($\ge 4.5:1$).
- Tabular numbers formatted with `font-mono tabular-nums text-right`.
- Zero broken tests in `tests/business-rules.test.ts` and `tests/aging-report.test.ts`.

---

### Task 1: Update SQL Views for Piece-Based Balancing & Campaign Downstream Clearance

**Files:**
- Create: `supabase/migrations/072_piece_based_stage_wip_and_campaign_clearance.sql`
- Test: `scripts/verify_sql_wip_update.js`

- [ ] **Step 1: Write migration `072_piece_based_stage_wip_and_campaign_clearance.sql`**
  - Update `vw_route_stage_wip`:
    - Incorporate downstream campaign piece counts in `downstream_passed_qty` (child finishing bundles included).
    - Upstream of Band Saw, compute WIP directly in whole integer Pieces (`PCS`), then multiply by average length for meters.
    - Ensure `current_wip > 0` condition keeps orders live as long as $\ge 1\text{ PC}$ exists at any stage.
    - Recreate dependent views `vw_wip_aging` and `vw_dashboard_kpis`.
- [ ] **Step 2: Apply migration to Supabase using postgres connection or migration runner script**
- [ ] **Step 3: Run verification script on WO 6355 and active orders**
  - Verify WO 6355 Heat Treatment WIP is now 0 PCS (downstream 1,336 pcs finished).
  - Verify any active work order with real remaining pieces remains LIVE with positive PCS.

---

### Task 2: Add VDI Salvage QTY Column in Aging Report

**Files:**
- Modify: `lib/reports/agingReportHelper.ts`
- Modify: `components/reports/AgingReportClient.tsx`
- Test: `tests/aging-report.test.ts`

- [ ] **Step 1: Update `AgingRow` interface and computation in `agingReportHelper.ts`**
  - Add `vdi_salvage_pcs` and `vdi_salvage_mtr` to `AgingRow`.
  - In `computeAgingReportRows` and `normalizeAgingRow`, extract `vdi_salvage_pcs` and `vdi_salvage_mtr` from `qcInspections` / view.
- [ ] **Step 2: Update `AgingReportClient.tsx` Table and Excel Export**
  - Add `<th className="py-2.5 px-3 text-right">VDI Salvage QTY</th>` directly before `Physical WIP (PCS / MTR)`.
  - Render the VDI Salvage pieces and meters badge in the cell.
  - Include VDI Salvage in the Excel export columns.
- [ ] **Step 3: Run vitest on `tests/aging-report.test.ts` to ensure all tests pass**

---

### Task 3: Add Order Status & Balance in WIP Matrix

**Files:**
- Modify: `components/reports/SizeGradeWipReportClient.tsx`
- Test: `tests/wip-matrix.test.ts`

- [ ] **Step 1: Update `ContributingOrder` and raw WIP mapping in `SizeGradeWipReportClient.tsx`**
  - Include `order_status` (`wo.status`) and `balance_qty_pcs` / `balance_qty_mtr` in mapped rows.
- [ ] **Step 2: Render Order Status in Matrix View Contributing Drawer**
  - Add `Status` column with styled badge (`In Progress`, `Pending Plan`, `Completed`, `Scheduled`).
  - Show balance to make indicator.
- [ ] **Step 3: Render Order Status in Ledger View Table**
  - Add `Order Status` column and badge in the ledger view table.
- [ ] **Step 4: Verify rendering and build check**
