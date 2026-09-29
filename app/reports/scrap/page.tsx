'use client';

import RouteAccessGuard from '@/components/common/RouteAccessGuard';
import ScrapGenerationReportClient from '@/components/reports/ScrapGenerationReportClient';

export default function ScrapReportPage() {
  return (
    <RouteAccessGuard
      allowedGroups={['admin', 'super_user', 'user']}
      formTitle="Scrap Generation Report"
    >
      <ScrapGenerationReportClient />
    </RouteAccessGuard>
  );
}
