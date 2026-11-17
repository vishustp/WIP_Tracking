# Heat Treatment WIP Audit Report

**Date of Audit**: November 17, 2026  
**Audited Route**: Cold Drawn Seamless (`CDS` & `ALLOY_CDS`)  
**Audited Customer**: Bharat Heavy Electrical Limited (BHEL)  
**Audited Product Size**: 76.10 × 4.50 mm (ASME SA 192)  

---

## 1. Executive Summary

A comprehensive stage-to-stage metallurgical and queue reconciliation audit was conducted across production logs, quality control inspections, rolling plans, diversion plans, and active route stage balances (`vw_route_stage_wip`).

### Work Order Audit Summary (BHEL 76.10 × 4.50 mm)

| Work Order | Spec | Length | Drawn Output (Mtrs / Pcs) | HT Logged (Mtrs / Pcs) | Band Saw Cut (Mtrs / Pcs) | Real Physical WIP | Raw System Queue | Audit Finding |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **6400** | SA 192 | 10.0 m | 1,180.0m (118 pcs) | 940.0m (94 pcs) | 940.0m (94 pcs) | **24 pcs (240.0m)** | 24 pcs (240.0m) | **Real Physical WIP** waiting at HT |
| **6397** | SA 192 | 7.5 m | 427.5m (57 pcs) | 337.5m (45 pcs) | 337.5m (45 pcs) | **12 pcs (90.0m)** | 12 pcs (90.0m) | **Real Physical WIP** waiting at HT |
| **6448** | SA 192 | 7.5 m | 2,062.5m (275 pcs) | 1,995.0m (266 pcs) | 1,995.0m (266 pcs) | **9 pcs (67.5m)** | 9 pcs (67.5m) | **Real Physical WIP** waiting at HT |
| **6394** | SA 192 | 10.0 m | 60.0m (6 pcs) | 0.0m (0 pcs) | 0.0m (0 pcs) | **6 pcs (60.0m)** | 6 pcs (60.0m) | **Real Physical WIP** waiting at HT |
| **6455** | SA 192 | 8.0 m | 560.0m (70 pcs) | 560.0m (70 pcs) | 669.5m (85 pcs) | **0 pcs (0.0m)** | 0 pcs (0.0m) | **0 HT WIP** (WIP is 13 pcs VDI + 6 pcs Salvage) |
| **6453** | SA 192 | 8.0 m | 1,728.0m (216 pcs) | 1,223.96m (153 pcs) | 1,680.0m (210 pcs) | **0 pcs (0.0m)** | 59 pcs (472.0m) | **Phantom WIP** (already cut at Band Saw) |
| **TOTALS** | | | | | | **51 pcs (457.5m / 3.635 MT)** | **110 pcs (929.5m / 7.385 MT)** | |

---

## 2. Order-by-Order Metallurgical Audit

### WO 6400 (Length: 10.0 m | Ordered: 90 pcs / 900 m | Balance: 16 pcs)
- **Draw Bench Production**: Produced 1,200.0 m (120 pcs), 20.0 m (2 pcs) line rejection. Net delivered to Heat Treatment: **1,180.0 m (118 pcs)**.
- **Heat Treatment Production**: Produced **940.0 m (94 pcs)** across 3 recorded heats.
- **Stage Active WIP**:
  $$\text{Incoming Draw (1,180 m)} - \text{Heat Treatment (940 m)} = \mathbf{240.0\text{ m} (24\text{ pcs at 10m})}$$
- **Downstream Reality**: Band Saw cut exactly 940.0 m (94 pcs). Finishing bundled 759.5 m (76 pcs), and 150.0 m was diverted out from VDI to WO 6448.
- **Conclusion**: The **24 pcs (240.0 m / 1.907 MT)** is **100% genuine physical WIP** awaiting heat treatment and cutting.

### WO 6397 (Length: 7.5 m | Ordered: 43 pcs / 322.5 m | Balance: 43 pcs)
- **Draw Bench Production**: Produced **427.50 m (57 pcs)**.
- **Heat Treatment Production**: Produced **337.50 m (45 pcs)**.
- **Stage Active WIP**:
  $$\text{Incoming Draw (427.5 m)} - \text{Heat Treatment (337.5 m)} = \mathbf{90.0\text{ m} (12\text{ pcs at 7.5m})}$$
- **Downstream Reality**: Band Saw cut exactly 337.5 m (45 pcs). VDI inspected 20 pcs (19 OK, 1 salvage diverted out).
- **Conclusion**: The **12 pcs (90.0 m / 0.715 MT)** is **100% genuine physical WIP** awaiting heat treatment.

### WO 6448 (Length: 7.5 m | Ordered: 100 pcs / 750 m | Balance: 100 pcs)
- **Draw Bench Production**: Produced **2,062.50 m (275 pcs)**.
- **Heat Treatment Production**: Produced **1,995.00 m (266 pcs)** across 5 heats.
- **Stage Active WIP**:
  $$\text{Incoming Draw (2,062.5 m)} - \text{Heat Treatment (1,995.0 m)} = \mathbf{67.5\text{ m} (9\text{ pcs at 7.5m})}$$
- **Downstream Reality**: Band Saw cut exactly 1,995.0 m (266 pcs).
- **Conclusion**: The **9 pcs (67.5 m / 0.536 MT)** is **100% genuine physical WIP** waiting at Heat Treatment.

### WO 6394 (Length: 10.0 m | Ordered: 3 pcs / 30 m | Balance: 3 pcs)
- **Draw Bench Production**: Produced **60.00 m (6 pcs)**.
- **Heat Treatment Production**: 0 m recorded.
- **Stage Active WIP**:
  $$\text{Incoming Draw (60.0 m)} - \text{Heat Treatment (0.0 m)} = \mathbf{60.0\text{ m} (6\text{ pcs at 10m})}$$
- **Downstream Reality**: No downstream operations recorded yet.
- **Conclusion**: The **6 pcs (60.0 m / 0.477 MT)** is **100% genuine physical WIP** waiting for furnace heat treatment.

### WO 6455 (Length: 8.0 m | Ordered: 82 pcs / 656 m | Balance: 20 pcs)
- **Draw Bench & Heat Treatment**: 560.0 m (70 pcs) drawn and 560.0 m (70 pcs) heat treated.
- **Stage Active WIP**:
  $$560.0\text{ m} - 560.0\text{ m} = \mathbf{0.0\text{ m} (0\text{ pcs})}$$
- **Downstream Reality**: Band Saw cut 669.5 m (85 pcs). VDI inspected 71 pcs (65 OK + 6 Salvage).
- **Conclusion**: **0 pcs at Heat Treatment.** All remaining balance is at VDI (13 pcs queue + 6 pcs salvage).

### WO 6453 (Length: 8.0 m | Ordered: 90 pcs / 720 m | Balance: 90 pcs) — Phantom WIP
- **Draw Bench Production**: Produced **1,728.0 m (216 pcs)**.
- **Heat Treatment Logs**: Shows **1,223.96 m (153 pcs)**.
- **Raw Stage WIP**: $1,728.0\text{ m} - 1,223.96\text{ m} = \mathbf{472.0\text{ m} (59\text{ pcs})}$.
- **Downstream Reality**:
  - Band Saw logged cuts of **1,680.0 m (210 pcs)**!
  - VDI inspected **1,536.0 m (192 pcs)** (109 OK + 12 Salvage diverted).
  - Band Saw has cut 210 pcs out of the 216 drawn mother pipes.
  - The 57 mother pipes ($456\text{ m}$) that were not logged by the furnace operator physically passed through Heat Treatment and have already been cut into cut pieces.
- **Conclusion**: The **59 pcs at Heat Treatment is a PHANTOM QUEUE**. The material has physically cleared Heat Treatment and Band Saw. The true remaining balance is strictly **5 pcs at VDI / QC Inspection**.

---

## 3. Factory-Wide Heat Treatment Totals

Across all grades and sizes in the plant:

| Metric | Factory Heat Treatment Total |
| :--- | :---: |
| **Active Work Orders** | **17 Orders** |
| **Total Ready Pieces** | **3,401 pcs** |
| **Total Ready Meters** | **32,408.02 Mtrs** |
| **Total Tonnage** | **141.10 MT** |
| **Hollow Heat Treatment Queue** | **0 pcs (0.00 Mtrs)** |
