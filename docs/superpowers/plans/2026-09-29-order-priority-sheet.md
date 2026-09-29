# Set Priority Order Sheet Form Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **NOTE: All changes must remain LOCAL only. DO NOT commit or push.**

**Goal:** Build a dedicated, interactive "Set Priority Order Sheet" form for Production Planning & Control (PPC) to assign priority tiers (`CRITICAL`, `HIGH`, `NORMAL`, `LOW`) to open work orders, filter and search orders, export priority schedules to Excel/CSV, and print formal daily priority sheets for factory morning meetings.

**Architecture:**
1. Helper & storage engine: `lib/planning/orderPriorityHelper.ts` manages priority assignment, sorting (Critical → High → Normal → Low), and persistent saving to Supabase with resilient offline/localStorage fallback.
2. Client UI component: `components/planning/OrderPrioritySheetClient.tsx` provides high-density industrial queue table with interactive tier buttons, live search, multi-tier filtering, delivery due badges, Excel export, and print view.
3. Page & Route: `app/order-priority/page.tsx` wrapped in `RouteAccessGuard`.
4. Navigation: Expose in `components/AppShell.tsx` under `PLANNING` and configure permissions in `lib/permissions.ts`.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS, Lucide React, XLSX, Vitest.

## Global Constraints
- All changes must remain **local**; do not run `git commit` or `git push`.
- Adhere strictly to UI/UX standards: contrast ratios $\ge 4.5:1$, tabular number formatting (`font-mono tabular-nums text-right`), and WCAG 2.1 AA accessibility.
- Support 4 clear Priority Tiers:
  - 🔴 `CRITICAL` (Urgent / Customer Outage / Heavy Delay)
  - 🟠 `HIGH` (Refinery project / Penalty clause / Approaching target)
  - 🔵 `NORMAL` (Standard rolling plan campaign)
  - ⚪ `LOW` (Stock order / Flexible target)

## Review Focus
1. Sorting priority: orders sort by Priority Tier first (Critical → High → Normal → Low), then by target delivery date.
2. Excel Export: exports clean formatted columns (Priority, WO No, Customer, Grade, Size, Pending Qty, Due Date).
3. Print Layout: `@media print` generates a clean, high-density daily priority sheet without page break glitches.
4. Permission guard: PPC, Admin, Super User have edit privileges; operators have view privileges.

---

### Task 1: Order Priority Utility & Storage Engine

**Files:**
- Create: `lib/planning/orderPriorityHelper.ts`
- Test: `tests/order-priority-helper.test.ts`

**Interfaces:**
- Types: `PriorityTier = 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW'`
- Functions:
  - `sortOrdersByPriority(orders, priorities)`
  - `exportPrioritySheetToCsv(orders, priorities)`
  - `savePrioritiesToStorage(priorities)`
  - `loadPrioritiesFromStorage()`

- [ ] **Step 1: Write the failing test**
Create `tests/order-priority-helper.test.ts` verifying priority ordering, tier sorting, and CSV export formatting.

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run tests/order-priority-helper.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement `lib/planning/orderPriorityHelper.ts`**
Implement priority sorting, tier rankings, color badge mappings, and CSV/Excel data generation.

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run tests/order-priority-helper.test.ts`
Expected: PASS.

---

### Task 2: Build Order Priority Sheet Client Component

**Files:**
- Create: `components/planning/OrderPrioritySheetClient.tsx`

**Interfaces:**
- Consumes: Work orders from `work_orders` table, WIP balances from `vw_route_stage_wip`.
- Produces: Interactive table with tier selectors, filter bar, summary KPI counters, Excel export button, and print sheet.

- [ ] **Step 1: Create `OrderPrioritySheetClient.tsx`**
Implement:
  - Top summary cards: Total Open Orders, Critical Count, High Count, Normal Count, Overdue Count.
  - Filter bar: Search input, Priority Tier filter buttons (All / Critical / High / Normal / Low), Route filter.
  - Interactive table:
    - Priority Tier selector dropdown / 1-click pills
    - WO No., Customer, Spec / Grade, OD × WT mm
    - Ordered Qty & Balance Pending Qty (Mtr & MT)
    - Delivery Target Date & Days Remaining badge (Overdue in red, <7d in amber, On Track in green)
    - Planner Expedite Notes inline input
  - Action buttons:
    - 📥 Export to Excel / CSV
    - 🖨️ Print Daily Priority Sheet (`@media print` formatted)
    - 💾 Save Priority Order Sequence

---

### Task 3: Create Route, AppShell Navigation & Permissions

**Files:**
- Create: `app/order-priority/page.tsx`
- Modify: `components/AppShell.tsx`
- Modify: `lib/permissions.ts`
- Test: `tests/permissions-and-visibility.test.ts`

- [ ] **Step 1: Create `app/order-priority/page.tsx`**
Set up page with `RouteAccessGuard allowedGroups={['admin', 'super_user', 'user']}` and dynamic client load.

- [ ] **Step 2: Add Route to `AppShell.tsx`**
Add `{ href: '/order-priority', label: 'Order Priority Sheet', icon: ArrowUpDown }` under `PLANNING`.

- [ ] **Step 3: Update `lib/permissions.ts`**
Add `'/order-priority'` to `allowedUserRoutes` and `isRouteVisible`.

- [ ] **Step 4: Update unit test in `tests/permissions-and-visibility.test.ts`**
Assert `isRouteVisible(user, '/order-priority')` is true.

---

### Task 4: Verification & Build Check

**Files:**
- Full test suite & Next.js production build

- [ ] **Step 1: Run Vitest test suite**
Run: `npm test`
Expected: All tests PASS.

- [ ] **Step 2: Run Next.js production build**
Run: `npm run build`
Expected: Exit code 0, 0 compilation errors.

- [ ] **Step 3: Verify git status (strictly local changes)**
Confirm changes remain uncommitted and unstaged as requested.
