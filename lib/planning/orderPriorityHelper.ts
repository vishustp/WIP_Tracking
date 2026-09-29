// lib/planning/orderPriorityHelper.ts
// Order prioritization engine, tier sorting, and export generation for Seamless Pipe mill planning

export type PriorityTier = 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW';

export interface PriorityItem {
  work_order_id: string;
  work_order_no: string;
  tier: PriorityTier;
  rank?: number;
  notes?: string;
  planned_rolling_date?: string;
  updated_at?: string;
}

export interface PriorityTierConfig {
  tier: PriorityTier;
  label: string;
  weight: number; // Lower weight = higher urgency
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

const STORAGE_KEY = 'rashmi_order_priorities_v1';

export function sortOrdersByPriority<T extends { id: string; target_date?: string | null }>(
  orders: T[],
  priorities: Record<string, PriorityItem>
): T[] {
  return [...orders].sort((a, b) => {
    const prioA = priorities[a.id]?.tier || 'NORMAL';
    const prioB = priorities[b.id]?.tier || 'NORMAL';

    const weightA = PRIORITY_CONFIGS[prioA]?.weight ?? 3;
    const weightB = PRIORITY_CONFIGS[prioB]?.weight ?? 3;

    if (weightA !== weightB) {
      return weightA - weightB;
    }

    // Secondary sort: manual rank if set
    const rankA = priorities[a.id]?.rank ?? 9999;
    const rankB = priorities[b.id]?.rank ?? 9999;
    if (rankA !== rankB) {
      return rankA - rankB;
    }

    // Tertiary sort: target delivery date ascending
    const dateA = a.target_date ? new Date(a.target_date).getTime() : 9999999999999;
    const dateB = b.target_date ? new Date(b.target_date).getTime() : 9999999999999;
    return dateA - dateB;
  });
}

export function buildPriorityCsvContent<T extends Record<string, any>>(
  orders: T[],
  priorities: Record<string, PriorityItem>
): string {
  const headers = [
    'Priority',
    'WO No',
    'Customer',
    'Grade',
    'OD (mm)',
    'WT (mm)',
    'Pending (Mtr)',
    'Target Date',
    'Notes',
  ];

  const rows = orders.map((o) => {
    const p = priorities[o.id] || { tier: 'NORMAL', notes: '' };
    return [
      p.tier,
      o.work_order_no || '',
      `"${(o.customer_name || '').replace(/"/g, '""')}"`,
      `"${(o.grade || o.specification || '').replace(/"/g, '""')}"`,
      o.size_od ?? '',
      o.size_wt ?? '',
      o.balance_qty_mtr ?? o.ordered_qty_mtr ?? '',
      o.target_date ?? '',
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
