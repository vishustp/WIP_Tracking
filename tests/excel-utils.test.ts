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

  it("calculates column widths when generating worksheets", async () => {
    const XLSX = await getXlsx();
    const testData = [
      { "Declaration No": "REJ-2026-0001", "Customer": "BHEL Haridwar High Pressure Boiler Plant" },
    ];

    const ws = XLSX.utils.json_to_sheet(testData);
    const keys = Object.keys(testData[0]);
    ws['!cols'] = keys.map((key) => {
      let maxLen = key.length;
      for (const row of testData) {
        const val = (row as any)[key];
        if (val !== null && val !== undefined) {
          const str = String(val);
          if (str.length > maxLen) maxLen = Math.min(str.length, 50);
        }
      }
      return { wch: Math.max(maxLen + 3, 10) };
    });

    expect(ws['!cols']).toBeDefined();
    expect(ws['!cols']![0].wch).toBeGreaterThanOrEqual(16);
    expect(ws['!cols']![1].wch).toBeGreaterThanOrEqual(40);
  });
});
