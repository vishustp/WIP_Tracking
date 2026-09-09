// app/qc/vdi/page.tsx
import { Suspense } from 'react';
import RouteAccessGuard from '@/components/common/RouteAccessGuard';
import QcInspectionClient from '@/components/qc/QcInspectionClient';

export const metadata = {
  title: 'QC / VDI Inspection | WIP Tracking System',
  description: 'Quality Control Visual Dimension Inspection form gating Heat Treatment output before Finishing Line.',
};

export default function QcVdiPage() {
  return (
    <RouteAccessGuard allowedGroups={['admin', 'super_user', 'user']} formTitle="Visual & Dimensional (VDI) Inspection">
      <Suspense fallback={<div className="p-8 text-center text-xs text-slate-500">Loading QC & VDI Inspection Module...</div>}>
        <QcInspectionClient />
      </Suspense>
    </RouteAccessGuard>
  );
}
