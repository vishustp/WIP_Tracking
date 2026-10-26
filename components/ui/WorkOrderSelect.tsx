'use client';

import React, { useMemo } from 'react';
import { SearchableSelect, SearchableOption } from './SearchableSelect';

export interface WorkOrderOptionLike {
  id: string;
  work_order_no?: string;
  customer_name?: string | null;
  grade?: string | null;
  specification?: string | null;
  size_od?: number | null;
  od?: number | null;
  size_wt?: number | null;
  wt?: number | null;
  l1?: number | null;
  l2?: number | null;
  avg_length?: number | null;
  status?: string | null;
  available_pcs?: number | null;
  available_mtr?: number | null;
  [key: string]: any;
}

export interface WorkOrderSelectProps {
  id?: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  workOrders: WorkOrderOptionLike[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  buttonClassName?: string;
  excludeId?: string;
  sameOrderId?: string;
  zIndex?: number;
  showWipBadge?: boolean;
}

export function WorkOrderSelect({
  id,
  name,
  value,
  onChange,
  workOrders,
  placeholder = 'Select Work Order...',
  searchPlaceholder = 'Search by WO#, customer, grade, size...',
  emptyText = 'No work orders found',
  disabled = false,
  required = false,
  className = '',
  buttonClassName = '',
  excludeId,
  sameOrderId,
  zIndex = 60,
  showWipBadge = false,
}: WorkOrderSelectProps) {
  // Convert WorkOrderOptionLike array to SearchableOption format
  const options: SearchableOption[] = useMemo(() => {
    return workOrders
      .filter((wo) => !excludeId || wo.id !== excludeId)
      .map((wo) => {
        const woNo = wo.work_order_no || 'Unknown WO';
        const customer = wo.customer_name?.trim() || 'Generic Customer';
        const grade = wo.specification?.trim() || wo.grade?.trim() || 'Grade N/A';
        const od = wo.size_od ?? wo.od;
        const wt = wo.size_wt ?? wo.wt;
        const sizeStr = od && wt ? `${od}×${wt}mm` : '';

        let lengthStr = '';
        if (wo.l1 && wo.l2) {
          lengthStr = `${wo.l1}-${wo.l2}m`;
        } else if (wo.avg_length) {
          lengthStr = `${wo.avg_length}m`;
        }

        const isSameOrder = Boolean(sameOrderId && wo.id === sameOrderId);
        const label = isSameOrder ? `${woNo} · ${customer} (Same Order)` : `${woNo} · ${customer}`;
        const sublabel = [grade, sizeStr, lengthStr].filter(Boolean).join(' · ');

        let badge: string | undefined;
        if (isSameOrder) {
          badge = 'Current Order (Internal Cut)';
        } else if (showWipBadge && (wo.available_pcs != null || wo.available_mtr != null)) {
          badge = `${wo.available_pcs ?? 0} pcs / ${wo.available_mtr ?? 0}m`;
        }

        const keywords = [
          woNo,
          customer,
          grade,
          wo.specification || '',
          od != null ? `${od}` : '',
          wt != null ? `${wt}` : '',
          od != null && wt != null ? `${od}x${wt}` : '',
          od != null && wt != null ? `${od}×${wt}` : '',
          isSameOrder ? 'same current internal order' : '',
        ].filter(Boolean);

        return {
          value: wo.id,
          label,
          sublabel,
          badge,
          keywords,
        };
      });
  }, [workOrders, excludeId, sameOrderId, showWipBadge]);

  return (
    <SearchableSelect
      id={id}
      name={name}
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder}
      searchPlaceholder={searchPlaceholder}
      emptyText={emptyText}
      disabled={disabled}
      required={required}
      className={className}
      buttonClassName={buttonClassName}
      zIndex={zIndex}
    />
  );
}
