import { describe, it, expect } from "vitest";
import {
  n,
  fmt,
  fmtPcs,
  pcsFromMtr,
  mtrFromPcs,
  mtFromMtr,
  calc,
  calcElongationFactor,
  attachPcsToRemarks,
  extractPcsFromRemarks,
  attachCustomLengthToRemarks,
  extractCustomLengthFromRemarks,
  attachBandSawCutsToRemarks,
  extractBandSawCutsFromRemarks,
  normalizeSpecification,
  cleanRemarksFromSystemTags,
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

    it("attachBandSawCutsToRemarks() and extractBandSawCutsFromRemarks() handle nested JSON cut items and clean remarks", () => {
      const cuts = [
        { length_mtr: 5.8, cut_pcs: 25, cut_category: "PRIME" },
      ];
      const tagged = attachBandSawCutsToRemarks(
        "Tubes India Order 6430",
        cuts,
        25,
        96.3,
        0,
        5.0,
        0.03,
        3.7,
        6.0,
        6.0
      );

      const parsed = extractBandSawCutsFromRemarks(tagged);
      expect(parsed.cuts).toHaveLength(1);
      expect(parsed.cuts![0].len).toBe(5.8);
      expect(parsed.cuts![0].pcs).toBe(25);
      expect(parsed.cuts![0].cat).toBe("PRIME");
      expect(parsed.motherPcs).toBe(25);
      expect(parsed.yieldPct).toBe(96.3);
      expect(parsed.scrapMtr).toBe(5.0);
      expect(parsed.cleanRemarks).toBe("Tubes India Order 6430");

      // Verify extractPcsFromRemarks correctly extracts pieces and does not leave stray brackets
      const pcsData = extractPcsFromRemarks(tagged);
      expect(pcsData.pcs).toBe(25);
      expect(pcsData.cleanRemarks).toBe("Tubes India Order 6430");
    });

    it("extractBandSawCutsFromRemarks() cleans any leftover '}]' from previously corrupted remarks", () => {
      const corruptedRemarks = "}] [L1:6] [L2:6] [PCS:25]";
      const parsed = extractBandSawCutsFromRemarks(corruptedRemarks);
      expect(parsed.cleanRemarks).toBe("");

      const userTextCorrupted = "Smooth cut }] [L1:6] [L2:6] [PCS:25]";
      const parsedUser = extractBandSawCutsFromRemarks(userTextCorrupted);
      expect(parsedUser.cleanRemarks).toBe("Smooth cut");
    });

    it("Draw mass conservation: conserved drawn MT equals mother hollow rolled MT for equivalent pieces", () => {
      // 338 pieces drawn from MH 70 x 5.25 at 4.40m length
      const mhOd = 70;
      const mhWt = 5.25;
      const mhLen = 4.40;
      const pcs = 338;
      const totalMhMtr = pcs * mhLen;
      const totalConservedMt = mtFromMtr(totalMhMtr, mhOd, mhWt);
      expect(totalConservedMt).toBe(12.47);

      // When drawn to 60.3 x 3.91, mass conservation yields elongated length
      const finOd = 60.3;
      const finWt = 3.91;
      const factor = calcElongationFactor(mhOd, mhWt, finOd, finWt);
      const elongatedLen = Number((mhLen * factor).toFixed(3));
      const totalDrawnMtr = pcs * elongatedLen;
      const totalDrawnPipeMt = mtFromMtr(totalDrawnMtr, finOd, finWt);
      // Drawn pipe MT matches mother hollow MT to within rounding precision
      expect(totalDrawnPipeMt).toBe(12.47);
      expect(totalConservedMt).toBe(totalDrawnPipeMt);
    });

    it("Rolling Stage calc() uses Mother Hollow length (4.4m), not order final length (6.0m)", () => {
      const rollingOrder = {
        stage_code: "ROLLING",
        od: 60.3,
        wl: 3.91,
        l1: 6.0,
        l2: 6.0,
        avg_length: 6.0,
        mh_od: 70.0,
        mh_wt: 5.25,
        mh_l1: 4.4,
        mh_l2: 4.4,
        mh_avg_length: 4.4,
        pcs: "1826",
        mtr: "",
        rejection_pcs: "",
        rejection_mtr: "",
        htc_ok_pcs: "",
        htc_ok_mtr: "",
      };

      const result = calc(rollingOrder);
      // 1826 pieces * 4.4m = 8034.4m (NOT 1826 * 6.0 = 10956m)
      expect(result.avg).toBe(4.4);
      expect(result.mtr).toBe(8034.4);
    });
  });

  describe("8. Rolling HTC OK Pieces & Meters Accounting", () => {
    it("computes HTC OK pieces as output_pcs - rejection_pcs when no explicit HTC tag exists", () => {
      const outPcs = 76;
      const rejPcs = 0;
      const rejMtr = 0;
      const rawHtcMtr = 451.4;
      const outMtr = 341.24;

      const isRolling = true;
      const htcOkPcs = isRolling ? Math.max(0, outPcs - rejPcs) : 0;
      const htcOkMtr = isRolling ? (rawHtcMtr > 0 ? rawHtcMtr : Math.max(0, outMtr - rejMtr)) : 0;

      expect(htcOkPcs).toBe(76);
      expect(htcOkMtr).toBe(451.4);
      expect(fmt(htcOkPcs, 0)).toBe("76");
      expect(`${fmt(htcOkPcs, 0)} pcs (${fmt(htcOkMtr)}m)`).toBe("76 pcs (451.40m)");
    });

    it("correctly subtracts rejections from HTC OK pieces", () => {
      const outPcs = 76;
      const rejPcs = 4;
      const rawHtcMtr = 427.6;

      const isRolling = true;
      const htcOkPcs = isRolling ? Math.max(0, outPcs - rejPcs) : 0;
      expect(htcOkPcs).toBe(72);
      expect(`${fmt(htcOkPcs, 0)} pcs (${fmt(rawHtcMtr)}m)`).toBe("72 pcs (427.60m)");
    });

    it("extracts [HTC_OK_PCS:...] tag if present in remarks", () => {
      const remarks = "Shift A rolling passed [PCS:80] [REJ:2] [HTC_OK_PCS:78]";
      const htcMatch = remarks.match(/\[HTC(?:_OK)?(?:_PCS)?:(\d+)\]/i);
      expect(htcMatch).not.toBeNull();
      expect(parseInt(htcMatch![1], 10)).toBe(78);
    });

    it("cleanRemarksFromSystemTags() completely strips all backend tags and returns empty string if no user text", () => {
      expect(cleanRemarksFromSystemTags("[PCS:119]")).toBe("");
      expect(cleanRemarksFromSystemTags("[L1:11.8] [L2:11.8] [PCS:118]")).toBe("");
      expect(cleanRemarksFromSystemTags("[BUNDLE_TYPE: COMMERCIAL] [PCS:45]")).toBe("");
      expect(cleanRemarksFromSystemTags("[CUTS:{\"m_pcs\":10}] [PCS:10]")).toBe("");
      expect(cleanRemarksFromSystemTags("Shift A finished [PCS:119]")).toBe("Shift A finished");
      expect(cleanRemarksFromSystemTags("Visual OK [L1:6] [L2:6] [PCS:25] [REJ_PCS:2]")).toBe("Visual OK");
    });
  });
});



