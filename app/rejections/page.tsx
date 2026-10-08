// app/rejections/page.tsx
'use client';

import RouteAccessGuard from '@/components/common/RouteAccessGuard';
import RejectionsBoardClient from '@/components/rejections/RejectionsBoardClient';

export default function RejectionsPage() {
  return (
    <RouteAccessGuard
      allowedGroups={['admin', 'super_user', 'user']}
      formTitle="Rejection & Salvage Console"
    >
      <RejectionsBoardClient />
    </RouteAccessGuard>
  );
}
