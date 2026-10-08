# Design Specification: Universal Work Center Rejection Declaration, 3-Stage Approval Workflow, and Salvage Report

**Author:** Antigravity  
**Date:** 2026-10-08  
**Status:** Approved  
**Topic:** Rejection Declaration, Quality Verification, PPC Approval, WIP Deduction, and Mill Salvage Reporting  

---

## 1. Executive Summary & Problem Context

In a seamless steel tube manufacturing mill, physical defects and small non-reprocessable remnants can occur across any work center (Hot Rolling, Hollow Heat Treatment, Cold Draw Bench, Pilgering, Final Heat Treatment, Band Saw Cutting, VDI Quality Inspection, and Finishing Line). 

Under the canonical mill rules (**AGENTS.md Rule 2 - Universal Rejection Handling Option B**), rejections and defective remnants do not vanish automatically as unrecorded dead scrap. Instead, they must be rigorously accounted for to prevent phantom material in the shop floor Work-In-Progress (WIP) ledger.

This specification designs:
1. **A Universal Rejection Declaration Form & Console (`/rejections`)** where:
   - **Production Department** logs rejected/salvage pieces with mandatory defect category and detailed remarks explaining why the material was rejected and cannot be reprocessed.
   - **QC Department (QA)** physically inspects, confirms/adjusts quantities, adds metallurgical/inspection findings, and signs off.
   - **PPC Department (Plant Planning & Control)** authorizes write-off/salvage, deducting the approved quantity from the Work Center and Active WIP.
2. **A Dedicated Salvage & Rejection Material Report (`/reports/rejections`)** providing comprehensive analytics, stage-wise defect breakdowns, audit narratives, and export/print capabilities across all mill operations.
3. **Database Architecture & Ledger Recalculation** ensuring mathematically sound deduction from `vw_route_stage_wip`, `recalculate_work_order_wip`, and dashboard KPIs.

---

## 2. Process Routes & Stage Hierarchy

The rejection declaration can originate from any active stage in the mill's four core production routes:
- **HFS:** `ROLLING` $\rightarrow$ `BAND_SAW` $\rightarrow$ `VDI` $\rightarrow$ `FINISHING`
- **ALLOY_HFS:** `ROLLING` $\rightarrow$ `HOLLOW_HEAT_TREATMENT` $\rightarrow$ `BAND_SAW` $\rightarrow$ `VDI` $\rightarrow$ `FINISHING`
- **CDS:** `ROLLING` $\rightarrow$ `DRAW` (or `PILGER`) $\rightarrow$ `HEAT_TREATMENT` $\rightarrow$ `BAND_SAW` $\rightarrow$ `VDI` $\rightarrow$ `FINISHING`
- **ALLOY_CDS:** `ROLLING` $\rightarrow$ `HOLLOW_HEAT_TREATMENT` $\rightarrow$ `DRAW` (or `PILGER`) $\rightarrow$ `HEAT_TREATMENT` $\rightarrow$ `BAND_SAW` $\rightarrow$ `VDI` $\rightarrow$ `FINISHING`

---

## 3. Database Architecture & Schema

### 3.1 New Table: `public.rejection_declarations`
```sql
CREATE TABLE IF NOT EXISTS public.rejection_declarations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  declaration_no text UNIQUE NOT NULL, -- Format: REJ-YYYY-XXXX (e.g., REJ-2026-0001)
  work_order_id uuid NOT NULL REFERENCES public.work_orders(id) ON DELETE RESTRICT,
  process_route_id uuid REFERENCES public.process_routes(id),
  stage_id uuid REFERENCES public.process_stages(id),
  work_center text NOT NULL, -- 'ROLLING' | 'HOLLOW_HEAT_TREATMENT' | 'DRAW' | 'PILGER' | 'HEAT_TREATMENT' | 'BAND_SAW' | 'VDI' | 'FINISHING'

  -- Production Department Declaration
  rejected_pcs numeric NOT NULL CHECK (rejected_pcs >= 0),
  rejected_mtr numeric NOT NULL CHECK (rejected_mtr >= 0),
  rejected_mt numeric NOT NULL CHECK (rejected_mt >= 0),
  heat_lot_no text,
  reason_category text NOT NULL, -- Enum: 'SMALL_QTY_NO_REPROCESS', 'SURFACE_DEFECT', 'WALL_THICKNESS_OFF', 'CRACK', 'BEND', 'DIMENSIONAL_OFF_SPEC', 'OTHER'
  production_remarks text NOT NULL,
  declared_by text NOT NULL,
  declared_by_user_id uuid,
  declared_at timestamptz NOT NULL DEFAULT now(),

  -- Workflow Status
  status text NOT NULL DEFAULT 'PENDING_QC'
    CHECK (status IN ('PENDING_QC', 'PENDING_PPC', 'APPROVED', 'REJECTED_BY_QC', 'REJECTED_BY_PPC')),

  -- Stage 2: QC Department Verification
  qc_verified_pcs numeric,
  qc_verified_mtr numeric,
  qc_verified_mt numeric,
  qc_remarks text,
  qc_verified_by text,
  qc_verified_by_user_id uuid,
  qc_verified_at timestamptz,

  -- Stage 3: PPC Department Authorization
  ppc_approved_pcs numeric,
  ppc_approved_mtr numeric,
  ppc_approved_mt numeric,
  ppc_remarks text,
  ppc_approved_by text,
  ppc_approved_by_user_id uuid,
  ppc_approved_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rejection_declarations_wo ON public.rejection_declarations(work_order_id);
CREATE INDEX IF NOT EXISTS idx_rejection_declarations_wc ON public.rejection_declarations(work_center);
CREATE INDEX IF NOT EXISTS idx_rejection_declarations_status ON public.rejection_declarations(status);
```

### 3.2 Sequence Generator for Declaration Numbers
A PL/pgSQL function or trigger auto-assigns human-readable numbers like `REJ-2026-0001` using a yearly sequence.

### 3.3 WIP Ledger Integration & Deduction Mechanics
In `vw_route_stage_wip` and `recalculate_work_order_wip`:
1. **Approved Rejection Deduction**:
   $$\text{Approved Rejections at Stage} = \sum \text{ppc\_approved\_mtr} \quad \text{where } \text{status} = \text{'APPROVED'} \land \text{work\_center} = \text{stage\_code}$$
2. **Stage Active WIP**:
   $$\text{Stage Active WIP} = \max\Big(\text{Incoming Qty} + \text{Diversion In} - \max(\text{Stage Output}, \text{Downstream Passed}) - \text{Approved Rejections} - \text{Diversion Out}, \; 0\Big)$$
3. **Pending Rejection Hold Flag**:
   $$\text{Pending Rejection Mtr} = \sum \text{rejected\_mtr} \quad \text{where } \text{status} \in (\text{'PENDING\_QC'}, \text{'PENDING\_PPC'}) \land \text{work\_center} = \text{stage\_code}$$
   Work center entry queues display an amber indicator: *"⚠️ X PCS (Y m) Pending Quality / PPC Review"*.

---

## 4. User Experience & Application Architecture

### 4.1 Unified Rejection Board (`/rejections`)
The board serves as the single source of truth for plant rejections, combining all three departmental interactions:
- **KPI Summary Cards**:
  - `Pending QC Verification` (Count)
  - `Pending PPC Approval` (Count)
  - `Approved This Month` (PCS & MT)
  - `Material on Hold` (Active Pending Meters)
- **Filters & Search**:
  - Status Tabs: `All`, `Pending QC`, `Pending PPC`, `Approved`, `Rejected`
  - Work Center selector
  - Search by Work Order #, Customer, Heat / Lot #
- **Action Modals**:
  1. **Declare Rejection Modal (Production)**:
     - Work order picker with active WIP preview.
     - Work center selection.
     - Quantity inputs (Pieces with automatic metric tonne / meter computation based on pipe OD and WT).
     - Standard Defect Category dropdown + mandatory narrative remarks.
  2. **Verify Rejection Modal (QC)**:
     - Review production declaration details.
     - Inspect and adjust verified pieces/meters if partial salvage is possible.
     - Enter mandatory QC inspection remarks.
     - Buttons: `Verify & Submit to PPC` or `Reject / Return to Production`.
  3. **Authorize Modal (PPC)**:
     - Review Production and QC findings.
     - View impact on remaining order piece balance and WIP.
     - Enter PPC remarks.
     - Buttons: `Authorize & Deduct from WIP` or `Reject`.

### 4.2 Dedicated Salvage & Rejection Material Report (`/reports/rejections`)
- Comprehensive historical audit and plant scrap tracking.
- Filterable by date range, work center, reason category, and work order.
- Summary analytics: Total MT loss, Rejection rate %, Cause pareto distribution.
- Full tabular report with complete audit notes (Production narrative, QC verification findings, and PPC write-off approval).
- CSV export & Print view formatted to mill specification standards.

### 4.3 Navigation & AppShell Updates
- Under **OPERATIONS**: Add `/rejections` (`Rejection & Salvage`).
- Under **REPORTS**: Add `/reports/rejections` (`Salvage & Rejection Report`).
- Under **REPORTS**: Relabel `/reports/diversions` to `Material Diversion Report` to avoid ambiguity.

---

## 5. Security & Access Control

- `admin`: Full unrestricted access (Declare, Verify, Approve, Edit, Delete).
- `super_user` / PPC: Can Declare, review QC findings, and execute final **PPC Approval**.
- `qa_inspector` / QA: Can view declarations and execute **QC Verification**.
- `rolling_incharge` / `draw_operator` / Production operators: Can **Declare Rejections** and view declaration status.

---

## 6. Verification & Test Plan

1. **Unit & Database Tests**:
   - Verify creation of `rejection_declarations` with sequential `REJ-YYYY-XXXX` numbering.
   - Verify workflow state transitions: `PENDING_QC` $\rightarrow$ `PENDING_PPC` $\rightarrow$ `APPROVED`.
   - Verify that non-approved items do NOT prematurely deduct from `vw_route_stage_wip`.
   - Verify that upon PPC approval, `current_wip` at the designated work center decreases by the exact approved amount.
2. **UI & End-to-End Workflow Testing**:
   - Operator declares 3 rejected pieces at Draw Bench.
   - Status shows `Pending QC Verification`; hold flag appears on Draw Bench queue.
   - QC Inspector logs in, verifies 3 pieces, enters inspection remarks, submits to PPC.
   - Status shows `Pending PPC Approval`.
   - PPC Manager logs in, reviews notes, authorizes write-off.
   - Active Draw Bench WIP is deducted by 3 pieces; total factory WIP is updated.
   - Report at `/reports/rejections` reflects the transaction with all timestamps and remarks.
