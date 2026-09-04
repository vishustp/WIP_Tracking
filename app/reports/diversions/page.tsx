'use client';

import RouteAccessGuard from '@/components/common/RouteAccessGuard';
import DiversionIssueReportClient from '@/components/reports/DiversionIssueReportClient';

export default function Page() {
  return (
    <RouteAccessGuard
      allowedGroups={['admin', 'super_user', 'user']}
      formTitle="Material Diversion Issue Order"
    >
      <DiversionIssueReportClient />
    </RouteAccessGuard>
  );
}
