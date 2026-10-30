export interface ErrorDialogPayload {
  title?: string;
  message: string;
  details?: string | null;
  items?: string[];
  actionLabel?: string;
}

type ErrorListener = (error: ErrorDialogPayload | null) => void;

let activeError: ErrorDialogPayload | null = null;
const listeners = new Set<ErrorListener>();

export function getActiveError(): ErrorDialogPayload | null {
  return activeError;
}

export function subscribeErrorDialog(listener: ErrorListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function clearErrorDialog(): void {
  activeError = null;
  listeners.forEach((fn) => {
    try {
      fn(null);
    } catch (e) {
      console.error('Error in error dialog listener:', e);
    }
  });
}

export function showErrorDialog(
  input: string | Error | ErrorDialogPayload | string[] | Array<{ message?: string; workOrder?: string }>
): void {
  let payload: ErrorDialogPayload;

  if (Array.isArray(input)) {
    const items = input.map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') {
        const wo = item.workOrder ? `[${item.workOrder}] ` : '';
        return `${wo}${item.message || JSON.stringify(item)}`;
      }
      return String(item);
    });

    payload = {
      title: 'Validation Error',
      message: `Please review and resolve the following issue${items.length > 1 ? 's' : ''}:`,
      items,
    };
  } else if (input instanceof Error) {
    payload = {
      title: 'Application Error',
      message: input.message || 'An unexpected error occurred.',
      details: input.stack || null,
    };
  } else if (typeof input === 'object' && input !== null) {
    payload = {
      title: input.title || 'Action Error',
      message: input.message || 'An unexpected error occurred.',
      details: input.details || null,
      items: input.items,
      actionLabel: input.actionLabel,
    };
  } else {
    payload = {
      title: 'Action Error',
      message: String(input || 'An unexpected error occurred.'),
    };
  }

  activeError = payload;
  listeners.forEach((fn) => {
    try {
      fn(payload);
    } catch (e) {
      console.error('Error in error dialog listener:', e);
    }
  });
}

