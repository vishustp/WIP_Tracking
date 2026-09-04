'use client';

import RouteAccessGuard from '@/components/common/RouteAccessGuard';
import RollingPlanIssueReportClient from '@/components/reports/RollingPlanIssueReportClient';

export default function Page() {
  return (
    <RouteAccessGuard
      allowedGroups={['admin', 'super_user', 'user']}
      formTitle="Rolling Plan Issue Schedule"
    >
      <RollingPlanIssueReportClient />
    </RouteAccessGuard>
  );
}
