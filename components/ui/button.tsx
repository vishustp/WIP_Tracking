import {ButtonHTMLAttributes} from 'react';
export function Button({className='',...props}:ButtonHTMLAttributes<HTMLButtonElement>){return <button className={`rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${className}`} {...props}/>}
