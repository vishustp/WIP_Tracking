// app/reports/rejections/page.tsx
'use client';

import RouteAccessGuard from '@/components/common/RouteAccessGuard';
import SalvageRejectionReportClient from '@/components/reports/SalvageRejectionReportClient';

export default function SalvageRejectionReportPage() {
  return (
    <RouteAccessGuard
      allowedGroups={['admin', 'super_user', 'user']}
      formTitle="Salvage & Rejection Material Report"
    >
      <SalvageRejectionReportClient />
    </RouteAccessGuard>
  );
}
