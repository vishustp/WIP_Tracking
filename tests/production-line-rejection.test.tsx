/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ProductionQueueRow } from '@/components/production/ProductionQueueRow';
import DeclareRejectionModal from '@/components/rejections/DeclareRejectionModal';
import { Row, emptyRow } from '@/types';

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        order: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
  }),
}));

describe('Production Line Rejection Feature', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  const sampleRow: Row = emptyRow({
    work_order_id: 'wo-123',
    work_order_no: 'WO-101',
    customer_name: 'BHEL Haridwar',
    specification: 'SA 213 T11',
    route_id: 'route-1',
    route_code: 'ALLOY_CDS',
    route_name: 'Alloy Cold Drawn Seamless',
    od: 50.8,
    wl: 4.5,
    l1: 6.0,
    l2: 6.0,
    avg_length: 6.0,
    balance_to_make_pcs: 2,
    balance_to_make_mtr: 12.0,
    balance_to_make_mt: 0.06,
    multiple: 1,
    ht_nos: 2,
    stage_code: 'DRAW',
  });

  it('renders the Reject button in ProductionQueueRow and calls onOpenReject with the row', () => {
    const handleOpenReject = vi.fn();
    const handleUpdateRow = vi.fn();
    const handleToggleExpand = vi.fn();

    render(
      <table>
        <tbody>
          <ProductionQueueRow
            row={sampleRow}
            stage="DRAW"
            isAllowed={true}
            onUpdateRow={handleUpdateRow}
            onToggleExpand={handleToggleExpand}
            onOpenReject={handleOpenReject}
          />
        </tbody>
      </table>
    );

    const rejectButton = screen.getByRole('button', { name: /reject/i });
    expect(rejectButton).toBeDefined();
    expect((rejectButton as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(rejectButton);
    expect(handleOpenReject).toHaveBeenCalledTimes(1);
    expect(handleOpenReject).toHaveBeenCalledWith(sampleRow);
  });

  it('disables the Reject button when isAllowed is false or balance is zero', () => {
    const handleOpenReject = vi.fn();
    const zeroBalanceRow: Row = {
      ...sampleRow,
      balance_to_make_pcs: 0,
      balance_to_make_mtr: 0,
    };

    const { rerender } = render(
      <table>
        <tbody>
          <ProductionQueueRow
            row={zeroBalanceRow}
            stage="DRAW"
            isAllowed={true}
            onUpdateRow={vi.fn()}
            onToggleExpand={vi.fn()}
            onOpenReject={handleOpenReject}
          />
        </tbody>
      </table>
    );

    let rejectBtn = screen.getByRole('button', { name: /reject/i }) as HTMLButtonElement;
    expect(rejectBtn.disabled).toBe(true);

    // When isAllowed is false
    rerender(
      <table>
        <tbody>
          <ProductionQueueRow
            row={sampleRow}
            stage="DRAW"
            isAllowed={false}
            onUpdateRow={vi.fn()}
            onToggleExpand={vi.fn()}
            onOpenReject={handleOpenReject}
          />
        </tbody>
      </table>
    );

    rejectBtn = screen.getByRole('button', { name: /reject/i }) as HTMLButtonElement;
    expect(rejectBtn.disabled).toBe(true);
  });

  it('pre-fills DeclareRejectionModal with locked work order and line scrap balance', () => {
    render(
      <DeclareRejectionModal
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        currentUser={{ name: 'Rajesh Sharma', id: 'emp-101' }}
        defaultWorkCenter="DRAW"
        preselectedWorkOrderId="wo-123"
        initialRejectedPcs={2}
        initialRejectedMtr={12.0}
        initialReasonCategory="SMALL_QTY_NO_REPROCESS"
        initialRemarks="Remaining balance rejected (2 PCS) - Small quantity no reprocess"
        lockWorkOrder={true}
        lockWorkCenter={true}
        workOrderDetails={{
          work_order_no: 'WO-101',
          customer_name: 'BHEL Haridwar',
          grade: 'SA 213 T11',
          size_od: 50.8,
          size_wt: 4.5,
          avg_length: 6.0,
        }}
      />
    );

    // Verify modal title
    expect(screen.getByText('Declare Material as Second / Salvage')).toBeDefined();

    // Verify work order badge is locked and displayed
    expect(screen.getByText('WO-101')).toBeDefined();
    expect(screen.getByText(/BHEL Haridwar/)).toBeDefined();

    // Verify pre-filled PCS input has value 2
    const pcsInput = screen.getByLabelText(/Rejected Pieces/i) as HTMLInputElement;
    expect(pcsInput.value).toBe('2');

    // Verify pre-filled Meters input has value 12
    const mtrInput = screen.getByLabelText(/Total Length/i) as HTMLInputElement;
    expect(mtrInput.value).toBe('12');

    // Verify reason category has SMALL_QTY_NO_REPROCESS selected
    const reasonSelect = screen.getByLabelText(/Defect Category/i) as HTMLSelectElement;
    expect(reasonSelect.value).toBe('SMALL_QTY_NO_REPROCESS');

    // Verify remarks prefilled
    const remarksInput = screen.getByLabelText(/Production Remarks/i) as HTMLTextAreaElement;
    expect(remarksInput.value).toContain('Remaining balance rejected (2 PCS)');
  });
});

