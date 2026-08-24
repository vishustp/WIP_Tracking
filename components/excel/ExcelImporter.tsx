'use client';

import { useMemo, useState } from 'react';
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

const clean = (v: unknown) => String(v ?? '').trim();

const num = (v: unknown): number => {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
};

function findColumn(headers: string[], names: string[]) {
  const normalized = headers.map((h) =>
    h.toLowerCase().replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
  );
  for (const name of names) {
    const idx = normalized.indexOf(name.toLowerCase().replace(/\s+/g, ' ').trim());
    if (idx >= 0) return headers[idx];
  }
  return undefined;
}

export default function ExcelImporter() {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const stats = useMemo(() => ({
    total: rows.length,
    valid: rows.filter((r) => !r.error).length,
    invalid: rows.filter((r) => !!r.error).length,
    duplicates: rows.filter((r) => r.duplicate).length,
  }), [rows]);

  async function parseFile(file: File) {
    setMessage('');
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error('No worksheet found.');

    const sheet = workbook.Sheets[sheetName];
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: '',
      raw: false,
    });

    if (!raw.length) {
      setRows([]);
      setMessage('Excel sheet is empty.');
      return;
    }

    const headers = Object.keys(raw[0]);
    const cWO = findColumn(headers, ['Work Order No', 'Work Order']);
    const cCustomer = findColumn(headers, ['Customer']);
    const cSpec = findColumn(headers, ['SPECIFICATION', 'Specification']);
    const cOD = findColumn(headers, ['OD']);
    const cWL = findColumn(headers, ['WL']);

    const cOrderPcs = findColumn(headers, ['Order Pcs']);
    const cOrderMtr = findColumn(headers, ['Order Metre', 'Order Mtr', 'Order MTR']);
    const cOrderMT = findColumn(headers, ['Order MT']);

    const cBalPcs = findColumn(headers, [
      'Balance Qty (Pcs)',
      'Balance Qty (Pcs) FOR BUNDLING',
    ]);
    const cBalMtr = findColumn(headers, [
      'Balance Qty (Mtr)',
      'Balance Qty (Mtr) FOR BUNDLING',
    ]);
    const cBalMT = findColumn(headers, [
      'Balance Qty (MT)',
      'Balance Qty (MT) FOR BUNDLING',
    ]);

    if (!cWO) throw new Error('Column "Work Order No" was not found.');

    const seen = new Set<string>();

    const parsed: ImportRow[] = raw.map((r) => {
      const wo = clean(r[cWO]);
      const row: ImportRow = {
        work_order_no: wo,
        customer_name: cCustomer ? clean(r[cCustomer]) : '',
        specification: cSpec ? clean(r[cSpec]) : '',
        od: cOD ? num(r[cOD]) || null : null,
        wl: cWL ? num(r[cWL]) || null : null,
        ordered_qty_pcs: cOrderPcs ? num(r[cOrderPcs]) : 0,
        ordered_qty_mtr: cOrderMtr ? num(r[cOrderMtr]) : 0,
        ordered_qty_mt: cOrderMT ? num(r[cOrderMT]) : 0,
        balance_qty_pcs: cBalPcs ? num(r[cBalPcs]) : 0,
        balance_qty_mtr: cBalMtr ? num(r[cBalMtr]) : 0,
        balance_qty_mt: cBalMT ? num(r[cBalMT]) : 0,
      };

      const errors: string[] = [];
      if (!wo) errors.push('Work Order No missing');
      if (row.od === null || row.od <= 0) errors.push('OD missing/invalid');
      if (
        row.ordered_qty_pcs <= 0 &&
        row.ordered_qty_mtr <= 0 &&
        row.ordered_qty_mt <= 0
      ) errors.push('Order Qty missing');

      row.duplicate = !!wo && seen.has(wo);
      if (row.duplicate) errors.push('Duplicate WO in this file');
      if (wo) seen.add(wo);

      if (errors.length) row.error = errors.join('; ');
      return row;
    });

    setRows(parsed);
    setMessage(`Loaded ${parsed.length} rows from "${sheetName}".`);
  }

  async function importRows() {
    const valid = rows.filter((r) => !r.error);
    if (!valid.length) return;

    setLoading(true);
    setMessage('');

    try {
      const supabase = createClient();
      let imported = 0;
      let failed = 0;

      for (const row of valid) {
        const { error } = await supabase.rpc('import_work_order', {
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
        });

        if (error) failed++;
        else imported++;
      }

      setMessage(`Import completed: ${imported} successful, ${failed} failed.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Import failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Excel Import</h1>
        <p className="text-sm text-muted-foreground">
          Import only the Work Order fields required for PPC planning.
        </p>
      </div>

      <div
        className="rounded-xl border-2 border-dashed p-8 text-center"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files[0];
          if (file) void parseFile(file);
        }}
      >
        <p className="mb-3 text-sm">Drop Excel file here</p>
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void parseFile(file);
          }}
        />
      </div>

      {message && <div className="rounded-lg border p-3 text-sm">{message}</div>}

      {rows.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-lg border p-3">Rows: <b>{stats.total}</b></div>
            <div className="rounded-lg border p-3">Valid: <b>{stats.valid}</b></div>
            <div className="rounded-lg border p-3">Invalid: <b>{stats.invalid}</b></div>
            <div className="rounded-lg border p-3">Duplicates: <b>{stats.duplicates}</b></div>
          </div>

          <div className="overflow-auto rounded-xl border">
            <table className="min-w-[1100px] text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-2 text-left">WO</th>
                  <th className="p-2 text-left">Customer</th>
                  <th className="p-2 text-left">Specification</th>
                  <th className="p-2 text-right">OD</th>
                  <th className="p-2 text-right">WL</th>
                  <th className="p-2 text-right">Order Pcs</th>
                  <th className="p-2 text-right">Order Mtr</th>
                  <th className="p-2 text-right">Order MT</th>
                  <th className="p-2 text-right">Balance Pcs</th>
                  <th className="p-2 text-right">Balance Mtr</th>
                  <th className="p-2 text-right">Balance MT</th>
                  <th className="p-2 text-left">Validation</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 100).map((r, i) => (
                  <tr key={`${r.work_order_no}-${i}`} className="border-b">
                    <td className="p-2">{r.work_order_no}</td>
                    <td className="p-2">{r.customer_name}</td>
                    <td className="p-2">{r.specification}</td>
                    <td className="p-2 text-right">{r.od ?? ''}</td>
                    <td className="p-2 text-right">{r.wl ?? ''}</td>
                    <td className="p-2 text-right">{r.ordered_qty_pcs || ''}</td>
                    <td className="p-2 text-right">{r.ordered_qty_mtr || ''}</td>
                    <td className="p-2 text-right">{r.ordered_qty_mt || ''}</td>
                    <td className="p-2 text-right">{r.balance_qty_pcs || ''}</td>
                    <td className="p-2 text-right">{r.balance_qty_mtr || ''}</td>
                    <td className="p-2 text-right">{r.balance_qty_mt || ''}</td>
                    <td className="p-2">{r.error || 'OK'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            onClick={() => void importRows()}
            disabled={loading || stats.valid === 0}
            className="rounded-lg border px-4 py-2 font-medium disabled:opacity-50"
          >
            {loading ? 'Importing…' : `Import ${stats.valid} valid rows`}
          </button>
        </>
      )}
    </div>
  );
}
