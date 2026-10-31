import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { calculatePipeWeightMt } from '@/lib/productionUtils';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const workOrderId = searchParams.get('work_order_id');
    const stageCode = searchParams.get('stage_code');
    const status = searchParams.get('status');

    const supabase = createAdminClient();
    if (!supabase) return NextResponse.json({ error: 'Database client unavailable' }, { status: 500 });
    let query = supabase
      .from('ppc_stock_generations')
      .select('*, work_orders(work_order_no, customer_name, size_od, size_wt, grade), process_stages(stage_name)')
      .order('created_at', { ascending: false });

    if (workOrderId) query = query.eq('work_order_id', workOrderId);
    if (stageCode) query = query.eq('stage_code', stageCode.toUpperCase());
    if (status && status !== 'ALL') query = query.eq('status', status.toUpperCase());

    const { data, error } = await query;
    if (error) {
      console.error('[API /api/stock-generation] GET error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ data: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      work_order_id,
      stage_id,
      stage_code,
      stock_type,
      pcs,
      meters,
      weight_mt,
      reason,
      heat_no,
      lot_no,
      remarks,
      user_id,
      user_name,
    } = body;

    if (!work_order_id || !stage_id || !stage_code || !stock_type || !pcs || !meters || !reason) {
      return NextResponse.json({ error: 'Missing required fields for stock generation.' }, { status: 400 });
    }

    if (Number(pcs) <= 0 || Number(meters) <= 0) {
      return NextResponse.json({ error: 'Pieces and meters must be greater than zero.' }, { status: 400 });
    }

    if (!['INCOMING_QUEUE', 'STAGE_OUTPUT'].includes(stock_type)) {
      return NextResponse.json({ error: 'Invalid stock_type. Must be INCOMING_QUEUE or STAGE_OUTPUT.' }, { status: 400 });
    }

    const supabase = createAdminClient();
    if (!supabase) return NextResponse.json({ error: 'Database client unavailable' }, { status: 500 });

    // Verify work order and dimensions
    const { data: wo, error: woErr } = await supabase
      .from('work_orders')
      .select('id, size_od, size_wt')
      .eq('id', work_order_id)
      .single();

    if (woErr || !wo) {
      return NextResponse.json({ error: 'Work order not found.' }, { status: 404 });
    }

    // Auto calculate MT if not provided or 0
    let finalMt = Number(weight_mt);
    if (!finalMt || finalMt <= 0) {
      finalMt = calculatePipeWeightMt(Number(wo.size_od), Number(wo.size_wt), Number(meters));
    }

    const { data: inserted, error: insErr } = await supabase
      .from('ppc_stock_generations')
      .insert({
        work_order_id,
        stage_id,
        stage_code: stage_code.toUpperCase(),
        stock_type,
        pcs: Number(pcs),
        meters: Number(Number(meters).toFixed(2)),
        weight_mt: Number(finalMt.toFixed(3)),
        reason: reason.trim(),
        heat_no: heat_no?.trim() || null,
        lot_no: lot_no?.trim() || null,
        remarks: remarks?.trim() || null,
        created_by: user_id || null,
        created_by_name: user_name || 'PPC Planner',
        status: 'ACTIVE',
      })
      .select('*, work_orders(work_order_no, customer_name), process_stages(stage_name)')
      .single();

    if (insErr) {
      console.error('[API /api/stock-generation] POST insert error:', insErr);
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: inserted });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
