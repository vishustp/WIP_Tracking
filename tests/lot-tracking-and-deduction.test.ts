import { describe, it, expect } from "vitest";
import { Row } from "../types";
import { mtFromMtr } from "../lib/productionUtils";

/**
 * Helper replicating the regex lot extraction used in app/api/production/queue/route.ts
 * and components/qc/QcInspectionClient.tsx for zero-downtime database compatibility.
 */
export function extractLotFromRemarks(remarks: string | null | undefined): string {
  if (!remarks || typeof remarks !== "string") return "";
  const match = remarks.match(/\[(?:HEAT_)?LOT:\s*([^\]]+)\]/i);
  return match ? match[1].trim() : "";
}

/**
 * Helper replicating VDI QC invariant equation validation:
 * Inspected Pieces must equal VDI OK + VDI Salvage + VDI Rejection.
 */
export function validateVdiEquation(
  inspectedPcs: number,
  okPcs: number,
  salvagePcs: number,
  rejectionPcs: number
): { valid: boolean; error?: string } {
  const sum = okPcs + salvagePcs + rejectionPcs;
  if (sum !== inspectedPcs) {
    return {
      valid: false,
      error: `Sum of VDI OK (${okPcs}) + Salvage (${salvagePcs}) + Rejection (${rejectionPcs}) must equal Inspected pieces (${inspectedPcs}). Currently: ${sum}.`,
    };
  }
  return { valid: true };
}

/**
 * Helper simulating Option 2 Multi-Lot Row Splitting & Per-Lot Consumption
 * for Band Saw and VDI queues.
 */
export function calculateLotQueueRows(
  baseQueueRow: Row,
  upstreamLots: Array<{ lot_no: string; pcs: number; mtr: number }>,
  downstreamConsumptionByLot: Map<string, { pcs: number; mtr: number }>,
  od: number,
  wt: number
): Row[] {
  if (!upstreamLots || upstreamLots.length === 0) {
    return [baseQueueRow];
  }

  const lotRows: Row[] = [];
  for (const lot of upstreamLots) {
    const consumed = downstreamConsumptionByLot.get(lot.lot_no) || { pcs: 0, mtr: 0 };
    const availPcs = Math.max(0, lot.pcs - consumed.pcs);
    const availMtr = Math.max(0, Number((lot.mtr - consumed.mtr).toFixed(3)));

    // Active WIP threshold: at least 1 piece or 1 meter
    if (availPcs >= 1 || availMtr >= 1.0) {
      const availMt = mtFromMtr(availMtr, od, wt);
      lotRows.push({
        ...baseQueueRow,
        id: `${baseQueueRow.work_order_id}_${lot.lot_no}`,
        heat_lot_no: lot.lot_no,
        heat_lots: [{ lot_no: lot.lot_no, pcs: availPcs, mtr: availMtr }],
        balance_to_make_pcs: availPcs,
        balance_to_make_mtr: availMtr,
        balance_to_make_mt: availMt,
      });
    }
  }

  return lotRows.length > 0 ? lotRows : [baseQueueRow];
}

describe("Option 2: Multi-Lot Queue Isolation & Per-Lot Deduction Tests", () => {
  const baseBandSawRow: Row = {
    id: "wo-6204",
    work_order_id: "wo-6204",
    work_order_no: "6204",
    customer_name: "Bharat Heavy Electricals Ltd",
    specification: "SAE-1018",
    od: 60.3,
    wl: 4.5,
    l1: 6.0,
    l2: 6.5,
    avg_length: 6.25,
    route_id: "r-cds",
    route_code: "CDS",
    route_name: "Cold Drawn Seamless",
    stage_code: "BAND_SAW",
    balance_to_make_pcs: 50,
    balance_to_make_mtr: 312.5,
    balance_to_make_mt: 1.936,
    max_allowed_mtr: 350,
    multiple: 2,
    ht_nos: 50,
    ht_input_nos: "",
    pcs: "50",
    mtr: "312.5",
    rejection_pcs: "0",
    rejection_mtr: "0",
    htc_ok_pcs: "50",
    htc_ok_mtr: "312.5",
    heat_lot_no: "",
    remarks: "",
  };

  const pipeOd = Number(baseBandSawRow.od || 0);
  const pipeWt = Number(baseBandSawRow.wl || 0);

  describe("1. Remarks Regex Lot Extraction (Zero-Downtime DB Fallback)", () => {
    it("extracts lot from [LOT: ...] format", () => {
      expect(extractLotFromRemarks("[LOT: HT-8842] Normal cut batch")).toBe("HT-8842");
    });

    it("extracts lot from [HEAT_LOT: ...] format", () => {
      expect(extractLotFromRemarks("[HEAT_LOT: L-1029] Annealed hollow")).toBe("L-1029");
    });

    it("is case-insensitive for lot tags", () => {
      expect(extractLotFromRemarks("[lot: abc-99]")).toBe("abc-99");
      expect(extractLotFromRemarks("[heat_lot: xyz-01]")).toBe("xyz-01");
    });

    it("trims whitespace inside the lot tag", () => {
      expect(extractLotFromRemarks("[LOT:   HT-7700   ]")).toBe("HT-7700");
    });

    it("returns empty string when no lot tag is present or remarks is null/empty", () => {
      expect(extractLotFromRemarks("Normal cutting shift output")).toBe("");
      expect(extractLotFromRemarks(null)).toBe("");
      expect(extractLotFromRemarks(undefined)).toBe("");
      expect(extractLotFromRemarks("")).toBe("");
    });
  });

  describe("2. Option 2 Multi-Lot Splitting for Band Saw Queue", () => {
    it("splits a multi-lot work order into independent queue rows with unique IDs", () => {
      const upstreamHtLots = [
        { lot_no: "LOT-A", pcs: 20, mtr: 125.0 },
        { lot_no: "LOT-B", pcs: 30, mtr: 187.5 },
      ];
      const downstreamConsumption = new Map<string, { pcs: number; mtr: number }>();

      const rows = calculateLotQueueRows(
        baseBandSawRow,
        upstreamHtLots,
        downstreamConsumption,
        pipeOd,
        pipeWt
      );

      expect(rows).toHaveLength(2);
      expect(rows[0].id).toBe("wo-6204_LOT-A");
      expect(rows[0].heat_lot_no).toBe("LOT-A");
      expect(rows[0].balance_to_make_pcs).toBe(20);
      expect(rows[0].balance_to_make_mtr).toBe(125.0);

      expect(rows[1].id).toBe("wo-6204_LOT-B");
      expect(rows[1].heat_lot_no).toBe("LOT-B");
      expect(rows[1].balance_to_make_pcs).toBe(30);
      expect(rows[1].balance_to_make_mtr).toBe(187.5);
    });

    it("deducts cut pieces strictly from the targeted lot without affecting other lots", () => {
      const upstreamHtLots = [
        { lot_no: "LOT-A", pcs: 20, mtr: 125.0 },
        { lot_no: "LOT-B", pcs: 30, mtr: 187.5 },
      ];

      // Operator records cutting 15 pieces from LOT-A only
      const downstreamConsumption = new Map<string, { pcs: number; mtr: number }>([
        ["LOT-A", { pcs: 15, mtr: 93.75 }],
      ]);

      const rows = calculateLotQueueRows(
        baseBandSawRow,
        upstreamHtLots,
        downstreamConsumption,
        pipeOd,
        pipeWt
      );

      expect(rows).toHaveLength(2);

      // LOT-A balance dropped: 20 - 15 = 5 pcs
      const lotARow = rows.find((r) => r.heat_lot_no === "LOT-A")!;
      expect(lotARow.balance_to_make_pcs).toBe(5);
      expect(lotARow.balance_to_make_mtr).toBe(31.25);

      // LOT-B balance remains untouched: 30 pcs
      const lotBRow = rows.find((r) => r.heat_lot_no === "LOT-B")!;
      expect(lotBRow.balance_to_make_pcs).toBe(30);
      expect(lotBRow.balance_to_make_mtr).toBe(187.5);
    });

    it("prunes a completed lot from the queue when its balance is fully consumed", () => {
      const upstreamHtLots = [
        { lot_no: "LOT-A", pcs: 20, mtr: 125.0 },
        { lot_no: "LOT-B", pcs: 30, mtr: 187.5 },
      ];

      // LOT-A is fully cut (20 pcs), LOT-B has 10 pcs cut
      const downstreamConsumption = new Map<string, { pcs: number; mtr: number }>([
        ["LOT-A", { pcs: 20, mtr: 125.0 }],
        ["LOT-B", { pcs: 10, mtr: 62.5 }],
      ]);

      const rows = calculateLotQueueRows(
        baseBandSawRow,
        upstreamHtLots,
        downstreamConsumption,
        pipeOd,
        pipeWt
      );

      // Only LOT-B should remain in active WIP
      expect(rows).toHaveLength(1);
      expect(rows[0].heat_lot_no).toBe("LOT-B");
      expect(rows[0].balance_to_make_pcs).toBe(20);
      expect(rows[0].balance_to_make_mtr).toBe(125.0);
    });
  });

  describe("3. Option 2 Multi-Lot Splitting for VDI QC Inspection Queue", () => {
    const baseVdiRow: Row = {
      ...baseBandSawRow,
      id: "wo-6204",
      stage_code: "VDI",
      balance_to_make_pcs: 100,
      balance_to_make_mtr: 625.0,
      balance_to_make_mt: 3.872,
    };

    it("generates separate VDI rows for Band Saw cut pieces by lot", () => {
      const bandSawCutLots = [
        { lot_no: "CUT-LOT-1", pcs: 40, mtr: 250.0 },
        { lot_no: "CUT-LOT-2", pcs: 60, mtr: 375.0 },
      ];
      const vdiInspectedByLot = new Map<string, { pcs: number; mtr: number }>();

      const rows = calculateLotQueueRows(
        baseVdiRow,
        bandSawCutLots,
        vdiInspectedByLot,
        pipeOd,
        pipeWt
      );

      expect(rows).toHaveLength(2);
      expect(rows[0].id).toBe("wo-6204_CUT-LOT-1");
      expect(rows[0].balance_to_make_pcs).toBe(40);
      expect(rows[1].id).toBe("wo-6204_CUT-LOT-2");
      expect(rows[1].balance_to_make_pcs).toBe(60);
    });

    it("deducts inspected pieces from specific lot and validates VDI equation", () => {
      const bandSawCutLots = [
        { lot_no: "CUT-LOT-1", pcs: 40, mtr: 250.0 },
        { lot_no: "CUT-LOT-2", pcs: 60, mtr: 375.0 },
      ];

      // Inspect 25 pcs from CUT-LOT-1 (20 OK, 3 Salvage, 2 Rejection = 25 Inspected)
      const eqValidation = validateVdiEquation(25, 20, 3, 2);
      expect(eqValidation.valid).toBe(true);

      const vdiInspectedByLot = new Map<string, { pcs: number; mtr: number }>([
        ["CUT-LOT-1", { pcs: 25, mtr: 156.25 }],
      ]);

      const rows = calculateLotQueueRows(
        baseVdiRow,
        bandSawCutLots,
        vdiInspectedByLot,
        pipeOd,
        pipeWt
      );

      const lot1 = rows.find((r) => r.heat_lot_no === "CUT-LOT-1")!;
      expect(lot1.balance_to_make_pcs).toBe(15); // 40 - 25 = 15

      const lot2 = rows.find((r) => r.heat_lot_no === "CUT-LOT-2")!;
      expect(lot2.balance_to_make_pcs).toBe(60); // Untouched
    });

    it("flags validation error when Inspected pieces does not equal sum of OK, Salvage, and Rejection", () => {
      // 20 OK + 3 Salvage + 1 Rejection = 24 !== 25 Inspected
      const eqValidation = validateVdiEquation(25, 20, 3, 1);
      expect(eqValidation.valid).toBe(false);
      expect(eqValidation.error).toContain("must equal Inspected pieces");
    });
  });

  describe("4. Lot Search and Filtering Behavior", () => {
    const queueRows: Row[] = [
      { ...baseBandSawRow, id: "wo-1_LOT-100", heat_lot_no: "LOT-100", work_order_no: "6101" },
      { ...baseBandSawRow, id: "wo-2_LOT-200", heat_lot_no: "LOT-200", work_order_no: "6202" },
      { ...baseBandSawRow, id: "wo-3_HEAT-99", heat_lot_no: "HEAT-99", work_order_no: "6303" },
    ];

    it("filters queue accurately by lot number search term", () => {
      const filter = (term: string) => {
        const q = term.toLowerCase().trim();
        return queueRows.filter(
          (r) =>
            r.work_order_no.toLowerCase().includes(q) ||
            (r.heat_lot_no || "").toLowerCase().includes(q)
        );
      };

      expect(filter("LOT-100")).toHaveLength(1);
      expect(filter("LOT-100")[0].work_order_no).toBe("6101");

      expect(filter("HEAT-99")).toHaveLength(1);
      expect(filter("HEAT-99")[0].work_order_no).toBe("6303");

      // Substring search matching multiple lots
      expect(filter("LOT")).toHaveLength(2);

      // Unmatched search returns empty
      expect(filter("NONEXISTENT")).toHaveLength(0);
    });
  });
});
