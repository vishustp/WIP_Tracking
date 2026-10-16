# Architectural Design Spec: Adding HOT_ROLLING & Repurposing ROLLING to HTC

- **Date:** 2026-10-16
- **Status:** Approved (Pre-Implementation)
- **Deployment Mode:** Strict Local Development (No push to GitHub or live deployment until explicitly approved)

---

## 1. Executive Summary & Objectives

In seamless pipe manufacturing, Mother Hollow piercing and hot rolling are performed by the Hot Mill Rolling operators, whereas Hot Test Check (HTC) is a quality verification/metallurgical inspection step performed by the Quality Control (QC) team.

Previously, the system conflated these two steps into a single stage labeled `ROLLING`, where operators simultaneously entered gross rolling output and `HTC OK` values.

This specification details the architectural enhancement to:
1. Introduce a dedicated first work center: **`HOT_ROLLING`** (Hot Piercing & Rolling Mill).
2. Repurpose and migrate the existing `ROLLING` stage into a dedicated quality inspection station: **`HTC`** (Hot Test Check).
3. Establish a direct stage-to-stage WIP queue:
   $$\text{Rolling Plan} \longrightarrow \mathbf{HOT\_ROLLING} \longrightarrow \mathbf{HTC} \longrightarrow \text{Downstream Processing Stages}$$
4. Implement strict role-based access control: Hot Mill Rolling operators enter `HOT_ROLLING`; QC inspectors enter `HTC`.
5. Update all production entry forms, calculation helpers, queue APIs, reports, matrices, and dashboards.

---

## 2. Process Routes & Stage Sequences

All 5 core production routes are updated to include `HOT_ROLLING` as Sequence 1 and `HTC` as Sequence 2:

### A. CDS (Cold Drawn Seamless - Carbon)
$$\text{HOT\_ROLLING} \longrightarrow \text{HTC} \longrightarrow \text{DRAW} \longrightarrow \text{HEAT\_TREATMENT} \longrightarrow \text{BAND\_SAW} \longrightarrow \text{VDI} \longrightarrow \text{FINISHING}$$

### B. ALLOY_CDS (Alloy Cold Drawn Seamless)
$$\text{HOT\_ROLLING} \longrightarrow \text{HTC} \longrightarrow \text{HOLLOW\_HEAT\_TREATMENT} \longrightarrow \text{DRAW} \longrightarrow \text{HEAT\_TREATMENT} \longrightarrow \text{BAND\_SAW} \longrightarrow \text{VDI} \longrightarrow \text{FINISHING}$$

### C. HFS (Hot Finished Seamless - Carbon)
$$\text{HOT\_ROLLING} \longrightarrow \text{HTC} \longrightarrow \text{BAND\_SAW} \longrightarrow \text{VDI} \longrightarrow \text{FINISHING}$$

### D. ALLOY_HFS (Alloy Hot Finished Seamless)
$$\text{HOT\_ROLLING} \longrightarrow \text{HTC} \longrightarrow \text{HOLLOW\_HEAT\_TREATMENT} \longrightarrow \text{BAND\_SAW} \longrightarrow \text{VDI} \longrightarrow \text{FINISHING}$$

### E. SS_STEEL (Stainless Steel Seamless)
$$\text{HOT\_ROLLING} \longrightarrow \text{HTC} \longrightarrow \text{PILGER} \longrightarrow \text{HEAT\_TREATMENT} \longrightarrow \text{BAND\_SAW} \longrightarrow \text{VDI} \longrightarrow \text{FINISHING}$$

---

## 3. Work Center Responsibilities & Field Definitions

### Stage 1: `HOT_ROLLING` (Hot Piercing & Rolling Mill)
- **Assigned User Role:** Hot Mill Rolling Operator (`HOT_ROLLING`), Admin, Super User.
- **Authority:** Only Hot Mill Rolling operators can record entries in this station.
- **Campaign Capping:** Strictly capped by authorized Rolling Plan balance (`balance_to_make_pcs` / `balance_to_make_mtr`).
- **Dimensions Used:** Mother Hollow Dimensions (`mh_od`, `mh_wt`, `mh_l1`, `mh_l2`, `mh_avg_length`).
- **Inputs Logged:**
  - `gross_output_pcs`, `gross_output_mtr`, `gross_output_mt`
  - `rejection_pcs`, `rejection_mtr`, `rejection_mt` (Defects: Cobble, eccentric, end tear, shell split)
  - `net_output_pcs` $= \text{gross} - \text{rejection}$
  - `net_output_mtr` $= \text{gross} - \text{rejection}$
  - `net_output_mt` $= (\text{MH\_OD} - \text{MH\_WT}) \times \text{MH\_WT} \times 0.0246615 \times 10^{-3} \times \text{net\_output\_mtr}$

### Stage 2: `HTC` (Hot Test Check / QC Inspection)
- **Assigned User Role:** QC Inspector (`QA` / `QC` / `VDI`), Admin, Super User.
- **Authority:** QC team verifies dimensional conformity, wall thickness, and surface condition.
- **Queue Source:** Fed directly by Hot Mill Rolling Net OK output:
  $$\text{HTC Available Queue (PCS)} = \sum \text{HOT\_ROLLING Net OK} - \sum \text{HTC Tested}$$
- **Inputs Logged:**
  - `tested_pcs`, `tested_mtr`, `tested_mt` (Gross QC inspection throughput)
  - `rejection_pcs`, `rejection_mtr`, `rejection_mt` (Surface pits, dimensional variance, wall thinning)
  - `htc_ok_pcs`, `htc_ok_mtr`, `htc_ok_mt` (Passed and cleared for downstream)
  - `net_output_pcs` $= \text{htc\_ok\_pcs}$

### Downstream Hand-off:
- Upstream feeding for downstream stages (`DRAW`, `HOLLOW_HEAT_TREATMENT`, `BAND_SAW`, `PILGER`) now references **`HTC OK`**:
  $$\text{Stage Queue} = \text{HTC OK} - \text{Current Stage Output}$$

---

## 4. Permissions & Role-Based Access Control

### Permission Keys (`lib/permissions.ts` & `lib/users/types.ts`):
1. **`production_hot_rolling`**:
   - Label: `Hot Rolling Mill`
   - Default for `HOT_ROLLING` operator: `edit`
   - Default for other station operators: `view`
2. **`production_htc`**:
   - Label: `Hot Test Check (HTC)`
   - Default for `QC` / `QA` / `VDI`: `edit`
   - Default for Hot Mill operator: `view`
   - Default for other station operators: `view`

### Admin Control Panel:
- Add `HOT_ROLLING` and `HTC` to the Work Center selection dropdown when provisioning or modifying users.

---

## 5. System Architecture & Code Changes

### A. Type Definitions (`types/index.ts`, `types/dailyPlanning.ts`)
- Update `StageCode`:
  ```ts
  export type StageCode =
    | "HOT_ROLLING"
    | "HTC"
    | "HOLLOW_HEAT_TREATMENT"
    | "DRAW"
    | "PILGER"
    | "HEAT_TREATMENT"
    | "BAND_SAW"
    | "VDI"
    | "FINISHING";
  ```
- Update `STAGE_TO_PERMISSION_KEY`, `STAGE_OPTIONS`, and `MODULE_DEFINITIONS`.

### B. Production Entry Screen (`components/production/ProductionEntryGrid.tsx`)
- Add separate tabs:
  - Tab 1: **Hot Rolling** (Code: `HOT_ROLLING`, Label: "Hot Rolling Mill")
  - Tab 2: **HTC** (Code: `HTC`, Label: "Hot Test Check (HTC)")
- Form validation (`lib/productionValidation.ts`):
  - In `HOT_ROLLING`: Enforce Rolling Plan quantity cap (`balance_to_make_pcs`).
  - In `HTC`: Validate that `htc_ok_pcs + rejection_pcs <= htc_available_pcs` (cannot test more pipes than rolled).

### C. Queue Generation API (`app/api/production/queue/route.ts`)
- Emit queue rows for:
  1. `HOT_ROLLING`: Filter by active rolling plans; balance = plan balance.
  2. `HTC`: Feeder stage = `HOT_ROLLING`; available = `HOT_ROLLING Net OK` - `HTC Tested`.
  3. Downstream stages (`DRAW`, `HHT`, `BAND_SAW`, `PILGER`): Feeder stage = `HTC`; available = `HTC OK` - `Downstream Gross/Net`.

### D. Reports & Matrix Updates
1. **Size-Grade WIP Matrix (`components/reports/SizeGradeWipReportClient.tsx`)**:
   - Add columns:
     - `Hot Rolling (Pcs / MT)`
     - `HTC (Pcs / MT)`
   - Grouping strictly preserves the Final Customer Size (`od` & `wt`).
2. **Process Sheet (`components/reports/ProcessSheetClient.tsx`)**:
   - Display Stage 1: Hot Rolling; Stage 2: HTC.
3. **Daily Planning (`components/daily-plans/DailyPlanClient.tsx`, `/daily-plans`)**:
   - Allow daily scheduling for `HOT_ROLLING` and `HTC` independently.
4. **Scrap & Rejection Reports (`/reports/scrap`, `/reports/mill-rejections`)**:
   - Distinguish Hot Rolling piercing scrap vs. HTC inspection rejections.
5. **Executive Dashboard (`app/dashboard/page.tsx` & client component)**:
   - Include both `HOT_ROLLING` and `HTC` WIP counts and throughput cards.

---

## 6. Verification & Safety Assurance

1. **Strict Local Execution:**
   - No `git push origin main` or any remote interaction.
   - All tests run via `npx vitest run`.
   - Production bundle verified via `npm run build`.
2. **Backward Compatibility:**
   - Database views and client mappings will seamlessly treat existing `ROLLING` stage logs as `HTC` records, ensuring zero data loss for existing campaigns.
