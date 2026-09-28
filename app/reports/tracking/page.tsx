import { Suspense } from 'react';
import WorkOrderTrackingClient from '@/components/reports/WorkOrderTrackingClient';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Work Order Tracking Sheet | RASHMI GREEN HYDROGEN STEEL PVT. LTD.',
  description: 'Live multi-station tracking sheet tracing work orders from Rolling Mill through Finishing Line with OD, Date, and WO filters.',
};

export default function WorkOrderTrackingPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <Suspense fallback={<div className="p-8 text-center text-xs text-slate-500 font-mono">Loading tracking sheet...</div>}>
        <WorkOrderTrackingClient />
      </Suspense>
    </div>
  );
}
