import WorkOrderTrackingClient from '@/components/reports/WorkOrderTrackingClient';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Work Order Tracking Sheet | Seamless WIP Tracking',
  description: 'Live multi-station tracking sheet tracing work orders from Rolling Mill through Finishing Line with OD, Date, and WO filters.',
};

export default function WorkOrderTrackingPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <WorkOrderTrackingClient />
    </div>
  );
}
