/**
 * Dynamic Excel utility helper
 * Dynamically loads the `xlsx` package only when export or import is triggered,
 * reducing the initial bundle size by ~280KB (minified+gzipped) across all report & entry views.
 */

export async function getXlsx() {
  return await import('xlsx');
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
 * Exports an array of JSON objects to an Excel (.xlsx) workbook and triggers browser download.
 */
export async function exportJsonToExcel(
  data: Record<string, any>[],
  sheetName: string,
  fileName: string
): Promise<void> {
  const XLSX = await getXlsx();
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, fileName);
}

/**
 * Exports multiple named sheets to a single Excel workbook.
 */
export async function exportSheetsToExcel(
  sheets: { name: string; data: Record<string, any>[] }[],
  fileName: string
): Promise<void> {
  const XLSX = await getXlsx();
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.json_to_sheet(s.data);
    XLSX.utils.book_append_sheet(wb, ws, s.name);
  }
  XLSX.writeFile(wb, fileName);
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
