import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseClient, User } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';

export interface AuthContext {
  user: User;
  isAdmin: boolean;
  appUser?: any;
}

export async function getAuthenticatedUser(request: NextRequest): Promise<AuthContext | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

  if (!url || !key || !url.startsWith('http')) {
    return null;
  }

  const admin = createAdminClient();
  let user: User | null = null;

  // 1. Check Authorization header (Bearer token)
  const authHeader = request.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined;

  if (bearerToken) {
    const tokenClient = createSupabaseClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${bearerToken}` } },
    });
    const { data, error } = await tokenClient.auth.getUser(bearerToken);
    if (!error && data?.user) {
      user = data.user;
    } else if (admin) {
      const { data: adminAuth, error: adminErr } = await admin.auth.getUser(bearerToken);
      if (!adminErr && adminAuth?.user) {
        user = adminAuth.user;
      }
    }
  }

  // 2. Check session cookies if bearer token is not present or failed
  if (!user) {
    const response = NextResponse.next({ request });
    const cookieClient = createServerClient(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies) => cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
      },
    });

    const { data, error } = await cookieClient.auth.getUser();
    if (!error && data?.user) {
      user = data.user;
    }
  }

  if (!user) {
    return null;
  }

  // 3. Resolve Admin Authority from database or metadata
  let isAdmin = false;
  let appUser: any = null;
  const queryClient = admin || createSupabaseClient(url, key);

  try {
    const { data: foundAppUser } = await queryClient
      .from('app_users')
      .select('*')
      .or(`auth_user_id.eq.${user.id},email.eq.${(user.email || '').toLowerCase()}`)
      .maybeSingle();

    if (foundAppUser) {
      appUser = foundAppUser;
      const appRole = String(foundAppUser.role || '').toLowerCase();
      const appGroup = String(foundAppUser.user_group || '').toLowerCase();
      if (foundAppUser.active !== false && (appRole === 'admin' || appGroup === 'admin')) {
        isAdmin = true;
      }
    }

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

    if (!isAdmin) {
      isAdmin =
        String(user.app_metadata?.role || '').toLowerCase() === 'admin' ||
        String(user.user_metadata?.role || '').toLowerCase() === 'admin' ||
        String(user.user_metadata?.user_group || '').toLowerCase() === 'admin' ||
        user.user_metadata?.is_admin === true;
    }
  } catch (err) {
    console.error('Error resolving user admin status:', err);
  }

  return { user, isAdmin, appUser };
}

export async function requireAuth(request: NextRequest): Promise<{ auth: AuthContext; errorResponse?: never } | { auth?: never; errorResponse: NextResponse }> {
  const auth = await getAuthenticatedUser(request);
  if (!auth) {
    return {
      errorResponse: NextResponse.json(
        { error: 'Unauthorized: You must be logged in to perform this action.' },
        { status: 401 }
      ),
    };
  }
  return { auth };
}

export async function requireAdmin(request: NextRequest): Promise<{ auth: AuthContext; errorResponse?: never } | { auth?: never; errorResponse: NextResponse }> {
  const auth = await getAuthenticatedUser(request);
  if (!auth) {
    return {
      errorResponse: NextResponse.json(
        { error: 'Unauthorized: You must be logged in to perform this action.' },
        { status: 401 }
      ),
    };
  }
  if (!auth.isAdmin) {
    return {
      errorResponse: NextResponse.json(
        { error: 'Forbidden: Administrator privileges are required.' },
        { status: 403 }
      ),
    };
  }
  return { auth };
}
