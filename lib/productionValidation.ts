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
  if (d.pcs <= 0 && d.mtr <= 0) {
    errors.push({
      workOrder: row.work_order_no,
      message: "Production quantity (PCS or MTR) must be greater than zero.",
    });
  }

  // 3. Rejection checks (Strictly based on PCS if entered)
  if (d.rejectionPcs < 0 || d.rejection < 0) {
    errors.push({
      workOrder: row.work_order_no,
      message: "Rejection quantity cannot be negative.",
    });
  } else if (d.pcs > 0 && d.rejectionPcs > d.pcs) {
    errors.push({
      workOrder: row.work_order_no,
      message: `Rejection (${d.rejectionPcs} PCS) cannot exceed entered Production (${d.pcs} PCS).`,
    });
  } else if (d.pcs <= 0 && d.rejection > d.mtr + 0.001) {
    errors.push({
      workOrder: row.work_order_no,
      message: `Rejection (${fmt(d.rejection, " MTR")}) cannot exceed entered Production (${fmt(d.mtr, " MTR")}).`,
    });
  }

  // 4. Standard 4-Meter Scrap Rule (Universal Mill Rule)
  // Any output quantity yielding an average piece length under 4.0 meters (< 4.0 Mtr/pc or gross length < 4.0 Mtr)
  // must be rejected as off-cut scrap and cannot be recorded as prime production.
  if (d.pcs > 0 && d.mtr > 0) {
    const avgPieceLen = d.mtr / d.pcs;
    if (avgPieceLen < 3.999) {
      errors.push({
        workOrder: row.work_order_no,
        message: `Standard 4-Meter Scrap Rule: Output piece length (${avgPieceLen.toFixed(2)} Mtr/pc) is under 4.0 meters. Material below 4.0m is off-cut scrap and cannot be recorded as prime production. Please record this quantity under Rejection.`,
      });
    }
  } else if (d.pcs <= 0 && d.mtr > 0 && d.mtr < 3.999) {
    errors.push({
      workOrder: row.work_order_no,
      message: `Standard 4-Meter Scrap Rule: Output length (${fmt(d.mtr, " MTR")}) is under 4.0 meters. Material below 4.0m is off-cut scrap and cannot be recorded as prime production. Please record this quantity under Rejection.`,
    });
  }

  // 5. HTC OK stage-specific checks (Strictly required at Rolling)
  if (stage === "ROLLING") {
    if ((d.pcs > 0 || d.mtr > 0) && d.htcPcs <= 0 && d.htc <= 0) {
      errors.push({
        workOrder: row.work_order_no,
        message: "Rolling output recording strictly requires entering HTC OK Quantity (Pieces or Meters ≥ 1).",
      });
    } else if (d.htcPcs < 0 || d.htc < 0) {
      errors.push({
        workOrder: row.work_order_no,
        message: "HTC OK quantity cannot be negative.",
      });
    } else if (d.pcs > 0 && d.htcPcs > (d.pcs - d.rejectionPcs)) {
      errors.push({
        workOrder: row.work_order_no,
        message: `HTC OK (${d.htcPcs} PCS) cannot exceed Net Rolling Output (${Math.max(0, d.pcs - d.rejectionPcs)} PCS).`,
      });
    } else if (d.pcs <= 0 && d.htc > (d.mtr - d.rejection) + 0.001) {
      errors.push({
        workOrder: row.work_order_no,
        message: `HTC OK (${fmt(d.htc, " MTR")}) cannot exceed Net Rolling Output (${fmt(Math.max(0, d.mtr - d.rejection), " MTR")}).`,
      });
    }
  } else {
    if (d.htcPcs > 0 || d.htc > 0) {
      errors.push({
        workOrder: row.work_order_no,
        message: "HTC OK is only applicable at Rolling stage.",
      });
    }
  }

  // 6. Maximum Allowed Quantity Checks based on Nos (PCS) & Preceding Feeder WIP
  // RULE 1: Rolling Production can be more than 10% of the Rolling Plan.
  // There is NO hard 110% cap on Rolling production; rolling may exceed the plan as required by shop floor operations.
  const allowedPcs =
    stage === "ROLLING"
      ? 0 // No maximum ceiling for Rolling
      : n(row.max_allowed_pcs) > 0
      ? n(row.max_allowed_pcs)
      : n(row.balance_to_make_pcs);

  const allowedMtr =
    stage === "ROLLING"
      ? 0 // No maximum ceiling for Rolling
      : n(row.max_allowed_mtr) > 0
      ? n(row.max_allowed_mtr)
      : n(row.balance_to_make_mtr);

  const route = row.route_code || "HFS";

  if (allowedPcs <= 0 && allowedMtr <= 0 && stage !== "ROLLING") {
    let feederName = "preceding stage production";
    if (stage === "HOLLOW_HEAT_TREATMENT") feederName = "Rolling HTC OK";
    else if (stage === "DRAW") feederName = route.includes("ALLOY") ? "Hollow Heat Treatment Net OK" : "Rolling HTC OK";
    else if (stage === "HEAT_TREATMENT") feederName = "Draw Bench Net OK";
    else if (stage === "FINISHING") feederName = "VDI Inspection (QC Passed)";

    errors.push({
      workOrder: row.work_order_no,
      message: `No available feeder WIP for ${stage}. Please record and pass ${feederName} first.`,
    });
  } else if (stage !== "ROLLING" && d.pcs > 0 && allowedPcs > 0 && d.pcs > allowedPcs) {
    if (stage === "HOLLOW_HEAT_TREATMENT") {
      errors.push({
        workOrder: row.work_order_no,
        message: `Hollow Heat Treatment (${d.pcs} PCS) exceeds available Rolling HTC OK feeder balance (${fmt(allowedPcs)} PCS).`,
      });
    } else if (stage === "DRAW") {
      if (route.includes("ALLOY")) {
        errors.push({
          workOrder: row.work_order_no,
          message: `Draw Production (${d.pcs} PCS) exceeds available Hollow Heat Treatment Net OK (${fmt(allowedPcs)} PCS).`,
        });
      } else {
        errors.push({
          workOrder: row.work_order_no,
          message: `Draw Production (${d.pcs} PCS) exceeds available Rolling HTC OK feeder balance (${fmt(allowedPcs)} PCS).`,
        });
      }
    } else if (stage === "HEAT_TREATMENT") {
      errors.push({
        workOrder: row.work_order_no,
        message: `Heat Treatment Production (${d.pcs} PCS) exceeds available Draw Bench Net OK feeder balance (${fmt(allowedPcs)} PCS).`,
      });
    } else if (stage === "FINISHING") {
      errors.push({
        workOrder: row.work_order_no,
        message: `Finishing Production (${d.pcs} PCS) exceeds available VDI QC Passed material (${fmt(allowedPcs)} PCS).`,
      });
    } else {
      errors.push({
        workOrder: row.work_order_no,
        message: `Production (${d.pcs} PCS) exceeds maximum allowed feeder stock (${fmt(allowedPcs)} PCS).`,
      });
    }
  } else if (stage !== "FINISHING" && stage !== "ROLLING" && d.pcs <= 0 && d.mtr > 0 && allowedMtr > 0 && d.mtr > allowedMtr + 0.001) {
    errors.push({
      workOrder: row.work_order_no,
      message: `Production (${fmt(d.mtr, " MTR")}) exceeds maximum allowed feeder stock (${fmt(allowedMtr, " MTR")}).`,
    });
  }

  // 6. Finishing specific: Bundling cannot exceed 110% of total order quantity
  if (stage === "FINISHING") {
    const totalOrderPcs = Number(row.total_order_pcs || (row.total_order_mtr && d.avg > 0 ? Math.round(row.total_order_mtr / d.avg) : 0));
    if (totalOrderPcs > 0) {
      const max110Pcs = Math.round(totalOrderPcs * 1.10);
      const alreadyFinishedPcs = Number(row.finished_output_pcs || (d.avg > 0 ? Math.round(Number(row.finished_output_mtr || 0) / d.avg) : 0));
      if (d.pcs + alreadyFinishedPcs > max110Pcs) {
        errors.push({
          workOrder: row.work_order_no,
          message: `Finishing production (${d.pcs} PCS${alreadyFinishedPcs > 0 ? ` + already finished ${alreadyFinishedPcs} PCS` : ""}) exceeds maximum allowed 110% of Total Order Quantity (${totalOrderPcs} PCS, max capping is ${max110Pcs} PCS).`,
        });
      }
    }
  }

  return errors;
}


