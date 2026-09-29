// lib/metallurgy/processSheetSpecHelper.ts
// Offline-first metallurgical auto-population and parameter generation for Process Sheet (Format F-PROD-11)

import { calculateHydroPressurePsi, calculateStandardTolerances } from './specEngine';
import type { SpecMasterRecord } from '../specMasterDefaults';

export interface ProcessSheetFormData {
  sheetNo: string;
  revNo: string;
  orderType: string;
  routeType: string;
  sheetDate: string;

  // Order Details
  customer: string;
  destination: string;
  poNo: string;
  poDate: string;
  woNo: string;
  woDate: string;
  orderQty: string;
  deliveryDate: string;
  materialCode: string;
  heatNo: string;
  steelGrade: string;
  materialSpec: string;
  inspection: string;

  // Finished Pipe Dimensions
  custOd: string;
  custWt: string;
  processWt: string;
  isMinWall: boolean;
  finalOrderLen1: string;
  finalOrderLen2: string;
  finalLength: string;
  finalLenTol: string;
  finalPipeWeight: string;
  bundleQtyPcs: string;
  bundleWeightMt: string;

  // Sizing / Rolling Mill
  motherHollowOd: string;
  motherHollowWt: string;
  rollingWt: string;
  motherHollowKgMtr: string;
  smLength: string;
  hfsFinalLength: string;

  // Piercer Mill
  piercerOd: string;
  piercerWt: string;
  piercerShellLen: string;
  shellWeight: string;

  // Billet
  billetDia: string;
  billetSectWt: string;
  billetLength: string;
  totalWeightMt: string;

  // Production Quantities
  multiple: string;
  planQtyMtrs: string;
  planQtyNos: string;
  planQtyMt: string;

  // Tolerances
  finalTolOdMin: string;
  finalTolOdMax: string;
  finalTolWtMin: string;
  finalTolWtMax: string;

  // Thermal Parameters
  whfTemp: string;
  inductionTemp: string;
  sizingOutletTemp: string;
  htCycle: string;
  htCondition: string;
  holdingTime: string;

  // Mechanical Properties
  ystMin: string;
  ystMax: string;
  utsMin: string;
  utsMax: string;
  elongationMin: string;
  hardness: string;
  straightness: string;

  // Chemical Composition
  cMin: string;
  cMax: string;
  mnMin: string;
  mnMax: string;
  pMax: string;
  sMax: string;
  siMin: string;
  siMax: string;
  crMax: string;
  moMax: string;
  niMax: string;
  cuMax: string;
  vMax: string;
  nbMax: string;
  ceMax: string;

  // Testing & Finishing
  ndt: string;
  hydroPressurePsi: string;
  coating: string;
  endCondition: string;
  bundling: string;
  endCap: string;
  pipeColorCode: string;
  rmColorCode: string;

  // Markings
  markingSingle: string;
  markingTriple: string;
}

export function buildMarkingString(
  type: 'single' | 'triple',
  params: {
    routeCode?: string | null;
    specification?: string | null;
    grade?: string | null;
    sizeOd?: number | string | null;
    sizeWt?: number | string | null;
    hydroPsi?: string | null;
    woNo?: string | null;
    poNo?: string | null;
  }
): string {
  const rCode = (params.routeCode || 'HFS').toUpperCase().includes('CDS') ? 'CDS' : 'HFS';
  const odVal = Number(params.sizeOd || 0);
  const wtVal = Number(params.sizeWt || 0);
  const odStr = Number.isFinite(odVal) && odVal > 0 ? odVal.toFixed(2) : '';
  const wtStr = Number.isFinite(wtVal) && wtVal > 0 ? wtVal.toFixed(2) : '';
  const hydroStr = params.hydroPsi
    ? (params.hydroPsi.includes('PSI') ? params.hydroPsi : `${params.hydroPsi} PSI`)
    : '';

  const sizePart = odStr && wtStr ? `OD ${odStr} MM X WT ${wtStr} MM` : '';
  const hydroPart = hydroStr ? `HYDRO TESTED ${hydroStr}` : 'HYDRO TESTED';

  if (type === 'triple') {
    return `(IBR) RASHMI SMLS / LOGO / ${rCode} /ASTM A106 Gr B /ASME SA106 GR B/ASTM A53 GR B/ API 5L GR B/ NACE MR0103/MR0175${sizePart ? ` / ${sizePart}` : ''} / ${hydroPart} / NDE /  LENGTH......MM + H .NO____  + BUNDLE NO..............`;
  }

  const specGrade = params.specification || params.grade || '';
  return `(IBR) RASHMI SMLS / LOGO / ${rCode}${specGrade ? ` / ${specGrade}` : ''}${sizePart ? ` / ${sizePart}` : ''} / ${hydroPart} / NDE /  LENGTH......MM + H .NO____  + BUNDLE NO..............`;
}

export function findMatchingSpecMaster(
  fullSpecGrade: string,
  specMasterList: SpecMasterRecord[]
): SpecMasterRecord | undefined {
  if (!fullSpecGrade) return undefined;
  const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const cleanTarget = norm(fullSpecGrade);

  return specMasterList.find((r) => {
    const sp = (r.spec_full || '').toUpperCase();
    const sk = (r.spec_key || '').toUpperCase();
    const sg = (r.steel_grade || '').toUpperCase();
    const target = fullSpecGrade.toUpperCase();

    if (target.includes(sk) || target.includes(sp) || sp.includes(target)) return true;
    if (sg && (target.includes(sg) || sg.includes(target))) return true;

    const nSp = norm(sp);
    const nSk = norm(sk);
    const nSg = norm(sg);
    return (
      cleanTarget.includes(nSk) ||
      cleanTarget.includes(nSp) ||
      nSp.includes(cleanTarget) ||
      (Boolean(nSg) && (cleanTarget.includes(nSg) || nSg.includes(cleanTarget)))
    );
  });
}

const DEFAULT_CHEMISTRY_BY_SPEC: Record<string, {
  cMin?: string; cMax?: string;
  mnMin?: string; mnMax?: string;
  pMax?: string; sMax?: string;
  siMin?: string; siMax?: string;
  crMax?: string; moMax?: string;
  niMax?: string; cuMax?: string;
  vMax?: string; nbMax?: string;
  ceMax?: string;
}> = {
  A106: { cMax: '0.30', mnMin: '0.29', mnMax: '1.06', pMax: '0.035', sMax: '0.035', siMin: '0.10', crMax: '0.40', moMax: '0.15', niMax: '0.40', cuMax: '0.40', vMax: '0.08', ceMax: '0.50' },
  A53: { cMax: '0.30', mnMin: '0.29', mnMax: '1.20', pMax: '0.050', sMax: '0.045', siMin: '0.10', crMax: '0.40', moMax: '0.15', niMax: '0.40', cuMax: '0.40', vMax: '0.08', ceMax: '0.50' },
  A210: { cMax: '0.27', mnMax: '0.93', pMax: '0.035', sMax: '0.035', siMin: '0.10' },
  A179: { cMin: '0.06', cMax: '0.18', mnMin: '0.27', mnMax: '0.63', pMax: '0.035', sMax: '0.035' },
  A192: { cMin: '0.06', cMax: '0.18', mnMin: '0.27', mnMax: '0.63', pMax: '0.035', sMax: '0.035', siMin: '0.25' },
  A335_P11: { cMin: '0.05', cMax: '0.15', mnMin: '0.30', mnMax: '0.60', pMax: '0.025', sMax: '0.025', siMin: '0.50', siMax: '1.00', crMax: '1.50', moMax: '0.65' },
  A335_P22: { cMin: '0.05', cMax: '0.15', mnMin: '0.30', mnMax: '0.60', pMax: '0.025', sMax: '0.025', siMax: '0.50', crMax: '2.60', moMax: '1.13' },
};

function resolveChemistryDefaults(specGradeStr: string) {
  const upper = specGradeStr.toUpperCase();
  if (upper.includes('210')) return DEFAULT_CHEMISTRY_BY_SPEC.A210;
  if (upper.includes('179')) return DEFAULT_CHEMISTRY_BY_SPEC.A179;
  if (upper.includes('192')) return DEFAULT_CHEMISTRY_BY_SPEC.A192;
  if (upper.includes('P11') || upper.includes('T11')) return DEFAULT_CHEMISTRY_BY_SPEC.A335_P11;
  if (upper.includes('P22') || upper.includes('T22')) return DEFAULT_CHEMISTRY_BY_SPEC.A335_P22;
  if (upper.includes('A53')) return DEFAULT_CHEMISTRY_BY_SPEC.A53;
  return DEFAULT_CHEMISTRY_BY_SPEC.A106;
}

export function autoPopulateProcessSheet(
  plan: any,
  specMasterList: SpecMasterRecord[]
): ProcessSheetFormData {
  const isCds = (plan.route_code || '').toUpperCase().includes('CDS');
  const rCode = isCds ? 'CDS' : 'HFS';

  const cleanWo = String(plan.work_order_no || '').trim();
  const effectiveWoNo = plan.is_diversion ? `${cleanWo}-Div` : cleanWo;
  const yr2 = String(new Date().getFullYear()).slice(-2);

  const parsedSt = plan.status && typeof plan.status === 'object' ? plan.status : {};

  let woDateFormatted = '';
  if (parsedSt.wo_date) {
    woDateFormatted = parsedSt.wo_date;
  } else if (plan.planned_rolling_date) {
    const parts = plan.planned_rolling_date.split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      woDateFormatted = `${parts[2]}-${parts[1]}-${parts[0]}`;
    } else {
      woDateFormatted = plan.planned_rolling_date;
    }
  }

  const targetOd = Number(plan.size_od) || 0;
  const targetWt = Number(plan.size_wt) || 0;
  const l1Val = Number(plan.l1) || 0;
  const l2Val = Number(plan.l2) || 0;
  const avgLen = l1Val > 0 && l2Val > 0 ? (l1Val + l2Val) / 2 : l1Val || l2Val || 0;

  const fullSpecGrade = `${plan.specification || parsedSt.spec || ''} ${plan.grade || parsedSt.grade || ''}`.trim();
  const matchedMaster = findMatchingSpecMaster(fullSpecGrade, specMasterList);

  const specUpper = `${plan.specification || ''} ${plan.grade || ''} ${parsedSt.spec || ''}`.toUpperCase();
  const isNoNegativeTol =
    Boolean(matchedMaster?.is_min_wall) ||
    specUpper.includes('MIN') ||
    specUpper.includes('MW') ||
    specUpper.includes('MIN WALL') ||
    specUpper.includes('NO NEG') ||
    specUpper.includes('210') ||
    specUpper.includes('213') ||
    specUpper.includes('192') ||
    specUpper.includes('179');

  const calcProcessWt =
    targetWt > 0
      ? isNoNegativeTol
        ? Number((targetWt * 1.05).toFixed(2))
        : Number((targetWt * 0.97).toFixed(2))
      : 0;

  const isFixedLength = l1Val > 0 && l2Val > 0 && (Math.abs(l1Val - l2Val) < 0.05 || l1Val === l2Val);
  const kgMtr = targetOd > targetWt && targetWt > 0 ? (targetOd - targetWt) * targetWt * 0.0246615 : 0;

  const wtPerPieceKg = kgMtr * avgLen;
  const calcBundleQtyPcs = wtPerPieceKg > 0 ? Math.round(2000 / wtPerPieceKg) : 0;

  const mhOd = Number(parsedSt.sizing_mill?.cust_od || plan.mh_od || targetOd || 0);
  const mhWt = Number(parsedSt.sizing_mill?.rolling_wt || plan.mh_wt || targetWt || 0);
  const smLen = parsedSt.sizing_mill?.sm_len || plan.mh_l1 || (avgLen > 0 ? avgLen.toFixed(3) : '');
  const hfsLen = plan.mh_l2 || (avgLen > 0 ? avgLen.toFixed(3) : '');

  const piercOd = Number(parsedSt.piercer_mill?.pm_od || (mhOd > 0 ? (mhOd * 1.08).toFixed(2) : 0));
  const piercWt = Number(parsedSt.piercer_mill?.pm_wt || (mhWt > 0 ? (mhWt * 1.04).toFixed(2) : 0));

  const bDia = Number(parsedSt.billet?.rm_od || (mhOd > 75 ? 90.0 : mhOd > 0 ? 63.0 : 0));
  const bSect = bDia > 0 ? Number(parsedSt.billet?.weight_kg || (((bDia * bDia * 3.14159 * 0.007856) / 4).toFixed(2))) : 0;

  const plannedMtr = plan.planned_qty || parsedSt.rolling_mtr || plan.ordered_qty_mtr || 0;
  const nosCalc = avgLen > 0 ? Math.round(Number(plannedMtr || 0) / avgLen) : 0;

  const smysMpa = matchedMaster?.smys_mpa ? Number(matchedMaster.smys_mpa) : 240;
  const hydroCalc = targetOd > 0 && targetWt > 0 ? calculateHydroPressurePsi(targetOd, targetWt, smysMpa) : { pressurePsi: 0 };
  const hydroStr = hydroCalc.pressurePsi > 0 ? String(hydroCalc.pressurePsi) : '';

  let initialTols = { od_min: 0, od_max: 0, wt_min: 0, wt_max: 0 };
  if (targetOd > 0 && targetWt > 0) {
    initialTols = calculateStandardTolerances(targetOd, targetWt, fullSpecGrade || matchedMaster?.spec_full || '', rCode);
  }

  const markingSingle = buildMarkingString('single', {
    routeCode: rCode,
    specification: plan.specification || parsedSt.spec,
    grade: plan.grade || parsedSt.grade,
    sizeOd: targetOd,
    sizeWt: targetWt,
    hydroPsi: hydroStr,
    woNo: effectiveWoNo,
    poNo: plan.po_no || parsedSt.po_no,
  });

  const markingTriple = buildMarkingString('triple', {
    routeCode: rCode,
    specification: plan.specification || parsedSt.spec,
    grade: plan.grade || parsedSt.grade,
    sizeOd: targetOd,
    sizeWt: targetWt,
    hydroPsi: hydroStr,
    woNo: effectiveWoNo,
    poNo: plan.po_no || parsedSt.po_no,
  });

  const chemDefaults = resolveChemistryDefaults(fullSpecGrade);

  const todayStr = (() => {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
  })();

  return {
    sheetNo: `${yr2}D${effectiveWoNo}`,
    revNo: 'REV 01',
    orderType: rCode,
    routeType: rCode,
    sheetDate: todayStr,

    customer: plan.customer_name || '',
    destination: plan.destination || parsedSt.destination || '',
    poNo: plan.po_no || parsedSt.po_no || '',
    poDate: plan.po_date || parsedSt.po_date || '',
    woNo: effectiveWoNo,
    woDate: woDateFormatted || todayStr,
    orderQty: plan.ordered_qty_mtr ? `${plan.ordered_qty_mtr} MTR` : plannedMtr ? `${plannedMtr} MTR` : '',
    deliveryDate: plan.target_date || '',
    materialCode: plan.material_code || parsedSt.material_code || '',
    heatNo: parsedSt.heat_no || '',
    steelGrade: plan.grade || parsedSt.grade || '',
    materialSpec: plan.specification || parsedSt.spec || '',
    inspection: parsedSt.ibr_status || 'IBR',

    custOd: targetOd > 0 ? targetOd.toFixed(2) : '',
    custWt: targetWt > 0 ? targetWt.toFixed(2) : '',
    processWt: calcProcessWt > 0 ? calcProcessWt.toFixed(2) : '',
    isMinWall: isNoNegativeTol,
    finalOrderLen1: l1Val > 0 ? l1Val.toFixed(3) : '',
    finalOrderLen2: l2Val > 0 ? (isFixedLength ? `${l2Val.toFixed(3)} +10MM` : l2Val.toFixed(3)) : '',
    finalLength: avgLen > 0 ? avgLen.toFixed(2) : '',
    finalLenTol: isFixedLength ? '+10MM' : '',
    finalPipeWeight: kgMtr > 0 ? kgMtr.toFixed(2) : '',
    bundleQtyPcs: calcBundleQtyPcs > 0 ? calcBundleQtyPcs.toString() : '',
    bundleWeightMt: calcBundleQtyPcs > 0 ? '2 MT' : '',

    motherHollowOd: mhOd > 0 ? mhOd.toFixed(2) : '',
    motherHollowWt: mhWt > 0 ? mhWt.toFixed(2) : '',
    rollingWt: mhWt > 0 ? mhWt.toFixed(2) : '',
    motherHollowKgMtr: kgMtr > 0 ? kgMtr.toFixed(2) : '',
    smLength: smLen ? smLen.toString() : '',
    hfsFinalLength: hfsLen ? hfsLen.toString() : '',

    piercerOd: piercOd > 0 ? piercOd.toFixed(2) : '',
    piercerWt: piercWt > 0 ? piercWt.toFixed(2) : '',
    piercerShellLen: parsedSt.piercer_mill?.pm_len ? String(parsedSt.piercer_mill.pm_len) : avgLen > 0 ? (avgLen * 0.88).toFixed(2) : '',
    shellWeight: parsedSt.piercer_mill?.pm_kg_mtr ? String(parsedSt.piercer_mill.pm_kg_mtr) : kgMtr > 0 ? (kgMtr * 1.13).toFixed(2) : '',

    billetDia: bDia > 0 ? bDia.toFixed(2) : '',
    billetSectWt: bSect > 0 ? bSect.toFixed(2) : '',
    billetLength: parsedSt.billet?.rm_len_min ? String(parsedSt.billet.rm_len_min) : '',
    totalWeightMt: bSect > 0 ? (parsedSt.billet?.billet_wt_whf || ((bSect * 1.29) / 1000)).toFixed(2) : '',

    multiple: (plan.multiple || parsedSt.multiple || 1).toString(),
    planQtyMtrs: plannedMtr ? plannedMtr.toString() : '',
    planQtyNos: nosCalc > 0 ? nosCalc.toString() : '',
    planQtyMt: kgMtr > 0 ? ((kgMtr * Number(plannedMtr || 0)) / 1000).toFixed(2) : '',

    finalTolOdMin: initialTols.od_min > 0 ? initialTols.od_min.toFixed(2) : '',
    finalTolOdMax: initialTols.od_max > 0 ? initialTols.od_max.toFixed(2) : '',
    finalTolWtMin: initialTols.wt_min > 0 ? initialTols.wt_min.toFixed(2) : '',
    finalTolWtMax: initialTols.wt_max > 0 ? initialTols.wt_max.toFixed(2) : '',

    whfTemp: matchedMaster?.whf_temp || '1220° C (+/- 40° C)',
    inductionTemp: matchedMaster?.induction_temp || '850 °C - 880° C',
    sizingOutletTemp: matchedMaster?.sizing_outlet_temp || '880° C TO 900° C',
    htCycle: matchedMaster?.ht_cycle || 'NA',
    htCondition: matchedMaster?.ht_condition || (isCds ? 'STRESS RELIEVED / NORMALIZED' : 'AS ROLLED / HFS'),
    holdingTime: matchedMaster?.holding_time_sec ? `${matchedMaster.holding_time_sec} SEC` : '5 SEC',

    ystMin: matchedMaster?.smys_mpa ? String(matchedMaster.smys_mpa) : '240',
    ystMax: '',
    utsMin: matchedMaster?.uts_mpa ? String(matchedMaster.uts_mpa) : '415',
    utsMax: '',
    elongationMin: matchedMaster?.elongation_pct ? String(matchedMaster.elongation_pct) : '21',
    hardness: matchedMaster?.hardness || '85 HRB MAX',
    straightness: matchedMaster?.straightness || '1:1000',

    cMin: chemDefaults.cMin || '',
    cMax: chemDefaults.cMax || '',
    mnMin: chemDefaults.mnMin || '',
    mnMax: chemDefaults.mnMax || '',
    pMax: chemDefaults.pMax || '',
    sMax: chemDefaults.sMax || '',
    siMin: chemDefaults.siMin || '',
    siMax: chemDefaults.siMax || '',
    crMax: chemDefaults.crMax || '',
    moMax: chemDefaults.moMax || '',
    niMax: chemDefaults.niMax || '',
    cuMax: chemDefaults.cuMax || '',
    vMax: chemDefaults.vMax || '',
    nbMax: chemDefaults.nbMax || '',
    ceMax: chemDefaults.ceMax || '',

    ndt: matchedMaster?.ndt || 'UT',
    hydroPressurePsi: hydroStr,
    coating: matchedMaster?.coating || 'BLACK VARNISH',
    endCondition: matchedMaster?.end_condition || 'BEVEL END (30°-35°)',
    bundling: matchedMaster?.bundling || 'HEXAGONAL',
    endCap: matchedMaster?.end_cap || 'PLASTIC PROTECTOR',
    pipeColorCode: matchedMaster?.color_spec || 'WHITE',
    rmColorCode: matchedMaster?.rm_color || 'YELLOW + WHITE',

    markingSingle,
    markingTriple,
  };
}
