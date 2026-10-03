// lib/metallurgy/processSheetSpecHelper.ts
// Offline-first metallurgical auto-population and parameter generation for Process Sheet (Format F-PROD-11)

import { calculateHydroPressurePsi, calculateStandardTolerances } from './specEngine';
import { DEFAULT_SPEC_MASTER_RECORDS, type SpecMasterRecord } from '../specMasterDefaults';

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
  priority: string;
  materialCode: string;
  heatNo: string;
  steelGrade: string;
  materialSpec: string;
  inspection: string;
  processRouteSequence: string;

  // Inter Pass (Cold Drawing)
  pass1Od?: string;
  pass1Wt?: string;
  pass2Od?: string;
  pass2Wt?: string;
  pass3Od?: string;
  pass3Wt?: string;

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

  // Testing & Finishing
  ndt: string;
  hydroPressurePsi: string;
  coating: string;
  endCondition: string;
  bundling: string;
  endCap: string;
  pipeColorCode: string;
  rmColorCode: string;

  // Markings & Special Instructions
  markingType: 'single' | 'triple';
  markingText: string;
  specialInstructions: string;
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
  specMasterList?: SpecMasterRecord[],
  fallbackSpec?: string,
  fallbackGrade?: string
): SpecMasterRecord | undefined {
  const list = specMasterList && specMasterList.length > 0 ? specMasterList : DEFAULT_SPEC_MASTER_RECORDS;
  if (!fullSpecGrade && !fallbackSpec && !fallbackGrade) return list[0];

  const searchTexts = Array.from(
    new Set([
      fullSpecGrade,
      fallbackSpec,
      fallbackGrade,
      `${fallbackSpec || ''} ${fallbackGrade || ''}`.trim(),
    ])
  )
    .filter((s): s is string => Boolean(s))
    .map((s) => s.trim().toUpperCase());

  const combined = searchTexts.join(' ');
  const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

  // 1. Keyword-based priority matches for seamless pipe standards
  if (
    combined.includes('2391') ||
    combined.includes('ST 52') ||
    combined.includes('ST52') ||
    combined.includes('E355')
  ) {
    const found =
      list.find(
        (r) =>
          r.spec_key === 'DIN2391_ST52' ||
          (r.spec_full || '').toUpperCase().includes('2391') ||
          (r.spec_full || '').toUpperCase().includes('ST 52')
      ) || DEFAULT_SPEC_MASTER_RECORDS.find((r) => r.spec_key === 'DIN2391_ST52');
    if (found) return found;
  }
  if (
    combined.includes('ST 35') ||
    combined.includes('ST35') ||
    combined.includes('E235')
  ) {
    const found =
      list.find(
        (r) =>
          r.spec_key === 'DIN2391_ST35' ||
          (r.spec_full || '').toUpperCase().includes('ST 35')
      ) || DEFAULT_SPEC_MASTER_RECORDS.find((r) => r.spec_key === 'DIN2391_ST35');
    if (found) return found;
  }
  if (combined.includes('192')) {
    const found = list.find(
      (r) => r.spec_key === 'SA192' || (r.spec_full || '').toUpperCase().includes('192')
    );
    if (found) return found;
  }
  if (combined.includes('179')) {
    const found = list.find(
      (r) => r.spec_key === 'SA179' || (r.spec_full || '').toUpperCase().includes('179')
    );
    if (found) return found;
  }
  if (combined.includes('210')) {
    const isGrC =
      combined.includes('GR C') || combined.includes('GR.C') || combined.includes('GRADE C');
    const found = list.find(
      (r) =>
        r.spec_key === (isGrC ? 'A210_C' : 'A210') ||
        (r.spec_full || '').toUpperCase().includes('210')
    );
    if (found) return found;
  }
  if (combined.includes('3059')) {
    let key = 'BS3059_360';
    if (combined.includes('620') || combined.includes('622')) key = 'BS3059_620';
    else if (combined.includes('440')) key = 'BS3059_440';
    else if (combined.includes('320')) key = 'BS3059_320';
    const found = list.find(
      (r) => r.spec_key === key || (r.spec_full || '').toUpperCase().includes('3059')
    );
    if (found) return found;
  }
  if (combined.includes('213')) {
    let key = 'A213_T11';
    if (combined.includes('T22')) key = 'A213_T22';
    else if (combined.includes('T12')) key = 'A213_T12';
    const found = list.find(
      (r) => r.spec_key === key || (r.spec_full || '').toUpperCase().includes('213')
    );
    if (found) return found;
  }
  if (combined.includes('335')) {
    let key = 'A335_P11';
    if (combined.includes('P22')) key = 'A335_P22';
    const found = list.find(
      (r) => r.spec_key === key || (r.spec_full || '').toUpperCase().includes('335')
    );
    if (found) return found;
  }
  if (combined.includes('35.8') || combined.includes('17175')) {
    const found = list.find(
      (r) => r.spec_key === 'ST35_8' || (r.spec_full || '').toUpperCase().includes('35.8')
    );
    if (found) return found;
  }
  if (combined.includes('1010')) {
    const found = list.find(
      (r) => r.spec_key === 'SAE_1010' || (r.spec_full || '').toUpperCase().includes('1010')
    );
    if (found) return found;
  }
  if (combined.includes('900DP') || combined.includes('MS 900')) {
    const found = list.find(
      (r) => r.spec_key === 'MS_900DP' || (r.spec_full || '').toUpperCase().includes('900DP')
    );
    if (found) return found;
  }
  if (combined.includes('312') || combined.includes('316')) {
    const found = list.find(
      (r) => r.spec_key === 'A312_316L' || (r.spec_full || '').toUpperCase().includes('316')
    );
    if (found) return found;
  }
  if (combined.includes('304')) {
    const found = list.find(
      (r) => r.spec_key === 'A312_304L' || (r.spec_full || '').toUpperCase().includes('304')
    );
    if (found) return found;
  }
  if (combined.includes('A53') || combined.includes('53 GR') || combined.includes('53-B')) {
    const found = list.find(
      (r) => r.spec_key === 'A53' || (r.spec_full || '').toUpperCase().includes('A53')
    );
    if (found) return found;
  }
  if (combined.includes('106') || combined.includes('SA106') || combined.includes('1018')) {
    const isGrC =
      combined.includes('GR C') || combined.includes('GR.C') || combined.includes('GRADE C');
    const found = list.find(
      (r) =>
        r.spec_key === (isGrC ? 'SA106_C' : 'A106') ||
        (r.spec_full || '').toUpperCase().includes('106')
    );
    if (found) return found;
  }

  // 2. Generic normalized substring search
  return list.find((r) => {
    const sp = (r.spec_full || '').toUpperCase();
    const sk = (r.spec_key || '').toUpperCase();
    const sg = (r.steel_grade || '').toUpperCase();

    for (const t of searchTexts) {
      if (t.includes(sk) || t.includes(sp) || sp.includes(t)) return true;
      if (sg && (t.includes(sg) || sg.includes(t))) return true;

      const nT = norm(t);
      const nSp = norm(sp);
      const nSk = norm(sk);
      const nSg = norm(sg);

      if (nT.includes(nSk) || nSk.includes(nT) || nT.includes(nSp) || nSp.includes(nT)) return true;
      if (nSg && (nT.includes(nSg) || nSg.includes(nT))) return true;
    }
    return false;
  });
}



export function isPipeSpecRatherThanSteelGrade(str?: string | null): boolean {
  if (!str) return false;
  const s = str.toUpperCase().trim();
  return (
    s.startsWith('ASTM') ||
    s.startsWith('ASME') ||
    s.startsWith('DIN 2391') ||
    s.startsWith('EN 10305') ||
    s.startsWith('BS 3059') ||
    s.startsWith('IS 1239') ||
    s.startsWith('IS 3589') ||
    s.includes('A106') ||
    s.includes('A53') ||
    s.includes('A179') ||
    s.includes('A192') ||
    s.includes('A210') ||
    s.includes('A335') ||
    s.includes('A213') ||
    s.includes('A312')
  );
}

export function inferRouteFromMaterialOrSpec(
  materialCode?: string | null,
  spec?: string | null,
  grade?: string | null
): { route_code: string; route_name: string } {
  const mat = (materialCode || '').toUpperCase().trim();
  const sp = `${spec || ''} ${grade || ''}`.toUpperCase().trim();

  const isAlloy =
    sp.includes('ALLOY') ||
    sp.includes('213') ||
    sp.includes('335') ||
    sp.includes('T11') ||
    sp.includes('T22') ||
    sp.includes('T12') ||
    sp.includes('P11') ||
    sp.includes('P22') ||
    mat.includes('ALLOY');

  const isCds =
    mat.startsWith('CF') ||
    mat.startsWith('CD') ||
    mat.includes('CDS') ||
    sp.includes('2391') ||
    sp.includes('10305') ||
    sp.includes('179') ||
    sp.includes('192') ||
    sp.includes('ST 52') ||
    sp.includes('ST52') ||
    sp.includes('ST 35') ||
    sp.includes('ST35') ||
    sp.includes('CDS');

  if (isAlloy) {
    return isCds
      ? { route_code: 'ALLOY_CDS', route_name: 'Alloy Cold Drawn' }
      : { route_code: 'ALLOY_HFS', route_name: 'Alloy Hot Finished' };
  }
  return isCds
    ? { route_code: 'CDS', route_name: 'Cold Drawn' }
    : { route_code: 'HFS', route_name: 'Hot Finished' };
}

export function cleanOrFallbackSteelGrade(
  candidateGrade?: string | null,
  specText?: string | null
): string {
  const cg = (candidateGrade || '').trim();
  if (cg && !isPipeSpecRatherThanSteelGrade(cg)) {
    return cg;
  }

  const sp = `${specText || ''} ${cg}`.toUpperCase();
  if (sp.includes('DIN 2391') || sp.includes('ST 52') || sp.includes('E355')) {
    return 'ST 52';
  }
  if (sp.includes('17175') || sp.includes('ST 35.8') || sp.includes('ST35.8')) {
    return 'ST 35.8';
  }
  if (sp.includes('900DP') || sp.includes('MS 900')) {
    return 'DP 900';
  }
  if (sp.includes('316')) {
    return 'AISI 316L';
  }
  if (sp.includes('304')) {
    return 'AISI 304L';
  }
  if (sp.includes('213') && sp.includes('T11')) {
    return '1.25Cr - 0.5Mo';
  }
  if (sp.includes('213') && sp.includes('T22')) {
    return '2.25Cr - 1Mo';
  }
  if (sp.includes('335') && sp.includes('P11')) {
    return '1.25Cr - 0.5Mo';
  }
  if (sp.includes('335') && sp.includes('P22')) {
    return '2.25Cr - 1Mo';
  }
  if (sp.includes('210') && (sp.includes('GR C') || sp.includes('GR.C') || sp.includes('GRADE C'))) {
    return 'SAE 1026';
  }
  if (sp.includes('210')) {
    return 'SAE 1018';
  }
  if (sp.includes('179') || sp.includes('192')) {
    return 'SAE 1010';
  }
  if (sp.includes('106') || sp.includes('A53') || sp.includes('SA106')) {
    if (sp.includes('GR C') || sp.includes('GR.C') || sp.includes('GRADE C')) {
      return 'SAE 1020';
    }
    return 'SAE 1018';
  }
  if (sp.includes('3059')) {
    if (sp.includes('620') || sp.includes('622')) return 'Alloy Steel';
    if (sp.includes('440')) return 'SAE 1020';
    return 'SAE 1018';
  }

  return cg || 'SAE 1018';
}

export function autoPopulateProcessSheet(
  plan: any,
  specMasterList: SpecMasterRecord[]
): ProcessSheetFormData {
  const parsedSt = plan.status && typeof plan.status === 'object' ? plan.status : {};

  const specText = plan.specification || parsedSt.spec || '';
  const parsedGrade = String(parsedSt.rm_grade || parsedSt.grade || parsedSt.steel_grade || '').trim();
  const planGrade = String(plan.grade || '').trim();
  const fullSpecGrade = `${specText} ${parsedGrade || planGrade}`.trim();
  const matchedMaster = findMatchingSpecMaster(fullSpecGrade, specMasterList, specText, parsedGrade || planGrade);

  // Resolve Steel Grade (Raw Material / Billet Grade e.g. SAE 1018 / 15C8 RS-03)
  // RM Grade * entered by user in Rolling Plan has top priority
  let resolvedSteelGrade = '';
  if (parsedGrade && !isPipeSpecRatherThanSteelGrade(parsedGrade)) {
    resolvedSteelGrade = parsedGrade;
  } else if (planGrade && !isPipeSpecRatherThanSteelGrade(planGrade)) {
    resolvedSteelGrade = planGrade;
  } else if (matchedMaster?.steel_grade && !isPipeSpecRatherThanSteelGrade(matchedMaster.steel_grade)) {
    resolvedSteelGrade = matchedMaster.steel_grade;
  } else {
    resolvedSteelGrade = cleanOrFallbackSteelGrade(parsedGrade || planGrade, specText);
  }

  const matCode = (plan.material_code || parsedSt.material_code || '').toString().toUpperCase();
  const inferred = inferRouteFromMaterialOrSpec(matCode, specText, resolvedSteelGrade || planGrade);

  // Extract Route from Rolling plan (status route properties, plan.route_code, or inferred)
  const explicitRoute = (
    parsedSt.route_code ||
    parsedSt.route ||
    parsedSt.route_name ||
    plan.route_code ||
    plan.route_name ||
    ''
  ).toString().toUpperCase();

  let candidateRoute = explicitRoute;
  if (!candidateRoute || candidateRoute === 'PENDING' || candidateRoute === 'NONE') {
    candidateRoute = inferred.route_code;
  }

  const isCds = candidateRoute.includes('CDS') || inferred.route_code.includes('CDS');
  const isAlloy = candidateRoute.includes('ALLOY') || inferred.route_code.includes('ALLOY');
  const resolvedRoute = isAlloy ? (isCds ? 'ALLOY_CDS' : 'ALLOY_HFS') : (isCds ? 'CDS' : 'HFS');

  const cleanWo = String(plan.work_order_no || '').trim();
  const effectiveWoNo = plan.is_diversion ? `${cleanWo}-Div` : cleanWo;
  const yr2 = String(new Date().getFullYear()).slice(-2);

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

  const rawRmLen = Number(parsedSt.billet?.rm_len_min ?? parsedSt.rm_len_min ?? 0);
  const billetLenMm = rawRmLen > 0
    ? (rawRmLen < 20 ? Math.round(rawRmLen * 1000) : Math.round(rawRmLen)).toString()
    : '';

  const plannedMtr = plan.planned_qty || parsedSt.rolling_mtr || plan.ordered_qty_mtr || 0;
  const nosCalc = avgLen > 0 ? Math.round(Number(plannedMtr || 0) / avgLen) : 0;
  const calcOrderMt = kgMtr > 0 ? ((kgMtr * Number(plannedMtr || 0)) / 1000).toFixed(2) : '';
  const totalTheoBilletMt =
    parsedSt.plan_qty?.mton
      ? Number(parsedSt.plan_qty.mton).toFixed(2)
      : parsedSt.plan_qty_mton
        ? Number(parsedSt.plan_qty_mton).toFixed(2)
        : calcOrderMt || (bSect > 0 && nosCalc > 0 && rawRmLen > 0
            ? (((bSect * (rawRmLen < 20 ? rawRmLen : rawRmLen / 1000)) * nosCalc) / 1000).toFixed(2)
            : '');

  const smysMpa = matchedMaster?.smys_mpa ? Number(matchedMaster.smys_mpa) : 240;
  const hydroCalc = targetOd > 0 && targetWt > 0 ? calculateHydroPressurePsi(targetOd, targetWt, smysMpa) : { pressurePsi: 0 };
  const hydroStr = hydroCalc.pressurePsi > 0 ? String(hydroCalc.pressurePsi) : '';

  let initialTols = { od_min: 0, od_max: 0, wt_min: 0, wt_max: 0 };
  if (targetOd > 0 && targetWt > 0) {
    initialTols = calculateStandardTolerances(targetOd, targetWt, fullSpecGrade || matchedMaster?.spec_full || '', resolvedRoute);
  }

  const defaultRouteSequence = isCds
    ? 'BILLET CUTTING # WHF # PIERCER LXC 50 # SIZING # STR # CUTTING # VDI # STP # POINTING # DB # ANNEALING # STR # CUTTING # HUT # HYDRO # VDI # BLACK VARNISH # BUNDLING'
    : 'BILLET CUTTING # WHF # PIERCER LXC 50 # SIZING # STR # CUTTING # VDI # FINISHING # HYDRO # BLACK VARNISH # BUNDLING';

  const markingSingle = buildMarkingString('single', {
    routeCode: resolvedRoute,
    specification: plan.specification || parsedSt.spec,
    grade: plan.grade || parsedSt.grade,
    sizeOd: targetOd,
    sizeWt: targetWt,
    hydroPsi: hydroStr,
    woNo: effectiveWoNo,
    poNo: plan.po_no || parsedSt.po_no,
  });

  const todayStr = (() => {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
  })();

  return {
    sheetNo: `${yr2}D${effectiveWoNo}`,
    revNo: '0',
    orderType: resolvedRoute,
    routeType: resolvedRoute,
    sheetDate: todayStr,

    customer: plan.customer_name || '',
    destination: plan.destination || parsedSt.destination || '',
    poNo: plan.po_no || parsedSt.po_no || '',
    poDate: plan.po_date || parsedSt.po_date || '',
    woNo: effectiveWoNo,
    woDate: woDateFormatted || todayStr,
    orderQty: plan.ordered_qty_mtr ? `${plan.ordered_qty_mtr} MTR` : plannedMtr ? `${plannedMtr} MTR` : '',
    deliveryDate: plan.target_date || 'IMMEDIATE',
    priority: String(parsedSt.priority || '1'),
    materialCode: plan.material_code || parsedSt.material_code || '',
    heatNo: parsedSt.heat_no || '',
    steelGrade: resolvedSteelGrade,
    materialSpec: plan.specification || parsedSt.spec || matchedMaster?.spec_full || '',
    inspection: parsedSt.ibr_status || 'IBR',
    processRouteSequence: parsedSt.route_sequence || defaultRouteSequence,

    pass1Od: parsedSt.pass1_od || '',
    pass1Wt: parsedSt.pass1_wt || '',
    pass2Od: parsedSt.pass2_od || '',
    pass2Wt: parsedSt.pass2_wt || '',
    pass3Od: parsedSt.pass3_od || '',
    pass3Wt: parsedSt.pass3_wt || '',

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
    billetLength: billetLenMm,
    totalWeightMt: totalTheoBilletMt,

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

    ndt: matchedMaster?.ndt || 'UT',
    hydroPressurePsi: hydroStr,
    coating: matchedMaster?.coating || 'BLACK VARNISH',
    endCondition: matchedMaster?.end_condition || 'BEVEL END (30°-35°)',
    bundling: matchedMaster?.bundling || 'HEXAGONAL',
    endCap: matchedMaster?.end_cap || 'PLASTIC PROTECTOR',
    pipeColorCode: matchedMaster?.color_spec || 'WHITE',
    rmColorCode: matchedMaster?.rm_color || 'YELLOW + WHITE',

    markingType: 'single',
    markingText: markingSingle,
    specialInstructions: parsedSt.special_instructions || parsedSt.specialInstructions || parsedSt.remarks || '',
  };
}
