## 2024-05-25 - [Accessibility Improvements]
**Learning:** Found several icon-only buttons lacking `aria-label` and `title` attributes in the `DataReport.tsx` and `WorkOrderTrackingClient.tsx` components.
**Action:** Proactively search for `<button>` elements that only contain an icon component (e.g. `<X />`, `<ChevronLeft />`) and add descriptive `aria-label` and `title` attributes to them.
