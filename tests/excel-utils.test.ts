import { describe, it, expect } from "vitest";
import { getXlsx, exportJsonToExcel, exportSheetsToExcel, parseExcelBuffer } from "../lib/excelUtils";

describe("Excel Utilities (Dynamic XLSX)", () => {
  it("getXlsx() dynamically imports xlsx module", async () => {
    const XLSX = await getXlsx();
    expect(XLSX).toBeDefined();
    expect(typeof XLSX.utils.json_to_sheet).toBe("function");
    expect(typeof XLSX.read).toBe("function");
  });

  it("parseExcelBuffer() parses array buffer into structured JSON records", async () => {
    const XLSX = await getXlsx();
    const testData = [
      { "Work Order": "WO-101", Customer: "Acme Pipe", Meters: 500, Pieces: 83 },
      { "Work Order": "WO-102", Customer: "Apex Steel", Meters: 300, Pieces: 50 },
    ];

    const ws = XLSX.utils.json_to_sheet(testData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Schedule");

    // Write to binary array buffer
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });

    const result = await parseExcelBuffer(buf);
    expect(result.sheetName).toBe("Schedule");
    expect(result.records).toHaveLength(2);
    expect((result.records[0] as any)["Work Order"]).toBe("WO-101");
    expect(Number((result.records[0] as any)["Pieces"])).toBe(83);
  });
});
