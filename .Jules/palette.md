## 2024-03-24 - Accessibility: Icon-Only Buttons
**Learning:** Many icon-only buttons use `title` for visual tooltips but lack `aria-label` for screen readers.
**Action:** When finding `title` on icon-only buttons, add matching `aria-label` to make them accessible to screen readers while keeping the visual tooltip.
