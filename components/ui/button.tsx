import { ButtonHTMLAttributes } from 'react';

export function Button({ className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`inline-flex min-h-[2.5rem] items-center justify-center gap-1.5 rounded-md bg-[#0078d4] px-4 py-2 text-sm font-semibold text-white shadow-xs transition hover:bg-[#106ebe] active:bg-[#005a9e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0078d4]/40 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 cursor-pointer ${className}`}
      {...props}
    />
  );
}

