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

  // 4. Standard 4-Meter Scrap Rule (Universal Mill Rule & Rule 5A)
  // Standard Rule: Any output quantity yielding an average piece length under 4.0 meters (< 4.0 Mtr/pc or gross length < 4.0 Mtr)
  // is treated as off-cut scrap and cannot be recorded as prime production.
  // Exceptions:
  // 1. Rule 5A: Does NOT apply when the customer work order length is explicitly < 4.0m (e.g. order specified L1/L2 < 4.0m).
  // 2. Mother Hollow: Does NOT apply for Mother Hollow from Rolling (stage === "ROLLING").
  const isRollingMotherHollow = stage === "ROLLING";
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
  }

  // 6. Rolling Stage Capping Rule: Rolling Production cannot exceed 110% (Plan + 10%) of the Rolling Plan
  if (stage === "ROLLING") {
    const plannedPcs = n(row.planned_pcs) > 0 ? n(row.planned_pcs) : n(row.campaign_total_pcs);
    const plannedMtr = n(row.planned_rolling_total) > 0 ? n(row.planned_rolling_total) : n(row.campaign_total_mtr);
    const max110Pcs = n(row.max_allowed_pcs) > 0 ? n(row.max_allowed_pcs) : (plannedPcs > 0 ? Math.round(plannedPcs * 1.10) : 0);
    const max110Mtr = n(row.max_allowed_mtr) > 0 ? n(row.max_allowed_mtr) : (plannedMtr > 0 ? Number((plannedMtr * 1.10).toFixed(2)) : 0);

    const prevGrossOutput = Number(row.prev_gross_output || 0);
    const prevGrossPcs = d.avg > 0 ? Math.round(prevGrossOutput / d.avg) : 0;

    if (max110Pcs > 0 && d.pcs > 0) {
      if (d.pcs + prevGrossPcs > max110Pcs) {
        errors.push({
          workOrder: row.work_order_no,
          message: `Rolling production (${d.pcs} PCS${prevGrossPcs > 0 ? ` + previously rolled ${prevGrossPcs} PCS` : ""}) exceeds maximum allowed 110% of Rolling Plan (limit: ${max110Pcs} PCS based on planned plan quantity).`,
        });
      }
    } else if (max110Mtr > 0 && d.mtr > 0) {
      if (d.mtr + prevGrossOutput > max110Mtr + 0.01) {
        errors.push({
          workOrder: row.work_order_no,
          message: `Rolling production (${fmt(d.mtr, " MTR")}${prevGrossOutput > 0 ? ` + previously rolled ${fmt(prevGrossOutput, " MTR")}` : ""}) exceeds maximum allowed 110% of Rolling Plan (limit: ${fmt(max110Mtr, " MTR")}).`,
        });
      }
    }
  }

  // 7. Maximum Allowed Quantity Checks based on Nos (PCS) & Preceding Feeder WIP for downstream stages
  const allowedPcs =
    n(row.max_allowed_pcs) > 0
      ? n(row.max_allowed_pcs)
      : n(row.balance_to_make_pcs);

  const allowedMtr =
    n(row.max_allowed_mtr) > 0
      ? n(row.max_allowed_mtr)
      : n(row.balance_to_make_mtr);

  const route = row.route_code || "HFS";

  if (allowedPcs <= 0 && allowedMtr <= 0 && stage !== "ROLLING") {
    let feederName = "preceding stage production";
    if (stage === "HOLLOW_HEAT_TREATMENT") feederName = "Rolling HTC OK";
    else if (stage === "DRAW") feederName = route.includes("ALLOY") ? "Hollow Heat Treatment Net OK" : "Rolling HTC OK";
    else if (stage === "HEAT_TREATMENT") feederName = "Draw Bench Net OK";
    else if (stage === "BAND_SAW") feederName = route.includes("HFS") ? (route.includes("ALLOY") ? "Hollow Heat Treatment Net OK" : "Rolling HTC OK") : "Heat Treatment Net OK";
    else if (stage === "VDI") feederName = "Band Saw Net Output";
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
    } else if (stage === "BAND_SAW") {
      const bsFeeder = route.includes("HFS") ? (route.includes("ALLOY") ? "Hollow Heat Treatment Net OK" : "Rolling HTC OK") : "Heat Treatment Net OK";
      errors.push({
        workOrder: row.work_order_no,
        message: `Band Saw Cutting (${d.pcs} PCS) exceeds available ${bsFeeder} feeder balance (${fmt(allowedPcs)} PCS).`,
      });
    } else if (stage === "VDI") {
      const vdiFeeder = route.includes("HFS") ? (route.includes("ALLOY") ? "Hollow Heat Treatment Net OK" : "Rolling HTC OK") : "Heat Treatment Net OK";
      errors.push({
        workOrder: row.work_order_no,
        message: `VDI Inspection (${d.pcs} PCS) exceeds available ${vdiFeeder} feeder balance (${fmt(allowedPcs)} PCS).`,
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


