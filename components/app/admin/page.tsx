'use client';

import AdminControlPanelClient from '@/components/admin/AdminControlPanelClient';
import RouteAccessGuard from '@/components/common/RouteAccessGuard';

export default function AdminPage() {
  return (
    <RouteAccessGuard allowedGroups={['admin']} formTitle="Admin Control Panel">
      <AdminControlPanelClient />
    </RouteAccessGuard>
  );
}
