import { ButtonHTMLAttributes } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost' | 'secondary' | 'danger';
  type?: 'button' | 'submit' | 'reset';
  className?: string;
  disabled?: boolean;
  onClick?: any;
  children?: any;
  title?: string;
  [key: string]: any;
}

export function Button({ className = '', variant = 'default', ...props }: ButtonProps) {
  const variantStyles = {
    default: 'bg-[#0078d4] text-white hover:bg-[#106ebe] active:bg-[#005a9e] shadow-xs',
    outline: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 active:bg-slate-100 shadow-xs',
    ghost: 'text-slate-700 hover:bg-slate-100 active:bg-slate-200',
    secondary: 'bg-slate-100 text-slate-900 hover:bg-slate-200 active:bg-slate-300',
    danger: 'bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800 shadow-xs',
  }[variant];

  return (
    <button
      className={`inline-flex min-h-[2.5rem] items-center justify-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0078d4]/40 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 cursor-pointer ${variantStyles} ${className}`}
      {...props}
    />
  );
}

