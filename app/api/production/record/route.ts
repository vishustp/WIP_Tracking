import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: NextRequest) {
  try {
    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json({ error: 'Database service is temporarily unavailable.' }, { status: 500 });
    }
    const body = await req.json();
    const { entries = [], p_process_date } = body;

    if (!Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json({ error: 'No production entries provided.' }, { status: 400 });
    }

    const processDate = p_process_date || new Date().toISOString().slice(0, 10);

    // Get all stages to resolve stage_id for each entry
    const { data: stages, error: stagesErr } = await admin
      .from('process_stages')
      .select('id, stage_code');

    if (stagesErr || !stages) {
      return NextResponse.json({ error: 'Failed to load process stages.' }, { status: 500 });
    }

    const stageMap = new Map<string, string>();
    stages.forEach((s) => stageMap.set(s.stage_code, s.id));

    // Try using record_production_batch first for standard execution
    const { error: rpcError } = await admin.rpc('record_production_batch', {
      entries,
      p_process_date: processDate,
    });

    if (!rpcError) {
      return NextResponse.json({ success: true, count: entries.length, method: 'rpc' });
    }

    console.warn('record_production_batch returned error, attempting safe fallback insertion:', rpcError.message);

    // Fallback: Process entries individually via admin client (essential for Child WO bundling at Finishing)
    let savedCount = 0;
    const errors: string[] = [];

    for (const item of entries) {
      const stageId = stageMap.get(item.stage_code);
      if (!stageId) {
        errors.push(`Unknown stage code: ${item.stage_code}`);
        continue;
      }

      const inputMtr = Number(item.input_qty || 0);
      const outputMtr = Number(item.output_qty || inputMtr);
      const rejMtr = Number(item.rejection_qty || 0);
      const htcOkMtr = Number(item.htc_ok || 0);

      const { data: inserted, error: insertErr } = await admin
        .from('production_logs')
        .insert({
          work_order_id: item.work_order_id,
          stage_id: stageId,
          process_route_id: item.route_id,
          process_date: processDate,
          input_qty: inputMtr,
          output_qty: outputMtr,
          rejection_qty: rejMtr,
          htc_ok: htcOkMtr,
          heat_lot_no: item.heat_lot_no || null,
          remarks: item.remarks || null,
        })
        .select()
        .single();

      if (insertErr) {
        errors.push(`Error for WO ${item.work_order_id}: ${insertErr.message}`);
      } else {
        savedCount++;

        // Update work order status
        if (item.stage_code === 'FINISHING') {
          // Check total finishing output vs order balance
          const { data: finishingLogs } = await admin
            .from('production_logs')
            .select('output_qty')
            .eq('work_order_id', item.work_order_id)
            .eq('stage_id', stageId);

          const totalFinished = (finishingLogs ?? []).reduce(
            (sum, l) => sum + Number(l.output_qty || 0),
            0
          );

          const { data: woData } = await admin
            .from('work_orders')
            .select('balance_qty_mtr')
            .eq('id', item.work_order_id)
            .single();

          const targetMtr = Number(woData?.balance_qty_mtr || 0);
          const newStatus = targetMtr > 0 && totalFinished >= targetMtr ? 'Completed' : 'In Progress';

          await admin
            .from('work_orders')
            .update({ status: newStatus })
            .eq('id', item.work_order_id);
        } else {
          await admin
            .from('work_orders')
            .update({ status: 'In Progress' })
            .eq('id', item.work_order_id)
            .in('status', ['Pending Plan', 'Scheduled']);
        }
      }
    }

    if (savedCount === 0 && errors.length > 0) {
      return NextResponse.json({ error: errors.join('; ') }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      count: savedCount,
      warnings: errors.length > 0 ? errors : undefined,
      method: 'admin_direct',
    });
  } catch (error: any) {
    console.error('Production record API error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to record production entries.' },
      { status: 500 }
    );
  }
}
