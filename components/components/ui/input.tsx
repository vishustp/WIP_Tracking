import { InputHTMLAttributes } from 'react';

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`min-h-[3rem] w-full rounded-xl border-2 border-slate-300 bg-white px-4 text-base outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-600/15 ${className}`}
      {...props}
    />
  );
}
