# Seamless Steel Pipe Manufacturing Execution System (MES) & WIP Planning

> **Rashmi Green Hydrogen Steel Pvt. Ltd.**  
> High-precision shop-floor execution, metallurgical ledger tracking, multi-route production planning, and real-time WIP bottleneck monitoring for seamless steel pipe manufacturing.

[![Next.js 15](https://img.shields.io/badge/Next.js-15.1.12-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![React 19](https://img.shields.io/badge/React-19.0.0-blue?style=flat-square&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9.3-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Database-Supabase%20PostgreSQL-3ECF8E?style=flat-square&logo=supabase)](https://supabase.com/)
[![Tests](https://img.shields.io/badge/Tests-42%20suites%20%7C%20291%20passing-brightgreen?style=flat-square)](https://vitest.dev/)

---

## 1. Executive Summary

This system is an industrial-grade Manufacturing Execution System (MES) engineered specifically for **Seamless Steel Pipe & Tube Mills**. It replaces spreadsheet-based scheduling and fragmented ledger tracking with a single, synchronized platform that preserves metallurgical mass conservation, tracks physical mother pipes through elongation and saw cutting, enforces quality salvages, and tracks shop-floor stagnation in real time.

---

## 2. Core Manufacturing Routes

Every Work Order and Rolling Plan is routed through one of five standard mill production sequences:

```mermaid
graph TD
    classDef route fill:#f8fafc,stroke:#334155,stroke-width:1px;
    classDef stage fill:#ffffff,stroke:#0284c7,stroke-width:2px;

    subgraph CDS["Standard CDS (Cold Drawn Seamless)"]
        R1[Hot Rolling Mill] --> HTC1[HTC Inspection]
        HTC1 --> DB1[Cold Draw Bench]
        DB1 --> HT1[Heat Treatment Furnace]
        HT1 --> BS1[Band Saw Cutting]
        BS1 --> VDI1[VDI Inspection]
        VDI1 --> FIN1[Finishing & Dispatch]
    end

    subgraph ALLOY_CDS["Alloy CDS (Alloy Cold Drawn Seamless)"]
        R2[Hot Rolling Mill] --> HTC2[HTC Inspection]
        HTC2 --> HHT2[Hollow Heat Treatment]
        HHT2 --> DB2[Cold Draw Bench]
        DB2 --> HT2[Final Heat Treatment]
        HT2 --> BS2[Band Saw Cutting]
        BS2 --> VDI2[VDI Inspection]
        VDI2 --> FIN2[Finishing & Dispatch]
    end

    subgraph HFS["HFS (Hot Finished Seamless)"]
        R3[Hot Rolling Mill] --> HTC3[HTC Inspection]
        HTC3 --> BS3[Band Saw Cutting]
        BS3 --> VDI3[VDI Inspection]
        VDI3 --> FIN3[Finishing & Dispatch]
    end

    subgraph ALLOY_HFS["Alloy HFS (Alloy Hot Finished Seamless)"]
        R4[Hot Rolling Mill] --> HTC4[HTC Inspection]
        HTC4 --> HHT4[Hollow Heat Treatment]
        HHT4 --> BS4[Band Saw Cutting]
        BS4 --> VDI4[VDI Inspection]
        VDI4 --> FIN4[Finishing & Dispatch]
    end

    subgraph SS_STEEL["SS_STEEL (Stainless Steel Pilger)"]
        R5[Hot Rolling Mill] --> HTC5[HTC Inspection]
        HTC5 --> PLG5[Cold Pilger Mill]
        PLG5 --> HT5[Final Solution HT]
        HT5 --> BS5[Band Saw Cutting]
        BS5 --> VDI5[VDI Inspection]
        VDI5 --> FIN5[Finishing & Dispatch]
    end
```

---

## 3. Metallurgical & Shop-Floor Business Rules

The platform strictly enforces the following engineering and accounting rules across both the database views/RPCs and the React client applications:

### Rule 1: Mass Conservation & Dimensional Metrics
- **Metric Tonnes (MT) Formula:**
  $$\text{MT} = (\text{OD} - \text{WT}) \times \text{WT} \times 0.0246615 \times 10^{-3} \times \text{Meters}$$
- **Cold Drawing Elongation:**
  Cold drawing reduces Outer Diameter (OD) and Wall Thickness (WT) while elongating length to conserve mass:
  $$\text{Elongation Factor} = \frac{(\text{OD}_{\text{MH}} - \text{WT}_{\text{MH}}) \times \text{WT}_{\text{MH}}}{(\text{OD}_{\text{Fin}} - \text{WT}_{\text{Fin}}) \times \text{WT}_{\text{Fin}}}$$
- **Mother Hollow Dimensions:** Upstream stages (`ROLLING`, `HOLLOW_HEAT_TREATMENT`, `DRAW`) use Mother Hollow dimensions (`mh_od`, `mh_wt`, `mh_avg_length`) rather than finished pipe geometry.

### Rule 2: Direct Stage-to-Stage Balancing (No "Supply Process")
- There is no physical or clerical intermediate "Supply" queue. Stage WIP is calculated directly:
  $$\text{Stage Active WIP} = \text{Preceding Stage OK} - \text{Current Stage OK}$$
- **Feeders:**
  - Standard CDS: $\text{Draw Bench Queue} = \text{Rolling HTC OK} - \text{Draw OK}$
  - Alloy CDS: $\text{Hollow HT Queue} = \text{Rolling HTC OK} - \text{Hollow HT OK}$; $\text{Draw Bench Queue} = \text{Hollow HT OK} - \text{Draw OK}$
  - Standard HFS: $\text{Band Saw Queue} = \text{Rolling HTC OK} - \text{Band Saw OK}$
  - SS Steel: $\text{Pilger Queue} = \text{Rolling HTC OK} - \text{Pilger OK}$

### Rule 3: Piece-Based Clearance Across Drawing & Intermediate Stages
- Upstream of Band Saw, pipes are handled as **Mother Pipes (HT Nos)**.
- Hot rolling outputs Mother Hollow lengths (e.g., 7.81 m), while drawing outputs finished customer lengths (e.g., 6.21 m).
- **Clearance Rule:** When the number of drawn pieces or downstream passed pieces matches or exceeds the incoming mother hollows, the stage's active WIP is **strictly 0**. This prevents phantom WIP caused by length differences across drawing.

### Rule 4: Band Saw Transformation & Hybrid Cut Accounting
- **Piece Multiplier:** Mother pipes are cut into 2, 3, or more customer pieces as per the plan's `Multiple`.
- **Downstream Tracking:** Downstream stations (`VDI`, `FINISHING`) strictly use actual cut pieces:
  $$\text{VDI WIP (Cut PCS)} = \text{Band Saw Cut OK} - \text{VDI Inspected OK}$$
  $$\text{Finishing WIP (Cut PCS)} = \text{VDI Passed OK} - \text{Finishing Bundled OK}$$
- **Scrap Floor & Prime Rules:**
  - Customer lengths $< 4.0\text{ m}$ specified by work order are classified as **Prime**.
  - Any remanent piece $< 3.0\text{ m}$ is automatically classified as **Cutting Scrap / Melt Loss**.
  - Off-cuts $\ge 3.0\text{ m}$ are recorded as usable inventory eligible for Diversion or Commercial sale.

### Rule 5: Universal Rejection Handling (Option B)
- Rejections generated at any work center do NOT vanish as dead scrap.
- They remain attached to that work order's balance until dispositioned via:
  1. **Diversion:** Reallocated to another customer work order via the Diversion module.
  2. **Commercial Declaration:** Approved for secondary commercial sale via QC verification and PPC sign-off.

### Rule 6: Rolling Plan Quantity Capping (104% Allowance in Nos)
- Rolling output can be entered up to 104% of the authorized PPC Rolling Plan in pieces/Nos (`Math.round(planned_pcs * 1.04)`). Attempts to log output exceeding 104% of planned pieces are blocked by client validation and backend APIs.

### Rule 7: Mutual Work Center Permissions
- **Joint Band Saw & Finishing Line:** Operators assigned to either station possess mutual recording and editing permissions across both cutting and bundling.
- **Joint Furnace Line:** Hollow Heat Treatment and Final Heat Treatment share mutual operational permissions.

---

## 4. Key Application Modules

| Module | URL Route | Description |
| :--- | :--- | :--- |
| **Executive Dashboard** | `/dashboard` | Live plant KPIs: Total Active WIP, Daily Rolling Output, Stagnant Lots, Rejections, Diversions. |
| **Production Entry Console** | `/production` | Shift-wise logging console for all stations with inline length calculation and queue validation. |
| **Band Saw Cutting Modal** | `/production` | Multi-cut distribution calculator with 1-click confirmation and auto-trim scrap tracking. |
| **Size-Grade WIP Matrix** | `/reports/wip` | Complete 3D multi-station breakdown of physical inventory across OD, WT, and steel grade. |
| **WIP Aging & Bottlenecks** | `/reports/aging` | Dwell time tracking with severity thresholds (Normal $\le 2$d, Warning 3–5d, Critical $> 5$d) and supervisor snooze/ack. |
| **Work Order Tracking** | `/reports/tracking` | End-to-end audit trail for individual work orders from billet charge to final packaging. |
| **Campaign Rolling Plans** | `/planning` | Multi-work-order Master & Child grouping, sizing mill calculations, piercer mill setup. |
| **Daily Production Planning** | `/reports/daily-plan` | Machine-level shift scheduling, priority ranking, and target piece assignments. |
| **VDI Inspection Console** | `/production?stage=VDI` | Dimensional verification, surface defect logging, and salvage rework tracking. |
| **Diversion Manager** | `/diversions` | Inter-work-order quantity transfers with full traceability and route reassignment. |
| **Rejection Declarations** | `/reports/rejections` | Multi-stage salvage review: Operator Submission $\to$ QC Verification $\to$ PPC Commercial Approval. |
| **Process Sheets** | `/reports/process-sheet` | Technical specification sheets with ASTM/ASME/EN tolerances, chemical limits, and test requirements. |
| **Admin Control Panel** | `/admin/control-panel` | User role management, station permissions, and audit log inspection. |

---

## 5. Technology Stack

- **Framework:** [Next.js 15.1.12](https://nextjs.org/) (App Router, React Server Components, Route Handlers)
- **UI & State:** [React 19.0.0](https://react.dev/), [Lucide React](https://lucide.dev/), [Sonner](https://sonner.emilkowal.ski/)
- **Styling:** Vanilla CSS & Tailwind CSS (Custom industrial steel-mill palette, WCAG 2.1 AA accessible, monospace tabular numbers)
- **Database & Backend:** [Supabase](https://supabase.com/) PostgreSQL with Row-Level Security (RLS) and PL/pgSQL stored procedures
- **Export Engines:** [ExcelJS](https://github.com/exceljs/exceljs) & [SheetJS (xlsx)](https://sheetjs.com/) for formatted mill reports
- **Testing:** [Vitest 4.1.11](https://vitest.dev/) with 42 unit and integration test suites

---

## 6. Getting Started

### Prerequisites
- Node.js `v20.x` or `v22.x`
- npm `v10.x` or higher
- Active Supabase project

### 1. Clone & Install Dependencies
```bash
git clone <repository-url>
cd WIP_Tracking
npm install
```

### 2. Environment Configuration
Copy `.env.example` to `.env.local` and configure your Supabase credentials:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### 3. Database Migrations
All database views, RPCs, and tables are version-controlled under `supabase/migrations/`. Apply them in numerical order using the Supabase CLI or SQL Editor:
```bash
# Push migrations via Supabase CLI
npx supabase db push
```
> [!IMPORTANT]
> Ensure migration `079_piece_balanced_stage_wip_draw_and_ht.sql` is applied to ensure piece-balanced clearance across Cold Draw and Heat Treatment stations.

### 4. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 7. Quality Assurance & Verification

The project includes an automated test suite verifying business rules, dimensional math, mass conservation, and queue validations:

```bash
# Run all 42 test suites (291 tests)
npm test

# Run tests in watch mode
npm run test:watch

# Type check and linting
npm run lint

# Production build validation
npm run build
```

---

## 8. Database Architecture

```
work_orders                 --> Target customer specifications (OD, WT, L1, L2, Grade, Order Qty)
  ├── rolling_plans         --> Campaign rolling schedules, Mother Hollow specs (mh_od, mh_wt, sm_len)
  ├── daily_production_plans--> Daily machine allocations, shift targets, priority ranking
  ├── production_logs       --> Immutable shift-wise physical movements (input_qty, output_qty, htc_ok, remarks)
  ├── qc_inspections        --> VDI visual & dimensional inspection logs (vdi_ok, salvage, rejection)
  ├── diversion_plans       --> Inter-order quantity transfers with route reassignment
  └── rejection_declarations--> Operator submissions, QC verification, and PPC approval ledger
```

### Core Database Views:
- **`vw_route_stage_wip`**: Canonical physical WIP ledger per work order, route, and work center.
- **`vw_wip_aging`**: Real-time dwell-time and stagnation calculator with critical/warning severity thresholds.
- **`vw_dashboard_kpis`**: Aggregated plant-wide executive metrics.

---

## 9. Security & Access Control

- All transactional updates (`record_production_batch`, `create_rolling_plan`, `create_diversion`) execute through security-definer RPCs with PostgreSQL-level validation.
- Row-Level Security (RLS) restricts access based on authenticated user roles (`Admin`, `PPC`, `Quality`, `Production`, `Operator`).
- Custom station permissions configured in `/admin/control-panel` dynamically control sidebar visibility and form execution rights.

---

## 10. License & Intellectual Property

Confidential & Proprietary. Developed for **Rashmi Green Hydrogen Steel Pvt. Ltd.** All rights reserved.
