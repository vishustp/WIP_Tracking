import { describe, it, expect } from 'vitest';
import { buildWorkOrderPayload, type WorkOrderFormData } from '../lib/productionUtils';
import { getFormAccess } from '../lib/permissions';

describe('Work Order Edit & Update Logic', () => {
  it('correctly builds payload for creating or updating a work order with derived metrics', () => {
    const formData: WorkOrderFormData = {
      work_order_no: 'WO-6172',
      customer_name: 'Industrial Piping Corp',
      specification: 'ASTM A106 Grade B',
      grade: 'ASTM A106 Grade B',
      size_od: '73.0',
      size_wt: '5.16',
      l1: '6.0',
      l2: '6.0',
      ordered_qty_mtr: '852',
      ordered_qty_pcs: '',
      ordered_qty_mt: '',
      balance_qty_mtr: '852',
      balance_qty_pcs: '',
      balance_qty_mt: '',
      target_date: '2026-11-15',
      status: 'In Progress',
      po_no: 'PO-99881',
      material_code: 'MAT-PIPE-01',
      destination: 'Plant Yard 2',
    };

    const payload = buildWorkOrderPayload(formData);

    expect(payload.work_order_no).toBe('WO-6172');
    expect(payload.customer_name).toBe('Industrial Piping Corp');
    expect(payload.specification).toBe('ASTM A106 Grade B');
    expect(payload.size_od).toBe(73);
    expect(payload.size_wt).toBe(5.16);
    expect(payload.l1).toBe(6.0);
    expect(payload.l2).toBe(6.0);
    expect(payload.ordered_qty_mtr).toBe(852);
    // 852m / 6.0m = 142 pcs
    expect(payload.ordered_qty_pcs).toBe(142);
    // mtFromMtr(852, 73, 5.16) > 0
    expect(payload.ordered_qty_mt).toBeGreaterThan(0);
    expect(payload.balance_qty_mtr).toBe(852);
    expect(payload.balance_qty_pcs).toBe(142);
    expect(payload.status).toBe('In Progress');
    expect(payload.po_no).toBe('PO-99881');
    expect(payload.material_code).toBe('MAT-PIPE-01');
    expect(payload.destination).toBe('Plant Yard 2');
    expect(payload.updated_at).toBeDefined();
  });

  it('allows editing an existing work order only for authorized roles', () => {
    const adminUser = { id: 'u1', email: 'admin@mill.com', group: 'admin', role: 'admin' };
    const customSuperUser = { id: 'u2', email: 'super@mill.com', group: 'super_user', role: 'manager', permissions: { work_order: 'edit' } };
    const operatorUser = { id: 'u3', email: 'op@mill.com', group: 'user', role: 'operator' };

    expect(getFormAccess(adminUser as any, 'work_order').isAllowed).toBe(true);
    expect(getFormAccess(customSuperUser as any, 'work_order').isAllowed).toBe(true);
    // Regular shop floor operator does not have edit/create rights on work orders
    expect(getFormAccess(operatorUser as any, 'work_order').isAllowed).toBe(false);
  });
});
