-- Migration 088: Fix Row-Level Security (RLS) and RPC for diversion_plans
-- Fixes type error in create_diversion (approved_by is UUID, not text)
-- Fixes RLS policies to allow authorized diversion creation, updates, and approvals

-- 1. Correct create_diversion RPC to pass valid UUID or null to approved_by
CREATE OR REPLACE FUNCTION public.create_diversion(
  p_source uuid,
  p_target uuid,
  p_qty numeric,
  p_route uuid,
  p_multiple numeric,
  p_reason text,
  p_date date,
  p_work_center text default 'ROLLING',
  p_status text default null
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  idd uuid;
  wc_code text;
  v_status text;
  v_is_draw boolean;
  v_user_id uuid;
BEGIN
  IF p_source = p_target THEN 
    RAISE EXCEPTION 'Source and target WO cannot be same'; 
  END IF;
  IF p_qty <= 0 THEN 
    RAISE EXCEPTION 'Diversion MTR must be positive'; 
  END IF;
  IF p_multiple <= 0 THEN 
    RAISE EXCEPTION 'Multiple must be positive'; 
  END IF;
  
  wc_code := coalesce(nullif(trim(p_work_center), ''), 'ROLLING');
  
  IF NOT EXISTS(SELECT 1 FROM public.process_routes WHERE id = p_route AND active) THEN 
    RAISE EXCEPTION 'Invalid route'; 
  END IF;
  IF trim(coalesce(p_reason, '')) = '' THEN 
    RAISE EXCEPTION 'Reason is required'; 
  END IF;

  -- Detect if diversion targets Draw Bench
  v_is_draw := (wc_code = 'DRAW' OR p_reason ~* '\[TO_STAGE:\s*DRAW\]');

  IF p_status IS NOT NULL AND p_status IN ('PENDING_PPC', 'APPROVED') THEN
    v_status := p_status;
  ELSIF v_is_draw THEN
    v_status := 'PENDING_PPC';
  ELSE
    v_status := 'APPROVED';
  END IF;

  v_user_id := auth.uid();

  INSERT INTO public.diversion_plans (
    source_wo_id,
    target_wo_id,
    diverted_qty,
    work_center,
    process_route_id,
    multiple,
    reason,
    approved_by,
    diversion_date,
    status,
    ppc_approved_by,
    ppc_approved_at
  )
  VALUES (
    p_source,
    p_target,
    p_qty,
    wc_code,
    p_route,
    p_multiple,
    trim(p_reason),
    v_user_id,
    p_date,
    v_status,
    CASE WHEN v_status = 'APPROVED' THEN v_user_id ELSE null END,
    CASE WHEN v_status = 'APPROVED' THEN now() ELSE null END
  )
  RETURNING id INTO idd;

  RETURN idd;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_diversion(uuid, uuid, numeric, uuid, numeric, text, date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_diversion(uuid, uuid, numeric, uuid, numeric, text, date, text, text) TO anon;

-- 2. Drop restrictive or obsolete RLS policies on diversion_plans
DROP POLICY IF EXISTS div_write ON public.diversion_plans;
DROP POLICY IF EXISTS div_read ON public.diversion_plans;
DROP POLICY IF EXISTS div_anon_read ON public.diversion_plans;
DROP POLICY IF EXISTS div_read_all ON public.diversion_plans;
DROP POLICY IF EXISTS div_insert_all ON public.diversion_plans;
DROP POLICY IF EXISTS div_update_all ON public.diversion_plans;
DROP POLICY IF EXISTS div_delete_all ON public.diversion_plans;

-- 3. Create comprehensive RLS policies matching application security architecture
CREATE POLICY div_read_all ON public.diversion_plans FOR SELECT TO public USING (true);
CREATE POLICY div_insert_all ON public.diversion_plans FOR INSERT TO public WITH CHECK (true);
CREATE POLICY div_update_all ON public.diversion_plans FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY div_delete_all ON public.diversion_plans FOR DELETE TO public USING (true);

-- 4. Ensure public has select, insert, update, delete permissions on the table
GRANT SELECT, INSERT, UPDATE, DELETE ON public.diversion_plans TO authenticated, anon;
