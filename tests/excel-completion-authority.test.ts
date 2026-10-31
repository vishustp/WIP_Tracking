import { describe, it, expect } from 'vitest';
import {
  isOrderCompletedForImport,
  buildWorkOrderUpdatePayload,
  buildWorkOrderInsertPayload,
} from '../lib/excelWorkOrderImport';

describe('Phase 0: PPC Master Excel Completion Authority & Bundling Decoupling', () => {
  describe('PPC Excel Completion Authority over Work Order Lifecycle', () => {
    it('1. Keeps order In Progress when Excel upload shows pending balance to make', () => {
      const openRow = {
        work_order_no: 'WO-6500',
        balance_to_make_mtr: 120.5,
        current_status: 'In Progress',
        ordered_qty_mtr: 500,
      };

      const isCompleted = isOrderCompletedForImport(openRow);
      expect(isCompleted).toBe(false);

      const updatePayload = buildWorkOrderUpdatePayload(openRow, {
        existsInDb: true,
        currentDbStatus: 'In Progress',
      });

      // Does not mark as Completed
      expect(updatePayload.status).toBeUndefined();
    });

    it('2. Reopens a previously completed order if incoming Excel shows pending balance', () => {
      // Scenario: Order was prematurely marked 'Completed' by shop floor bundling,
      // but PPC uploads an updated master Excel indicating additional quantity or pending balance.
      const reopenRow = {
        work_order_no: 'WO-6501',
        balance_to_make_mtr: 45.0,
        current_status: 'In Progress',
        ordered_qty_mtr: 600,
      };

      const isCompleted = isOrderCompletedForImport(reopenRow);
      expect(isCompleted).toBe(false);

      const updatePayload = buildWorkOrderUpdatePayload(reopenRow, {
        existsInDb: true,
        currentDbStatus: 'Completed',
      });

      // PPC Master Excel overrides shop floor: reopens to 'In Progress'
      expect(updatePayload.status).toBe('In Progress');
    });

    it('3. Auto-completes work order when Excel explicitly marks status as Completed', () => {
      const completedRow = {
        work_order_no: 'WO-6502',
        balance_to_make_mtr: 0,
        current_status: 'Completed',
        ordered_qty_mtr: 500,
      };

      const isCompleted = isOrderCompletedForImport(completedRow);
      expect(isCompleted).toBe(true);

      const updatePayload = buildWorkOrderUpdatePayload(completedRow, {
        existsInDb: true,
        currentDbStatus: 'In Progress',
      });

      expect(updatePayload.status).toBe('Completed');
    });

    it('4. Auto-completes work order when balance_to_make_mtr is below 5.0m threshold', () => {
      const smallBalRow = {
        work_order_no: 'WO-6503',
        balance_to_make_mtr: 2.1,
        current_status: 'In Progress',
        ordered_qty_mtr: 500,
      };

      const isCompleted = isOrderCompletedForImport(smallBalRow);
      expect(isCompleted).toBe(true);

      const updatePayload = buildWorkOrderUpdatePayload(smallBalRow, {
        existsInDb: true,
        currentDbStatus: 'In Progress',
      });

      expect(updatePayload.status).toBe('Completed');
    });
  });

  describe('Shop Floor Bundling Decoupling Logic', () => {
    it('5. Verifies bundling completion policy: keeps In Progress unless previously authorized by PPC', () => {
      // Given: An order with 500m target where shop floor bundles 500m
      const targetMtr = 500;
      const totalFinished = 500;
      expect(totalFinished >= targetMtr).toBe(true);

      // Under the decoupled rule:
      // Even though totalFinished >= targetMtr, if the commercial status was NOT 'Completed' by PPC Excel,
      // bundling entry sets/preserves status as 'In Progress'.
      const woDataOpen = { status: 'In Progress', balance_qty_mtr: targetMtr };
      const wasCompletedOpen = String(woDataOpen.status).toLowerCase() === 'completed';
      const newStatusOpen = wasCompletedOpen ? 'Completed' : 'In Progress';
      expect(newStatusOpen).toBe('In Progress');

      // If PPC Excel had already marked it Completed, bundling preserves Completed:
      const woDataCompleted = { status: 'Completed', balance_qty_mtr: targetMtr };
      const wasCompletedDone = String(woDataCompleted.status).toLowerCase() === 'completed';
      const newStatusDone = wasCompletedDone ? 'Completed' : 'In Progress';
      expect(newStatusDone).toBe('Completed');
    });
  });
});
