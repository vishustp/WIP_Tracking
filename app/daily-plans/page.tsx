// app/daily-plans/page.tsx
import { Suspense } from 'react';
import RouteAccessGuard from '@/components/common/RouteAccessGuard';
import DailyPlanningConsoleClient from '@/components/planning/DailyPlanningConsoleClient';

export const metadata = {
  title: 'Daily Planning Console | WIP Tracking System',
  description: 'Production Planning & Control (PPC) daily shift targets across Cold Draw Bench, Heat Treatment Furnaces, and Finishing Lines.',
};

export default function DailyPlanningPage() {
  return (
    <RouteAccessGuard allowedGroups={['admin', 'super_user', 'user']} formTitle="Daily Planning Console">
      <Suspense fallback={<div className="p-8 text-center text-xs text-slate-500">Loading Daily Planning Console...</div>}>
        <DailyPlanningConsoleClient />
      </Suspense>
    </RouteAccessGuard>
  );
}
