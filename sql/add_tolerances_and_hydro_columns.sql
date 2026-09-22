-- ============================================================================
-- Migration: Add Tolerances & Hydrostatic Pressure to material_spec_master
-- Run this in Supabase Dashboard → SQL Editor → New Query
-- ============================================================================

ALTER TABLE public.material_spec_master 
  ADD COLUMN IF NOT EXISTS od_tolerance text,
  ADD COLUMN IF NOT EXISTS wt_tolerance text,
  ADD COLUMN IF NOT EXISTS hydro_pressure text;

GRANT ALL ON TABLE public.material_spec_master TO anon, authenticated, service_role;
