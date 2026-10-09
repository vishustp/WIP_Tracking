-- 069_grant_daily_production_plans.sql
-- Grant table permissions for Unified Daily Planning Console across all roles

grant all on public.daily_production_plans to authenticated, anon, service_role;
