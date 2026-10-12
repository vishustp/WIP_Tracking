'use client';

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  className?: string;
  error?: string;
  helperText?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, className = "", id, error, helperText, ...props },
  ref
) {
  const generatedId = useId();
  const inputId = id || generatedId;

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-semibold text-[var(--text-main,#0f172a)] mb-1">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        className={`w-full rounded-lg border ${
          error ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500' : 'border-[var(--border-subtle,#cbd5e1)] focus:border-brand-600 focus:ring-brand-600'
        } bg-[var(--bg-surface,#ffffff)] px-3 py-2 text-sm text-[var(--text-main,#0f172a)] placeholder:text-[var(--text-muted,#94a3b8)] shadow-2xs outline-none transition focus:ring-1 disabled:bg-[var(--bg-surface-subtle,#f1f5f9)] disabled:text-[var(--text-muted,#94a3b8)] disabled:cursor-not-allowed ${className}`}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined}
        {...props}
      />
      {error && (
        <p id={`${inputId}-error`} className="mt-1 text-xs text-rose-600 font-medium">
          {error}
        </p>
      )}
      {helperText && !error && (
        <p id={`${inputId}-helper`} className="mt-1 text-xs text-[var(--text-muted,#64748b)]">
          {helperText}
        </p>
      )}
    </div>
  );
});
