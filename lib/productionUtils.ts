// lib/productionUtils.ts

export const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

export const fmt = (v: unknown, suffixOrDecimals: string | number = "") => {
  const x = Number(v);
  if (!Number.isFinite(x)) return "—";
  if (typeof suffixOrDecimals === "number") {
    return x.toLocaleString(undefined, {
      minimumFractionDigits: suffixOrDecimals,
      maximumFractionDigits: suffixOrDecimals,
    });
  }
  const suffix = suffixOrDecimals || "";
  const sUpper = suffix.toUpperCase();
  if (sUpper.includes("PCS") || sUpper.includes("NOS") || sUpper.includes("PC") || sUpper.includes("BUNDLE")) {
    return `${Math.round(x).toLocaleString()}${suffix}`;
  }
  return `${x.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}${suffix}`;
};

export const fmtPcs = (v: unknown, suffix = " PCS") => {
  const x = Number(v);
  if (!Number.isFinite(x)) return "0" + suffix;
  return `${Math.round(x).toLocaleString()}${suffix}`;
};

export const fmtMtr = (v: unknown, suffix = " MTR") => {
  const x = Number(v);
  if (!Number.isFinite(x)) return "0.00" + suffix;
  return `${x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${suffix}`;
};

export const fmtMt = (v: unknown, suffix = " MT") => {
  const x = Number(v);
  if (!Number.isFinite(x)) return "0.00" + suffix;
  return `${x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${suffix}`;
};

export const pcsFromMtr = (mtr: number, avg: number) =>
  avg > 0 ? Math.round(mtr / avg) : 0;

export const mtrFromPcs = (pcs: number, avg: number) =>
  avg > 0 ? Number((Math.round(pcs) * avg).toFixed(2)) : 0;

export const mtFromMtr = (mtr: number, od: number, wt: number) =>
  Number((
    Math.max(od - wt, 0) *
    Math.max(wt, 0) *
    0.0246615 *
    0.001 *
    Math.max(mtr, 0)
  ).toFixed(2));

export const calcElongationFactor = (
  mhOd: number | null | undefined,
  mhWt: number | null | undefined,
  orderOd: number | null | undefined,
  orderWt: number | null | undefined
): number => {
  const hod = Number(mhOd || 0);
  const hwt = Number(mhWt || 0);
  const ood = Number(orderOd || 0);
  const owt = Number(orderWt || 0);
  if (hod > hwt && hwt > 0 && ood > owt && owt > 0) {
    const areaMh = (hod - hwt) * hwt;
    const areaFinal = (ood - owt) * owt;
    if (areaFinal > 0) {
      return Number((areaMh / areaFinal).toFixed(4));
    }
  }
  return 1.0;
};

export const calc = (row: {
  avg_length: number | null;
  pcs: string;
  mtr: string;
  rejection_pcs: string;
  rejection_mtr: string;
  htc_ok_pcs: string;
  htc_ok_mtr: string;
  od: number | null;
  wl: number | null;
  l1?: number | null;
  l2?: number | null;
  input_l1?: string;
  input_l2?: string;
  mh_od?: number | null;
  mh_wt?: number | null;
  mh_l1?: number | null;
  mh_l2?: number | null;
  mh_avg_length?: number | null;
  stage_code?: string;
}) => {
  const sc = (row.stage_code || "").toUpperCase();
  const isMhStage = sc === "ROLLING" || sc === "HOLLOW_HEAT_TREATMENT";
  
  // Rule 5: Rolling and Hollow Heat Treatment Mtr and MT will be calculated based on MH OD, MH WT and MH Length
  const mhL1 = Number(row.mh_l1 || 0);
  const mhL2 = Number(row.mh_l2 || 0);
  const computedMhAvg = mhL1 > 0 && mhL2 > 0 ? (mhL1 + mhL2) / 2 : (mhL1 || mhL2 || 0);
  const effectiveMhAvg = Number(row.mh_avg_length || 0) > 0 ? Number(row.mh_avg_length) : computedMhAvg;

  // Order L1 and L2 average
  const l1 = Number(row.l1 || 0);
  const l2 = Number(row.l2 || 0);
  const orderAvg = l1 > 0 && l2 > 0 ? (l1 + l2) / 2 : (l1 || l2 || 0);

  // User input L1 and L2 average
  const inputL1 = Number(row.input_l1 || 0);
  const inputL2 = Number(row.input_l2 || 0);
  const userEnteredAvg = inputL1 > 0 && inputL2 > 0 ? (inputL1 + inputL2) / 2 : (inputL1 || inputL2 || 0);

  const effectiveAvg =
    userEnteredAvg > 0
      ? userEnteredAvg
      : isMhStage && effectiveMhAvg > 0
      ? effectiveMhAvg
      : orderAvg > 0
      ? orderAvg
      : n(row.avg_length) > 0
      ? n(row.avg_length)
      : 6.0;

  const effectiveOd =
    isMhStage && row.mh_od && Number(row.mh_od) > 0 ? Number(row.mh_od) : n(row.od);

  const effectiveWt =
    isMhStage && row.mh_wt && Number(row.mh_wt) > 0 ? Number(row.mh_wt) : n(row.wl);

  const avg = effectiveAvg;

  const isFinishing = (row.stage_code || "").toUpperCase() === "FINISHING";

  const hasPcs = row.pcs !== undefined && row.pcs !== null && String(row.pcs).trim() !== "";
  const hasMtr = row.mtr !== undefined && row.mtr !== null && String(row.mtr).trim() !== "";
  const pcs = hasPcs
    ? Math.round(n(row.pcs))
    : (hasMtr && avg > 0 ? pcsFromMtr(n(row.mtr), avg) : 0);
  const calculatedMtr = mtrFromPcs(pcs, avg);
  const mtr = hasMtr
    ? Number(n(row.mtr).toFixed(2))
    : calculatedMtr;

  const hasRejPcs = row.rejection_pcs !== undefined && row.rejection_pcs !== null && String(row.rejection_pcs).trim() !== "";
  const hasRejMtr = row.rejection_mtr !== undefined && row.rejection_mtr !== null && String(row.rejection_mtr).trim() !== "";
  const rejectionPcs = hasRejPcs
    ? Math.round(n(row.rejection_pcs))
    : (hasRejMtr && avg > 0 ? pcsFromMtr(n(row.rejection_mtr), avg) : 0);
  const calculatedRejMtr = mtrFromPcs(rejectionPcs, avg);
  const rejectionMtr = hasRejMtr
    ? Number(n(row.rejection_mtr).toFixed(2))
    : calculatedRejMtr;

  const isRolling = sc === "ROLLING" || !sc;
  const hasHtcPcs = isRolling && row.htc_ok_pcs !== undefined && row.htc_ok_pcs !== null && String(row.htc_ok_pcs).trim() !== "";
  const hasHtcMtr = isRolling && row.htc_ok_mtr !== undefined && row.htc_ok_mtr !== null && String(row.htc_ok_mtr).trim() !== "";
  const htcPcs = isRolling
    ? (hasHtcPcs ? Math.round(n(row.htc_ok_pcs)) : (hasHtcMtr && avg > 0 ? pcsFromMtr(n(row.htc_ok_mtr), avg) : 0))
    : 0;
  const calculatedHtcMtr = isRolling ? mtrFromPcs(htcPcs, avg) : 0;
  const htcMtr = isRolling
    ? (hasHtcMtr ? Number(n(row.htc_ok_mtr).toFixed(2)) : calculatedHtcMtr)
    : 0;

  const mt = Number(mtFromMtr(mtr, effectiveOd, effectiveWt).toFixed(2));
  const rejectionMt = Number(mtFromMtr(rejectionMtr, effectiveOd, effectiveWt).toFixed(2));
  const htcMt = isRolling ? Number(mtFromMtr(htcMtr, effectiveOd, effectiveWt).toFixed(2)) : 0;
  const netMtr = Number(Math.max(0, mtr - rejectionMtr).toFixed(2));
  const netPcs = Math.max(0, pcs - rejectionPcs);

  return {
    avg,
    pcs,
    mtr,
    mt,
    rejection: rejectionMtr,
    rejectionMtr,
    rejectionPcs,
    rejectionMt,
    htc: htcMtr,
    htcMtr,
    htcPcs,
    htcMt,
    netMtr,
    netPcs,
    effectiveOd,
    effectiveWt,
  };
};

export const getScrapYieldAllowance = (): number => {
  if (typeof window !== "undefined") {
    const val = localStorage.getItem("seamless_wip_scrap_yield_pct");
    if (val) {
      const num = Number(val);
      if (Number.isFinite(num) && num >= 0) return num;
    }
  }
  return 5.0; // Default 5% standard scrap allowance
};

export const calculateYieldWithScrap = (
  goodOutputMtr: number,
  scrapMtr: number,
  inputMtr: number,
  scrapFactorPct?: number
): number => {
  const factor = scrapFactorPct ?? getScrapYieldAllowance();
  const base = inputMtr > 0 ? inputMtr : goodOutputMtr + scrapMtr;
  if (base <= 0) return 100;
  const scrapCredit = scrapMtr * (factor / 100);
  const yieldVal = ((goodOutputMtr + scrapCredit) / base) * 100;
  return Math.min(100, Math.max(0, Math.round(yieldVal * 10) / 10));
};

export function attachPcsToRemarks(
  remarks: string | null | undefined,
  pcs?: number | null,
  rejPcs?: number | null,
  l1?: number | string | null,
  l2?: number | string | null
): string {
  let clean = (remarks || "")
    .replace(/\[PCS:\d+\]/gi, "")
    .replace(/\[REJ_PCS:\d+\]/gi, "")
    .replace(/\[L1:[^\]]+\]/gi, "")
    .replace(/\[L2:[^\]]+\]/gi, "")
    .replace(/\[AVG:[^\]]+\]/gi, "")
    .trim();
  const tags: string[] = [];
  const nL1 = Number(l1);
  const nL2 = Number(l2);
  if (Number.isFinite(nL1) && nL1 > 0) {
    tags.push(`[L1:${nL1}]`);
  }
  if (Number.isFinite(nL2) && nL2 > 0) {
    tags.push(`[L2:${nL2}]`);
  }
  if (pcs != null && !isNaN(Number(pcs)) && Number(pcs) > 0) {
    tags.push(`[PCS:${Math.round(Number(pcs))}]`);
  }
  if (rejPcs != null && !isNaN(Number(rejPcs)) && Number(rejPcs) > 0) {
    tags.push(`[REJ_PCS:${Math.round(Number(rejPcs))}]`);
  }
  if (tags.length === 0) return clean;
  return clean ? `${clean} ${tags.join(" ")}` : tags.join(" ");
}

export function extractPcsFromRemarks(remarks: string | null | undefined): {
  pcs: number | null;
  rejPcs: number | null;
  cleanRemarks: string;
} {
  if (!remarks) return { pcs: null, rejPcs: null, cleanRemarks: "" };
  const pcsMatch = remarks.match(/\[PCS:(\d+)/i);
  const rejMatch = remarks.match(/(?:\[REJ_PCS:|\[REJ:|[, ]REJ:)(\d+)/i);
  const pcs = pcsMatch ? parseInt(pcsMatch[1], 10) : null;
  const rejPcs = rejMatch ? parseInt(rejMatch[1], 10) : null;
  const cleanRemarks = remarks
    .replace(/\[PCS:[^\]]+\]/gi, "")
    .replace(/\[REJ_PCS:[^\]]+\]/gi, "")
    .replace(/\[REJ:[^\]]+\]/gi, "")
    .replace(/\[L1:[^\]]+\]/gi, "")
    .replace(/\[L2:[^\]]+\]/gi, "")
    .replace(/\[AVG:[^\]]+\]/gi, "")
    .trim();
  return { pcs, rejPcs, cleanRemarks };
}

export function attachCustomLengthToRemarks(
  remarks: string | null | undefined,
  l1: number | string | null | undefined,
  l2: number | string | null | undefined,
  avg: number | string | null | undefined
): string {
  let base = (remarks || "").trim();
  base = base
    .replace(/\[L1:[^\]]+\]/gi, "")
    .replace(/\[L2:[^\]]+\]/gi, "")
    .replace(/\[AVG:[^\]]+\]/gi, "")
    .trim();
  const tags: string[] = [];
  const nL1 = Number(l1);
  const nL2 = Number(l2);
  const nAvg = Number(avg);
  if (Number.isFinite(nL1) && nL1 > 0) tags.push(`[L1:${nL1}]`);
  if (Number.isFinite(nL2) && nL2 > 0) tags.push(`[L2:${nL2}]`);
  if (Number.isFinite(nAvg) && nAvg > 0) tags.push(`[AVG:${nAvg.toFixed(2)}]`);
  if (tags.length === 0) return base;
  return base ? `${base} ${tags.join(" ")}` : tags.join(" ");
}

export function extractCustomLengthFromRemarks(remarks: string | null | undefined): {
  l1: number | null;
  l2: number | null;
  avg: number | null;
  cleanRemarks: string;
} {
  if (!remarks) return { l1: null, l2: null, avg: null, cleanRemarks: "" };
  const l1Match = remarks.match(/\[L1:([0-9.]+)\]/i);
  const l2Match = remarks.match(/\[L2:([0-9.]+)\]/i);
  const avgMatch = remarks.match(/\[AVG:([0-9.]+)\]/i);
  const l1 = l1Match ? parseFloat(l1Match[1]) : null;
  const l2 = l2Match ? parseFloat(l2Match[1]) : null;
  const avg = avgMatch ? parseFloat(avgMatch[1]) : null;
  const cleanRemarks = remarks
    .replace(/\[L1:[^\]]+\]/gi, "")
    .replace(/\[L2:[^\]]+\]/gi, "")
    .replace(/\[AVG:[^\]]+\]/gi, "")
    .replace(/\[PCS:\d+\]/gi, "")
    .replace(/\[REJ_PCS:\d+\]/gi, "")
    .replace(/\[CUTS:[^\]]+\]/gi, "")
    .trim();
  return { l1, l2, avg, cleanRemarks };
}

export function attachBandSawCutsToRemarks(
  remarks: string | null | undefined,
  cuts: Array<{ length_mtr: number; cut_pcs: number; cut_category?: string }>,
  motherPcs?: number | null,
  yieldPct?: number | null,
  offcutMtr?: number | null,
  scrapMtr?: number | null,
  scrapMt?: number | null,
  scrapPct?: number | null,
  l1?: number | string | null,
  l2?: number | string | null
): string {
  let base = (remarks || "").trim();
  base = base.replace(/\[CUTS:[^\]]+\]/gi, "").trim();

  const cutsData = {
    m_pcs: motherPcs || null,
    yield: yieldPct !== undefined && yieldPct !== null ? Number(yieldPct.toFixed(1)) : null,
    offcut_m: offcutMtr !== undefined && offcutMtr !== null ? Number(offcutMtr.toFixed(2)) : null,
    scrap_m: scrapMtr !== undefined && scrapMtr !== null ? Number(scrapMtr.toFixed(2)) : null,
    scrap_mt: scrapMt !== undefined && scrapMt !== null ? Number(scrapMt.toFixed(3)) : null,
    scrap_pct: scrapPct !== undefined && scrapPct !== null ? Number(scrapPct.toFixed(1)) : null,
    items: cuts.map((c) => ({
      len: Number(c.length_mtr),
      pcs: Number(c.cut_pcs),
      cat: c.cut_category || "PRIME",
    })),
  };

  const jsonStr = JSON.stringify(cutsData);
  const tag = `[CUTS:${jsonStr}]`;

  const totalPrimePcs = cuts
    .filter((c) => (c.cut_category || "PRIME") === "PRIME" || c.cut_category === "SECONDARY")
    .reduce((sum, c) => sum + Number(c.cut_pcs || 0), 0);

  return attachPcsToRemarks(base ? `${base} ${tag}` : tag, totalPrimePcs || null, null, l1, l2);
}

export function extractBandSawCutsFromRemarks(remarks: string | null | undefined): {
  cuts: Array<{ len: number; pcs: number; cat: string }> | null;
  motherPcs: number | null;
  yieldPct: number | null;
  offcutMtr: number | null;
  scrapMtr: number | null;
  scrapMt: number | null;
  scrapPct: number | null;
  cleanRemarks: string;
} {
  if (!remarks) return { cuts: null, motherPcs: null, yieldPct: null, offcutMtr: null, scrapMtr: null, scrapMt: null, scrapPct: null, cleanRemarks: "" };
  const match = remarks.match(/\[CUTS:(\{.*?\})\]/i);
  let cuts: Array<{ len: number; pcs: number; cat: string }> | null = null;
  let motherPcs: number | null = null;
  let yieldPct: number | null = null;
  let offcutMtr: number | null = null;
  let scrapMtr: number | null = null;
  let scrapMt: number | null = null;
  let scrapPct: number | null = null;

  if (match && match[1]) {
    try {
      const parsed = JSON.parse(match[1]);
      cuts = Array.isArray(parsed.items) ? parsed.items : null;
      motherPcs = parsed.m_pcs ?? null;
      yieldPct = parsed.yield ?? null;
      offcutMtr = parsed.offcut_m ?? null;
      scrapMtr = parsed.scrap_m ?? null;
      scrapMt = parsed.scrap_mt ?? null;
      scrapPct = parsed.scrap_pct ?? null;
    } catch {}
  }

  const cleanRemarks = remarks
    .replace(/\[CUTS:[^\]]+\]/gi, "")
    .replace(/\[L1:[^\]]+\]/gi, "")
    .replace(/\[L2:[^\]]+\]/gi, "")
    .replace(/\[AVG:[^\]]+\]/gi, "")
    .replace(/\[PCS:\d+\]/gi, "")
    .replace(/\[REJ_PCS:\d+\]/gi, "")
    .trim();

  return { cuts, motherPcs, yieldPct, offcutMtr, scrapMtr, scrapMt, scrapPct, cleanRemarks };
}


export const STANDARD_RM_GRADES = [
  'SAE-1018',
  'SAE-1019',
  'SAE-1524',
  'SAE-1010',
  'SAE-1020',
  'SAE-1022',
  'SAE-1026',
  'SAE-1045',
  'P11',
  'P22',
  'P9',
  'P91',
  '20MnV6',
  '16MnCr5',
  'ST52',
  'A106-B',
  'A333-Gr6',
  'A210-A1',
  'A210-C',
  'A192',
  'A179',
];

/**
 * Normalizes similar written specifications into clean canonical standard formats
 * Examples:
 *   "A106 Gr.B", "A106 GR b", "a 106 gr b", "ASTM A106 Gr B", "SA 106 Gr.B" -> "ASTM A106 Gr.B"
 *   "SA210 Gr.A1", "A210 GR. A-1", "ASME SA210 Gr A1" -> "ASME SA210 Gr.A1"
 *   "SA210 Gr.C", "A210 Gr C", "ASME SA210 Gr C" -> "ASME SA210 Gr.C"
 *   "SA192", "ASTM A192" -> "ASTM A192"
 *   "SA179", "ASTM A179" -> "ASTM A179"
 *   "SA335 P11", "A335 Gr.P11", "P11" -> "ASTM A335 Gr.P11"
 *   "SA335 P22", "A335 Gr.P22", "P22" -> "ASTM A335 Gr.P22"
 *   "SA335 P91", "A335 Gr.P91", "P91" -> "ASTM A335 Gr.P91"
 *   "ST52", "DIN 2391 ST52" -> "DIN 2391 ST52"
 */
export function normalizeSpecification(raw: string | null | undefined): string {
  if (!raw || !raw.trim()) return '';
  const s = raw.trim().toUpperCase().replace(/[\s_\-]+/g, ' ');

  // A106 variants (A106 Gr.B, A106 Gr.C, A106 Gr.A)
  if (s.includes('106')) {
    if (s.includes('GR C') || s.includes('GR.C') || s.includes('GRADE C')) return 'ASTM A106 Gr.C';
    if (s.includes('GR A') || s.includes('GR.A') || s.includes('GRADE A')) return 'ASTM A106 Gr.A';
    return 'ASTM A106 Gr.B';
  }

  // SA210 / A210 variants (A-1 vs C)
  if (s.includes('210')) {
    if (s.includes('GR C') || s.includes('GR.C') || s.includes('GRADE C')) return 'ASME SA210 Gr.C';
    return 'ASME SA210 Gr.A1';
  }

  // SA335 / A335 alloy variants (P11, P22, P9, P91, P5, P12)
  if (s.includes('335') || s.includes('P11') || s.includes('P22') || s.includes('P91') || s.includes('P9')) {
    if (s.includes('P91')) return 'ASTM A335 Gr.P91';
    if (s.includes('P22')) return 'ASTM A335 Gr.P22';
    if (s.includes('P11')) return 'ASTM A335 Gr.P11';
    if (s.includes('P9')) return 'ASTM A335 Gr.P9';
    if (s.includes('P12')) return 'ASTM A335 Gr.P12';
    if (s.includes('P5')) return 'ASTM A335 Gr.P5';
    return 'ASTM A335 Gr.P11';
  }

  // A333 variants (Low Temp Gr.6)
  if (s.includes('333')) {
    return 'ASTM A333 Gr.6';
  }

  // SA192 / A192 (Carbon Boiler)
  if (s.includes('192')) {
    return 'ASTM A192';
  }

  // SA179 / A179 (Heat Exchanger)
  if (s.includes('179')) {
    return 'ASTM A179';
  }

  // EN 10305 / DIN 2391 / ST52
  if (s.includes('ST52') || s.includes('ST 52') || s.includes('E355')) {
    return 'EN 10305-1 E355 (ST52)';
  }
  if (s.includes('ST35') || s.includes('ST 35') || s.includes('E235')) {
    return 'EN 10305-1 E235 (ST35)';
  }

  // IS 1239 / IS 3589 / IS 1161
  if (s.includes('1239')) return 'IS 1239';
  if (s.includes('3589')) return 'IS 3589';
  if (s.includes('1161')) return 'IS 1161';

  // Return cleaned original text
  return raw.trim().replace(/\s+/g, ' ');
}

/**
 * Pipe Length Scrap & Prime Rules:
 * Rule 5A: If customer order length is < 4.0m, cut pipe meeting order length is PRIME.
 * Rule 5B: Remnants < 3.0m are SCRAP (melt loss, cannot be diverted).
 * Rule 5C: Remnants >= 3.0m are USABLE_OFFCUT eligible for diversion or commercial sale.
 */
export function classifyPipeCutLength(
  lengthMtr: number,
  orderTargetLen?: number | null
): 'PRIME' | 'USABLE_OFFCUT' | 'SCRAP' {
  const len = Number(lengthMtr || 0);
  const target = Number(orderTargetLen || 0);

  // Rule 5A: Customer order length < 4.0m exception
  if (target > 0 && target < 4.0 && len >= target * 0.95) {
    return 'PRIME';
  }

  // Rule 5B: Hard 3.0-meter scrap floor
  if (len < 3.0) {
    return 'SCRAP';
  }

  // If meets standard order length (>= target or >= 4.0m)
  if (target > 0 && len >= target * 0.95) {
    return 'PRIME';
  }
  if (!target && len >= 4.0) {
    return 'PRIME';
  }

  // Rule 5C: Usable off-cut (>= 3.0m)
  return 'USABLE_OFFCUT';
}

/**
 * Attaches bundle type (PRIME vs COMMERCIAL) to remarks string.
 */
export function attachBundleTypeToRemarks(
  remarks: string | null | undefined,
  bundleType: 'PRIME' | 'COMMERCIAL'
): string {
  const clean = (remarks || '').replace(/\[BUNDLE_TYPE:\s*(PRIME|COMMERCIAL)\]/gi, '').trim();
  const tag = `[BUNDLE_TYPE: ${bundleType}]`;
  return clean ? `${clean} ${tag}` : tag;
}

/**
 * Extracts bundle type from remarks string (defaults to PRIME).
 */
export function extractBundleTypeFromRemarks(
  remarks: string | null | undefined
): 'PRIME' | 'COMMERCIAL' {
  if (!remarks) return 'PRIME';
  const match = remarks.match(/\[BUNDLE_TYPE:\s*(PRIME|COMMERCIAL)\]/i);
  if (match && match[1]) {
    return match[1].toUpperCase() as 'PRIME' | 'COMMERCIAL';
  }
  return 'PRIME';
}



