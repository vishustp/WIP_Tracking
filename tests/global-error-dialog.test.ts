import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  showErrorDialog,
  subscribeErrorDialog,
  clearErrorDialog,
  getActiveError,
  isIgnorableError,
} from '@/lib/errorDialog';

describe('Global Error Dialog Store & Event Emitter', () => {
  beforeEach(() => {
    clearErrorDialog();
  });

  it('initially has no active error dialog', () => {
    expect(getActiveError()).toBeNull();
  });

  it('notifies listeners when showErrorDialog is called with a string message', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeErrorDialog(listener);

    showErrorDialog('Invalid mother pipe length entered.');

    expect(listener).toHaveBeenCalledTimes(1);
    const payload = listener.mock.calls[0][0];
    expect(payload.message).toBe('Invalid mother pipe length entered.');
    expect(payload.title).toBe('Action Error');

    unsubscribe();
  });

  it('supports custom title and details', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeErrorDialog(listener);

    showErrorDialog({
      title: 'Validation Error',
      message: 'Rolling production exceeds 104% plan cap.',
      details: 'Maximum allowed is 104 PCS for WO 6352.',
    });

    expect(listener).toHaveBeenCalledTimes(1);
    const payload = listener.mock.calls[0][0];
    expect(payload.title).toBe('Validation Error');
    expect(payload.message).toBe('Rolling production exceeds 104% plan cap.');
    expect(payload.details).toBe('Maximum allowed is 104 PCS for WO 6352.');

    unsubscribe();
  });

  it('clears active error on clearErrorDialog', () => {
    showErrorDialog('Test error');
    expect(getActiveError()).not.toBeNull();

    clearErrorDialog();
    expect(getActiveError()).toBeNull();
  });

  it('handles Error objects and formats arrays of messages', () => {
    const err = new Error('Database connection failed');
    showErrorDialog(err);
    expect(getActiveError()?.message).toBe('Database connection failed');

    showErrorDialog(['Error 1: Cut length > 15m', 'Error 2: Pieces <= 0']);
    expect(getActiveError()?.items).toEqual(['Error 1: Cut length > 15m', 'Error 2: Pieces <= 0']);
  });

  describe('isIgnorableError filtering', () => {
    it('identifies and ignores Next.js $RC streaming parentNode error from screenshot', () => {
      const msg = "can't access property \"parentNode\", c is null";
      const stack = "$RC@https://seamless-wip.vercel.app/dashboard:16:220425\n@https://seamless-wip.vercel.app/dashboard:16:220857";

      expect(isIgnorableError(msg, stack)).toBe(true);

      // Calling showErrorDialog with this benign framework error must be suppressed
      showErrorDialog({
        title: 'System Error',
        message: msg,
        details: stack,
      });
      expect(getActiveError()).toBeNull();
    });

    it('identifies Chrome variant of parentNode hydration/streaming error', () => {
      const msg = "Cannot read properties of null (reading 'parentNode')";
      expect(isIgnorableError(msg)).toBe(true);
    });

    it('identifies browser extension errors', () => {
      expect(isIgnorableError('Uncaught error', 'at moz-extension://1234/content.js')).toBe(true);
      expect(isIgnorableError('Extension crash', null, 'chrome-extension://abcd/script.js')).toBe(true);
    });

    it('identifies benign observer and abort errors', () => {
      expect(isIgnorableError('ResizeObserver loop completed with undelivered notifications.')).toBe(true);
      expect(isIgnorableError('The user aborted a request.')).toBe(true);
      expect(isIgnorableError('AbortError: signal is aborted')).toBe(true);
      expect(isIgnorableError('Script error.')).toBe(true);
    });

    it('does NOT ignore genuine application or validation errors', () => {
      expect(isIgnorableError('Rolling production exceeds 104% plan cap.')).toBe(false);
      expect(isIgnorableError('Cut length cannot exceed 15.00 meters.')).toBe(false);
      expect(isIgnorableError('Network request failed: 500 Internal Server Error')).toBe(false);
      expect(isIgnorableError('Database foreign key violation: invalid work_order_id')).toBe(false);

      showErrorDialog('Cut length cannot exceed 15.00 meters.');
      expect(getActiveError()?.message).toBe('Cut length cannot exceed 15.00 meters.');
    });
  });
});

