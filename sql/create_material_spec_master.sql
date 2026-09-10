-- ============================================================================
-- Material Specification Master Table
-- Run this in Supabase Dashboard → SQL Editor → New Query
-- ============================================================================

CREATE TABLE IF NOT EXISTS material_spec_master (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  spec_key text UNIQUE NOT NULL,
  spec_full text NOT NULL,
  steel_grade text,
  smys_mpa numeric,
  uts_mpa numeric,
  elongation_pct numeric,
  hardness text,
  straightness text DEFAULT '1:1000',
  color_spec text,
  rm_color text,
  whf_temp text,
  induction_temp text,
  sizing_outlet_temp text,
  ht_cycle text,
  ht_condition text,
  ndt text,
  holding_time_sec integer DEFAULT 5,
  coating text,
  end_condition text,
  bundling text DEFAULT 'HEXAGONAL',
  end_cap text DEFAULT 'PLASTIC PROTECTOR',
  is_min_wall boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE material_spec_master ENABLE ROW LEVEL SECURITY;

-- Allow read for all authenticated users
CREATE POLICY "spec_master_read" ON material_spec_master
  FOR SELECT TO authenticated USING (true);

-- Allow full access for authenticated (admin control in app layer)
CREATE POLICY "spec_master_write" ON material_spec_master
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Allow anonymous read for public pages
CREATE POLICY "spec_master_anon_read" ON material_spec_master
  FOR SELECT TO anon USING (true);

-- ============================================================================
-- Seed Data: 12 Standard Specifications
-- ============================================================================

INSERT INTO material_spec_master (spec_key, spec_full, steel_grade, smys_mpa, uts_mpa, elongation_pct, hardness, straightness, color_spec, rm_color, whf_temp, induction_temp, sizing_outlet_temp, ht_cycle, ht_condition, ndt, holding_time_sec, coating, end_condition, bundling, end_cap, is_min_wall)
VALUES
  ('A106', 'ASTM A106 Gr B (IBR)', 'SAE 1018 / 15C8 RS-03', 240, 415, 21, '79 HRB MAX', '1:1000', 'WHITE', 'YELLOW + WHITE', '1220° C (+/- 40° C)', '850 °C - 880° C', '880° C TO 900° C', 'NA', 'AS ROLLED / HFS', 'UT', 5, 'BLACK VARNISH', 'BEVEL END (30°-35°) ROOT FACE (0.8 - 2.4MM)', 'HEXAGONAL', 'PLASTIC PROTECTOR', false),

  ('A53', 'ASTM A53 Gr B (Type S)', 'IS 2062 / SAE 1020', 240, 415, 21, '82 HRB MAX', '1:1000', 'BLUE', 'BLUE + WHITE', '1200° C - 1240° C', '860 °C - 890° C', '880° C TO 920° C', 'NA', 'AS ROLLED', 'UT / ET', 5, 'BLACK VARNISH', 'BEVEL END (30°-35°)', 'HEXAGONAL', 'PLASTIC PROTECTOR', false),

  ('A312_304L', 'ASTM A312 TP304L', 'AISI 304L / UNS S30403', 170, 485, 35, '90 HRB MAX', '1:1000', 'YELLOW', 'YELLOW', '1180° C - 1220° C', '1040 °C - 1080° C', '1050° C', 'SOLUTION ANNEALING', '1040°C - 1100°C WATER QUENCH', 'ECT + UT', 5, 'PASSIVATED / PICKLED', 'PLAIN END / BEVEL END', 'HEXAGONAL', 'PLASTIC CAP', false),

  ('A312_316L', 'ASTM A312 TP316L', 'AISI 316L / UNS S31603', 170, 485, 30, '90 HRB MAX', '1:1000', 'GREEN', 'GREEN + WHITE', '1180° C - 1220° C', '1050 °C - 1100° C', '1050° C', 'SOLUTION ANNEALING', '1050°C - 1120°C RAPID WATER QUENCH', 'ECT + UT', 5, 'PASSIVATED / PICKLED', 'PLAIN END / BEVEL END', 'HEXAGONAL', 'PLASTIC CAP', false),

  ('A213_T11', 'ASTM A213 T11 (IBR)', '1.25Cr - 0.5Mo Alloy', 205, 415, 30, '85 HRB MAX', '1:1000', 'ORANGE', 'ORANGE + WHITE', '1200° C - 1250° C', '900 °C - 950° C', '900° C', 'ISOTHERMAL ANNEALING / N&T', 'NORMALIZE 900-940°C, TEMPER 650-700°C', 'UT + MT', 5, 'RUST PREVENTIVE OIL', 'BEVEL END (30°-35°)', 'HEXAGONAL', 'PLASTIC CAP', true),

  ('A335_P22', 'ASTM A335 P22 (IBR)', '2.25Cr - 1Mo Alloy', 205, 415, 30, '85 HRB MAX', '1:1000', 'RED + WHITE', 'RED + WHITE', '1220° C - 1260° C', '920 °C - 960° C', '920° C', 'NORMALIZED & TEMPERED', 'NORMALIZE 920-960°C, TEMPER 680-720°C', 'UT + MT', 5, 'BLACK VARNISH / RUST OIL', 'BEVEL END (30°-35°)', 'HEXAGONAL', 'PLASTIC CAP', true),

  ('A210', 'ASME SA210 Gr A-1 (IBR) / ASTM A210 Gr A-1', 'MEDIUM-CARBON STEEL (SA210 Gr.A1)', 255, 415, 30, '79 HRB MAX', '1:1000', 'WHITE + BLUE', 'YELLOW + BLUE', '1200° C - 1240° C', '860 °C - 890° C', '880° C TO 920° C', 'SUB-CRITICAL ANNEALED / NORMALIZED', 'SUB-CRITICAL ANNEAL (650°C - 700°C) / NORMALIZED', 'UT / ET', 5, 'BLACK VARNISH / RUST OIL', 'PLAIN END / SQUARE CUT', 'HEXAGONAL', 'PLASTIC PROTECTOR', true),

  ('A210_C', 'ASME SA210 Gr C (IBR) / ASTM A210 Gr C', 'MEDIUM-CARBON STEEL (SA210 Gr.C)', 275, 485, 30, '89 HRB MAX', '1:1000', 'WHITE + RED', 'YELLOW + RED', '1200° C - 1240° C', '860 °C - 890° C', '880° C TO 920° C', 'SUB-CRITICAL ANNEALED / NORMALIZED', 'SUB-CRITICAL ANNEAL (650°C - 700°C) / NORMALIZED', 'UT / ET', 5, 'BLACK VARNISH / RUST OIL', 'PLAIN END / SQUARE CUT', 'HEXAGONAL', 'PLASTIC PROTECTOR', true),

  ('BS3059_320', 'BS 3059 Part 1 Gr 320 (IBR)', 'CARBON STEEL (BS 3059 Gr.320)', 195, 320, 25, '75 HRB MAX', '1:1000', 'WHITE + YELLOW', 'YELLOW + WHITE', '1200° C - 1240° C', '860 °C - 890° C', '880° C TO 920° C', 'NORMALIZED / SUB-CRITICAL ANNEALED', 'NORMALIZED 880-920°C / SUB-CRITICAL ANNEAL 650-700°C', 'UT / ET', 5, 'BLACK VARNISH / RUST OIL', 'PLAIN END / SQUARE CUT', 'HEXAGONAL', 'PLASTIC PROTECTOR', true),

  ('BS3059_360', 'BS 3059 Part 2 Gr 360 (IBR)', 'CARBON STEEL (BS 3059 Gr.360)', 215, 360, 24, '77 HRB MAX', '1:1000', 'WHITE + BLUE', 'YELLOW + BLUE', '1200° C - 1240° C', '860 °C - 890° C', '880° C TO 920° C', 'NORMALIZED / SUB-CRITICAL ANNEALED', 'NORMALIZED 880-920°C / SUB-CRITICAL ANNEAL 650-700°C', 'UT / ET', 5, 'BLACK VARNISH / RUST OIL', 'PLAIN END / SQUARE CUT', 'HEXAGONAL', 'PLASTIC PROTECTOR', true),

  ('BS3059_440', 'BS 3059 Part 2 Gr 440 (IBR)', 'CARBON STEEL (BS 3059 Gr.440)', 255, 440, 21, '82 HRB MAX', '1:1000', 'WHITE + GREEN', 'YELLOW + GREEN', '1200° C - 1240° C', '860 °C - 890° C', '880° C TO 920° C', 'NORMALIZED / SUB-CRITICAL ANNEALED', 'NORMALIZED 880-920°C / SUB-CRITICAL ANNEAL 650-700°C', 'UT / ET', 5, 'BLACK VARNISH / RUST OIL', 'PLAIN END / SQUARE CUT', 'HEXAGONAL', 'PLASTIC PROTECTOR', true),

  ('BS3059_620', 'BS 3059 Part 2 Gr 620 / 622 (IBR)', 'ALLOY STEEL (BS 3059 Gr.620/622)', 310, 580, 18, '88 HRB MAX', '1:1000', 'WHITE + ORANGE', 'YELLOW + ORANGE', '1200° C - 1250° C', '900 °C - 950° C', '900° C', 'NORMALIZED & TEMPERED', 'NORMALIZE 930-970°C, TEMPER 650-720°C', 'UT + MT', 5, 'BLACK VARNISH / RUST OIL', 'PLAIN END / SQUARE CUT', 'HEXAGONAL', 'PLASTIC PROTECTOR', true)
ON CONFLICT (spec_key) DO NOTHING;
