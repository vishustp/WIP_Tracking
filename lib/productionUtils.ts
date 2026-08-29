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
  avg > 0 ? mtr / avg : 0;

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
  mh_avg_length?: number | null;
  stage_code?: string;
}) => {
  const isRolling = row.stage_code === "ROLLING";
  
  // Rule 5: Rolling Mtr and MT will be calculated based on MH OD, MH WT and MH Length
  const effectiveAvg =
    isRolling && row.mh_avg_length && row.mh_avg_length > 0
      ? Number(row.mh_avg_length)
      : n(row.avg_length);

  const effectiveOd =
    isRolling && row.mh_od && row.mh_od > 0 ? Number(row.mh_od) : n(row.od);

  const effectiveWt =
    isRolling && row.mh_wt && row.mh_wt > 0 ? Number(row.mh_wt) : n(row.wl);

  const avg = effectiveAvg;
  const pcs = row.pcs.trim() === "" && row.mtr.trim() !== "" ? pcsFromMtr(n(row.mtr), avg) : n(row.pcs);
  const calculatedMtr = mtrFromPcs(pcs, avg);
  const mtr = row.mtr.trim() === "" ? calculatedMtr : n(row.mtr);
  const rejectionMtr =
    row.rejection_mtr.trim() === ""
      ? mtrFromPcs(n(row.rejection_pcs), avg)
      : n(row.rejection_mtr);
  const rejectionPcs =
    row.rejection_pcs.trim() === ""
      ? pcsFromMtr(rejectionMtr, avg)
      : n(row.rejection_pcs);
  const htcMtr =
    row.htc_ok_mtr.trim() === ""
      ? mtrFromPcs(n(row.htc_ok_pcs), avg)
      : n(row.htc_ok_mtr);
  const htcPcs =
    row.htc_ok_pcs.trim() === ""
      ? pcsFromMtr(htcMtr, avg)
      : n(row.htc_ok_pcs);

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

