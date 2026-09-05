## 2024-09-06 - Dynamic Accessibility Attributes
**Learning:** When adding `aria-label` attributes to elements that already have dynamic `title` tooltips, it is crucial to make the `aria-label` dynamic as well. A static `aria-label` overrides the `title` attribute for screen readers, hiding important dynamic data (like notification counts) from visually impaired users while sighted users still see the tooltip.
**Action:** Always check for dynamic data in `title` or visual indicators when adding `aria-label`s and mirror that dynamism in the accessibility label.
