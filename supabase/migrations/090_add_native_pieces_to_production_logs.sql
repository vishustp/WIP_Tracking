-- Migration 090: Add Native Piece Columns to production_logs
-- Eliminates brittle regex scraping from remarks while preserving full backward compatibility.

ALTER TABLE public.production_logs 
  ADD COLUMN IF NOT EXISTS output_pcs integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rejection_pcs integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS htc_ok_pcs integer DEFAULT 0;

-- Backfill output_pcs from [PCS: ...] tags in remarks
UPDATE public.production_logs
SET output_pcs = CAST(substring(remarks FROM '\[PCS:\s*([0-9]+)') AS integer)
WHERE (output_pcs IS NULL OR output_pcs = 0)
  AND remarks ~ '\[PCS:\s*[0-9]+';

-- Backfill rejection_pcs from [REJ_PCS: ...] or [REJ: ...] tags in remarks
UPDATE public.production_logs
SET rejection_pcs = CAST(substring(remarks FROM '(?:\[REJ_PCS:|\[REJ:|[, ]REJ:)\s*([0-9]+)') AS integer)
WHERE (rejection_pcs IS NULL OR rejection_pcs = 0)
  AND remarks ~ '(?:\[REJ_PCS:|\[REJ:|[, ]REJ:)\s*[0-9]+';

-- Backfill htc_ok_pcs from [HTC_PCS: ...] tags in remarks
UPDATE public.production_logs
SET htc_ok_pcs = CAST(substring(remarks FROM '\[HTC_PCS:\s*([0-9]+)') AS integer)
WHERE (htc_ok_pcs IS NULL OR htc_ok_pcs = 0)
  AND remarks ~ '\[HTC_PCS:\s*[0-9]+';

-- Create index to accelerate work order stage piece rollups
CREATE INDEX IF NOT EXISTS idx_prod_logs_wo_stage_pcs 
  ON public.production_logs(work_order_id, stage_id, output_pcs);
