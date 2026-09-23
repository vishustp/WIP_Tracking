import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAuth } from '@/lib/supabase/authGuard';

export async function POST(req: NextRequest) {
  try {
    const authCheck = await requireAuth(req);
    if ('errorResponse' in authCheck && authCheck.errorResponse) {
      return authCheck.errorResponse;
    }

    const { isAdmin, appUser } = authCheck.auth;
    const isSuperUser =
      String(appUser?.user_group || '').toLowerCase() === 'super_user' ||
      String(appUser?.role || '').toLowerCase() === 'super_user' ||
      String(appUser?.role || '').toLowerCase() === 'manager';

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json({ error: 'Database service is temporarily unavailable.' }, { status: 500 });
    }

    const body = await req.json();
    const {
      id,
      process_date,
      output_qty,
      output_pcs,
      rejection_qty,
      rejection_pcs,
      htc_ok,
      heat_lot_no,
      remarks,
    } = body;

    if (!id) {
      return NextResponse.json({ error: 'Production entry ID is required.' }, { status: 400 });
    }

    // 1. Fetch target log
    const { data: targetLog, error: fetchErr } = await admin
      .from('production_logs')
      .select('*, process_stages(stage_code)')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr) {
      return NextResponse.json({ error: `Failed to load entry: ${fetchErr.message}` }, { status: 500 });
    }

    if (!targetLog) {
      return NextResponse.json({ error: 'Production entry not found.' }, { status: 404 });
    }

    const stageCode = (targetLog.process_stages as any)?.stage_code || '';

    // 2. Permission check for non-admins / non-super-users
    if (!isAdmin && !isSuperUser) {
      const userWc = appUser?.work_center;
      const allowedStages: string[] = Array.isArray(appUser?.allowed_stages) ? appUser.allowed_stages : [];

      if (userWc && userWc !== 'ALL' && userWc !== stageCode && !allowedStages.includes(stageCode)) {
        return NextResponse.json(
          { error: `Access Denied: You are only authorized to edit data from your assigned work center (${userWc}).` },
          { status: 403 }
        );
      }

      // Check if downstream or later production exists for this work order
      const { data: laterLogs } = await admin
        .from('production_logs')
        .select('id')
        .eq('work_order_id', targetLog.work_order_id)
        .gt('created_at', targetLog.created_at)
        .limit(1);

      if (laterLogs && laterLogs.length > 0) {
        return NextResponse.json(
          { error: 'Only the latest production entry for this Work Order can be edited by regular operators. Contact an Administrator for override.' },
          { status: 400 }
        );
      }
    }

    // 3. Prepare updated fields
    const updatePayload: Record<string, any> = {
      process_date: process_date || targetLog.process_date,
      output_qty: output_qty !== undefined ? Number(output_qty) : targetLog.output_qty,
      input_qty: output_qty !== undefined ? Number(output_qty) : targetLog.input_qty,
      rejection_qty: rejection_qty !== undefined ? Number(rejection_qty) : targetLog.rejection_qty,
      heat_lot_no: heat_lot_no !== undefined ? (heat_lot_no?.trim() || null) : targetLog.heat_lot_no,
      remarks: remarks !== undefined ? (remarks?.trim() || null) : targetLog.remarks,
    };

    if (output_pcs !== undefined) {
      updatePayload.output_pcs = output_pcs ? Number(output_pcs) : null;
    }
    if (rejection_pcs !== undefined) {
      updatePayload.rejection_pcs = rejection_pcs ? Number(rejection_pcs) : null;
    }
    if (stageCode === 'ROLLING' && htc_ok !== undefined) {
      updatePayload.htc_ok = Number(htc_ok || 0);
    }

    const { data: updated, error: updateErr } = await admin
      .from('production_logs')
      .update(updatePayload)
      .eq('id', id)
      .select('id')
      .maybeSingle();

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Production entry updated successfully.',
      data: updated,
    });
  } catch (err: any) {
    console.error('Error in /api/production/update:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to update production entry.' },
      { status: 500 }
    );
  }
}
