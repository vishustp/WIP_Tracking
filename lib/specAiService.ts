// lib/specAiService.ts
/**
 * Metallurgical Standards Knowledge Base & AI Specification Fetcher
 * Covers international standards: ASTM, ASME, API, BS, EN, DIN, IS
 * Provides mechanical properties, tolerances, Barlow hydro formulas, thermal parameters, and NDT requirements.
 */

export interface FetchedSpecData {
  spec_key: string;
  spec_full: string;
  steel_grade: string;
  smys_mpa: number;
  uts_mpa: number;
  elongation_pct: number;
  hardness: string;
  straightness: string;
  color_spec: string;
  rm_color: string;
  whf_temp: string;
  induction_temp: string;
  sizing_outlet_temp: string;
  ht_cycle: string;
  ht_condition: string;
  ndt: string;
  holding_time_sec: number;
  coating: string;
  end_condition: string;
  bundling: string;
  end_cap: string;
  is_min_wall: boolean;
  od_tolerance: string;
  wt_tolerance: string;
  hydro_pressure: string;
  source: 'STANDARDS_KNOWLEDGE_BASE' | 'AI_GENERATED';
}

export const METALLURGICAL_STANDARDS_DB: Record<string, Omit<FetchedSpecData, 'source'>> = {
  // ASTM A106 (Carbon Steel High Temp)
  A106_B: {
    spec_key: 'A106_B',
    spec_full: 'ASTM A106 Gr B (IBR)',
    steel_grade: 'SAE 1018 / 15C8 RS-03 Carbon Steel',
    smys_mpa: 240,
    uts_mpa: 415,
    elongation_pct: 21,
    hardness: '79 HRB MAX',
    straightness: '1:1000 (1 mm / m)',
    color_spec: 'WHITE',
    rm_color: 'YELLOW + WHITE',
    whf_temp: '1220° C (+/- 40° C)',
    induction_temp: '850° C - 880° C',
    sizing_outlet_temp: '880° C - 900° C',
    ht_cycle: 'NA / AS ROLLED',
    ht_condition: 'AS ROLLED / HFS (NORMALIZED IF COLD DRAWN)',
    ndt: 'UT (100% ULTRASONIC)',
    holding_time_sec: 5,
    coating: 'BLACK VARNISH / RUST PREVENTIVE',
    end_condition: 'BEVEL END (30°-35°) ROOT FACE (0.8 - 2.4MM)',
    bundling: 'HEXAGONAL',
    end_cap: 'PLASTIC PROTECTOR',
    is_min_wall: false,
    od_tolerance: '±0.75% (NPS 1/8 to 1-1/2: ±0.40 mm; NPS 2 to 4: +1.6/-0.8 mm)',
    wt_tolerance: '+15.0% / -12.5% of Nominal Wall',
    hydro_pressure: 'P = 2*S*t/D (S = 60% SMYS, max 17.2 MPa / 2500 psi)',
  },
  A106_C: {
    spec_key: 'A106_C',
    spec_full: 'ASTM A106 Gr C (IBR)',
    steel_grade: 'HIGH-STRENGTH CARBON STEEL (A106 Gr.C)',
    smys_mpa: 275,
    uts_mpa: 485,
    elongation_pct: 18,
    hardness: '85 HRB MAX',
    straightness: '1:1000',
    color_spec: 'WHITE + RED',
    rm_color: 'YELLOW + RED',
    whf_temp: '1220° C (+/- 40° C)',
    induction_temp: '860° C - 890° C',
    sizing_outlet_temp: '880° C - 900° C',
    ht_cycle: 'NA / AS ROLLED',
    ht_condition: 'AS ROLLED / NORMALIZED IF SPECIFIED',
    ndt: 'UT / ET',
    holding_time_sec: 5,
    coating: 'BLACK VARNISH',
    end_condition: 'BEVEL END (30°-35°)',
    bundling: 'HEXAGONAL',
    end_cap: 'PLASTIC PROTECTOR',
    is_min_wall: false,
    od_tolerance: '±0.75% (min ±0.40 mm)',
    wt_tolerance: '+15.0% / -12.5% of Nominal Wall',
    hydro_pressure: 'P = 2*S*t/D (S = 60% SMYS, max 19.3 MPa / 2800 psi)',
  },

  // ASTM A53 (General Purpose Carbon Pipe)
  A53_B: {
    spec_key: 'A53_B',
    spec_full: 'ASTM A53 Gr B (Type S)',
    steel_grade: 'IS 2062 / SAE 1020 Carbon Steel',
    smys_mpa: 240,
    uts_mpa: 415,
    elongation_pct: 21,
    hardness: '82 HRB MAX',
    straightness: '1:1000',
    color_spec: 'BLUE',
    rm_color: 'BLUE + WHITE',
    whf_temp: '1200° C - 1240° C',
    induction_temp: '860° C - 890° C',
    sizing_outlet_temp: '880° C - 920° C',
    ht_cycle: 'NA',
    ht_condition: 'AS ROLLED',
    ndt: 'UT / ET',
    holding_time_sec: 5,
    coating: 'BLACK VARNISH',
    end_condition: 'BEVEL END (30°-35°)',
    bundling: 'HEXAGONAL',
    end_cap: 'PLASTIC PROTECTOR',
    is_min_wall: false,
    od_tolerance: '±1.0% (NPS 1-1/2 and smaller: ±0.40 mm)',
    wt_tolerance: '-12.5% of Nominal Wall (no max cap)',
    hydro_pressure: 'P = 2*S*t/D (S = 60% SMYS, max 17.2 MPa / 2500 psi)',
  },

  // ASTM A335 Alloy Pipes (High Temperature)
  A335_P11: {
    spec_key: 'A335_P11',
    spec_full: 'ASTM A335 P11 (IBR)',
    steel_grade: '1.25Cr - 0.5Mo Alloy Steel',
    smys_mpa: 205,
    uts_mpa: 415,
    elongation_pct: 30,
    hardness: '85 HRB MAX (163 HBW)',
    straightness: '1:1000',
    color_spec: 'ORANGE',
    rm_color: 'ORANGE + WHITE',
    whf_temp: '1200° C - 1250° C',
    induction_temp: '900° C - 950° C',
    sizing_outlet_temp: '900° C',
    ht_cycle: 'NORMALIZED & TEMPERED / ISOTHERMAL ANNEAL',
    ht_condition: 'NORMALIZE 900-940°C AIR COOL, TEMPER 650-700°C',
    ndt: 'UT + MT (100% ULTRASONIC + MAG PARTICLE)',
    holding_time_sec: 5,
    coating: 'RUST PREVENTIVE OIL / CLEAR LACQUER',
    end_condition: 'BEVEL END (30°-35°)',
    bundling: 'HEXAGONAL',
    end_cap: 'PLASTIC PROTECTOR',
    is_min_wall: false,
    od_tolerance: '±0.75% (min ±0.40 mm)',
    wt_tolerance: '+15.0% / -12.5% of Nominal Wall',
    hydro_pressure: 'P = 2*S*t/D (S = 60% SMYS, max 17.2 MPa)',
  },
  A335_P22: {
    spec_key: 'A335_P22',
    spec_full: 'ASTM A335 P22 (IBR)',
    steel_grade: '2.25Cr - 1Mo Alloy Steel',
    smys_mpa: 205,
    uts_mpa: 415,
    elongation_pct: 30,
    hardness: '85 HRB MAX (163 HBW)',
    straightness: '1:1000',
    color_spec: 'RED + WHITE',
    rm_color: 'RED + WHITE',
    whf_temp: '1220° C - 1260° C',
    induction_temp: '920° C - 960° C',
    sizing_outlet_temp: '920° C',
    ht_cycle: 'NORMALIZED & TEMPERED / FULL ANNEAL',
    ht_condition: 'NORMALIZE 920-960°C AIR COOL, TEMPER 680-720°C',
    ndt: 'UT + MT',
    holding_time_sec: 5,
    coating: 'BLACK VARNISH / RUST OIL',
    end_condition: 'BEVEL END (30°-35°)',
    bundling: 'HEXAGONAL',
    end_cap: 'PLASTIC PROTECTOR',
    is_min_wall: false,
    od_tolerance: '±0.75% (min ±0.40 mm)',
    wt_tolerance: '+15.0% / -12.5% of Nominal Wall',
    hydro_pressure: 'P = 2*S*t/D (S = 60% SMYS, max 17.2 MPa / 2500 psi)',
  },
  A335_P91: {
    spec_key: 'A335_P91',
    spec_full: 'ASTM A335 P91 (Type 1 / Type 2 IBR)',
    steel_grade: '9Cr - 1Mo - V Modified Creep Resistant Alloy',
    smys_mpa: 415,
    uts_mpa: 585,
    elongation_pct: 20,
    hardness: '250 HBW MAX (98 HRB / 265 HV)',
    straightness: '1:1000',
    color_spec: 'RED + YELLOW',
    rm_color: 'RED + YELLOW',
    whf_temp: '1220° C - 1260° C',
    induction_temp: '1040° C - 1080° C',
    sizing_outlet_temp: '1000° C',
    ht_cycle: 'NORMALIZED & TEMPERED',
    ht_condition: 'NORMALIZE 1040-1080°C AIR COOL, TEMPER 730-780°C AIR COOL (MIN 1 HOUR)',
    ndt: '100% UT + 100% MT + POSITIVE MATERIAL IDENTIFICATION (PMI)',
    holding_time_sec: 10,
    coating: 'RUST PREVENTIVE OIL',
    end_condition: 'BEVEL END (30°-35° ROOT FACE 1.6MM)',
    bundling: 'WOODEN BOX / STEEL BANDS',
    end_cap: 'BEVEL PROTECTOR / METALLIC CAP',
    is_min_wall: false,
    od_tolerance: '±0.75% (min ±0.40 mm)',
    wt_tolerance: '+15.0% / -12.5% of Nominal Wall',
    hydro_pressure: 'P = 2*S*t/D (S = 60% SMYS, max 20.0 MPa)',
  },

  // ASTM A213 Alloy Boiler Tubes (Min Wall)
  A213_T11: {
    spec_key: 'A213_T11',
    spec_full: 'ASTM A213 T11 (IBR)',
    steel_grade: '1.25Cr - 0.5Mo Alloy Boiler Steel',
    smys_mpa: 205,
    uts_mpa: 415,
    elongation_pct: 30,
    hardness: '85 HRB MAX',
    straightness: '1:1000',
    color_spec: 'ORANGE',
    rm_color: 'ORANGE + WHITE',
    whf_temp: '1200° C - 1250° C',
    induction_temp: '900° C - 950° C',
    sizing_outlet_temp: '900° C',
    ht_cycle: 'ISOTHERMAL ANNEALING / N&T',
    ht_condition: 'NORMALIZE 900-940°C, TEMPER 650-700°C',
    ndt: 'UT + ET',
    holding_time_sec: 5,
    coating: 'RUST PREVENTIVE OIL',
    end_condition: 'PLAIN END / SQUARE CUT',
    bundling: 'HEXAGONAL',
    end_cap: 'PLASTIC CAP',
    is_min_wall: true,
    od_tolerance: 'Cold Drawn: ±0.10 mm to ±0.20 mm',
    wt_tolerance: '+28.0% / -0.0% of Minimum Wall (Cold Finished)',
    hydro_pressure: 'P = 2*S*t/D (S = 80% SMYS, max 16.0 MPa / 2300 psi)',
  },
  A213_T22: {
    spec_key: 'A213_T22',
    spec_full: 'ASTM A213 T22 (IBR)',
    steel_grade: '2.25Cr - 1Mo Alloy Boiler Steel',
    smys_mpa: 205,
    uts_mpa: 415,
    elongation_pct: 30,
    hardness: '85 HRB MAX',
    straightness: '1:1000',
    color_spec: 'RED + WHITE',
    rm_color: 'RED + WHITE',
    whf_temp: '1220° C - 1260° C',
    induction_temp: '920° C - 960° C',
    sizing_outlet_temp: '920° C',
    ht_cycle: 'NORMALIZED & TEMPERED / FULL ANNEAL',
    ht_condition: 'NORMALIZE 920-960°C, TEMPER 680-720°C',
    ndt: 'UT + ET',
    holding_time_sec: 5,
    coating: 'RUST PREVENTIVE OIL',
    end_condition: 'PLAIN END / SQUARE CUT',
    bundling: 'HEXAGONAL',
    end_cap: 'PLASTIC CAP',
    is_min_wall: true,
    od_tolerance: 'Cold Drawn: ±0.10 mm to ±0.20 mm',
    wt_tolerance: '+28.0% / -0.0% of Minimum Wall (Cold Finished)',
    hydro_pressure: 'P = 2*S*t/D (S = 80% SMYS, max 16.0 MPa)',
  },

  // ASME SA210 Carbon Boiler Tubes (Min Wall)
  SA210_A1: {
    spec_key: 'SA210_A1',
    spec_full: 'ASME SA210 Gr A-1 (IBR) / ASTM A210 Gr A-1',
    steel_grade: 'MEDIUM-CARBON STEEL (SA210 Gr.A1)',
    smys_mpa: 255,
    uts_mpa: 415,
    elongation_pct: 30,
    hardness: '79 HRB MAX (143 HBW)',
    straightness: '1:1000',
    color_spec: 'WHITE + BLUE',
    rm_color: 'YELLOW + BLUE',
    whf_temp: '1200° C - 1240° C',
    induction_temp: '860° C - 890° C',
    sizing_outlet_temp: '880° C - 920° C',
    ht_cycle: 'SUB-CRITICAL ANNEALED / NORMALIZED',
    ht_condition: 'SUB-CRITICAL ANNEAL (650°C - 700°C) / NORMALIZED 880-920°C',
    ndt: 'UT / ET',
    holding_time_sec: 5,
    coating: 'BLACK VARNISH / RUST OIL',
    end_condition: 'PLAIN END / SQUARE CUT',
    bundling: 'HEXAGONAL',
    end_cap: 'PLASTIC PROTECTOR',
    is_min_wall: true,
    od_tolerance: 'Cold Drawn: ±0.10 mm (OD < 25.4), ±0.15 mm (OD 25.4-38.1), ±0.20 mm (OD > 38.1)',
    wt_tolerance: '+28.0% / -0.0% of Minimum Wall (Cold Finished) / +35%/-0% (Hot)',
    hydro_pressure: 'P = 2*S*t/D (S = 80% SMYS, max 16.0 MPa / 2300 psi)',
  },
  SA210_C: {
    spec_key: 'SA210_C',
    spec_full: 'ASME SA210 Gr C (IBR) / ASTM A210 Gr C',
    steel_grade: 'HIGH-STRENGTH MEDIUM CARBON (SA210 Gr.C)',
    smys_mpa: 275,
    uts_mpa: 485,
    elongation_pct: 30,
    hardness: '89 HRB MAX (179 HBW)',
    straightness: '1:1000',
    color_spec: 'WHITE + RED',
    rm_color: 'YELLOW + RED',
    whf_temp: '1200° C - 1240° C',
    induction_temp: '860° C - 890° C',
    sizing_outlet_temp: '880° C - 920° C',
    ht_cycle: 'SUB-CRITICAL ANNEALED / NORMALIZED',
    ht_condition: 'SUB-CRITICAL ANNEAL (650°C - 700°C) / NORMALIZED',
    ndt: 'UT / ET',
    holding_time_sec: 5,
    coating: 'BLACK VARNISH / RUST OIL',
    end_condition: 'PLAIN END / SQUARE CUT',
    bundling: 'HEXAGONAL',
    end_cap: 'PLASTIC PROTECTOR',
    is_min_wall: true,
    od_tolerance: 'Cold Drawn: ±0.10 mm to ±0.20 mm',
    wt_tolerance: '+28.0% / -0.0% of Minimum Wall (Cold Finished)',
    hydro_pressure: 'P = 2*S*t/D (S = 80% SMYS, max 16.0 MPa)',
  },

  // ASTM A192 / A179 Boiler & Heat Exchanger
  A192: {
    spec_key: 'A192',
    spec_full: 'ASTM A192 / ASME SA192 (IBR)',
    steel_grade: 'LOW-CARBON HIGH PRESSURE BOILER STEEL',
    smys_mpa: 180,
    uts_mpa: 325,
    elongation_pct: 35,
    hardness: '77 HRB MAX (137 HBW)',
    straightness: '1:1000',
    color_spec: 'WHITE + YELLOW',
    rm_color: 'YELLOW + WHITE',
    whf_temp: '1200° C - 1240° C',
    induction_temp: '860° C - 890° C',
    sizing_outlet_temp: '880° C - 920° C',
    ht_cycle: 'NA / AS ROLLED OR SUB-CRITICAL ANNEAL',
    ht_condition: 'COLD FINISHED MUST BE SUB-CRITICAL ANNEALED (650°C - 700°C)',
    ndt: 'UT / ET',
    holding_time_sec: 5,
    coating: 'RUST PREVENTIVE OIL',
    end_condition: 'PLAIN END / SQUARE CUT',
    bundling: 'HEXAGONAL',
    end_cap: 'PLASTIC PROTECTOR',
    is_min_wall: true,
    od_tolerance: 'Cold Drawn: ±0.10 mm to ±0.20 mm',
    wt_tolerance: '+28.0% / -0.0% of Minimum Wall',
    hydro_pressure: 'P = 2*S*t/D (S = 80% SMYS, max 16.0 MPa)',
  },
  A179: {
    spec_key: 'A179',
    spec_full: 'ASTM A179 / ASME SA179 (IBR)',
    steel_grade: 'COLD-DRAWN LOW-CARBON HEAT EXCHANGER STEEL',
    smys_mpa: 180,
    uts_mpa: 325,
    elongation_pct: 35,
    hardness: '72 HRB MAX',
    straightness: '1:1000',
    color_spec: 'WHITE',
    rm_color: 'YELLOW',
    whf_temp: '1200° C - 1240° C',
    induction_temp: '860° C - 890° C',
    sizing_outlet_temp: '880° C - 920° C',
    ht_cycle: 'SUB-CRITICAL ANNEALED (650°C MIN)',
    ht_condition: 'ANNEALED AFTER FINAL COLD DRAW PASS AT 650°C OR HIGHER',
    ndt: 'EDDY CURRENT TESTING (100%)',
    holding_time_sec: 5,
    coating: 'LIGHT OIL / RUST PREVENTIVE',
    end_condition: 'PLAIN END / DEBURRED',
    bundling: 'HEXAGONAL / CORRUGATED BOX',
    end_cap: 'PLASTIC PROTECTOR',
    is_min_wall: true,
    od_tolerance: '±0.10 mm (OD < 25.4 mm), ±0.15 mm (OD 25.4-38.1 mm)',
    wt_tolerance: '+20.0% / -0.0% of Minimum Wall',
    hydro_pressure: 'P = 2*S*t/D (S = 80% SMYS, max 16.0 MPa)',
  },

  // ASTM A333 (Low Temperature)
  A333_GR6: {
    spec_key: 'A333_GR6',
    spec_full: 'ASTM A333 Gr 6 (Low Temp -45°C)',
    steel_grade: 'FINE-GRAIN LOW TEMP CARBON-MANGANESE STEEL',
    smys_mpa: 240,
    uts_mpa: 415,
    elongation_pct: 30,
    hardness: '82 HRB MAX',
    straightness: '1:1000',
    color_spec: 'BLUE + WHITE',
    rm_color: 'BLUE + WHITE',
    whf_temp: '1200° C - 1240° C',
    induction_temp: '880° C - 920° C',
    sizing_outlet_temp: '900° C',
    ht_cycle: 'NORMALIZED (OR QUENCHED & TEMPERED)',
    ht_condition: 'NORMALIZED 880-920°C AIR COOL; CHARPY IMPACT TEST AT -45°C (18 J MIN)',
    ndt: 'UT + IMPACT TEST AT -45°C',
    holding_time_sec: 5,
    coating: 'BLACK VARNISH',
    end_condition: 'BEVEL END (30°-35°)',
    bundling: 'HEXAGONAL',
    end_cap: 'PLASTIC CAP',
    is_min_wall: false,
    od_tolerance: '±0.75% (min ±0.40 mm)',
    wt_tolerance: '+15.0% / -12.5% of Nominal Wall',
    hydro_pressure: 'P = 2*S*t/D (S = 60% SMYS, max 17.2 MPa)',
  },

  // Stainless Steel ASTM A312
  A312_304L: {
    spec_key: 'A312_304L',
    spec_full: 'ASTM A312 TP304L',
    steel_grade: 'AISI 304L / UNS S30403 Austenitic Stainless',
    smys_mpa: 170,
    uts_mpa: 485,
    elongation_pct: 35,
    hardness: '90 HRB MAX (192 HBW)',
    straightness: '1:1000',
    color_spec: 'YELLOW',
    rm_color: 'YELLOW',
    whf_temp: '1180° C - 1220° C',
    induction_temp: '1040° C - 1080° C',
    sizing_outlet_temp: '1050° C',
    ht_cycle: 'SOLUTION ANNEALING',
    ht_condition: '1040°C - 1100°C RAPID WATER QUENCH',
    ndt: 'ECT + UT (100%)',
    holding_time_sec: 5,
    coating: 'PICKLED & PASSIVATED / BARE',
    end_condition: 'PLAIN END / BEVEL END',
    bundling: 'WOODEN BOX / HEXAGONAL',
    end_cap: 'PLASTIC CAP',
    is_min_wall: false,
    od_tolerance: '±0.75% (NPS 1/8 to 1-1/2: ±0.40 mm)',
    wt_tolerance: '+15.0% / -12.5% of Nominal Wall',
    hydro_pressure: 'P = 2*S*t/D (S = 50% SMYS, max 17.2 MPa)',
  },
  A312_316L: {
    spec_key: 'A312_316L',
    spec_full: 'ASTM A312 TP316L',
    steel_grade: 'AISI 316L / UNS S31603 Moly-Stainless',
    smys_mpa: 170,
    uts_mpa: 485,
    elongation_pct: 30,
    hardness: '90 HRB MAX (192 HBW)',
    straightness: '1:1000',
    color_spec: 'GREEN',
    rm_color: 'GREEN + WHITE',
    whf_temp: '1180° C - 1220° C',
    induction_temp: '1050° C - 1100° C',
    sizing_outlet_temp: '1050° C',
    ht_cycle: 'SOLUTION ANNEALING',
    ht_condition: '1050°C - 1120°C RAPID WATER QUENCH',
    ndt: 'ECT + UT',
    holding_time_sec: 5,
    coating: 'PICKLED & PASSIVATED / BARE',
    end_condition: 'PLAIN END / BEVEL END',
    bundling: 'WOODEN BOX / HEXAGONAL',
    end_cap: 'PLASTIC CAP',
    is_min_wall: false,
    od_tolerance: '±0.75% (NPS 1/8 to 1-1/2: ±0.40 mm)',
    wt_tolerance: '+15.0% / -12.5% of Nominal Wall',
    hydro_pressure: 'P = 2*S*t/D (S = 50% SMYS, max 17.2 MPa)',
  },

  // API 5L Line Pipe
  API_5L_B: {
    spec_key: 'API_5L_B',
    spec_full: 'API 5L Gr B / PSL 1 & PSL 2',
    steel_grade: 'LINE PIPE CARBON STEEL (API 5L Gr.B)',
    smys_mpa: 245,
    uts_mpa: 415,
    elongation_pct: 23,
    hardness: '82 HRB MAX',
    straightness: '1:1000',
    color_spec: 'WHITE + BLACK',
    rm_color: 'WHITE + BLACK',
    whf_temp: '1200° C - 1240° C',
    induction_temp: '880° C - 920° C',
    sizing_outlet_temp: '900° C',
    ht_cycle: 'AS ROLLED / NORMALIZED',
    ht_condition: 'AS ROLLED (NORMALIZED FOR PSL 2)',
    ndt: '100% UT / ELECTROMAGNETIC',
    holding_time_sec: 5,
    coating: 'BLACK VARNISH / FBE READY',
    end_condition: 'BEVEL END (30° ROOT FACE 1.6MM)',
    bundling: 'HEXAGONAL',
    end_cap: 'HEAVY DUTY BEVEL PROTECTOR',
    is_min_wall: false,
    od_tolerance: '±0.75% (Pipe Body)',
    wt_tolerance: '+15.0% / -12.5% of Nominal Wall',
    hydro_pressure: 'P = 2*S*t/D (S = 60% SMYS for standard, 75% for PSL 2)',
  },
  API_5L_X52: {
    spec_key: 'API_5L_X52',
    spec_full: 'API 5L X52 / L360 (PSL 1 & PSL 2)',
    steel_grade: 'MICRO-ALLOYED HIGH-STRENGTH LINE PIPE (L360)',
    smys_mpa: 360,
    uts_mpa: 460,
    elongation_pct: 21,
    hardness: '86 HRB MAX (220 HV)',
    straightness: '1:1000',
    color_spec: 'GREEN + YELLOW',
    rm_color: 'GREEN + YELLOW',
    whf_temp: '1200° C - 1240° C',
    induction_temp: '890° C - 930° C',
    sizing_outlet_temp: '910° C',
    ht_cycle: 'NORMALIZED (OR TMCP)',
    ht_condition: 'NORMALIZED 890-930°C AIR COOL (PSL 2 CHARPY TEST AT 0°C)',
    ndt: '100% UT + BEVEL END MT',
    holding_time_sec: 10,
    coating: 'EPOXY PRIMER / BLACK VARNISH',
    end_condition: 'BEVEL END (30° ROOT FACE 1.6MM)',
    bundling: 'HEXAGONAL',
    end_cap: 'PLASTIC BEVEL PROTECTOR',
    is_min_wall: false,
    od_tolerance: '±0.75% (Pipe Body)',
    wt_tolerance: '+15.0% / -12.5% of Nominal Wall',
    hydro_pressure: 'P = 2*S*t/D (S = 75% SMYS, max 20.5 MPa)',
  },

  // BS 3059 Boiler Tubes (Min Wall)
  BS3059_320: {
    spec_key: 'BS3059_320',
    spec_full: 'BS 3059 Part 1 Gr 320 (IBR)',
    steel_grade: 'CARBON STEEL BOILER TUBE (BS 3059 Gr.320)',
    smys_mpa: 195,
    uts_mpa: 320,
    elongation_pct: 25,
    hardness: '75 HRB MAX',
    straightness: '1:1000',
    color_spec: 'WHITE + YELLOW',
    rm_color: 'YELLOW + WHITE',
    whf_temp: '1200° C - 1240° C',
    induction_temp: '860° C - 890° C',
    sizing_outlet_temp: '880° C - 920° C',
    ht_cycle: 'NORMALIZED / SUB-CRITICAL ANNEALED',
    ht_condition: 'NORMALIZED 880-920°C / SUB-CRITICAL ANNEAL 650-700°C',
    ndt: 'UT / ET',
    holding_time_sec: 5,
    coating: 'BLACK VARNISH / RUST OIL',
    end_condition: 'PLAIN END / SQUARE CUT',
    bundling: 'HEXAGONAL',
    end_cap: 'PLASTIC PROTECTOR',
    is_min_wall: true,
    od_tolerance: '±0.10 mm to ±0.20 mm',
    wt_tolerance: '+28.0% / -0.0% of Minimum Wall',
    hydro_pressure: 'P = 2*S*t/D (S = 80% SMYS, max 16.0 MPa)',
  },
  BS3059_360: {
    spec_key: 'BS3059_360',
    spec_full: 'BS 3059 Part 2 Gr 360 (IBR)',
    steel_grade: 'CARBON STEEL BOILER TUBE (BS 3059 Gr.360)',
    smys_mpa: 215,
    uts_mpa: 360,
    elongation_pct: 24,
    hardness: '77 HRB MAX',
    straightness: '1:1000',
    color_spec: 'WHITE + BLUE',
    rm_color: 'YELLOW + BLUE',
    whf_temp: '1200° C - 1240° C',
    induction_temp: '860° C - 890° C',
    sizing_outlet_temp: '880° C - 920° C',
    ht_cycle: 'NORMALIZED / SUB-CRITICAL ANNEALED',
    ht_condition: 'NORMALIZED 880-920°C / SUB-CRITICAL ANNEAL 650-700°C',
    ndt: 'UT / ET',
    holding_time_sec: 5,
    coating: 'BLACK VARNISH / RUST OIL',
    end_condition: 'PLAIN END / SQUARE CUT',
    bundling: 'HEXAGONAL',
    end_cap: 'PLASTIC PROTECTOR',
    is_min_wall: true,
    od_tolerance: '±0.10 mm to ±0.20 mm',
    wt_tolerance: '+28.0% / -0.0% of Minimum Wall',
    hydro_pressure: 'P = 2*S*t/D (S = 80% SMYS, max 16.0 MPa)',
  },
  BS3059_440: {
    spec_key: 'BS3059_440',
    spec_full: 'BS 3059 Part 2 Gr 440 (IBR)',
    steel_grade: 'HIGH-DUTY CARBON STEEL (BS 3059 Gr.440)',
    smys_mpa: 255,
    uts_mpa: 440,
    elongation_pct: 21,
    hardness: '82 HRB MAX',
    straightness: '1:1000',
    color_spec: 'WHITE + GREEN',
    rm_color: 'YELLOW + GREEN',
    whf_temp: '1200° C - 1240° C',
    induction_temp: '860° C - 890° C',
    sizing_outlet_temp: '880° C - 920° C',
    ht_cycle: 'NORMALIZED / SUB-CRITICAL ANNEALED',
    ht_condition: 'NORMALIZED 880-920°C / SUB-CRITICAL ANNEAL 650-700°C',
    ndt: 'UT / ET',
    holding_time_sec: 5,
    coating: 'BLACK VARNISH / RUST OIL',
    end_condition: 'PLAIN END / SQUARE CUT',
    bundling: 'HEXAGONAL',
    end_cap: 'PLASTIC PROTECTOR',
    is_min_wall: true,
    od_tolerance: '±0.10 mm to ±0.20 mm',
    wt_tolerance: '+28.0% / -0.0% of Minimum Wall',
    hydro_pressure: 'P = 2*S*t/D (S = 80% SMYS, max 16.0 MPa)',
  },
  BS3059_620: {
    spec_key: 'BS3059_620',
    spec_full: 'BS 3059 Part 2 Gr 620 / 622 (IBR)',
    steel_grade: 'ALLOY STEEL BOILER TUBE (BS 3059 Gr.620 / 1%Cr-0.5%Mo)',
    smys_mpa: 310,
    uts_mpa: 580,
    elongation_pct: 18,
    hardness: '88 HRB MAX',
    straightness: '1:1000',
    color_spec: 'WHITE + ORANGE',
    rm_color: 'YELLOW + ORANGE',
    whf_temp: '1200° C - 1250° C',
    induction_temp: '900° C - 950° C',
    sizing_outlet_temp: '900° C',
    ht_cycle: 'NORMALIZED & TEMPERED',
    ht_condition: 'NORMALIZE 930-970°C, TEMPER 650-720°C',
    ndt: 'UT + MT',
    holding_time_sec: 5,
    coating: 'BLACK VARNISH / RUST OIL',
    end_condition: 'PLAIN END / SQUARE CUT',
    bundling: 'HEXAGONAL',
    end_cap: 'PLASTIC PROTECTOR',
    is_min_wall: true,
    od_tolerance: '±0.10 mm to ±0.20 mm',
    wt_tolerance: '+28.0% / -0.0% of Minimum Wall',
    hydro_pressure: 'P = 2*S*t/D (S = 80% SMYS, max 16.0 MPa)',
  },

  // DIN 2391 / EN 10305-1 Precision Seamless
  DIN2391_ST52: {
    spec_key: 'DIN2391_ST52',
    spec_full: 'DIN 2391 ST 52 / EN 10305-1 E355 (+N)',
    steel_grade: 'PRECISION SEAMLESS COLD DRAWN (ST52 / E355)',
    smys_mpa: 355,
    uts_mpa: 490,
    elongation_pct: 22,
    hardness: '85 HRB MAX',
    straightness: '1:1000',
    color_spec: 'YELLOW + BLACK',
    rm_color: 'YELLOW + BLACK',
    whf_temp: '1200° C - 1240° C',
    induction_temp: '880° C - 920° C',
    sizing_outlet_temp: '900° C',
    ht_cycle: 'NORMALIZED (+N)',
    ht_condition: 'CONTROLLED ATMOSPHERE NORMALIZED 890-930°C',
    ndt: '100% EDDY CURRENT / UT',
    holding_time_sec: 5,
    coating: 'RUST PREVENTIVE OIL',
    end_condition: 'PLAIN END / SQUARE CUT DEBURRED',
    bundling: 'HEXAGONAL BUNDLES',
    end_cap: 'PLASTIC PROTECTOR',
    is_min_wall: false,
    od_tolerance: '±0.08 mm (OD < 30 mm), ±0.15 mm (OD 30-50 mm)',
    wt_tolerance: '±7.5% of Nominal Wall (Precision Grade)',
    hydro_pressure: 'P = 2*S*t/D (S = 70% SMYS, max 20.0 MPa)',
  },
  DIN2391_ST35: {
    spec_key: 'DIN2391_ST35',
    spec_full: 'DIN 2391 ST 35 / EN 10305-1 E235 (+N)',
    steel_grade: 'PRECISION SEAMLESS COLD DRAWN (ST35 / E235)',
    smys_mpa: 235,
    uts_mpa: 340,
    elongation_pct: 25,
    hardness: '75 HRB MAX',
    straightness: '1:1000',
    color_spec: 'WHITE + BLACK',
    rm_color: 'WHITE + BLACK',
    whf_temp: '1200° C - 1240° C',
    induction_temp: '880° C - 920° C',
    sizing_outlet_temp: '900° C',
    ht_cycle: 'NORMALIZED (+N)',
    ht_condition: 'CONTROLLED ATMOSPHERE NORMALIZED 880-920°C',
    ndt: '100% EDDY CURRENT',
    holding_time_sec: 5,
    coating: 'RUST PREVENTIVE OIL',
    end_condition: 'PLAIN END / DEBURRED',
    bundling: 'HEXAGONAL',
    end_cap: 'PLASTIC PROTECTOR',
    is_min_wall: false,
    od_tolerance: '±0.08 mm to ±0.15 mm',
    wt_tolerance: '±7.5% of Nominal Wall',
    hydro_pressure: 'P = 2*S*t/D (S = 70% SMYS, max 16.0 MPa)',
  },

  // Indian Standards (IS 1239 / IS 3589)
  IS_1239: {
    spec_key: 'IS_1239',
    spec_full: 'IS 1239 (Part 1) Mild Steel Tubes',
    steel_grade: 'LOW-CARBON MILD STEEL (IS 1239)',
    smys_mpa: 210,
    uts_mpa: 330,
    elongation_pct: 20,
    hardness: '75 HRB MAX',
    straightness: '1:1000',
    color_spec: 'BLACK / BLUE',
    rm_color: 'BLACK',
    whf_temp: '1200° C - 1240° C',
    induction_temp: '860° C - 890° C',
    sizing_outlet_temp: '880° C - 900° C',
    ht_cycle: 'NA / AS ROLLED',
    ht_condition: 'AS ROLLED',
    ndt: 'HYDROSTATIC TEST + VISUAL',
    holding_time_sec: 5,
    coating: 'BLACK VARNISH / BITUMEN',
    end_condition: 'SCREWED & SOCKETED / PLAIN END',
    bundling: 'HEXAGONAL',
    end_cap: 'PLASTIC CAP',
    is_min_wall: false,
    od_tolerance: '+0.4 mm / -0.8 mm (Light/Medium/Heavy)',
    wt_tolerance: '-10.0% (Light) / -8.0% (Medium/Heavy)',
    hydro_pressure: '5.0 MPa (Test Pressure as per IS 1239)',
  },
};

/**
 * Normalizes user search input to match against the standards database
 */
export function findMatchingStandard(input: string): FetchedSpecData | null {
  if (!input || !input.trim()) return null;
  const raw = input.trim().toUpperCase().replace(/[\s_\-]+/g, ' ');

  // Direct key lookup
  const exactKey = raw.replace(/\s+/g, '_');
  if (METALLURGICAL_STANDARDS_DB[exactKey]) {
    return { ...METALLURGICAL_STANDARDS_DB[exactKey], source: 'STANDARDS_KNOWLEDGE_BASE' };
  }

  // Pattern matching
  // A106
  if (raw.includes('106')) {
    if (raw.includes('C')) return { ...METALLURGICAL_STANDARDS_DB.A106_C, source: 'STANDARDS_KNOWLEDGE_BASE' };
    return { ...METALLURGICAL_STANDARDS_DB.A106_B, source: 'STANDARDS_KNOWLEDGE_BASE' };
  }

  // A53
  if (raw.includes('53')) {
    return { ...METALLURGICAL_STANDARDS_DB.A53_B, source: 'STANDARDS_KNOWLEDGE_BASE' };
  }

  // A335 (P11, P22, P91)
  if (raw.includes('335') || raw.includes('P11') || raw.includes('P22') || raw.includes('P91')) {
    if (raw.includes('91')) return { ...METALLURGICAL_STANDARDS_DB.A335_P91, source: 'STANDARDS_KNOWLEDGE_BASE' };
    if (raw.includes('22')) return { ...METALLURGICAL_STANDARDS_DB.A335_P22, source: 'STANDARDS_KNOWLEDGE_BASE' };
    return { ...METALLURGICAL_STANDARDS_DB.A335_P11, source: 'STANDARDS_KNOWLEDGE_BASE' };
  }

  // A213 (T11, T22)
  if (raw.includes('213') || raw.includes('T11') || raw.includes('T22')) {
    if (raw.includes('22')) return { ...METALLURGICAL_STANDARDS_DB.A213_T22, source: 'STANDARDS_KNOWLEDGE_BASE' };
    return { ...METALLURGICAL_STANDARDS_DB.A213_T11, source: 'STANDARDS_KNOWLEDGE_BASE' };
  }

  // SA210
  if (raw.includes('210')) {
    if (raw.includes('C')) return { ...METALLURGICAL_STANDARDS_DB.SA210_C, source: 'STANDARDS_KNOWLEDGE_BASE' };
    return { ...METALLURGICAL_STANDARDS_DB.SA210_A1, source: 'STANDARDS_KNOWLEDGE_BASE' };
  }

  // A192
  if (raw.includes('192')) {
    return { ...METALLURGICAL_STANDARDS_DB.A192, source: 'STANDARDS_KNOWLEDGE_BASE' };
  }

  // A179
  if (raw.includes('179')) {
    return { ...METALLURGICAL_STANDARDS_DB.A179, source: 'STANDARDS_KNOWLEDGE_BASE' };
  }

  // A333 (Low temp Gr 6)
  if (raw.includes('333')) {
    return { ...METALLURGICAL_STANDARDS_DB.A333_GR6, source: 'STANDARDS_KNOWLEDGE_BASE' };
  }

  // A312 Stainless
  if (raw.includes('312') || raw.includes('316') || raw.includes('304')) {
    if (raw.includes('316')) return { ...METALLURGICAL_STANDARDS_DB.A312_316L, source: 'STANDARDS_KNOWLEDGE_BASE' };
    return { ...METALLURGICAL_STANDARDS_DB.A312_304L, source: 'STANDARDS_KNOWLEDGE_BASE' };
  }

  // API 5L
  if (raw.includes('API') || raw.includes('5L') || raw.includes('X52') || raw.includes('X60') || raw.includes('X65')) {
    if (raw.includes('52') || raw.includes('60') || raw.includes('65')) {
      return { ...METALLURGICAL_STANDARDS_DB.API_5L_X52, source: 'STANDARDS_KNOWLEDGE_BASE' };
    }
    return { ...METALLURGICAL_STANDARDS_DB.API_5L_B, source: 'STANDARDS_KNOWLEDGE_BASE' };
  }

  // BS 3059
  if (raw.includes('3059')) {
    if (raw.includes('620') || raw.includes('622')) return { ...METALLURGICAL_STANDARDS_DB.BS3059_620, source: 'STANDARDS_KNOWLEDGE_BASE' };
    if (raw.includes('440')) return { ...METALLURGICAL_STANDARDS_DB.BS3059_440, source: 'STANDARDS_KNOWLEDGE_BASE' };
    if (raw.includes('360')) return { ...METALLURGICAL_STANDARDS_DB.BS3059_360, source: 'STANDARDS_KNOWLEDGE_BASE' };
    return { ...METALLURGICAL_STANDARDS_DB.BS3059_320, source: 'STANDARDS_KNOWLEDGE_BASE' };
  }

  // DIN 2391 / EN 10305 ST52 / ST35
  if (raw.includes('52') || raw.includes('355')) {
    return { ...METALLURGICAL_STANDARDS_DB.DIN2391_ST52, source: 'STANDARDS_KNOWLEDGE_BASE' };
  }
  if (raw.includes('35') || raw.includes('235')) {
    return { ...METALLURGICAL_STANDARDS_DB.DIN2391_ST35, source: 'STANDARDS_KNOWLEDGE_BASE' };
  }

  // IS 1239
  if (raw.includes('1239')) {
    return { ...METALLURGICAL_STANDARDS_DB.IS_1239, source: 'STANDARDS_KNOWLEDGE_BASE' };
  }

  return null;
}
