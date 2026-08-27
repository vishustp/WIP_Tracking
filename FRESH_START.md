# Fresh-start deployment

## Supabase
This project is intended for a fresh Supabase database.

1. Create/reset the Supabase project database.
2. Run `supabase/migrations/001_initial.sql` once in the Supabase SQL Editor.
3. Create at least one authenticated user and set their `profiles.role` to an allowed role.
4. Set the project's Supabase environment variables from `.env.example`.

Do not run old production-flow migrations on top of this schema. The production functions are defined with their final signatures in `001_initial.sql`.

## Production entry
`components/production/ProductionEntryGrid.tsx` is the single common production form. The Work Center is selected from the dropdown; the route pages reuse the same component without a required `stageCode` prop.

Production WIP rules implemented:
- Rolling: rolling-plan quantity + diversion quantity - rolling production input.
- Hollow Heat Treatment: net rolling production - hollow-HT input.
- Draw: HTC OK + diversion quantity - draw input.
- Heat Treatment: net Draw production - HT input.
- Finishing for HFS/ALLOY_HFS: HTC OK × Multiple - finishing input.
- Other Finishing routes: net Heat Treatment production × Multiple - finishing input.

Rolling production includes `HTC OK`.

Rolling Plan Issue and Diversion include `Multiple`.

Recent production entries support correction/deletion only for the latest entry for the same Work Order + Route. The database enforces the same restriction.
