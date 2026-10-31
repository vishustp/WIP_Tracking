# Technical Specification: PPC Stock Generation at Any Stage & Audit Report

## 1. Overview & Business Intent

In seamless steel pipe manufacturing, production planning and control (PPC) often needs to inject or induct physical stock directly into a specific stage of a work order. 

Common shop-floor scenarios include:
1. **Initial / Opening Balance Induction**: Starting WIP tracking for work orders that already have work-in-progress on the shop floor.
2. **Physical Inventory Audit Stock**: Unaccounted mother pipes or cut pipes found during floor audits allocated to an active work order.
3. **External Yard / Inbound Hollow Induction**: Raw or semi-finished hollows sourced externally or moved from cold storage buffers directly into an active processing stage.
4. **Salvaged Stock Conversion / Re-classification**: Diverted or salvaged pipes inducted into a work order stage without going through full preceding stage production logs.

### Key Mill Principles & Rules
1. **Preservation of Shift Production Logs (AGENTS.md Rule 1 & Mass Balance)**:
   - Machine production logs (`production_logs`) represent actual operator run-rates and machine shift output. 
   - Stock generation is an administrative planning intervention by PPC and MUST NOT pollute physical machine shift logs. It is stored in a dedicated ledger table `public.ppc_stock_generations`.
2. **Two Placement Modes (WIP Queue Mechanics)**:
   - **`INCOMING_QUEUE` (Ready for Stage Processing)**: Stock enters Stage $S$ as incoming WIP waiting to be processed. The operator at Stage $S$ sees these pipes in their entry queue ready to be worked on.
     $$\text{Stage Active Queue} = \text{Preceding Stage OK} + \mathbf{\text{PPC Incoming Stock}} - \text{Current Stage OK}$$
   - **`STAGE_OUTPUT` (Already Processed at Stage)**: Stock acts as completed output of Stage $S$. It bypasses Stage $S$ processing and directly feeds the incoming queue of Stage $S+1$.
     $$\text{Downstream Active Queue} = \text{Current Stage OK} + \mathbf{\text{PPC Output Stock}} - \text{Downstream Stage OK}$$
3. **Pipe Dimensional Mass Conservation (AGENTS.md Rule 3 & 4)**:
   - Upstream of Band Saw (Draw Bench, Heat Treatment): Pipes are tracked as **Mother Pipes (Long Pipes)** with meters and tonnage calculated from mother hollow dimensions.
   - At Band Saw and Downstream (VDI, Finishing): Pipes are tracked as **Cut Pieces** with meters and tonnage calculated from finished customer order dimensions ($L_1 / L_2$, OD, WT).
4. **Full Auditability & Cancellation**:
   - Every stock generation is assigned a unique, immutable sequence identifier (e.g., `STK-GEN-202610-0001`).
   - Any PPC generation entered in error can be cancelled/voided by PPC or Admin with an explicit mandatory reason, restoring original WIP balances without physical data deletion.

---

## 2. Data Architecture & Schema Changes

### 2.1 Database Ledger Table (`public.ppc_stock_generations`)
Created via migration `087_ppc_stock_generation.sql`:

```sql
CREATE TABLE IF NOT EXISTS public.ppc_stock_generations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    generation_no TEXT UNIQUE NOT NULL,
    work_order_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE RESTRICT,
    stage_id UUID NOT NULL REFERENCES public.process_stages(id) ON DELETE RESTRICT,
    stage_code TEXT NOT NULL,
    stock_type TEXT NOT NULL CHECK (stock_type IN ('INCOMING_QUEUE', 'STAGE_OUTPUT')),
    pcs INTEGER NOT NULL CHECK (pcs > 0),
    meters NUMERIC(10, 2) NOT NULL CHECK (meters > 0),
    weight_mt NUMERIC(10, 3) NOT NULL CHECK (weight_mt >= 0),
    reason TEXT NOT NULL,
    heat_no TEXT,
    lot_no TEXT,
    remarks TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CANCELLED')),
    created_by UUID REFERENCES auth.users(id),
    created_by_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    cancelled_by UUID REFERENCES auth.users(id),
    cancelled_at TIMESTAMPTZ,
    cancellation_reason TEXT
);

-- Indexes for lightning-fast queue evaluation and report queries
CREATE INDEX idx_ppc_stk_gen_wo_stage ON public.ppc_stock_generations(work_order_id, stage_id, status);
CREATE INDEX idx_ppc_stk_gen_status ON public.ppc_stock_generations(status);
CREATE INDEX idx_ppc_stk_gen_created_at ON public.ppc_stock_generations(created_at DESC);
```

### 2.2 Generation Number Generator Function
A stored procedure generates continuous human-readable sequence numbers:
```sql
CREATE OR REPLACE FUNCTION fn_generate_stock_generation_no()
RETURNS TRIGGER AS $$
DECLARE
    v_prefix TEXT;
    v_seq INT;
BEGIN
    v_prefix := 'STK-GEN-' || to_char(NOW(), 'YYYYMM') || '-';
    SELECT COALESCE(MAX(SUBSTRING(generation_no FROM LENGTH(v_prefix) + 1)::INT), 0) + 1
    INTO v_seq
    FROM public.ppc_stock_generations
    WHERE generation_no LIKE v_prefix || '%';

    NEW.generation_no := v_prefix || LPAD(v_seq::TEXT, 4, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_stock_generation_no
BEFORE INSERT ON public.ppc_stock_generations
FOR EACH ROW
WHEN (NEW.generation_no IS NULL OR NEW.generation_no = '')
EXECUTE FUNCTION fn_generate_stock_generation_no();
```

---

## 3. WIP Queue & Balance Integration

### 3.1 Production Queue API (`app/api/production/queue/route.ts`)
The Queue API calculates available WIP for each stage in an active work order's route.
1. Fetch all `ACTIVE` records from `ppc_stock_generations`.
2. Group by `(work_order_id, stage_id / stage_code)`.
3. In stage balance calculation:
   * **`INCOMING_QUEUE`**: Added to `ready_pcs` and `ready_mtr` for that work order at stage $S$.
   * **`STAGE_OUTPUT`**: Added to the cumulative OK output of stage $S$, which automatically increases the available queue for stage $S+1$ in the route.

### 3.2 Size-Grade WIP Matrix & Reports (`/reports/wip`, `/reports/tracking`)
* Active stock generations are incorporated into the stage WIP totals in `lib/reports/agingReportHelper.ts` and `vw_route_stage_wip` so that high-level dashboards and detailed shop-floor screens maintain 100% mathematical parity.

---

## 4. User Interface & Workflow

### 4.1 Stock Generation Form (`/stock-generation`)
Located at `app/stock-generation/page.tsx` and `components/stock-generation/StockGenerationFormClient.tsx`:
* **Access Control**: Restricted to PPC and Admin (`isPpcOrAdminUser`). Non-PPC users see an informative read-only banner.
* **Work Order Selection**: Searchable dropdown showing Work Order No, Customer, Size (OD × WT), Grade, Route, and Target Quantity.
* **Stage Selection**: Dropdown populated strictly with stages configured in the selected work order's route.
* **Stock Placement Toggle**:
  * Option 1: `Incoming Queue` ("Waiting to be processed at this Stage")
  * Option 2: `Stage Output` ("Already completed at this Stage, ready for next Stage")
* **Quantities**:
  * **Pieces (Nos)**: Dynamic helper label ("Mother Pipes" for Draw/HT/HTC; "Cut Pieces" for Band Saw/VDI/Finishing).
  * **Total Meters (m)**: Auto-calculated when piece count is entered using standard length ($L_1 / L_2$), with manual override enabled.
  * **Tonnage (MT)**: Auto-computed using standard pipe mass formula:
    $$\text{MT} = \frac{\pi \times (\text{OD} - \text{WT}) \times \text{WT} \times 0.0246615 \times \text{Meters}}{1000}$$
* **Metadata & Reason**:
  * Category / Reason selector:
    * `Opening Balance Induction`
    * `Physical Stock Audit`
    * `External Yard / Buffer Inbound`
    * `Salvaged Stock Conversion`
    * `Customer Return / Re-induction`
    * `Other (Specify in Remarks)`
  * Heat / Cast No (optional)
  * Lot / Bundle No (optional)
  * Detailed Remarks / Justification
* **Validation & Confirmation**:
  * Validates positive pieces and meters.
  * Modal dialog summarizing induction details before saving.
  * Success toast notification with direct link to view the entry in the Stock Generation Report.

### 4.2 PPC Stock Generation Report (`/reports/stock-generation`)
Located at `app/reports/stock-generation/page.tsx` and `components/reports/StockGenerationReportClient.tsx`:
* **KPI Header Cards**:
  * Total Stock Generated (MT)
  * Total Pieces (Nos)
  * Total Meters (m)
  * Active Records Count
* **Filters Bar**:
  * Date range selector (Today, Yesterday, Last 7 Days, This Month, Custom Date Range).
  * Work Order searchable selector.
  * Stage multi-select filter.
  * Reason filter.
  * Status filter (`All`, `Active`, `Cancelled`).
* **Interactive Table**:
  * Columns: Date/Time, Generation No, Work Order No, Customer, Size (OD × WT), Grade, Stage, Placement Type, Pieces, Meters, Weight (MT), Heat No, Reason, Created By, Status Badge.
* **Row Actions**:
  * "Cancel / Void" action (PPC/Admin only) with a confirmation dialog requiring a cancellation reason. Once cancelled, the stock is immediately deducted from the queue.
* **Excel Export**:
  * Generates clean `.xlsx` file using the established Excel export utility with proper numeric formatting and column auto-sizing.

---

## 5. Navigation & Permissions Integration

1. **Sidebar Navigation (`components/AppShell.tsx`)**:
   * Add `/stock-generation` to **Planning** section with `PackagePlus` icon.
   * Add `/reports/stock-generation` to **Reports** section with `Layers` icon.
2. **Permissions Helper (`lib/permissions.ts`)**:
   * Add `canManageStockGeneration(user, group)` returning true for PPC and Admin.
   * Add route visibility rules for `/stock-generation` and `/reports/stock-generation`.

---

## 6. Verification & Automated Testing Plan

1. **Database Migration Test**:
   * Verify table creation, constraints, sequence number trigger, and RLS policies.
2. **Unit & Integration Tests (`tests/ppc-stock-generation.test.ts`)**:
   * Test inserting `INCOMING_QUEUE` stock and verifying that the queue API increases available ready pieces.
   * Test inserting `STAGE_OUTPUT` stock and verifying that the downstream stage queue increases.
   * Test cancellation of a stock generation and verifying that queue balances revert to original.
   * Test mass calculation accuracy ($\text{OD} \times \text{WT} \times \text{Meters} \to \text{MT}$).
3. **Report & Excel Export Test (`tests/ppc-stock-generation-report.test.ts`)**:
   * Verify filter logic (date range, stage, work order).
   * Verify workbook generation and data structure.
4. **End-to-End Build & Suite Verification**:
   * Run full Vitest suite (all 72+ test files).
   * Run `npm run build` to ensure zero TypeScript or bundling errors.
