// lib/productionValidation.ts
import { StageCode } from "@/types";
import { n, calc, fmt } from "./productionUtils";

export type ValidationError = { workOrder: string; message: string };

export function validateProductionEntry(
  row: any,
  stage: StageCode
): ValidationError[] {
  const errors: ValidationError[] = [];
  const d = calc(row);
  const allowed =
    n(row.max_allowed_mtr) > 0
      ? n(row.max_allowed_mtr)
      : n(row.balance_to_make_mtr);

  if (d.avg <= 0) {
    errors.push({ workOrder: row.work_order_no, message: "L1/L2 is missing." });
  }
  if (d.mtr <= 0) {
    errors.push({ workOrder: row.work_order_no, message: "Production quantity must be positive." });
  }
  if (d.rejection < 0 || d.rejection > d.mtr) {
    errors.push({ workOrder: row.work_order_no, message: "Rejection MTR is invalid." });
  }
  if (stage === "ROLLING" && d.htc > d.mtr - d.rejection) {
    errors.push({
      workOrder: row.work_order_no,
      message: "HTC OK cannot exceed net Rolling production.",
    });
  }
  if (stage !== "ROLLING" && d.htc !== 0) {
    errors.push({
      workOrder: row.work_order_no,
      message: "HTC OK can only be entered at Rolling.",
    });
  }
  if (d.mtr > allowed + 0.000001) {
    errors.push({
      workOrder: row.work_order_no,
      message: `Production ${fmt(d.mtr, " MTR")} exceeds maximum allowed ${fmt(allowed, " MTR")}.`,
    });
  }

  return errors;
}
