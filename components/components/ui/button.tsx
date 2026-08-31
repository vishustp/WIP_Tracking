import { ButtonHTMLAttributes } from 'react';

export function Button({ className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`inline-flex min-h-[3rem] items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 text-base font-semibold text-white shadow-sm transition active:scale-[0.98] hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-900/25 disabled:pointer-events-none disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}
