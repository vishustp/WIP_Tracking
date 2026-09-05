// lib/productionValidation.ts
import { Row, StageCode } from "@/types";
import { n, calc, fmt } from "./productionUtils";

export type ValidationError = { workOrder: string; message: string };

export function validateProductionEntry(
  row: Row,
  stage: StageCode
): ValidationError[] {
  const errors: ValidationError[] = [];
  const d = calc(row);

  // 1. Average length / geometry check
  if (d.avg <= 0) {
    errors.push({
      workOrder: row.work_order_no,
      message: "Pipe/MH length is missing or invalid.",
    });
  }

  // 2. Production quantity check
  if (d.mtr <= 0 && d.pcs <= 0) {
    errors.push({
      workOrder: row.work_order_no,
      message: "Production quantity (PCS or MTR) must be greater than zero.",
    });
  }

  // 3. Rejection checks
  if (d.rejection < 0) {
    errors.push({
      workOrder: row.work_order_no,
      message: "Rejection quantity cannot be negative.",
    });
  } else if (d.rejection > d.mtr) {
    errors.push({
      workOrder: row.work_order_no,
      message: `Rejection (${fmt(d.rejection, " MTR")}) cannot exceed entered Production (${fmt(d.mtr, " MTR")}).`,
    });
  }

  // 4. HTC OK stage-specific checks (Only applicable at Rolling)
  if (stage === "ROLLING") {
    if (d.htc < 0) {
      errors.push({
        workOrder: row.work_order_no,
        message: "HTC OK quantity cannot be negative.",
      });
    } else if (d.htc > d.mtr - d.rejection) {
      errors.push({
        workOrder: row.work_order_no,
        message: `HTC OK (${fmt(d.htc, " MTR")}) cannot exceed Net Rolling Output (${fmt(d.mtr - d.rejection, " MTR")}).`,
      });
    }
  } else {
    if (d.htc > 0) {
      errors.push({
        workOrder: row.work_order_no,
        message: "HTC OK is only applicable at Rolling stage.",
      });
    }
  }

  // 5. Heat Treatment specific requirements (Heat Lot No. is optional / can be null)

  // 6. Maximum Allowed Quantity Checks based on Route & Stage Rules
  const allowed =
    n(row.max_allowed_mtr) > 0
      ? n(row.max_allowed_mtr)
      : stage === "ROLLING"
      ? n(row.balance_to_make_mtr) * 1.1
      : n(row.balance_to_make_mtr);

  const route = row.route_code || "HFS";

  if (allowed <= 0 && stage !== "ROLLING") {
    let feederName = "preceding stage production";
    if (route === "CDS") {
      if (stage === "DRAW") feederName = "Rolling HTC OK";
      else if (stage === "HEAT_TREATMENT") feederName = "Draw Bench production";
      else if (stage === "FINISHING") feederName = "Heat Treatment production";
    } else if (route === "ALLOY_CDS") {
      if (stage === "HOLLOW_HEAT_TREATMENT") feederName = "Rolling HTC OK";
      else if (stage === "DRAW") feederName = "Hollow Heat Treatment production";
      else if (stage === "HEAT_TREATMENT") feederName = "Draw Bench production";
      else if (stage === "FINISHING") feederName = "Heat Treatment production";
    } else if (route === "HFS") {
      if (stage === "FINISHING") feederName = "Rolling HTC OK";
    } else if (route === "ALLOY_HFS") {
      if (stage === "HOLLOW_HEAT_TREATMENT") feederName = "Rolling HTC OK";
      else if (stage === "FINISHING") feederName = "Hollow Heat Treatment production";
    }

    errors.push({
      workOrder: row.work_order_no,
      message: `No available WIP for ${stage}. Please record ${feederName} first.`,
    });
  } else if (allowed > 0 && d.mtr > allowed + 0.0001) {
    if (stage === "ROLLING") {
      const planDesc =
        row.is_master && (row.campaign_total_mtr || 0) > 0
          ? `Total Campaign Plan for Master + Child Orders (${fmt(row.campaign_total_mtr, " MTR")})`
          : `Plan (${fmt(row.balance_to_make_mtr || 0, " MTR")})`;
      errors.push({
        workOrder: row.work_order_no,
        message: `Rolling Production (${fmt(d.mtr, " MTR")}) exceeds maximum allowed 110% of Plan (${planDesc}), max capping is ${fmt(allowed, " MTR")}.`,
      });
    } else if (stage === "HOLLOW_HEAT_TREATMENT") {
      errors.push({
        workOrder: row.work_order_no,
        message: `Hollow Heat Treatment (${fmt(d.mtr, " MTR")}) exceeds available Rolling HTC OK (${fmt(allowed, " MTR")}).`,
      });
    } else if (stage === "DRAW") {
      if (route === "ALLOY_CDS") {
        errors.push({
          workOrder: row.work_order_no,
          message: `Draw Production (${fmt(d.mtr, " MTR")}) exceeds available Hollow Heat Treatment (${fmt(allowed, " MTR")}).`,
        });
      } else {
        errors.push({
          workOrder: row.work_order_no,
          message: `Draw Production (${fmt(d.mtr, " MTR")}) exceeds available Rolling HTC OK (${fmt(allowed, " MTR")}).`,
        });
      }
    } else if (stage === "HEAT_TREATMENT") {
      errors.push({
        workOrder: row.work_order_no,
        message: `Heat Treatment Production (${fmt(d.mtr, " MTR")}) exceeds available Draw bench Production (${fmt(allowed, " MTR")}).`,
      });
    } else if (stage === "FINISHING") {
      if (route === "HFS") {
        errors.push({
          workOrder: row.work_order_no,
          message: `Finishing Production (${fmt(d.mtr, " MTR")}) exceeds available Rolling HTC OK × Multiple or Balance to make (${fmt(allowed, " MTR")}).`,
        });
      } else if (route === "ALLOY_HFS") {
        errors.push({
          workOrder: row.work_order_no,
          message: `Finishing Production (${fmt(d.mtr, " MTR")}) exceeds available Hollow Heat Treatment × Multiple or Balance to make (${fmt(allowed, " MTR")}).`,
        });
      } else {
        errors.push({
          workOrder: row.work_order_no,
          message: `Finishing Production (${fmt(d.mtr, " MTR")}) exceeds available Heat Treatment × Multiple or Balance to make (${fmt(allowed, " MTR")}).`,
        });
      }
    } else {
      errors.push({
        workOrder: row.work_order_no,
        message: `Production (${fmt(d.mtr, " MTR")}) exceeds maximum allowed (${fmt(allowed, " MTR")}).`,
      });
    }
  }

  // 7. Finishing specific: Bundling cannot exceed 110% of total order quantity
  if (stage === "FINISHING" && row.total_order_mtr && row.total_order_mtr > 0) {
    const max110 = row.order_capping_mtr || Number((row.total_order_mtr * 1.10).toFixed(3));
    const alreadyFinished = Number(row.finished_output_mtr || 0);
    if (d.mtr + alreadyFinished > max110 + 0.0001) {
      errors.push({
        workOrder: row.work_order_no,
        message: `Finishing production (${fmt(d.mtr, " MTR")}${alreadyFinished > 0 ? ` + already finished ${fmt(alreadyFinished, " MTR")}` : ""}) exceeds maximum allowed 110% of Total Order Quantity (${fmt(row.total_order_mtr, " MTR")}, max capping is ${fmt(max110, " MTR")}).`,
      });
    }
  }

  return errors;
}


