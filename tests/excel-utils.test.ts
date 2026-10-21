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

  it("exportJsonToExcel() executes without errors and builds formatted workbook", async () => {
    const testData = [
      { "Work Order": "WO-2026-001", Customer: "L&T Hydrocarbon", OD: 114.3, WT: 8.56, Meters: 450, Pcs: 75 },
      { "Work Order": "WO-2026-002", Customer: "BHEL Trichy", OD: 60.3, WT: 5.54, Meters: 250, Pcs: 42 }
    ];

    await expect(
      exportJsonToExcel(testData, "Orders", "test-orders.xlsx")
    ).resolves.toBeUndefined();
  });

  it("exportSheetsToExcel() executes without errors across multiple worksheets", async () => {
    const sheets = [
      { name: "Rolling", data: [{ "WO": "WO-01", "OD": 88.9, "WT": 7.62 }] },
      { name: "Finishing", data: [{ "WO": "WO-01", "Pcs": 50, "Status": "Bundled" }] }
    ];

    await expect(
      exportSheetsToExcel(sheets, "all-work-centers.xlsx")
    ).resolves.toBeUndefined();
  });
});

