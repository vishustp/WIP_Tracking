import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

    const admin = createAdminClient();

    // Verify user authentication
    const response = NextResponse.next({ request });
    const cookieClient = createServerClient(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies) => cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
      },
    });

    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined;

    let user: any = null;
    let authedClient = cookieClient;

    if (bearerToken) {
      const tokenClient = createSupabaseClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${bearerToken}` } },
      });
      const { data, error } = await tokenClient.auth.getUser(bearerToken);
      if (!error && data?.user) {
        user = data.user;
        authedClient = tokenClient as any;
      } else if (admin) {
        const { data: adminAuth, error: adminErr } = await admin.auth.getUser(bearerToken);
        if (!adminErr && adminAuth?.user) {
          user = adminAuth.user;
        }
      }
    }

    if (!user) {
      const { data, error } = await cookieClient.auth.getUser();
      if (!error && data?.user) {
        user = data.user;
      }
    }

    // Check admin authority
    const queryClient = admin || authedClient;
    let isAdmin = false;

    if (user) {
      // Check app_users
      const { data: appUser } = await queryClient
        .from('app_users')
        .select('*')
        .or(`auth_user_id.eq.${user.id},email.eq.${(user.email || '').toLowerCase()}`)
        .maybeSingle();

      const appRole = String(appUser?.role || '').toLowerCase();
      const appGroup = String(appUser?.user_group || '').toLowerCase();
      if (appUser && appUser.active !== false && (appRole === 'admin' || appGroup === 'admin')) {
        isAdmin = true;
      }

      // Check profiles
      if (!isAdmin) {
        const { data: profile } = await queryClient
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();
        if (profile && String(profile.role || '').toLowerCase() === 'admin') {
          isAdmin = true;
        }
      }

      // Check metadata
      if (!isAdmin) {
        isAdmin =
          String(user.app_metadata?.role || '').toLowerCase() === 'admin' ||
          String(user.user_metadata?.role || '').toLowerCase() === 'admin' ||
          String(user.user_metadata?.user_group || '').toLowerCase() === 'admin' ||
          user.user_metadata?.is_admin === true;
      }
    }

    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Permission denied: Only Administrators can perform a factory reset.' },
        { status: 403 }
      );
    }

    // Execute table resets using service role admin client if available, or authed client
    const targetClient = admin || authedClient;
    const tables = ['diversion_plans', 'production_logs', 'rolling_plans', 'work_order_wip', 'work_orders'];
    const cleared: string[] = [];

    for (const table of tables) {
      try {
        const { error } = await targetClient.from(table).delete().not('id', 'is', null);
        if (error) {
          // If work_order_wip fails due to RLS, it will be cleaned up by work_orders cascade delete
          if (table === 'work_order_wip') {
            console.warn('work_order_wip delete skipped/deferred to work_orders cascade:', error.message);
          } else {
            throw error;
          }
        } else {
          cleared.push(table);
        }
      } catch (err: any) {
        if (table !== 'work_order_wip') {
          throw new Error(`Failed to reset ${table}: ${err.message || err}`);
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Factory database reset successfully. Transactional records cleared.',
      cleared,
    });
  } catch (error: any) {
    console.error('Factory reset error:', error);
    return NextResponse.json(
      { error: error?.message || 'Factory reset failed.' },
      { status: 500 }
    );
  }
}
