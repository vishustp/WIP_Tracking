-- 077_add_hot_rolling_and_htc_stages.sql
-- Add Hot Rolling Mill (HOT_ROLLING) and Hot Test Check (HTC) to process_stages

insert into public.process_stages (stage_code, stage_name, active)
values 
  ('HOT_ROLLING', 'Hot Rolling Mill', true),
  ('HTC', 'Hot Test Check', true)
on conflict (stage_code) do update set
  stage_name = excluded.stage_name,
  active = true;
