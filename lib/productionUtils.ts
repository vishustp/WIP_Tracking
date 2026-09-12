// lib/productionUtils.ts

export const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

export const fmt = (v: unknown, suffix = "") => {
  const x = Number(v);
  if (!Number.isFinite(x)) return "—";
  const sUpper = suffix.toUpperCase();
  if (sUpper.includes("PCS") || sUpper.includes("NOS") || sUpper.includes("PC") || sUpper.includes("BUNDLE")) {
    return `${Math.round(x).toLocaleString()}${suffix}`;
  }
  return `${x.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 0 })}${suffix}`;
};

export const fmtPcs = (v: unknown, suffix = " PCS") => {
  const x = Number(v);
  if (!Number.isFinite(x)) return "0" + suffix;
  return `${Math.round(x).toLocaleString()}${suffix}`;
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
  mh_od?: number | null;
  mh_wt?: number | null;
  mh_l1?: number | null;
  mh_l2?: number | null;
  mh_avg_length?: number | null;
  stage_code?: string;
}) => {
  const isRolling = (row.stage_code || "").toUpperCase() === "ROLLING";
  
  // Rule 5: Rolling Mtr and MT will be calculated based on MH OD, MH WT and MH Length
  const mhL1 = Number(row.mh_l1 || 0);
  const mhL2 = Number(row.mh_l2 || 0);
  const computedMhAvg = mhL1 > 0 && mhL2 > 0 ? (mhL1 + mhL2) / 2 : (mhL1 || mhL2 || 0);
  const effectiveMhAvg = Number(row.mh_avg_length || 0) > 0 ? Number(row.mh_avg_length) : computedMhAvg;

  const effectiveAvg =
    isRolling && effectiveMhAvg > 0
      ? effectiveMhAvg
      : n(row.avg_length);

  const effectiveOd =
    isRolling && row.mh_od && Number(row.mh_od) > 0 ? Number(row.mh_od) : n(row.od);

  const effectiveWt =
    isRolling && row.mh_wt && Number(row.mh_wt) > 0 ? Number(row.mh_wt) : n(row.wl);

  const avg = effectiveAvg;

  const isFinishing = (row.stage_code || "").toUpperCase() === "FINISHING";

  // RULE: For Finishing, DO NOT calculate PCS or MTR based on length or MTR.
  // Both PCS and MTR are entered directly. Only MT is calculated based on Size and MTR.
  // For other stages: Nos cannot change based on Mtr, only Mtr will change based on Nos.
  const hasPcs = row.pcs !== undefined && row.pcs !== null && row.pcs.trim() !== "";
  const hasMtr = row.mtr !== undefined && row.mtr !== null && row.mtr.trim() !== "";
  const pcs = isFinishing
    ? (hasPcs ? Math.round(n(row.pcs)) : 0)
    : (hasPcs ? Math.round(n(row.pcs)) : (hasMtr && avg > 0 ? pcsFromMtr(n(row.mtr), avg) : 0));
  const calculatedMtr = mtrFromPcs(pcs, avg);
  const mtr = isFinishing
    ? (hasMtr ? Number(n(row.mtr).toFixed(2)) : 0)
    : (hasMtr ? Number(n(row.mtr).toFixed(2)) : calculatedMtr);

  const hasRejPcs = row.rejection_pcs !== undefined && row.rejection_pcs !== null && row.rejection_pcs.trim() !== "";
  const hasRejMtr = row.rejection_mtr !== undefined && row.rejection_mtr !== null && row.rejection_mtr.trim() !== "";
  const rejectionPcs = isFinishing
    ? (hasRejPcs ? Math.round(n(row.rejection_pcs)) : 0)
    : (hasRejPcs ? Math.round(n(row.rejection_pcs)) : (hasRejMtr && avg > 0 ? pcsFromMtr(n(row.rejection_mtr), avg) : 0));
  const calculatedRejMtr = mtrFromPcs(rejectionPcs, avg);
  const rejectionMtr = isFinishing
    ? (hasRejMtr ? Number(n(row.rejection_mtr).toFixed(2)) : 0)
    : (hasRejMtr ? Number(n(row.rejection_mtr).toFixed(2)) : calculatedRejMtr);

  const hasHtcPcs = row.htc_ok_pcs !== undefined && row.htc_ok_pcs !== null && row.htc_ok_pcs.trim() !== "";
  const hasHtcMtr = row.htc_ok_mtr !== undefined && row.htc_ok_mtr !== null && row.htc_ok_mtr.trim() !== "";
  const htcPcs = hasHtcPcs ? Math.round(n(row.htc_ok_pcs)) : (hasHtcMtr && avg > 0 ? pcsFromMtr(n(row.htc_ok_mtr), avg) : 0);
  const calculatedHtcMtr = mtrFromPcs(htcPcs, avg);
  const htcMtr = hasHtcMtr ? Number(n(row.htc_ok_mtr).toFixed(2)) : calculatedHtcMtr;

  const mt = Number(mtFromMtr(mtr, effectiveOd, effectiveWt).toFixed(2));
  const rejectionMt = Number(mtFromMtr(rejectionMtr, effectiveOd, effectiveWt).toFixed(2));
  const htcMt = Number(mtFromMtr(htcMtr, effectiveOd, effectiveWt).toFixed(2));
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
  rejPcs?: number | null
): string {
  const clean = (remarks || "")
    .replace(/\[PCS:\d+\]/gi, "")
    .replace(/\[REJ_PCS:\d+\]/gi, "")
    .trim();
  const tags: string[] = [];
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
  const pcsMatch = remarks.match(/\[PCS:(\d+)\]/i);
  const rejMatch = remarks.match(/\[REJ_PCS:(\d+)\]/i);
  const pcs = pcsMatch ? parseInt(pcsMatch[1], 10) : null;
  const rejPcs = rejMatch ? parseInt(rejMatch[1], 10) : null;
  const cleanRemarks = remarks
    .replace(/\[PCS:\d+\]/gi, "")
    .replace(/\[REJ_PCS:\d+\]/gi, "")
    .trim();
  return { pcs, rejPcs, cleanRemarks };
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


