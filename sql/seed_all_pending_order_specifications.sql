-- ============================================================================
-- Seed All Specifications Available in Pending Orders
-- Covers 22 standard and high-performance seamless pipe & tube grades
-- ============================================================================

INSERT INTO public.material_spec_master (
  spec_key, spec_full, steel_grade, smys_mpa, uts_mpa, elongation_pct,
  hardness, straightness, color_spec, rm_color, whf_temp, induction_temp,
  sizing_outlet_temp, ht_cycle, ht_condition, ndt, holding_time_sec,
  coating, end_condition, bundling, end_cap, is_min_wall, is_active
) VALUES
  ('A106', 'ASTM A106 Gr B (IBR) / ASME SA106 Gr B', 'Carbon Steel (SAE 1018 / 15C8 RS-03)', 240, 415, 21, '79 HRB MAX', '1:1000', 'WHITE', 'YELLOW + WHITE', '1220° C (+/- 40° C)', '850 °C - 880° C', '880° C TO 900° C', 'NA / AS ROLLED', 'AS ROLLED / HFS (OR NORMALIZED / STRESS RELIEVED FOR CDS)', 'UT', 5, 'BLACK VARNISH', 'BEVEL END (30°-35°) ROOT FACE (0.8 - 2.4MM)', 'HEXAGONAL', 'PLASTIC PROTECTOR', false, true),
  ('SA106_C', 'ASME SA106 Gr C (IBR) / ASTM A106 Gr C', 'High-Strength Carbon Steel (SA106 Gr.C)', 275, 485, 20, '85 HRB MAX', '1:1000', 'WHITE + BROWN', 'YELLOW + BROWN', '1220° C (+/- 40° C)', '860 °C - 890° C', '880° C TO 920° C', 'NORMALIZED', 'NORMALIZE 900°C - 940°C AIR COOL', 'UT', 5, 'BLACK VARNISH', 'BEVEL END (30°-35°)', 'HEXAGONAL', 'PLASTIC PROTECTOR', false, true),
  ('A53', 'ASTM A53 Gr B (Type S)', 'IS 2062 / SAE 1020', 240, 415, 21, '82 HRB MAX', '1:1000', 'BLUE', 'BLUE + WHITE', '1200° C - 1240° C', '860 °C - 890° C', '880° C TO 920° C', 'NA', 'AS ROLLED', 'UT / ET', 5, 'BLACK VARNISH', 'BEVEL END (30°-35°)', 'HEXAGONAL', 'PLASTIC PROTECTOR', false, true),
  ('A210', 'ASME SA210 Gr A-1 (IBR) / ASTM A210 Gr A-1', 'Medium-Carbon Steel (SA210 Gr.A1)', 255, 415, 30, '79 HRB MAX', '1:1000', 'WHITE + BLUE', 'YELLOW + BLUE', '1200° C - 1240° C', '860 °C - 890° C', '880° C TO 920° C', 'SUB-CRITICAL ANNEALED / NORMALIZED', 'SUB-CRITICAL ANNEAL (650°C - 700°C) / NORMALIZED', 'UT / ET', 5, 'BLACK VARNISH / RUST OIL', 'PLAIN END / SQUARE CUT', 'HEXAGONAL', 'PLASTIC PROTECTOR', true, true),
  ('A210_C', 'ASME SA210 Gr C (IBR) / ASTM A210 Gr C', 'Medium-Carbon Steel (SA210 Gr.C)', 275, 485, 30, '89 HRB MAX', '1:1000', 'WHITE + RED', 'YELLOW + RED', '1200° C - 1240° C', '860 °C - 890° C', '880° C TO 920° C', 'SUB-CRITICAL ANNEALED / NORMALIZED', 'SUB-CRITICAL ANNEAL (650°C - 700°C) / NORMALIZED', 'UT / ET', 5, 'BLACK VARNISH / RUST OIL', 'PLAIN END / SQUARE CUT', 'HEXAGONAL', 'PLASTIC PROTECTOR', true, true),
  ('SA192', 'ASME SA 192 (IBR) / ASTM A192', 'Seamless Carbon Steel Boiler Tubes (SA192)', 180, 325, 35, '77 HRB MAX', '1:1000', 'YELLOW + BLUE', 'YELLOW + BLUE', '1200° C - 1240° C', '860 °C - 890° C', '880° C TO 920° C', 'SUB-CRITICAL ANNEALED / NORMALIZED', 'SUB-CRITICAL ANNEAL (650°C - 700°C) AFTER COLD FINISHING', 'UT / ET', 5, 'RUST PREVENTIVE OIL / CLEAR VARNISH', 'PLAIN END / SQUARE CUT', 'HEXAGONAL', 'PLASTIC PROTECTOR', true, true),
  ('SA179', 'ASME SA 179 (IBR) / ASTM A179', 'Seamless Cold-Drawn Low-Carbon Steel (SA179)', 180, 325, 35, '72 HRB MAX', '1:1000', 'WHITE + BLACK', 'YELLOW + BLACK', '1200° C - 1240° C', '860 °C - 890° C', '880° C TO 920° C', 'SUB-CRITICAL ANNEALED / NORMALIZED', 'HEAT TREATED AFTER FINAL COLD DRAW PASS AT 650°C MIN', 'UT / ET', 5, 'RUST PREVENTIVE OIL', 'PLAIN END / SQUARE CUT', 'HEXAGONAL', 'PLASTIC PROTECTOR', true, true),
  ('A213_T11', 'ASME SA213 Gr.T11 (IBR) / ASTM A213 T11', '1.25Cr - 0.5Mo Alloy Steel (SA213 Gr.T11)', 205, 415, 30, '85 HRB MAX', '1:1000', 'ORANGE', 'ORANGE + WHITE', '1200° C - 1250° C', '900 °C - 950° C', '900° C', 'ISOTHERMAL ANNEALED / NORMALIZED & TEMPERED', 'NORMALIZE 900-940°C, TEMPER 650-700°C', 'UT + MT', 5, 'RUST PREVENTIVE OIL', 'PLAIN END / BEVEL END (30°-35°)', 'HEXAGONAL', 'PLASTIC CAP', true, true),
  ('A213_T12', 'ASME SA213 GR.T12 (IBR) / ASTM A213 T12', '1Cr - 0.5Mo Alloy Steel (SA213 Gr.T12)', 220, 415, 30, '85 HRB MAX', '1:1000', 'ORANGE + GREEN', 'ORANGE + GREEN', '1200° C - 1250° C', '900 °C - 950° C', '900° C', 'NORMALIZED & TEMPERED', 'NORMALIZE 900-940°C, TEMPER 650-710°C', 'UT + MT', 5, 'RUST PREVENTIVE OIL', 'PLAIN END / BEVEL END (30°-35°)', 'HEXAGONAL', 'PLASTIC CAP', true, true),
  ('A213_T22', 'ASME SA213 GR.T22 (IBR) / ASTM A213 T22', '2.25Cr - 1Mo Alloy Steel (SA213 Gr.T22)', 205, 415, 30, '85 HRB MAX', '1:1000', 'RED + WHITE', 'RED + WHITE', '1220° C - 1260° C', '920 °C - 960° C', '920° C', 'NORMALIZED & TEMPERED', 'NORMALIZE 920-960°C, TEMPER 680-720°C', 'UT + MT', 5, 'BLACK VARNISH / RUST OIL', 'PLAIN END / BEVEL END (30°-35°)', 'HEXAGONAL', 'PLASTIC CAP', true, true),
  ('A335_P11', 'ASME A335 GR P11 (IBR) / ASME SA335 GR P11', '1.25Cr - 0.5Mo Alloy Steel (P11 Pipe)', 205, 415, 30, '85 HRB MAX', '1:1000', 'ORANGE', 'ORANGE + WHITE', '1200° C - 1250° C', '900 °C - 950° C', '900° C', 'NORMALIZED & TEMPERED', 'NORMALIZE 900-940°C, TEMPER 650-700°C', 'UT + MT', 5, 'BLACK VARNISH / RUST OIL', 'BEVEL END (30°-35°)', 'HEXAGONAL', 'PLASTIC CAP', false, true),
  ('A335_P22', 'ASME SA335 GR P22 (IBR) / ASME A335 GR P22', '2.25Cr - 1Mo Alloy Steel (P22 Pipe)', 205, 415, 30, '85 HRB MAX', '1:1000', 'RED + WHITE', 'RED + WHITE', '1220° C - 1260° C', '920 °C - 960° C', '920° C', 'NORMALIZED & TEMPERED', 'NORMALIZE 920-960°C, TEMPER 680-720°C', 'UT + MT', 5, 'BLACK VARNISH / RUST OIL', 'BEVEL END (30°-35°)', 'HEXAGONAL', 'PLASTIC CAP', false, true),
  ('BS3059_320', 'BS 3059-P1 GR320 (IBR)', 'Carbon Steel (BS 3059 Gr.320)', 195, 320, 25, '75 HRB MAX', '1:1000', 'WHITE + YELLOW', 'YELLOW + WHITE', '1200° C - 1240° C', '860 °C - 890° C', '880° C TO 920° C', 'NORMALIZED / SUB-CRITICAL ANNEALED', 'NORMALIZED 880-920°C / SUB-CRITICAL ANNEAL 650-700°C', 'UT / ET', 5, 'BLACK VARNISH / RUST OIL', 'PLAIN END / SQUARE CUT', 'HEXAGONAL', 'PLASTIC PROTECTOR', false, true),
  ('BS3059_360', 'BS 3059-P2 GR360 (IBR)', 'Carbon Steel (BS 3059 Gr.360)', 215, 360, 24, '77 HRB MAX', '1:1000', 'WHITE + BLUE', 'YELLOW + BLUE', '1200° C - 1240° C', '860 °C - 890° C', '880° C TO 920° C', 'NORMALIZED / SUB-CRITICAL ANNEALED', 'NORMALIZED 880-920°C / SUB-CRITICAL ANNEAL 650-700°C', 'UT / ET', 5, 'BLACK VARNISH / RUST OIL', 'PLAIN END / SQUARE CUT', 'HEXAGONAL', 'PLASTIC PROTECTOR', false, true),
  ('BS3059_440', 'BS 3059 Part 2 Gr 440 (IBR)', 'Carbon Steel (BS 3059 Gr.440)', 255, 440, 21, '82 HRB MAX', '1:1000', 'WHITE + GREEN', 'YELLOW + GREEN', '1200° C - 1240° C', '860 °C - 890° C', '880° C TO 920° C', 'NORMALIZED / SUB-CRITICAL ANNEALED', 'NORMALIZED 880-920°C / SUB-CRITICAL ANNEAL 650-700°C', 'UT / ET', 5, 'BLACK VARNISH / RUST OIL', 'PLAIN END / SQUARE CUT', 'HEXAGONAL', 'PLASTIC PROTECTOR', false, true),
  ('BS3059_620', 'BS 3059 Part 2 Gr 620 / 622 (IBR)', 'Alloy Steel (BS 3059 Gr.620/622)', 310, 580, 18, '88 HRB MAX', '1:1000', 'WHITE + ORANGE', 'YELLOW + ORANGE', '1200° C - 1250° C', '900 °C - 950° C', '900° C', 'NORMALIZED & TEMPERED', 'NORMALIZE 930-970°C, TEMPER 650-720°C', 'UT + MT', 5, 'BLACK VARNISH / RUST OIL', 'PLAIN END / SQUARE CUT', 'HEXAGONAL', 'PLASTIC PROTECTOR', false, true),
  ('ST35_8', 'DIN 17175 St 35.8 (IBR) / ST 35.8', 'Heat-Resistant Carbon Steel (St 35.8 III)', 235, 420, 25, '78 HRB MAX', '1:1000', 'WHITE + BROWN', 'YELLOW + BROWN', '1200° C - 1240° C', '860 °C - 890° C', '880° C TO 920° C', 'NORMALIZED', 'NORMALIZE 890°C - 930°C AIR COOL', 'UT / ET', 5, 'BLACK VARNISH / RUST OIL', 'PLAIN END / SQUARE CUT', 'HEXAGONAL', 'PLASTIC PROTECTOR', false, true),
  ('DIN2391_ST52', 'DIN 2391 ST 52 / EN 10305-1 E355', 'High-Yield Precision Carbon Steel (St 52 / E355)', 355, 520, 22, '85 HRB MAX', '1:1000', 'BLUE + WHITE', 'BLUE + WHITE', '1200° C - 1240° C', '880 °C - 920° C', '890° C TO 930° C', 'STRESS RELIEVED / NORMALIZED (+SR / +N)', 'STRESS RELIEF 550-600°C OR NORMALIZE 890-930°C', 'UT / ET', 5, 'LIGHT RUST PREVENTIVE OIL', 'PLAIN END / SQUARE CUT DEBURRED', 'HEXAGONAL', 'PLASTIC PROTECTOR', false, true),
  ('MS_900DP', 'MS 900DP Dual Phase High Strength Tubing', 'Dual Phase High-Strength Steel (DP 900)', 650, 900, 14, '95 HRB MAX', '1:1000', 'VIOLET', 'VIOLET + WHITE', '1200° C - 1250° C', '900 °C - 950° C', '920° C', 'CONTROLLED INTERCRITICAL ANNEAL + QUENCH', 'INTERCRITICAL DUAL-PHASE HEAT TREATMENT (780-820°C WATER QUENCH)', 'UT + FLUX LEAKAGE', 5, 'RUST PREVENTIVE OIL', 'PLAIN END / SQUARE CUT', 'HEXAGONAL', 'PLASTIC PROTECTOR', false, true),
  ('SAE_1010', 'SAE 1010 Mechanical Tubing (ASTM A519)', 'Low Carbon Mechanical Steel (SAE 1010)', 205, 365, 20, '70 HRB MAX', '1:1000', 'GREEN + WHITE', 'GREEN + WHITE', '1180° C - 1220° C', '850 °C - 880° C', '870° C TO 900° C', 'ANNEALED / STRESS RELIEVED (+A / +SR)', 'SUB-CRITICAL ANNEAL 620-680°C', 'UT / ET', 5, 'LIGHT RUST PREVENTIVE OIL', 'PLAIN END / SQUARE CUT', 'HEXAGONAL', 'PLASTIC PROTECTOR', false, true),
  ('A312_304L', 'ASTM A312 TP304L', 'AISI 304L / UNS S30403', 170, 485, 35, '90 HRB MAX', '1:1000', 'YELLOW', 'YELLOW', '1180° C - 1220° C', '1040 °C - 1080° C', '1050° C', 'SOLUTION ANNEALING', '1040°C - 1100°C WATER QUENCH', 'ECT + UT', 5, 'PASSIVATED / PICKLED', 'PLAIN END / BEVEL END', 'HEXAGONAL', 'PLASTIC CAP', false, true),
  ('A312_316L', 'ASTM A312 TP316L', 'AISI 316L / UNS S31603', 170, 485, 30, '90 HRB MAX', '1:1000', 'GREEN', 'GREEN + WHITE', '1180° C - 1220° C', '1050 °C - 1100° C', '1050° C', 'SOLUTION ANNEALING', '1050°C - 1120°C RAPID WATER QUENCH', 'ECT + UT', 5, 'PASSIVATED / PICKLED', 'PLAIN END / BEVEL END', 'HEXAGONAL', 'PLASTIC CAP', false, true)
ON CONFLICT (spec_key) DO UPDATE SET
  spec_full = EXCLUDED.spec_full,
  steel_grade = EXCLUDED.steel_grade,
  smys_mpa = EXCLUDED.smys_mpa,
  uts_mpa = EXCLUDED.uts_mpa,
  elongation_pct = EXCLUDED.elongation_pct,
  hardness = EXCLUDED.hardness,
  straightness = EXCLUDED.straightness,
  color_spec = EXCLUDED.color_spec,
  rm_color = EXCLUDED.rm_color,
  whf_temp = EXCLUDED.whf_temp,
  induction_temp = EXCLUDED.induction_temp,
  sizing_outlet_temp = EXCLUDED.sizing_outlet_temp,
  ht_cycle = EXCLUDED.ht_cycle,
  ht_condition = EXCLUDED.ht_condition,
  ndt = EXCLUDED.ndt,
  holding_time_sec = EXCLUDED.holding_time_sec,
  coating = EXCLUDED.coating,
  end_condition = EXCLUDED.end_condition,
  bundling = EXCLUDED.bundling,
  end_cap = EXCLUDED.end_cap,
  is_min_wall = EXCLUDED.is_min_wall,
  is_active = EXCLUDED.is_active,
  updated_at = now();
