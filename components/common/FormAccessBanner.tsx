'use client';

import React from 'react';
import Link from 'next/link';
import { Eye, ShieldCheck, Lock, UserCheck, ShieldAlert, Info, Sparkles } from 'lucide-react';
import { FormAccessResult } from '@/lib/permissions';

interface FormAccessBannerProps {
  access: FormAccessResult;
  className?: string;
  showSwitchLink?: boolean;
}

export default function FormAccessBanner({ access, className = '', showSwitchLink = true }: FormAccessBannerProps) {
  const isViewOnly = access.mode === 'view_only';

  if (!isViewOnly) {
    return (
      <div
        className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200/80 bg-emerald-50/60 p-3 sm:px-4 sm:py-2.5 text-sm text-emerald-950 shadow-xs ${className}`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-6 w-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
            <ShieldCheck size={14} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-emerald-900">{access.bannerTitle}</span>
            <span className="inline-flex items-center rounded-md bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800 border border-emerald-200">
              Full Access
            </span>
            <span className="text-emerald-800/80 hidden sm:inline text-sm truncate">
              {access.bannerMessage}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm text-emerald-800 shrink-0">
          <span className="font-semibold">{access.groupName}</span>
          <span className="text-emerald-400">·</span>
          <span>{access.userWorkCenterLabel}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-amber-300/80 bg-linear-to-r from-amber-50 via-amber-50/70 to-orange-50/60 p-3.5 sm:p-4 text-sm shadow-xs ${className}`}
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="h-8 w-8 rounded-lg bg-amber-500 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
            <Eye size={16} />
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-amber-950 text-sm sm:text-sm">
                {access.bannerTitle}
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-200/80 px-2.5 py-1 text-xs font-bold text-amber-900 border border-amber-300">
                <Lock size={10} />
                View-Only Mode
              </span>
              <span className="rounded-md bg-white/80 px-2.5 py-1 text-xs font-semibold text-slate-700 border border-slate-200">
                Active Group: {access.groupName}
              </span>
            </div>
            <p className="text-amber-900/90 text-sm leading-relaxed max-w-3xl">
              {access.bannerMessage}
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-0.5 text-sm text-amber-800/90 font-medium">
              <span>Authorized for modification:</span>
              <div className="flex flex-wrap gap-1">
                {access.authorizedGroups.map((g) => (
                  <span
                    key={g}
                    className="inline-flex items-center rounded px-2 py-0.2 bg-amber-100/80 text-amber-900 border border-amber-200/80 text-xs font-semibold"
                  >
                    {g}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {showSwitchLink && (
          <div className="flex items-center gap-2 shrink-0 md:self-center pl-11 md:pl-0">
            <Link
              href="/profile"
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-semibold text-amber-900 shadow-xs hover:bg-amber-50 transition-colors cursor-pointer"
            >
              <UserCheck size={13} className="text-amber-700" />
              Switch Profile / Role
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
