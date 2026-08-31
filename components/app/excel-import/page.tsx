'use client';

import ExcelImporter from '@/components/excel/ExcelImporter';
import RouteAccessGuard from '@/components/common/RouteAccessGuard';

export default function ExcelImportPage() {
  return (
    <RouteAccessGuard allowedGroups={['admin', 'super_user']} formTitle="Excel Import Form">
      <ExcelImporter />
    </RouteAccessGuard>
  );
}
