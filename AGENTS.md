# Mill Operational & WIP Rules: Seamless Pipe Manufacturing

This file serves as the canonical system instruction for all AI agents and developers working on this codebase.

## 1. No "Supply Process" (Direct Stage-to-Stage Balancing)
- There is no separate clerical or physical "Supply" process or intermediate queue.
- Stage WIP is calculated directly:
  $$\text{Stage Active WIP} = \text{Preceding Stage OK} - \text{Current Stage OK}$$
- **First Processing Stage Feeding:**
  - **CDS (Carbon)**: $\text{Draw Bench Queue} = \text{Rolling HTC OK} - \text{Draw OK Production}$
  - **ALLOY_CDS**: $\text{Hollow HT Queue} = \text{Rolling HTC OK} - \text{Hollow HT OK}$; $\text{Draw Bench Queue} = \text{Hollow HT OK} - \text{Draw OK}$
  - **HFS (Hot Finished)**: $\text{Band Saw Queue} = \text{Rolling HTC OK} - \text{Band Saw OK}$
  - **ALLOY_HFS**: $\text{Hollow HT Queue} = \text{Rolling HTC OK} - \text{Hollow HT OK}$; $\text{Band Saw Queue} = \text{Hollow HT OK} - \text{Band Saw OK}$

## 2. Universal Rejection Handling (Option B) Across All Work Centers
- Rejections generated at any work center do NOT vanish as dead scrap.
- They remain attached to that work order's active balance until explicitly dispositioned:
  1. **Diverted** to another work order (via the Diversion module, which transfers quantity out of source WO and into target WO).
  2. **Declared Commercial** (downgraded secondary commercial sale).
- Formula: $\text{Stage Active WIP} = \text{Preceding Stage OK} - \text{Current Stage OK}$.

## 3. Cold Drawing Elongation & Mass Conservation
- Drawing reduces OD and WT and elongates length while conserving mass ($\text{Mass}_{\text{In}} = \text{Mass}_{\text{Out}}$).
- Upstream Draw Bench WIP uses elongated drawn length based on $L_1$ and $L_2$ as default, with operator manual adjustment allowed.

## 4. Band Saw Transformation & Hybrid Cut Accounting
- **Piece Multiplier**:
  - Upstream of Band Saw (Draw Bench, Heat Treatment), pipes are tracked as **Long Mother Pipes (HT Nos)**.
  - At Band Saw, long pipes are cut into 2, 3, or more customer pieces as per the work order's **Multiple**.
  - **Downstream of Band Saw (VDI, Finishing)**: Strictly uses the **Actual Cut Pieces (Cut Nos)** logged by the Band Saw.
    - $\text{VDI WIP (Cut PCS)} = \text{Band Saw Cut OK} - \text{VDI Inspected OK}$
    - $\text{Finishing WIP (Cut PCS)} = \text{VDI Passed OK} - \text{Finishing Bundled OK}$
- **Hybrid Cutting Process (Pre-fill from Plan + Auto-Scrap)**:
  - System pre-fills cut pieces and target lengths from the Rolling Plan for fast 1-click confirmation.
  - Operator adjusts if lengths or piece counts vary.
  - Balance between total incoming mother pipe meters and prime cut meters is automatically logged as **Cutting Scrap**:
    $$\text{Scrap Meters} = \text{Total Incoming Mother Meters} - \text{Prime Cut Meters}$$

## 5. Pipe Length Scrap & Prime Qualification Rules
- **Rule 5A (Order Length $< 4.0\text{ m}$ Exception)**: If the work order's customer specification explicitly requires lengths $< 4.0\text{ m}$, cut pipes below 4.0 m meeting the order length are classified as **Prime**.
- **Rule 5B (Hard 3.0-Meter Scrap Floor)**: Any pipe or off-cut remnant $< 3.0\text{ m}$ is **automatically logged as Scrap** (melt loss) because it cannot be diverted to another work order (unless it specifically satisfies an order under Rule 5A).
- **Rule 5C (Usable Off-cuts $\ge 3.0\text{ m}$)**: Off-cuts $\ge 3.0\text{ m}$ that do not meet the current order's prime length are held as usable inventory eligible for Diversion to other work orders or Commercial sale.

## 6. Scope of Application
These rules apply to:
- Work Center Production Entry screens (`/production`, Band Saw modal, VDI client)
- All Reports (`/reports/wip`, Size-Grade WIP Matrix, Work Order Tracking, Aging)
- Executive Dashboard KPIs (`/dashboard`)
- Database Views & Stored Functions (`vw_route_stage_wip`, `get_production_entry_queue`)
