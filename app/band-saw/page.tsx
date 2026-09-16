// app/band-saw/page.tsx
import { Suspense } from 'react';
import RouteAccessGuard from '@/components/common/RouteAccessGuard';
import BandSawCuttingClient from '@/components/bandsaw/BandSawCuttingClient';

export const metadata = {
  title: 'Band Saw Pipe Cutting & Multi-Length Station | WIP Tracking',
  description: 'Precision pipe cutting and multi-length management station feeding Total Cut Nos into VDI QC inspection.',
};

export default function BandSawPage() {
  return (
    <RouteAccessGuard allowedGroups={['admin', 'super_user', 'user']} formTitle="Band Saw Pipe Cutting Station">
      <Suspense fallback={<div className="p-8 text-center text-xs text-slate-500">Loading Band Saw Cutting Station...</div>}>
        <BandSawCuttingClient />
      </Suspense>
    </RouteAccessGuard>
  );
}
