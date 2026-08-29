'use client';

import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { createClient } from '@/lib/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Download,
  Search,
  LayoutList,
  Table as TableIcon,
  X,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

type Props = {
  title: string;
  view: string;
  columns: { key: string; label: string }[];
  searchKeys: string[];
  dateKey?: string;
};

export default function DataReport({ title, view, columns, searchKeys }: Props) {
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'auto' | 'table' | 'cards'>('auto');
  const [page, setPage] = useState(1);
  const pageSize = 50;

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await createClient()
        .from(view)
        .select('*')
        .limit(2000);
      if (error) console.error(error);
      setRows(data ?? []);
      setLoading(false);
    })();
  }, [view]);

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          !q ||
          searchKeys.some((k) =>
            String(r[k] ?? '')
              .toLowerCase()
              .includes(q.toLowerCase())
          )
      ),
    [rows, q, searchKeys]
  );

  const paginatedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page]);

  const totalPages = Math.ceil(filtered.length / pageSize) || 1;

  const exportExcel = () => {
    const out = filtered.map((r) =>
      Object.fromEntries(columns.map((c) => [c.label, r[c.key]]))
    );
    const ws = XLSX.utils.json_to_sheet(out);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Report');
    XLSX.writeFile(wb, `${title.toLowerCase().replace(/\s+/g, '-')}.xlsx`);
  };

  const formatValue = (val: any) => {
    if (val === null || val === undefined || val === '') return '—';
    if (typeof val === 'number') {
      return Number.isInteger(val) ? val.toLocaleString() : val.toLocaleString(undefined, { maximumFractionDigits: 3 });
    }
    return String(val);
  };

  return (
    <div className="space-y-4">
      {/* Header & Main Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 font-mono">
              {filtered.length}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Mobile view toggle */}
          <div className="flex sm:hidden rounded-lg border border-slate-200 p-0.5 bg-slate-100">
            <button
              type="button"
              onClick={() => setViewMode(viewMode === 'cards' ? 'table' : 'cards')}
              className="flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium bg-white text-slate-900 shadow-xs"
            >
              {viewMode === 'table' ? <LayoutList size={13} /> : <TableIcon size={13} />}
              {viewMode === 'table' ? 'Cards' : 'Table'}
            </button>
          </div>

          <Button
            type="button"
            onClick={exportExcel}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition-colors h-9"
          >
            <Download size={14} className="text-slate-600" />
            <span className="hidden sm:inline">Export Excel</span>
            <span className="sm:hidden">Export</span>
          </Button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <Input
            className="pl-8 pr-8 text-xs h-9 bg-white"
            placeholder="Search report records..."
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
          {q && (
            <button
              type="button"
              onClick={() => {
                setQ('');
                setPage(1);
              }}
              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Report Content */}
      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-xs text-slate-500">
          Loading report data...
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-xs text-slate-500">
          No records found matching criteria.
        </div>
      ) : (
        <div className="space-y-3">
          {/* Card View for Mobile (visible on mobile if auto or cards selected) */}
          <div className={`sm:hidden ${viewMode === 'table' ? 'hidden' : 'space-y-2.5'}`}>
            {paginatedRows.map((r, i) => {
              const primaryKey = columns[0]?.key;
              const secondaryKey = columns[1]?.key;
              const statusKey = columns.find(c => c.key.toLowerCase().includes('status'))?.key;

              return (
                <div
                  key={r.id ?? i}
                  className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs space-y-2"
                >
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <div>
                      <span className="text-xs font-bold text-slate-900">
                        {formatValue(r[primaryKey])}
                      </span>
                      {secondaryKey && (
                        <div className="text-[11px] text-slate-500">
                          {formatValue(r[secondaryKey])}
                        </div>
                      )}
                    </div>
                    {statusKey && r[statusKey] && (
                      <span className="rounded-md bg-slate-100 border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-800">
                        {r[statusKey]}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                    {columns.slice(secondaryKey ? 2 : 1).map((c) => {
                      if (c.key === statusKey) return null;
                      return (
                        <div key={c.key} className="space-y-0.5">
                          <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400 block truncate">
                            {c.label}
                          </span>
                          <span className="font-medium text-slate-800 text-[11px] block truncate">
                            {formatValue(r[c.key])}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table View (and visible on mobile if table chosen) */}
          <div className={`rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden ${viewMode === 'cards' ? 'hidden sm:block' : 'block'}`}>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="border-b border-slate-200 bg-slate-50/80 text-slate-700">
                  <tr>
                    {columns.map((c) => (
                      <th
                        key={c.key}
                        className="whitespace-nowrap px-3.5 py-2.5 text-left font-semibold"
                      >
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedRows.map((r, i) => (
                    <tr key={r.id ?? i} className="hover:bg-slate-50/50 transition-colors">
                      {columns.map((c, colIdx) => {
                        const val = r[c.key];
                        const isNum = typeof val === 'number';
                        return (
                          <td
                            key={c.key}
                            className={`whitespace-nowrap px-3.5 py-2 text-slate-800 ${
                              colIdx === 0 ? 'font-bold text-slate-900' : ''
                            } ${isNum ? 'font-mono' : ''}`}
                          >
                            {formatValue(val)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination / Row Counter Footer */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5 bg-slate-50/50 text-xs">
                <span className="text-slate-500">
                  Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} of{' '}
                  {filtered.length} records
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={page === 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="rounded p-1 text-slate-600 hover:bg-slate-200 disabled:opacity-30"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="px-2 font-medium text-slate-700">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={page === totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="rounded p-1 text-slate-600 hover:bg-slate-200 disabled:opacity-30"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
