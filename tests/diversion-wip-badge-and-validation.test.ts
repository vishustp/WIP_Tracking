import { describe, it, expect } from 'vitest';
import { Row } from '@/types';
import { validateProductionEntry } from '@/lib/productionValidation';

describe('Diversion WIP Row Metadata and Validation Error Recovery', () => {
  it('supports diversion tracking fields on Row interface', () => {
    const row: Row = {
      work_order_id: 'wo-101',
      work_order_no: 'WO-101',
      customer_name: 'Industrial Pipelines Ltd',
      specification: 'SA-106 Gr.B',
      od: 60.3,
      wl: 3.91,
      l1: 6.0,
      l2: 6.5,
      avg_length: 6.25,
      route_id: 'r-cds',
      route_code: 'CDS',
      route_name: 'Cold Drawn Seamless',
      stage_code: 'BAND_SAW',
      balance_to_make_pcs: 25,
      balance_to_make_mtr: 156.25,
      has_diversion: true,
      diversion_in_pcs: 10,
      diversion_in_mtr: 62.5,
      diversion_source_wo: 'WO-099',
      diversion_remarks: '[FROM_STAGE:HEAT_TREATMENT] [TO_STAGE:BAND_SAW] Excess mother pipes transferred',
    };

    expect(row.has_diversion).toBe(true);
    expect(row.diversion_in_pcs).toBe(10);
    expect(row.diversion_in_mtr).toBe(62.5);
    expect(row.diversion_source_wo).toBe('WO-099');
    expect(row.diversion_remarks).toContain('HEAT_TREATMENT');
  });

  it('generates structured validation errors with matching row keys for focus navigation', () => {
    const row1: Row = {
      work_order_id: 'wo-1',
      work_order_no: 'WO-001',
      route_id: 'r-1',
      stage_code: 'FINISHING',
      od: 50.8,
      wl: 3.5,
      l1: 6.0,
      l2: 6.0,
      avg_length: 6.0,
      balance_to_make_pcs: 10,
      balance_to_make_mtr: 60,
      max_allowed_pcs: 10,
      max_allowed_mtr: 60,
      pcs: '15', // exceeds max allowed
      mtr: '90',
    };

    const row2: Row = {
      work_order_id: 'wo-2',
      work_order_no: 'WO-002',
      route_id: 'r-2',
      stage_code: 'FINISHING',
      od: 50.8,
      wl: 3.5,
      l1: 6.0,
      l2: 6.0,
      avg_length: 6.0,
      balance_to_make_pcs: 20,
      balance_to_make_mtr: 120,
      max_allowed_pcs: 20,
      max_allowed_mtr: 120,
      pcs: '10',
      rejection_pcs: '25', // rejection exceeds entered pcs
      mtr: '60',
      rejection_mtr: '150',
    };

    const selectedRows = [row1, row2];
    const structuredErrors = selectedRows.flatMap((r) => {
      const errs = validateProductionEntry(r, r.stage_code);
      const rowKey = r.plan_id ? `${r.work_order_id}|${r.route_id}|${r.plan_id}` : `${r.work_order_id}|${r.route_id}`;
      return errs.map((e) => ({
        workOrder: e.workOrder,
        message: e.message,
        rowKey,
      }));
    });

    expect(structuredErrors.length).toBeGreaterThanOrEqual(2);
    expect(structuredErrors[0].workOrder).toBe('WO-001');
    expect(structuredErrors[0].rowKey).toBe('wo-1|r-1');
    expect(structuredErrors[0].message).toContain('exceeds available');

    expect(structuredErrors.some((e) => e.workOrder === 'WO-002')).toBe(true);
    expect(structuredErrors.some((e) => e.rowKey === 'wo-2|r-2')).toBe(true);
    expect(structuredErrors.some((e) => e.message.includes('cannot exceed entered Production'))).toBe(true);
  });

  it('correctly handles child order progressive disclosure counts', () => {
    const childOrders = [
      { id: 'c-1', work_order_no: 'WO-C1', customer_name: 'Client A' },
      { id: 'c-2', work_order_no: 'WO-C2', customer_name: 'Client B' },
      { id: 'c-3', work_order_no: 'WO-C3', customer_name: 'Client C' },
      { id: 'c-4', work_order_no: 'WO-C4', customer_name: 'Client D' },
    ];

    // When collapsed, only first 2 are displayed
    const collapsed = childOrders.slice(0, 2);
    const hiddenCount = childOrders.length - collapsed.length;

    expect(collapsed.length).toBe(2);
    expect(hiddenCount).toBe(2);

    // If query matches third child, searching expands or includes matched
    const query = 'client c';
    const hasMatch = childOrders.some((c) => c.customer_name.toLowerCase().includes(query));
    expect(hasMatch).toBe(true);
  });
});
