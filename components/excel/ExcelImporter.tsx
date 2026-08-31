'use client';

import { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { createClient } from '@/lib/supabase/client';
import { usePermissions, getFormAccess } from '@/lib/permissions';
import FormAccessBanner from '@/components/common/FormAccessBanner';
import {
  FileSpreadsheet,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Copy,
  ArrowRight,
  Filter,
  RefreshCw,
  Search,
  FileCheck,
  HelpCircle,
  Lock,
} from 'lucide-react';

type ImportRow = {
  work_order_no: string;
  customer_name: string;
  specification: string;
  od: number | null;
  wl: number | null;
  l1: number | null;
  l2: number | null;
  ordered_qty_pcs: number;
  ordered_qty_mtr: number;
  ordered_qty_mt: number;
  balance_qty_pcs: number;
  balance_qty_mtr: number;
  balance_qty_mt: number;
  current_status: string;
  balance_to_make_mtr: number;
  error?: string;
  duplicate?: boolean;
};

const clean = (value: unknown): string => String(value ?? '').trim();
const num = (value: unknown): number => {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
};

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

function findColumn(headers: string[], names: string[]) {
  const normalized = headers.map(normalizeHeader);
  for (const name of names) {
    const index = normalized.indexOf(normalizeHeader(name));
    if (index >= 0) return headers[index];
  }
  return undefined;
}

export default function ExcelImporter() {
  const { user } = usePermissions();
  const formAccess = useMemo(() => getFormAccess(user, 'excel_import'), [user]);
  const canCommit = formAccess.isAllowed;

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [message, setMessage] = useState('');
  const [fileName, setFileName] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'valid' | 'invalid'>('all');
  const [searchQuery, setSearchQuery] = useState('');

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
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) throw new Error('No worksheet found in Excel file.');
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) throw new Error('Unable to read worksheet.');
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false });
      if (!raw.length) {
        setMessage('Excel sheet is empty.');
        return;
      }

      const headers = Object.keys(raw[0]);
      const cWO = findColumn(headers, ['W.no', 'W.no.', 'W no', 'Work Order No', 'Work Order Number', 'WO']);
      const cCustomer = findColumn(headers, ['Customer', 'Customer Name', 'Client']);
      const cSpec = findColumn(headers, ['SPECIFICATION', 'Specification', 'Spec', 'Grade']);
      const cOD = findColumn(headers, ['OD', 'OD (mm)', 'Size OD']);
      const cWL = findColumn(headers, ['WL', 'Wall', 'Wall Thickness', 'WT', 'WT (mm)']);
      const cL1 = findColumn(headers, ['L1', 'L 1', 'Min Length']);
      const cL2 = findColumn(headers, ['L2', 'L 2', 'Max Length']);
      const cOrderPcs = findColumn(headers, ['Order Pcs', 'Order PCS', 'Order Qty Pcs']);
      const cOrderMtr = findColumn(headers, ['Order Metre', 'Order Mtr', 'Order MTR', 'Order Meter', 'Order Qty Mtr']);
      const cOrderMT = findColumn(headers, ['Order MT', 'Order Mt', 'Order Qty MT']);
      const cBalPcs = findColumn(headers, ['Balance Qty (Pcs) FOR BUNDLING', 'Balance Qty (Pcs)', 'Balance Qty Pcs']);
      const cBalMtr = findColumn(headers, ['Balance Qty (Mtr) FOR BUNDLING', 'Balance Qty (Mtr)', 'Balance Qty Mtr']);
      const cBalMT = findColumn(headers, ['Balance Qty (MT) FOR BUNDLING', 'Balance Qty (MT)', 'Balance Qty MT']);
      const cBalToMakeMtr = findColumn(headers, ['Bal to Make Mtr.', 'Bal to Make Mtr', 'Bal to Make MTR', 'Bal to Make Meter']);
      const cStatus = findColumn(headers, ['Current Status', 'Status']);

      if (!cWO) throw new Error(`Column "W.no" was not found in the Excel file.\n\nDetected columns:\n${headers.join(', ')}`);
      if (!cBalToMakeMtr)
        throw new Error(`Column "Bal to Make Mtr." was not found in the Excel file.\n\nDetected columns:\n${headers.join(', ')}`);

      const seen = new Set<string>();
      const parsed: ImportRow[] = raw.map((record) => {
        const wo = clean(record[cWO]);
        const currentStatus = cStatus ? clean(record[cStatus]) : '';
        const balanceToMakeMtr = num(record[cBalToMakeMtr]);
        const odVal = cOD ? num(record[cOD]) || null : null;
        const wlVal = cWL ? num(record[cWL]) || null : null;
        const l1Val = cL1 ? num(record[cL1]) || null : null;
        const l2Val = cL2 ? num(record[cL2]) || null : null;

        const row: ImportRow = {
          work_order_no: wo,
          customer_name: cCustomer ? clean(record[cCustomer]) : '',
          specification: cSpec ? clean(record[cSpec]) : '',
          od: odVal,
          wl: wlVal,
          l1: l1Val,
          l2: l2Val,
          ordered_qty_pcs: cOrderPcs ? num(record[cOrderPcs]) : 0,
          ordered_qty_mtr: cOrderMtr ? num(record[cOrderMtr]) : 0,
          ordered_qty_mt: cOrderMT ? num(record[cOrderMT]) : 0,
          balance_qty_pcs: cBalPcs ? num(record[cBalPcs]) : 0,
          balance_qty_mtr: cBalMtr ? num(record[cBalMtr]) : 0,
          balance_qty_mt: cBalMT ? num(record[cBalMT]) : 0,
          current_status: currentStatus,
          balance_to_make_mtr: balanceToMakeMtr,
        };

        const errors: string[] = [];
        if (!wo) errors.push('Work Order No missing');
        if (row.od === null || row.od <= 0) errors.push('OD missing or invalid');
        if (row.wl === null || row.wl <= 0) errors.push('WT/WL missing or invalid');
        if (row.od && row.wl && row.od <= row.wl) errors.push('OD must be greater than WT');
        if (row.ordered_qty_pcs <= 0 && row.ordered_qty_mtr <= 0 && row.ordered_qty_mt <= 0)
          errors.push('Order Qty missing');
        if (currentStatus && currentStatus.toLowerCase() !== 'pending')
          errors.push(`Status "${currentStatus}" is not Pending/blank`);
        if (balanceToMakeMtr <= 5) errors.push(`Bal to Make MTR (${balanceToMakeMtr}) ≤ 5`);

        row.duplicate = !!wo && seen.has(wo);
        if (row.duplicate) errors.push('Duplicate WO in file');
        if (wo) seen.add(wo);

        if (errors.length) row.error = errors.join(' • ');
        return row;
      });

      setRows(parsed);
      const eligible = parsed.filter((r) => !r.error).length;
      setMessage(
        `Parsed ${parsed.length} rows from "${sheetName}". ${eligible} eligible for database sync (Status: Blank/Pending, Bal MTR > 5).`
      );
    } catch (error) {
      setRows([]);
      setMessage(error instanceof Error ? error.message : 'Unable to read Excel file.');
    } finally {
      setParsing(false);
    }
  }

  async function importRows() {
    const validRows = rows.filter((row) => !row.error);
    if (!validRows.length) {
      setMessage('There are no rows meeting the import criteria.');
      return;
    }
    setLoading(true);
    setMessage('Importing eligible Work Orders…');
    try {
      const supabase = createClient();
      let imported = 0;
      let failed = 0;
      const errors: string[] = [];
      for (const row of validRows) {
        const { error } = await supabase.rpc('import_work_order', {
          p_work_order_no: row.work_order_no,
          p_customer_name: row.customer_name,
          p_specification: row.specification,
          p_od: row.od,
          p_wl: row.wl,
          p_l1: row.l1,
          p_l2: row.l2,
          p_ordered_qty_pcs: row.ordered_qty_pcs,
          p_ordered_qty_mtr: row.ordered_qty_mtr,
          p_ordered_qty_mt: row.ordered_qty_mt,
          p_balance_qty_pcs: row.balance_qty_pcs,
          p_balance_qty_mtr: row.balance_qty_mtr,
          p_balance_qty_mt: row.balance_qty_mt,
        });
        if (error) {
          failed++;
          if (errors.length < 5) errors.push(`${row.work_order_no}: ${error.message}`);
        } else {
          imported++;
        }
      }
      setMessage(
        failed
          ? `Import summary: ${imported} imported, ${failed} rejected. ${errors.join(' | ')}`
          : `✓ Success: All ${imported} eligible Work Orders have been synchronized.`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Import failed.');
    } finally {
      setLoading(false);
    }
  }

  function clearImport() {
    setRows([]);
    setMessage('');
    setFileName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const displayedRows = useMemo(() => {
    return rows.filter((r) => {
      if (filterMode === 'valid' && r.error) return false;
      if (filterMode === 'invalid' && !r.error) return false;
      if (
        searchQuery &&
        ![r.work_order_no, r.customer_name, r.specification, r.error]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(searchQuery.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [rows, filterMode, searchQuery]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">Excel Work Order Import</h1>
      </div>

      {/* Form Access Banner */}
      <FormAccessBanner access={formAccess} />

      {/* Drag-and-Drop Upload Zone */}
      <div
        className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-6 text-center transition hover:border-slate-400 hover:bg-slate-50/50"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files?.[0];
          if (file) void parseFile(file);
        }}
      >
        <div className="mx-auto flex max-w-md flex-col items-center space-y-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
            <UploadCloud className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-900">Drop Excel schedule (.xlsx, .xls, .csv)</p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void parseFile(file);
            }}
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={parsing}
            className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 disabled:opacity-50 transition-colors"
          >
            {parsing ? 'Parsing Sheet...' : 'Browse File'}
          </button>

          {fileName && (
            <div className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
              <FileCheck className="h-3.5 w-3.5 text-emerald-600" />
              <span>{fileName}</span>
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      {message && (
        <div
          className={`flex items-start gap-2.5 rounded-xl border p-4 text-xs ${
            message.includes('✓') || message.includes('eligible')
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-slate-200 bg-slate-50 text-slate-800'
          }`}
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
          <div className="leading-relaxed">{message}</div>
        </div>
      )}

      {/* 7. Interactive Pre-Import Diff & Validation Dashboard */}
      {rows.length > 0 && (
        <div className="space-y-4">
          {/* Validation Metrics */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
              <div className="text-xs text-slate-500 font-medium">Total Rows</div>
              <div className="mt-1 text-2xl font-bold text-slate-900">{stats.total}</div>
            </div>

            <button
              type="button"
              onClick={() => setFilterMode(filterMode === 'valid' ? 'all' : 'valid')}
              className={`rounded-xl border p-4 text-left shadow-xs transition-all ${
                filterMode === 'valid'
                  ? 'border-emerald-500 bg-emerald-50/50 ring-2 ring-emerald-500/20'
                  : 'border-emerald-200 bg-emerald-50/30 hover:bg-emerald-50/60'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-emerald-700">Eligible to Import</span>
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              </div>
              <div className="mt-1 text-2xl font-bold text-emerald-900">{stats.valid}</div>
            </button>

            <button
              type="button"
              onClick={() => setFilterMode(filterMode === 'invalid' ? 'all' : 'invalid')}
              className={`rounded-xl border p-4 text-left shadow-xs transition-all ${
                filterMode === 'invalid'
                  ? 'border-rose-500 bg-rose-50/50 ring-2 ring-rose-500/20'
                  : 'border-rose-200 bg-rose-50/30 hover:bg-rose-50/60'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-rose-700">Skipped / Issues</span>
                <AlertTriangle className="h-4 w-4 text-rose-600" />
              </div>
              <div className="mt-1 text-2xl font-bold text-rose-900">{stats.invalid}</div>
            </button>

            <div className="rounded-xl border border-amber-200 bg-amber-50/30 p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-amber-700">Duplicate WOs</span>
                <Copy className="h-4 w-4 text-amber-600" />
              </div>
              <div className="mt-1 text-2xl font-bold text-amber-900">{stats.duplicates}</div>
            </div>
          </div>

          {/* Table Controls */}
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center justify-between rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter preview rows..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 rounded-lg border border-slate-200 pl-8 pr-3 text-xs focus:border-slate-800"
                />
              </div>
              <div className="flex items-center rounded-lg border border-slate-200 p-0.5 text-xs font-medium text-slate-600">
                <button
                  type="button"
                  onClick={() => setFilterMode('all')}
                  className={`rounded-md px-2.5 py-1 ${filterMode === 'all' ? 'bg-slate-900 text-white' : 'hover:bg-slate-100'}`}
                >
                  All ({rows.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode('valid')}
                  className={`rounded-md px-2.5 py-1 ${filterMode === 'valid' ? 'bg-emerald-600 text-white' : 'hover:bg-slate-100'}`}
                >
                  Eligible ({stats.valid})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode('invalid')}
                  className={`rounded-md px-2.5 py-1 ${filterMode === 'invalid' ? 'bg-rose-600 text-white' : 'hover:bg-slate-100'}`}
                >
                  Issues ({stats.invalid})
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={clearImport}
                disabled={loading}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => void importRows()}
                disabled={loading || stats.valid === 0 || !canCommit}
                className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-semibold shadow-xs transition-colors ${
                  canCommit
                    ? 'bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50'
                    : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                }`}
              >
                {!canCommit && <Lock className="h-3.5 w-3.5" />}
                {loading ? 'Importing…' : !canCommit ? `Import ${stats.valid} Orders (View-Only)` : `Import ${stats.valid} Eligible Orders`}
              </button>
            </div>
          </div>

          {/* Validation & Diff Table */}
          <div className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-[1600px] w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-2.5 px-3 text-left font-semibold">Status / Diff</th>
                    <th className="py-2.5 px-3 text-left font-semibold">Work Order</th>
                    <th className="py-2.5 px-3 text-left font-semibold">Customer</th>
                    <th className="py-2.5 px-3 text-left font-semibold">Specification</th>
                    <th className="py-2.5 px-3 text-right font-semibold">OD (mm)</th>
                    <th className="py-2.5 px-3 text-right font-semibold">WT (mm)</th>
                    <th className="py-2.5 px-3 text-right font-semibold">L1 (m)</th>
                    <th className="py-2.5 px-3 text-right font-semibold">L2 (m)</th>
                    <th className="py-2.5 px-3 text-right font-semibold">Order PCS</th>
                    <th className="py-2.5 px-3 text-right font-semibold">Order MTR</th>
                    <th className="py-2.5 px-3 text-right font-semibold">Order MT</th>
                    <th className="py-2.5 px-3 text-right font-semibold">Bal to Make (MTR)</th>
                    <th className="py-2.5 px-3 text-left font-semibold">Current Status</th>
                    <th className="py-2.5 px-3 text-left font-semibold">Validation Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {displayedRows.slice(0, 150).map((r, i) => {
                    const isValid = !r.error;
                    return (
                      <tr
                        key={`${r.work_order_no}-${i}`}
                        className={`hover:bg-slate-50/60 transition-colors ${
                          isValid ? 'bg-emerald-50/10' : 'bg-rose-50/20'
                        }`}
                      >
                        <td className="py-2 px-3">
                          {isValid ? (
                            <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                              <CheckCircle2 className="h-3 w-3" /> Ready
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800">
                              <XCircle className="h-3 w-3" /> Skipped
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 font-bold text-slate-900">{r.work_order_no || '—'}</td>
                        <td className="py-2 px-3 text-slate-700 max-w-[140px] truncate">{r.customer_name || '—'}</td>
                        <td className="py-2 px-3 text-slate-600 max-w-[140px] truncate">{r.specification || '—'}</td>
                        <td
                          className={`py-2 px-3 text-right font-mono ${
                            !r.od || r.od <= 0 ? 'bg-red-50 text-red-700 font-bold' : ''
                          }`}
                        >
                          {r.od ?? '—'}
                        </td>
                        <td
                          className={`py-2 px-3 text-right font-mono ${
                            !r.wl || r.wl <= 0 ? 'bg-red-50 text-red-700 font-bold' : ''
                          }`}
                        >
                          {r.wl ?? '—'}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-slate-600">{r.l1 ?? '—'}</td>
                        <td className="py-2 px-3 text-right font-mono text-slate-600">{r.l2 ?? '—'}</td>
                        <td className="py-2 px-3 text-right font-mono">{r.ordered_qty_pcs || '—'}</td>
                        <td className="py-2 px-3 text-right font-mono font-medium">{r.ordered_qty_mtr || '—'}</td>
                        <td className="py-2 px-3 text-right font-mono">{r.ordered_qty_mt || '—'}</td>
                        <td
                          className={`py-2 px-3 text-right font-mono font-bold ${
                            r.balance_to_make_mtr <= 5 ? 'text-amber-700' : 'text-slate-900'
                          }`}
                        >
                          {r.balance_to_make_mtr}
                        </td>
                        <td className="py-2 px-3">
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                            {r.current_status || 'Blank'}
                          </span>
                        </td>
                        <td className="py-2 px-3 max-w-[260px] truncate text-slate-600">
                          {isValid ? (
                            <span className="text-emerald-700 font-medium">Eligible for creation/update</span>
                          ) : (
                            <span className="text-rose-700 font-medium">{r.error}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {displayedRows.length > 150 && (
              <div className="border-t border-slate-100 p-3 text-center text-xs text-slate-400">
                Showing first 150 of {displayedRows.length} matching rows.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
