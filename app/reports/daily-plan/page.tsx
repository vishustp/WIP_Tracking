'use client';

import RouteAccessGuard from '@/components/common/RouteAccessGuard';
import DailyPlanningReportClient from '@/components/reports/DailyPlanningReportClient';

export default function Page() {
  return (
    <RouteAccessGuard
      allowedGroups={['admin', 'super_user', 'user']}
      formTitle="Official Daily Planning Report (Format F PROD-003 / 005)"
    >
      <DailyPlanningReportClient />
    </RouteAccessGuard>
  );
}
