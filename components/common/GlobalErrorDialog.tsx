'use client';

import React, { useEffect, useState, useRef } from 'react';
import { toast } from 'sonner';
import { AlertOctagon, X, AlertTriangle, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';
import {
  subscribeErrorDialog,
  clearErrorDialog,
  showErrorDialog,
  getActiveError,
  isIgnorableError,
  type ErrorDialogPayload,
} from '@/lib/errorDialog';

export function GlobalErrorDialog() {
  const [error, setError] = useState<ErrorDialogPayload | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Subscribe to error dialog events
  useEffect(() => {
    setError(getActiveError());
    const unsubscribe = subscribeErrorDialog((err) => {
      setError(err);
      setShowDetails(false);
      setCopied(false);
    });
    return unsubscribe;
  }, []);

  // Intercept Sonner toast.error and unhandled window errors
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 1. Monkey-patch toast.error to mirror into the Error Dialog Box
    const originalToastError = toast.error;
    (toast as any).error = (message: any, options?: any) => {
      // Still display the toast notification
      const result = originalToastError.call(toast, message, options);

      // Parse toast message
      let msgStr = '';
      if (typeof message === 'string') {
        msgStr = message;
      } else if (message instanceof Error) {
        msgStr = message.message;
      } else if (message && typeof message === 'object') {
        msgStr = message.title || message.description || message.message || JSON.stringify(message);
      } else {
        msgStr = String(message || 'An error occurred.');
      }

      showErrorDialog({
        title: (options?.description ? String(message) : 'Action Error') || 'Action Error',
        message: options?.description ? String(options.description) : msgStr,
      });

      return result;
    };

    // 2. Capture unhandled client errors
    const handleWindowError = (event: ErrorEvent) => {
      const msg = event.error?.message || event.message;
      const stack = event.error?.stack || null;
      const file = event.filename || null;

      if (isIgnorableError(msg, stack, file)) {
        return;
      }

      if (msg) {
        showErrorDialog({
          title: 'System Error',
          message: msg,
          details: stack,
        });
      }
    };

    // 3. Capture unhandled promise rejections
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      let msg = 'An unexpected asynchronous error occurred.';
      let details: string | null = null;

      if (typeof reason === 'string') {
        msg = reason;
      } else if (reason instanceof Error) {
        msg = reason.message;
        details = reason.stack || null;
      } else if (reason?.message) {
        msg = String(reason.message);
        details = JSON.stringify(reason);
      }

      if (isIgnorableError(msg, details)) {
        return;
      }

      showErrorDialog({
        title: 'Asynchronous Operation Error',
        message: msg,
        details,
      });
    };

    window.addEventListener('error', handleWindowError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      (toast as any).error = originalToastError;
      window.removeEventListener('error', handleWindowError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  // Focus trap & keyboard accessibility (Esc to close, initial focus)
  useEffect(() => {
    if (!error) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        clearErrorDialog();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    // Auto-focus the close button for instant keyboard accessibility
    const timer = setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 50);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
    };
  }, [error]);

  if (!error) return null;

  const handleCopy = () => {
    const fullText = [
      `[${error.title || 'Error'}]`,
      error.message,
      error.items ? error.items.map((it) => `• ${it}`).join('\n') : '',
      error.details ? `\nDetails:\n${error.details}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    navigator.clipboard?.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="error-dialog-title"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          clearErrorDialog();
        }
      }}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-lg rounded-xl border border-rose-300 dark:border-rose-900/80 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-rose-100 dark:border-rose-950/60 bg-rose-50 dark:bg-rose-950/40 px-4 py-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-600 text-white shadow-xs shrink-0">
              <AlertOctagon size={18} strokeWidth={2.2} />
            </div>
            <div className="min-w-0">
              <h3
                id="error-dialog-title"
                className="text-sm font-bold text-rose-950 dark:text-rose-100 truncate"
              >
                {error.title || 'Action Error'}
              </h3>
              <p className="text-[11px] font-medium text-rose-700 dark:text-rose-300">
                Notice: Operation could not proceed
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={clearErrorDialog}
            className="rounded-lg p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Dismiss error dialog (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
          {/* Main Error Message */}
          <div className="text-sm font-medium text-slate-800 dark:text-slate-100 leading-relaxed break-words whitespace-pre-wrap">
            {error.message}
          </div>

          {/* Itemized Errors List (e.g. multi-row validation failures) */}
          {error.items && error.items.length > 0 && (
            <div className="rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50/60 dark:bg-rose-950/30 p-2.5 space-y-1.5">
              <div className="text-[11px] font-bold text-rose-900 dark:text-rose-200 flex items-center gap-1.5 uppercase tracking-wider">
                <AlertTriangle size={13} className="text-rose-600 dark:text-rose-400" />
                Issues Requiring Attention ({error.items.length})
              </div>
              <ul className="space-y-1 text-xs text-rose-900 dark:text-rose-200 list-disc list-inside">
                {error.items.map((item, idx) => (
                  <li key={idx} className="font-mono text-[11px] leading-tight break-words">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Technical Details Accordion */}
          {error.details && (
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowDetails(!showDetails)}
                className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              >
                {showDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                <span>{showDetails ? 'Hide Technical Details' : 'View Technical Details'}</span>
              </button>

              {showDetails && (
                <div className="mt-2 rounded-md bg-slate-950 p-2.5 text-slate-100 font-mono text-[10px] leading-tight overflow-x-auto max-h-40">
                  <pre>{error.details}</pre>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/80 px-4 py-2.5">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
          >
            {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
            <span>{copied ? 'Copied to clipboard' : 'Copy error details'}</span>
          </button>

          <button
            ref={closeButtonRef}
            type="button"
            onClick={clearErrorDialog}
            className="rounded-lg bg-rose-600 px-4 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-rose-700 active:bg-rose-800 focus:outline-hidden focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 transition-colors"
          >
            {error.actionLabel || 'Acknowledge & Close'}
          </button>
        </div>
      </div>
    </div>
  );
}
export default GlobalErrorDialog;

