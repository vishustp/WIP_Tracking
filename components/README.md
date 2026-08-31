# Seamless Steel Pipe WIP & Production Planning

Production-oriented Next.js + Supabase application implementing route-aware planning, WIP and atomic production/diversion operations.

## Run
1. Create a fresh Supabase project.
2. Run `supabase/migrations/001_initial.sql` in Supabase SQL Editor.
3. Copy `.env.example` to `.env.local` and fill Supabase URL and anon key.
4. `npm install`
5. `npm run dev`

Create an authenticated user in Supabase Auth and a matching `profiles` row with role `Admin` before using protected operations.

## Core model
Work Order is commercial identity. Route is assigned to planned/diverted quantity. Production logs represent physical movement. WIP is derived from production history and route-stage configuration.

## Critical RPCs
- `create_rolling_plan`
- `create_diversion`
- `record_production`
- `get_unplanned_qty`

All quantity-changing RPCs validate on PostgreSQL, not just in the UI.


## Vercel-ready UI update
This build includes authenticated route protection, responsive sidebar navigation, Work Order creation, Rolling Planning, Diversion Planning, stage-aware production entry, and report pages. It uses the existing Supabase tables/RPCs and does not embed Supabase secrets in source.
