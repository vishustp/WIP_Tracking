import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAuth } from '@/lib/supabase/authGuard';

export async function POST(req: NextRequest) {
  return handleDelete(req);
}

export async function DELETE(req: NextRequest) {
  return handleDelete(req);
}

async function handleDelete(req: NextRequest) {
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

    let id: string | null = null;

    if (req.method === 'DELETE') {
      const url = new URL(req.url);
      id = url.searchParams.get('id');
    }

    if (!id) {
      try {
        const body = await req.json();
        id = body?.id || body?.p_production_id || null;
      } catch {}
    }

    if (!id) {
      return NextResponse.json({ error: 'Production entry ID is required.' }, { status: 400 });
    }

    // 1. Fetch target production log to check stage & existence
    const { data: targetLog, error: fetchErr } = await admin
      .from('production_logs')
      .select('id, work_order_id, stage_id, created_at, process_stages(stage_code)')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr) {
      return NextResponse.json({ error: `Failed to load log: ${fetchErr.message}` }, { status: 500 });
    }

    if (!targetLog) {
      return NextResponse.json({ error: 'Production entry not found or already deleted.' }, { status: 404 });
    }

    const stageCode = (targetLog.process_stages as any)?.stage_code || '';

    // 2. Permission check for non-admins / non-super-users
    if (!isAdmin && !isSuperUser) {
      const userWc = appUser?.work_center;
      const allowedStages: string[] = Array.isArray(appUser?.allowed_stages) ? appUser.allowed_stages : [];

      if (userWc && userWc !== 'ALL' && userWc !== stageCode && !allowedStages.includes(stageCode)) {
        return NextResponse.json(
          { error: `Access Denied: You are only authorized to delete data from your assigned work center (${userWc}).` },
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
          { error: 'Only the latest production entry for this Work Order can be deleted by regular operators. Contact an Administrator for override.' },
          { status: 400 }
        );
      }
    }

    // 3. Perform authoritative deletion using admin client
    const { data: deletedRows, error: delErr } = await admin
      .from('production_logs')
      .delete()
      .eq('id', id)
      .select('id');

    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }

    if (!deletedRows || deletedRows.length === 0) {
      return NextResponse.json({ error: 'Production entry could not be deleted (record not found).' }, { status: 404 });
    }

    // 4. If all production logs for this work order are now removed, revert work order status
    const targetWoId = targetLog.work_order_id;
    if (targetWoId) {
      const { data: remainingLogs } = await admin
        .from('production_logs')
        .select('id')
        .eq('work_order_id', targetWoId)
        .limit(1);

      if (!remainingLogs || remainingLogs.length === 0) {
        const { data: plans } = await admin
          .from('rolling_plans')
          .select('id')
          .eq('work_order_id', targetWoId)
          .limit(1);

        const newStatus = plans && plans.length > 0 ? 'Scheduled' : 'Pending Plan';
        await admin
          .from('work_orders')
          .update({ status: newStatus })
          .eq('id', targetWoId)
          .not('status', 'in', '("Completed","Diverted")');
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Production entry deleted successfully.',
    });
  } catch (err: any) {
    console.error('Error in /api/production/delete:', err);
    return NextResponse.json(
      { error: err?.message || 'Internal server error while deleting production entry.' },
      { status: 500 }
    );
  }
}
