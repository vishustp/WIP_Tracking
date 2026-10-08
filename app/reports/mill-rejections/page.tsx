// app/reports/mill-rejections/page.tsx
'use client';

import RouteAccessGuard from '@/components/common/RouteAccessGuard';
import MillRejectionReportClient from '@/components/reports/MillRejectionReportClient';

export default function MillRejectionReportPage() {
  return (
    <RouteAccessGuard
      allowedGroups={['admin', 'super_user', 'user']}
      formTitle="Mill Rejection & Salvage Report"
    >
      <MillRejectionReportClient />
    </RouteAccessGuard>
  );
}
