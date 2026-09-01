import { InputHTMLAttributes } from 'react';

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`min-h-[2.5rem] w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-2xs outline-none transition focus:border-[#0078d4] focus:ring-2 focus:ring-[#0078d4]/20 disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed ${className}`}
      {...props}
    />
  );
}

