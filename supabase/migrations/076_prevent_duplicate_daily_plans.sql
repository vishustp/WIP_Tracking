-- 076_prevent_duplicate_daily_plans.sql
-- Enforce that a work order cannot be planned multiple times for the same work center on the same plan date.

-- Step 1: Deduplicate any existing duplicates if present (keep row with greatest target_pcs / latest updated_at)
delete from public.daily_production_plans a
using public.daily_production_plans b
where a.id != b.id
  and a.plan_date = b.plan_date
  and a.work_center = b.work_center
  and a.work_order_id = b.work_order_id
  and (
    a.target_pcs < b.target_pcs
    or (a.target_pcs = b.target_pcs and a.updated_at < b.updated_at)
    or (a.target_pcs = b.target_pcs and a.updated_at = b.updated_at and a.id < b.id)
  );

-- Step 2: Create unique index to guarantee no duplicate daily plans for same WO, station, and date
create unique index if not exists uq_daily_plans_date_wc_wo 
  on public.daily_production_plans(plan_date, work_center, work_order_id);
