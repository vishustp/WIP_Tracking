# Hollow Bank Inventory & Diversion Implementation Plan

A dedicated yard/buffer inventory module allowing material from any work center to be diverted into the **Hollow Bank** (removing it from active stage WIP) and subsequently allocated by PPC into any target work center and work order.

## Proposed Changes

### 1. Database Schema & WIP Balancing (`supabase/migrations/074_hollow_bank_inventory_and_diversion.sql`)
- Create dedicated `public.hollow_bank_inventory` table to track banked material:
  - `id`, `lot_no`, `source_wo_id`, `source_stage_code`, `heat_no`, `od`, `wt`, `grade`, `pcs`, `avg_length`, `total_meters`, `weight_mt`, `status` (`AVAILABLE`, `PARTIALLY_ALLOCATED`, `FULLY_ALLOCATED`, `SCRAPPED`), `available_pcs`, `available_meters`, `banked_date`, `banked_by`, `remarks`.
- Create `public.hollow_bank_allocations` table to track PPC disbursements:
  - `id`, `hollow_bank_id`, `target_wo_id`, `target_stage_code`, `allocated_pcs`, `allocated_meters`, `allocated_date`, `allocated_by`, `remarks`.
- Seed a dedicated virtual buffer work order:
  - `id: '00000000-0000-0000-0000-00000000000b'`, `work_order_no: 'HB-BUFFER'`, `customer_name: 'HOLLOW BANK INVENTORY'`.
- Implement PostgreSQL triggers/stored functions:
  - On `hollow_bank_inventory` insert: automatically creates a `diversion_plans` record transferring material from `source_wo_id` at `source_stage_code` into `HB-BUFFER`. This immediately deducts WIP from the source work order across all queue views and stage ledgers.
  - On `hollow_bank_allocations` insert: automatically updates `available_pcs`, `available_meters`, and `status` in `hollow_bank_inventory`, and creates a `diversion_plans` record transferring material from `HB-BUFFER` into `target_wo_id` at `target_stage_code`. This immediately injects the WIP into the target work order's queue.
- Enable RLS policies and grant permissions to `anon`, `authenticated`, and `service_role`.

### 2. Hollow Bank Service & Data Access Layer (`lib/hollow-bank/`)
- `lib/hollow-bank/types.ts`: TypeScript interfaces for `HollowBankLot`, `HollowBankAllocation`, filter criteria, and form schemas.
- `lib/hollow-bank/client.ts`: Supabase functions:
  - `fetchHollowBankInventory(filters)`: retrieve available and historic banked lots.
  - `createHollowBankEntry(entry)`: park material into the bank.
  - `allocateHollowBankLot(allocation)`: PPC allocate full or partial lots to target work orders.
  - `fetchHollowBankAllocations()`: retrieve allocation history ledger.

### 3. Permissions & Navigation Updates
- In `lib/permissions.ts`: Add `hollow_bank` module or grant access via `canManagePlans` / `isPpcOrAdminUser`.
- In `components/layout/Sidebar.tsx` (and `lib/navigation.ts` if applicable): Add **Hollow Bank** to the sidebar navigation under Planning / Inventory with an icon (`Layers` / `Warehouse`).

### 4. Frontend Hollow Bank Console (`components/hollow-bank/` & `app/hollow-bank/page.tsx`)
- `components/hollow-bank/HollowBankConsole.tsx`: Main dashboard with:
  - KPI Summary Cards: Total Available Lots, Available Meters, Total MT, and Breakdown by Stage of Origin.
  - Tab 1: **Available Stock**: Searchable/filterable inventory grid by OD, WT, Grade, Stage, and Heat No. Includes 1-click "Allocate to Order" button.
  - Tab 2: **Divert Material to Bank**: Quick console to divert pipes from any work center directly into Hollow Bank.
  - Tab 3: **Allocation History**: Complete audit ledger of which hollows were allocated, by whom, to which target order and work center.
- `components/hollow-bank/AllocateHollowModal.tsx`: Modal for PPC to pick target Work Order, target Work Center, specify pcs/meters, and execute allocation.
- `app/hollow-bank/page.tsx`: Route page mounting the console with user authentication and permission guard.

### 5. Unit & Integration Tests (`tests/hollow-bank.test.ts`)
- Test metallurgical weight calculation for banked hollows: $(\text{OD} - \text{WT}) \times \text{WT} \times 0.0246615 \times 0.001 \times \text{meters}$.
- Test full vs. partial lot allocation accounting (`available_pcs` and `available_meters` decrements).
- Test validation guards (cannot allocate more than available pcs/meters, cannot allocate without valid target stage).
- Test permission authorization for PPC and Admin users.

---

## Verification Plan

### Automated Tests
1. Run Vitest test suite:
   ```bash
   npx vitest run tests/hollow-bank.test.ts
   npx vitest run
   ```
2. Run TypeScript compilation check:
   ```bash
   npx tsc --noEmit
   ```

### Manual Verification
1. Access `/hollow-bank` in the browser.
2. Confirm KPI summary cards and empty state / loaded stock.
3. Divert a lot from a sample work order at Cold Draw Bench into Hollow Bank.
4. Verify that the lot appears in the Available Stock tab and that the source work order's WIP decreased.
5. Allocate a portion of the lot to another work order at Band Saw stage.
6. Verify the lot remaining balance updates and the allocation history shows the audit entry.
