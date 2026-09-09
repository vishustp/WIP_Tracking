'use client';

import RouteAccessGuard from '@/components/common/RouteAccessGuard';
import ProcessSheetReportClient from '@/components/reports/ProcessSheetReportClient';

export default function Page() {
  return (
    <RouteAccessGuard
      allowedGroups={['admin', 'super_user', 'user']}
      formTitle="Process Sheet (Format F-PROD-11)"
    >
      <ProcessSheetReportClient />
    </RouteAccessGuard>
  );
}
