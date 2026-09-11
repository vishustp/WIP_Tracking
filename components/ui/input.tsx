import type { InputHTMLAttributes, ReactNode } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  className?: string;
}

export function Input({ label, className = "", ...props }: InputProps) {
  return (
    <label className="block">
      {label && <span className="block text-xs font-semibold text-slate-700 mb-1">{label}</span>}
      <input
        className={`w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-2xs outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed ${className}`}
        {...props}
      />
    </label>
  );
}

export default Input;
