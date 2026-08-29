import { Row, calc } from "./calc"; // you'll need to export calc

export type ValidationError = { workOrder: string; message: string };

export function validateProductionEntry(
  row: Row,
  stage: StageCode,
  calcFn: (row: Row) => { avg: number; mtr: number; rejection: number; htc: number }
): ValidationError[] {
  const errors: ValidationError[] = [];
  const d = calcFn(row);
  const allowed = Number(row.max_allowed_mtr) > 0 ? Number(row.max_allowed_mtr) : Number(row.balance_to_make_mtr);

  if (d.avg <= 0) errors.push({ workOrder: row.work_order_no, message: "L1/L2 is missing." });
  if (d.mtr <= 0) errors.push({ workOrder: row.work_order_no, message: "Production quantity must be positive." });
  if (d.rejection < 0 || d.rejection > d.mtr)
    errors.push({ workOrder: row.work_order_no, message: "Rejection MTR is invalid." });
  if (stage === "ROLLING" && d.htc > d.mtr - d.rejection)
    errors.push({ workOrder: row.work_order_no, message: "HTC OK cannot exceed net Rolling production." });
  if (stage !== "ROLLING" && d.htc !== 0)
    errors.push({ workOrder: row.work_order_no, message: "HTC OK can only be entered at Rolling." });
  if (d.mtr > allowed + 0.000001)
    errors.push({
      workOrder: row.work_order_no,
      message: `Production ${d.mtr.toFixed(3)} MTR exceeds maximum allowed ${allowed.toFixed(3)} MTR.`,
    });

  return errors;
}