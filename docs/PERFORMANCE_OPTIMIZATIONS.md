# Web Performance Optimization Suggestions

This document tracks identified performance enhancements from the Core Web Vitals & Web Performance Audit. These items can be implemented in future optimization sprints.

---

## 1. High Priority (Server TTFB & Loading Performance)

### [PERF-01] Date-Scope Dashboard Production Logs
- **Area:** Network / TTFB / Core Web Vitals (LCP)
- **Target File:** `app/dashboard/page.tsx` (around line 38)
- **Issue:** `supabase.from('production_logs').select(...)` executes without a `.limit()`, date threshold, or pagination. As historical logs accumulate, this query payload grows indefinitely on every dashboard visit.
- **Recommended Action:**
  - Add a rolling window filter (e.g. current month or last 60 days via `.gte('process_date', rollingDateStr)`).
  - Alternatively, query pre-aggregated monthly KPIs via a database view (`vw_monthly_production_kpis`) rather than transferring raw log rows into Node.js memory.

### [PERF-02] Replace Sequential Log Pagination Waterfall in Queue Route
- **Area:** Network / Cold-Start TTFB
- **Target File:** `app/api/production/queue/route.ts` (lines 115–131, `fetchAllLogs`)
- **Issue:** To bypass PostgREST's 1,000-row limit, `fetchAllLogs` runs a sequential `while (true)` loop across pages of 1,000 logs. Each chunk requires a separate network round-trip.
- **Recommended Action:**
  - Replace client-side sequential pagination with a dedicated PostgreSQL function or view (`get_production_entry_queue`) that computes active WIP balances directly in Postgres and returns only the active queue rows.

---

## 2. Medium Priority (Responsiveness & Memory Optimization)

### [PERF-03] Use React 19 `useDeferredValue` for Console Filtering (INP)
- **Area:** Rendering / JavaScript / Core Web Vitals (INP)
- **Target Files:**
  - `components/bandsaw/BandSawCuttingClient.tsx` (lines 112–125)
  - `components/qc/QcInspectionClient.tsx` (lines 635–650)
- **Issue:** Typing into the search input updates React state synchronously and executes `.filter(...)` across all work orders, child orders, customer strings, and lot numbers on every keystroke, which can block the main thread on lower-powered shop-floor tablets.
- **Recommended Action:**
  ```tsx
  import { useDeferredValue } from 'react';

  const deferredSearch = useDeferredValue(searchTerm);
  const filteredQueue = useMemo(() => {
    // filter queue items using deferredSearch instead of searchTerm
  }, [queueRows, deferredSearch]);
  ```
  This keeps typing snappy while allowing heavy list re-filtering to yield to the browser main thread.

### [PERF-04] Restrict Wildcard `select('*')` on Massive Report Tables
- **Area:** Network / Client Heap Memory
- **Target Files:**
  - `components/reports/WorkOrderTrackingClient.tsx` (lines 196–206)
  - `components/reports/WorkCenterProductionReportClient.tsx` (line 150)
- **Issue:** `supabase.from('production_logs').select('*, process_stages(stage_code, stage_name)').limit(10000)` and `work_orders.select('*')` pull unused metadata, internal IDs, and legacy columns over the public network.
- **Recommended Action:**
  - Replace `*` with an explicit list of only the columns displayed in the UI:
    ```ts
    .select('id, work_order_id, stage_id, output_qty, output_pcs, rejection_qty, process_date, remarks, process_stages(stage_code, stage_name)')
    ```

---

## 3. Low Priority / Future Polish

### [PERF-05] Code-Split Below-the-Fold Recharts on Dashboard
- **Area:** Loading / Initial Bundle Execution
- **Target File:** `components/dashboard/DashboardClient.tsx` (lines 7–17)
- **Issue:** `recharts` modules (`ResponsiveContainer`, `PieChart`, `LineChart`) are imported statically, adding to initial JavaScript evaluation time on `/dashboard`.
- **Recommended Action:**
  - Dynamically import the chart components with `next/dynamic`:
    ```tsx
    import dynamic from 'next/dynamic';

    const StageDistributionChart = dynamic(() => import('@/components/dashboard/StageDistributionChart'), {
      ssr: false,
      loading: () => <div className="h-64 bg-slate-100 animate-pulse rounded-xl" />
    });
    ```
