## 2024-09-18 - Missing ARIA Labels on Icon-only Buttons
**Learning:** Found multiple instances where icon-only buttons only have 'title' attributes but lack 'aria-label', making them inaccessible to screen readers as 'title' alone is insufficient for accessibility.
**Action:** Always add descriptive 'aria-label' attributes to icon-only buttons alongside the 'title' attribute.
