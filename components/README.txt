PRODUCTION UI REPLACEMENT

Replace:
components/production/ProductionEntryGrid.tsx
app/production/page.tsx

The five old production URLs are included as redirect pages so old bookmarks do not open separate production forms:
app/production/rolling/page.tsx
app/production/hollow-ht/page.tsx
app/production/draw/page.tsx
app/production/heat-treatment/page.tsx
app/production/finishing/page.tsx

IMPORTANT:
The sidebar/navigation file is not included because its exact source file was not available in the uploaded project context. In the sidebar, remove the five old Production links and keep only:
Production Entry -> /production

No database or RPC files are changed by this package.
