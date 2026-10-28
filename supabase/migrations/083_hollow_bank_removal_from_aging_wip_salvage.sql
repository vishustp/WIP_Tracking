-- 083_hollow_bank_removal_from_aging_wip_salvage.sql
-- Ensure material sent to Hollow Bank is deducted from Stage WIP across vw_route_stage_wip,
-- production queues, aging reports, and salvage declaration lists.

CREATE OR REPLACE FUNCTION public.fn_hollow_bank_inbound_diversion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_route_id uuid;
  v_reason text;
BEGIN
  -- Resolve valid route_id from rolling plans or default active process route
  SELECT rp.process_route_id INTO v_route_id
  FROM public.rolling_plans rp
  WHERE rp.work_order_id = NEW.source_wo_id
  LIMIT 1;

  IF v_route_id IS NULL THEN
    SELECT pr.id INTO v_route_id
    FROM public.process_routes pr
    WHERE pr.active
    LIMIT 1;
  END IF;

  -- Calculate weight if not provided
  IF COALESCE(NEW.weight_mt, 0) = 0 AND NEW.od > 0 AND NEW.wt > 0 AND NEW.total_meters > 0 THEN
    NEW.weight_mt := round(((NEW.od - NEW.wt) * NEW.wt * 0.0246615 * 0.001 * NEW.total_meters)::numeric, 3);
  END IF;

  IF COALESCE(NEW.available_pcs, 0) = 0 THEN
    NEW.available_pcs := NEW.pcs;
  END IF;
  IF COALESCE(NEW.available_meters, 0) = 0 THEN
    NEW.available_meters := NEW.total_meters;
  END IF;
  IF COALESCE(NEW.available_mt, 0) = 0 THEN
    NEW.available_mt := NEW.weight_mt;
  END IF;

  -- Build explicit routing and piece tags so parser assigns correct stage and pieces
  v_reason := '[FROM_STAGE: ' || NEW.source_stage_code || '] [TO_STAGE: HOLLOW_BANK] [PCS: ' || NEW.pcs || '] Diverted to Hollow Bank: ' || NEW.lot_no;
  IF NEW.remarks IS NOT NULL AND TRIM(NEW.remarks) <> '' THEN
    v_reason := v_reason || ' (' || TRIM(NEW.remarks) || ')';
  END IF;

  -- Create diversion record transferring material from source_wo_id at source_stage_code into HB-BUFFER
  INSERT INTO public.diversion_plans (
    source_wo_id,
    target_wo_id,
    diverted_qty,
    process_route_id,
    work_center,
    multiple,
    reason,
    approved_by,
    diversion_date
  ) VALUES (
    NEW.source_wo_id,
    '00000000-0000-0000-0000-00000000000b',
    NEW.total_meters,
    v_route_id,
    NEW.source_stage_code,
    1,
    v_reason,
    NEW.banked_by,
    NEW.banked_date
  );

  RETURN NEW;
END;
$$;
