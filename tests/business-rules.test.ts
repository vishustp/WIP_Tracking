import { describe, it, expect } from "vitest";
import { validateProductionEntry } from "../lib/productionValidation";
import { calc, mtFromMtr, mtrFromPcs } from "../lib/productionUtils";
import { Row } from "../types";

describe("Route-Specific Production Capping and Mother Hollow Rules", () => {
  const baseRow: Row = {
    work_order_id: "wo-1",
    work_order_no: "WO-001",
    customer_name: "Acme Corp",
    specification: "ASTM A312 TP304",
    od: 50.8,
    wl: 3.5,
    l1: 6.0,
    l2: 6.0,
    avg_length: 6.0,
    route_id: "r-cds",
    route_code: "CDS",
    route_name: "Cold Drawn Seamless",
    stage_code: "ROLLING",
    balance_to_make_mtr: 500,
    balance_to_make_pcs: 83.33,
    balance_to_make_mt: 2.07,
    max_allowed_mtr: 550, // 500 * 1.10
    multiple: 1,
    ht_nos: 83.33,
    ht_input_nos: "",
    pcs: "90",
    mtr: "540",
    rejection_pcs: "0",
    rejection_mtr: "0",
    htc_ok_pcs: "",
    htc_ok_mtr: "",
    heat_lot_no: "",
    remarks: "",
  };

  describe("Rule 5: Rolling Mtr and MT calculations from MH OD, MH WT, MH Length", () => {
    it("calculates MT based on Mother Hollow dimensions when provided at Rolling stage", () => {
      const rollingRow: Row = {
        ...baseRow,
        stage_code: "ROLLING",
        mh_od: 108.0,
        mh_wt: 10.0,
        mh_avg_length: 6.25,
        pcs: "10",
        mtr: "62.5", // 10 * 6.25
      };

      const result = calc(rollingRow);
      expect(result.avg).toBe(6.25);
      expect(result.effectiveOd).toBe(108.0);
      expect(result.effectiveWt).toBe(10.0);

      // Expected MT = (108 - 10) * 10 * 0.0246615 * 0.001 * 62.5
      const expectedMt = (108 - 10) * 10 * 0.0246615 * 0.001 * 62.5;
      expect(result.mt).toBeCloseTo(expectedMt, 4);
    });
  });

  describe("CDS Route Rules", () => {
    it("Rule 1: Allows rolling up to Plan * 110% and blocks when exceeding", () => {
      const row: Row = {
        ...baseRow,
        stage_code: "ROLLING",
        route_code: "CDS",
        max_allowed_mtr: 550,
        mtr: "540",
      };
      expect(validateProductionEntry(row, "ROLLING")).toHaveLength(0);

      const invalidRow: Row = { ...row, mtr: "560" };
      const errors = validateProductionEntry(invalidRow, "ROLLING");
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toContain("exceeds maximum allowed 110% of Plan");
    });

    it("Rule 2: Draw production is capped at Rolling HTC OK", () => {
      const drawRow: Row = {
        ...baseRow,
        stage_code: "DRAW",
        route_code: "CDS",
        prev_htc_ok: 500,
        max_allowed_mtr: 500,
        mtr: "490",
        htc_ok_mtr: "",
      };
      expect(validateProductionEntry(drawRow, "DRAW")).toHaveLength(0);

      const excessDraw: Row = { ...drawRow, mtr: "510" };
      const errors = validateProductionEntry(excessDraw, "DRAW");
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toContain("Rolling HTC OK");
    });

    it("Rule 3: Heat Treatment is capped at Draw Net Output and allows optional Heat Lot No.", () => {
      const htRow: Row = {
        ...baseRow,
        stage_code: "HEAT_TREATMENT",
        route_code: "CDS",
        max_allowed_mtr: 480,
        mtr: "480",
        heat_lot_no: "HT-12345",
      };
      expect(validateProductionEntry(htRow, "HEAT_TREATMENT")).toHaveLength(0);

      // Heat lot no can be null / empty string
      const noLot: Row = { ...htRow, heat_lot_no: "" };
      expect(validateProductionEntry(noLot, "HEAT_TREATMENT")).toHaveLength(0);
    });

    it("Rule 4: Finishing is capped at Heat Treatment * Multiple and Balance", () => {
      const finishRow: Row = {
        ...baseRow,
        stage_code: "FINISHING",
        route_code: "CDS",
        max_allowed_mtr: 480,
        mtr: "480",
      };
      expect(validateProductionEntry(finishRow, "FINISHING")).toHaveLength(0);

      const excessFinish: Row = { ...finishRow, mtr: "490" };
      const errors = validateProductionEntry(excessFinish, "FINISHING");
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toContain("Heat Treatment × Multiple or Balance to make");
    });

    it("Rule 4b: Finishing / Bundling cannot exceed 110% of total order quantity", () => {
      const finishRow: Row = {
        ...baseRow,
        stage_code: "FINISHING",
        route_code: "CDS",
        total_order_mtr: 1000,
        order_capping_mtr: 1100,
        max_allowed_mtr: 1500,
        mtr: "1100",
      };
      expect(validateProductionEntry(finishRow, "FINISHING")).toHaveLength(0);

      const excessFinish: Row = { ...finishRow, mtr: "1105" };
      const errors = validateProductionEntry(excessFinish, "FINISHING");
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toContain("exceeds maximum allowed 110% of Total Order Quantity");
    });

    it("Rule 5: Downstream Draw is blocked if Rolling has 0 or no HTC OK logged", () => {
      const zeroHtcDraw: Row = {
        ...baseRow,
        stage_code: "DRAW",
        route_code: "CDS",
        balance_to_make_mtr: 0,
        max_allowed_mtr: 0,
        mtr: "100",
      };
      const errors = validateProductionEntry(zeroHtcDraw, "DRAW");
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toContain("No available WIP for DRAW. Please record Rolling HTC OK first.");
    });
  });

  describe("ALLOY_CDS Route Rules", () => {
    it("Rule 1: Hollow Heat Treatment is capped at HTC OK", () => {
      const hhtRow: Row = {
        ...baseRow,
        stage_code: "HOLLOW_HEAT_TREATMENT",
        route_code: "ALLOY_CDS",
        max_allowed_mtr: 500,
        mtr: "500",
        heat_lot_no: "LOT-999",
      };
      expect(validateProductionEntry(hhtRow, "HOLLOW_HEAT_TREATMENT")).toHaveLength(0);

      const excessHht: Row = { ...hhtRow, mtr: "520" };
      const errors = validateProductionEntry(excessHht, "HOLLOW_HEAT_TREATMENT");
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toContain("Rolling HTC OK");
    });

    it("Rule 2: Draw is capped at Hollow Heat Treatment Net Output", () => {
      const drawRow: Row = {
        ...baseRow,
        stage_code: "DRAW",
        route_code: "ALLOY_CDS",
        max_allowed_mtr: 490,
        mtr: "490",
      };
      expect(validateProductionEntry(drawRow, "DRAW")).toHaveLength(0);

      const excessDraw: Row = { ...drawRow, mtr: "500" };
      const errors = validateProductionEntry(excessDraw, "DRAW");
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toContain("Hollow Heat Treatment");
    });
  });

  describe("HFS & ALLOY_HFS Route Rules", () => {
    it("HFS Rule 1: Finishing is capped at Rolling HTC OK * Multiple and Balance", () => {
      const finishRow: Row = {
        ...baseRow,
        stage_code: "FINISHING",
        route_code: "HFS",
        max_allowed_mtr: 500,
        mtr: "500",
      };
      expect(validateProductionEntry(finishRow, "FINISHING")).toHaveLength(0);

      const excessFinish: Row = { ...finishRow, mtr: "510" };
      const errors = validateProductionEntry(excessFinish, "FINISHING");
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toContain("Rolling HTC OK × Multiple or Balance to make");
    });

    it("ALLOY_HFS Rule 2: Finishing is capped at Hollow Heat Treatment * Multiple and Balance", () => {
      const finishRow: Row = {
        ...baseRow,
        stage_code: "FINISHING",
        route_code: "ALLOY_HFS",
        max_allowed_mtr: 490,
        mtr: "490",
      };
      expect(validateProductionEntry(finishRow, "FINISHING")).toHaveLength(0);

      const excessFinish: Row = { ...finishRow, mtr: "500" };
      const errors = validateProductionEntry(excessFinish, "FINISHING");
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toContain("Hollow Heat Treatment × Multiple or Balance to make");
    });
  });

  describe("PCS-based Production, Rejection & HTC OK calculations", () => {
    it("converts PCS input into MTR and MT for production, rejection and HTC OK", () => {
      const rowWithPcs: Row = {
        ...baseRow,
        avg_length: 6.0,
        pcs: "20",
        mtr: "120",
        rejection_pcs: "2",
        rejection_mtr: "12",
        htc_ok_pcs: "18",
        htc_ok_mtr: "108",
      };

      const result = calc(rowWithPcs);
      expect(result.pcs).toBe(20);
      expect(result.mtr).toBe(120);
      expect(result.rejectionPcs).toBe(2);
      expect(result.rejection).toBe(12);
      expect(result.htcPcs).toBe(18);
      expect(result.htc).toBe(108);
      expect(result.netMtr).toBe(108);
      expect(result.netPcs).toBe(18);
    });

    it("calculates PCS when only MTR is provided", () => {
      const rowWithMtrOnly: Row = {
        ...baseRow,
        avg_length: 6.0,
        pcs: "",
        mtr: "120",
        rejection_pcs: "",
        rejection_mtr: "12",
        htc_ok_pcs: "",
        htc_ok_mtr: "108",
      };

      const result = calc(rowWithMtrOnly);
      expect(result.pcs).toBe(20);
      expect(result.rejectionPcs).toBe(2);
      expect(result.htcPcs).toBe(18);
    });
  });
});

