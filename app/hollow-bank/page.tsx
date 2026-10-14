'use client';

import HollowBankConsole from '@/components/hollow-bank/HollowBankConsole';
import RouteAccessGuard from '@/components/common/RouteAccessGuard';

export default function Page() {
  return (
    <RouteAccessGuard
      allowedGroups={['admin', 'super_user', 'user']}
      formTitle="Hollow Bank Inventory & Buffer Yard"
    >
      <HollowBankConsole />
    </RouteAccessGuard>
  );
}
