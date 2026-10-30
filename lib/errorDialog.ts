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

/**
 * Determines whether an error message or stack trace is benign browser/framework/extension noise
 * (e.g., Next.js streaming $RC replacement, Firefox/Chrome extension injections, ResizeObserver loop)
 * that must NEVER be surfaced to the user as a blocking system error dialog.
 */
export function isIgnorableError(
  message?: string | null,
  stack?: string | null,
  filename?: string | null
): boolean {
  const msg = String(message || '').toLowerCase();
  const stk = String(stack || '').toLowerCase();
  const file = String(filename || '').toLowerCase();

  // 1. Next.js / React streaming & hydration script artifacts (e.g. $RC, $RM, $RA, parentNode)
  if (
    stk.includes('$rc') ||
    stk.includes('$rm') ||
    stk.includes('$ra') ||
    msg.includes('parentnode') ||
    msg.includes("can't access property \"parentnode\"") ||
    msg.includes("cannot read properties of null (reading 'parentnode')") ||
    msg.includes("cannot read property 'parentnode' of null") ||
    msg.includes('hydration failed') ||
    msg.includes('initial ui does not match') ||
    msg.includes('text content does not match') ||
    msg.includes('error while hydrating')
  ) {
    return true;
  }

  // 2. Browser extension injections (Chrome, Firefox, Safari)
  if (
    file.includes('extension://') ||
    file.includes('moz-extension://') ||
    file.includes('chrome-extension://') ||
    file.includes('safari-extension://') ||
    stk.includes('extension://') ||
    stk.includes('moz-extension://') ||
    stk.includes('chrome-extension://')
  ) {
    return true;
  }

  // 3. Benign DOM observation, cross-origin script, and request cancellation events
  if (
    msg.includes('resizeobserver loop') ||
    msg.includes('script error') ||
    msg.includes('aborterror') ||
    msg.includes('the user aborted a request') ||
    msg.includes('the operation was aborted') ||
    msg.includes('operation aborted')
  ) {
    return true;
  }

  // 4. Benign dynamic import chunk load errors during deployment transitions
  if (msg.includes('loading chunk') || msg.includes('chunkloaderror')) {
    return true;
  }

  return false;
}

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

  // Never surface benign framework streaming, extension, or browser observation errors
  if (isIgnorableError(payload.message, payload.details)) {
    return;
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

