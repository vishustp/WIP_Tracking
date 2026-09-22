-- ============================================================================
-- Fix: Grant Permissions on material_spec_master Table
-- Run this in your Supabase Dashboard -> SQL Editor -> New Query -> Run
-- ============================================================================

-- 1. Grant table privileges to Supabase roles
GRANT ALL ON TABLE public.material_spec_master TO anon, authenticated, service_role;

-- 2. Ensure RLS allows reads for both anonymous and authenticated users
ALTER TABLE public.material_spec_master ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "spec_master_read" ON public.material_spec_master;
CREATE POLICY "spec_master_read" ON public.material_spec_master
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "spec_master_write" ON public.material_spec_master;
CREATE POLICY "spec_master_write" ON public.material_spec_master
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "spec_master_anon_read" ON public.material_spec_master;
CREATE POLICY "spec_master_anon_read" ON public.material_spec_master
  FOR SELECT TO anon USING (true);

-- 3. Verify access
SELECT COUNT(*) AS total_specifications FROM public.material_spec_master;
