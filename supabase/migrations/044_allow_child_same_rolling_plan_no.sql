-- Migration 044: Allow child work orders to share the exact same rolling plan number as their parent work order.
-- Drops the unique constraint on rolling_plans.plan_no so multi-WO campaigns (parent + children)
-- can share the identical rolling plan number across all campaign members.

ALTER TABLE public.rolling_plans DROP CONSTRAINT IF EXISTS rolling_plans_plan_no_key;
DROP INDEX IF EXISTS rolling_plans_plan_no_key;
CREATE INDEX IF NOT EXISTS rolling_plans_plan_no_idx ON public.rolling_plans(plan_no);

-- Synchronize existing child rolling plans to have the exact same plan_no as their parent work order
UPDATE public.rolling_plans rp
SET plan_no = rp.status::jsonb->>'master_plan_no'
WHERE (rp.status::jsonb->>'is_child')::boolean = true
  AND rp.status::jsonb->>'master_plan_no' IS NOT NULL
  AND rp.status::jsonb->>'master_plan_no' <> '';
