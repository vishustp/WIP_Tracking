import { Suspense } from 'react';
import RollingPlanForm from '@/components/rolling-plans/RollingPlanForm';

export default function Page() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-slate-500">Loading rolling plans...</div>}>
      <RollingPlanForm />
    </Suspense>
  );
}
