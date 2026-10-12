'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Calendar,
  AlertTriangle,
  Copy,
  Check,
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

export default function DataReport({ title, view, columns, searchKeys, dateKey, statusKey }: Props) {
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [dateFilter, setDateFilter] = useState<'all' | 'overdue' | 'week' | 'month'>('all');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<'auto' | 'table' | 'cards'>('auto');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const effectiveStatusKey = useMemo(() => {
    return statusKey || columns.find((c) => c.key === 'status' || c.key.toLowerCase().includes('status'))?.key;
  }, [statusKey, columns]);

  const effectiveDateKey = useMemo(() => {
    return dateKey || columns.find((c) => c.key === 'target_date' || c.key.toLowerCase().includes('date'))?.key;
  }, [dateKey, columns]);

  // Date calculation boundaries
  const { todayStr, nextWeekStr, nextMonthStr } = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    const week = new Date(now);
    week.setDate(week.getDate() + 7);
    const nextWeekStr = week.toISOString().split('T')[0];

    const month = new Date(now);
    month.setDate(month.getDate() + 30);
    const nextMonthStr = month.toISOString().split('T')[0];

    return { todayStr, nextWeekStr, nextMonthStr };
  }, []);

  // Keyboard shortcut listener (/ or Ctrl+K to focus search)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        if (e.key === 'Escape' && target === searchInputRef.current) {
          searchInputRef.current?.blur();
        }
        return;
      }

      if ((e.key === '/' || (e.key === 'k' && (e.metaKey || e.ctrlKey))) && !e.shiftKey) {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleCopy = (text: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!text) return;
    void navigator.clipboard.writeText(text);
    setCopiedKey(text);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const loadData = useCallback(async (isManualRefresh = false) => {
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
  }, [view]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

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

  // Combined search, status, and date filtering
  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (effectiveStatusKey && selectedStatus !== 'ALL') {
        const val = String(r[effectiveStatusKey] ?? '').trim().toLowerCase();
        if (val !== selectedStatus.toLowerCase()) {
          return false;
        }
      }
      if (effectiveDateKey && dateFilter !== 'all') {
        const dStr = String(r[effectiveDateKey] ?? '').trim().slice(0, 10);
        const st = String(r[effectiveStatusKey ?? 'status'] ?? '').toLowerCase();
        const isCompleted = st.includes('complete') || st.includes('cancel');

        if (dateFilter === 'overdue') {
          if (!dStr || dStr >= todayStr || isCompleted) return false;
        } else if (dateFilter === 'week') {
          if (!dStr || dStr < todayStr || dStr > nextWeekStr) return false;
        } else if (dateFilter === 'month') {
          if (!dStr || dStr < todayStr || dStr > nextMonthStr) return false;
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
  }, [rows, selectedStatus, dateFilter, q, searchKeys, effectiveStatusKey, effectiveDateKey, todayStr, nextWeekStr, nextMonthStr]);

  // Operational KPI metrics computed across current dataset
  const kpiMetrics = useMemo(() => {
    let totalOrdered = 0;
    let totalPlanned = 0;
    let totalProduced = 0;
    let totalPending = 0;
    let overdueCount = 0;
    let hasOrdered = false;
    let hasPending = false;

    for (const r of rows) {
      if ('ordered_qty' in r || 'order_qty' in r) {
        totalOrdered += Number(r.ordered_qty ?? r.order_qty ?? 0) || 0;
        hasOrdered = true;
      }
      if ('planned_qty' in r || 'planned_pcs' in r) {
        totalPlanned += Number(r.planned_qty ?? r.planned_pcs ?? 0) || 0;
      }
      if ('produced_qty' in r || 'produced_pcs' in r) {
        totalProduced += Number(r.produced_qty ?? r.produced_pcs ?? 0) || 0;
      }
      if ('total_pending' in r || 'balance_qty' in r || 'balance_to_make_pcs' in r) {
        totalPending += Number(r.total_pending ?? r.balance_qty ?? r.balance_to_make_pcs ?? 0) || 0;
        hasPending = true;
      }
      if (effectiveDateKey && r[effectiveDateKey]) {
        const dStr = String(r[effectiveDateKey]).trim().slice(0, 10);
        const st = String(r[effectiveStatusKey ?? 'status'] ?? '').toLowerCase();
        if (dStr && dStr < todayStr && !st.includes('complete') && !st.includes('cancel')) {
          overdueCount++;
        }
      }
    }

    return {
      totalCount: rows.length,
      filteredCount: filtered.length,
      hasOrdered,
      hasPending,
      totalOrdered,
      totalPlanned,
      totalProduced,
      totalPending,
      overdueCount,
    };
  }, [rows, filtered.length, effectiveDateKey, effectiveStatusKey, todayStr]);

  const isNumericKey = (key: string) => {
    const k = key.toLowerCase();
    return (
      [
        'ordered_qty',
        'planned_qty',
        'produced_qty',
        'rejected_qty',
        'total_pending',
        'balance_qty',
        'order_qty',
        'od',
        'wt',
        'length',
        'weight',
        'mt',
        'mtr',
        'pcs',
        'balance_to_make_pcs',
        'balance_to_make_mtr',
        'planned_pcs',
        'planned_mtr',
        'produced_pcs',
        'produced_mtr',
      ].includes(k) ||
      k.endsWith('_qty') ||
      k.endsWith('_pcs') ||
      k.endsWith('_mtr') ||
      k.endsWith('_mt')
    );
  };

  // Sort rows based on sortKey and sortDirection
  const sortedRows = useMemo(() => {
    if (!sortKey) return filtered;
    const isNum = isNumericKey(sortKey);

    return [...filtered].sort((a, b) => {
      const valA = a[sortKey];
      const valB = b[sortKey];

      if (valA === valB) return 0;
      if (valA === null || valA === undefined || valA === '') return 1;
      if (valB === null || valB === undefined || valB === '') return -1;

      if (isNum || typeof valA === 'number' || typeof valB === 'number') {
        const numA = typeof valA === 'number' ? valA : parseFloat(String(valA).replace(/,/g, ''));
        const numB = typeof valB === 'number' ? valB : parseFloat(String(valB).replace(/,/g, ''));
        if (!isNaN(numA) && !isNaN(numB)) {
          return sortDirection === 'asc' ? numA - numB : numB - numA;
        }
      }

      const strA = String(valA);
      const strB = String(valB);
      const cmp = strA.localeCompare(strB, undefined, { numeric: true, sensitivity: 'base' });
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDirection]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else {
        // 3-state toggle: asc -> desc -> natural (null)
        setSortKey(null);
        setSortDirection('asc');
      }
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
    setPage(1);
  };

  const paginatedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedRows.slice(start, start + pageSize);
  }, [sortedRows, page, pageSize]);

  const totalPages = Math.ceil(sortedRows.length / pageSize) || 1;

  const exportExcel = async () => {
    const out = sortedRows.map((r) =>
      Object.fromEntries(columns.map((c) => [c.label, r[c.key]]))
    );
    const safeTitle = String(title || 'Report').trim();
    await exportJsonToExcel(out, 'Report', `${safeTitle.toLowerCase().replace(/\s+/g, '-')}.xlsx`);
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

  const isFilterActive = selectedStatus !== 'ALL' || dateFilter !== 'all' || Boolean(q.trim()) || Boolean(sortKey);

  return (
    <div className="space-y-4">
      {/* Header & Main Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">{title}</h1>
            <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-sm font-semibold text-slate-700 dark:text-slate-300 font-mono">
              {filtered.length}
              {selectedStatus !== 'ALL' || dateFilter !== 'all' || q ? (
                <span className="text-slate-400 font-normal"> / {rows.length}</span>
              ) : null}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Real-time status tracking, schedule dispatch, and pending balance overview
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
            className="inline-flex min-h-[2.5rem] items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-xs hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-[0.97] transition-all duration-150 motion-reduce:transition-none motion-reduce:transform-none"
            title="Refresh Report Data"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin text-blue-600 motion-reduce:animate-none' : 'text-slate-500'} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>

          {/* Mobile view toggle */}
          <div className="flex sm:hidden rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-100 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setViewMode(viewMode === 'cards' ? 'table' : 'cards')}
              className="flex min-h-[2.5rem] items-center gap-1.5 rounded-lg px-3 text-xs font-semibold bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs active:scale-[0.97] transition-all duration-150 motion-reduce:transition-none"
            >
              {viewMode === 'table' ? <LayoutList size={13} /> : <TableIcon size={13} />}
              {viewMode === 'table' ? 'Cards' : 'Table'}
            </button>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={exportExcel}
            className="inline-flex min-h-[2.5rem] items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-xs hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-[0.97] transition-all duration-150 motion-reduce:transition-none motion-reduce:transform-none"
          >
            <Download size={14} className="text-slate-600 dark:text-slate-400" />
            <span className="hidden sm:inline">Export Excel</span>
            <span className="sm:hidden">Export</span>
          </Button>
        </div>
      </div>

      {/* Industrial Operational KPI Summary Bar */}
      {rows.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {/* Work Orders Total */}
          <div className="rounded-xl border border-[var(--border-subtle,#e2e8f0)] bg-[var(--bg-surface,#ffffff)] p-3 shadow-2xs">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted,#64748b)]">
              Work Orders
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-xl font-bold font-mono tabular-nums text-[var(--text-main,#0f172a)]">
                {filtered.length}
              </span>
              {filtered.length !== rows.length && (
                <span className="text-[11px] text-[var(--text-muted,#64748b)] font-mono">
                  of {rows.length}
                </span>
              )}
            </div>
          </div>

          {/* Ordered Quantity Volume */}
          {kpiMetrics.hasOrdered && (
            <div className="rounded-xl border border-[var(--border-subtle,#e2e8f0)] bg-[var(--bg-surface,#ffffff)] p-3 shadow-2xs">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted,#64748b)]">
                Total Ordered
              </div>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-xl font-bold font-mono tabular-nums text-[var(--text-main,#0f172a)]">
                  {kpiMetrics.totalOrdered.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                </span>
                <span className="text-[10px] font-bold uppercase text-[var(--text-muted,#64748b)]">
                  Qty
                </span>
              </div>
            </div>
          )}

          {/* Balance Pending Volume */}
          {kpiMetrics.hasPending && (
            <div className="rounded-xl border border-[var(--border-subtle,#e2e8f0)] bg-[var(--bg-surface,#ffffff)] p-3 shadow-2xs">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted,#64748b)]">
                Balance Pending
              </div>
              <div className="mt-1 flex items-baseline justify-between">
                <span
                  className={`text-xl font-bold font-mono tabular-nums ${
                    kpiMetrics.totalPending > 0
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {kpiMetrics.totalPending.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                </span>
                <span className="text-[10px] font-bold uppercase text-[var(--text-muted,#64748b)]">
                  Rem.
                </span>
              </div>
            </div>
          )}

          {/* Overdue Dispatch Orders Card (Clickable Filter) */}
          {effectiveDateKey && (
            <button
              type="button"
              onClick={() => {
                setDateFilter((curr) => (curr === 'overdue' ? 'all' : 'overdue'));
                setPage(1);
              }}
              className={`rounded-xl border p-3 text-left transition-all cursor-pointer ${
                dateFilter === 'overdue'
                  ? 'border-rose-400 bg-rose-50/80 dark:bg-rose-950/40 ring-1 ring-rose-400'
                  : kpiMetrics.overdueCount > 0
                  ? 'border-rose-200 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/20 hover:border-rose-300'
                  : 'border-[var(--border-subtle,#e2e8f0)] bg-[var(--bg-surface,#ffffff)] hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted,#64748b)]">
                <span>Overdue Orders</span>
                {kpiMetrics.overdueCount > 0 && (
                  <AlertTriangle size={12} className="text-rose-500 animate-pulse" />
                )}
              </div>
              <div className="mt-1 flex items-baseline justify-between">
                <span
                  className={`text-xl font-bold font-mono tabular-nums ${
                    kpiMetrics.overdueCount > 0
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-[var(--text-main,#0f172a)]'
                  }`}
                >
                  {kpiMetrics.overdueCount}
                </span>
                <span className="text-[10px] font-semibold text-rose-600 dark:text-rose-400">
                  {dateFilter === 'overdue' ? 'Active Filter ✕' : 'Click to Filter'}
                </span>
              </div>
            </button>
          )}
        </div>
      )}

      {/* Filter Section: Status Pills & Date Quick Filter Strip */}
      <div className="flex flex-col gap-2">
        {effectiveStatusKey && availableStatuses.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mr-1 flex items-center gap-1">
              <Filter size={12} className="text-slate-400" /> Status:
            </span>
            <button
              type="button"
              onClick={() => {
                setSelectedStatus('ALL');
                setPage(1);
              }}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold active:scale-[0.97] transition-all duration-150 ease-out motion-reduce:transition-none motion-reduce:transform-none ${
                selectedStatus === 'ALL'
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-xs'
                  : 'bg-white text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 hover:border-slate-300'
              }`}
            >
              <span>All Statuses</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono transition-colors duration-150 ${
                  selectedStatus === 'ALL'
                    ? 'bg-slate-800 text-slate-200 dark:bg-slate-300 dark:text-slate-900'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
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
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold active:scale-[0.97] transition-all duration-150 ease-out motion-reduce:transition-none motion-reduce:transform-none ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-white text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 hover:border-slate-300'
                  }`}
                >
                  <span>{st}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono transition-colors duration-150 ${
                      isSelected ? 'bg-blue-700 text-blue-100' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Date Quick Filter Pills */}
        {effectiveDateKey && (
          <div className="flex flex-wrap items-center gap-1.5 p-1.5 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mr-1 flex items-center gap-1">
              <Calendar size={12} className="text-slate-400" /> Deadline:
            </span>
            {(
              [
                { id: 'all', label: 'All Dates', count: undefined },
                { id: 'overdue', label: 'Overdue', count: kpiMetrics.overdueCount },
                { id: 'week', label: 'Due in 7 Days', count: undefined },
                { id: 'month', label: 'Due in 30 Days', count: undefined },
              ] as Array<{ id: 'all' | 'overdue' | 'week' | 'month'; label: string; count?: number }>
            ).map((df) => {
              const isSelected = dateFilter === df.id;
              return (
                <button
                  key={df.id}
                  type="button"
                  onClick={() => {
                    setDateFilter(df.id);
                    setPage(1);
                  }}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold active:scale-[0.97] transition-all duration-150 ease-out motion-reduce:transition-none ${
                    isSelected
                      ? df.id === 'overdue'
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-xs'
                      : 'bg-white text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  <span>{df.label}</span>
                  {df.count !== undefined && df.count > 0 && (
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                        isSelected ? 'bg-rose-700 text-white' : 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                      }`}
                    >
                      {df.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Filter Toolbar: Search Input + Status Select Dropdown + Clear Filter */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <Input
            ref={searchInputRef}
            className="pl-8 pr-10 text-xs h-9 bg-white dark:bg-slate-800 transition-all duration-150 focus:border-blue-500"
            placeholder="Search WO No, Customer, Grade, Route... (Press / to focus)"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
          <div className="absolute right-2.5 top-2 flex items-center gap-1">
            {q ? (
              <button
                type="button"
                onClick={() => {
                  setQ('');
                  setPage(1);
                  searchInputRef.current?.focus();
                }}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-all duration-150 hover:scale-110 active:scale-90 motion-reduce:transform-none cursor-pointer"
                title="Clear Search"
              >
                <X size={14} />
              </button>
            ) : (
              <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono text-slate-400 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded select-none pointer-events-none">
                /
              </kbd>
            )}
          </div>
        </div>

        {/* Status Dropdown Filter in Header Toolbar */}
        {effectiveStatusKey && availableStatuses.length > 0 && (
          <div className="flex items-center gap-1.5">
            <label
              htmlFor="status-header-filter"
              className="text-xs font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap hidden sm:inline"
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
                className="w-full h-9 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100 shadow-2xs focus:border-blue-500 focus:outline-hidden cursor-pointer transition-all duration-150"
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

        {/* Active Sort Pill Indicator */}
        {sortKey && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800 animate-in fade-in-50 zoom-in-95 duration-150 motion-reduce:animate-none">
            <span>
              Sorted by: <strong>{columns.find((c) => c.key === sortKey)?.label ?? sortKey}</strong> ({sortDirection === 'asc' ? 'Ascending' : 'Descending'})
            </span>
            <button
              type="button"
              onClick={() => {
                setSortKey(null);
                setSortDirection('asc');
                setPage(1);
              }}
              className="hover:text-blue-900 dark:hover:text-white p-0.5 cursor-pointer rounded-full hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-all duration-150 hover:scale-110 active:scale-90 motion-reduce:transform-none"
              title="Clear sort"
            >
              <X size={12} />
            </button>
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
              setDateFilter('all');
              setQ('');
              setSortKey(null);
              setSortDirection('asc');
              setPage(1);
            }}
            className="h-9 px-2.5 text-xs font-semibold text-rose-700 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-950/40 active:scale-[0.97] transition-all duration-150 motion-reduce:transition-none"
          >
            <X size={13} className="mr-1" />
            Reset Filters
          </Button>
        )}
      </div>

      {/* Report Content */}
      {loading ? (
        <div className="rounded-xl border border-[var(--border-subtle,#e2e8f0)] bg-[var(--bg-surface,#ffffff)] p-8 text-center text-sm text-[var(--text-muted,#64748b)]">
          <RefreshCw size={24} className="mx-auto mb-2 animate-spin opacity-50" />
          Loading report data...
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-[var(--border-subtle,#e2e8f0)] bg-[var(--bg-surface,#ffffff)] p-8 text-center text-sm text-[var(--text-muted,#64748b)]">
          <p className="font-semibold text-[var(--text-main,#0f172a)]">No records found matching criteria.</p>
          {isFilterActive && (
            <p className="text-xs text-[var(--text-muted,#64748b)] mt-1">
              Try resetting the status filter or clearing your search query.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Card View for Mobile (visible on mobile if auto or cards selected) */}
          <div className={`sm:hidden ${viewMode === 'table' ? 'hidden' : 'space-y-2.5'}`}>
            {/* Mobile Sort Controls */}
            <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                Sort:
              </span>
              <select
                value={sortKey ?? ''}
                onChange={(e) => {
                  const val = e.target.value;
                  if (!val) {
                    setSortKey(null);
                  } else {
                    setSortKey(val);
                    setSortDirection('asc');
                  }
                  setPage(1);
                }}
                className="flex-1 h-8 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 text-xs font-semibold text-slate-800 dark:text-slate-100"
              >
                <option value="">Default order</option>
                {columns.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
              {sortKey && (
                <button
                  type="button"
                  onClick={() => setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))}
                  className="h-8 px-2.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
                  title="Toggle sort direction"
                >
                  {sortDirection === 'asc' ? '↑ Asc' : '↓ Desc'}
                </button>
              )}
            </div>

            {paginatedRows.map((r, i) => {
              const primaryKey = columns[0]?.key;
              const secondaryKey = columns[1]?.key;
              const statusVal = effectiveStatusKey ? r[effectiveStatusKey] : undefined;

              return (
                <div
                  key={r.id ?? r.work_order_id ?? i}
                  className="rounded-xl border border-[var(--border-subtle,#e2e8f0)] bg-[var(--bg-surface,#ffffff)] text-[var(--text-main,#0f172a)] p-3.5 shadow-xs space-y-2"
                >
                  <div className="flex items-center justify-between border-b border-[var(--border-subtle,#f1f5f9)] pb-2">
                    <div>
                      <span className="text-sm font-bold text-[var(--text-main,#0f172a)]">
                        {formatValue(r[primaryKey])}
                      </span>
                      {secondaryKey && (
                        <div className="text-xs text-[var(--text-muted,#64748b)]">
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
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted,#94a3b8)] block truncate">
                            {c.label}
                          </span>
                          <span
                            className={`text-xs block truncate ${
                              isNum ? 'font-mono tabular-nums text-[var(--text-main,#0f172a)] font-medium' : 'text-[var(--text-main,#0f172a)]'
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
          <div className={`rounded-xl border border-[var(--border-subtle,#e2e8f0)] bg-[var(--bg-surface,#ffffff)] shadow-xs overflow-hidden ${viewMode === 'cards' ? 'hidden sm:block' : 'block'}`}>
            <div className="overflow-auto max-h-[70vh] relative">
              <table className="min-w-full text-xs">
                <thead className="sticky top-0 z-20 border-b border-[var(--border-subtle,#e2e8f0)] bg-[var(--bg-surface-subtle,#f1f5f9)] shadow-2xs text-[var(--text-main,#0f172a)] select-none">
                  <tr>
                    {columns.map((c) => {
                      const isNum = isNumericKey(c.key);
                      const isStatus = c.key === effectiveStatusKey;
                      const isSorted = sortKey === c.key;
                      const alignClass = isNum ? 'text-right' : isStatus ? 'text-center' : 'text-left';
                      return (
                        <th
                          key={c.key}
                          onClick={() => handleSort(c.key)}
                          className={`whitespace-nowrap px-3 py-2.5 font-bold uppercase tracking-wider text-[11px] cursor-pointer hover:bg-[var(--bg-surface-elevated,#e2e8f0)] active:scale-[0.99] transition-all duration-150 ease-out group motion-reduce:transition-none motion-reduce:transform-none ${
                            isSorted
                              ? 'text-blue-600 dark:text-blue-400 bg-blue-50/60 dark:bg-blue-950/30'
                              : 'text-[var(--text-muted,#64748b)]'
                          } ${alignClass}`}
                          aria-sort={
                            isSorted
                              ? sortDirection === 'asc'
                                ? 'ascending'
                                : 'descending'
                              : 'none'
                          }
                          title={`Sort by ${c.label} (${
                            isSorted
                              ? sortDirection === 'asc'
                                ? 'Ascending → Click for Descending'
                                : 'Descending → Click to Clear'
                              : 'Click to Sort Ascending'
                          })`}
                        >
                          <div
                            className={`inline-flex items-center gap-1.5 ${
                              isNum ? 'justify-end' : isStatus ? 'justify-center' : 'justify-start'
                            }`}
                          >
                            <span>{c.label}</span>
                            <span className="inline-flex items-center">
                              {isSorted ? (
                                sortDirection === 'asc' ? (
                                  <ArrowUp size={13} className="text-blue-600 dark:text-blue-400 shrink-0 transition-transform duration-200 ease-out motion-reduce:transition-none" />
                                ) : (
                                  <ArrowDown size={13} className="text-blue-600 dark:text-blue-400 shrink-0 transition-transform duration-200 ease-out motion-reduce:transition-none" />
                                )
                              ) : (
                                <ArrowUpDown
                                  size={12}
                                  className="text-slate-400 opacity-0 group-hover:opacity-100 group-hover:scale-110 transition-all duration-150 ease-out shrink-0 motion-reduce:transition-none motion-reduce:transform-none"
                                />
                              )}
                            </span>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle,#f1f5f9)] transition-opacity duration-150 ease-out motion-reduce:transition-none">
                  {paginatedRows.map((r, i) => (
                    <tr key={r.id ?? r.work_order_id ?? i} className="hover:bg-[var(--bg-surface-subtle,#f8fafc)] transition-colors duration-100 ease-out">
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

                        const isDateCol = effectiveDateKey && c.key === effectiveDateKey;
                        const dStr = isDateCol && val ? String(val).trim().slice(0, 10) : '';
                        const stStr = String(r[effectiveStatusKey ?? 'status'] ?? '').toLowerCase();
                        const isOverdue = Boolean(isDateCol && dStr && dStr < todayStr && !stStr.includes('complete') && !stStr.includes('cancel'));

                        return (
                          <td
                            key={c.key}
                            className={`whitespace-nowrap px-3 py-2 text-[var(--text-main,#0f172a)] ${
                              colIdx === 0 ? 'font-bold font-mono' : ''
                            } ${isNum ? 'text-right font-mono tabular-nums font-medium' : 'text-left'}`}
                          >
                            {colIdx === 0 && val ? (
                              <div className="inline-flex items-center gap-1.5 group/cell">
                                <span>{formatValue(val)}</span>
                                <button
                                  type="button"
                                  onClick={(e) => handleCopy(String(val), e)}
                                  className="opacity-0 group-hover/cell:opacity-100 p-0.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
                                  title={copiedKey === String(val) ? 'Copied WO!' : 'Copy WO No'}
                                  aria-label="Copy WO Number"
                                >
                                  {copiedKey === String(val) ? (
                                    <Check size={11} className="text-emerald-600" />
                                  ) : (
                                    <Copy size={11} />
                                  )}
                                </button>
                              </div>
                            ) : isOverdue ? (
                              <span className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-400 font-semibold font-mono" title="Order delivery is overdue">
                                <AlertTriangle size={11} className="text-rose-500 shrink-0" />
                                <span>{formatValue(val)}</span>
                                <span className="text-[9px] uppercase px-1 py-0.2 rounded bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-sans font-bold">
                                  Late
                                </span>
                              </span>
                            ) : (
                              formatValue(val)
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination / Row Counter Footer */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-subtle,#e2e8f0)] px-4 py-2.5 bg-[var(--bg-surface-subtle,#f8fafc)] text-xs">
              <div className="flex items-center gap-3">
                <span className="text-[var(--text-muted,#64748b)] font-medium">
                  Showing {filtered.length === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} of{' '}
                  <span className="font-mono font-semibold text-[var(--text-main,#0f172a)]">{filtered.length}</span> records
                </span>

                {/* Page Size Selector */}
                <div className="flex items-center gap-1.5 border-l border-[var(--border-subtle,#e2e8f0)] pl-3">
                  <span className="text-[11px] text-[var(--text-muted,#64748b)] hidden sm:inline">Per page:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                    className="h-6 rounded border border-[var(--border-subtle,#e2e8f0)] bg-[var(--bg-surface,#ffffff)] px-1.5 text-xs font-mono text-[var(--text-main,#0f172a)] focus:border-blue-500 cursor-pointer"
                  >
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={500}>500</option>
                  </select>
                </div>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={page === 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="min-h-[36px] min-w-[36px] sm:min-h-[44px] sm:min-w-[44px] flex items-center justify-center rounded-lg text-[var(--text-muted,#64748b)] hover:bg-[var(--bg-surface-elevated,#e2e8f0)] hover:text-[var(--text-main,#0f172a)] disabled:opacity-30 transition-all duration-150 hover:scale-110 active:scale-90 disabled:hover:scale-100 cursor-pointer motion-reduce:transition-none motion-reduce:transform-none"
                    title="Previous page"
                    aria-label="Previous page"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="px-2.5 font-medium text-[var(--text-main,#0f172a)] font-mono">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={page === totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="min-h-[36px] min-w-[36px] sm:min-h-[44px] sm:min-w-[44px] flex items-center justify-center rounded-lg text-[var(--text-muted,#64748b)] hover:bg-[var(--bg-surface-elevated,#e2e8f0)] hover:text-[var(--text-main,#0f172a)] disabled:opacity-30 transition-all duration-150 hover:scale-110 active:scale-90 disabled:hover:scale-100 cursor-pointer motion-reduce:transition-none motion-reduce:transform-none"
                    title="Next page"
                    aria-label="Next page"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
