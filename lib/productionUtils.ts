// lib/productionUtils.ts

export const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

export const fmt = (v: unknown, suffix = "") => {
  const x = Number(v);
  if (!Number.isFinite(x)) return "—";
  return `${x.toLocaleString(undefined, { maximumFractionDigits: 3 })}${suffix}`;
};

export const pcsFromMtr = (mtr: number, avg: number) =>
  avg > 0 ? Math.round(mtr / avg) : 0;

export const mtrFromPcs = (pcs: number, avg: number) =>
  avg > 0 ? pcs * avg : 0;

export const mtFromMtr = (mtr: number, od: number, wt: number) =>
  Math.max(od - wt, 0) *
  Math.max(wt, 0) *
  0.0246615 *
  0.001 *
  Math.max(mtr, 0);

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
    ? (hasMtr ? n(row.mtr) : 0)
    : (hasMtr ? n(row.mtr) : calculatedMtr);

  const hasRejPcs = row.rejection_pcs !== undefined && row.rejection_pcs !== null && row.rejection_pcs.trim() !== "";
  const hasRejMtr = row.rejection_mtr !== undefined && row.rejection_mtr !== null && row.rejection_mtr.trim() !== "";
  const rejectionPcs = isFinishing
    ? (hasRejPcs ? Math.round(n(row.rejection_pcs)) : 0)
    : (hasRejPcs ? Math.round(n(row.rejection_pcs)) : (hasRejMtr && avg > 0 ? pcsFromMtr(n(row.rejection_mtr), avg) : 0));
  const calculatedRejMtr = mtrFromPcs(rejectionPcs, avg);
  const rejectionMtr = isFinishing
    ? (hasRejMtr ? n(row.rejection_mtr) : 0)
    : (hasRejMtr ? n(row.rejection_mtr) : calculatedRejMtr);

  const hasHtcPcs = row.htc_ok_pcs !== undefined && row.htc_ok_pcs !== null && row.htc_ok_pcs.trim() !== "";
  const hasHtcMtr = row.htc_ok_mtr !== undefined && row.htc_ok_mtr !== null && row.htc_ok_mtr.trim() !== "";
  const htcPcs = hasHtcPcs ? Math.round(n(row.htc_ok_pcs)) : (hasHtcMtr && avg > 0 ? pcsFromMtr(n(row.htc_ok_mtr), avg) : 0);
  const calculatedHtcMtr = mtrFromPcs(htcPcs, avg);
  const htcMtr = hasHtcMtr ? n(row.htc_ok_mtr) : calculatedHtcMtr;

  const mt = mtFromMtr(mtr, effectiveOd, effectiveWt);
  const rejectionMt = mtFromMtr(rejectionMtr, effectiveOd, effectiveWt);
  const htcMt = mtFromMtr(htcMtr, effectiveOd, effectiveWt);
  const netMtr = Math.max(0, mtr - rejectionMtr);
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


