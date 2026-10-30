import { describe, it, expect, vi, beforeEach } from 'vitest';
import { showErrorDialog, subscribeErrorDialog, clearErrorDialog, getActiveError } from '@/lib/errorDialog';

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
});

