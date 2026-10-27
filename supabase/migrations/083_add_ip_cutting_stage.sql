-- 083_add_ip_cutting_stage.sql
-- Add IP_CUTTING (Intermediate Pipe Cutting) stage for pre-draw mother hollow sizing at Band Saw

INSERT INTO public.process_stages (stage_code, stage_name, active)
VALUES ('IP_CUTTING', 'IP Cutting (Band Saw)', true)
ON CONFLICT (stage_code) DO UPDATE
  SET stage_name = 'IP Cutting (Band Saw)', active = true;
