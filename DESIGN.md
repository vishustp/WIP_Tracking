---
name: Seamless Pipe WIP Tracking
description: High-precision industrial manufacturing execution and WIP tracking system
colors:
  primary: "#4f46e5"
  primary-hover: "#4338ca"
  neutral-bg: "#f8fafc"
  surface: "#ffffff"
  surface-subtle: "#f1f5f9"
  border: "#e2e8f0"
  text-main: "#0f172a"
  text-muted: "#64748b"
  success: "#10b981"
  warning: "#f59e0b"
  danger: "#ef4444"
  info: "#0284c7"
typography:
  display:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.2
  body:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, monospace"
    fontSize: "0.8125rem"
    fontWeight: 600
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
---

## Overview
High-density, professional industrial execution UI engineered for seamless steel pipe production tracking, multi-length band saw cutting, WIP balances, and gated quality inspection.

## Colors
- **Primary / Brand**: Indigo `#4f46e5` for primary actions, active tabs, and navigation headers.
- **Surface / Background**: Clean slate background `#f8fafc` with pure white cards `#ffffff` and subtle slate borders `#e2e8f0`.
- **Status & Semantics**:
  - Emerald `#10b981`: Prime output, OK yields, completed batches.
  - Indigo/Sky `#0284c7`: In-process batches, mother pipe inputs.
  - Amber `#f59e0b`: Scrap generation, trims, over-processing notices.
  - Rose `#ef4444`: Defect rejections, dimensional out-of-spec.

## Typography
- **UI / Headings**: Inter / System UI, bold uppercase tracking for section labels and table column headers.
- **Numbers & Metrics**: Monospaced font for all weights (MT), lengths (MTR), and pieces (PCS) to guarantee scannability in data grids.

## Layout
- Responsive responsive grid cards (KPI strips, 2-column modal forms).
- Dense industrial tables with high-contrast sticky headers, zebra-striping, and row-level action buttons.

## Elevation & Depth
- Minimalist shadow levels (`shadow-2xs`, `shadow-xs`) with clean 1px border definitions (`border-slate-200`).

## Shapes
- Rounded corners (`rounded-lg` 8px, `rounded-xl` 12px) for cards and modals.
- Compact form controls with 32px (`h-8`) and 36px (`h-9`) heights.

## Components
- **Metric Cards**: Light-themed with subtle gradient accents, uppercase pill labels, bold monospaced values.
- **Modals**: Centered overlays with sticky headers and pinned action footers.
- **Gauges & Visualizers**: Segmented color-coded progress bars for material utilization.

## Do's and Don'ts
- **DO** format all tonnage to 3 decimal places (`0.000 MT`) and lengths to 2 decimal places (`0.00 m`).
- **DO** use monospaced text for all dimension strings (`OD × WT`).
- **DON'T** use low-contrast gray text on crucial numerical data.
