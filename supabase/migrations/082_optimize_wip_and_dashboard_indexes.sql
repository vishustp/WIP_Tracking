-- Migration 082: Optimize WIP Calculation and Dashboard Query Indexes
-- Purpose: Accelerate vw_route_stage_wip and dashboard parallel data fetching
-- Non-unique B-tree indexes that do NOT alter constraints, data, or application logic.

-- 1. Index production_logs by work_order_id and stage_id for rapid aggregation
CREATE INDEX IF NOT EXISTS idx_prod_logs_wo_stage 
  ON public.production_logs (work_order_id, stage_id);

-- 2. Index production_logs by created_at for fast recent-activity retrieval
CREATE INDEX IF NOT EXISTS idx_prod_logs_created_at_desc 
  ON public.production_logs (created_at DESC);

-- 3. Composite indexes on diversion_plans for correlated subqueries in vw_route_stage_wip
CREATE INDEX IF NOT EXISTS idx_diversion_plans_target_wc 
  ON public.diversion_plans (target_wo_id, work_center);

CREATE INDEX IF NOT EXISTS idx_diversion_plans_source_wc 
  ON public.diversion_plans (source_wo_id, work_center);

-- 4. Index qc_inspections by work_order_id for O(1) campaign QC pooling
CREATE INDEX IF NOT EXISTS idx_qc_inspections_wo 
  ON public.qc_inspections (work_order_id);

-- 5. Index rolling_plans by work_order_id for fast plan context join
CREATE INDEX IF NOT EXISTS idx_rolling_plans_wo 
  ON public.rolling_plans (work_order_id);

-- 6. Index work_orders by status to accelerate active order filtering
CREATE INDEX IF NOT EXISTS idx_work_orders_status 
  ON public.work_orders (status);
