'use client';

import RouteAccessGuard from '@/components/common/RouteAccessGuard';
import WorkCenterProductionReportClient from '@/components/reports/WorkCenterProductionReportClient';

export default function Page() {
  return (
    <RouteAccessGuard
      allowedGroups={['admin', 'super_user', 'user']}
      formTitle="Work Center Production Report"
    >
      <WorkCenterProductionReportClient />
    </RouteAccessGuard>
  );
}
