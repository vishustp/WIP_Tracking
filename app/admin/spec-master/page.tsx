'use client';

import SpecMasterAdminClient from '@/components/admin/SpecMasterAdminClient';
import RouteAccessGuard from '@/components/common/RouteAccessGuard';

export default function SpecMasterPage() {
  return (
    <RouteAccessGuard allowedGroups={['admin', 'super_user']} formTitle="Material Spec Master">
      <SpecMasterAdminClient />
    </RouteAccessGuard>
  );
}
