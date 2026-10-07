-- 063_add_ss_steel_route_and_pilger_stage.sql
-- Add Stainless Steel (SS_STEEL) Process Route and Cold Pilger Mill (PILGER) Work Center

-- 1. Ensure PILGER stage exists in public.process_stages
insert into public.process_stages (stage_code, stage_name, active)
values ('PILGER', 'Cold Pilger Mill', true)
on conflict (stage_code) do update set
  stage_name = 'Cold Pilger Mill',
  active = true;

-- 2. Ensure SS_STEEL route exists in public.process_routes
insert into public.process_routes (route_code, route_name, material_category, active)
values ('SS_STEEL', 'Stainless Steel', 'Stainless Steel', true)
on conflict (route_code) do update set
  route_name = 'Stainless Steel',
  material_category = 'Stainless Steel',
  active = true;

-- 3. Wire route_stages for SS_STEEL:
-- Sequence 1: ROLLING
-- Sequence 2: PILGER
-- Sequence 3: HEAT_TREATMENT
-- Sequence 4: BAND_SAW
-- Sequence 5: VDI
-- Sequence 6: FINISHING

do $$
declare
  r_ss_steel uuid;
  s_roll uuid;
  s_pilger uuid;
  s_ht uuid;
  s_band_saw uuid;
  s_vdi uuid;
  s_fin uuid;
begin
  select id into r_ss_steel from public.process_routes where route_code = 'SS_STEEL' limit 1;

  select id into s_roll from public.process_stages where stage_code = 'ROLLING' limit 1;
  select id into s_pilger from public.process_stages where stage_code = 'PILGER' limit 1;
  select id into s_ht from public.process_stages where stage_code = 'HEAT_TREATMENT' limit 1;
  select id into s_band_saw from public.process_stages where stage_code = 'BAND_SAW' limit 1;
  select id into s_vdi from public.process_stages where stage_code = 'VDI' limit 1;
  select id into s_fin from public.process_stages where stage_code = 'FINISHING' limit 1;

  if r_ss_steel is not null then
    delete from public.route_stages where route_id = r_ss_steel;
    insert into public.route_stages (route_id, stage_id, sequence_no, is_required) values
      (r_ss_steel, s_roll, 1, true),
      (r_ss_steel, s_pilger, 2, true),
      (r_ss_steel, s_ht, 3, true),
      (r_ss_steel, s_band_saw, 4, true),
      (r_ss_steel, s_vdi, 5, true),
      (r_ss_steel, s_fin, 6, true);
  end if;
end $$;
