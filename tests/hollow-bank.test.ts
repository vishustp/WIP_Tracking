import { describe, it, expect } from 'vitest';
import { calculatePipeWeightMt, HollowBankLot, HollowBankStatus } from '@/lib/hollow-bank/types';
import { isRouteVisible, isRouteVisibleForGroup } from '@/lib/permissions';
import { isHollowBankOrder } from '@/hooks/useQueue';

describe('Hollow Bank Inventory & Allocation Unit Tests', () => {
  describe('calculatePipeWeightMt', () => {
    it('accurately calculates metallurgical weight in metric tonnes (MT)', () => {
      // Size: 66.0 mm OD x 6.25 mm WT, 100 meters
      // Formula: (66 - 6.25) * 6.25 * 0.0246615 * 0.001 * 100 = 0.9209 MT
      const mt = calculatePipeWeightMt(66.0, 6.25, 100);
      expect(mt).toBeCloseTo(0.921, 3);
    });

    it('returns 0 for non-positive dimensions or zero length', () => {
      expect(calculatePipeWeightMt(0, 4.5, 100)).toBe(0);
      expect(calculatePipeWeightMt(50, 0, 100)).toBe(0);
      expect(calculatePipeWeightMt(50, 5, 0)).toBe(0);
    });

    it('conserves mass across multiple split allocations', () => {
      const od = 57.0;
      const wt = 4.5;
      const totalMtr = 1000;
      const totalMt = calculatePipeWeightMt(od, wt, totalMtr);

      const split1Mtr = 400;
      const split2Mtr = 600;
      const split1Mt = calculatePipeWeightMt(od, wt, split1Mtr);
      const split2Mt = calculatePipeWeightMt(od, wt, split2Mtr);

      expect(split1Mt + split2Mt).toBeCloseTo(totalMt, 2);
    });
  });

  describe('Lot Allocation Ledger & Status Transitions', () => {
    function simulateAllocation(
      lot: { pcs: number; total_meters: number; available_pcs: number; available_meters: number; status: HollowBankStatus },
      allocPcs: number,
      allocMtr: number
    ) {
      if (lot.status === 'FULLY_ALLOCATED' || lot.status === 'SCRAPPED') {
        throw new Error('Lot is not available for allocation');
      }
      if (allocPcs > lot.available_pcs) {
        throw new Error(`Cannot allocate ${allocPcs} pcs: exceeds available ${lot.available_pcs} pcs`);
      }
      if (allocMtr > lot.available_meters) {
        throw new Error(`Cannot allocate ${allocMtr} m: exceeds available ${lot.available_meters} m`);
      }

      const newAvailPcs = lot.available_pcs - allocPcs;
      const newAvailMtr = Number((lot.available_meters - allocMtr).toFixed(2));
      const newStatus: HollowBankStatus = newAvailPcs <= 0 || newAvailMtr <= 0 ? 'FULLY_ALLOCATED' : 'PARTIALLY_ALLOCATED';

      return {
        ...lot,
        available_pcs: newAvailPcs,
        available_meters: newAvailMtr,
        status: newStatus,
      };
    }

    it('transitions from AVAILABLE to PARTIALLY_ALLOCATED on partial withdrawal', () => {
      const initialLot = {
        pcs: 50,
        total_meters: 300,
        available_pcs: 50,
        available_meters: 300,
        status: 'AVAILABLE' as HollowBankStatus,
      };

      const afterFirstAlloc = simulateAllocation(initialLot, 20, 120);
      expect(afterFirstAlloc.available_pcs).toBe(30);
      expect(afterFirstAlloc.available_meters).toBe(180);
      expect(afterFirstAlloc.status).toBe('PARTIALLY_ALLOCATED');
    });

    it('transitions to FULLY_ALLOCATED when all stock is disbursed', () => {
      const partiallyAllocatedLot = {
        pcs: 50,
        total_meters: 300,
        available_pcs: 30,
        available_meters: 180,
        status: 'PARTIALLY_ALLOCATED' as HollowBankStatus,
      };

      const finalLot = simulateAllocation(partiallyAllocatedLot, 30, 180);
      expect(finalLot.available_pcs).toBe(0);
      expect(finalLot.available_meters).toBe(0);
      expect(finalLot.status).toBe('FULLY_ALLOCATED');
    });

    it('blocks attempting to allocate more than remaining balance', () => {
      const lot = {
        pcs: 50,
        total_meters: 300,
        available_pcs: 10,
        available_meters: 60,
        status: 'PARTIALLY_ALLOCATED' as HollowBankStatus,
      };

      expect(() => simulateAllocation(lot, 15, 90)).toThrow(/exceeds available/);
    });

    it('blocks allocating from an already FULLY_ALLOCATED lot', () => {
      const exhaustedLot = {
        pcs: 50,
        total_meters: 300,
        available_pcs: 0,
        available_meters: 0,
        status: 'FULLY_ALLOCATED' as HollowBankStatus,
      };

      expect(() => simulateAllocation(exhaustedLot, 1, 6)).toThrow(/not available for allocation/);
    });
  });

  describe('Permissions & Navigation', () => {
    it('authorizes /hollow-bank route for admin and super_user groups', () => {
      expect(isRouteVisibleForGroup('admin', '/hollow-bank')).toBe(true);
      expect(isRouteVisibleForGroup('super_user', '/hollow-bank')).toBe(true);
      expect(isRouteVisibleForGroup('user', '/hollow-bank')).toBe(true);
    });

    it('grants access to users with diversion permission or PPC profile', () => {
      const ppcUser: any = {
        group: 'user',
        role: 'manager',
        department: 'PPC Planning',
        permissions: {},
      };
      expect(isRouteVisible(ppcUser, '/hollow-bank')).toBe(true);

      const diversionUser: any = {
        group: 'user',
        role: 'operator',
        permissions: { diversion: 'edit' },
      };
      expect(isRouteVisible(diversionUser, '/hollow-bank')).toBe(true);
    });
  });

  describe('Production Entry Exclusion & Identification', () => {
    it('accurately identifies Hollow bank orders by virtual ID (id or work_order_id), name, or customer', () => {
      expect(isHollowBankOrder({ id: '00000000-0000-0000-0000-00000000000b' })).toBe(true);
      expect(isHollowBankOrder({ work_order_id: '00000000-0000-0000-0000-00000000000b' })).toBe(true);
      expect(isHollowBankOrder({ work_order_no: 'Hollow bank' })).toBe(true);
      expect(isHollowBankOrder({ work_order_no: 'HB-BUFFER' })).toBe(true);
      expect(isHollowBankOrder({ customer_name: 'Hollow bank' })).toBe(true);
      expect(isHollowBankOrder({ customer_name: 'HOLLOW BANK BUFFER YARD' })).toBe(true);

      // Normal orders are not identified as Hollow bank
      expect(isHollowBankOrder({ id: '11111111-1111-1111-1111-111111111111', work_order_no: '1446', customer_name: 'JSW Steel' })).toBe(false);
      expect(isHollowBankOrder({ work_order_id: '11111111-1111-1111-1111-111111111111', work_order_no: '1446', customer_name: 'JSW Steel' })).toBe(false);
      expect(isHollowBankOrder(null)).toBe(false);
      expect(isHollowBankOrder(undefined)).toBe(false);
    });

    it('filters out Hollow bank rows from production entry queue arrays', () => {
      const queueRows = [
        { work_order_id: 'wo-1', work_order_no: '1446', customer_name: 'Customer A' },
        { work_order_id: '00000000-0000-0000-0000-00000000000b', work_order_no: 'Hollow bank', customer_name: 'Hollow bank' },
        { work_order_id: 'wo-2', work_order_no: '1447', customer_name: 'Customer B' },
      ];

      const filtered = queueRows.filter((r) => !isHollowBankOrder(r));
      expect(filtered).toHaveLength(2);
      expect(filtered.map((r) => r.work_order_no)).toEqual(['1446', '1447']);
    });

    it('filters out Hollow bank from VDI inspection work order datasets', () => {
      const vdiWorkOrders = [
        { id: 'wo-1', work_order_no: '1446', customer_name: 'Customer A' },
        { id: '00000000-0000-0000-0000-00000000000b', work_order_no: 'Hollow bank', customer_name: 'Hollow bank' },
        { id: 'wo-2', work_order_no: '1451', customer_name: 'Customer B' },
      ];

      const activeVdiOrders = vdiWorkOrders.filter((w) => !isHollowBankOrder(w));
      expect(activeVdiOrders).toHaveLength(2);
      expect(activeVdiOrders.find((w) => w.id === '00000000-0000-0000-0000-00000000000b')).toBeUndefined();
    });

    it('blocks production entry validation for Hollow bank orders', async () => {
      const { validateProductionEntry } = await import('@/lib/productionValidation');
      const hollowBankRow: any = {
        work_order_id: '00000000-0000-0000-0000-00000000000b',
        work_order_no: 'Hollow bank',
        customer_name: 'Hollow bank',
        stage_code: 'VDI',
        avg_length: 6,
        pcs: '10',
        mtr: '60',
        rejection_pcs: '0',
        rejection_mtr: '0',
        htc_ok_pcs: '10',
        htc_ok_mtr: '60',
        od: 60,
        wl: 4,
      };

      const errors = validateProductionEntry(hollowBankRow, 'VDI');
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('Hollow Bank is dedicated yard buffer inventory');
    });
  });
});

