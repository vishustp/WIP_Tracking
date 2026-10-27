# Technical Specification: Intermediate Pipe Cutting (IP Cutting) Workflow

## 1. Overview & Business Intent

In seamless steel pipe manufacturing, mother pipes produced at Hot Rolling and passed through HTC are sometimes too long to be drawn in a single length at the Cold Draw Bench (due to draw bench bed length, tooling capacity, or reduction ratio constraints).

To handle this, PPC planners schedule an **Intermediate Pipe Cutting (IP Cutting)** operation at the Band Saw prior to Cold Drawing.

### Key Mill Rules & Principles
1. **Physical Mill Sequence**:
   $$\text{Hot Rolling} \longrightarrow \text{HTC OK} \longrightarrow \mathbf{\text{IP Cutting (Band Saw)}} \longrightarrow \mathbf{\text{Cold Draw Bench (DRAW)}} \longrightarrow \text{Heat Treatment} \longrightarrow \mathbf{\text{Band Saw (Final Cutting)}} \longrightarrow \text{VDI Inspection} \longrightarrow \text{Finishing}$$
2. **Two Band Saw Visits**:
   - **Visit 1 (IP Cutting)**: Pre-draw intermediate cut. Mother hollows ($12\text{--}14\text{ m}$) from HTC are cut into draw pieces ($5\text{--}7\text{ m}$) as planned by PPC.
   - **Visit 2 (Final Cutting)**: Post-HT customer cut. Drawn and heat-treated pipes are cut into final customer order lengths as per customer piece multiples.
3. **WIP Matrix & Executive Accounting Principle**:
   - In the **WIP Matrix (`/reports/wip`)** and **Dashboard KPIs (`/dashboard`)**, no separate "IP Cut" column is shown.
   - Material between HTC OK and completion of Cold Drawing is accounted under **Draw Bench WIP** until Cold Drawing is finished.

---

## 2. Data Architecture & Schema Changes

### 2.1 Database Process Stage
Register `IP_CUTTING` in `public.process_stages`:
```sql
INSERT INTO public.process_stages (stage_code, stage_name, active)
VALUES ('IP_CUTTING', 'IP Cutting (Band Saw)', true)
ON CONFLICT (stage_code) DO UPDATE
  SET stage_name = 'IP Cutting (Band Saw)', active = true;
```

### 2.2 Permissions (Rule 8: Joint Station Authority)
- Operators assigned to `BAND_SAW` and `FINISHING` have mutual permissions to view, execute, and edit `IP_CUTTING` entries.

### 2.3 Rolling Plan Schema (`rolling_plans.status`)
PPC plan status JSON stores the IP cutting configuration:
```json
{
  "is_ip_cutting": true,
  "ip_cut_length": 6.25,
  "ip_multiple": 2
}
```

### 2.4 TypeScript Interfaces (`types/index.ts`)
* Extend `StageCode`:
```ts
export type StageCode =
  | 'HOT_ROLLING'
  | 'HTC'
  | 'ROLLING'
  | 'HOLLOW_HEAT_TREATMENT'
  | 'IP_CUTTING'
  | 'PILGER'
  | 'DRAW'
  | 'HEAT_TREATMENT'
  | 'BAND_SAW'
  | 'VDI'
  | 'FINISHING'
  | 'VDI_SALVAGE';
```
* Extend `Row` and `ProductionEntry`:
```ts
is_ip_cutting?: boolean;
ip_cut_length?: number | null;
ip_multiple?: number | null;
```

---

## 3. Operational Queue & Mass Balance Logic

### 3.1 Standard Route (`is_ip_cutting !== true`)
* $\text{Draw Bench Queue} = \text{Rolling HTC OK} - \text{Draw Bench OK}$
* $\text{Final Band Saw Queue} = \text{Heat Treatment OK} - \text{Band Saw OK}$

### 3.2 IP Cutting Route (`is_ip_cutting === true`)
1. **IP Cutting Queue (at Band Saw console)**:
   - Feeder: Rolling HTC OK production.
   - $\text{IP Cutting Available WIP (Mother Pipes)} = \text{Rolling HTC OK} - \text{IP Cutting Input Mother Pipes}$.
   - Pre-fills from plan: `ip_cut_length` and `ip_multiple`.
   - Logging an IP cut records cut pieces into `production_logs` with `stage_code = 'IP_CUTTING'`.
2. **Cold Draw Bench Queue (`DRAW`)**:
   - Feeder: Output pieces from `IP_CUTTING` (instead of raw HTC mother pipes).
   - $\text{Draw Bench Active WIP (Pieces)} = \text{IP Cutting OK Cut Pieces} - \text{Draw Bench Drawn Pieces}$.
3. **Final Band Saw Queue (`BAND_SAW`)**:
   - Feeder: Final Heat Treatment OK output.
   - Cuts drawn/heat-treated pipes to customer order pieces.

---

## 4. UI / UX Design

### 4.1 Rolling Plan Form (`/rolling-plans`)
* Under the Process Route / Campaign setup section, add an **"IP Cutting (Pre-Draw Band Saw)"** section:
  * Checkbox: `[ ] Enable IP Cutting (Cut mother pipes before Draw Bench)`
  * When checked:
    * **Target IP Cut Length (m)**: Input field (e.g. `6.00`).
    * **IP Multiple (Pieces per Mother Pipe)**: Input field (e.g. `2`).
  * Auto-calculates planned IP pieces: $\text{Mother Pipes} \times \text{IP Multiple}$.

### 4.2 Band Saw Console (`/bandsaw` & `/production`)
* Filter toggle: **"Customer Final Cutting"** vs **"IP Cutting (Draw Prep)"**.
* When an order has `is_ip_cutting: true`:
  * Before Draw, it appears under the **IP Cutting** queue with a prominent badge: `[IP CUT]`.
  * The Band Saw cutting modal pre-fills `ip_cut_length` and `ip_multiple` for fast 1-click execution.
  * After Heat Treatment, the same order appears under standard **Customer Final Cutting** queue for final customer length cut.

### 4.3 WIP Matrix & Reports (`/reports/wip`, `/dashboard`)
* Per plant accounting rules, WIP is **not fragmented** into a separate IP Cut column.
* Undrawn inventory for IP Cutting orders (both uncut mother hollows and cut draw pieces awaiting draw) is aggregated cleanly under the **Cold Draw Bench (Draw WIP)** column until Cold Drawing is finished.

---

## 5. Verification & Testing Plan

1. **Unit & Calculation Tests (`tests/ip-cutting-workflow.test.ts`)**:
   - Verify that when `is_ip_cutting: true`, Draw Bench queue incoming pieces are derived from `IP_CUTTING` output.
   - Verify that when `is_ip_cutting: false`, Draw Bench queue incoming pieces derive directly from `HTC OK`.
   - Verify that Band Saw cutting modal handles IP cutting with correct pieces, meters, and scrap calculation ($\text{Scrap} = \text{Mother Mtr} - \text{Cut Mtr}$).
   - Verify that WIP Matrix groups IP cutting pre-draw stock under Cold Draw WIP without schema or column errors.
2. **Type Checking**:
   - Run `npx tsc --noEmit` to verify type safety across `app/api/production/queue/route.ts`, `components/bandsaw/`, `components/rolling-plans/`, and `components/reports/`.
3. **Full Vitest Suite**:
   - Run `npx vitest run` ensuring 100% pass on all domain tests.
