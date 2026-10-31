import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sourceWoId = searchParams.get('source_wo_id');
    const targetWoId = searchParams.get('target_wo_id');
    const workCenter = searchParams.get('work_center');
    const status = searchParams.get('status');
    const limit = Number(searchParams.get('limit') || 500);

    const supabase = createAdminClient();
    if (!supabase) return NextResponse.json({ error: 'Database client unavailable' }, { status: 500 });

    let query = supabase
      .from('diversion_plans')
      .select(`
        *,
        source_wo:work_orders!source_wo_id(work_order_no, customer_name, grade, specification, size_od, size_wt),
        target_wo:work_orders!target_wo_id(work_order_no, customer_name, grade, specification, size_od, size_wt),
        process_routes(route_name, route_code)
      `)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (sourceWoId) query = query.eq('source_wo_id', sourceWoId);
    if (targetWoId) query = query.eq('target_wo_id', targetWoId);
    if (workCenter) query = query.eq('work_center', workCenter);
    if (status && status !== 'ALL') query = query.eq('status', status.toUpperCase());

    const { data, error } = await query;
    if (error) {
      console.error('[API /api/diversions] GET error:', error);
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
    const supabase = createAdminClient();
    if (!supabase) return NextResponse.json({ error: 'Database client unavailable' }, { status: 500 });

    // Handle batch insertion or single insertion
    const items = Array.isArray(body) ? body : [body];

    if (items.length === 0) {
      return NextResponse.json({ error: 'No diversion payload provided' }, { status: 400 });
    }

    const insertedRows = [];

    for (const item of items) {
      const {
        source_wo_id,
        target_wo_id,
        diverted_qty,
        work_center,
        process_route_id,
        multiple = 1,
        reason,
        approved_by,
        diversion_date,
        status = 'APPROVED',
        ppc_approved_by,
        ppc_approved_at,
      } = item;

      if (!source_wo_id || !target_wo_id) {
        return NextResponse.json({ error: 'Source and Target Work Orders are required.' }, { status: 400 });
      }

      if (source_wo_id === target_wo_id) {
        return NextResponse.json({ error: 'Source and target work order cannot be the same.' }, { status: 400 });
      }

      if (!diverted_qty || Number(diverted_qty) <= 0) {
        return NextResponse.json({ error: 'Diverted quantity must be greater than zero.' }, { status: 400 });
      }

      // Check if approved_by is a valid UUID, otherwise null
      const isValidUuid = (val: any) => typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
      const safeApprovedBy = isValidUuid(approved_by) ? approved_by : null;
      const safePpcApprovedBy = isValidUuid(ppc_approved_by) ? ppc_approved_by : safeApprovedBy;

      const insertPayload: any = {
        source_wo_id,
        target_wo_id,
        diverted_qty: Number(diverted_qty),
        work_center: work_center || 'ROLLING',
        process_route_id,
        multiple: Number(multiple) || 1,
        reason: (reason || '').trim(),
        approved_by: safeApprovedBy,
        diversion_date: diversion_date || new Date().toISOString().slice(0, 10),
        status: status || 'APPROVED',
      };

      if (status === 'APPROVED') {
        insertPayload.ppc_approved_by = safePpcApprovedBy;
        insertPayload.ppc_approved_at = ppc_approved_at || new Date().toISOString();
      }

      const { data, error } = await supabase
        .from('diversion_plans')
        .insert(insertPayload)
        .select()
        .single();

      if (error) {
        console.error('[API /api/diversions] POST insert error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      insertedRows.push(data);
    }

    return NextResponse.json({
      success: true,
      data: Array.isArray(body) ? insertedRows : insertedRows[0],
    });
  } catch (err: any) {
    console.error('[API /api/diversions] Unexpected error:', err);
    return NextResponse.json({ error: err.message || 'Failed to create diversion' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, action, reason, remarks, user_id } = body;

    if (!id) return NextResponse.json({ error: 'Diversion ID is required' }, { status: 400 });

    const supabase = createAdminClient();
    if (!supabase) return NextResponse.json({ error: 'Database client unavailable' }, { status: 500 });

    const isValidUuid = (val: any) => typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
    const safeUserId = isValidUuid(user_id) ? user_id : null;

    if (action === 'APPROVE') {
      const { data, error } = await supabase
        .from('diversion_plans')
        .update({
          status: 'APPROVED',
          ppc_approved_by: safeUserId,
          ppc_approved_at: new Date().toISOString(),
          ppc_remarks: (remarks || '').trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, data });
    }

    if (action === 'REJECT') {
      if (!reason || !reason.trim()) {
        return NextResponse.json({ error: 'Rejection reason is required' }, { status: 400 });
      }

      const { data, error } = await supabase
        .from('diversion_plans')
        .update({
          status: 'REJECTED_BY_PPC',
          ppc_rejection_reason: reason.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, data });
    }

    if (action === 'CANCEL') {
      const { data, error } = await supabase
        .from('diversion_plans')
        .update({
          status: 'CANCELLED',
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, data });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
