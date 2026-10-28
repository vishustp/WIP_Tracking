-- Migration 085: PPC Approval Workflow for Diversions to Draw Bench
-- Ensures that diversions targeting Cold Draw Bench (DRAW) require explicit PPC approval
-- before WIP is deducted from the source order or credited to the target order at Draw Bench.

-- 1. Add status and PPC approval columns to public.diversion_plans
ALTER TABLE public.diversion_plans
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'APPROVED'
    CHECK (status IN ('PENDING_PPC', 'APPROVED', 'REJECTED_BY_PPC', 'CANCELLED')),
  ADD COLUMN IF NOT EXISTS ppc_approved_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS ppc_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS ppc_rejection_reason text,
  ADD COLUMN IF NOT EXISTS ppc_remarks text;

-- 2. Backfill existing records to APPROVED
UPDATE public.diversion_plans
SET status = 'APPROVED'
WHERE status IS NULL;

-- 3. Update create_diversion RPC to support Draw Bench approval workflow
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
    coalesce(auth.jwt()->>'email', 'PPC'),
    p_date,
    v_status,
    CASE WHEN v_status = 'APPROVED' THEN auth.uid() ELSE null END,
    CASE WHEN v_status = 'APPROVED' THEN now() ELSE null END
  )
  RETURNING id INTO idd;

  RETURN idd;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_diversion(uuid, uuid, numeric, uuid, numeric, text, date, text, text) TO authenticated;

-- 4. Create RPC for PPC Approval
CREATE OR REPLACE FUNCTION public.approve_diversion(
  p_id uuid,
  p_remarks text default null
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE public.diversion_plans
  SET status = 'APPROVED',
      ppc_approved_by = auth.uid(),
      ppc_approved_at = now(),
      ppc_remarks = coalesce(nullif(trim(p_remarks), ''), ppc_remarks),
      updated_at = now()
  WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_diversion(uuid, text) TO authenticated;

-- 5. Create RPC for PPC Rejection
CREATE OR REPLACE FUNCTION public.reject_diversion(
  p_id uuid,
  p_reason text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF trim(coalesce(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'Rejection reason is required';
  END IF;

  UPDATE public.diversion_plans
  SET status = 'REJECTED_BY_PPC',
      ppc_rejection_reason = trim(p_reason),
      updated_at = now()
  WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reject_diversion(uuid, text) TO authenticated;

-- 6. Update get_diversion_plans to include status and PPC metadata
DROP FUNCTION IF EXISTS public.get_diversion_plans(text,text,text,date,date,integer);

CREATE OR REPLACE FUNCTION public.get_diversion_plans(
  p_search text default null,
  p_route_code text default null,
  p_work_center text default null,
  p_from_date date default null,
  p_to_date date default null,
  p_limit integer default 500,
  p_status text default null
)
RETURNS TABLE(
  id uuid,
  source_wo_id uuid,
  source_wo_no text,
  source_customer text,
  source_grade text,
  source_size text,
  target_wo_id uuid,
  target_wo_no text,
  target_customer text,
  target_grade text,
  target_size text,
  diverted_qty numeric,
  diverted_pcs numeric,
  diverted_mt numeric,
  work_center text,
  work_center_name text,
  route_id uuid,
  route_code text,
  route_name text,
  multiple numeric,
  reason text,
  approved_by text,
  diversion_date date,
  created_at timestamptz,
  updated_at timestamptz,
  can_modify boolean,
  status text,
  ppc_approved_by text,
  ppc_approved_at timestamptz,
  ppc_rejection_reason text,
  ppc_remarks text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    dp.id,
    dp.source_wo_id,
    sw.work_order_no as source_wo_no,
    coalesce(sw.customer_name, '') as source_customer,
    coalesce(sw.grade, sw.specification, '') as source_grade,
    concat(coalesce(sw.size_od, 0), '×', coalesce(sw.size_wt, 0), ' mm') as source_size,
    dp.target_wo_id,
    tw.work_order_no as target_wo_no,
    coalesce(tw.customer_name, '') as target_customer,
    coalesce(tw.grade, tw.specification, '') as target_grade,
    concat(coalesce(tw.size_od, 0), '×', coalesce(tw.size_wt, 0), ' mm') as target_size,
    dp.diverted_qty,
    public.mtr_to_pcs(dp.source_wo_id, dp.diverted_qty) as diverted_pcs,
    public.mtr_to_mt(dp.source_wo_id, dp.diverted_qty) as diverted_mt,
    coalesce(dp.work_center, 'ROLLING') as work_center,
    coalesce(ps.stage_name, replace(coalesce(dp.work_center, 'ROLLING'), '_', ' ')) as work_center_name,
    dp.process_route_id as route_id,
    pr.route_code,
    pr.route_name,
    dp.multiple,
    dp.reason,
    coalesce((select u.email from auth.users u where u.id = dp.approved_by), dp.approved_by::text, '') as approved_by,
    dp.diversion_date,
    dp.created_at,
    dp.updated_at,
    true as can_modify,
    coalesce(dp.status, 'APPROVED') as status,
    (select u.email from auth.users u where u.id = dp.ppc_approved_by) as ppc_approved_by,
    dp.ppc_approved_at,
    dp.ppc_rejection_reason,
    dp.ppc_remarks
  FROM public.diversion_plans dp
  JOIN public.work_orders sw on sw.id = dp.source_wo_id
  JOIN public.work_orders tw on tw.id = dp.target_wo_id
  LEFT JOIN public.process_routes pr on pr.id = dp.process_route_id
  LEFT JOIN public.process_stages ps on ps.stage_code = coalesce(dp.work_center, 'ROLLING')
  WHERE (p_route_code is null or pr.route_code = p_route_code)
    AND (p_work_center is null or coalesce(dp.work_center, 'ROLLING') = p_work_center)
    AND (p_from_date is null or dp.diversion_date >= p_from_date)
    AND (p_to_date is null or dp.diversion_date <= p_to_date)
    AND (p_status is null or coalesce(dp.status, 'APPROVED') = p_status)
    AND (
      nullif(trim(p_search), '') is null
      or dp.id::text ilike '%' || trim(p_search) || '%'
      or sw.work_order_no ilike '%' || trim(p_search) || '%'
      or tw.work_order_no ilike '%' || trim(p_search) || '%'
      or coalesce(sw.customer_name, '') ilike '%' || trim(p_search) || '%'
      or coalesce(tw.customer_name, '') ilike '%' || trim(p_search) || '%'
      or coalesce(dp.reason, '') ilike '%' || trim(p_search) || '%'
      or coalesce((select u.email from auth.users u where u.id = dp.approved_by), '') ilike '%' || trim(p_search) || '%'
    )
  ORDER BY dp.diversion_date desc, dp.created_at desc
  LIMIT greatest(coalesce(p_limit, 500), 1);
$$;

GRANT EXECUTE ON FUNCTION public.get_diversion_plans(text,text,text,date,date,integer,text) TO authenticated;
