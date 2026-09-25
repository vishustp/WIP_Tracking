## 2024-10-25 - Icon-only Action Buttons
**Learning:** Icon-only action buttons (e.g., 'X'/close buttons, Edit, Delete) in this project often lack accessibility attributes like `aria-label`. The `title` attribute provides visual tooltips but is insufficient for screen readers. Some buttons lack both.
**Action:** When working on UI components, particularly admin tables or modals, ensure icon-only buttons include a descriptive `aria-label` (and often a `title`). Make sure dynamic data is correctly preserved in `aria-label` to provide context (e.g., `Delete spec 123`).
