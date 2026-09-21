# Core WIP & Production Tracking Rules for Seamless Steel Pipe Mill

These rules are permanent architectural standards for WIP calculation, production entry, reports, and dashboards across all work centers.

---

## 1. No "Supply Process" (Direct Stage-to-Stage Balancing)
- There is **no separate clerical or physical "Supply" process or intermediate step** between Hot Rolling and downstream processing.
- WIP at any processing stage is computed directly from preceding stage production logs:
  $$\text{Stage Active WIP} = \text{Preceding Stage OK} - \text{Current Stage OK}$$
- **First Processing Stage Feeding:**
  - **CDS (Carbon)**: $\text{Draw Bench Queue} = \text{Rolling HTC OK} - \text{Draw OK Production}$
  - **ALLOY_CDS**: $\text{Hollow HT Queue} = \text{Rolling HTC OK} - \text{Hollow HT OK}$; $\text{Draw Bench Queue} = \text{Hollow HT OK} - \text{Draw OK}$
  - **HFS (Hot Finished)**: $\text{Band Saw Queue} = \text{Rolling HTC OK} - \text{Band Saw OK}$
  - **ALLOY_HFS**: $\text{Hollow HT Queue} = \text{Rolling HTC OK} - \text{Hollow HT OK}$; $\text{Band Saw Queue} = \text{Hollow HT OK} - \text{Band Saw OK}$

---

## 2. Universal Rejection Handling (Option B) Across All Work Centers
- Rejections generated at **any stage** (Rolling, Hollow HT, Draw, Heat Treatment, Band Saw, VDI, Finishing) **do NOT vanish as dead scrap**.
- Rejections remain in the active work order's balance until explicitly dispositioned by a supervisor:
  1. **Diverted** to another work order (using the Diversion module, transferring quantity out of source WO and into target WO).
  2. **Declared Commercial** (downgraded secondary commercial sale).
- Formula: $\text{Stage WIP} = \text{Preceding Stage OK} - \text{Current Stage OK}$. Rejections are preserved in the order's balance until formalized.

---

## 3. Cold Drawing Elongation & Mass Conservation
- When drawing Mother Hollows to finished pipe size, mass is conserved:
  $$\text{Mass}_{\text{In}} = \text{Mass}_{\text{Out}}$$
- Because OD and WT decrease, length elongates in exact proportion.
- **Draw Bench Length**: Default drawn length is calculated from $L_1$ / $L_2$ (or length per multiple), with operator manual override allowed for shift-level variations.

---

## 4. Band Saw Transformation & Hybrid Cut Accounting
- **The Piece Multiplier**:
  - Upstream of Band Saw (Draw Bench, Heat Treatment), pipes are tracked as **Long Mother Pipes (HT Nos)**.
  - At Band Saw, long pipes are cut into 2, 3, or more customer pieces as per the work order's **Multiple**.
  - **Downstream of Band Saw (VDI, Finishing)**: Strictly uses the **Actual Cut Pieces (Cut Nos)** logged by the Band Saw.
    - $\text{VDI WIP (Cut PCS)} = \text{Band Saw Cut OK} - \text{VDI Inspected OK}$
    - $\text{Finishing WIP (Cut PCS)} = \text{VDI Passed OK} - \text{Finishing Bundled OK}$
- **Hybrid Cutting Process (Pre-fill from Plan + Auto-Scrap)**:
  - The entry UI pre-fills cutting inputs from the Rolling Plan (target cut length, multiple, expected scrap allowance) for fast 1-click confirmation.
  - The operator can adjust if actual lengths or piece yields vary.
  - The balance between total incoming mother pipe meters and prime cut meters is automatically logged as **Cutting Scrap**:
    $$\text{Scrap Meters} = \text{Total Incoming Mother Meters} - \text{Prime Cut Meters}$$

---

## 5. Pipe Length Scrap & Prime Qualification Rules
- **Rule 5A (Order Length $< 4.0\text{ m}$ Exception)**: If the work order's customer specification explicitly requires lengths $< 4.0\text{ m}$, cut pipes below 4.0 m meeting the order length are classified as **Prime**.
- **Rule 5B (Hard 3.0-Meter Scrap Floor)**: Any pipe or off-cut remnant $< 3.0\text{ m}$ is **automatically logged as Scrap** (melt loss) because it cannot be diverted to another work order (unless it specifically satisfies an order under Rule 5A).
- **Rule 5C (Usable Off-cuts $\ge 3.0\text{ m}$)**: Off-cuts $\ge 3.0\text{ m}$ that do not meet the current order's prime length are held as usable inventory eligible for Diversion to other work orders or Commercial sale.

---

## 6. Global Application Across System
This logic applies universally to:
1. **All Work Center Production Entry Screens** (`/production`, Band Saw modal, VDI client).
2. **All Reports** (`/reports/wip`, Size-Grade WIP Matrix, Work Order Tracking, Aging).
3. **Executive Dashboard KPIs** (`/dashboard`, Total WIP MT, active stage queues).
4. **Database Views & RPCs** (`vw_route_stage_wip`, `get_production_entry_queue`).
