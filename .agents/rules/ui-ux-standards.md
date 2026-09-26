# UI/UX Design Standards & Frontend Engineering Rules

This document establishes the mandatory UI/UX standards for all frontend interfaces in the WIP Tracking system, including Dashboards, Production Entry consoles, Reports, Work Order tracking, and Modals.

All frontend work must comply with these guidelines and leverage the workspace skills:
- **Impeccable** (`.agents/skills/impeccable/SKILL.md`): Visual hierarchy, typography scales, contrast, spatial rhythm, micro-interactions.
- **Frontend UI Engineering** (`.agents/skills/frontend-ui-engineering/SKILL.md`): Component composition, WCAG 2.1 AA accessibility, state management, tabular data layouts.

---

## 1. Core Philosophy: Industrial-Grade High-Density UX

1. **Purpose-Driven, Not Generic "AI Aesthetics"**:
   - Absolutely no generic AI-style purple/violet neon gradients or decorative fluff that compromises readability.
   - The interface is designed for real steel mill production environments: operators with gloves/touchscreens, production planners scanning thousands of meters of pipe, and executives reviewing real-time yields.
2. **Zero Ambiguity & Zero Layout Shift (CLS < 0.1)**:
   - Layouts must be rock-solid. Use fixed skeletons or minimum heights during loading to eliminate jumpy reflows.
3. **Speed of Entry & Information Density**:
   - Standard operations should require minimal keystrokes (e.g. 1-click pre-fill from rolling plan).
   - High data density is preferred over excessive whitespace, provided optical hierarchy and breathing room remain crisp.

---

## 2. Typography & Numeric Precision

1. **Tabular Numerals for Industrial Metrics**:
   - All quantities (Pcs, Mtr, MT), Work Order IDs, Heat Numbers, OD/WT dimensions, and yield percentages must use **monospace or tabular numerals**:
     `font-mono tabular-nums tracking-tight`
   - Numeric columns in tables and matrices must **always be right-aligned** (`text-right`), with matching right-aligned column headers.
2. **Text & Status Alignment**:
   - Text descriptions, Customer names, and Grades are left-aligned (`text-left`).
   - Fixed-length codes, dates, and status badges are centered (`text-center`).
3. **Visual Hierarchy**:
   - Page Titles: `text-2xl font-bold tracking-tight text-foreground`
   - Section/Card Headers: `text-base font-semibold text-foreground`
   - Table Column Headers: `text-xs font-medium uppercase tracking-wider text-muted-foreground`
   - Secondary metadata / helper text: `text-xs text-muted-foreground`

---

## 3. Color Tokens & Semantic Hierarchy

1. **WCAG 2.1 AA Contrast Compliance**:
   - All body text and numbers must achieve a contrast ratio of at least **4.5:1** against the background.
   - UI components, borders, and icons must achieve at least **3.0:1**.
2. **Industrial Semantic Color Palette**:
   - **Neutral / Steel**: Zinc or Slate base scales (`slate-900`/`zinc-900` dark, `slate-50`/`zinc-100` light) for frames, cards, and dividers.
   - **Production OK / Passed**: Emerald / Forest green (`text-emerald-700 bg-emerald-50 border-emerald-200` in light, `text-emerald-400 bg-emerald-950/60 border-emerald-800` in dark).
   - **In-Queue / Pending / Active WIP**: Amber / Warm Ochre (`text-amber-700 bg-amber-50 border-amber-200` in light, `text-amber-400 bg-amber-950/60 border-amber-800` in dark).
   - **Rejection / Scrap / Critical Hold**: Rose / Crimson (`text-rose-700 bg-rose-50 border-rose-200` in light, `text-rose-400 bg-rose-950/60 border-rose-800` in dark).
   - **Diversion / Secondary Dispatch**: Sky / Blue-Gray (`text-sky-700 bg-sky-50 border-sky-200` in light, `text-sky-400 bg-sky-950/60 border-sky-800` in dark).
   - **Bundled / Finished Product**: Indigo / Violet accent for final dispatched product.

---

## 4. Data Tables & Matrix Views

1. **Sticky Headers and Summaries**:
   - Table headers must remain sticky during vertical scroll: `sticky top-0 z-10 bg-background/95 backdrop-blur`.
   - Summary / Grand Total rows must be pinned to the bottom: `sticky bottom-0 bg-muted/90 font-bold border-t-2`.
2. **Dense Row Spacing & Scannability**:
   - Standard data row padding: `py-2 px-3` (compact) or `py-2.5 px-3.5` (standard). Avoid oversized `p-6` card grids where data comparison is needed.
   - Row hover effects: `hover:bg-muted/50 transition-colors`.
   - Zebra striping: subtle alternating background `even:bg-muted/20` for tables with > 15 rows.
3. **Horizontal Overflow Safety**:
   - Always wrap wide tables in `overflow-x-auto` containers with custom slim scrollbars. Never let tables clip or blow out parent containers.

---

## 5. Forms & Shop-Floor Production Entry Consoles

1. **Keyboard & Touch Accessibility**:
   - Form inputs on `/production` must support `Tab` navigation and `Enter` key quick-submits.
   - Clear focus visible outlines: `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`.
   - Touch targets must be at least 44x44px for shop-floor touch screens.
2. **Real-time Mill Rule Validation**:
   - Prevent impossible entries with clear inline badges (e.g. Warning when cut length $< 3.0\text{ m}$ triggers Rule 5B auto-scrap).
   - Provide immediate visual confirmation of calculations (e.g. elongation meters, scrap meters, prime cuts).
3. **Empty, Loading & Error States**:
   - Every table and card must handle 4 explicit states:
     1. **Loading**: Structured skeleton placeholders matching the exact card/row geometry (no generic spinners that pop layout).
     2. **Empty**: Informative empty message with icon and contextual action (e.g. "No active WIP queue for Band Saw. Check preceding Hollow HT stage.").
     3. **Error**: Retry button with human-readable error description.
     4. **Data Present**: Clean, high-contrast, formatted view.

---

## 6. Modals, Drawers & Overlays

1. **Accessible Dialog Lifecycle**:
   - Must trap focus, dismiss on `Escape` key press or backdrop click, and restore focus to trigger element on close.
   - Use `aria-labelledby` and `aria-describedby` properly.
2. **Destructive Action Confirmation**:
   - Irreversible actions (e.g., Scrapping material, Deleting production entries, Un-bundling) must require an explicit two-step confirmation modal with clear impact explanation.

---

## 7. Review & Verification Workflow

Before concluding any frontend UI task or shipping changes to dashboards, reports, or production screens:
1. Run `npm test` and `npm run build` to verify clean compilation with no TypeScript or lint warnings.
2. Review contrast and spacing against both Dark and Light themes.
3. Verify tabular numbers use monospace font and proper alignment.
