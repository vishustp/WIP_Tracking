import { SelectHTMLAttributes } from 'react';
export function Select({className='',...props}:SelectHTMLAttributes<HTMLSelectElement>){
  return <select className={`w-full rounded-lg border bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-slate-400 ${className}`} {...props}/>;
}
