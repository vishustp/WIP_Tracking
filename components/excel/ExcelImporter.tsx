'use client';

import { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { createClient } from '@/lib/supabase/client';
import { usePermissions, getFormAccess } from '@/lib/permissions';
import FormAccessBanner from '@/components/common/FormAccessBanner';
import Link from 'next/link';
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
  Download,
  Calendar,
  Layers,
  Sparkles,
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
  target_date?: string;
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

const SAMPLE_EXCEL_DATA = [
  {
    'W.no': 'WO-2026-101',
    Customer: 'Apex High-Pressure Tubes Ltd',
    SPECIFICATION: 'ASTM A106 Gr.B Seamless Boiler Pipe',
    OD: 88.9,
    WL: 7.62,
    L1: 6.0,
    L2: 6.5,
    'Order Pcs': 192,
    'Order Metre': 1200,
    'Order MT': 18.3,
    'Balance Qty (Pcs) FOR BUNDLING': 192,
    'Balance Qty (Mtr) FOR BUNDLING': 1200,
    'Balance Qty (MT) FOR BUNDLING': 18.3,
    'Bal to Make Mtr.': 1200,
    'Target Date': '2026-09-25',
    'Current Status': 'Pending',
  },
  {
    'W.no': 'WO-2026-102',
    Customer: 'Reliance Hydro & Thermal Systems',
    SPECIFICATION: 'ASTM A335 P11 Alloy Steel Superheater',
    OD: 114.3,
    WL: 8.56,
    L1: 5.8,
    L2: 6.2,
    'Order Pcs': 142,
    'Order Metre': 850,
    'Order MT': 18.95,
    'Balance Qty (Pcs) FOR BUNDLING': 142,
    'Balance Qty (Mtr) FOR BUNDLING': 850,
    'Balance Qty (MT) FOR BUNDLING': 18.95,
    'Bal to Make Mtr.': 850,
    'Target Date': '2026-09-30',
    'Current Status': 'Pending',
  },
  {
    'W.no': 'WO-2026-103',
    Customer: 'Bharat Petrochemical Equipments',
    SPECIFICATION: 'ASTM A213 T22 Heat Exchanger Tube',
    OD: 60.3,
    WL: 5.54,
    L1: 6.0,
    L2: 6.4,
    'Order Pcs': 242,
    'Order Metre': 1500,
    'Order MT': 11.22,
    'Balance Qty (Pcs) FOR BUNDLING': 242,
    'Balance Qty (Mtr) FOR BUNDLING': 1500,
    'Balance Qty (MT) FOR BUNDLING': 11.22,
    'Bal to Make Mtr.': 1500,
    'Target Date': '2026-10-05',
    'Current Status': 'Pending',
  },
  {
    'W.no': 'WO-2026-104',
    Customer: 'L&T Heavy Engineering Division',
    SPECIFICATION: 'API 5L Gr.B Line Pipe Seamless',
    OD: 73.0,
    WL: 7.01,
    L1: 6.0,
    L2: 6.5,
    'Order Pcs': 320,
    'Order Metre': 2000,
    'Order MT': 22.8,
    'Balance Qty (Pcs) FOR BUNDLING': 320,
    'Balance Qty (Mtr) FOR BUNDLING': 2000,
    'Balance Qty (MT) FOR BUNDLING': 22.8,
    'Bal to Make Mtr.': 2000,
    'Target Date': '2026-10-12',
    'Current Status': 'Pending',
  },
  {
    'W.no': 'WO-2026-105',
    Customer: 'Thermax Energy Infrastructure',
    SPECIFICATION: 'DIN 17175 St45.8 High Temp Tube',
    OD: 51.0,
    WL: 4.5,
    L1: 5.5,
    L2: 6.0,
    'Order Pcs': 165,
    'Order Metre': 950,
    'Order MT': 4.9,
    'Balance Qty (Pcs) FOR BUNDLING': 165,
    'Balance Qty (Mtr) FOR BUNDLING': 950,
    'Balance Qty (MT) FOR BUNDLING': 4.9,
    'Bal to Make Mtr.': 950,
    'Target Date': '2026-10-18',
    'Current Status': 'Pending',
  },
];

export default function ExcelImporter() {
  const { user } = usePermissions();
  const formAccess = useMemo(() => getFormAccess(user, 'excel_import'), [user]);
  const canCommit = formAccess.isAllowed;

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [message, setMessage] = useState('');
  const [importSuccessCount, setImportSuccessCount] = useState<number | null>(null);
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

  const parseRecords = (raw: Record<string, unknown>[], sourceName: string) => {
    if (!raw.length) {
      setMessage('Excel sheet is empty.');
      return;
    }

    const headers = Object.keys(raw[0]);
    const cWO = findColumn(headers, ['W.no', 'W.no.', 'W no', 'Work Order No', 'Work Order Number', 'WO', 'Work Order', 'Order No', 'Order Number']);
    const cCustomer = findColumn(headers, ['Customer', 'Customer Name', 'Client', 'Buyer', 'Party Name', 'Party']);
    const cSpec = findColumn(headers, ['SPECIFICATION', 'Specification', 'Spec', 'Grade', 'Steel Grade', 'Material Spec']);
    const cOD = findColumn(headers, ['OD', 'OD (mm)', 'Size OD', 'Finished OD', 'Outer Diameter', 'Dia']);
    const cWL = findColumn(headers, ['WL', 'Wall', 'Wall Thickness', 'WT', 'WT (mm)', 'Thk', 'Thickness']);
    const cL1 = findColumn(headers, ['L1', 'L 1', 'Min Length', 'Length Min', 'L1 (m)']);
    const cL2 = findColumn(headers, ['L2', 'L 2', 'Max Length', 'Length Max', 'L2 (m)']);
    const cOrderPcs = findColumn(headers, ['Order Pcs', 'Order PCS', 'Order Qty Pcs', 'Ordered Pcs', 'Ordered PCS', 'Pcs']);
    const cOrderMtr = findColumn(headers, ['Order Metre', 'Order Mtr', 'Order MTR', 'Order Meter', 'Order Qty Mtr', 'Ordered Mtr', 'Quantity Mtr', 'Total Mtr']);
    const cOrderMT = findColumn(headers, ['Order MT', 'Order Mt', 'Order Qty MT', 'Ordered MT', 'Weight MT']);
    const cBalPcs = findColumn(headers, ['Balance Qty (Pcs) FOR BUNDLING', 'Balance Qty (Pcs)', 'Balance Qty Pcs', 'Balance Pcs', 'Bal Pcs']);
    const cBalMtr = findColumn(headers, ['Balance Qty (Mtr) FOR BUNDLING', 'Balance Qty (Mtr)', 'Balance Qty Mtr', 'Balance Mtr', 'Bal Mtr']);
    const cBalMT = findColumn(headers, ['Balance Qty (MT) FOR BUNDLING', 'Balance Qty (MT)', 'Balance Qty MT', 'Balance MT', 'Bal MT']);
    const cBalToMakeMtr = findColumn(headers, ['Bal to Make Mtr.', 'Bal to Make Mtr', 'Bal to Make MTR', 'Bal to Make Meter', 'Bal to Make (Mtr)', 'Balance to Make Mtr', 'Pending Mtr']);
    const cStatus = findColumn(headers, ['Current Status', 'Status', 'Order Status']);
    const cTargetDate = findColumn(headers, ['Target Date', 'Delivery Date', 'Target Delivery Date', 'Due Date', 'Promised Date', 'Schedule Date']);

    if (!cWO) {
      throw new Error(`Column "W.no" or "Work Order No" was not found in the Excel file.\n\nDetected columns:\n${headers.join(', ')}`);
    }

    const seen = new Set<string>();
    const parsed: ImportRow[] = raw.map((record) => {
      const wo = clean(record[cWO]);
      const currentStatus = cStatus ? clean(record[cStatus]) : '';
      
      const orderMtrVal = cOrderMtr ? num(record[cOrderMtr]) : 0;
      const orderPcsVal = cOrderPcs ? num(record[cOrderPcs]) : 0;
      const orderMTVal = cOrderMT ? num(record[cOrderMT]) : 0;

      const balMtrVal = cBalMtr ? num(record[cBalMtr]) : 0;
      const balPcsVal = cBalPcs ? num(record[cBalPcs]) : 0;
      const balMTVal = cBalMT ? num(record[cBalMT]) : 0;

      // Fallback balanceToMakeMtr from column or balMtr or orderMtr
      const balanceToMakeMtr = cBalToMakeMtr && record[cBalToMakeMtr] !== undefined && record[cBalToMakeMtr] !== ''
        ? num(record[cBalToMakeMtr])
        : balMtrVal > 0 ? balMtrVal : orderMtrVal;

      const odVal = cOD ? num(record[cOD]) || null : null;
      const wlVal = cWL ? num(record[cWL]) || null : null;
      const l1Val = cL1 ? num(record[cL1]) || null : 6.0;
      const l2Val = cL2 ? num(record[cL2]) || null : 6.5;
      const targetDateVal = cTargetDate ? clean(record[cTargetDate]) : undefined;

      const row: ImportRow = {
        work_order_no: wo,
        customer_name: cCustomer ? clean(record[cCustomer]) : '',
        specification: cSpec ? clean(record[cSpec]) : '',
        od: odVal,
        wl: wlVal,
        l1: l1Val,
        l2: l2Val,
        ordered_qty_pcs: orderPcsVal,
        ordered_qty_mtr: orderMtrVal,
        ordered_qty_mt: orderMTVal,
        balance_qty_pcs: balPcsVal > 0 ? balPcsVal : orderPcsVal,
        balance_qty_mtr: balMtrVal > 0 ? balMtrVal : balanceToMakeMtr,
        balance_qty_mt: balMTVal > 0 ? balMTVal : orderMTVal,
        current_status: currentStatus || 'Pending',
        balance_to_make_mtr: balanceToMakeMtr,
        target_date: targetDateVal,
      };

      const errors: string[] = [];
      if (!wo) errors.push('Work Order No missing');
      if (row.od === null || row.od <= 0) errors.push('OD missing or invalid');
      if (row.wl === null || row.wl <= 0) errors.push('WT/WL missing or invalid');
      if (row.od && row.wl && row.od <= row.wl) errors.push('OD must be greater than WT');
      if (row.ordered_qty_pcs <= 0 && row.ordered_qty_mtr <= 0 && row.ordered_qty_mt <= 0 && row.balance_to_make_mtr <= 0) {
        errors.push('Order Qty missing');
      }
      if (currentStatus && !['pending', 'in progress', 'open', 'scheduled', 'planned', ''].includes(currentStatus.toLowerCase())) {
        errors.push(`Status "${currentStatus}" is not eligible`);
      }
      if (balanceToMakeMtr <= 5 && row.ordered_qty_mtr <= 5) {
        errors.push(`Bal to Make MTR (${balanceToMakeMtr}) ≤ 5`);
      }

      row.duplicate = !!wo && seen.has(wo);
      if (row.duplicate) errors.push('Duplicate WO in file');
      if (wo) seen.add(wo);

      if (errors.length) row.error = errors.join(' • ');
      return row;
    });

    setRows(parsed);
    const eligible = parsed.filter((r) => !r.error).length;
    setMessage(
      `Parsed ${parsed.length} rows from "${sourceName}". ${eligible} eligible for database sync (Status: Pending/Blank, Bal MTR > 5).`
    );
  };

  async function parseFile(file: File) {
    setParsing(true);
    setMessage('');
    setImportSuccessCount(null);
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
      parseRecords(raw, sheetName);
    } catch (error) {
      setRows([]);
      setMessage(error instanceof Error ? error.message : 'Unable to read Excel file.');
    } finally {
      setParsing(false);
    }
  }

  const loadSampleData = () => {
    setFileName('Sample_Pipe_Mill_Schedule.xlsx');
    setImportSuccessCount(null);
    parseRecords(SAMPLE_EXCEL_DATA as any, 'Sample Schedule');
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet(SAMPLE_EXCEL_DATA);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Work_Orders_Schedule');
    XLSX.writeFile(wb, 'Seamless_Pipe_Work_Orders_Template.xlsx');
  };

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
      
      // Try batch import RPC
      const batchPayload = validRows.map((r) => ({
        work_order_no: r.work_order_no,
        customer_name: r.customer_name,
        specification: r.specification,
        od: r.od,
        wl: r.wl,
        l1: r.l1,
        l2: r.l2,
        ordered_qty_pcs: r.ordered_qty_pcs,
        ordered_qty_mtr: r.ordered_qty_mtr,
        ordered_qty_mt: r.ordered_qty_mt,
        balance_qty_pcs: r.balance_qty_pcs,
        balance_qty_mtr: r.balance_qty_mtr,
        balance_qty_mt: r.balance_qty_mt,
        balance_to_make_mtr: r.balance_to_make_mtr,
        target_date: r.target_date,
        current_status: r.current_status,
      }));

      let imported = 0;
      let failed = 0;
      const errors: string[] = [];

      try {
        const { data, error } = await supabase.rpc('import_work_orders_batch', {
          p_rows: batchPayload,
        });

        if (!error && data !== undefined) {
          imported = Number(data) || validRows.length;
        } else {
          // Fallback to row-by-row import
          for (const row of validRows) {
            const { error: rpcErr } = await supabase.rpc('import_work_order', {
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
            if (rpcErr) {
              failed++;
              if (errors.length < 5) errors.push(`${row.work_order_no}: ${rpcErr.message}`);
            } else {
              imported++;
            }
          }
        }
      } catch (error) {
        throw error;
      }



      setImportSuccessCount(imported);
      setMessage(
        failed
          ? `Import summary: ${imported} imported, ${failed} rejected. ${errors.join(' | ')}`
          : `✓ Success: All ${imported} eligible Work Orders and related specifications have been synchronized into the system.`
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
    setImportSuccessCount(null);
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
      {/* Header with Quick Actions */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">Excel Work Order Import</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Fetch and synchronize work orders, customer details, pipe sizes, steel grades, and ordered quantities.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={downloadTemplate}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-xs hover:bg-slate-50"
          >
            <Download className="h-4 w-4 text-slate-600" /> Download Template (.xlsx)
          </button>
          <button
            type="button"
            onClick={loadSampleData}
            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-semibold text-indigo-700 shadow-xs hover:bg-indigo-100"
          >
            <Sparkles className="h-4 w-4 text-indigo-600" /> Load Sample Schedule
          </button>
          <Link
            href="/work-orders"
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white shadow-xs hover:bg-slate-800"
          >
            View Work Orders Directory <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
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
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
            <UploadCloud className="h-7 w-7" />
          </div>
          <div>
            <p className="text-base font-semibold text-slate-900">Drop Excel schedule (.xlsx, .xls, .csv)</p>
            <p className="text-sm text-slate-500">
              Columns recognized: W.no, Customer, Specification/Grade, OD, WL/WT, L1, L2, Order Pcs/Mtr/MT, Bal to Make Mtr, Target Date
            </p>
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

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={parsing}
              className="min-h-[3rem] rounded-xl bg-slate-900 px-6 text-base font-semibold text-white shadow-sm hover:bg-slate-800 active:scale-[0.98] transition disabled:opacity-50"
            >
              {parsing ? 'Parsing Sheet...' : 'Browse File'}
            </button>
            <button
              type="button"
              onClick={loadSampleData}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Use Sample Data
            </button>
          </div>

          {fileName && (
            <div className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700">
              <FileCheck className="h-3.5 w-3.5 text-emerald-600" />
              <span>{fileName}</span>
            </div>
          )}
        </div>
      </div>

      {/* Post-Import Success Banner with Direct Navigation Links */}
      {importSuccessCount !== null && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm space-y-3">
          <div className="flex items-center gap-2 text-emerald-900 font-bold text-sm">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <span>{importSuccessCount} Work Orders Successfully Imported & Ready!</span>
          </div>
          <p className="text-emerald-800">
            The work order specifications, dimensional sizes (OD, WT, L1, L2), customers, and balance quantities are now available across all modules.
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Link
              href="/work-orders"
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-800 shadow-xs"
            >
              <Layers className="h-3.5 w-3.5" /> View in Work Orders Directory
            </Link>
            <Link
              href="/rolling-plans"
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-sm font-semibold text-emerald-900 hover:bg-emerald-50 shadow-xs"
            >
              <Calendar className="h-3.5 w-3.5 text-blue-600" /> Issue Rolling Plan
            </Link>
          </div>
        </div>
      )}

      {/* Messages */}
      {message && importSuccessCount === null && (
        <div
          className={`flex items-start gap-2.5 rounded-xl border p-4 text-sm ${
            message.includes('✓') || message.includes('eligible')
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-slate-200 bg-slate-50 text-slate-800'
          }`}
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
          <div className="leading-relaxed whitespace-pre-line">{message}</div>
        </div>
      )}

      {/* Interactive Pre-Import Diff & Validation Dashboard */}
      {rows.length > 0 && (
        <div className="space-y-4">
          {/* Validation Metrics */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
              <div className="text-sm text-slate-500 font-medium">Total Rows</div>
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
                <span className="text-sm font-semibold text-emerald-700">Eligible to Import</span>
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
                <span className="text-sm font-semibold text-rose-700">Skipped / Issues</span>
                <AlertTriangle className="h-4 w-4 text-rose-600" />
              </div>
              <div className="mt-1 text-2xl font-bold text-rose-900">{stats.invalid}</div>
            </button>

            <div className="rounded-xl border border-amber-200 bg-amber-50/30 p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-amber-700">Duplicate WOs</span>
                <Copy className="h-4 w-4 text-amber-600" />
              </div>
              <div className="mt-1 text-2xl font-bold text-amber-900">{stats.duplicates}</div>
            </div>
          </div>

          {/* Table Controls */}
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center justify-between rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter preview rows..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 rounded-lg border border-slate-200 pl-8 pr-3 text-sm focus:border-slate-800"
                />
              </div>
              <div className="flex items-center rounded-lg border border-slate-200 p-0.5 text-sm font-medium text-slate-600">
                <button
                  type="button"
                  onClick={() => setFilterMode('all')}
                  className={`rounded-md px-2.5 py-1.5 ${filterMode === 'all' ? 'bg-slate-900 text-white' : 'hover:bg-slate-100'}`}
                >
                  All ({rows.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode('valid')}
                  className={`rounded-md px-2.5 py-1.5 ${filterMode === 'valid' ? 'bg-emerald-600 text-white' : 'hover:bg-slate-100'}`}
                >
                  Eligible ({stats.valid})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode('invalid')}
                  className={`rounded-md px-2.5 py-1.5 ${filterMode === 'invalid' ? 'bg-rose-600 text-white' : 'hover:bg-slate-100'}`}
                >
                  Issues ({stats.invalid})
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={clearImport}
                disabled={loading}
                className="min-h-[3rem] rounded-xl border-2 border-slate-300 bg-white px-4 text-base font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => void importRows()}
                disabled={loading || stats.valid === 0 || !canCommit}
                className={`inline-flex min-h-[3rem] items-center gap-2 rounded-xl px-6 text-base font-bold shadow-sm transition active:scale-[0.98] ${
                  canCommit
                    ? 'bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50'
                    : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                }`}
              >
                {!canCommit && <Lock className="h-4 w-4" />}
                {loading ? 'Importing…' : !canCommit ? `Import ${stats.valid} Orders (View-Only)` : `Import ${stats.valid} Eligible Orders`}
              </button>
            </div>
          </div>

          {/* Validation & Diff Table */}
          <div className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-[1600px] w-full text-sm">
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
                    <th className="py-2.5 px-3 text-left font-semibold">Target Date</th>
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
                            <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">
                              <CheckCircle2 className="h-3 w-3" /> Ready
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-800">
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
                        <td className="py-2 px-3 text-slate-600 font-mono text-sm">{r.target_date || '—'}</td>
                        <td className="py-2 px-3">
                          <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">
                            {r.current_status || 'Pending'}
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
              <div className="border-t border-slate-100 p-3 text-center text-sm text-slate-400">
                Showing first 150 of {displayedRows.length} matching rows.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
