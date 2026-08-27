'use client';

import { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { createClient } from '@/lib/supabase/client';

type ImportRow = {
  work_order_no: string;
  customer_name: string;
  specification: string;
  od: number | null;
  wl: number | null;

  ordered_qty_pcs: number;
  ordered_qty_mtr: number;
  ordered_qty_mt: number;

  balance_qty_pcs: number;
  balance_qty_mtr: number;
  balance_qty_mt: number;

  error?: string;
  duplicate?: boolean;
};

const clean = (value: unknown): string => {
  return String(value ?? '').trim();
};

const num = (value: unknown): number => {
  if (value === null || value === undefined || value === '') {
    return 0;
  }

  const n = Number(
    String(value)
      .replace(/,/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  );

  return Number.isFinite(n) ? n : 0;
};

/**
 * Makes Excel headers tolerant of:
 * - NBSP
 * - <br>
 * - multiple spaces
 * - dots
 * - underscores
 * - hyphens
 * - different casing
 */
function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findColumn(
  headers: string[],
  names: string[]
): string | undefined {
  const normalizedHeaders = headers.map(normalizeHeader);

  for (const name of names) {
    const target = normalizeHeader(name);

    const index = normalizedHeaders.indexOf(target);

    if (index >= 0) {
      return headers[index];
    }
  }

  return undefined;
}

export default function ExcelImporter() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [rows, setRows] = useState<ImportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [message, setMessage] = useState('');
  const [fileName, setFileName] = useState('');

  const stats = useMemo(
    () => ({
      total: rows.length,
      valid: rows.filter((r) => !r.error).length,
      invalid: rows.filter((r) => !!r.error).length,
      duplicates: rows.filter((r) => r.duplicate).length,
    }),
    [rows]
  );

  async function parseFile(file: File) {
    setParsing(true);
    setMessage('');
    setRows([]);
    setFileName(file.name);

    try {
      const buffer = await file.arrayBuffer();

      const workbook = XLSX.read(buffer, {
        type: 'array',
        cellDates: true,
      });

      const sheetName = workbook.SheetNames[0];

      if (!sheetName) {
        throw new Error('No worksheet found in Excel file.');
      }

      const sheet = workbook.Sheets[sheetName];

      if (!sheet) {
        throw new Error('Unable to read worksheet.');
      }

      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(
        sheet,
        {
          defval: '',
          raw: false,
        }
      );

      if (!raw.length) {
        setMessage('Excel sheet is empty.');
        return;
      }

      const headers = Object.keys(raw[0]);

      /*
       * ACTUAL EXCEL COLUMN MAPPING
       *
       * W.no          -> Work Order No
       * Customer      -> Customer
       * SPECIFICATION -> Specification
       * OD            -> OD
       * WL            -> WL
       * Order Pcs     -> Order Qty Pcs
       * Order Metre   -> Order Qty Mtr
       * Order MT      -> Order Qty MT
       *
       * Balance Qty ... FOR BUNDLING
       *                  -> Balance Qty
       */

      const cWO = findColumn(headers, [
        'W.no',
        'W.no.',
        'W no',
        'W No',
        'W NO',
        'Work Order No',
        'Work Order Number',
      ]);

      const cCustomer = findColumn(headers, [
        'Customer',
        'Customer Name',
      ]);

      const cSpec = findColumn(headers, [
        'SPECIFICATION',
        'Specification',
        'Spec',
      ]);

      const cOD = findColumn(headers, [
        'OD',
        'OD (mm)',
      ]);

      const cWL = findColumn(headers, [
        'WL',
        'Wall',
        'Wall Thickness',
        'WT',
      ]);

      const cOrderPcs = findColumn(headers, [
        'Order Pcs',
        'Order PCS',
        'Order Qty Pcs',
      ]);

      const cOrderMtr = findColumn(headers, [
        'Order Metre',
        'Order Metre ',
        'Order Mtr',
        'Order MTR',
        'Order Meter',
        'Order Qty Mtr',
      ]);

      const cOrderMT = findColumn(headers, [
        'Order MT',
        'Order Mt',
        'Order Qty MT',
      ]);

      const cBalPcs = findColumn(headers, [
        'Balance Qty (Pcs) FOR BUNDLING',
        'Balance Qty (Pcs)   FOR BUNDLING',
        'Balance Qty (Pcs)',
        'Balance Qty Pcs',
      ]);

      const cBalMtr = findColumn(headers, [
        'Balance Qty (Mtr) FOR BUNDLING',
        'Balance Qty (Mtr)   FOR BUNDLING',
        'Balance Qty (Mtr)',
        'Balance Qty Mtr',
      ]);

      const cBalMT = findColumn(headers, [
        'Balance Qty (MT) FOR BUNDLING',
        'Balance Qty (MT)   FOR BUNDLING',
        'Balance Qty (MT)',
        'Balance Qty MT',
      ]);

      /*
       * Only W.no is mandatory.
       *
       * Other columns can be absent because some Excel exports
       * may not contain every optional field.
       */

      if (!cWO) {
        throw new Error(
          `Column "W.no" was not found in the Excel file.\n\nDetected columns:\n${headers.join(
            ', '
          )}`
        );
      }

      const seen = new Set<string>();

      const parsed: ImportRow[] = raw.map((record) => {
        const wo = clean(record[cWO]);

        const row: ImportRow = {
          work_order_no: wo,

          customer_name: cCustomer
            ? clean(record[cCustomer])
            : '',

          specification: cSpec
            ? clean(record[cSpec])
            : '',

          od: cOD
            ? num(record[cOD]) || null
            : null,

          wl: cWL
            ? num(record[cWL]) || null
            : null,

          ordered_qty_pcs: cOrderPcs
            ? num(record[cOrderPcs])
            : 0,

          ordered_qty_mtr: cOrderMtr
            ? num(record[cOrderMtr])
            : 0,

          ordered_qty_mt: cOrderMT
            ? num(record[cOrderMT])
            : 0,

          balance_qty_pcs: cBalPcs
            ? num(record[cBalPcs])
            : 0,

          balance_qty_mtr: cBalMtr
            ? num(record[cBalMtr])
            : 0,

          balance_qty_mt: cBalMT
            ? num(record[cBalMT])
            : 0,
        };

        const errors: string[] = [];

        if (!wo) {
          errors.push('Work Order No missing');
        }

        if (row.od === null || row.od <= 0) {
          errors.push('OD missing/invalid');
        }

        const hasOrderQty =
          row.ordered_qty_pcs > 0 ||
          row.ordered_qty_mtr > 0 ||
          row.ordered_qty_mt > 0;

        if (!hasOrderQty) {
          errors.push('Order Qty missing');
        }

        row.duplicate =
          !!wo && seen.has(wo);

        if (row.duplicate) {
          errors.push('Duplicate WO in this file');
        }

        if (wo) {
          seen.add(wo);
        }

        if (errors.length > 0) {
          row.error = errors.join('; ');
        }

        return row;
      });

      setRows(parsed);

      setMessage(
        `Loaded ${parsed.length} rows from "${sheetName}".`
      );
    } catch (error) {
      setRows([]);

      setMessage(
        error instanceof Error
          ? error.message
          : 'Unable to read Excel file.'
      );
    } finally {
      setParsing(false);
    }
  }

  async function importRows() {
    const validRows = rows.filter(
      (row) => !row.error
    );

    if (!validRows.length) {
      setMessage('There are no valid rows to import.');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const supabase = createClient();

      let imported = 0;
      let failed = 0;

      const errors: string[] = [];

      for (const row of validRows) {
        const { error } = await supabase.rpc(
          'import_work_order',
          {
            p_work_order_no:
              row.work_order_no,

            p_customer_name:
              row.customer_name,

            p_specification:
              row.specification,

            p_od:
              row.od,

            p_wl:
              row.wl,

            p_ordered_qty_pcs:
              row.ordered_qty_pcs,

            p_ordered_qty_mtr:
              row.ordered_qty_mtr,

            p_ordered_qty_mt:
              row.ordered_qty_mt,

            p_balance_qty_pcs:
              row.balance_qty_pcs,

            p_balance_qty_mtr:
              row.balance_qty_mtr,

            p_balance_qty_mt:
              row.balance_qty_mt,
          }
        );

        if (error) {
          failed++;

          if (errors.length < 5) {
            errors.push(
              `${row.work_order_no}: ${error.message}`
            );
          }
        } else {
          imported++;
        }
      }

      if (failed > 0) {
        setMessage(
          `Import completed: ${imported} successful, ${failed} failed.${
            errors.length
              ? ` Errors: ${errors.join(' | ')}`
              : ''
          }`
        );
      } else {
        setMessage(
          `Import completed successfully: ${imported} Work Orders imported.`
        );
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Import failed.'
      );
    } finally {
      setLoading(false);
    }
  }

  function clearImport() {
    setRows([]);
    setMessage('');
    setFileName('');

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">
          Excel Import
        </h1>

        <p className="mt-1 text-sm text-muted-foreground">
          Import Work Orders from the PPC Excel file.
        </p>
      </div>

      {/* Upload Area */}
      <div
        className="rounded-xl border-2 border-dashed p-8 text-center transition hover:bg-muted/30"
        onDragOver={(event) => {
          event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();

          const file =
            event.dataTransfer.files?.[0];

          if (file) {
            void parseFile(file);
          }
        }}
      >
        <div className="space-y-4">
          <div className="text-4xl">
            📊
          </div>

          <div>
            <p className="font-medium">
              Upload Excel File
            </p>

            <p className="mt-1 text-sm text-muted-foreground">
              Drag & drop your Excel file here
              or select it manually.
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(event) => {
              const file =
                event.target.files?.[0];

              if (file) {
                void parseFile(file);
              }
            }}
          />

          <button
            type="button"
            onClick={() =>
              fileInputRef.current?.click()
            }
            disabled={parsing}
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {parsing
              ? 'Reading Excel…'
              : 'Select Excel File'}
          </button>

          {fileName && (
            <p className="text-sm font-medium">
              Selected: {fileName}
            </p>
          )}
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className="whitespace-pre-wrap rounded-lg border p-3 text-sm">
          {message}
        </div>
      )}

      {/* Statistics */}
      {rows.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">
                Total Rows
              </div>
              <div className="mt-1 text-xl font-semibold">
                {stats.total}
              </div>
            </div>

            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">
                Valid
              </div>
              <div className="mt-1 text-xl font-semibold">
                {stats.valid}
              </div>
            </div>

            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">
                Invalid
              </div>
              <div className="mt-1 text-xl font-semibold">
                {stats.invalid}
              </div>
            </div>

            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">
                Duplicates
              </div>
              <div className="mt-1 text-xl font-semibold">
                {stats.duplicates}
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="overflow-auto rounded-xl border">
            <table className="min-w-[1200px] text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-2 text-left">
                    WO
                  </th>

                  <th className="p-2 text-left">
                    Customer
                  </th>

                  <th className="p-2 text-left">
                    Specification
                  </th>

                  <th className="p-2 text-right">
                    OD
                  </th>

                  <th className="p-2 text-right">
                    WL
                  </th>

                  <th className="p-2 text-right">
                    Order Pcs
                  </th>

                  <th className="p-2 text-right">
                    Order Mtr
                  </th>

                  <th className="p-2 text-right">
                    Order MT
                  </th>

                  <th className="p-2 text-right">
                    Balance Pcs
                  </th>

                  <th className="p-2 text-right">
                    Balance Mtr
                  </th>

                  <th className="p-2 text-right">
                    Balance MT
                  </th>

                  <th className="p-2 text-left">
                    Validation
                  </th>
                </tr>
              </thead>

              <tbody>
                {rows.slice(0, 100).map(
                  (row, index) => (
                    <tr
                      key={`${row.work_order_no}-${index}`}
                      className="border-b"
                    >
                      <td className="p-2 font-medium">
                        {row.work_order_no}
                      </td>

                      <td className="p-2">
                        {row.customer_name}
                      </td>

                      <td className="p-2">
                        {row.specification}
                      </td>

                      <td className="p-2 text-right">
                        {row.od ?? ''}
                      </td>

                      <td className="p-2 text-right">
                        {row.wl ?? ''}
                      </td>

                      <td className="p-2 text-right">
                        {row.ordered_qty_pcs || ''}
                      </td>

                      <td className="p-2 text-right">
                        {row.ordered_qty_mtr || ''}
                      </td>

                      <td className="p-2 text-right">
                        {row.ordered_qty_mt || ''}
                      </td>

                      <td className="p-2 text-right">
                        {row.balance_qty_pcs || ''}
                      </td>

                      <td className="p-2 text-right">
                        {row.balance_qty_mtr || ''}
                      </td>

                      <td className="p-2 text-right">
                        {row.balance_qty_mt || ''}
                      </td>

                      <td
                        className={`p-2 ${
                          row.error
                            ? 'font-medium'
                            : ''
                        }`}
                      >
                        {row.error || 'OK'}
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>

          {rows.length > 100 && (
            <p className="text-sm text-muted-foreground">
              Showing first 100 rows of {rows.length}.
            </p>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() =>
                void importRows()
              }
              disabled={
                loading ||
                parsing ||
                stats.valid === 0
              }
              className="rounded-lg bg-primary px-5 py-2.5 font-medium text-primary-foreground disabled:opacity-50"
            >
              {loading
                ? 'Importing…'
                : `Import ${stats.valid} Valid Rows`}
            </button>

            <button
              type="button"
              onClick={clearImport}
              disabled={loading}
              className="rounded-lg border px-5 py-2.5 font-medium disabled:opacity-50"
            >
              Clear
            </button>
          </div>
        </>
      )}
    </div>
  );
}
