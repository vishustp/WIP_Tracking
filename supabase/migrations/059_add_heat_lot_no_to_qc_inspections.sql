-- Migration 059: Add heat_lot_no column to qc_inspections
-- Enables individual lot tracking in VDI inspection records

ALTER TABLE public.qc_inspections 
ADD COLUMN IF NOT EXISTS heat_lot_no text;

CREATE INDEX IF NOT EXISTS idx_qc_inspections_heat_lot_no 
ON public.qc_inspections(heat_lot_no);
