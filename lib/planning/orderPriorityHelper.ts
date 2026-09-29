// lib/planning/orderPriorityHelper.ts
// Order prioritization engine, date-based sorting, filtering, and export generation for Seamless Pipe mill planning

export type PriorityTier = 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW';

export interface PriorityItem {
  work_order_id: string;
  work_order_no: string;
  tier?: PriorityTier;
  rank?: number;
  notes?: string;
  planned_rolling_date?: string;
  completion_date?: string | null;
  updated_at?: string;
}

export interface PriorityTierConfig {
  tier: PriorityTier;
  label: string;
  weight: number;
  badgeClass: string;
  borderClass: string;
  dotClass: string;
  desc: string;
}

export const PRIORITY_CONFIGS: Record<PriorityTier, PriorityTierConfig> = {
  CRITICAL: {
    tier: 'CRITICAL',
    label: 'Critical / Urgent',
    weight: 1,
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-300 font-bold',
    borderClass: 'border-l-4 border-l-rose-600',
    dotClass: 'bg-rose-600 animate-pulse',
    desc: 'Customer plant shutdown, delayed project, or contract penalty clause',
  },
  HIGH: {
    tier: 'HIGH',
    label: 'High Priority',
    weight: 2,
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-300 font-bold',
    borderClass: 'border-l-4 border-l-amber-500',
    dotClass: 'bg-amber-500',
    desc: 'Expedited refinery / power project delivery approaching within 7 days',
  },
  NORMAL: {
    tier: 'NORMAL',
    label: 'Normal Schedule',
    weight: 3,
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200 font-medium',
    borderClass: 'border-l-4 border-l-blue-400',
    dotClass: 'bg-blue-500',
    desc: 'Standard campaign schedule in accordance with rolling plan',
  },
  LOW: {
    tier: 'LOW',
    label: 'Low / Stock',
    weight: 4,
    badgeClass: 'bg-slate-100 text-slate-600 border-slate-200 font-medium',
    borderClass: 'border-l-4 border-l-slate-300',
    dotClass: 'bg-slate-400',
    desc: 'Stock order or flexible delivery date buffer',
  },
};

export type DateFilterType =
  | 'ALL'
  | 'OVERDUE'
  | 'TODAY'
  | 'NEXT_7_DAYS'
  | 'NEXT_15_DAYS'
  | 'NEXT_30_DAYS'
  | 'NO_DATE';

export interface DateFilterOption {
  id: DateFilterType;
  label: string;
  desc: string;
}

export const DATE_FILTER_OPTIONS: DateFilterOption[] = [
  { id: 'ALL', label: 'All Orders', desc: 'All open work orders' },
  { id: 'OVERDUE', label: 'Overdue', desc: 'Target date passed' },
  { id: 'TODAY', label: 'Due Today', desc: 'Completion targeted today' },
  { id: 'NEXT_7_DAYS', label: 'Next 7 Days', desc: 'Urgent commitments within 7 days' },
  { id: 'NEXT_15_DAYS', label: 'Next 15 Days', desc: 'Deliveries due within fortnight' },
  { id: 'NEXT_30_DAYS', label: 'Next 30 Days', desc: 'Deliveries due within month' },
  { id: 'NO_DATE', label: 'No Date Set', desc: 'Orders needing completion date' },
];

const STORAGE_KEY = 'rashmi_order_priorities_v1';

export function getEffectiveOrderDate<T extends { id: string; target_date?: string | null }>(
  order: T,
  priorities: Record<string, PriorityItem>
): string | null {
  const prio = priorities[order.id];
  if (prio?.completion_date !== undefined) {
    return prio.completion_date;
  }
  return order.target_date || null;
}

export function sortOrdersByPriority<T extends { id: string; target_date?: string | null; work_order_no?: string }>(
  orders: T[],
  priorities: Record<string, PriorityItem>
): T[] {
  return [...orders].sort((a, b) => {
    // 1. Primary sort: Effective completion date / target date ascending (earliest / overdue first)
    const dateStrA = getEffectiveOrderDate(a, priorities);
    const dateStrB = getEffectiveOrderDate(b, priorities);

    const timeA = dateStrA ? new Date(dateStrA).getTime() : Infinity;
    const timeB = dateStrB ? new Date(dateStrB).getTime() : Infinity;

    if (timeA !== timeB) {
      return timeA - timeB;
    }

    // 2. Secondary sort: manual rank if set
    const rankA = priorities[a.id]?.rank ?? 9999;
    const rankB = priorities[b.id]?.rank ?? 9999;
    if (rankA !== rankB) {
      return rankA - rankB;
    }

    // 3. Tertiary sort: Work order number ascending
    return (a.work_order_no || '').localeCompare(b.work_order_no || '');
  });
}

export function filterOrdersByDateBasis<T extends { id: string; target_date?: string | null }>(
  orders: T[],
  priorities: Record<string, PriorityItem>,
  filter: DateFilterType,
  customRange?: { from?: string; to?: string }
): T[] {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const todayStart = new Date(todayStr).getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  return orders.filter((o) => {
    const dateStr = getEffectiveOrderDate(o, priorities);

    // Custom range filter if provided
    if (customRange?.from || customRange?.to) {
      if (!dateStr) return false;
      if (customRange.from && dateStr < customRange.from) return false;
      if (customRange.to && dateStr > customRange.to) return false;
      return true;
    }

    if (filter === 'ALL') return true;
    if (filter === 'NO_DATE') return !dateStr;

    if (!dateStr) return false;
    const itemTime = new Date(dateStr).getTime();

    if (filter === 'OVERDUE') {
      return itemTime < todayStart;
    }
    if (filter === 'TODAY') {
      return dateStr === todayStr;
    }
    if (filter === 'NEXT_7_DAYS') {
      return itemTime >= todayStart && itemTime <= todayStart + 7 * dayMs;
    }
    if (filter === 'NEXT_15_DAYS') {
      return itemTime >= todayStart && itemTime <= todayStart + 15 * dayMs;
    }
    if (filter === 'NEXT_30_DAYS') {
      return itemTime >= todayStart && itemTime <= todayStart + 30 * dayMs;
    }
    return true;
  });
}

export function buildPriorityCsvContent<T extends { id: string; target_date?: string | null; [key: string]: any }>(
  orders: T[],
  priorities: Record<string, PriorityItem>
): string {
  const headers = [
    'Sequence',
    'Completion Date',
    'Due Status',
    'WO No',
    'Customer',
    'Grade',
    'OD (mm)',
    'WT (mm)',
    'Pending (Mtr)',
    'Notes',
  ];

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayTime = new Date(todayStr).getTime();

  const rows = orders.map((o, idx) => {
    const p = priorities[o.id] || { notes: '' };
    const effDate = getEffectiveOrderDate(o, priorities) || '';
    let dueStatus = 'No Date';

    if (effDate) {
      const itemTime = new Date(effDate).getTime();
      const diffDays = Math.ceil((itemTime - todayTime) / (1000 * 60 * 60 * 24));
      if (diffDays < 0) dueStatus = `${Math.abs(diffDays)}d Overdue`;
      else if (diffDays === 0) dueStatus = 'Due Today';
      else dueStatus = `${diffDays}d Due`;
    }

    return [
      idx + 1,
      effDate,
      dueStatus,
      o.work_order_no || '',
      `"${(o.customer_name || o.customer || '').replace(/"/g, '""')}"`,
      `"${(o.grade || o.specification || '').replace(/"/g, '""')}"`,
      o.size_od ?? o.od ?? '',
      o.size_wt ?? o.wt ?? '',
      o.balance_qty_mtr ?? o.ordered_qty_mtr ?? o.total_pending ?? '',
      `"${(p.notes || '').replace(/"/g, '""')}"`,
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

export function loadLocalPriorities(): Record<string, PriorityItem> {
  if (typeof window === 'undefined') return {};
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

export function saveLocalPriorities(priorities: Record<string, PriorityItem>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(priorities));
  } catch (err) {
    console.error('Failed to save priorities to local storage:', err);
  }
}
