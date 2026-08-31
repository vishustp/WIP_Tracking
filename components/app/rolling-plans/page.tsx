'use client';

import { Suspense } from 'react';
import RollingPlanForm from '@/components/rolling-plans/RollingPlanForm';
import RouteAccessGuard from '@/components/common/RouteAccessGuard';

export default function Page() {
  return (
    <RouteAccessGuard allowedGroups={['admin', 'super_user']} formTitle="Rolling Planning Form">
      <Suspense fallback={<div className="p-8 text-center text-xs text-slate-500">Loading rolling plans...</div>}>
        <RollingPlanForm />
      </Suspense>
    </RouteAccessGuard>
  );
}
