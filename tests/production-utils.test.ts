import { describe, it, expect } from "vitest";
import {
  n,
  fmt,
  fmtPcs,
  pcsFromMtr,
  mtrFromPcs,
  mtFromMtr,
  calc,
  attachPcsToRemarks,
  extractPcsFromRemarks,
  attachCustomLengthToRemarks,
  extractCustomLengthFromRemarks,
  normalizeSpecification,
  calcElongationFactor,
} from "../lib/productionUtils";

describe("Production Utils Unit Tests", () => {
  describe("1. Numeric Parsing & Formatting", () => {
    it("n() parses valid numbers and defaults non-numeric/null values to 0", () => {
      expect(n(42)).toBe(42);
      expect(n("123.45")).toBe(123.45);
      expect(n(null)).toBe(0);
      expect(n(undefined)).toBe(0);
      expect(n("abc")).toBe(0);
      expect(n(NaN)).toBe(0);
    });

    it("fmt() formats PCS, NOS, PC, BUNDLE as whole integers", () => {
      expect(fmt(12.7, " PCS")).toBe("13 PCS");
      expect(fmt(100.2, " NOS")).toBe("100 NOS");
      expect(fmt(5.0, " BUNDLE")).toBe("5 BUNDLE");
      expect(fmt("invalid", " PCS")).toBe("—");
    });

    it("fmt() formats MTR and other float values with maximum 2 decimal places", () => {
      expect(fmt(123.456, " MTR")).toBe("123.46 MTR");
      expect(fmt(100.0, " MTR")).toBe("100.00 MTR");
      expect(fmt(55.5, " MT")).toBe("55.50 MT");
    });

    it("fmtPcs() strictly rounds and returns whole number string with PCS suffix", () => {
      expect(fmtPcs(15.8)).toBe("16 PCS");
      expect(fmtPcs("25.1")).toBe("25 PCS");
      expect(fmtPcs(0)).toBe("0 PCS");
      expect(fmtPcs(null)).toBe("0 PCS");
    });
  });

  describe("2. PCS, MTR, and MT Conversions", () => {
    it("pcsFromMtr() returns whole number integer from length", () => {
      expect(pcsFromMtr(60, 6.0)).toBe(10);
      expect(pcsFromMtr(62.5, 6.25)).toBe(10);
      expect(pcsFromMtr(63, 6.0)).toBe(11); // 63 / 6 = 10.5 -> rounds to 11
      expect(pcsFromMtr(50, 0)).toBe(0); // 0 length guard
    });

    it("mtrFromPcs() calculates Mtr to 2 decimal places based on whole pieces", () => {
      expect(mtrFromPcs(10, 6.25)).toBe(62.5);
      expect(mtrFromPcs(10.4, 6.0)).toBe(60); // rounds 10.4 -> 10 pcs * 6.0 = 60
      expect(mtrFromPcs(7, 6.3333)).toBe(44.33);
      expect(mtrFromPcs(5, 0)).toBe(0);
    });

    it("mtFromMtr() calculates MT to strict 2 decimal places using seamless pipe density formula", () => {
      // Formula: (OD - WT) * WT * 0.0246615 * 0.001 * Mtr
      // For OD = 50.8, WT = 3.5, Mtr = 100:
      // (50.8 - 3.5) * 3.5 * 0.0246615 * 0.001 * 100 = 47.3 * 3.5 * 0.0246615 * 0.1 = 0.40827... -> 0.41
      const mt = mtFromMtr(100, 50.8, 3.5);
      expect(mt).toBe(0.41);

      // Negative or zero dimensions guard
      expect(mtFromMtr(100, 0, 0)).toBe(0);
      expect(mtFromMtr(-50, 50.8, 3.5)).toBe(0);
      expect(mtFromMtr(100, 3.5, 5.0)).toBe(0); // OD < WT guard
    });
  });

  describe("3. Stage-Specific calc() Engine", () => {
    it("Rolling Stage: computes MT from MH OD, MH WT, and MH Length", () => {
      const rollingData = {
        stage_code: "ROLLING",
        od: 50.8,
        wl: 3.5,
        avg_length: 6.0,
        mh_od: 108.0,
        mh_wt: 10.0,
        mh_l1: 6.25,
        mh_l2: 6.25,
        pcs: "10",
        mtr: "62.5",
        rejection_pcs: "1",
        rejection_mtr: "6.25",
        htc_ok_pcs: "9",
        htc_ok_mtr: "56.25",
      };

      const res = calc(rollingData);
      expect(res.effectiveOd).toBe(108.0);
      expect(res.effectiveWt).toBe(10.0);
      expect(res.avg).toBe(6.25);
      expect(res.pcs).toBe(10);
      expect(res.mtr).toBe(62.5);
      expect(res.rejectionPcs).toBe(1);
      expect(res.netPcs).toBe(9);
      expect(res.netMtr).toBe(56.25);
      expect(res.htcPcs).toBe(9);
      expect(res.mt).toBe(1.51); // (108 - 10) * 10 * 0.0246615 * 0.001 * 62.5 = 1.51
    });

    it("Finishing Stage: allows independent PCS and MTR input without overriding from length", () => {
      const finishData = {
        stage_code: "FINISHING",
        od: 50.8,
        wl: 3.5,
        avg_length: 6.0,
        pcs: "15",
        mtr: "88.5", // independent measured meterage
        rejection_pcs: "0",
        rejection_mtr: "0",
        htc_ok_pcs: "",
        htc_ok_mtr: "",
      };

      const res = calc(finishData);
      expect(res.pcs).toBe(15);
      expect(res.mtr).toBe(88.5);
      expect(res.effectiveOd).toBe(50.8);
      expect(res.effectiveWt).toBe(3.5);
      // MT is calculated from 88.5m: 88.5 * 0.0040827 = 0.36 MT
      expect(res.mt).toBe(0.36);
    });
  });

  describe("4. Remark Tag Parsing & Attachment", () => {
    it("attaches PCS and REJ_PCS metadata tags to remarks", () => {
      const result = attachPcsToRemarks("Visual check OK", 25, 2);
      expect(result).toBe("Visual check OK [PCS:25] [REJ_PCS:2]");
    });

    it("extracts PCS and clean remarks from tagged string", () => {
      const extracted = extractPcsFromRemarks("Shift B rolled [PCS:50] [REJ_PCS:3]");
      expect(extracted.pcs).toBe(50);
      expect(extracted.rejPcs).toBe(3);
      expect(extracted.cleanRemarks).toBe("Shift B rolled");
    });
  });

  describe("5. Specification Normalization", () => {
    it("normalizes ASTM A106 variations to canonical ASTM A106 Gr.B / Gr.C", () => {
      expect(normalizeSpecification("A106 Gr.B")).toBe("ASTM A106 Gr.B");
      expect(normalizeSpecification("ASTM A106 Grade C")).toBe("ASTM A106 Gr.C");
    });

    it("normalizes ASME SA210 boiler specs", () => {
      expect(normalizeSpecification("SA210 Gr.A1")).toBe("ASME SA210 Gr.A1");
      expect(normalizeSpecification("SA210 Gr C")).toBe("ASME SA210 Gr.C");
    });

    it("normalizes Alloy P11 / P22 / P91 specifications", () => {
      expect(normalizeSpecification("A335 P11")).toBe("ASTM A335 Gr.P11");
      expect(normalizeSpecification("SA335 P22")).toBe("ASTM A335 Gr.P22");
      expect(normalizeSpecification("P91")).toBe("ASTM A335 Gr.P91");
    });
  });

  describe("6. Elongation Factor & Draw / Heat Treatment Calculations", () => {
    it("calcElongationFactor() accurately calculates area reduction ratio mu", () => {
      // MH: 60.3 x 5.25 -> (60.3 - 5.25)*5.25 = 289.0125
      // Final: 50.8 x 3.66 -> (50.8 - 3.66)*3.66 = 172.5324
      // Ratio: 289.0125 / 172.5324 = 1.6751
      const mu = calcElongationFactor(60.3, 5.25, 50.8, 3.66);
      expect(mu).toBe(1.6751);
    });

    it("calcElongationFactor() returns 1.0 when MH dimensions are absent or equal to final", () => {
      expect(calcElongationFactor(null, null, 50.8, 3.66)).toBe(1.0);
      expect(calcElongationFactor(50.8, 3.66, 50.8, 3.66)).toBe(1.0);
    });

    it("calc() calculates DRAW stage based on Final OD, WT, and average length of L1, L2 (theoretical fallback)", () => {
      const res = calc({
        avg_length: 6.5,
        pcs: "202",
        mtr: "",
        rejection_pcs: "2",
        rejection_mtr: "",
        htc_ok_pcs: "0",
        htc_ok_mtr: "0",
        od: 50.8,
        wl: 3.66,
        mh_od: 60.3,
        mh_wt: 5.25,
        mh_l1: 4.55,
        mh_l2: 4.55,
        stage_code: "DRAW",
      });

      expect(res.pcs).toBe(202);
      expect(res.rejectionPcs).toBe(2);
      expect(res.netPcs).toBe(200);
      expect(res.avg).toBe(6.5);
      expect(res.mtr).toBe(1313); // 202 * 6.5 = 1313
      expect(res.rejectionMtr).toBe(13); // 2 * 6.5 = 13
      expect(res.netMtr).toBe(1300); // 200 * 6.5 = 1300
      expect(res.effectiveOd).toBe(50.8);
      expect(res.effectiveWt).toBe(3.66);
    });

    it("calc() uses order L1 and L2 when provided for entries at DRAW / HT", () => {
      const res = calc({
        avg_length: null,
        l1: 7.5,
        l2: 8.5,
        pcs: "10",
        mtr: "",
        rejection_pcs: "1",
        rejection_mtr: "",
        htc_ok_pcs: "0",
        htc_ok_mtr: "0",
        od: 50.8,
        wl: 3.66,
        stage_code: "DRAW",
      });

      expect(res.avg).toBe(8.0); // (7.5 + 8.5) / 2
      expect(res.pcs).toBe(10);
      expect(res.mtr).toBe(80.0); // 10 * 8.0 = 80
      expect(res.rejectionMtr).toBe(8.0); // 1 * 8.0 = 8
      expect(res.netMtr).toBe(72.0); // 9 * 8.0 = 72
    });

    it("attachCustomLengthToRemarks() and extractCustomLengthFromRemarks() handle custom length metadata correctly", () => {
      const tagged = attachCustomLengthToRemarks("Pass 1 drawn", "7.5", "8.5", 8.0);
      expect(tagged).toBe("Pass 1 drawn [L1:7.5] [L2:8.5] [AVG:8.00]");

      const extracted = extractCustomLengthFromRemarks(tagged);
      expect(extracted.l1).toBe(7.5);
      expect(extracted.l2).toBe(8.5);
      expect(extracted.avg).toBe(8.0);
      expect(extracted.cleanRemarks).toBe("Pass 1 drawn");
    });
  });
});
