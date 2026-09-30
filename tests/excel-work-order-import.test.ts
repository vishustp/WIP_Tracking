import { describe, it, expect } from "vitest";
import {
  isOrderCompletedForImport,
  buildWorkOrderUpdatePayload,
  buildWorkOrderInsertPayload,
  validateWorkOrderImportRow,
} from "../lib/excelWorkOrderImport";

describe("Excel Work Order Import Rules", () => {
  describe("Rule 1: Balance to Make is NOT updated for existing orders", () => {
    it("buildWorkOrderUpdatePayload excludes balance_qty_pcs, balance_qty_mtr, balance_qty_mt", () => {
      const incomingRow = {
        work_order_no: "WO-2024-001",
        l1: 6.0,
        l2: 6.5,
        ordered_qty_pcs: 100,
        ordered_qty_mtr: 625,
        ordered_qty_mt: 15.2,
        balance_qty_pcs: 80,
        balance_qty_mtr: 500,
        balance_qty_mt: 12.1,
        balance_to_make_mtr: 500,
        current_status: "In Progress",
        po_no: "PO-999",
      };

      const updatePayload = buildWorkOrderUpdatePayload(incomingRow, {
        existsInDb: true,
        currentDbStatus: "In Progress",
      });

      // Crucial: balance fields must NOT be in the update payload for existing orders!
      expect(updatePayload).not.toHaveProperty("balance_qty_pcs");
      expect(updatePayload).not.toHaveProperty("balance_qty_mtr");
      expect(updatePayload).not.toHaveProperty("balance_qty_mt");
      expect(updatePayload).not.toHaveProperty("balance_to_make_mtr");

      // Other fields like lengths, ordered quantities, po details can be updated
      expect(updatePayload.ordered_qty_mtr).toBe(625);
      expect(updatePayload.po_no).toBe("PO-999");
      expect(updatePayload.status).toBeUndefined(); // Remains unchanged
    });

    it("buildWorkOrderInsertPayload includes initial balance quantities for new orders", () => {
      const incomingRow = {
        work_order_no: "WO-NEW-100",
        customer_name: "Test Customer",
        specification: "ASTM A106 Grade B",
        od: 60.3,
        wl: 3.91,
        ordered_qty_pcs: 100,
        ordered_qty_mtr: 625,
        ordered_qty_mt: 15.2,
        balance_qty_pcs: 100,
        balance_qty_mtr: 625,
        balance_qty_mt: 15.2,
        balance_to_make_mtr: 625,
        current_status: "Pending",
      };

      const insertPayload = buildWorkOrderInsertPayload(incomingRow);

      expect(insertPayload.balance_qty_pcs).toBe(100);
      expect(insertPayload.balance_qty_mtr).toBe(625);
      expect(insertPayload.balance_qty_mt).toBe(15.2);
      expect(insertPayload.status).toBe("Pending Plan");
    });
  });

  describe("Rule 2: Auto-completion on import for existing orders", () => {
    it("identifies order as completed if balance_to_make_mtr < 5", () => {
      expect(isOrderCompletedForImport({ balance_to_make_mtr: 4.8 })).toBe(true);
      expect(isOrderCompletedForImport({ balance_to_make_mtr: 0 })).toBe(true);
      expect(isOrderCompletedForImport({ balance_qty_mtr: 2.5 })).toBe(true);
      expect(isOrderCompletedForImport({ balance_to_make_mtr: 5.0 })).toBe(false);
      expect(isOrderCompletedForImport({ balance_to_make_mtr: 90 })).toBe(false);
    });

    it("identifies order as completed if current_status in Excel indicates completed", () => {
      expect(isOrderCompletedForImport({ current_status: "Completed" })).toBe(true);
      expect(isOrderCompletedForImport({ current_status: "completed" })).toBe(true);
      expect(isOrderCompletedForImport({ current_status: "Closed" })).toBe(true);
      expect(isOrderCompletedForImport({ current_status: "Done" })).toBe(true);
      expect(isOrderCompletedForImport({ current_status: "Dispatched" })).toBe(true);
      expect(isOrderCompletedForImport({ current_status: "In Progress" })).toBe(false);
    });

    it("sets status to Completed in update payload when balance < 5 mtr or status completed", () => {
      const rowUnder5 = {
        work_order_no: "WO-EXISTING-01",
        balance_to_make_mtr: 3.2,
        current_status: "In Progress",
      };

      const payload1 = buildWorkOrderUpdatePayload(rowUnder5, {
        existsInDb: true,
        currentDbStatus: "In Progress",
      });
      expect(payload1.status).toBe("Completed");

      const rowStatusCompleted = {
        work_order_no: "WO-EXISTING-02",
        balance_to_make_mtr: 25,
        current_status: "Completed",
      };

      const payload2 = buildWorkOrderUpdatePayload(rowStatusCompleted, {
        existsInDb: true,
        currentDbStatus: "Scheduled",
      });
      expect(payload2.status).toBe("Completed");
    });

    it("preserves Completed status if order was already Completed in DB", () => {
      const rowNormal = {
        work_order_no: "WO-EXISTING-03",
        balance_to_make_mtr: 50,
        current_status: "Pending",
      };

      const payload = buildWorkOrderUpdatePayload(rowNormal, {
        existsInDb: true,
        currentDbStatus: "Completed",
      });
      expect(payload.status).toBe("Completed");
    });
  });

  describe("Validation during Excel parsing", () => {
    it("allows existing order with status 'Completed' or balance < 5 to be parsed as valid", () => {
      const existingCompletedRow = {
        work_order_no: "WO-EXISTING",
        od: 60.3,
        wl: 3.91,
        ordered_qty_mtr: 500,
        balance_to_make_mtr: 0,
        current_status: "Completed",
      };

      const errors = validateWorkOrderImportRow(existingCompletedRow, { existsInDb: true });
      expect(errors).toHaveLength(0);
    });

    it("flags stub/empty order if new and both balance <= 5 and ordered <= 5", () => {
      const newStubRow = {
        work_order_no: "WO-NEW-STUB",
        od: 60.3,
        wl: 3.91,
        ordered_qty_mtr: 4,
        balance_to_make_mtr: 4,
        current_status: "Pending",
      };

      const errors = validateWorkOrderImportRow(newStubRow, { existsInDb: false });
      expect(errors.some((e) => e.includes("Bal to Make MTR"))).toBe(true);
    });
  });
});
