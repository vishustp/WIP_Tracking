// components/reports/process-sheet/FormCommon.tsx
'use client';

import React from 'react';

export function FormSectionCard({
  title,
  icon: Icon,
  headerBg = 'bg-blue-800',
  children,
}: {
  title: string;
  icon: React.ElementType;
  headerBg?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs hover:shadow-sm transition-shadow">
      <div className={`px-4 py-2.5 ${headerBg} text-white flex items-center gap-2.5 shadow-xs`}>
        <div className="p-1 rounded bg-black/20 text-white">
          <Icon className="w-4 h-4" />
        </div>
        <h3 className="text-xs sm:text-sm font-bold tracking-wide uppercase">{title}</h3>
      </div>
      <div className="p-4 sm:p-5 bg-white">{children}</div>
    </div>
  );
}

export function FormInput({
  label,
  value,
  onChange,
  unit,
  type = 'text',
  placeholder,
  disabled = false,
  highlight = false,
  title,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  unit?: string;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
  highlight?: boolean;
  title?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <label className="font-bold text-slate-700 truncate" title={title || label}>
          {label}
        </label>
        {unit && (
          <span className="text-[10px] font-bold font-mono text-blue-900 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
            {unit}
          </span>
        )}
      </div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        title={title}
        className={`w-full px-3 py-1.5 font-bold text-xs rounded-lg focus:outline-none transition-colors shadow-xs ${
          disabled
            ? 'bg-slate-100 text-slate-500 border border-slate-200 cursor-not-allowed'
            : highlight
            ? 'bg-amber-50 text-amber-950 border-2 border-amber-500 focus:border-amber-600 focus:ring-2 focus:ring-amber-200'
            : 'bg-white text-slate-900 border border-slate-300 hover:border-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100'
        }`}
      />
    </div>
  );
}
