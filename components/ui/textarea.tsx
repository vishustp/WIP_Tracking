import { TextareaHTMLAttributes } from 'react';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  className?: string;
  [key: string]: any;
}

export function Textarea({ className = '', ...props }: TextareaProps) {
  return (
    <textarea
      className={`min-h-28 w-full rounded-xl border-2 border-slate-300 bg-white px-4 py-3 text-base outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-600/15 ${className}`}
      {...props}
    />
  );
}
