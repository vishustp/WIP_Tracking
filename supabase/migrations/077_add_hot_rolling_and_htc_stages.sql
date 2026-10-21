-- 077_add_hot_rolling_and_htc_stages.sql
-- Add Hot Rolling Mill (HOT_ROLLING) and Hot Test Check (HTC) to process_stages and wire into route_stages

insert into public.process_stages (stage_code, stage_name, active)
values 
  ('HOT_ROLLING', 'Hot Rolling Mill', true),
  ('HTC', 'HTC', true)
on conflict (stage_code) do update set
  stage_name = excluded.stage_name,
  active = true;

do $$
declare
  s_hot_rolling uuid;
  s_htc uuid;
  r record;
begin
  select id into s_hot_rolling from public.process_stages where stage_code = 'HOT_ROLLING' limit 1;
  select id into s_htc from public.process_stages where stage_code = 'HTC' limit 1;

  for r in select id from public.process_routes loop
    if not exists (select 1 from public.route_stages where route_id = r.id and stage_id = s_hot_rolling) then
      insert into public.route_stages (route_id, stage_id, sequence_no, is_required)
      values (r.id, s_hot_rolling, 0, true);
    end if;

    if not exists (select 1 from public.route_stages where route_id = r.id and stage_id = s_htc) then
      insert into public.route_stages (route_id, stage_id, sequence_no, is_required)
      values (r.id, s_htc, 1, true);
    end if;
  end loop;
end $$;
