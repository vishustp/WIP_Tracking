-- Migration 087: PPC Stock Generation Ledger Table & Functions
CREATE TABLE IF NOT EXISTS public.ppc_stock_generations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    generation_no TEXT UNIQUE NOT NULL,
    work_order_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE RESTRICT,
    stage_id UUID NOT NULL REFERENCES public.process_stages(id) ON DELETE RESTRICT,
    stage_code TEXT NOT NULL,
    stock_type TEXT NOT NULL CHECK (stock_type IN ('INCOMING_QUEUE', 'STAGE_OUTPUT')),
    pcs INTEGER NOT NULL CHECK (pcs > 0),
    meters NUMERIC(10, 2) NOT NULL CHECK (meters > 0),
    weight_mt NUMERIC(10, 3) NOT NULL CHECK (weight_mt >= 0),
    reason TEXT NOT NULL,
    heat_no TEXT,
    lot_no TEXT,
    remarks TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CANCELLED')),
    created_by UUID REFERENCES auth.users(id),
    created_by_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    cancelled_by UUID REFERENCES auth.users(id),
    cancelled_at TIMESTAMPTZ,
    cancellation_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_ppc_stk_gen_wo_stage ON public.ppc_stock_generations(work_order_id, stage_id, status);
CREATE INDEX IF NOT EXISTS idx_ppc_stk_gen_status ON public.ppc_stock_generations(status);
CREATE INDEX IF NOT EXISTS idx_ppc_stk_gen_created_at ON public.ppc_stock_generations(created_at DESC);

-- Enable RLS
ALTER TABLE public.ppc_stock_generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read ppc_stock_generations"
ON public.ppc_stock_generations
FOR SELECT
TO authenticated, anon
USING (true);

CREATE POLICY "Allow authenticated insert ppc_stock_generations"
ON public.ppc_stock_generations
FOR INSERT
TO authenticated, anon
WITH CHECK (true);

CREATE POLICY "Allow authenticated update ppc_stock_generations"
ON public.ppc_stock_generations
FOR UPDATE
TO authenticated, anon
USING (true)
WITH CHECK (true);

-- Sequence trigger for continuous STK-GEN-YYYYMM-XXXX generation numbers
CREATE OR REPLACE FUNCTION fn_generate_stock_generation_no()
RETURNS TRIGGER AS $$
DECLARE
    v_prefix TEXT;
    v_seq INT;
BEGIN
    v_prefix := 'STK-GEN-' || to_char(NOW(), 'YYYYMM') || '-';
    SELECT COALESCE(MAX(SUBSTRING(generation_no FROM LENGTH(v_prefix) + 1)::INT), 0) + 1
    INTO v_seq
    FROM public.ppc_stock_generations
    WHERE generation_no LIKE v_prefix || '%';

    NEW.generation_no := v_prefix || LPAD(v_seq::TEXT, 4, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_stock_generation_no ON public.ppc_stock_generations;
CREATE TRIGGER trg_set_stock_generation_no
BEFORE INSERT ON public.ppc_stock_generations
FOR EACH ROW
WHEN (NEW.generation_no IS NULL OR NEW.generation_no = '')
EXECUTE FUNCTION fn_generate_stock_generation_no();
