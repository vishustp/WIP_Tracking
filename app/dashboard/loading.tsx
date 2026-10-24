import React from 'react';

export default function DashboardLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      {/* ========================================================================= */}
      {/* HEADER SKELETON                                                           */}
      {/* ========================================================================= */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1 border-b border-[var(--border-subtle,#e2e8f0)]">
        <div>
          <div className="flex items-center gap-2">
            <div className="h-6 w-32 bg-slate-200 dark:bg-slate-800 rounded-md" />
            <div className="h-5 w-24 bg-slate-100 dark:bg-slate-800/60 rounded-full" />
          </div>
          <div className="h-3 w-64 bg-slate-100 dark:bg-slate-800/40 rounded mt-2" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-8 w-36 bg-slate-100 dark:bg-slate-800 rounded-lg" />
          <div className="h-8 w-24 bg-slate-200 dark:bg-slate-800 rounded-lg" />
        </div>
      </div>

      {/* ========================================================================= */}
      {/* ROW 1: 5 SUMMARY KPI CARDS                                                */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="bg-[var(--bg-surface,#ffffff)] rounded-xl border border-[var(--border-subtle,#e2e8f0)] shadow-2xs p-3.5 flex flex-col justify-between h-[116px]"
          >
            <div className="flex items-start justify-between">
              <div className="h-8 w-8 rounded-lg bg-slate-200 dark:bg-slate-800" />
              <div className="h-3.5 w-20 bg-slate-100 dark:bg-slate-800 rounded" />
            </div>
            <div>
              <div className="flex items-baseline justify-between mt-2">
                <div className="h-6 w-16 bg-slate-200 dark:bg-slate-800 rounded" />
                <div className="h-4 w-12 bg-slate-100 dark:bg-slate-800 rounded" />
              </div>
              <div className="flex items-center justify-between mt-1.5">
                <div className="h-3 w-20 bg-slate-100 dark:bg-slate-800/60 rounded" />
                <div className="h-4 w-12 bg-slate-100 dark:bg-slate-800/40 rounded-full" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ========================================================================= */}
      {/* ROW 2: WIP BY PROCESS STAGE (7 POST-ROLLING WORK CENTERS)                 */}
      {/* ========================================================================= */}
      <div className="bg-[var(--bg-surface,#ffffff)] rounded-xl border border-[var(--border-subtle,#e2e8f0)] shadow-2xs p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="h-5 w-44 bg-slate-200 dark:bg-slate-800 rounded" />
              <div className="h-4 w-36 bg-slate-100 dark:bg-slate-800/60 rounded-full" />
            </div>
            <div className="h-3 w-80 bg-slate-100 dark:bg-slate-800/40 rounded mt-1.5" />
          </div>
          <div className="h-7 w-28 bg-slate-100 dark:bg-slate-800 rounded-lg" />
        </div>

        {/* 7 Stage pipeline cards */}
        <div className="overflow-x-auto pb-2 scrollbar-thin">
          <div className="flex items-center gap-2 min-w-[980px]">
            {['HTC', 'Hollow HT', 'Draw', 'Heat Treatment', 'Bandsaw', 'VDI', 'Finishing'].map((name, idx) => (
              <div key={name} className="flex items-center flex-1">
                <div className="flex-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-3 flex flex-col items-center justify-center">
                  <div className="h-3.5 w-16 bg-slate-200 dark:bg-slate-800 rounded" />
                  <div className="my-2.5 h-8 w-8 rounded-full bg-slate-200 dark:bg-slate-800" />
                  <div className="h-5 w-16 bg-slate-200 dark:bg-slate-800 rounded mb-1" />
                  <div className="h-3.5 w-14 bg-slate-100 dark:bg-slate-800/60 rounded" />
                </div>
                {idx < 6 && (
                  <div className="px-1 text-slate-300 dark:text-slate-700 shrink-0">→</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* ROW 3: VISUAL ANALYTICS (3 COLUMNS)                                       */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Col 1: WIP Distribution (4 cols) */}
        <div className="lg:col-span-4 bg-[var(--bg-surface,#ffffff)] rounded-xl border border-[var(--border-subtle,#e2e8f0)] shadow-2xs p-4 flex flex-col justify-between h-[300px]">
          <div>
            <div className="h-4 w-32 bg-slate-200 dark:bg-slate-800 rounded" />
            <div className="h-3 w-48 bg-slate-100 dark:bg-slate-800/60 rounded mt-1" />
          </div>
          <div className="flex items-center justify-center py-4">
            <div className="h-36 w-36 rounded-full border-8 border-slate-200 dark:border-slate-800" />
          </div>
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-3 bg-slate-100 dark:bg-slate-800 rounded" />
            ))}
          </div>
        </div>

        {/* Col 2: Yesterday's Production (5 cols) */}
        <div className="lg:col-span-5 bg-[var(--bg-surface,#ffffff)] rounded-xl border border-[var(--border-subtle,#e2e8f0)] shadow-2xs p-4 flex flex-col justify-between h-[300px]">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
            <div>
              <div className="h-4 w-36 bg-slate-200 dark:bg-slate-800 rounded" />
              <div className="h-3 w-48 bg-slate-100 dark:bg-slate-800/60 rounded mt-1" />
            </div>
            <div className="h-6 w-24 bg-slate-100 dark:bg-slate-800 rounded" />
          </div>
          <div className="space-y-2.5 py-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="h-3.5 w-24 bg-slate-200 dark:bg-slate-800 rounded" />
                <div className="h-3.5 w-16 bg-slate-100 dark:bg-slate-800 rounded" />
                <div className="h-3.5 w-14 bg-slate-200 dark:bg-slate-800 rounded" />
              </div>
            ))}
          </div>
          <div className="h-4 w-full bg-slate-100 dark:bg-slate-800 rounded" />
        </div>

        {/* Col 3: Top Bottlenecks (3 cols) */}
        <div className="lg:col-span-3 bg-[var(--bg-surface,#ffffff)] rounded-xl border border-[var(--border-subtle,#e2e8f0)] shadow-2xs p-4 flex flex-col justify-between h-[300px]">
          <div>
            <div className="h-4 w-28 bg-slate-200 dark:bg-slate-800 rounded" />
            <div className="h-3 w-36 bg-slate-100 dark:bg-slate-800/60 rounded mt-1" />
          </div>
          <div className="space-y-2 py-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-8 rounded-lg bg-slate-100 dark:bg-slate-800/60" />
            ))}
          </div>
          <div className="h-3 w-32 bg-slate-100 dark:bg-slate-800/40 rounded" />
        </div>
      </div>

      {/* ========================================================================= */}
      {/* ROW 4: DATA TABLES (2 COLUMNS)                                            */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: Recent Activity (5 cols) */}
        <div className="lg:col-span-5 bg-[var(--bg-surface,#ffffff)] rounded-xl border border-[var(--border-subtle,#e2e8f0)] shadow-2xs p-4 h-[320px]">
          <div className="h-4 w-32 bg-slate-200 dark:bg-slate-800 rounded mb-3" />
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center justify-between pb-2 border-b border-slate-50 dark:border-slate-800/40">
                <div className="space-y-1">
                  <div className="h-3.5 w-28 bg-slate-200 dark:bg-slate-800 rounded" />
                  <div className="h-3 w-20 bg-slate-100 dark:bg-slate-800/60 rounded" />
                </div>
                <div className="h-5 w-16 bg-slate-100 dark:bg-slate-800 rounded" />
              </div>
            ))}
          </div>
        </div>

        {/* Right: Work Order Status / Aging (7 cols) */}
        <div className="lg:col-span-7 bg-[var(--bg-surface,#ffffff)] rounded-xl border border-[var(--border-subtle,#e2e8f0)] shadow-2xs p-4 h-[320px]">
          <div className="h-4 w-40 bg-slate-200 dark:bg-slate-800 rounded mb-3" />
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center justify-between pb-2 border-b border-slate-50 dark:border-slate-800/40">
                <div className="space-y-1">
                  <div className="h-3.5 w-44 bg-slate-200 dark:bg-slate-800 rounded" />
                  <div className="h-3 w-32 bg-slate-100 dark:bg-slate-800/60 rounded" />
                </div>
                <div className="h-5 w-20 bg-slate-100 dark:bg-slate-800 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
