import { TextareaHTMLAttributes } from 'react';
export function Textarea({className='',...props}:TextareaHTMLAttributes<HTMLTextAreaElement>){
  return <textarea className={`min-h-24 w-full rounded-lg border px-3 py-2 outline-none focus:ring-2 focus:ring-slate-400 ${className}`} {...props}/>;
}
