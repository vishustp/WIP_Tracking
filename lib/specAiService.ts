// lib/specAiService.ts
/**
 * Metallurgical Standards Knowledge Base & AI Specification Fetcher
 * Covers international standards: ASTM, ASME, API, BS, EN, DIN, IS
 * Provides mechanical properties, route-specific tolerances (CDS vs HFS),
 * Barlow hydro formulas, thermal parameters, and NDT requirements.
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
  // Route-Specific Tolerances (Cold Drawn vs Hot Finished)
  cds_od_tolerance: string;
  cds_wt_tolerance: string;
  hfs_od_tolerance: string;
  hfs_wt_tolerance: string;
  // Fallback / General
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
    cds_od_tolerance: '±0.10 mm to ±0.25 mm (or ±0.50%)',
    cds_wt_tolerance: '±10.0% of Nominal Wall (+20% / -0% Min Wall)',
    hfs_od_tolerance: '±0.75% (NPS 1/8 to 1-1/2: +0.40/-0.80 mm; NPS 2 to 4: ±0.79 mm)',
    hfs_wt_tolerance: '+15.0% / -12.5% of Nominal Wall (+28% / -0% Min Wall)',
    od_tolerance: 'CDS: ±0.15 mm | HFS: ±0.75%',
    wt_tolerance: 'CDS: ±10.0% | HFS: +15.0% / -12.5%',
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
    whf_temp: '1220° C - 1240° C',
    induction_temp: '860° C - 890° C',
    sizing_outlet_temp: '880° C - 910° C',
    ht_cycle: 'NORMALIZED / AS ROLLED',
    ht_condition: 'NORMALIZED 880-920° C OR AS ROLLED',
    ndt: 'UT (100%)',
    holding_time_sec: 5,
    coating: 'BLACK VARNISH',
    end_condition: 'BEVEL END (30°-35°)',
    bundling: 'HEXAGONAL',
    end_cap: 'PLASTIC PROTECTOR',
    is_min_wall: false,
    cds_od_tolerance: '±0.10 mm to ±0.25 mm (or ±0.50%)',
    cds_wt_tolerance: '±10.0% of Nominal Wall (+20% / -0% Min Wall)',
    hfs_od_tolerance: '±0.75% (min ±0.40 mm)',
    hfs_wt_tolerance: '+15.0% / -12.5% of Nominal Wall',
    od_tolerance: 'CDS: ±0.15 mm | HFS: ±0.75%',
    wt_tolerance: 'CDS: ±10.0% | HFS: +15.0% / -12.5%',
    hydro_pressure: 'P = 2*S*t/D (S = 60% SMYS, max 17.2 MPa / 2500 psi)',
  },

  // ASTM A53 (Standard Carbon Pipe)
  A53_B: {
    spec_key: 'A53_B',
    spec_full: 'ASTM A53 Gr B (Type S Seamless)',
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
    ht_cycle: 'NA / AS ROLLED',
    ht_condition: 'HOT FINISHED AS ROLLED',
    ndt: 'UT / ET',
    holding_time_sec: 5,
    coating: 'BLACK VARNISH / MILL PROTECTIVE',
    end_condition: 'BEVEL END (30°-35°)',
    bundling: 'HEXAGONAL',
    end_cap: 'PLASTIC PROTECTOR',
    is_min_wall: false,
    cds_od_tolerance: '±0.15 mm to ±0.25 mm',
    cds_wt_tolerance: '±10.0% of Nominal Wall',
    hfs_od_tolerance: '±1.0% (NPS 1-1/2 and smaller: ±0.40 mm)',
    hfs_wt_tolerance: '-12.5% of Nominal Wall',
    od_tolerance: 'CDS: ±0.20 mm | HFS: ±1.0%',
    wt_tolerance: 'CDS: ±10.0% | HFS: -12.5%',
    hydro_pressure: 'P = 2*S*t/D (S = 60% SMYS, max 17.2 MPa / 2500 psi)',
  },

  // ASTM A335 (High-Temp Alloy Pipes: P11, P22, P91)
  A335_P11: {
    spec_key: 'A335_P11',
    spec_full: 'ASTM A335 P11 (IBR)',
    steel_grade: '1.25Cr - 0.5Mo Alloy Steel (UNS K11597)',
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
    ht_cycle: 'NORMALIZED & TEMPERED / FULL ANNEAL',
    ht_condition: 'NORMALIZE 900-940°C, TEMPER 650-700°C',
    ndt: 'UT + MT',
    holding_time_sec: 5,
    coating: 'BLACK VARNISH / RUST OIL',
    end_condition: 'BEVEL END (30°-35°)',
    bundling: 'HEXAGONAL',
    end_cap: 'PLASTIC CAP',
    is_min_wall: false,
    cds_od_tolerance: '±0.10 mm to ±0.25 mm (or ±0.50%)',
    cds_wt_tolerance: '±10.0% (Nominal) / +20% -0% (Min Wall)',
    hfs_od_tolerance: '±0.75% (min ±0.40 mm)',
    hfs_wt_tolerance: '+15.0% / -12.5% of Nominal Wall',
    od_tolerance: 'CDS: ±0.15 mm | HFS: ±0.75%',
    wt_tolerance: 'CDS: ±10.0% | HFS: +15.0% / -12.5%',
    hydro_pressure: 'P = 2*S*t/D (S = 60% SMYS, max 17.2 MPa / 2500 psi)',
  },
  A335_P22: {
    spec_key: 'A335_P22',
    spec_full: 'ASTM A335 P22 (IBR)',
    steel_grade: '2.25Cr - 1Mo Alloy Steel (UNS K21590)',
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
    ht_cycle: 'NORMALIZED & TEMPERED',
    ht_condition: 'NORMALIZE 920-960°C, TEMPER 680-720°C',
    ndt: 'UT + MT',
    holding_time_sec: 5,
    coating: 'BLACK VARNISH / RUST PREVENTIVE',
    end_condition: 'BEVEL END (30°-35°)',
    bundling: 'HEXAGONAL',
    end_cap: 'PLASTIC CAP',
    is_min_wall: false,
    cds_od_tolerance: '±0.10 mm to ±0.25 mm (or ±0.50%)',
    cds_wt_tolerance: '±10.0% (Nominal) / +20% -0% (Min Wall)',
    hfs_od_tolerance: '±0.75% (NPS 1/8 to 1-1/2: ±0.40 mm; NPS 2-4: ±0.79 mm)',
    hfs_wt_tolerance: '+15.0% / -12.5% of Nominal Wall',
    od_tolerance: 'CDS: ±0.15 mm | HFS: ±0.75%',
    wt_tolerance: 'CDS: ±10.0% | HFS: +15.0% / -12.5%',
    hydro_pressure: 'P = 2*S*t/D (S = 60% SMYS, max 17.2 MPa / 2500 psi)',
  },
  A335_P91: {
    spec_key: 'A335_P91',
    spec_full: 'ASTM A335 P91 (Type 1 & 2 / IBR)',
    steel_grade: '9Cr - 1Mo - V Modified Alloy Steel (UNS K91560)',
    smys_mpa: 415,
    uts_mpa: 585,
    elongation_pct: 20,
    hardness: '250 HBW / 25 HRC MAX',
    straightness: '1:1000',
    color_spec: 'YELLOW + RED',
    rm_color: 'YELLOW + RED',
    whf_temp: '1220° C - 1260° C',
    induction_temp: '950° C - 1000° C',
    sizing_outlet_temp: '950° C',
    ht_cycle: 'NORMALIZED & TEMPERED (PRECISE)',
    ht_condition: 'NORMALIZE 1040-1080°C, TEMPER 750-780°C',
    ndt: 'UT (100%) + MT + HARDNESS',
    holding_time_sec: 5,
    coating: 'RUST PREVENTIVE OIL',
    end_condition: 'BEVEL END (30°-35°)',
    bundling: 'HEXAGONAL',
    end_cap: 'PLASTIC CAP',
    is_min_wall: false,
    cds_od_tolerance: '±0.10 mm to ±0.25 mm (or ±0.50%)',
    cds_wt_tolerance: '±10.0% (Nominal) / +20% -0% (Min Wall)',
    hfs_od_tolerance: '±0.75% (min ±0.40 mm)',
    hfs_wt_tolerance: '+15.0% / -12.5% of Nominal Wall',
    od_tolerance: 'CDS: ±0.15 mm | HFS: ±0.75%',
    wt_tolerance: 'CDS: ±10.0% | HFS: +15.0% / -12.5%',
    hydro_pressure: 'P = 2*S*t/D (S = 60% SMYS, max 20.5 MPa)',
  },

  // ASTM A213 (Boiler & Heat Exchanger Alloy Tubes)
  A213_T11: {
    spec_key: 'A213_T11',
    spec_full: 'ASTM A213 T11 (IBR)',
    steel_grade: '1.25Cr - 0.5Mo Alloy Steel',
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
    ht_cycle: 'FULL / ISOTHERMAL ANNEAL OR N&T',
    ht_condition: 'NORMALIZE 900-940°C, TEMPER 650-700°C',
    ndt: 'UT + ET',
    holding_time_sec: 5,
    coating: 'RUST PREVENTIVE OIL',
    end_condition: 'BEVEL END (30°-35°)',
    bundling: 'HEXAGONAL',
    end_cap: 'PLASTIC CAP',
    is_min_wall: true,
    cds_od_tolerance: '±0.10 mm (OD < 25.4), ±0.15 mm (OD 25.4-38.1), ±0.20 mm (OD > 38.1)',
    cds_wt_tolerance: '+20.0% / -0.0% of Minimum Wall',
    hfs_od_tolerance: '±0.40 mm (OD ≤ 38.1), ±0.48 mm (OD 38.1-50.8), ±0.64 mm (OD > 50.8)',
    hfs_wt_tolerance: '+28.0% / -0.0% of Minimum Wall',
    od_tolerance: 'CDS: ±0.10-0.20 mm | HFS: ±0.40-0.64 mm',
    wt_tolerance: 'CDS: +20% / -0% | HFS: +28% / -0% (Min Wall)',
    hydro_pressure: 'P = 2*S*t/D (S = 80% SMYS, max 16.0 MPa)',
  },
  A213_T22: {
    spec_key: 'A213_T22',
    spec_full: 'ASTM A213 T22 (IBR)',
    steel_grade: '2.25Cr - 1Mo Alloy Steel',
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
    ht_cycle: 'FULL / ISOTHERMAL ANNEAL OR N&T',
    ht_condition: 'NORMALIZE 920-960°C, TEMPER 680-720°C',
    ndt: 'UT + ET',
    holding_time_sec: 5,
    coating: 'RUST PREVENTIVE OIL',
    end_condition: 'BEVEL END (30°-35°)',
    bundling: 'HEXAGONAL',
    end_cap: 'PLASTIC CAP',
    is_min_wall: true,
    cds_od_tolerance: '±0.10 mm (OD < 25.4), ±0.15 mm (OD 25.4-38.1), ±0.20 mm (OD > 38.1)',
    cds_wt_tolerance: '+20.0% / -0.0% of Minimum Wall',
    hfs_od_tolerance: '±0.40 mm (OD ≤ 38.1), ±0.48 mm (OD 38.1-50.8), ±0.64 mm (OD > 50.8)',
    hfs_wt_tolerance: '+28.0% / -0.0% of Minimum Wall',
    od_tolerance: 'CDS: ±0.10-0.20 mm | HFS: ±0.40-0.64 mm',
    wt_tolerance: 'CDS: +20% / -0% | HFS: +28% / -0% (Min Wall)',
    hydro_pressure: 'P = 2*S*t/D (S = 80% SMYS, max 16.0 MPa)',
  },

  // ASME SA210 (Medium Carbon Boiler Tubes)
  SA210_A1: {
    spec_key: 'SA210_A1',
    spec_full: 'ASME SA210 Gr A-1 (IBR) / ASTM A210 Gr A-1',
    steel_grade: 'MEDIUM-CARBON STEEL (SA210 Gr.A1)',
    smys_mpa: 255,
    uts_mpa: 415,
    elongation_pct: 30,
    hardness: '79 HRB MAX',
    straightness: '1:1000',
    color_spec: 'WHITE + BLUE',
    rm_color: 'YELLOW + BLUE',
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
    cds_od_tolerance: '±0.10 mm to ±0.20 mm (ASTM A450)',
    cds_wt_tolerance: '+20.0% / -0.0% of Minimum Wall',
    hfs_od_tolerance: '±0.40 mm to ±0.64 mm',
    hfs_wt_tolerance: '+28.0% / -0.0% of Minimum Wall',
    od_tolerance: 'CDS: ±0.15 mm | HFS: ±0.50 mm',
    wt_tolerance: 'CDS: +20% / -0% | HFS: +28% / -0%',
    hydro_pressure: 'P = 2*S*t/D (S = 80% SMYS, max 16.0 MPa)',
  },
  SA210_C: {
    spec_key: 'SA210_C',
    spec_full: 'ASME SA210 Gr C (IBR) / ASTM A210 Gr C',
    steel_grade: 'MEDIUM-CARBON STEEL (SA210 Gr.C)',
    smys_mpa: 275,
    uts_mpa: 485,
    elongation_pct: 30,
    hardness: '89 HRB MAX',
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
    cds_od_tolerance: '±0.10 mm to ±0.20 mm (ASTM A450)',
    cds_wt_tolerance: '+20.0% / -0.0% of Minimum Wall',
    hfs_od_tolerance: '±0.40 mm to ±0.64 mm',
    hfs_wt_tolerance: '+28.0% / -0.0% of Minimum Wall',
    od_tolerance: 'CDS: ±0.15 mm | HFS: ±0.50 mm',
    wt_tolerance: 'CDS: +20% / -0% | HFS: +28% / -0%',
    hydro_pressure: 'P = 2*S*t/D (S = 80% SMYS, max 16.0 MPa)',
  },

  // ASTM A192 (Carbon High Pressure Boiler Tubes)
  A192: {
    spec_key: 'A192',
    spec_full: 'ASTM A192 / ASME SA192 (IBR)',
    steel_grade: 'LOW-CARBON STEEL BOILER TUBE',
    smys_mpa: 180,
    uts_mpa: 325,
    elongation_pct: 35,
    hardness: '77 HRB MAX',
    straightness: '1:1000',
    color_spec: 'WHITE + GREEN',
    rm_color: 'YELLOW + GREEN',
    whf_temp: '1200° C - 1240° C',
    induction_temp: '860° C - 890° C',
    sizing_outlet_temp: '880° C - 920° C',
    ht_cycle: 'SUB-CRITICAL ANNEALED / NORMALIZED',
    ht_condition: '650°C - 700°C SUB-CRITICAL ANNEAL',
    ndt: 'UT / ET',
    holding_time_sec: 5,
    coating: 'BLACK VARNISH / RUST OIL',
    end_condition: 'PLAIN END / SQUARE CUT',
    bundling: 'HEXAGONAL',
    end_cap: 'PLASTIC PROTECTOR',
    is_min_wall: true,
    cds_od_tolerance: '±0.10 mm to ±0.20 mm (ASTM A450)',
    cds_wt_tolerance: '+20.0% / -0.0% of Minimum Wall',
    hfs_od_tolerance: '±0.40 mm to ±0.64 mm',
    hfs_wt_tolerance: '+28.0% / -0.0% of Minimum Wall',
    od_tolerance: 'CDS: ±0.15 mm | HFS: ±0.50 mm',
    wt_tolerance: 'CDS: +20% / -0% | HFS: +28% / -0%',
    hydro_pressure: 'P = 2*S*t/D (S = 80% SMYS, max 16.0 MPa)',
  },

  // ASTM A179 (Cold Drawn Heat Exchanger & Condenser Tubes)
  A179: {
    spec_key: 'A179',
    spec_full: 'ASTM A179 / ASME SA179 (IBR)',
    steel_grade: 'LOW-CARBON HEAT EXCHANGER STEEL',
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
    ht_cycle: 'SUB-CRITICAL ANNEALED (FINAL)',
    ht_condition: '650°C - 700°C SUB-CRITICAL ANNEAL AFTER FINAL DRAW',
    ndt: 'ECT + HYDRO 100%',
    holding_time_sec: 5,
    coating: 'RUST PREVENTIVE OIL',
    end_condition: 'PLAIN END / SQUARE CUT',
    bundling: 'HEXAGONAL',
    end_cap: 'PLASTIC CAP',
    is_min_wall: true,
    cds_od_tolerance: '±0.10 mm (OD < 25.4 mm), ±0.15 mm (OD 25.4-38.1 mm)',
    cds_wt_tolerance: '+20.0% / -0.0% of Minimum Wall',
    hfs_od_tolerance: 'N/A (Exclusively Cold Drawn Condenser Tubes)',
    hfs_wt_tolerance: 'N/A',
    od_tolerance: '±0.10 mm (OD < 25.4 mm), ±0.15 mm (OD 25.4-38.1 mm)',
    wt_tolerance: '+20.0% / -0.0% of Minimum Wall',
    hydro_pressure: 'P = 2*S*t/D (S = 80% SMYS, max 16.0 MPa)',
  },

  // ASTM A333 (Low-Temperature Service)
  A333_GR6: {
    spec_key: 'A333_GR6',
    spec_full: 'ASTM A333 Gr 6 (Low Temp Service)',
    steel_grade: 'CARBON-MANGANESE STEEL (CHARPY -45°C)',
    smys_mpa: 240,
    uts_mpa: 415,
    elongation_pct: 30,
    hardness: '85 HRB MAX',
    straightness: '1:1000',
    color_spec: 'WHITE + YELLOW',
    rm_color: 'WHITE + YELLOW',
    whf_temp: '1200° C - 1240° C',
    induction_temp: '880° C - 920° C',
    sizing_outlet_temp: '880° C - 920° C',
    ht_cycle: 'NORMALIZED (MANDATORY)',
    ht_condition: 'NORMALIZE 900-930°C WITH CONTROLLED COOLING',
    ndt: 'UT (100%) + IMPACT @ -45°C',
    holding_time_sec: 5,
    coating: 'BLACK VARNISH',
    end_condition: 'BEVEL END (30°-35°)',
    bundling: 'HEXAGONAL',
    end_cap: 'PLASTIC CAP',
    is_min_wall: false,
    cds_od_tolerance: '±0.10 mm to ±0.25 mm (or ±0.50%)',
    cds_wt_tolerance: '±10.0% (Nominal) / +20% -0% (Min Wall)',
    hfs_od_tolerance: '±0.75% (min ±0.40 mm)',
    hfs_wt_tolerance: '+15.0% / -12.5% of Nominal Wall',
    od_tolerance: 'CDS: ±0.15 mm | HFS: ±0.75%',
    wt_tolerance: 'CDS: ±10.0% | HFS: +15.0% / -12.5%',
    hydro_pressure: 'P = 2*S*t/D (S = 60% SMYS, max 17.2 MPa / 2500 psi)',
  },

  // ASTM A312 (Stainless Steel 304L, 316L)
  A312_304L: {
    spec_key: 'A312_304L',
    spec_full: 'ASTM A312 TP304L',
    steel_grade: 'AISI 304L / UNS S30403 Stainless Steel',
    smys_mpa: 170,
    uts_mpa: 485,
    elongation_pct: 35,
    hardness: '90 HRB MAX',
    straightness: '1:1000',
    color_spec: 'YELLOW',
    rm_color: 'YELLOW',
    whf_temp: '1180° C - 1220° C',
    induction_temp: '1040° C - 1080° C',
    sizing_outlet_temp: '1050° C',
    ht_cycle: 'SOLUTION ANNEALING',
    ht_condition: '1040°C - 1100°C RAPID WATER QUENCH',
    ndt: 'ECT + UT',
    holding_time_sec: 5,
    coating: 'PASSIVATED / PICKLED',
    end_condition: 'PLAIN END / BEVEL END',
    bundling: 'HEXAGONAL',
    end_cap: 'PLASTIC CAP',
    is_min_wall: false,
    cds_od_tolerance: '±0.10 mm to ±0.20 mm',
    cds_wt_tolerance: '±10.0% of Nominal Wall',
    hfs_od_tolerance: '±0.75% (NPS 1/8 to 1-1/2: ±0.40 mm)',
    hfs_wt_tolerance: '+15.0% / -12.5%',
    od_tolerance: 'CDS: ±0.15 mm | HFS: ±0.75%',
    wt_tolerance: 'CDS: ±10.0% | HFS: +15.0% / -12.5%',
    hydro_pressure: 'P = 2*S*t/D (S = 50% SMYS, max 17.2 MPa)',
  },
  A312_316L: {
    spec_key: 'A312_316L',
    spec_full: 'ASTM A312 TP316L',
    steel_grade: 'AISI 316L / UNS S31603 Stainless Steel',
    smys_mpa: 170,
    uts_mpa: 485,
    elongation_pct: 30,
    hardness: '90 HRB MAX',
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
    coating: 'PASSIVATED / PICKLED',
    end_condition: 'PLAIN END / BEVEL END',
    bundling: 'HEXAGONAL',
    end_cap: 'PLASTIC CAP',
    is_min_wall: false,
    cds_od_tolerance: '±0.10 mm to ±0.20 mm',
    cds_wt_tolerance: '±10.0% of Nominal Wall',
    hfs_od_tolerance: '±0.75% (NPS 1/8 to 1-1/2: ±0.40 mm)',
    hfs_wt_tolerance: '+15.0% / -12.5%',
    od_tolerance: 'CDS: ±0.15 mm | HFS: ±0.75%',
    wt_tolerance: 'CDS: ±10.0% | HFS: +15.0% / -12.5%',
    hydro_pressure: 'P = 2*S*t/D (S = 50% SMYS, max 17.2 MPa)',
  },

  // API 5L (Line Pipe)
  API_5L_B: {
    spec_key: 'API_5L_B',
    spec_full: 'API 5L Grade B (PSL 1 / PSL 2)',
    steel_grade: 'LINE PIPE STEEL (API SPEC 5L GR.B)',
    smys_mpa: 245,
    uts_mpa: 415,
    elongation_pct: 23,
    hardness: '85 HRB MAX',
    straightness: '0.2% OF TOTAL LENGTH',
    color_spec: 'BLACK + WHITE',
    rm_color: 'BLACK + WHITE',
    whf_temp: '1220° C - 1250° C',
    induction_temp: '880° C - 920° C',
    sizing_outlet_temp: '880° C - 920° C',
    ht_cycle: 'AS ROLLED / NORMALIZED',
    ht_condition: 'AS ROLLED (PSL1) / NORMALIZED (PSL2)',
    ndt: 'UT (100% BODY + ENDS)',
    holding_time_sec: 5,
    coating: 'BLACK VARNISH / EPOXY PRIMER',
    end_condition: 'BEVEL END (30°-35°) API 5L STD',
    bundling: 'HEXAGONAL / LOOSE',
    end_cap: 'HEAVY BEVEL PROTECTOR',
    is_min_wall: false,
    cds_od_tolerance: '±0.5% (Pipe Body) / ±0.15 mm',
    cds_wt_tolerance: '±10.0% of Nominal Wall',
    hfs_od_tolerance: '±0.75% (Pipe Body), Ends: +1.6 mm / -0.4 mm',
    hfs_wt_tolerance: '+15.0% / -12.5% of Nominal Wall',
    od_tolerance: 'CDS: ±0.5% | HFS: ±0.75%',
    wt_tolerance: 'CDS: ±10.0% | HFS: +15.0% / -12.5%',
    hydro_pressure: 'P = 2*S*t/D (S = 60% SMYS for PSL1, 75% for PSL2)',
  },
  API_5L_X52: {
    spec_key: 'API_5L_X52',
    spec_full: 'API 5L Grade X52 (PSL 2)',
    steel_grade: 'HIGH-YIELD LINE PIPE (L360 / X52)',
    smys_mpa: 360,
    uts_mpa: 460,
    elongation_pct: 21,
    hardness: '22 HRC MAX',
    straightness: '0.2% OF TOTAL LENGTH',
    color_spec: 'BLUE + YELLOW',
    rm_color: 'BLUE + YELLOW',
    whf_temp: '1220° C - 1250° C',
    induction_temp: '890° C - 930° C',
    sizing_outlet_temp: '890° C - 930° C',
    ht_cycle: 'NORMALIZED / TMCP',
    ht_condition: 'NORMALIZED 900-940°C',
    ndt: 'UT 100% + EMI + IMPACT',
    holding_time_sec: 10,
    coating: 'BLACK VARNISH / 3LPE COMPATIBLE',
    end_condition: 'BEVEL END (30°-35°)',
    bundling: 'HEXAGONAL / LOOSE',
    end_cap: 'HEAVY BEVEL PROTECTOR',
    is_min_wall: false,
    cds_od_tolerance: '±0.5% (Pipe Body) / ±0.15 mm',
    cds_wt_tolerance: '±10.0% of Nominal Wall',
    hfs_od_tolerance: '±0.75% (Pipe Body), Ends: +1.6 mm / -0.4 mm',
    hfs_wt_tolerance: '+15.0% / -12.5% of Nominal Wall',
    od_tolerance: 'CDS: ±0.5% | HFS: ±0.75%',
    wt_tolerance: 'CDS: ±10.0% | HFS: +15.0% / -12.5%',
    hydro_pressure: 'P = 2*S*t/D (S = 75% SMYS)',
  },

  // BS 3059 (British Standard Boiler Tubes)
  BS3059_320: {
    spec_key: 'BS3059_320',
    spec_full: 'BS 3059 Part 1 Gr 320 (IBR)',
    steel_grade: 'CARBON STEEL (BS 3059 Gr.320)',
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
    cds_od_tolerance: '±0.10 mm to ±0.20 mm (or ±0.50%)',
    cds_wt_tolerance: '+15.0% / -0.0% of Minimum Wall',
    hfs_od_tolerance: '±0.75% (min ±0.40 mm)',
    hfs_wt_tolerance: '+28.0% / -0.0% of Minimum Wall',
    od_tolerance: 'CDS: ±0.15 mm | HFS: ±0.75%',
    wt_tolerance: 'CDS: +15% / -0% | HFS: +28% / -0%',
    hydro_pressure: 'P = 2*S*t/D (S = 80% SMYS, max 16.0 MPa)',
  },
  BS3059_360: {
    spec_key: 'BS3059_360',
    spec_full: 'BS 3059 Part 2 Gr 360 (IBR)',
    steel_grade: 'CARBON STEEL (BS 3059 Gr.360)',
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
    cds_od_tolerance: '±0.10 mm to ±0.20 mm (or ±0.50%)',
    cds_wt_tolerance: '+15.0% / -0.0% of Minimum Wall',
    hfs_od_tolerance: '±0.75% (min ±0.40 mm)',
    hfs_wt_tolerance: '+28.0% / -0.0% of Minimum Wall',
    od_tolerance: 'CDS: ±0.15 mm | HFS: ±0.75%',
    wt_tolerance: 'CDS: +15% / -0% | HFS: +28% / -0%',
    hydro_pressure: 'P = 2*S*t/D (S = 80% SMYS, max 16.0 MPa)',
  },
  BS3059_440: {
    spec_key: 'BS3059_440',
    spec_full: 'BS 3059 Part 2 Gr 440 (IBR)',
    steel_grade: 'CARBON STEEL (BS 3059 Gr.440)',
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
    cds_od_tolerance: '±0.10 mm to ±0.20 mm (or ±0.50%)',
    cds_wt_tolerance: '+15.0% / -0.0% of Minimum Wall',
    hfs_od_tolerance: '±0.75% (min ±0.40 mm)',
    hfs_wt_tolerance: '+28.0% / -0.0% of Minimum Wall',
    od_tolerance: 'CDS: ±0.15 mm | HFS: ±0.75%',
    wt_tolerance: 'CDS: +15% / -0% | HFS: +28% / -0%',
    hydro_pressure: 'P = 2*S*t/D (S = 80% SMYS, max 16.0 MPa)',
  },
  BS3059_620: {
    spec_key: 'BS3059_620',
    spec_full: 'BS 3059 Part 2 Gr 620 / 622 (IBR)',
    steel_grade: 'ALLOY STEEL (BS 3059 Gr.620/622)',
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
    cds_od_tolerance: '±0.10 mm to ±0.20 mm (or ±0.50%)',
    cds_wt_tolerance: '+15.0% / -0.0% of Minimum Wall',
    hfs_od_tolerance: '±0.75% (min ±0.40 mm)',
    hfs_wt_tolerance: '+28.0% / -0.0% of Minimum Wall',
    od_tolerance: 'CDS: ±0.15 mm | HFS: ±0.75%',
    wt_tolerance: 'CDS: +15% / -0% | HFS: +28% / -0%',
    hydro_pressure: 'P = 2*S*t/D (S = 80% SMYS, max 16.0 MPa)',
  },

  // DIN 2391 / EN 10305 (Precision Cold Drawn Tubes)
  DIN2391_ST52: {
    spec_key: 'DIN2391_ST52',
    spec_full: 'DIN 2391-1 / EN 10305-1 E355 (ST52)',
    steel_grade: 'PRECISION SEAMLESS TUBE (ST 52.4 / E355+N)',
    smys_mpa: 355,
    uts_mpa: 520,
    elongation_pct: 22,
    hardness: '88 HRB MAX',
    straightness: '1:1000',
    color_spec: 'BLUE + RED',
    rm_color: 'YELLOW + RED',
    whf_temp: '1200° C - 1240° C',
    induction_temp: '880° C - 920° C',
    sizing_outlet_temp: '900° C',
    ht_cycle: 'NORMALIZED (+N) / BK (+C)',
    ht_condition: 'NORMALIZED 900-930°C IN CONTROLLED ATMOSPHERE',
    ndt: 'EDDY CURRENT 100%',
    holding_time_sec: 5,
    coating: 'PHOSPHATED / OILED',
    end_condition: 'PLAIN END / DEBURRED',
    bundling: 'HEXAGONAL',
    end_cap: 'PLASTIC CAP',
    is_min_wall: false,
    cds_od_tolerance: '±0.08 mm (OD < 30 mm), ±0.15 mm (OD 30-50 mm)',
    cds_wt_tolerance: '±7.5% to ±10.0% of Nominal Wall',
    hfs_od_tolerance: '±1.0% (min ±0.5 mm)',
    hfs_wt_tolerance: '±12.5%',
    od_tolerance: 'CDS: ±0.08-0.15 mm | HFS: ±1.0%',
    wt_tolerance: 'CDS: ±7.5-10% | HFS: ±12.5%',
    hydro_pressure: 'P = 2*S*t/D (S = 80% SMYS, max 20.0 MPa)',
  },
  DIN2391_ST35: {
    spec_key: 'DIN2391_ST35',
    spec_full: 'DIN 2391-1 / EN 10305-1 E235 (ST35)',
    steel_grade: 'PRECISION SEAMLESS TUBE (ST 35 / E235+N)',
    smys_mpa: 235,
    uts_mpa: 360,
    elongation_pct: 25,
    hardness: '75 HRB MAX',
    straightness: '1:1000',
    color_spec: 'BLUE + WHITE',
    rm_color: 'BLUE + WHITE',
    whf_temp: '1200° C - 1240° C',
    induction_temp: '880° C - 920° C',
    sizing_outlet_temp: '900° C',
    ht_cycle: 'NORMALIZED (+N)',
    ht_condition: 'NORMALIZED 890-930°C IN PROTECTIVE ATMOSPHERE',
    ndt: 'EDDY CURRENT 100%',
    holding_time_sec: 5,
    coating: 'PHOSPHATED / OILED',
    end_condition: 'PLAIN END / DEBURRED',
    bundling: 'HEXAGONAL',
    end_cap: 'PLASTIC CAP',
    is_min_wall: false,
    cds_od_tolerance: '±0.08 mm to ±0.15 mm',
    cds_wt_tolerance: '±7.5% to ±10.0% of Nominal Wall',
    hfs_od_tolerance: '±1.0% (min ±0.5 mm)',
    hfs_wt_tolerance: '±12.5%',
    od_tolerance: 'CDS: ±0.08-0.15 mm | HFS: ±1.0%',
    wt_tolerance: 'CDS: ±7.5-10% | HFS: ±12.5%',
    hydro_pressure: 'P = 2*S*t/D (S = 80% SMYS, max 20.0 MPa)',
  },

  // IS 1239 (Indian Standard Seamless / Welded Tubes)
  IS_1239: {
    spec_key: 'IS_1239',
    spec_full: 'IS 1239 (Part 1) Mild Steel Tubes',
    steel_grade: 'MILD STEEL (YSt 210 / YSt 240)',
    smys_mpa: 210,
    uts_mpa: 330,
    elongation_pct: 20,
    hardness: '75 HRB MAX',
    straightness: '1:600',
    color_spec: 'BROWN / YELLOW (CLASS DEPENDENT)',
    rm_color: 'YELLOW + BROWN',
    whf_temp: '1200° C - 1240° C',
    induction_temp: '850° C - 890° C',
    sizing_outlet_temp: '880° C - 920° C',
    ht_cycle: 'NA / AS ROLLED',
    ht_condition: 'AS ROLLED',
    ndt: 'HYDRO 100% / ET',
    holding_time_sec: 5,
    coating: 'BLACK VARNISH / GALVANIZED',
    end_condition: 'THREADED & SOCKETED / BEVEL END',
    bundling: 'HEXAGONAL',
    end_cap: 'PLASTIC CAP',
    is_min_wall: false,
    cds_od_tolerance: '±0.20 mm',
    cds_wt_tolerance: '±10.0%',
    hfs_od_tolerance: '+0.4 mm / -0.8 mm (Light/Medium/Heavy)',
    hfs_wt_tolerance: '+12% / -10% of Nominal Wall',
    od_tolerance: 'CDS: ±0.20 mm | HFS: +0.4/-0.8 mm',
    wt_tolerance: 'CDS: ±10.0% | HFS: +12% / -10%',
    hydro_pressure: '5.0 MPa (Standard Hydro Test Pressure)',
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
