import { createAdminClient } from '@/lib/supabase/admin';
import StockGenerationReportClient from '@/components/reports/StockGenerationReportClient';

export const dynamic = 'force-dynamic';

export default async function StockGenerationReportPage() {
  const supabase = createAdminClient();
  if (!supabase) throw new Error('Database client unavailable');

  const [recordsRes, woRes, stagesRes] = await Promise.all([
    supabase
      .from('ppc_stock_generations')
      .select('*, work_orders(work_order_no, customer_name, size_od, size_wt, grade), process_stages(stage_name, stage_code)')
      .order('created_at', { ascending: false }),
    supabase.from('work_orders').select('id, work_order_no, customer_name').order('work_order_no', { ascending: true }),
    supabase.from('process_stages').select('id, stage_code, stage_name').order('id', { ascending: true }),
  ]);

  return (
    <StockGenerationReportClient
      initialRecords={recordsRes.data || []}
      workOrders={woRes.data || []}
      processStages={stagesRes.data || []}
    />
  );
}
