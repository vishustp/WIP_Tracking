# Technical Design Specification: Material Diversion System & Mobile-First Interface Redesign

- **Date:** 2026-10-23
- **Status:** Approved
- **Author:** Vishal Mishra & DeepMind Antigravity

---

## 1. Executive Summary & Purpose

In seamless steel pipe manufacturing, material diversion is the mechanism by which physically produced stock, quality salvage, and off-cuts are reallocated from a source work order to one or more target work orders.

This specification modernizes the Diversion module to:
1. Provide a responsive, mobile-first design (single-column flow on smartphones, touch-friendly $\ge 44\text{px}$ targets, sticky bottom action bar).
2. Support **Dual Operational Modes**:
   - **Mode A: Direct Transfer (As-Is)**: Simple 1-to-1 transfer of whole uncut mother pipes or already-cut pieces.
   - **Mode B: Cut & Divert (Trimming, Splitting & STP Optimization)**: Cutting long mother pipes into multiple target pieces, enforcing the **9.5 m STP hollow constraint**, and splitting into Target WO A and optional Target WO B.
3. Enforce **Mill Off-cut & Scrap Rules**:
   - Rule 5B: Remnants $< 3.0\text{ m}$ are automatically logged as Cutting Scrap (melt loss, hard scrap floor).
   - Rule 5C: Remnants $\ge 3.0\text{ m}$ are automatically captured in a dedicated **Off-cuts & Remnants Pool** for future allocation or commercial sale.
4. Provide **Cold Draw Reduction & Elongation Intelligence**:
   - Checks $\text{OD}_{\text{source}} \ge \text{OD}_{\text{target}}$ and $\text{WT}_{\text{source}} \ge \text{WT}_{\text{target}}$.
   - Calculates area reduction % and elongation factor $E = A_{\text{source}} / A_{\text{target}}$.
5. Include **Target Over-allocation Soft Warning**:
   - Compares incoming diverted meters against target remaining order balance.
   - Warns with an amber badge if allocation exceeds order requirements without blocking submission.
6. Synchronize **Pieces $\longleftrightarrow$ Meters**:
   - Operators can enter either Pieces or Meters without fractional rounding errors.

---

## 2. Work Center & Stage Routing Rules

- **Upstream Mother Pipe Stages**:
  - `ROLLING` (Hot Rolling Mill / HTC)
  - `HOLLOW_HEAT_TREATMENT` (Hollow Annealing)
  - `PILGER` (Cold Pilger Mill)
  - `DRAW` (Cold Draw Bench)
  - `HEAT_TREATMENT` (Final Heat Treatment)
  - *Inventory Unit*: Long Mother Pipes ($L \approx 6.0\text{ m} - 14.0\text{ m}$).
- **Downstream Cut Piece Stages**:
  - `BAND_SAW` (Band Saw Cutting)
  - `VDI` (Visual Dimension Inspection & QC)
  - `FINISHING` (Finishing & Bundling)
  - *Inventory Unit*: Discrete Cut Pieces ($L \approx 3.0\text{ m} - 6.5\text{ m}$).

### Routing Constraints
1. **STP 9.5m Constraint**:
   - In Seamless Tube Plants (STP), draw bench beds, pickling tanks, and pointing machines have a standard maximum length limit of $9.5\text{ m}$.
   - If material directed to `DRAW` or `HOLLOW_HEAT_TREATMENT` has length $> 9.5\text{ m}$, the system highlights this condition and recommends Mode B (Cut & Divert), with a checkbox for *Special Exemption Override*.
2. **Cold Draw Cross-Section Feasibility**:
   - When Target Stage is `DRAW`:
     - $\text{OD}_{\text{source}} \ge \text{OD}_{\text{target}}$ and $\text{WT}_{\text{source}} \ge \text{WT}_{\text{target}}$.
     - Area reduction must be positive:
       $$A = \pi \times (OD - WT) \times WT$$
       $$\text{Area Reduction \%} = \frac{A_{\text{source}} - A_{\text{target}}}{A_{\text{source}}} \times 100$$
       $$E = \frac{A_{\text{source}}}{A_{\text{target}}}$$

---

## 3. Mode Specifications

### Mode A: Direct Transfer (As-Is)
- Source WO & Source Stage selection (with live WIP display and station pills).
- Target WO & Target Stage selection.
- Single input for quantity (Pcs or Mtrs, auto-syncing).
- Soft warning if diverted quantity exceeds target remaining balance.
- Live preview showing source deduction and target addition.

### Mode B: Cut & Divert (Trimming & Splitting)
- **Source Selection**:
  - Select Source WO & Stage.
  - Mother Pipe Length ($L_{\text{mother}}$ in meters, defaults to stage piece length).
  - Mother Pipe Count ($N_{\text{mother}}$).
  - Total Incoming Mtrs = $N_{\text{mother}} \times L_{\text{mother}}$.
- **Cut Split 1 (Primary Target)**:
  - Target WO A & Target Stage.
  - Cut Length ($L_A$ in meters).
  - Total Target Mtrs = $N_{\text{mother}} \times L_A$.
- **Cut Split 2 (Optional Secondary Target)**:
  - Checkbox: "Split remnant to second Work Order".
  - Target WO B & Target Stage.
  - Cut Length ($L_B$ in meters).
  - Total Target Mtrs = $N_{\text{mother}} \times L_B$.
- **Remnant Accounting**:
  $$\text{Remnant Length per Pipe } L_{\text{rem}} = L_{\text{mother}} - (L_A + L_B)$$
  $$\text{Total Remnant Mtrs} = N_{\text{mother}} \times L_{\text{rem}}$$
  - **If $L_{\text{rem}} \ge 3.0\text{ m}$ (Rule 5C)**:
    - Classified as `USABLE_OFFCUT`.
    - Automatically registered into the **Off-cuts & Remnants Pool** under Source WO ID with remark `[OFFCUT_REMNANT: {len}m]`.
  - **If $L_{\text{rem}} < 3.0\text{ m}$ (Rule 5B)**:
    - Classified as `SCRAP`.
    - Automatically tagged as cutting scrap (`[SCRAP_REMNANT: {len}m]`) and excluded from active prime/remnant balance.

---

## 4. Off-cuts & Remnants Pool

A dedicated tab on the `/diversions` page that lists all available remnants $\ge 3.0\text{ m}$:
- Shows: Remnant ID, Source WO #, Customer, Grade, Size ($\text{OD} \times \text{WT}$), Piece Length, Pieces, Total Meters, Total MT, Date Created.
- Quick Actions:
  - **[Divert to Order]**: Automatically pre-fills the Diversion Form (Mode A) with the remnant's specifications.
  - **[Commercial Sale]**: Downgrades remnant to commercial inventory.
  - **[Declare Scrap]**: Condemns damaged remnant to melt loss.

---

## 5. Mobile-First UI/UX Requirements

- Single-column stacked layout on mobile screens ($< 768\text{px}$).
- Minimum touch target: $44\text{px} \times 44\text{px}$.
- Sticky bottom mobile action drawer displaying:
  - Diverted Total (Mtrs & Pcs).
  - Target Destination summary.
  - Primary Submit Button.
- Dense industrial typography adhering to `.agents/rules/ui-ux-standards.md` (`font-mono tabular-nums`).
