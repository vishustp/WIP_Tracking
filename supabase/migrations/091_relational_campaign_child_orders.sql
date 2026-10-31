-- Migration 091: Relational Campaign Child Orders Normalization
-- Normalizes child work order allocations from rolling_plans.status JSON into a dedicated relational table.

CREATE TABLE IF NOT EXISTS public.rolling_campaign_children (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  master_plan_id uuid NOT NULL REFERENCES public.rolling_plans(id) ON DELETE CASCADE,
  master_work_order_id uuid NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  child_work_order_id uuid NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  planned_pcs integer NOT NULL DEFAULT 0,
  planned_mtr numeric(12,2) NOT NULL DEFAULT 0,
  planned_mt numeric(12,3) NOT NULL DEFAULT 0,
  alloc_tag text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT uq_campaign_master_child UNIQUE (master_plan_id, child_work_order_id)
);

CREATE INDEX IF NOT EXISTS idx_camp_child_master_plan ON public.rolling_campaign_children(master_plan_id);
CREATE INDEX IF NOT EXISTS idx_camp_child_master_wo ON public.rolling_campaign_children(master_work_order_id);
CREATE INDEX IF NOT EXISTS idx_camp_child_wo ON public.rolling_campaign_children(child_work_order_id);

-- Automated Backfill from existing rolling_plans.status JSON
DO $$
DECLARE
  rec RECORD;
  child JSONB;
  c_wo_id UUID;
  c_pcs INT;
  c_mtr NUMERIC(12,2);
  c_mt NUMERIC(12,3);
  c_tag TEXT;
BEGIN
  FOR rec IN 
    SELECT id, work_order_id, status::jsonb AS st 
    FROM public.rolling_plans 
    WHERE status IS NOT NULL 
      AND status::text ~ '"is_master"\s*:\s*true'
      AND status::text ~ '"child_work_orders"'
  LOOP
    IF jsonb_typeof(rec.st->'child_work_orders') = 'array' THEN
      FOR child IN SELECT * FROM jsonb_array_elements(rec.st->'child_work_orders')
      LOOP
        BEGIN
          c_wo_id := COALESCE(
            NULLIF(child->>'work_order_id', '')::uuid,
            NULLIF(child->>'id', '')::uuid
          );
          IF c_wo_id IS NOT NULL AND rec.work_order_id IS NOT NULL THEN
            c_pcs := COALESCE(NULLIF(child->>'planned_pcs', '')::integer, NULLIF(child->>'total_order_pcs', '')::integer, 0);
            c_mtr := COALESCE(NULLIF(child->>'planned_mtr', '')::numeric, NULLIF(child->>'total_order_mtr', '')::numeric, 0);
            c_mt := COALESCE(NULLIF(child->>'planned_mt', '')::numeric, NULLIF(child->>'total_order_mt', '')::numeric, 0);
            c_tag := child->>'alloc_tag';

            INSERT INTO public.rolling_campaign_children (
              master_plan_id,
              master_work_order_id,
              child_work_order_id,
              planned_pcs,
              planned_mtr,
              planned_mt,
              alloc_tag,
              metadata
            ) VALUES (
              rec.id,
              rec.work_order_id,
              c_wo_id,
              c_pcs,
              c_mtr,
              c_mt,
              c_tag,
              child
            )
            ON CONFLICT (master_plan_id, child_work_order_id) DO UPDATE SET
              planned_pcs = EXCLUDED.planned_pcs,
              planned_mtr = EXCLUDED.planned_mtr,
              planned_mt = EXCLUDED.planned_mt,
              alloc_tag = EXCLUDED.alloc_tag,
              metadata = EXCLUDED.metadata,
              updated_at = now();
          END IF;
        EXCEPTION WHEN OTHERS THEN
          -- Ignore any individual corrupted child record and proceed
          NULL;
        END;
      END LOOP;
    END IF;
  END LOOP;
END $$;
