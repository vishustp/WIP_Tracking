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

const clean = (value: unknown) => String(value ?? '').trim();

const num = (value: unknown): number => {
  if (value === null || value === undefined || value === '') return 0;

  const parsed = Number(
    String(value)
      .replace(/,/g, '')
      .replace(/\s+/g, '')
      .trim()
  );

  return Number.isFinite(parsed) ? parsed : 0;
};

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findColumn(headers: string[], names: string[]) {
  const normalizedHeaders = headers.map(normalize);

  for (const name of names) {
    const index = normalizedHeaders.indexOf(normalize(name));

    if (index >= 0) {
      return headers[index];
    }
  }

  return undefined;
}

export default function ExcelImporter() {
  const inputRef = useRef<HTMLInputElement>(null);

  const [rows, setRows] = useState<ImportRow[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [loading, setLoading] = useState(false);
  const [parsing, setParsing] = useState(false);

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const stats = useMemo(
    () => ({
      total: rows.length,
      valid: rows.filter((row) => !row.error).length,
      invalid: rows.filter((row) => !!row.error).length,
      duplicates: rows.filter((row) => row.duplicate).length,
    }),
    [rows]
  );

  async function parseFile(file: File) {
    setParsing(true);
    setMessage('');
    setError('');

    try {
      if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
        throw new Error('Please select an Excel file (.xlsx, .xls or .csv).');
      }

      setSelectedFile(file);

      const buffer = await file.arrayBuffer();

      const workbook = XLSX.read(buffer, {
        type: 'array',
        cellDates: true,
      });

      const sheetName = workbook.SheetNames[0];

      if (!sheetName) {
        throw new Error('No worksheet found in the selected file.');
      }

      const sheet = workbook.Sheets[sheetName];

      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: '',
        raw: false,
      });

      if (!raw.length) {
        setRows([]);
        setMessage('The selected Excel sheet is empty.');
        return;
      }

      const headers = Object.keys(raw[0]);

      const cWO = findColumn(headers, [
        'Work Order No',
        'Work Order',
        'WO',
        'W.O',
        'W.O.',
      ]);

      const cCustomer = findColumn(headers, [
        'Customer',
        'Customer Name',
      ]);

      const cSpec = findColumn(headers, [
        'SPECIFICATION',
        'Specification',
        'Spec',
        'Grade',
      ]);

      const cOD = findColumn(headers, [
        'OD',
        'Outside Diameter',
      ]);

      const cWL = findColumn(headers, [
        'WL',
        'WT',
        'Wall',
        'Wall Thickness',
      ]);

      const cOrderPcs = findColumn(headers, [
        'Order Pcs',
        'Order PCS',
        'Ordered Pcs',
        'Order Qty (Pcs)',
      ]);

      const cOrderMtr = findColumn(headers, [
        'Order Metre',
        'Order Metres',
        'Order Mtr',
        'Order MTR',
        'Order Meter',
        'Order Meters',
      ]);

      const cOrderMT = findColumn(headers, [
        'Order MT',
        'Ordered MT',
        'Order Qty (MT)',
      ]);

      const cBalPcs = findColumn(headers, [
        'Balance Qty (Pcs)',
        'Balance Qty (Pcs) FOR BUNDLING',
        'Balance Pcs',
        'Balance PCS',
      ]);

      const cBalMtr = findColumn(headers, [
        'Balance Qty (Mtr)',
        'Balance Qty (Mtr) FOR BUNDLING',
        'Balance Mtr',
        'Balance MTR',
      ]);

      const cBalMT = findColumn(headers, [
        'Balance Qty (MT)',
        'Balance Qty (MT) FOR BUNDLING',
        'Balance MT',
      ]);

      if (!cWO) {
        throw new Error(
          'Column "Work Order No" was not found in the Excel file.'
        );
      }

      const seen = new Set<string>();

      const parsed: ImportRow[] = raw.map((record) => {
        const workOrderNo = clean(record[cWO]);

        const row: ImportRow = {
          work_order_no: workOrderNo,

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

        const validationErrors: string[] = [];

        if (!workOrderNo) {
          validationErrors.push('Work Order No missing');
        }

        if (row.od === null || row.od <= 0) {
          validationErrors.push('OD missing/invalid');
        }

        if (
          row.ordered_qty_pcs <= 0 &&
          row.ordered_qty_mtr <= 0 &&
          row.ordered_qty_mt <= 0
        ) {
          validationErrors.push('Order Qty missing');
        }

        row.duplicate =
          !!workOrderNo && seen.has(workOrderNo);

        if (row.duplicate) {
          validationErrors.push(
            'Duplicate WO in this Excel file'
          );
        }

        if (workOrderNo) {
          seen.add(workOrderNo);
        }

        if (validationErrors.length) {
          row.error = validationErrors.join('; ');
        }

        return row;
      });

      setRows(parsed);

      setMessage(
        `Excel loaded successfully — ${parsed.length} row(s) found in "${sheetName}".`
      );
    } catch (err) {
      setRows([]);
      setSelectedFile(null);

      setError(
        err instanceof Error
          ? err.message
          : 'Unable to read the Excel file.'
      );
    } finally {
      setParsing(false);
    }
  }

  function handleFileChange(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];

    if (!file) return;

    void parseFile(file);
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();

    const file = event.dataTransfer.files?.[0];

    if (!file) return;

    void parseFile(file);
  }

  function clearFile() {
    setRows([]);
    setSelectedFile(null);
    setMessage('');
    setError('');

    if (inputRef.current) {
      inputRef.current.value = '';
    }
  }

  async function importRows() {
    const validRows = rows.filter((row) => !row.error);

    if (!validRows.length) {
      setError('There are no valid rows available for import.');
      return;
    }

    setLoading(true);
    setMessage('');
    setError('');

    try {
      const supabase = createClient();

      let imported = 0;
      let failed = 0;

      const failures: string[] = [];

      for (const row of validRows) {
        const { error: rpcError } = await supabase.rpc(
          'import_work_order',
          {
            p_work_order_no: row.work_order_no,
            p_customer_name: row.customer_name,
            p_specification: row.specification,
            p_od: row.od,
            p_wl: row.wl,
            p_ordered_qty_pcs: row.ordered_qty_pcs,
            p_ordered_qty_mtr: row.ordered_qty_mtr,
            p_ordered_qty_mt: row.ordered_qty_mt,
            p_balance_qty_pcs: row.balance_qty_pcs,
            p_balance_qty_mtr: row.balance_qty_mtr,
            p_balance_qty_mt: row.balance_qty_mt,
          }
        );

        if (rpcError) {
          failed++;

          failures.push(
            `${row.work_order_no}: ${rpcError.message}`
          );
        } else {
          imported++;
        }
      }

      if (failed === 0) {
        setMessage(
          `Import completed successfully — ${imported} Work Order(s) imported.`
        );
      } else {
        setMessage(
          `Import completed — ${imported} successful, ${failed} failed.`
        );

        if (failures.length) {
          setError(failures.slice(0, 5).join('\n'));
        }
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Import failed.'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Excel Import
        </h1>

        <p className="mt-1 text-sm text-muted-foreground">
          Import Work Orders for PPC planning.
        </p>
      </div>

      {/* UPLOAD CARD */}
      <div
        className="rounded-xl border bg-card p-6"
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-xl">
            ↑
          </div>

          <h2 className="text-base font-medium">
            Upload Work Order Excel
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            Drag & drop your Excel file here
          </p>

          <p className="mt-1 text-xs text-muted-foreground">
            Supported formats: .xlsx, .xls, .csv
          </p>

          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileChange}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={parsing || loading}
            className="mt-5 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {parsing ? 'Reading Excel…' : 'Select Excel File'}
          </button>
        </div>

        {/* SELECTED FILE */}
        {selectedFile && (
          <div className="mt-4 flex items-center justify-between rounded-lg border p-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {selectedFile.name}
              </p>

              <p className="mt-1 text-xs text-muted-foreground">
                {(selectedFile.size / 1024).toFixed(1)} KB
              </p>
            </div>

            <button
              type="button"
              onClick={clearFile}
              disabled={loading}
              className="ml-4 rounded-md border px-3 py-1.5 text-xs font-medium"
            >
              Remove
            </button>
          </div>
        )}
      </div>

      {/* SUCCESS */}
      {message && (
        <div className="whitespace-pre-line rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm">
          {message}
        </div>
      )}

      {/* ERROR */}
      {error && (
        <div className="whitespace-pre-line rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">
          {error}
        </div>
      )}

      {/* PREVIEW */}
      {rows.length > 0 && (
        <>
          {/* STATS */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-lg border bg-card p-4">
              <p className="text-xs text-muted-foreground">
                Total Rows
              </p>

              <p className="mt-1 text-2xl font-semibold">
                {stats.total}
              </p>
            </div>

            <div className="rounded-lg border bg-card p-4">
              <p className="text-xs text-muted-foreground">
                Valid
              </p>

              <p className="mt-1 text-2xl font-semibold">
                {stats.valid}
              </p>
            </div>

            <div className="rounded-lg border bg-card p-4">
              <p className="text-xs text-muted-foreground">
                Invalid
              </p>

              <p className="mt-1 text-2xl font-semibold">
                {stats.invalid}
              </p>
            </div>

            <div className="rounded-lg border bg-card p-4">
              <p className="text-xs text-muted-foreground">
                Duplicates
              </p>

              <p className="mt-1 text-2xl font-semibold">
                {stats.duplicates}
              </p>
            </div>
          </div>

          {/* TABLE */}
          <div className="rounded-xl border bg-card">
            <div className="flex items-center justify-between border-b p-4">
              <div>
                <h2 className="font-medium">
                  Import Preview
                </h2>

                <p className="text-xs text-muted-foreground">
                  Showing up to 100 rows
                </p>
              </div>

              <button
                type="button"
                onClick={clearFile}
                disabled={loading}
                className="rounded-lg border px-3 py-2 text-sm"
              >
                Clear
              </button>
            </div>

            <div className="overflow-auto">
              <table className="min-w-[1200px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-3 text-left">WO</th>
                    <th className="p-3 text-left">
                      Customer
                    </th>
                    <th className="p-3 text-left">
                      Specification
                    </th>
                    <th className="p-3 text-right">OD</th>
                    <th className="p-3 text-right">WL</th>
                    <th className="p-3 text-right">
                      Order Pcs
                    </th>
                    <th className="p-3 text-right">
                      Order Mtr
                    </th>
                    <th className="p-3 text-right">
                      Order MT
                    </th>
                    <th className="p-3 text-right">
                      Balance Pcs
                    </th>
                    <th className="p-3 text-right">
                      Balance Mtr
                    </th>
                    <th className="p-3 text-right">
                      Balance MT
                    </th>
                    <th className="p-3 text-left">
                      Validation
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {rows.slice(0, 100).map((row, index) => (
                    <tr
                      key={`${row.work_order_no}-${index}`}
                      className="border-b last:border-0"
                    >
                      <td className="p-3 font-medium">
                        {row.work_order_no}
                      </td>

                      <td className="p-3">
                        {row.customer_name}
                      </td>

                      <td className="p-3">
                        {row.specification}
                      </td>

                      <td className="p-3 text-right">
                        {row.od ?? ''}
                      </td>

                      <td className="p-3 text-right">
                        {row.wl ?? ''}
                      </td>

                      <td className="p-3 text-right">
                        {row.ordered_qty_pcs || ''}
                      </td>

                      <td className="p-3 text-right">
                        {row.ordered_qty_mtr || ''}
                      </td>

                      <td className="p-3 text-right">
                        {row.ordered_qty_mt || ''}
                      </td>

                      <td className="p-3 text-right">
                        {row.balance_qty_pcs || ''}
                      </td>

                      <td className="p-3 text-right">
                        {row.balance_qty_mtr || ''}
                      </td>

                      <td className="p-3 text-right">
                        {row.balance_qty_mt || ''}
                      </td>

                      <td
                        className={`p-3 ${
                          row.error
                            ? 'font-medium text-destructive'
                            : 'text-muted-foreground'
                        }`}
                      >
                        {row.error || 'OK'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* IMPORT ACTION */}
          <div className="flex items-center justify-between rounded-xl border bg-card p-4">
            <div>
              <p className="text-sm font-medium">
                Ready to import
              </p>

              <p className="mt-1 text-xs text-muted-foreground">
                {stats.valid} valid Work Order(s) will be imported.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void importRows()}
              disabled={
                loading ||
                parsing ||
                stats.valid === 0
              }
              className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading
                ? 'Importing…'
                : `Import ${stats.valid} Valid Rows`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
