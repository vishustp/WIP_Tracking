import {InputHTMLAttributes} from 'react';
export function Input({className='',...props}:InputHTMLAttributes<HTMLInputElement>){return <input className={`w-full rounded-lg border px-3 py-2 outline-none focus:ring-2 focus:ring-slate-400 ${className}`} {...props}/>}
