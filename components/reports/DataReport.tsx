import { useEffect, useMemo, useState } from 'react';
import { exportJsonToExcel } from '@/lib/excelUtils';
import { createClient } from '@/lib/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Download,
  Search,
  LayoutList,
  Table as TableIcon,
  X,
  ChevronLeft,
  ChevronRight,
  Filter,
  RefreshCw,
} from 'lucide-react';

type Props = {
  title: string;
  view: string;
  columns: { key: string; label: string }[];
  searchKeys: string[];
  dateKey?: string;
  statusKey?: string;
};

const STANDARD_STATUSES = ['Pending Plan', 'Scheduled', 'In Progress', 'Completed'];

export default function DataReport({ title, view, columns, searchKeys, statusKey }: Props) {
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<'auto' | 'table' | 'cards'>('auto');
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const effectiveStatusKey = useMemo(() => {
    return statusKey || columns.find((c) => c.key === 'status' || c.key.toLowerCase().includes('status'))?.key;
  }, [statusKey, columns]);

  const loadData = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const { data, error } = await createClient()
        .from(view)
        .select('*')
        .limit(2000);
      if (error) console.error('DataReport load error:', error);
      setRows(data ?? []);
    } catch (err) {
      console.error('DataReport exception:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [view]);

  // Extract distinct statuses and order them logically
  const availableStatuses = useMemo(() => {
    if (!effectiveStatusKey) return [];
    const found = new Set<string>();
    for (const r of rows) {
      const val = r[effectiveStatusKey];
      if (val && typeof val === 'string' && val.trim()) {
        found.add(val.trim());
      }
    }
    const ordered: string[] = [];
    for (const st of STANDARD_STATUSES) {
      if (found.has(st)) {
        ordered.push(st);
        found.delete(st);
      }
    }
    const remaining = Array.from(found).sort();
    return [...ordered, ...remaining];
  }, [rows, effectiveStatusKey]);

  // Tally counts per status
  const statusCounts = useMemo(() => {
    if (!effectiveStatusKey) return {};
    const counts: Record<string, number> = { ALL: rows.length };
    for (const r of rows) {
      const val = r[effectiveStatusKey];
      if (val) {
        const s = String(val).trim();
        counts[s] = (counts[s] || 0) + 1;
      }
    }
    return counts;
  }, [rows, effectiveStatusKey]);

  // Combined search and status filtering
  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (effectiveStatusKey && selectedStatus !== 'ALL') {
        const val = String(r[effectiveStatusKey] ?? '').trim().toLowerCase();
        if (val !== selectedStatus.toLowerCase()) {
          return false;
        }
      }
      if (q) {
        const qLower = q.toLowerCase();
        const matches = searchKeys.some((k) =>
          String(r[k] ?? '')
            .toLowerCase()
            .includes(qLower)
        );
        if (!matches) return false;
      }
      return true;
    });
  }, [rows, selectedStatus, q, searchKeys, effectiveStatusKey]);

  const paginatedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page]);

  const totalPages = Math.ceil(filtered.length / pageSize) || 1;

  const exportExcel = async () => {
    const out = filtered.map((r) =>
      Object.fromEntries(columns.map((c) => [c.label, r[c.key]]))
    );
    const safeTitle = String(title || 'Report').trim();
    await exportJsonToExcel(out, 'Report', `${safeTitle.toLowerCase().replace(/\s+/g, '-')}.xlsx`);
  };

  const isNumericKey = (key: string) => {
    return [
      'ordered_qty',
      'planned_qty',
      'produced_qty',
      'rejected_qty',
      'total_pending',
      'od',
      'wt',
    ].includes(key.toLowerCase());
  };

  const formatValue = (val: any) => {
    if (val === null || val === undefined || val === '') return '—';
    if (typeof val === 'number') {
      return Number.isInteger(val)
        ? val.toLocaleString()
        : val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return String(val);
  };

  const renderStatusBadge = (statusVal: any) => {
    if (!statusVal) return '—';
    const s = String(statusVal).trim();
    let badgeClass = 'bg-slate-100 text-slate-700 border-slate-200';
    if (s === 'Pending Plan') {
      badgeClass = 'bg-indigo-50 text-indigo-700 border-indigo-200';
    } else if (s === 'Scheduled') {
      badgeClass = 'bg-sky-50 text-sky-700 border-sky-200';
    } else if (s === 'In Progress') {
      badgeClass = 'bg-amber-50 text-amber-800 border-amber-200';
    } else if (s === 'Completed') {
      badgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
    } else if (s.toLowerCase().includes('cancel') || s.toLowerCase().includes('reject')) {
      badgeClass = 'bg-rose-50 text-rose-700 border-rose-200';
    }
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border ${badgeClass}`}>
        {s}
      </span>
    );
  };

  const isFilterActive = selectedStatus !== 'ALL' || Boolean(q.trim());

  return (
    <div className="space-y-4">
      {/* Header & Main Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
            <span className="rounded-md bg-slate-100 px-2.5 py-1 text-sm font-semibold text-slate-700 font-mono">
              {filtered.length}
              {selectedStatus !== 'ALL' || q ? (
                <span className="text-slate-400 font-normal"> / {rows.length}</span>
              ) : null}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time status tracking and pending balance overview
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Refresh Button */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadData(true)}
            disabled={loading || refreshing}
            className="inline-flex min-h-[2.5rem] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50"
            title="Refresh Report Data"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin text-blue-600' : 'text-slate-500'} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>

          {/* Mobile view toggle */}
          <div className="flex sm:hidden rounded-lg border border-slate-200 p-0.5 bg-slate-100">
            <button
              type="button"
              onClick={() => setViewMode(viewMode === 'cards' ? 'table' : 'cards')}
              className="flex min-h-[2.5rem] items-center gap-1.5 rounded-lg px-3 text-xs font-semibold bg-white text-slate-900 shadow-xs"
            >
              {viewMode === 'table' ? <LayoutList size={13} /> : <TableIcon size={13} />}
              {viewMode === 'table' ? 'Cards' : 'Table'}
            </button>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={exportExcel}
            className="inline-flex min-h-[2.5rem] items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50"
          >
            <Download size={14} className="text-slate-600" />
            <span className="hidden sm:inline">Export Excel</span>
            <span className="sm:hidden">Export</span>
          </Button>
        </div>
      </div>

      {/* Quick Status Pill Bar (Header Filter Pills) */}
      {effectiveStatusKey && availableStatuses.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-xl bg-slate-50 border border-slate-200/80">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mr-1 flex items-center gap-1">
            <Filter size={12} className="text-slate-400" /> Status:
          </span>
          <button
            type="button"
            onClick={() => {
              setSelectedStatus('ALL');
              setPage(1);
            }}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
              selectedStatus === 'ALL'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            <span>All Statuses</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                selectedStatus === 'ALL' ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {rows.length}
            </span>
          </button>
          {availableStatuses.map((st) => {
            const count = statusCounts[st] || 0;
            const isSelected = selectedStatus === st;
            return (
              <button
                key={st}
                type="button"
                onClick={() => {
                  setSelectedStatus(st);
                  setPage(1);
                }}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                <span>{st}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                    isSelected ? 'bg-blue-700 text-blue-100' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Filter Toolbar: Search Input + Status Select Dropdown + Clear Filter */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <Input
            className="pl-8 pr-8 text-xs h-9 bg-white"
            placeholder="Search WO No, Customer, Grade, Route..."
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
              title="Clear Search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Status Dropdown Filter in Header Toolbar */}
        {effectiveStatusKey && availableStatuses.length > 0 && (
          <div className="flex items-center gap-1.5">
            <label
              htmlFor="status-header-filter"
              className="text-xs font-semibold text-slate-600 whitespace-nowrap hidden sm:inline"
            >
              Order Status:
            </label>
            <div className="relative min-w-[170px]">
              <select
                id="status-header-filter"
                value={selectedStatus}
                onChange={(e) => {
                  setSelectedStatus(e.target.value);
                  setPage(1);
                }}
                className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 shadow-2xs focus:border-blue-500 focus:outline-hidden cursor-pointer"
              >
                <option value="ALL">All Statuses ({rows.length})</option>
                {availableStatuses.map((st) => (
                  <option key={st} value={st}>
                    {st} ({statusCounts[st] || 0})
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Clear Filters Button */}
        {isFilterActive && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedStatus('ALL');
              setQ('');
              setPage(1);
            }}
            className="h-9 px-2.5 text-xs font-semibold text-slate-600 hover:text-rose-600 hover:bg-rose-50"
          >
            <X size={13} className="mr-1" />
            Reset Filters
          </Button>
        )}
      </div>

      {/* Report Content */}
      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          <RefreshCw size={24} className="mx-auto mb-2 animate-spin text-slate-400" />
          Loading report data...
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          <p className="font-semibold text-slate-700">No records found matching criteria.</p>
          {isFilterActive && (
            <p className="text-xs text-slate-400 mt-1">
              Try resetting the status filter or clearing your search query.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Card View for Mobile (visible on mobile if auto or cards selected) */}
          <div className={`sm:hidden ${viewMode === 'table' ? 'hidden' : 'space-y-2.5'}`}>
            {paginatedRows.map((r, i) => {
              const primaryKey = columns[0]?.key;
              const secondaryKey = columns[1]?.key;
              const statusVal = effectiveStatusKey ? r[effectiveStatusKey] : undefined;

              return (
                <div
                  key={r.id ?? r.work_order_id ?? i}
                  className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs space-y-2"
                >
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <div>
                      <span className="text-sm font-bold text-slate-900">
                        {formatValue(r[primaryKey])}
                      </span>
                      {secondaryKey && (
                        <div className="text-xs text-slate-500">
                          {formatValue(r[secondaryKey])}
                        </div>
                      )}
                    </div>
                    {statusVal && renderStatusBadge(statusVal)}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm pt-1">
                    {columns.slice(secondaryKey ? 2 : 1).map((c) => {
                      if (c.key === effectiveStatusKey) return null;
                      const isNum = isNumericKey(c.key);
                      return (
                        <div key={c.key} className="space-y-0.5">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block truncate">
                            {c.label}
                          </span>
                          <span
                            className={`text-xs block truncate ${
                              isNum ? 'font-mono tabular-nums text-slate-900 font-medium' : 'text-slate-800'
                            }`}
                          >
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
            <div className="overflow-auto max-h-[70vh] relative">
              <table className="min-w-full text-xs">
                <thead className="sticky top-0 z-20 border-b border-slate-200 bg-slate-100 shadow-2xs text-slate-700">
                  <tr>
                    {columns.map((c) => {
                      const isNum = isNumericKey(c.key);
                      const isStatus = c.key === effectiveStatusKey;
                      const alignClass = isNum ? 'text-right' : isStatus ? 'text-center' : 'text-left';
                      return (
                        <th
                          key={c.key}
                          className={`whitespace-nowrap px-3 py-2.5 font-bold uppercase tracking-wider text-[11px] text-slate-600 ${alignClass}`}
                        >
                          {c.label}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedRows.map((r, i) => (
                    <tr key={r.id ?? r.work_order_id ?? i} className="hover:bg-slate-50/60 transition-colors">
                      {columns.map((c, colIdx) => {
                        const val = r[c.key];
                        const isNum = isNumericKey(c.key);
                        const isStatus = c.key === effectiveStatusKey;

                        if (isStatus) {
                          return (
                            <td key={c.key} className="whitespace-nowrap px-3 py-2 text-center">
                              {renderStatusBadge(val)}
                            </td>
                          );
                        }

                        return (
                          <td
                            key={c.key}
                            className={`whitespace-nowrap px-3 py-2 text-slate-800 ${
                              colIdx === 0 ? 'font-bold text-slate-900 font-mono' : ''
                            } ${isNum ? 'text-right font-mono tabular-nums font-medium' : 'text-left'}`}
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
                <span className="text-slate-500 font-medium">
                  Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} of{' '}
                  <span className="font-mono font-semibold text-slate-700">{filtered.length}</span> records
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={page === 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="min-h-[2rem] min-w-[2rem] flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-200 disabled:opacity-30 transition-colors cursor-pointer"
                    title="Previous page"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="px-2.5 font-medium text-slate-700 font-mono">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={page === totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="min-h-[2rem] min-w-[2rem] flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-200 disabled:opacity-30 transition-colors cursor-pointer"
                    title="Next page"
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
