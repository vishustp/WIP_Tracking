import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(req: NextRequest) {
  try {
    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json({ error: 'Database service is temporarily unavailable.' }, { status: 500 });
    }

    const { searchParams } = new URL(req.url);
    const stageCode = searchParams.get('stage') || null;
    const routeCode = searchParams.get('route') || null;
    const search = searchParams.get('search') || null;
    const fromDate = searchParams.get('from') || null;
    const toDate = searchParams.get('to') || null;
    const limit = Number(searchParams.get('limit')) || 500;

    // 1. Fetch entries via RPC
    const { data: entries, error: rpcErr } = await admin.rpc('get_production_entries', {
      p_search: search,
      p_stage_code: stageCode,
      p_route_code: routeCode,
      p_from_date: fromDate,
      p_to_date: toDate,
      p_limit: limit,
      p_offset: 0,
    });

    if (rpcErr) {
      console.error('Error in get_production_entries RPC:', rpcErr);
      return NextResponse.json({ error: rpcErr.message }, { status: 500 });
    }

    // 2. Fetch created_by from production_logs and operators from app_users
    const [{ data: logs }, { data: appUsers }] = await Promise.all([
      admin.from('production_logs').select('id, created_by, created_at'),
      admin.from('app_users').select('id, auth_user_id, employee_name, email'),
    ]);

    const userMap = new Map<string, string>();
    (appUsers || []).forEach((u: any) => {
      const displayName = u.employee_name || u.email?.split('@')[0] || 'Operator';
      if (u.auth_user_id) userMap.set(u.auth_user_id, displayName);
      if (u.id) userMap.set(u.id, displayName);
      if (u.email) userMap.set(u.email.toLowerCase(), displayName);
    });

    const logMap = new Map<string, any>();
    (logs || []).forEach((l: any) => logMap.set(l.id, l));

    const enriched = (entries || []).map((e: any) => {
      const l = logMap.get(e.id);
      const opName = l?.created_by ? userMap.get(l.created_by) : null;
      return {
        ...e,
        created_by: l?.created_by,
        operator_name: opName,
      };
    });

    return NextResponse.json({
      success: true,
      data: enriched,
    });
  } catch (err: any) {
    console.error('Error in /api/production/history:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to fetch production history.' },
      { status: 500 }
    );
  }
}
