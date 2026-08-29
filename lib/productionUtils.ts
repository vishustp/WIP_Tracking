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

// wt = wall thickness (mm)
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
}) => {
  const avg = n(row.avg_length);
  const pcs = n(row.pcs);
  const calculatedMtr = mtrFromPcs(pcs, avg);
  const mtr = row.mtr.trim() === "" ? calculatedMtr : n(row.mtr);
  const rejection = row.rejection_mtr.trim() === ""
    ? mtrFromPcs(n(row.rejection_pcs), avg)
    : n(row.rejection_mtr);
  const htc = row.htc_ok_mtr.trim() === ""
    ? mtrFromPcs(n(row.htc_ok_pcs), avg)
    : n(row.htc_ok_mtr);
  const mt = mtFromMtr(mtr, n(row.od), n(row.wl));

  return { avg, pcs, mtr, mt, rejection, htc };
};