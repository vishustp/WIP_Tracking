'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { usePermissions, GROUP_CONFIGS } from '@/lib/permissions';
import { ShieldAlert, Factory, BarChart3, Lock, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface RouteAccessGuardProps {
  children?: React.ReactNode;
  allowedGroups?: ('admin' | 'super_user' | 'user')[];
  formTitle?: string;
}

export default function RouteAccessGuard({
  children,
  allowedGroups = ['admin', 'super_user'],
  formTitle = 'This Form',
}: RouteAccessGuardProps) {
  const router = useRouter();
  const { user, group, isUserGroup } = usePermissions();

  const isAllowed = allowedGroups.includes(group);

  if (isAllowed) {
    return <>{children}</>;
  }

  const grpConfig = GROUP_CONFIGS[group] || GROUP_CONFIGS.user;

  return (
    <div className="mx-auto max-w-3xl py-12 px-4">
      <div className="rounded-2xl border border-amber-200 bg-white p-8 shadow-sm text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 shadow-inner">
          <ShieldAlert className="h-7 w-7" />
        </div>

        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold bg-amber-100 text-amber-800 border border-amber-300 mb-3">
          <Lock className="h-3.5 w-3.5" /> Form Hidden & Access Restricted
        </div>

        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 mb-2">
          {formTitle} is Not Accessible
        </h1>

        <p className="text-sm text-slate-600 max-w-xl mx-auto leading-relaxed mb-6">
          Your account is currently signed in under the{' '}
          <strong className="text-slate-900">{grpConfig.name}</strong>. Per plant security policy,
          planning forms, work order modifications, and administrative controls are hidden for standard user accounts.
        </p>

        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-600 max-w-lg mx-auto mb-8 text-left space-y-2">
          <div className="font-semibold text-slate-800 flex items-center gap-1.5">
            <span>Accessible Sections for User Group:</span>
          </div>
          <ul className="list-disc pl-5 space-y-1 text-slate-600">
            <li>
              <strong className="text-slate-800">Production Entry Form:</strong> Record shift logs, yields, and rejections for your assigned work center.
            </li>
            <li>
              <strong className="text-slate-800">Reports & Analytics:</strong> View live pending orders, WIP stages, rolling logs, and production history.
            </li>
          </ul>
          <p className="text-sm text-slate-500 pt-1 border-t border-slate-200">
            Note: User profiles and authority groups can only be configured by System Administrators.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button
            type="button"
            onClick={() => router.push('/production')}
            className="bg-slate-900 text-white hover:bg-slate-800 inline-flex items-center gap-2 text-sm py-2 px-4"
          >
            <Factory className="h-4 w-4" /> Go to Production Entry
          </Button>

          <Button
            type="button"
            onClick={() => router.push('/reports/wip')}
            className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 inline-flex items-center gap-2 text-sm py-2 px-4"
          >
            <BarChart3 className="h-4 w-4" /> View WIP Reports
          </Button>
        </div>
      </div>
    </div>
  );
}
