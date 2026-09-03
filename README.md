# Seamless Steel Pipe WIP & Production Planning

Production-oriented Next.js + Supabase application implementing route-aware planning, WIP and atomic production/diversion operations.

## Run
1. Create a fresh Supabase project.
2. Install the [Supabase CLI](https://supabase.com/docs/guides/cli), link the
   project, then run `supabase db push`. This applies every migration in order,
   including the current security migration. Do not run only `001_initial.sql`.
3. Copy `.env.example` to `.env.local` and fill Supabase URL and anon key.
4. `npm ci`
5. `npm run dev`

Create an authenticated user in Supabase Auth and a matching `profiles` row with role `Admin` before using protected operations.

## Verification

Run `npm run lint`, `npm test`, and `npm run build` before deployment. GitHub
Actions runs the same checks for pushes to `main` and pull requests.

## Security

The Supabase anon key belongs in the browser, but operational data must remain
authenticated-only. Apply all migrations, especially
`030_harden_public_access.sql`; it removes legacy anonymous access policies and
RPC grants. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only.

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
