/**
 * Dynamic Excel utility helper
 * Dynamically loads the `xlsx` package only when export or import is triggered,
 * reducing the initial bundle size by ~280KB (minified+gzipped) across all report & entry views.
 */

export async function getXlsx() {
  return await import('xlsx');
}

export async function getExcelJS() {
  const mod = await import('exceljs');
  return (mod as any).default || mod;
}

/**
 * Safely parses any Excel date representation (serial number, Date object, or text)
 * into a standard 'YYYY-MM-DD' ISO date string.
 */
export function parseExcelDate(val: unknown): string {
  if (!val) return '';
  if (val instanceof Date && !isNaN(val.getTime())) {
    return val.toISOString().slice(0, 10);
  }

  const str = String(val).trim();
  if (!str) return '';

  // Check if it's an Excel numeric serial date (e.g. 45180 or 45180.5)
  const numVal = Number(str);
  if (!isNaN(numVal) && numVal > 25569 && numVal < 100000) {
    // 25569 = Jan 1 1970 in Excel serial date
    const date = new Date(Math.round((numVal - 25569) * 86400 * 1000));
    if (!isNaN(date.getTime())) {
      return date.toISOString().slice(0, 10);
    }
  }

  // Check ISO YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = isoMatch[2].padStart(2, '0');
    const d = isoMatch[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // Check DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (dmyMatch) {
    const d = dmyMatch[1].padStart(2, '0');
    const m = dmyMatch[2].padStart(2, '0');
    const y = dmyMatch[3];
    return `${y}-${m}-${d}`;
  }

  // Try standard JS date parsing
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return str;
}

/**
 * Helper to trigger browser file download from an ExcelJS workbook.
 */
async function triggerWorkbookDownload(wb: any, fileName: string): Promise<void> {
  const buffer = await wb.xlsx.writeBuffer();
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }
}

/**
 * Applies full styling (borders, headers, zebra backgrounds, alignment) to a worksheet table.
 */
function formatWorksheetTable(
  ws: any,
  data: Record<string, any>[],
  colWidths?: { wch: number }[]
) {
  ws.views = [{ showGridLines: true }];
  if (!data || data.length === 0) return;

  const headers = Object.keys(data[0]);

  // Set columns & widths
  ws.columns = headers.map((header, idx) => {
    let width = 14;
    if (colWidths && colWidths[idx]?.wch) {
      width = Math.max(colWidths[idx].wch, 12);
    } else {
      let maxLen = header.length;
      for (const row of data) {
        const val = row[header];
        if (val !== null && val !== undefined) {
          const s = String(val);
          if (s.length > maxLen) maxLen = Math.min(s.length, 45);
        }
      }
      width = Math.max(maxLen + 4, 12);
    }
    return {
      header,
      key: header,
      width,
    };
  });

  // Style Header Row (Row 1)
  const headerRow = ws.getRow(1);
  headerRow.height = 26;
  headerRow.eachCell({ includeEmpty: true }, (cell: any) => {
    cell.font = {
      name: 'Segoe UI',
      size: 10,
      bold: true,
      color: { argb: 'FFFFFFFF' },
    };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E293B' }, // Dark Steel Navy (#1E293B)
    };
    cell.alignment = {
      vertical: 'middle',
      horizontal: 'center',
      wrapText: true,
    };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF0F172A' } },
      bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
      left: { style: 'thin', color: { argb: 'FF475569' } },
      right: { style: 'thin', color: { argb: 'FF475569' } },
    };
  });

  // Enable Excel AutoFilter across headers
  if (headers.length > 0) {
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: headers.length },
    };
  }

  // Style Data Rows
  const thinBorder = {
    top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  };

  data.forEach((rowObj, rIdx) => {
    const row = ws.addRow(rowObj);
    row.height = 20;
    const isOdd = rIdx % 2 === 1;

    row.eachCell({ includeEmpty: true }, (cell: any, colNumber: number) => {
      const headerKey = headers[colNumber - 1] || '';
      const isCodeOrDate =
        /^(#|sr|wo|date|route|status|stage|id|w\.no)/i.test(headerKey);
      const isNumeric = typeof cell.value === 'number';

      cell.font = {
        name: 'Segoe UI',
        size: 9.5,
        color: { argb: 'FF0F172A' },
      };
      cell.border = thinBorder;

      if (isOdd) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF8FAFC' },
        };
      }

      if (isNumeric) {
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
      } else if (isCodeOrDate) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      }
    });
  });
}

/**
 * Exports an array of JSON objects to an Excel (.xlsx) workbook with full borders,
 * styled headers, and auto-filters, then triggers browser download.
 */
export async function exportJsonToExcel(
  data: Record<string, any>[],
  sheetName: string,
  fileName: string,
  colWidths?: { wch: number }[]
): Promise<void> {
  const ExcelJS = await getExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Rashmi Green Hydrogen Steel Pvt. Ltd.';
  wb.created = new Date();

  const safeSheetName = (sheetName || 'Sheet1').replace(/[*?:/\\\[\]]/g, '_').slice(0, 31);
  const ws = wb.addWorksheet(safeSheetName, { views: [{ showGridLines: true }] });

  formatWorksheetTable(ws, data, colWidths);
  await triggerWorkbookDownload(wb, fileName);
}

/**
 * Exports multiple named sheets to a single Excel workbook with borders and header styles.
 */
export async function exportSheetsToExcel(
  sheets: { name: string; data: Record<string, any>[] }[],
  fileName: string
): Promise<void> {
  const ExcelJS = await getExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Rashmi Green Hydrogen Steel Pvt. Ltd.';
  wb.created = new Date();

  for (const s of sheets) {
    const safeSheetName = (s.name || 'Sheet').replace(/[*?:/\\\[\]]/g, '_').slice(0, 31);
    const ws = wb.addWorksheet(safeSheetName, { views: [{ showGridLines: true }] });
    formatWorksheetTable(ws, s.data);
  }

  await triggerWorkbookDownload(wb, fileName);
}

/**
 * Reads an ArrayBuffer or binary array and returns parsed JSON sheet data from the first sheet.
 */
export async function parseExcelBuffer<T = Record<string, unknown>>(
  buffer: ArrayBuffer | Uint8Array
): Promise<{ sheetName: string; records: T[] }> {
  const XLSX = await getXlsx();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('No worksheet found in Excel file.');
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error('Unable to read worksheet.');
  const records = XLSX.utils.sheet_to_json<T>(sheet, { defval: '', raw: false });
  return { sheetName, records };
}

/**
 * Reads all worksheets from an Excel workbook buffer and returns a map of sheetName -> records.
 */
export async function parseExcelWorkbook<T = Record<string, unknown>>(
  buffer: ArrayBuffer | Uint8Array
): Promise<{ sheetNames: string[]; sheets: Record<string, T[]> }> {
  const XLSX = await getXlsx();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetNames = workbook.SheetNames;
  if (!sheetNames || sheetNames.length === 0) throw new Error('No worksheets found in Excel file.');
  
  const sheets: Record<string, T[]> = {};
  for (const name of sheetNames) {
    const sheet = workbook.Sheets[name];
    if (sheet) {
      sheets[name] = XLSX.utils.sheet_to_json<T>(sheet, { defval: '', raw: false });
    } else {
      sheets[name] = [];
    }
  }
  return { sheetNames, sheets };
}
