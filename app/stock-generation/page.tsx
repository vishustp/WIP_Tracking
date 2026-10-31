import { createAdminClient } from '@/lib/supabase/admin';
import StockGenerationFormClient from '@/components/stock-generation/StockGenerationFormClient';

export const dynamic = 'force-dynamic';

export default async function StockGenerationPage() {
  const supabase = createAdminClient();
  if (!supabase) throw new Error('Database client unavailable');

  const [woRes, stagesRes, routeStagesRes] = await Promise.all([
    supabase
      .from('work_orders')
      .select('id, work_order_no, customer_name, size_od, size_wt, grade, ordered_qty_mt, ordered_qty_mtr, route_id, status, l1, l2')
      .neq('status', 'CLOSED')
      .order('work_order_no', { ascending: true }),
    supabase.from('process_stages').select('id, stage_code, stage_name').order('id', { ascending: true }),
    supabase.from('route_stages').select('route_id, stage_id, sequence_no').order('sequence_no', { ascending: true }),
  ]);

  return (
    <StockGenerationFormClient
      workOrders={woRes.data || []}
      processStages={stagesRes.data || []}
      routeStages={routeStagesRes.data || []}
    />
  );
}
