// app/order-priority/page.tsx
import { Suspense } from 'react';
import RouteAccessGuard from '@/components/common/RouteAccessGuard';
import OrderPrioritySheetClient from '@/components/planning/OrderPrioritySheetClient';

export const metadata = {
  title: 'Set Priority Order Sheet | WIP Tracking System',
  description: 'Production Planning & Control (PPC) work order priority sequencing and daily plant meeting dispatch schedule.',
};

export default function OrderPriorityPage() {
  return (
    <RouteAccessGuard allowedGroups={['admin', 'super_user', 'user']} formTitle="Set Priority Order Sheet">
      <Suspense fallback={<div className="p-8 text-center text-xs text-slate-500">Loading Order Priority Sheet...</div>}>
        <OrderPrioritySheetClient />
      </Suspense>
    </RouteAccessGuard>
  );
}
