-- 050_add_band_saw_stage_and_routing.sql
-- Add Band Saw (BAND_SAW) Work Center before VDI across all routes (HFS, ALLOY_HFS, CDS, ALLOY_CDS)

-- 1. Ensure BAND_SAW exists in public.process_stages
insert into public.process_stages (stage_code, stage_name, active)
values ('BAND_SAW', 'Band Saw Cutting', true)
on conflict (stage_code) do update set
  stage_name = 'Band Saw Cutting',
  active = true;

-- 2. Update route_stages sequences to place BAND_SAW immediately before VDI
-- HFS:       ROLLING (1) -> BAND_SAW (2) -> VDI (3) -> FINISHING (4)
-- ALLOY_HFS: ROLLING (1) -> HOLLOW_HEAT_TREATMENT (2) -> BAND_SAW (3) -> VDI (4) -> FINISHING (5)
-- CDS:       ROLLING (1) -> DRAW (2) -> HEAT_TREATMENT (3) -> BAND_SAW (4) -> VDI (5) -> FINISHING (6)
-- ALLOY_CDS: ROLLING (1) -> HOLLOW_HEAT_TREATMENT (2) -> DRAW (3) -> HEAT_TREATMENT (4) -> BAND_SAW (5) -> VDI (6) -> FINISHING (7)

do $$
declare
  r_hfs uuid;
  r_alloy_hfs uuid;
  r_cds uuid;
  r_alloy_cds uuid;

  s_roll uuid;
  s_hht uuid;
  s_draw uuid;
  s_ht uuid;
  s_band_saw uuid;
  s_vdi uuid;
  s_fin uuid;
begin
  select id into r_hfs from public.process_routes where route_code = 'HFS' limit 1;
  select id into r_alloy_hfs from public.process_routes where route_code = 'ALLOY_HFS' limit 1;
  select id into r_cds from public.process_routes where route_code = 'CDS' limit 1;
  select id into r_alloy_cds from public.process_routes where route_code = 'ALLOY_CDS' limit 1;

  select id into s_roll from public.process_stages where stage_code = 'ROLLING' limit 1;
  select id into s_hht from public.process_stages where stage_code = 'HOLLOW_HEAT_TREATMENT' limit 1;
  select id into s_draw from public.process_stages where stage_code = 'DRAW' limit 1;
  select id into s_ht from public.process_stages where stage_code = 'HEAT_TREATMENT' limit 1;
  select id into s_band_saw from public.process_stages where stage_code = 'BAND_SAW' limit 1;
  select id into s_vdi from public.process_stages where stage_code = 'VDI' limit 1;
  select id into s_fin from public.process_stages where stage_code = 'FINISHING' limit 1;

  if r_hfs is not null then
    delete from public.route_stages where route_id = r_hfs;
    insert into public.route_stages (route_id, stage_id, sequence_no, is_required) values
      (r_hfs, s_roll, 1, true),
      (r_hfs, s_band_saw, 2, true),
      (r_hfs, s_vdi, 3, true),
      (r_hfs, s_fin, 4, true);
  end if;

  if r_alloy_hfs is not null then
    delete from public.route_stages where route_id = r_alloy_hfs;
    insert into public.route_stages (route_id, stage_id, sequence_no, is_required) values
      (r_alloy_hfs, s_roll, 1, true),
      (r_alloy_hfs, s_hht, 2, true),
      (r_alloy_hfs, s_band_saw, 3, true),
      (r_alloy_hfs, s_vdi, 4, true),
      (r_alloy_hfs, s_fin, 5, true);
  end if;

  if r_cds is not null then
    delete from public.route_stages where route_id = r_cds;
    insert into public.route_stages (route_id, stage_id, sequence_no, is_required) values
      (r_cds, s_roll, 1, true),
      (r_cds, s_draw, 2, true),
      (r_cds, s_ht, 3, true),
      (r_cds, s_band_saw, 4, true),
      (r_cds, s_vdi, 5, true),
      (r_cds, s_fin, 6, true);
  end if;

  if r_alloy_cds is not null then
    delete from public.route_stages where route_id = r_alloy_cds;
    insert into public.route_stages (route_id, stage_id, sequence_no, is_required) values
      (r_alloy_cds, s_roll, 1, true),
      (r_alloy_cds, s_hht, 2, true),
      (r_alloy_cds, s_draw, 3, true),
      (r_alloy_cds, s_ht, 4, true),
      (r_alloy_cds, s_band_saw, 5, true),
      (r_alloy_cds, s_vdi, 6, true),
      (r_alloy_cds, s_fin, 7, true);
  end if;
end $$;
