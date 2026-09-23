// lib/metallurgy/specEngine.ts
// Offline-first metallurgical knowledge base and tolerance calculation engine

export interface MechanicalProperties {
  yst_min_mpa: number | string;
  yst_max_mpa: number | string;
  uts_min_mpa: number | string;
  uts_max_mpa: number | string;
  elongation_min_pct: number | string;
  elongation_max_pct: number | string;
  hardness_max: string;
  straightness: string;
}

export interface DimensionalTolerances {
  od_min: number;
  od_max: number;
  od_tol_str: string;
  wt_min: number;
  wt_max: number;
  wt_tol_str: string;
  len_min?: number;
  len_max?: number;
  len_tol_str?: string;
  cutting_tol?: string;
}

export interface TestingParams {
  ndt: string;
  hydro_pressure_psi: number;
  holding_time_sec: number;
  calculation_basis: string;
}

export interface ThermalParams {
  whf_temp: string;
  induction_furnace_temp: string;
  sizing_mill_outlet_temp: string;
  ht_cycle: string;
  ht_condition: string;
}

export interface ProcessSpecResult {
  source: 'ai' | 'engine';
  reference_standard: string;
  steel_grade: string;
  material_spec: string;
  color_code_spec: string;
  rm_color_code: string;
  mechanical: MechanicalProperties;
  tolerances: DimensionalTolerances;
  testing: TestingParams;
  thermal: ThermalParams;
  coating: string;
  end_condition: string;
  bundling: string;
  end_cap: string;
  suggested_marking: string;
}

/**
 * Calculates Barlow's Hydrostatic Test Pressure (in PSI)
 * Standard formula: P = (2 * S * t) / D
 * Where:
 *   P = Hydrostatic test pressure (PSI)
 *   S = Allowable fiber stress (PSI), typically 60% of specified minimum yield strength (SMYS) for ASTM A530/A106
 *   t = Specified wall thickness (inches)
 *   D = Specified outside diameter (inches)
 *
 * For ASTM A106 Gr B: SMYS = 35,000 PSI (240 MPa) -> S = 0.60 * 35,000 = 21,000 PSI
 * Standard ASTM A530 caps standard hydro test pressure at 2500 PSI or 3000 PSI unless higher is ordered.
 */
export function calculateHydroPressurePsi(
  odMm: number,
  wtMm: number,
  smysMpa: number = 240,
  stressFactor: number = 0.60,
  maxCapPsi: number = 2500
): { pressurePsi: number; formulaNote: string } {
  if (!odMm || !wtMm || odMm <= 0 || wtMm <= 0) {
    return { pressurePsi: 0, formulaNote: 'No dimensions provided' };
  }

  // Convert mm to inches (1 inch = 25.4 mm)
  const odInches = odMm / 25.4;
  const wtInches = wtMm / 25.4;

  // Convert SMYS MPa to PSI (1 MPa = 145.038 PSI)
  const smysPsi = smysMpa * 145.0377;
  const fiberStressPsi = smysPsi * stressFactor;

  // Barlow's formula: P = (2 * S * t) / D
  const calculatedPsi = (2 * fiberStressPsi * wtInches) / odInches;

  // Standard ASTM A530 / A106 capping behavior: round to nearest 50 PSI and cap at standard limit
  const roundedCalculated = Math.round(calculatedPsi / 50) * 50;
  const finalPsi = Math.min(Math.max(roundedCalculated, 1000), maxCapPsi);

  return {
    pressurePsi: finalPsi,
    formulaNote: `Barlow formula: P = 2St/D (S = ${Math.round(fiberStressPsi)} PSI, capped at ${maxCapPsi} PSI per standard)`,
  };
}

/**
 * Calculates Dimensional Tolerances for OD and WT per ASTM / EN standards
 */
export function calculateStandardTolerances(
  odMm: number,
  wtMm: number,
  standard: string = 'ASTM A106',
  processRoute: string = 'HFS'
): DimensionalTolerances {
  const isCds = processRoute.toUpperCase().includes('CDS') || processRoute.toUpperCase().includes('COLD');
  const stdUpper = (standard || '').toUpperCase();
  const isMinWall =
    stdUpper.includes('210') ||
    stdUpper.includes('213') ||
    stdUpper.includes('192') ||
    stdUpper.includes('179') ||
    stdUpper.includes('MIN') ||
    stdUpper.includes('MW');

  const isPipeStandard =
    stdUpper.includes('106') ||
    stdUpper.includes('53') ||
    stdUpper.includes('335') ||
    stdUpper.includes('333') ||
    stdUpper.includes('API') ||
    stdUpper.includes('312');

  let odMin = odMm;
  let odMax = odMm;
  let odTolStr = '±0.8 mm';

  let wtMin = wtMm;
  let wtMax = wtMm;
  let wtTolStr = '+15% / -12.5%';

  if (isCds) {
    // Cold Drawn Seamless tolerances (ASTM A450 / ASME SA450 Table 1 / ASTM A1016)
    if (odMm < 25.4) {
      odMin = Number((odMm - 0.10).toFixed(2));
      odMax = Number((odMm + 0.10).toFixed(2));
      odTolStr = '±0.10 mm';
    } else if (odMm <= 38.1) {
      odMin = Number((odMm - 0.13).toFixed(2));
      odMax = Number((odMm + 0.13).toFixed(2));
      odTolStr = '±0.13 mm';
    } else if (odMm < 50.8) {
      odMin = Number((odMm - 0.15).toFixed(2));
      odMax = Number((odMm + 0.15).toFixed(2));
      odTolStr = '±0.15 mm';
    } else if (odMm <= 63.5) {
      // ASTM A450 Table 1: Size 50.8 to 63.5 mm OD is ±0.30 mm (or 63.20 - 63.80 mm for 63.50 mm)
      odMin = Number((odMm - 0.30).toFixed(2));
      odMax = Number((odMm + 0.30).toFixed(2));
      odTolStr = '±0.30 mm';
    } else if (odMm <= 76.2) {
      odMin = Number((odMm - 0.38).toFixed(2));
      odMax = Number((odMm + 0.38).toFixed(2));
      odTolStr = '±0.38 mm';
    } else {
      odMin = Number((odMm - 0.50).toFixed(2));
      odMax = Number((odMm + 0.50).toFixed(2));
      odTolStr = '±0.50 mm';
    }

    if (isMinWall) {
      // Minimum Wall per ASTM A450 / ASME SA450 Table 3:
      // For Cold-Drawn: Specified WT is MINIMUM, so minus tolerance is 0% (-0)
      // Plus tolerance is +20% (or +22% for severe gauges), 0% minus
      wtMin = Number(wtMm.toFixed(2)); // 0% minus tolerance
      wtMax = Number((wtMm * 1.20).toFixed(2)); // +20% max
      wtTolStr = '+20% / -0% (MIN WALL)';
    } else if (isPipeStandard) {
      // ASTM Pipe Standard (ASTM A106 / A530 Table 1):
      // Minimum wall thickness at any point shall not be more than 12.5% under nominal wall
      wtMin = Number((wtMm * 0.875).toFixed(2));
      wtMax = Number((wtMm * 1.15).toFixed(2));
      wtTolStr = '+15% / -12.5%';
    } else {
      // Nominal wall for CDS boiler / precision tubes: +15% / -10% (or ±10%)
      wtMin = Number((wtMm * 0.90).toFixed(2));
      wtMax = Number((wtMm * 1.15).toFixed(2));
      wtTolStr = '+15% / -10%';
    }
  } else {
    // Hot Finished Seamless (HFS) per ASTM A530 / ASTM A106 / ASTM A450
    if (odMm <= 48.3) {
      odMin = Number((odMm - 0.79).toFixed(2));
      odMax = Number((odMm + 0.40).toFixed(2));
      odTolStr = '+0.40 / -0.79 mm';
    } else if (odMm <= 114.3) {
      // e.g. 88.90mm OD: 88.10mm to 89.70mm (+0.80 / -0.80 mm)
      odMin = Number((odMm - 0.80).toFixed(2));
      odMax = Number((odMm + 0.80).toFixed(2));
      odTolStr = '±0.80 mm (+0.9% / -0.9%)';
    } else {
      odMin = Number((odMm - 0.80).toFixed(2));
      odMax = Number((odMm + 1.60).toFixed(2));
      odTolStr = '+1.60 / -0.80 mm';
    }

    if (isMinWall) {
      // Hot finished minimum wall per ASTM A450 Table 3: +28% / -0% (or +33% for thick/small OD)
      wtMin = Number(wtMm.toFixed(2)); // 0% minus tolerance
      wtMax = Number((wtMm * 1.28).toFixed(2)); // +28% max
      wtTolStr = '+28% / -0% (MIN WALL)';
    } else {
      // Nominal wall for HFS: +15% / -12.5% per ASTM A530
      wtMin = Number((wtMm * 0.875).toFixed(2)); // -12.5%
      wtMax = Number((wtMm * 1.15).toFixed(2));  // +15%
      wtTolStr = '+15% / -12.5%';
    }
  }

  return {
    od_min: odMin,
    od_max: odMax,
    od_tol_str: odTolStr,
    wt_min: wtMin,
    wt_max: wtMax,
    wt_tol_str: wtTolStr,
    cutting_tol: '+5/-0 MM',
  };
}

/**
 * Known metallurgical specifications reference library
 */
export const KNOWN_STANDARDS_LIBRARY: Record<string, any> = {
  'A106': {
    spec_full: 'ASTM A106 Gr B (IBR)',
    steel_grade: 'SAE 1018 / 15C8 RS-03',
    smys_mpa: 240,
    uts_mpa: 415,
    elongation_pct: 21,
    hardness: '79 HRB MAX',
    straightness: '1:1000',
    color_spec: 'WHITE',
    rm_color: 'YELLOW + WHITE',
    whf_temp: '1220° C (+/- 40° C)',
    induction_temp: '850 °C - 880° C',
    sizing_outlet_temp: '880° C TO 900° C',
    ht_cycle: 'NA',
    ht_condition: 'AS ROLLED / HFS',
    ndt: 'UT',
    holding_time_sec: 5,
    coating: 'BLACK VARNISH',
    end_condition: 'BEVEL END (30°-35°) ROOT FACE (0.8 - 2.4MM)',
    bundling: 'HEXAGONAL',
    end_cap: 'PLASTIC PROTECTOR',
  },
  'A53': {
    spec_full: 'ASTM A53 Gr B (Type S)',
    steel_grade: 'IS 2062 / SAE 1020',
    smys_mpa: 240,
    uts_mpa: 415,
    elongation_pct: 21,
    hardness: '82 HRB MAX',
    straightness: '1:1000',
    color_spec: 'BLUE',
    rm_color: 'BLUE + WHITE',
    whf_temp: '1200° C - 1240° C',
    induction_temp: '860 °C - 890° C',
    sizing_outlet_temp: '880° C TO 920° C',
    ht_cycle: 'NA',
    ht_condition: 'AS ROLLED',
    ndt: 'UT / ET',
    holding_time_sec: 5,
    coating: 'BLACK VARNISH',
    end_condition: 'BEVEL END (30°-35°)',
    bundling: 'HEXAGONAL',
    end_cap: 'PLASTIC PROTECTOR',
  },
  'A312_304L': {
    spec_full: 'ASTM A312 TP304L',
    steel_grade: 'AISI 304L / UNS S30403',
    smys_mpa: 170,
    uts_mpa: 485,
    elongation_pct: 35,
    hardness: '90 HRB MAX',
    straightness: '1:1000',
    color_spec: 'YELLOW',
    rm_color: 'YELLOW',
    whf_temp: '1180° C - 1220° C',
    induction_temp: '1040 °C - 1080° C',
    sizing_outlet_temp: '1050° C',
    ht_cycle: 'SOLUTION ANNEALING',
    ht_condition: '1040°C - 1100°C WATER QUENCH',
    ndt: 'ECT + UT',
    holding_time_sec: 5,
    coating: 'PASSIVATED / PICKLED',
    end_condition: 'PLAIN END / BEVEL END',
    bundling: 'HEXAGONAL',
    end_cap: 'PLASTIC CAP',
  },
  'A312_316L': {
    spec_full: 'ASTM A312 TP316L',
    steel_grade: 'AISI 316L / UNS S31603',
    smys_mpa: 170,
    uts_mpa: 485,
    elongation_pct: 30,
    hardness: '90 HRB MAX',
    straightness: '1:1000',
    color_spec: 'GREEN',
    rm_color: 'GREEN + WHITE',
    whf_temp: '1180° C - 1220° C',
    induction_temp: '1050 °C - 1100° C',
    sizing_outlet_temp: '1050° C',
    ht_cycle: 'SOLUTION ANNEALING',
    ht_condition: '1050°C - 1120°C RAPID WATER QUENCH',
    ndt: 'ECT + UT',
    holding_time_sec: 5,
    coating: 'PASSIVATED / PICKLED',
    end_condition: 'PLAIN END / BEVEL END',
    bundling: 'HEXAGONAL',
    end_cap: 'PLASTIC CAP',
  },
  'A213_T11': {
    spec_full: 'ASTM A213 T11 (IBR)',
    steel_grade: '1.25Cr - 0.5Mo Alloy',
    smys_mpa: 205,
    uts_mpa: 415,
    elongation_pct: 30,
    hardness: '85 HRB MAX',
    straightness: '1:1000',
    color_spec: 'ORANGE',
    rm_color: 'ORANGE + WHITE',
    whf_temp: '1200° C - 1250° C',
    induction_temp: '900 °C - 950° C',
    sizing_outlet_temp: '900° C',
    ht_cycle: 'ISOTHERMAL ANNEALING / N&T',
    ht_condition: 'NORMALIZE 900-940°C, TEMPER 650-700°C',
    ndt: 'UT + MT',
    holding_time_sec: 5,
    coating: 'RUST PREVENTIVE OIL',
    end_condition: 'BEVEL END (30°-35°)',
    bundling: 'HEXAGONAL',
    end_cap: 'PLASTIC CAP',
  },
  'A335_P22': {
    spec_full: 'ASTM A335 P22 (IBR)',
    steel_grade: '2.25Cr - 1Mo Alloy',
    smys_mpa: 205,
    uts_mpa: 415,
    elongation_pct: 30,
    hardness: '85 HRB MAX',
    straightness: '1:1000',
    color_spec: 'RED + WHITE',
    rm_color: 'RED + WHITE',
    whf_temp: '1220° C - 1260° C',
    induction_temp: '920 °C - 960° C',
    sizing_outlet_temp: '920° C',
    ht_cycle: 'NORMALIZED & TEMPERED',
    ht_condition: 'NORMALIZE 920-960°C, TEMPER 680-720°C',
    ndt: 'UT + MT',
    holding_time_sec: 5,
    coating: 'BLACK VARNISH / RUST OIL',
    end_condition: 'BEVEL END (30°-35°)',
    bundling: 'HEXAGONAL',
    end_cap: 'PLASTIC CAP',
  },
  'A210': {
    spec_full: 'ASME SA210 Gr A-1 (IBR) / ASTM A210 Gr A-1',
    steel_grade: 'MEDIUM-CARBON STEEL (SA210 Gr.A1)',
    smys_mpa: 255, // 37 ksi = 255 MPa
    uts_mpa: 415,  // 60 ksi = 415 MPa
    elongation_pct: 30, // 30% min for 2-inch gauge
    hardness: '79 HRB MAX',
    straightness: '1:1000',
    color_spec: 'WHITE + BLUE',
    rm_color: 'YELLOW + BLUE',
    whf_temp: '1200° C - 1240° C',
    induction_temp: '860 °C - 890° C',
    sizing_outlet_temp: '880° C TO 920° C',
    ht_cycle: 'SUB-CRITICAL ANNEALED / NORMALIZED',
    ht_condition: 'SUB-CRITICAL ANNEAL (650°C - 700°C) / NORMALIZED',
    ndt: 'UT / ET',
    holding_time_sec: 5,
    coating: 'BLACK VARNISH / RUST OIL',
    end_condition: 'PLAIN END / SQUARE CUT',
    bundling: 'HEXAGONAL',
    end_cap: 'PLASTIC PROTECTOR',
  },
  'A210_C': {
    spec_full: 'ASME SA210 Gr C (IBR) / ASTM A210 Gr C',
    steel_grade: 'MEDIUM-CARBON STEEL (SA210 Gr.C)',
    smys_mpa: 275, // 40 ksi = 275 MPa
    uts_mpa: 485,  // 70 ksi = 485 MPa
    elongation_pct: 30,
    hardness: '89 HRB MAX',
    straightness: '1:1000',
    color_spec: 'WHITE + RED',
    rm_color: 'YELLOW + RED',
    whf_temp: '1200° C - 1240° C',
    induction_temp: '860 °C - 890° C',
    sizing_outlet_temp: '880° C TO 920° C',
    ht_cycle: 'SUB-CRITICAL ANNEALED / NORMALIZED',
    ht_condition: 'SUB-CRITICAL ANNEAL (650°C - 700°C) / NORMALIZED',
    ndt: 'UT / ET',
    holding_time_sec: 5,
    coating: 'BLACK VARNISH / RUST OIL',
    end_condition: 'PLAIN END / SQUARE CUT',
    bundling: 'HEXAGONAL',
    end_cap: 'PLASTIC PROTECTOR',
  },
  'BS3059_320': {
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
    induction_temp: '860 °C - 890° C',
    sizing_outlet_temp: '880° C TO 920° C',
    ht_cycle: 'NORMALIZED / SUB-CRITICAL ANNEALED',
    ht_condition: 'NORMALIZED 880-920°C / SUB-CRITICAL ANNEAL 650-700°C',
    ndt: 'UT / ET',
    holding_time_sec: 5,
    coating: 'BLACK VARNISH / RUST OIL',
    end_condition: 'PLAIN END / SQUARE CUT',
    bundling: 'HEXAGONAL',
    end_cap: 'PLASTIC PROTECTOR',
  },
  'BS3059_360': {
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
    induction_temp: '860 °C - 890° C',
    sizing_outlet_temp: '880° C TO 920° C',
    ht_cycle: 'NORMALIZED / SUB-CRITICAL ANNEALED',
    ht_condition: 'NORMALIZED 880-920°C / SUB-CRITICAL ANNEAL 650-700°C',
    ndt: 'UT / ET',
    holding_time_sec: 5,
    coating: 'BLACK VARNISH / RUST OIL',
    end_condition: 'PLAIN END / SQUARE CUT',
    bundling: 'HEXAGONAL',
    end_cap: 'PLASTIC PROTECTOR',
  },
  'BS3059_440': {
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
    induction_temp: '860 °C - 890° C',
    sizing_outlet_temp: '880° C TO 920° C',
    ht_cycle: 'NORMALIZED / SUB-CRITICAL ANNEALED',
    ht_condition: 'NORMALIZED 880-920°C / SUB-CRITICAL ANNEAL 650-700°C',
    ndt: 'UT / ET',
    holding_time_sec: 5,
    coating: 'BLACK VARNISH / RUST OIL',
    end_condition: 'PLAIN END / SQUARE CUT',
    bundling: 'HEXAGONAL',
    end_cap: 'PLASTIC PROTECTOR',
  },
  'BS3059_620': {
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
    induction_temp: '900 °C - 950° C',
    sizing_outlet_temp: '900° C',
    ht_cycle: 'NORMALIZED & TEMPERED',
    ht_condition: 'NORMALIZE 930-970°C, TEMPER 650-720°C',
    ndt: 'UT + MT',
    holding_time_sec: 5,
    coating: 'BLACK VARNISH / RUST OIL',
    end_condition: 'PLAIN END / SQUARE CUT',
    bundling: 'HEXAGONAL',
    end_cap: 'PLASTIC PROTECTOR',
  },
  'SA106_C': {
    spec_full: 'ASME SA106 Gr C (IBR) / ASTM A106 Gr C',
    steel_grade: 'High-Strength Carbon Steel (SA106 Gr.C)',
    smys_mpa: 275,
    uts_mpa: 485,
    elongation_pct: 20,
    hardness: '85 HRB MAX',
    straightness: '1:1000',
    color_spec: 'WHITE + BROWN',
    rm_color: 'YELLOW + BROWN',
    whf_temp: '1220° C (+/- 40° C)',
    induction_temp: '860 °C - 890° C',
    sizing_outlet_temp: '880° C TO 920° C',
    ht_cycle: 'NORMALIZED',
    ht_condition: 'NORMALIZE 900°C - 940°C AIR COOL',
    ndt: 'UT',
    holding_time_sec: 5,
    coating: 'BLACK VARNISH',
    end_condition: 'BEVEL END (30°-35°)',
    bundling: 'HEXAGONAL',
    end_cap: 'PLASTIC PROTECTOR',
  },
  'SA192': {
    spec_full: 'ASME SA 192 (IBR) / ASTM A192',
    steel_grade: 'Seamless Carbon Steel Boiler Tubes (SA192)',
    smys_mpa: 180,
    uts_mpa: 325,
    elongation_pct: 35,
    hardness: '77 HRB MAX',
    straightness: '1:1000',
    color_spec: 'YELLOW + BLUE',
    rm_color: 'YELLOW + BLUE',
    whf_temp: '1200° C - 1240° C',
    induction_temp: '860 °C - 890° C',
    sizing_outlet_temp: '880° C TO 920° C',
    ht_cycle: 'SUB-CRITICAL ANNEALED / NORMALIZED',
    ht_condition: 'SUB-CRITICAL ANNEAL (650°C - 700°C) AFTER COLD FINISHING',
    ndt: 'UT / ET',
    holding_time_sec: 5,
    coating: 'RUST PREVENTIVE OIL / CLEAR VARNISH',
    end_condition: 'PLAIN END / SQUARE CUT',
    bundling: 'HEXAGONAL',
    end_cap: 'PLASTIC PROTECTOR',
  },
  'SA179': {
    spec_full: 'ASME SA 179 (IBR) / ASTM A179',
    steel_grade: 'Seamless Cold-Drawn Low-Carbon Steel (SA179)',
    smys_mpa: 180,
    uts_mpa: 325,
    elongation_pct: 35,
    hardness: '72 HRB MAX',
    straightness: '1:1000',
    color_spec: 'WHITE + BLACK',
    rm_color: 'YELLOW + BLACK',
    whf_temp: '1200° C - 1240° C',
    induction_temp: '860 °C - 890° C',
    sizing_outlet_temp: '880° C TO 920° C',
    ht_cycle: 'SUB-CRITICAL ANNEALED / NORMALIZED',
    ht_condition: 'HEAT TREATED AFTER FINAL COLD DRAW PASS AT 650°C MIN',
    ndt: 'UT / ET',
    holding_time_sec: 5,
    coating: 'RUST PREVENTIVE OIL',
    end_condition: 'PLAIN END / SQUARE CUT',
    bundling: 'HEXAGONAL',
    end_cap: 'PLASTIC PROTECTOR',
  },
  'A213_T12': {
    spec_full: 'ASME SA213 GR.T12 (IBR) / ASTM A213 T12',
    steel_grade: '1Cr - 0.5Mo Alloy Steel (SA213 Gr.T12)',
    smys_mpa: 220,
    uts_mpa: 415,
    elongation_pct: 30,
    hardness: '85 HRB MAX',
    straightness: '1:1000',
    color_spec: 'ORANGE + GREEN',
    rm_color: 'ORANGE + GREEN',
    whf_temp: '1200° C - 1250° C',
    induction_temp: '900 °C - 950° C',
    sizing_outlet_temp: '900° C',
    ht_cycle: 'NORMALIZED & TEMPERED',
    ht_condition: 'NORMALIZE 900-940°C, TEMPER 650-710°C',
    ndt: 'UT + MT',
    holding_time_sec: 5,
    coating: 'RUST PREVENTIVE OIL',
    end_condition: 'PLAIN END / BEVEL END (30°-35°)',
    bundling: 'HEXAGONAL',
    end_cap: 'PLASTIC CAP',
  },
  'A213_T22': {
    spec_full: 'ASME SA213 GR.T22 (IBR) / ASTM A213 T22',
    steel_grade: '2.25Cr - 1Mo Alloy Steel (SA213 Gr.T22)',
    smys_mpa: 205,
    uts_mpa: 415,
    elongation_pct: 30,
    hardness: '85 HRB MAX',
    straightness: '1:1000',
    color_spec: 'RED + WHITE',
    rm_color: 'RED + WHITE',
    whf_temp: '1220° C - 1260° C',
    induction_temp: '920 °C - 960° C',
    sizing_outlet_temp: '920° C',
    ht_cycle: 'NORMALIZED & TEMPERED',
    ht_condition: 'NORMALIZE 920-960°C, TEMPER 680-720°C',
    ndt: 'UT + MT',
    holding_time_sec: 5,
    coating: 'BLACK VARNISH / RUST OIL',
    end_condition: 'PLAIN END / BEVEL END (30°-35°)',
    bundling: 'HEXAGONAL',
    end_cap: 'PLASTIC CAP',
  },
  'A335_P11': {
    spec_full: 'ASME A335 GR P11 (IBR) / ASME SA335 GR P11',
    steel_grade: '1.25Cr - 0.5Mo Alloy Steel (P11 Pipe)',
    smys_mpa: 205,
    uts_mpa: 415,
    elongation_pct: 30,
    hardness: '85 HRB MAX',
    straightness: '1:1000',
    color_spec: 'ORANGE',
    rm_color: 'ORANGE + WHITE',
    whf_temp: '1200° C - 1250° C',
    induction_temp: '900 °C - 950° C',
    sizing_outlet_temp: '900° C',
    ht_cycle: 'NORMALIZED & TEMPERED',
    ht_condition: 'NORMALIZE 900-940°C, TEMPER 650-700°C',
    ndt: 'UT + MT',
    holding_time_sec: 5,
    coating: 'BLACK VARNISH / RUST OIL',
    end_condition: 'BEVEL END (30°-35°)',
    bundling: 'HEXAGONAL',
    end_cap: 'PLASTIC CAP',
  },
  'ST35_8': {
    spec_full: 'DIN 17175 St 35.8 (IBR) / ST 35.8',
    steel_grade: 'Heat-Resistant Carbon Steel (St 35.8 III)',
    smys_mpa: 235,
    uts_mpa: 420,
    elongation_pct: 25,
    hardness: '78 HRB MAX',
    straightness: '1:1000',
    color_spec: 'WHITE + BROWN',
    rm_color: 'YELLOW + BROWN',
    whf_temp: '1200° C - 1240° C',
    induction_temp: '860 °C - 890° C',
    sizing_outlet_temp: '880° C TO 920° C',
    ht_cycle: 'NORMALIZED',
    ht_condition: 'NORMALIZE 890°C - 930°C AIR COOL',
    ndt: 'UT / ET',
    holding_time_sec: 5,
    coating: 'BLACK VARNISH / RUST OIL',
    end_condition: 'PLAIN END / SQUARE CUT',
    bundling: 'HEXAGONAL',
    end_cap: 'PLASTIC PROTECTOR',
  },
  'DIN2391_ST52': {
    spec_full: 'DIN 2391 ST 52 / EN 10305-1 E355',
    steel_grade: 'High-Yield Precision Carbon Steel (St 52 / E355)',
    smys_mpa: 355,
    uts_mpa: 520,
    elongation_pct: 22,
    hardness: '85 HRB MAX',
    straightness: '1:1000',
    color_spec: 'BLUE + WHITE',
    rm_color: 'BLUE + WHITE',
    whf_temp: '1200° C - 1240° C',
    induction_temp: '880 °C - 920° C',
    sizing_outlet_temp: '890° C TO 930° C',
    ht_cycle: 'STRESS RELIEVED / NORMALIZED (+SR / +N)',
    ht_condition: 'STRESS RELIEF 550-600°C OR NORMALIZE 890-930°C',
    ndt: 'UT / ET',
    holding_time_sec: 5,
    coating: 'LIGHT RUST PREVENTIVE OIL',
    end_condition: 'PLAIN END / SQUARE CUT DEBURRED',
    bundling: 'HEXAGONAL',
    end_cap: 'PLASTIC PROTECTOR',
  },
  'MS_900DP': {
    spec_full: 'MS 900DP Dual Phase High Strength Tubing',
    steel_grade: 'Dual Phase High-Strength Steel (DP 900)',
    smys_mpa: 650,
    uts_mpa: 900,
    elongation_pct: 14,
    hardness: '95 HRB MAX',
    straightness: '1:1000',
    color_spec: 'VIOLET',
    rm_color: 'VIOLET + WHITE',
    whf_temp: '1200° C - 1250° C',
    induction_temp: '900 °C - 950° C',
    sizing_outlet_temp: '920° C',
    ht_cycle: 'CONTROLLED INTERCRITICAL ANNEAL + QUENCH',
    ht_condition: 'INTERCRITICAL DUAL-PHASE HEAT TREATMENT (780-820°C WATER QUENCH)',
    ndt: 'UT + FLUX LEAKAGE',
    holding_time_sec: 5,
    coating: 'RUST PREVENTIVE OIL',
    end_condition: 'PLAIN END / SQUARE CUT',
    bundling: 'HEXAGONAL',
    end_cap: 'PLASTIC PROTECTOR',
  },
  'SAE_1010': {
    spec_full: 'SAE 1010 Mechanical Tubing (ASTM A519)',
    steel_grade: 'Low Carbon Mechanical Steel (SAE 1010)',
    smys_mpa: 205,
    uts_mpa: 365,
    elongation_pct: 20,
    hardness: '70 HRB MAX',
    straightness: '1:1000',
    color_spec: 'GREEN + WHITE',
    rm_color: 'GREEN + WHITE',
    whf_temp: '1180° C - 1220° C',
    induction_temp: '850 °C - 880° C',
    sizing_outlet_temp: '870° C TO 900° C',
    ht_cycle: 'ANNEALED / STRESS RELIEVED (+A / +SR)',
    ht_condition: 'SUB-CRITICAL ANNEAL 620-680°C',
    ndt: 'UT / ET',
    holding_time_sec: 5,
    coating: 'LIGHT RUST PREVENTIVE OIL',
    end_condition: 'PLAIN END / SQUARE CUT',
    bundling: 'HEXAGONAL',
    end_cap: 'PLASTIC PROTECTOR',
  },
};

/**
 * Evaluates Process Sheet specs using the deterministic metallurgical engine
 */
export function getDeterministicProcessSpec(params: {
  grade?: string | null;
  specification?: string | null;
  size_od?: number | null;
  size_wt?: number | null;
  route_code?: string | null;
  customer_name?: string | null;
  wo_no?: string | null;
  po_no?: string | null;
  heat_no?: string | null;
}): ProcessSpecResult {
  const specText = (params.specification || '').toUpperCase();
  const gradeText = (params.grade || '').toUpperCase();
  const od = Number(params.size_od) || 88.9;
  const wt = Number(params.size_wt) || 5.49;
  const route = (params.route_code || 'HFS').toUpperCase();

  // Find best library match
  let matchedLib = KNOWN_STANDARDS_LIBRARY['A106']; // default
  let refStd = 'ASTM A106 Gr B';

  if (specText.includes('3059') || gradeText.includes('3059')) {
    if (specText.includes('620') || specText.includes('622') || gradeText.includes('620') || gradeText.includes('622')) {
      matchedLib = KNOWN_STANDARDS_LIBRARY['BS3059_620'];
      refStd = 'BS 3059 Part 2 Gr 620/622 (IBR)';
    } else if (specText.includes('440') || gradeText.includes('440')) {
      matchedLib = KNOWN_STANDARDS_LIBRARY['BS3059_440'];
      refStd = 'BS 3059 Part 2 Gr 440 (IBR)';
    } else if (specText.includes('320') || gradeText.includes('320')) {
      matchedLib = KNOWN_STANDARDS_LIBRARY['BS3059_320'];
      refStd = 'BS 3059 Part 1 Gr 320 (IBR)';
    } else {
      // Default BS 3059 Part 2 Gr 360
      matchedLib = KNOWN_STANDARDS_LIBRARY['BS3059_360'];
      refStd = 'BS 3059 Part 2 Gr 360 (IBR)';
    }
  } else if (specText.includes('192') || gradeText.includes('192')) {
    matchedLib = KNOWN_STANDARDS_LIBRARY['SA192'];
    refStd = 'ASME SA 192 (IBR)';
  } else if (specText.includes('179') || gradeText.includes('179')) {
    matchedLib = KNOWN_STANDARDS_LIBRARY['SA179'];
    refStd = 'ASME SA 179 (IBR)';
  } else if (specText.includes('210') || gradeText.includes('210')) {
    if (specText.includes('GR C') || specText.includes('GR.C') || gradeText.includes('GR C') || gradeText.includes('GR.C')) {
      matchedLib = KNOWN_STANDARDS_LIBRARY['A210_C'];
      refStd = 'ASME SA210 Gr C (IBR)';
    } else {
      matchedLib = KNOWN_STANDARDS_LIBRARY['A210'];
      refStd = 'ASME SA210 Gr A-1 (IBR)';
    }
  } else if (specText.includes('312') || gradeText.includes('316')) {
    matchedLib = KNOWN_STANDARDS_LIBRARY['A312_316L'];
    refStd = 'ASTM A312 TP316L';
  } else if (specText.includes('304') || gradeText.includes('304')) {
    matchedLib = KNOWN_STANDARDS_LIBRARY['A312_304L'];
    refStd = 'ASTM A312 TP304L';
  } else if (specText.includes('213') || specText.includes('T11') || specText.includes('T12') || specText.includes('T22') || gradeText.includes('T11') || gradeText.includes('T12') || gradeText.includes('T22')) {
    if (specText.includes('T22') || gradeText.includes('T22')) {
      matchedLib = KNOWN_STANDARDS_LIBRARY['A213_T22'];
      refStd = 'ASME SA213 GR.T22 (IBR)';
    } else if (specText.includes('T12') || gradeText.includes('T12')) {
      matchedLib = KNOWN_STANDARDS_LIBRARY['A213_T12'];
      refStd = 'ASME SA213 GR.T12 (IBR)';
    } else {
      matchedLib = KNOWN_STANDARDS_LIBRARY['A213_T11'];
      refStd = 'ASME SA213 Gr.T11 (IBR)';
    }
  } else if (specText.includes('335') || specText.includes('P22') || specText.includes('P11') || gradeText.includes('P22') || gradeText.includes('P11')) {
    if (specText.includes('P11') || gradeText.includes('P11')) {
      matchedLib = KNOWN_STANDARDS_LIBRARY['A335_P11'];
      refStd = 'ASME A335 GR P11 (IBR)';
    } else {
      matchedLib = KNOWN_STANDARDS_LIBRARY['A335_P22'];
      refStd = 'ASME SA335 GR P22 (IBR)';
    }
  } else if (specText.includes('35.8') || gradeText.includes('35.8') || specText.includes('ST 35') || gradeText.includes('ST 35')) {
    matchedLib = KNOWN_STANDARDS_LIBRARY['ST35_8'];
    refStd = 'DIN 17175 St 35.8 (IBR)';
  } else if (specText.includes('2391') || gradeText.includes('2391') || specText.includes('ST 52') || gradeText.includes('ST 52') || specText.includes('ST52') || gradeText.includes('ST52')) {
    matchedLib = KNOWN_STANDARDS_LIBRARY['DIN2391_ST52'];
    refStd = 'DIN 2391 ST 52';
  } else if (specText.includes('900DP') || gradeText.includes('900DP') || specText.includes('MS 900') || gradeText.includes('MS 900')) {
    matchedLib = KNOWN_STANDARDS_LIBRARY['MS_900DP'];
    refStd = 'MS 900DP';
  } else if (specText.includes('1010') || gradeText.includes('1010')) {
    matchedLib = KNOWN_STANDARDS_LIBRARY['SAE_1010'];
    refStd = 'SAE 1010';
  } else if (specText.includes('A53') || gradeText.includes('A53')) {
    matchedLib = KNOWN_STANDARDS_LIBRARY['A53'];
    refStd = 'ASTM A53 Gr B';
  } else if (specText.includes('106') || gradeText.includes('106') || gradeText.includes('1018')) {
    if (specText.includes('GR C') || specText.includes('GR.C') || gradeText.includes('GR C') || gradeText.includes('GR.C')) {
      matchedLib = KNOWN_STANDARDS_LIBRARY['SA106_C'];
      refStd = 'ASME SA106 Gr C (IBR)';
    } else {
      matchedLib = KNOWN_STANDARDS_LIBRARY['A106'];
      refStd = 'ASTM A106 Gr B (IBR)';
    }
  }

  // Calculate Hydro Pressure PSI
  const hydroRes = calculateHydroPressurePsi(od, wt, matchedLib.smys_mpa, 0.60, 2500);

  // Calculate Dimensional Tolerances
  const tolerances = calculateStandardTolerances(od, wt, refStd, route);

  // Generate Suggested Marking String following Rashmi standard
  const custWoNo = params.wo_no || '';
  const custPoNo = params.po_no || '';
  const heatVal = params.heat_no || '';

  const suggestedMarking = `RASHMI SMLS / LOGO / ${route} / ${params.specification || matchedLib.spec_full} / NACE MR0103 / MR0175 / OD ${od.toFixed(2)} MM X WT ${wt.toFixed(2)} MM / HYDRO TESTED ${hydroRes.pressurePsi} PSI / NDE${custPoNo ? ` / PO NO -${custPoNo}` : ''}${custWoNo ? ` / WO NO -${custWoNo}` : ''}${heatVal ? ` / H.NO - ${heatVal}` : ''} + LENGTH + BUNDLE NO`;

  return {
    source: 'engine',
    reference_standard: refStd,
    steel_grade: params.grade || matchedLib.steel_grade,
    material_spec: params.specification || matchedLib.spec_full,
    color_code_spec: matchedLib.color_spec,
    rm_color_code: matchedLib.rm_color,
    mechanical: {
      yst_min_mpa: matchedLib.smys_mpa,
      yst_max_mpa: 'NOT SPECIFIED',
      uts_min_mpa: matchedLib.uts_mpa,
      uts_max_mpa: 'NOT SPECIFIED',
      elongation_min_pct: matchedLib.elongation_pct,
      elongation_max_pct: 'NOT SPECIFIED',
      hardness_max: matchedLib.hardness,
      straightness: matchedLib.straightness,
    },
    tolerances,
    testing: {
      ndt: matchedLib.ndt,
      hydro_pressure_psi: hydroRes.pressurePsi,
      holding_time_sec: matchedLib.holding_time_sec,
      calculation_basis: hydroRes.formulaNote,
    },
    thermal: {
      whf_temp: matchedLib.whf_temp,
      induction_furnace_temp: matchedLib.induction_temp,
      sizing_mill_outlet_temp: matchedLib.sizing_outlet_temp,
      ht_cycle: matchedLib.ht_cycle,
      ht_condition: matchedLib.ht_condition,
    },
    coating: matchedLib.coating,
    end_condition: matchedLib.end_condition,
    bundling: matchedLib.bundling,
    end_cap: matchedLib.end_cap,
    suggested_marking: suggestedMarking,
  };
}
