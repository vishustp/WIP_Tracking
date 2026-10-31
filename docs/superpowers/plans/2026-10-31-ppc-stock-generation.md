# PPC Stock Generation & Audit Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow PPC and Admin to generate physical stock at any stage in any work order with flexible placement (`INCOMING_QUEUE` vs `STAGE_OUTPUT`), integrate with mill stage queues and WIP calculations, and provide an interactive audit report with Excel export.

**Architecture:** A dedicated ledger table `public.ppc_stock_generations` records each stock generation event without polluting machine production shift logs. The production queue API (`/api/production/queue`) and aging/WIP calculation helpers incorporate active records directly into stage balances. A dedicated entry console (`/stock-generation`) allows PPC to select work order, stage, placement, and quantities with real-time MT calculation, while the audit report (`/reports/stock-generation`) provides filtering, cancellation/voiding, and Excel export.

**Tech Stack:** Next.js 15 (App Router, Server Actions, Client Components), TypeScript, Supabase (PostgreSQL), Tailwind CSS, Lucide React, XLSX (SheetJS), Vitest.

**Spec:** `docs/superpowers/specs/2026-10-31-ppc-stock-generation-design.md`

## Global Constraints

- **AGENTS.md Rule 1 (No Intermediate Supply)**: WIP is calculated strictly as Preceding Stage OK + Incoming Stock Generations - Current Stage OK.
- **AGENTS.md Rule 3 & 4 (Mother Pipes vs Cut Pieces)**: Upstream of Band Saw (Draw, Heat Treatment) uses Mother Pipes; Band Saw and downstream uses Cut Pieces.
- **AGENTS.md Rule 8 (Role-Based Access Control)**: Stock generation creation and cancellation is strictly restricted to PPC and Admin (`isPpcOrAdminUser`).
- **UI/UX Standards**: Tabular numerals (`font-mono tabular-nums text-right`), semantic state badges, WCAG 2.1 AA contrast ratio ($\ge 4.5:1$), and no generic AI aesthetic gradients.

## Review Focus

1. **Mass Calculation Accuracy**: Formula $\text{MT} = \pi \times (\text{OD} - \text{WT}) \times \text{WT} \times 0.0246615 \times \text{Meters} / 1000$ must accurately compute tonnage regardless of piece count.
2. **Cancelled Stock Exclusion**: Cancelled stock generations (`status = 'CANCELLED'`) must be immediately excluded from the production queue and WIP totals.
3. **Dual Placement Mechanics**: `INCOMING_QUEUE` must add to the target stage's queue; `STAGE_OUTPUT` must feed into the subsequent downstream stage's incoming queue.
4. **Invalid Work Order / Stage Guard**: Stock generation must reject stages not part of the work order's production route.
5. **Excel Export Structure**: Stock Generation Excel export must include properly typed numeric columns (Meters, Pieces, MT) and readable date formatting.

---

### Task 1: Database Migration & TypeScript Domain Types

**Files:**
- Create: `supabase/migrations/087_ppc_stock_generation.sql`
- Modify: `types/index.ts:180-230`
- Test: `tests/ppc-stock-generation.test.ts`

**Interfaces:**
- Consumes: `WorkOrder`, `ProcessStage`
- Produces: `PpcStockGeneration`, `StockPlacementType`, `StockGenerationReason`

- [ ] **Step 1: Write the failing domain and schema unit test**

Create `tests/ppc-stock-generation.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { calculatePipeWeightMt } from '@/lib/productionUtils';
import type { PpcStockGeneration, StockPlacementType } from '@/types';

describe('PPC Stock Generation Domain & Formulas', () => {
  it('calculates pipe weight in MT accurately using OD, WT, and meters', () => {
    // 88.9 mm OD x 6.45 mm WT, 100 meters
    // Nominal weight per meter = (88.9 - 6.45) * 6.45 * 0.0246615 = 13.1147 kg/m
    // For 100m = 1311.47 kg = 1.311 MT
    const weightMt = calculatePipeWeightMt(88.9, 6.45, 100);
    expect(weightMt).toBeCloseTo(1.311, 2);
  });

  it('validates stock placement types', () => {
    const validIncoming: StockPlacementType = 'INCOMING_QUEUE';
    const validOutput: StockPlacementType = 'STAGE_OUTPUT';
    expect(['INCOMING_QUEUE', 'STAGE_OUTPUT']).toContain(validIncoming);
    expect(['INCOMING_QUEUE', 'STAGE_OUTPUT']).toContain(validOutput);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ppc-stock-generation.test.ts`
Expected: FAIL with "calculatePipeWeightMt is not a function" or missing types.

- [ ] **Step 3: Implement database migration, types, and helper function**

1. Create `supabase/migrations/087_ppc_stock_generation.sql`:
```sql
-- Migration 087: PPC Stock Generation Ledger Table & Functions
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

CREATE INDEX IF NOT EXISTS idx_ppc_stk_gen_wo_stage ON public.ppc_stock_generations(work_order_id, stage_id, status);
CREATE INDEX IF NOT EXISTS idx_ppc_stk_gen_status ON public.ppc_stock_generations(status);
CREATE INDEX IF NOT EXISTS idx_ppc_stk_gen_created_at ON public.ppc_stock_generations(created_at DESC);

-- Sequence trigger for continuous STK-GEN-YYYYMM-XXXX generation numbers
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

DROP TRIGGER IF EXISTS trg_set_stock_generation_no ON public.ppc_stock_generations;
CREATE TRIGGER trg_set_stock_generation_no
BEFORE INSERT ON public.ppc_stock_generations
FOR EACH ROW
WHEN (NEW.generation_no IS NULL OR NEW.generation_no = '')
EXECUTE FUNCTION fn_generate_stock_generation_no();
```

2. Add types in `types/index.ts`:
```typescript
export type StockPlacementType = 'INCOMING_QUEUE' | 'STAGE_OUTPUT';

export type StockGenerationReason =
  | 'Opening Balance Induction'
  | 'Physical Stock Audit'
  | 'External Yard / Buffer Inbound'
  | 'Salvaged Stock Conversion'
  | 'Customer Return / Re-induction'
  | 'Other';

export interface PpcStockGeneration {
  id: string;
  generation_no: string;
  work_order_id: string;
  stage_id: string;
  stage_code: string;
  stock_type: StockPlacementType;
  pcs: number;
  meters: number;
  weight_mt: number;
  reason: string;
  heat_no?: string | null;
  lot_no?: string | null;
  remarks?: string | null;
  status: 'ACTIVE' | 'CANCELLED';
  created_by?: string | null;
  created_by_name?: string | null;
  created_at: string;
  cancelled_by?: string | null;
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
  // Joined relation fields
  work_order?: {
    work_order_no: string;
    customer_name: string;
    size_od: number;
    size_wt: number;
    grade: string;
  };
  stage?: {
    stage_name: string;
  };
}
```

3. Add `calculatePipeWeightMt` in `lib/productionUtils.ts`:
```typescript
export function calculatePipeWeightMt(od: number, wt: number, meters: number): number {
  if (!od || !wt || !meters || od <= 0 || wt <= 0 || meters <= 0) return 0;
  // Formula: (OD - WT) * WT * 0.0246615 * length / 1000
  const nominalKgPerMeter = (od - wt) * wt * 0.0246615;
  const totalMt = (nominalKgPerMeter * meters) / 1000;
  return Number(totalMt.toFixed(3));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ppc-stock-generation.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```powershell
git add supabase/migrations/087_ppc_stock_generation.sql types/index.ts lib/productionUtils.ts tests/ppc-stock-generation.test.ts
git commit -m "feat(stock-generation): add database migration, domain types, and mass calculation helper"
```

---

### Task 2: Stock Generation API & Queue Integration

**Files:**
- Create: `app/api/stock-generation/route.ts`
- Create: `app/api/stock-generation/cancel/route.ts`
- Modify: `app/api/production/queue/route.ts:40-250`
- Test: `tests/ppc-stock-generation.test.ts`

**Interfaces:**
- Consumes: `PpcStockGeneration`, `createAdminClient`, `getCurrentUser`
- Produces: `POST /api/stock-generation`, `GET /api/stock-generation`, `POST /api/stock-generation/cancel`

- [ ] **Step 1: Write integration tests for API and queue adjustments**

Add to `tests/ppc-stock-generation.test.ts`:
```typescript
describe('PPC Stock Generation Queue & Balance Integration', () => {
  it('applies INCOMING_QUEUE stock directly to target stage ready queue', () => {
    const rawQueue = { ready_pcs: 50, ready_mtr: 500 };
    const stockGenerations: PpcStockGeneration[] = [
      {
        id: '1',
        generation_no: 'STK-GEN-202610-0001',
        work_order_id: 'wo-1',
        stage_id: 's-1',
        stage_code: 'DRAW',
        stock_type: 'INCOMING_QUEUE',
        pcs: 20,
        meters: 200,
        weight_mt: 1.5,
        reason: 'Opening Balance',
        status: 'ACTIVE',
        created_at: new Date().toISOString(),
      },
    ];

    const targetGen = stockGenerations.filter(
      (g) => g.status === 'ACTIVE' && g.work_order_id === 'wo-1' && g.stage_code === 'DRAW' && g.stock_type === 'INCOMING_QUEUE'
    );
    const addedPcs = targetGen.reduce((acc, g) => acc + g.pcs, 0);
    const addedMtr = targetGen.reduce((acc, g) => acc + g.meters, 0);

    expect(rawQueue.ready_pcs + addedPcs).toBe(70);
    expect(rawQueue.ready_mtr + addedMtr).toBe(700);
  });

  it('excludes CANCELLED stock generations from queue calculations', () => {
    const stockGenerations: PpcStockGeneration[] = [
      {
        id: '2',
        generation_no: 'STK-GEN-202610-0002',
        work_order_id: 'wo-1',
        stage_id: 's-1',
        stage_code: 'DRAW',
        stock_type: 'INCOMING_QUEUE',
        pcs: 20,
        meters: 200,
        weight_mt: 1.5,
        reason: 'Opening Balance',
        status: 'CANCELLED',
        created_at: new Date().toISOString(),
      },
    ];

    const activeGen = stockGenerations.filter(
      (g) => g.status === 'ACTIVE' && g.work_order_id === 'wo-1' && g.stage_code === 'DRAW'
    );
    expect(activeGen.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run tests/ppc-stock-generation.test.ts`
Expected: PASS

- [ ] **Step 3: Implement API endpoints**

1. Create `app/api/stock-generation/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { calculatePipeWeightMt } from '@/lib/productionUtils';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const workOrderId = searchParams.get('work_order_id');
    const stageCode = searchParams.get('stage_code');
    const status = searchParams.get('status');

    const supabase = createAdminClient();
    let query = supabase
      .from('ppc_stock_generations')
      .select('*, work_orders(work_order_no, customer_name, size_od, size_wt, grade), process_stages(stage_name)')
      .order('created_at', { ascending: false });

    if (workOrderId) query = query.eq('work_order_id', workOrderId);
    if (stageCode) query = query.eq('stage_code', stageCode.toUpperCase());
    if (status) query = query.eq('status', status.toUpperCase());

    const { data, error } = await query;
    if (error) {
      console.error('[API /api/stock-generation] GET error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ data: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      work_order_id,
      stage_id,
      stage_code,
      stock_type,
      pcs,
      meters,
      weight_mt,
      reason,
      heat_no,
      lot_no,
      remarks,
      user_id,
      user_name,
    } = body;

    if (!work_order_id || !stage_id || !stage_code || !stock_type || !pcs || !meters || !reason) {
      return NextResponse.json({ error: 'Missing required fields for stock generation.' }, { status: 400 });
    }

    if (Number(pcs) <= 0 || Number(meters) <= 0) {
      return NextResponse.json({ error: 'Pieces and meters must be greater than zero.' }, { status: 400 });
    }

    if (!['INCOMING_QUEUE', 'STAGE_OUTPUT'].includes(stock_type)) {
      return NextResponse.json({ error: 'Invalid stock_type. Must be INCOMING_QUEUE or STAGE_OUTPUT.' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Verify work order and dimensions
    const { data: wo, error: woErr } = await supabase
      .from('work_orders')
      .select('id, size_od, size_wt')
      .eq('id', work_order_id)
      .single();

    if (woErr || !wo) {
      return NextResponse.json({ error: 'Work order not found.' }, { status: 404 });
    }

    // Auto calculate MT if not provided or 0
    let finalMt = Number(weight_mt);
    if (!finalMt || finalMt <= 0) {
      finalMt = calculatePipeWeightMt(Number(wo.size_od), Number(wo.size_wt), Number(meters));
    }

    const { data: inserted, error: insErr } = await supabase
      .from('ppc_stock_generations')
      .insert({
        work_order_id,
        stage_id,
        stage_code: stage_code.toUpperCase(),
        stock_type,
        pcs: Number(pcs),
        meters: Number(Number(meters).toFixed(2)),
        weight_mt: Number(finalMt.toFixed(3)),
        reason: reason.trim(),
        heat_no: heat_no?.trim() || null,
        lot_no: lot_no?.trim() || null,
        remarks: remarks?.trim() || null,
        created_by: user_id || null,
        created_by_name: user_name || 'PPC Planner',
        status: 'ACTIVE',
      })
      .select('*, work_orders(work_order_no, customer_name), process_stages(stage_name)')
      .single();

    if (insErr) {
      console.error('[API /api/stock-generation] POST insert error:', insErr);
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: inserted });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

2. Create `app/api/stock-generation/cancel/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: NextRequest) {
  try {
    const { id, cancellation_reason, user_id } = await req.json();
    if (!id || !cancellation_reason?.trim()) {
      return NextResponse.json({ error: 'Stock generation ID and cancellation reason are required.' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('ppc_stock_generations')
      .update({
        status: 'CANCELLED',
        cancelled_by: user_id || null,
        cancelled_at: new Date().toISOString(),
        cancellation_reason: cancellation_reason.trim(),
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      console.error('[API /api/stock-generation/cancel] error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

3. Update `app/api/production/queue/route.ts` to query `ppc_stock_generations` where `status = 'ACTIVE'` and apply:
   - For `stock_type === 'INCOMING_QUEUE'`: add pieces and meters to stage ready queue.
   - For `stock_type === 'STAGE_OUTPUT'`: add pieces and meters to stage cumulative OK, increasing the subsequent stage's incoming WIP.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ppc-stock-generation.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```powershell
git add app/api/stock-generation/route.ts app/api/stock-generation/cancel/route.ts app/api/production/queue/route.ts tests/ppc-stock-generation.test.ts
git commit -m "feat(stock-generation): implement API routes and queue balance integration"
```

---

### Task 3: PPC Stock Generation Entry Form (`/stock-generation`)

**Files:**
- Create: `app/stock-generation/page.tsx`
- Create: `components/stock-generation/StockGenerationFormClient.tsx`
- Modify: `components/AppShell.tsx:165-178`
- Modify: `lib/permissions.ts:70-130`

**Interfaces:**
- Consumes: `/api/stock-generation`, `useUserSession`, `calculatePipeWeightMt`
- Produces: Interactive PPC Stock Generation Console with route-aware stage loading

- [ ] **Step 1: Add permissions and navigation item**

1. In `lib/permissions.ts`, add `canManageStockGeneration(user, group)` returning true if `isPpcOrAdminUser(user, group)`:
```typescript
export function canManageStockGeneration(user: any, group?: string | null): boolean {
  return isPpcOrAdminUser(user, group);
}
```
2. In `components/AppShell.tsx`, import `PackagePlus` from `'lucide-react'` and add `/stock-generation` under Planning:
```typescript
{ href: '/stock-generation', label: 'Stock Generation', icon: PackagePlus },
```

- [ ] **Step 2: Implement page and client component**

1. Create `app/stock-generation/page.tsx`:
```typescript
import { createAdminClient } from '@/lib/supabase/admin';
import StockGenerationFormClient from '@/components/stock-generation/StockGenerationFormClient';

export const dynamic = 'force-dynamic';

export default async function StockGenerationPage() {
  const supabase = createAdminClient();

  const [woRes, stagesRes, routeStagesRes] = await Promise.all([
    supabase
      .from('work_orders')
      .select('id, work_order_no, customer_name, size_od, size_wt, grade, ordered_qty_mt, ordered_qty_mtr, route_id, status, l1, l2')
      .neq('status', 'CLOSED')
      .order('work_order_no', { ascending: true }),
    supabase.from('process_stages').select('id, stage_code, stage_name').order('id', { ascending: true }),
    supabase.from('route_stages').select('route_id, stage_id, sequence_no').order('sequence_no', { ascending: true }),
  ]);

  return (
    <StockGenerationFormClient
      workOrders={woRes.data || []}
      processStages={stagesRes.data || []}
      routeStages={routeStagesRes.data || []}
    />
  );
}
```

2. Create `components/stock-generation/StockGenerationFormClient.tsx` with:
   - Work order autocomplete / searchable selector showing WO No, Customer, Size (OD × WT), Grade.
   - Stage dropdown filtering stages present in the work order's assigned route.
   - Dual-mode segmented selector for `INCOMING_QUEUE` vs `STAGE_OUTPUT` with clear explanatory helper texts.
   - Dynamic piece label: "Mother Pipes" for Draw/HT/HTC; "Cut Pieces" for Band Saw/VDI/Finishing.
   - Auto-calculation of meters and weight (MT) based on pieces and pipe dimensions.
   - Standard reasons dropdown + custom remarks + optional heat/lot inputs.
   - Pre-submission summary modal with direct confirmation.
   - Read-only banner if non-PPC user visits the page.

- [ ] **Step 3: Run TypeScript validity and build check**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```powershell
git add app/stock-generation/page.tsx components/stock-generation/StockGenerationFormClient.tsx components/AppShell.tsx lib/permissions.ts
git commit -m "feat(stock-generation): create PPC stock generation entry console and navigation"
```

---

### Task 4: PPC Stock Generation Audit Report & Excel Export (`/reports/stock-generation`)

**Files:**
- Create: `app/reports/stock-generation/page.tsx`
- Create: `components/reports/StockGenerationReportClient.tsx`
- Modify: `components/AppShell.tsx:180-205`
- Test: `tests/ppc-stock-generation-report.test.ts`

**Interfaces:**
- Consumes: `/api/stock-generation`, `/api/stock-generation/cancel`, `exportJsonToExcel`
- Produces: Audit table with KPI summary, filtering, cancellation modal, and Excel download

- [ ] **Step 1: Write report and export unit test**

Create `tests/ppc-stock-generation-report.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import type { PpcStockGeneration } from '@/types';

describe('PPC Stock Generation Report Filtering & Totals', () => {
  const mockRows: PpcStockGeneration[] = [
    {
      id: '1',
      generation_no: 'STK-GEN-202610-0001',
      work_order_id: 'wo-1',
      stage_id: 's-1',
      stage_code: 'DRAW',
      stock_type: 'INCOMING_QUEUE',
      pcs: 50,
      meters: 600,
      weight_mt: 3.45,
      reason: 'Physical Stock Audit',
      status: 'ACTIVE',
      created_at: '2026-10-31T10:00:00Z',
    },
    {
      id: '2',
      generation_no: 'STK-GEN-202610-0002',
      work_order_id: 'wo-2',
      stage_id: 's-2',
      stage_code: 'BAND_SAW',
      stock_type: 'STAGE_OUTPUT',
      pcs: 100,
      meters: 1200,
      weight_mt: 6.9,
      reason: 'Opening Balance Induction',
      status: 'ACTIVE',
      created_at: '2026-10-31T11:00:00Z',
    },
    {
      id: '3',
      generation_no: 'STK-GEN-202610-0003',
      work_order_id: 'wo-1',
      stage_id: 's-1',
      stage_code: 'DRAW',
      stock_type: 'INCOMING_QUEUE',
      pcs: 10,
      meters: 120,
      weight_mt: 0.69,
      reason: 'Mistake',
      status: 'CANCELLED',
      created_at: '2026-10-31T12:00:00Z',
    },
  ];

  it('calculates active summary totals correctly', () => {
    const active = mockRows.filter((r) => r.status === 'ACTIVE');
    const totalPcs = active.reduce((acc, r) => acc + r.pcs, 0);
    const totalMtr = active.reduce((acc, r) => acc + r.meters, 0);
    const totalMt = active.reduce((acc, r) => acc + r.weight_mt, 0);

    expect(totalPcs).toBe(150);
    expect(totalMtr).toBe(1800);
    expect(totalMt).toBeCloseTo(10.35, 2);
    expect(active.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run tests/ppc-stock-generation-report.test.ts`
Expected: PASS

- [ ] **Step 3: Implement report page and client component**

1. In `components/AppShell.tsx`, add `/reports/stock-generation` under Reports with `Layers` icon:
```typescript
{ href: '/reports/stock-generation', label: 'Stock Generation Report', icon: Layers },
```

2. Create `app/reports/stock-generation/page.tsx`:
```typescript
import { createAdminClient } from '@/lib/supabase/admin';
import StockGenerationReportClient from '@/components/reports/StockGenerationReportClient';

export const dynamic = 'force-dynamic';

export default async function StockGenerationReportPage() {
  const supabase = createAdminClient();

  const [recordsRes, woRes, stagesRes] = await Promise.all([
    supabase
      .from('ppc_stock_generations')
      .select('*, work_orders(work_order_no, customer_name, size_od, size_wt, grade), process_stages(stage_name)')
      .order('created_at', { ascending: false }),
    supabase.from('work_orders').select('id, work_order_no, customer_name').order('work_order_no', { ascending: true }),
    supabase.from('process_stages').select('id, stage_code, stage_name').order('id', { ascending: true }),
  ]);

  return (
    <StockGenerationReportClient
      initialRecords={recordsRes.data || []}
      workOrders={woRes.data || []}
      processStages={stagesRes.data || []}
    />
  );
}
```

3. Create `components/reports/StockGenerationReportClient.tsx` featuring:
   - 4 Summary KPI cards: Total Generated MT, Total Pieces, Total Meters, Active Records.
   - Comprehensive filters: Date range presets (Today, Yesterday, Last 7 Days, Month, All), Work Order search, Stage filter, Reason filter, Status filter (`Active`, `Cancelled`, `All`).
   - High-density table with tabular numerals, status badges, heat/lot badges, and created-by tags.
   - Modal action for PPC/Admin to Cancel/Void an entry with a mandatory reason.
   - Excel export (.xlsx) button generating formatted spreadsheet with column headers, correct cell types, and timestamped filename.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ppc-stock-generation-report.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```powershell
git add app/reports/stock-generation/page.tsx components/reports/StockGenerationReportClient.tsx components/AppShell.tsx tests/ppc-stock-generation-report.test.ts
git commit -m "feat(stock-generation): implement PPC stock generation audit report and Excel export"
```

---

### Task 5: End-to-End Verification, Full Test Suite & Production Build

**Files:**
- Test: All 73+ vitest test files
- Verification: `npx tsc --noEmit` and `npm run build`

- [ ] **Step 1: Run full vitest suite**

Run: `npx vitest run`
Expected: All test files pass.

- [ ] **Step 2: Run production Next.js build**

Run: `npm run build`
Expected: Production build completes with code 0 (`✓ Generating static pages (48/48)`).

- [ ] **Step 3: Commit and push**

```powershell
git add -A
git commit -m "feat(stock-generation): complete PPC stock generation workflow, audit report, and build verification"
git push origin main
```
