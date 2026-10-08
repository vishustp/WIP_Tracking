// tests/rejection-ui-state.test.ts
import { describe, it, expect } from 'vitest';
import { canDeclareRejection, canVerifyRejection, canApproveRejection } from '../lib/rejections/types';

describe('Rejection UI Permissions', () => {
  it('allows production operator to declare rejection', () => {
    expect(canDeclareRejection('rolling_incharge')).toBe(true);
    expect(canDeclareRejection('draw_operator')).toBe(true);
    expect(canDeclareRejection('Production Operator')).toBe(true);
    expect(canDeclareRejection('admin')).toBe(true);
  });

  it('restricts QC verification to QA inspectors and Admin', () => {
    expect(canVerifyRejection('qa_inspector')).toBe(true);
    expect(canVerifyRejection('Quality & NDT Inspector')).toBe(true);
    expect(canVerifyRejection('admin')).toBe(true);
    expect(canVerifyRejection('rolling_incharge')).toBe(false);
    expect(canVerifyRejection('draw_operator')).toBe(false);
  });

  it('restricts PPC approval to PPC manager and Admin', () => {
    expect(canApproveRejection('manager')).toBe(true);
    expect(canApproveRejection('PPC Administrator')).toBe(true);
    expect(canApproveRejection('admin')).toBe(true);
    expect(canApproveRejection('qa_inspector')).toBe(false);
    expect(canApproveRejection('draw_operator')).toBe(false);
  });
});
