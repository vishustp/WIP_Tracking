import { Row, StageCode } from "@/types";
import { n, calc, fmt, isHollowBankOrder } from "./productionUtils";

export type ValidationError = { workOrder: string; message: string };

export function validateProductionEntry(
  row: Row,
  stage?: StageCode
): ValidationError[] {
  if (isHollowBankOrder(row)) {
    return [{
      workOrder: row.work_order_no || "Hollow Bank",
      message: "Hollow Bank is dedicated yard buffer inventory and not available for production entry.",
    }];
  }

  const currentStage = stage || row.stage_code || "ROLLING";
  const errors: ValidationError[] = [];
  const d = calc({ ...row, stage_code: currentStage });

  // 1. Average length / geometry check
  if (d.avg <= 0) {
    errors.push({
      workOrder: row.work_order_no,
      message: "Pipe/MH length is missing or invalid.",
    });
  }

  // 2. Production quantity check (strictly requires > 0.00 m, > 0 PCS, and > 0.000 MT)
  if (d.pcs <= 0 || d.mtr <= 0 || d.mt <= 0) {
    errors.push({
      workOrder: row.work_order_no,
      message: "Production quantity must be greater than 0.00 m, 0 PCS, and 0.000 MT.",
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

  // 4. Standard 4-Meter Scrap Rule (Universal Mill Rule & Rule 5A)
  const isRollingMotherHollow = currentStage === "HOT_ROLLING" || currentStage === "ROLLING";
  const orderL1 = Number(row.l1 || 0);
  const orderL2 = Number(row.l2 || 0);
  const orderAvg = orderL1 > 0 && orderL2 > 0 ? (orderL1 + orderL2) / 2 : (orderL1 || orderL2 || Number(row.avg_length || 0));
  const inputL1 = Number(row.input_l1 || 0);
  const inputL2 = Number(row.input_l2 || 0);
  const inputAvg = inputL1 > 0 && inputL2 > 0 ? (inputL1 + inputL2) / 2 : (inputL1 || inputL2 || 0);
  const effectiveTargetLen = inputAvg > 0 ? inputAvg : orderAvg;

  const isOrderLenUnder4m =
    (orderL1 > 0 && orderL1 < 4.0) ||
    (orderL2 > 0 && orderL2 < 4.0) ||
    (effectiveTargetLen > 0 && effectiveTargetLen < 4.0);

  if (!isRollingMotherHollow && !isOrderLenUnder4m) {
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
  }

  // 5. HTC OK stage-specific checks (Strictly required at Rolling or HTC)
  if (currentStage === "ROLLING") {
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
  }

  // 6. Rolling Stage: Rolling production cannot exceed Rolling Plan Quantity (Strictly PCS / Nos)
  if (currentStage === "HOT_ROLLING" || currentStage === "ROLLING") {
    const planPcs =
      n(row.max_allowed_pcs) > 0
        ? n(row.max_allowed_pcs)
        : n(row.balance_to_make_pcs) > 0
        ? n(row.balance_to_make_pcs)
        : n(row.planned_pcs);

    if (planPcs <= 0) {
      errors.push({
        workOrder: row.work_order_no,
        message: "Rolling production cannot exceed Rolling Plan balance. Planned piece quantity has already been fully rolled for this plan.",
      });
    } else if (d.pcs > 0 && d.pcs > planPcs) {
      errors.push({
        workOrder: row.work_order_no,
        message: `Rolling production (${d.pcs} PCS) exceeds remaining Rolling Plan Quantity balance (${fmt(planPcs)} PCS).`,
      });
    }
  }

  // 7. Maximum Allowed Quantity Checks based on Nos (PCS) & Preceding Feeder WIP for downstream stages
  const allowedPcs =
    n(row.available_pcs) > 0
      ? n(row.available_pcs)
      : n(row.max_allowed_pcs) > 0
      ? n(row.max_allowed_pcs)
      : n(row.balance_to_make_pcs);

  const allowedMtr =
    n(row.available_mtr) > 0
      ? n(row.available_mtr)
      : n(row.max_allowed_mtr) > 0
      ? n(row.max_allowed_mtr)
      : n(row.balance_to_make_mtr);

  const route = row.route_code || "HFS";

  if (allowedPcs <= 0 && allowedMtr <= 0 && currentStage !== "ROLLING" && currentStage !== "HOT_ROLLING") {
    let feederName = "preceding stage production";
    if (currentStage === "HTC") feederName = "Hot Rolling Net OK";
    else if (currentStage === "HOLLOW_HEAT_TREATMENT") feederName = "Rolling HTC OK";
    else if (currentStage === "PILGER") feederName = "Rolling HTC OK";
    else if (currentStage === "DRAW") feederName = route.includes("ALLOY") ? "Hollow Heat Treatment Net OK" : "Rolling HTC OK";
    else if (currentStage === "HEAT_TREATMENT") feederName = route.includes("SS") ? "Cold Pilger Mill Net OK" : "Draw Bench Net OK";
    else if (currentStage === "BAND_SAW") feederName = route.includes("SS") ? "Heat Treatment Net OK" : (route.includes("HFS") ? (route.includes("ALLOY") ? "Hollow Heat Treatment Net OK" : "Rolling HTC OK") : "Heat Treatment Net OK");
    else if (currentStage === "VDI") feederName = "Band Saw Net Output";
    else if (currentStage === "FINISHING") feederName = "VDI Inspection (QC Passed)";

    errors.push({
      workOrder: row.work_order_no,
      message: `No available feeder WIP for ${currentStage}. Please record and pass ${feederName} first.`,
    });
  } else if (currentStage !== "ROLLING" && currentStage !== "HOT_ROLLING" && d.pcs > 0 && allowedPcs > 0 && d.pcs > allowedPcs) {
    if (currentStage === "HTC") {
      errors.push({
        workOrder: row.work_order_no,
        message: `HTC inspection (${d.pcs} PCS) exceeds available queue (${fmt(allowedPcs)} PCS) from Hot Rolling.`,
      });
    } else if (currentStage === "HOLLOW_HEAT_TREATMENT") {
      errors.push({
        workOrder: row.work_order_no,
        message: `Hollow Heat Treatment (${d.pcs} PCS) exceeds available Rolling HTC OK feeder balance (${fmt(allowedPcs)} PCS).`,
      });
    } else if (currentStage === "PILGER") {
      errors.push({
        workOrder: row.work_order_no,
        message: `Cold Pilger Mill (${d.pcs} PCS) exceeds available Rolling HTC OK feeder balance (${fmt(allowedPcs)} PCS).`,
      });
    } else if (currentStage === "DRAW") {
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
    } else if (currentStage === "HEAT_TREATMENT") {
      const htFeeder = route.includes("SS") ? "Cold Pilger Mill Net OK" : "Draw Bench Net OK";
      errors.push({
        workOrder: row.work_order_no,
        message: `Heat Treatment Production (${d.pcs} PCS) exceeds available ${htFeeder} feeder balance (${fmt(allowedPcs)} PCS).`,
      });
    } else if (currentStage === "BAND_SAW") {
      const bsFeeder = route.includes("SS") ? "Heat Treatment Net OK" : (route.includes("HFS") ? (route.includes("ALLOY") ? "Hollow Heat Treatment Net OK" : "HTC OK") : "Heat Treatment Net OK");
      errors.push({
        workOrder: row.work_order_no,
        message: `Band Saw Cutting (${d.pcs} PCS) exceeds available ${bsFeeder} feeder balance (${fmt(allowedPcs)} PCS).`,
      });
    } else if (currentStage === "VDI") {
      const vdiFeeder = route.includes("SS") ? "Heat Treatment Net OK" : (route.includes("HFS") ? (route.includes("ALLOY") ? "Hollow Heat Treatment Net OK" : "HTC OK") : "Heat Treatment Net OK");
      errors.push({
        workOrder: row.work_order_no,
        message: `VDI Inspection (${d.pcs} PCS) exceeds available ${vdiFeeder} feeder balance (${fmt(allowedPcs)} PCS).`,
      });
    } else if (currentStage === "FINISHING") {
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
  }

  // 6. Finishing specific: Bundling cannot exceed 110% of total order quantity
  if (currentStage === "FINISHING") {
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


