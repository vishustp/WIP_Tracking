
## 2024-05-24 - [Always pair title with aria-label for icon buttons]
**Learning:** Icon-only action buttons (e.g., 'X'/close buttons or 'Trash'/delete buttons) in this project often lack accessibility attributes. Relying on `title` alone provides tooltips for mouse users but is insufficient for screen readers.
**Action:** Always pair `title` (for visual tooltips) with a descriptive `aria-label` (for screen readers) on icon-only interactive elements.
