## 2026-09-06 - Missing ARIA Labels on Icon-Only Actions
**Learning:** Found a pattern where icon-only action buttons (like clear search and pagination controls) in reporting components lacked `aria-label` attributes, making them inaccessible to screen readers. Even minor utility buttons need descriptive labels for an inclusive experience.
**Action:** Always add descriptive `aria-label` and `title` attributes to icon-only buttons. I should proactively check for this pattern when creating or modifying small utility actions in UI components.
