'use client';

import DiversionForm from '@/components/diversions/DiversionForm';
import DiversionWipBootstrap from '@/components/diversions/DiversionWipBootstrap';
import RouteAccessGuard from '@/components/common/RouteAccessGuard';

export default function Page() {
  return (
    <RouteAccessGuard allowedGroups={['admin', 'super_user']} formTitle="Diversion Planning Form">
      <DiversionWipBootstrap />
      <DiversionForm />
    </RouteAccessGuard>
  );
}
