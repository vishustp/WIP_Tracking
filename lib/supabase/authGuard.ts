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

    if (appUser) {
      const meta = user.user_metadata || {};
      appUser = {
        ...meta,
        ...appUser,
        allowed_stages: appUser.allowed_stages || meta.allowed_stages,
        user_group: appUser.user_group || meta.user_group,
        permissions: appUser.permissions || meta.permissions,
      };
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

/**
 * Validates whether the authenticated user has operational recording authority for the given stage code.
 * Strictly enforces:
 * - Admin and Super User global authorization
 * - Granular Admin custom permissions
 * - Joint Band Saw & Finishing mutual operational authority
 * - Joint Furnace (Hollow HT & Final HT) mutual operational authority
 * - Individual work center / allowed stages matching
 */
export function isAuthorizedForStation(auth: AuthContext | null | undefined, stageCode: string): boolean {
  if (!auth) return false;
  if (auth.isAdmin) return true;

  const appUser = auth.appUser;
  if (!appUser) {
    const meta = auth.user.user_metadata || {};
    return meta.role === 'admin' || meta.is_admin === true || meta.user_group === 'admin';
  }

  const role = String(appUser.role || '').toLowerCase();
  const group = String(appUser.user_group || appUser.group || '').toLowerCase();
  if (role === 'admin' || group === 'admin' || role === 'super_user' || group === 'super_user') {
    return true;
  }

  // Check granular permissions configured by Admin
  const customPerms = appUser.permissions;
  if (customPerms && typeof customPerms === 'object') {
    const STAGE_PERM_MAP: Record<string, string> = {
      HOT_ROLLING: 'production_hot_rolling',
      HTC: 'production_htc',
      ROLLING: 'production_rolling',
      HOLLOW_HEAT_TREATMENT: 'production_hollow_ht',
      DRAW: 'production_draw',
      PILGER: 'production_pilger',
      HEAT_TREATMENT: 'production_ht',
      BAND_SAW: 'production_band_saw',
      VDI: 'production_vdi',
      FINISHING: 'production_finishing',
    };
    const permKey = STAGE_PERM_MAP[stageCode];
    if (permKey && customPerms[permKey] === 'edit') return true;

    // Joint Band Saw & Finishing Line Rule
    if (
      (stageCode === 'BAND_SAW' || stageCode === 'FINISHING') &&
      (customPerms.production_band_saw === 'edit' || customPerms.production_finishing === 'edit')
    ) {
      return true;
    }

    // Joint Furnace Rule (Hollow HT & Final HT)
    if (
      (stageCode === 'HOLLOW_HEAT_TREATMENT' || stageCode === 'HEAT_TREATMENT') &&
      (customPerms.production_hollow_ht === 'edit' || customPerms.production_ht === 'edit')
    ) {
      return true;
    }
  }

  const userWc = String(appUser.work_center || '').toUpperCase();
  const userDef = String(appUser.default_stage || '').toUpperCase();
  const userAllowed: string[] = Array.isArray(appUser.allowed_stages)
    ? appUser.allowed_stages.map((s: string) => String(s).toUpperCase())
    : [];

  if (userWc === 'ALL' || userAllowed.includes('ALL')) {
    return true;
  }

  const target = stageCode.toUpperCase();
  if (userWc === target || userDef === target || userAllowed.includes(target)) {
    return true;
  }

  // Joint Furnace Rule (Hollow Heat Treatment & Final Heat Treatment)
  if (target === 'HOLLOW_HEAT_TREATMENT' || target === 'HEAT_TREATMENT') {
    if (
      userWc === 'HOLLOW_HEAT_TREATMENT' ||
      userWc === 'HEAT_TREATMENT' ||
      userDef === 'HOLLOW_HEAT_TREATMENT' ||
      userDef === 'HEAT_TREATMENT' ||
      userAllowed.includes('HOLLOW_HEAT_TREATMENT') ||
      userAllowed.includes('HEAT_TREATMENT')
    ) {
      return true;
    }
  }

  // Joint Band Saw & Finishing Line Rule
  if (target === 'BAND_SAW' || target === 'FINISHING') {
    if (
      userWc === 'BAND_SAW' ||
      userWc === 'FINISHING' ||
      userDef === 'BAND_SAW' ||
      userDef === 'FINISHING' ||
      userAllowed.includes('BAND_SAW') ||
      userAllowed.includes('FINISHING')
    ) {
      return true;
    }
  }

  return false;
}
