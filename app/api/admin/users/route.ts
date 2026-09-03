import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';

interface AdminAuthResult {
  admin: ReturnType<typeof createAdminClient> | null;
  client: any;
  user: { id: string; email?: string };
}

async function getAuthenticatedAdmin(request: NextRequest): Promise<AdminAuthResult | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

  if (!url || !key || !url.startsWith('http')) {
    return null;
  }

  try {
    const response = NextResponse.next({ request });
    const cookieClient = createServerClient(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies) => cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
      },
    });

    // Check authorization header first, then session cookies
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
      }
    }

    if (!user) {
      const { data, error } = await cookieClient.auth.getUser();
      if (!error && data?.user) {
        user = data.user;
      }
    }

    if (!user) {
      return null;
    }

    const admin = createAdminClient();
    const queryClient = admin || authedClient;

    // Check app_users table (using select('*') to be resilient against missing custom columns)
    let appUser: any = null;
    const { data: byAuthId } = await queryClient
      .from('app_users')
      .select('*')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (byAuthId) {
      appUser = byAuthId;
    } else if (user.email) {
      const { data: byEmail } = await queryClient
        .from('app_users')
        .select('*')
        .eq('email', user.email.toLowerCase())
        .maybeSingle();
      if (byEmail) {
        appUser = byEmail;
        if (admin && byEmail.auth_user_id !== user.id) {
          await admin.from('app_users').update({ auth_user_id: user.id }).eq('id', byEmail.id);
        }
      }
    }

    const appUserRole = String(appUser?.role || '').toLowerCase();
    const appUserGroup = String(appUser?.user_group || '').toLowerCase();
    const isAppUserAdmin =
      appUser &&
      appUser.active !== false &&
      (appUserRole === 'admin' || appUserGroup === 'admin');

    // Check profiles table
    let isProfileAdmin = false;
    const { data: profile } = await queryClient
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (profile && String(profile.role || '').toLowerCase() === 'admin') {
      isProfileAdmin = true;
    }

    // Check auth metadata
    const isMetaAdmin =
      String(user.app_metadata?.role || '').toLowerCase() === 'admin' ||
      String(user.user_metadata?.role || '').toLowerCase() === 'admin' ||
      String(user.user_metadata?.user_group || '').toLowerCase() === 'admin' ||
      user.user_metadata?.is_admin === true;

    if (!isAppUserAdmin && !isProfileAdmin && !isMetaAdmin) {
      return null;
    }

    // Ensure profiles table has admin record synced for Postgres RLS policies
    if (admin) {
      try {
        await admin.from('profiles').upsert({
          id: user.id,
          role: 'Admin',
          full_name: appUser?.employee_name || user.user_metadata?.full_name || user.email || 'Admin',
        });
      } catch {
        // Silently continue if profiles table is unavailable
      }
    }

    return { admin, client: authedClient, user };
  } catch (err) {
    console.error('getAuthenticatedAdmin error:', err);
    return null;
  }
}

function bad(error: unknown, status = 400) {
  return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status });
}

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
  }

  const { admin, client } = auth;
  const queryClient = admin || client;

  try {
    const { data, error } = await queryClient
      .from('app_users')
      .select('*')
      .order('employee_name', { ascending: true });
    if (!error && data) {
      return NextResponse.json({ users: data });
    }
    return bad(error || 'Failed to fetch users', 500);
  } catch (e) {
    return bad(e, 500);
  }
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
  }

  const { admin } = auth;
  if (!admin) {
    return bad('SUPABASE_SERVICE_ROLE_KEY is required to create new Supabase Auth accounts.', 500);
  }

  try {
    const body = await request.json();

    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    const name = String(body.employee_name ?? '').trim();
    const employeeCode = String(body.employee_code ?? '').trim();
    const rawRole = String(body.role ?? 'Viewer');
    // Normalize role to the database app_role enum
    const role: 'Admin' | 'PPC' | 'Production' | 'QA' | 'Viewer' =
      rawRole.toLowerCase() === 'admin' ? 'Admin' :
      rawRole.toLowerCase() === 'ppc' || rawRole.toLowerCase() === 'manager' ? 'PPC' :
      rawRole.toLowerCase() === 'qa' || rawRole.toLowerCase() === 'qa_inspector' ? 'QA' :
      rawRole.toLowerCase() === 'viewer' || rawRole.toLowerCase() === 'auditor' ? 'Viewer' :
      'Production';

    const workCenter = String(body.work_center ?? 'ALL');
    const userGroup = String(body.user_group ?? (
      role === 'Admin' ? 'admin' : role === 'PPC' ? 'super_user' : 'user'
    ));
    const roleTitle = String(body.role_title ?? (
      role === 'Admin' ? 'PPC Administrator' :
      role === 'PPC' ? 'Plant Operations Head' :
      role === 'QA' ? 'Quality & NDT Inspector' :
      role === 'Viewer' ? 'Viewer' : 'Production Operator'
    ));
    const allowedStages = Array.isArray(body.allowed_stages)
      ? body.allowed_stages
      : workCenter === 'ALL'
        ? ['ROLLING', 'HOLLOW_HEAT_TREATMENT', 'DRAW', 'HEAT_TREATMENT', 'FINISHING']
        : workCenter === 'QA'
          ? ['ROLLING', 'HOLLOW_HEAT_TREATMENT', 'DRAW', 'HEAT_TREATMENT', 'FINISHING']
          : [workCenter];
    const defaultStage = String(body.default_stage ?? (workCenter === 'ALL' ? 'ROLLING' : workCenter));
    const shift = String(body.shift ?? '');
    const department = String(body.department ?? '').trim() || null;
    const phone = String(body.phone ?? '').trim() || null;

    if (!email || !name || !employeeCode) return bad('Name, email and employee code are required');
    if (!password || password.length < 8) return bad('Password must be at least 8 characters');

    // Check if user already exists in auth
    const { data: created, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: name,
        employee_code: employeeCode,
        role,
        user_group: userGroup,
        role_title: roleTitle,
        work_center: workCenter,
        department,
        shift,
        allowed_stages: allowedStages,
        default_stage: defaultStage,
        phone,
      },
    });

    let authUserId: string;
    if (authError || !created?.user) {
      // If user already exists in Auth, check if they can be linked
      const errorMsg = authError?.message || '';
      if (errorMsg.toLowerCase().includes('already') || errorMsg.toLowerCase().includes('registered')) {
        const { data: listData } = await admin.auth.admin.listUsers();
        const existingAuth = listData?.users?.find(u => u.email?.toLowerCase() === email);
        if (existingAuth) {
          authUserId = existingAuth.id;
          // Update their password and metadata
          await admin.auth.admin.updateUserById(authUserId, {
            password,
            user_metadata: { full_name: name, role, user_group: userGroup },
          }).catch(() => {});
        } else {
          return bad(`A user with email ${email} already exists.`, 409);
        }
      } else {
        return bad(authError?.message || 'Failed to create Supabase Auth user', 500);
      }
    } else {
      authUserId = created.user.id;
    }

    // Upsert into profiles table
    try {
      await admin.from('profiles').upsert({
        id: authUserId,
        full_name: name,
        role,
      });
    } catch {
      // Silently continue if profiles table is unavailable
    }

    // Try inserting full schema first, fall back to base columns if custom columns don't exist
    const fullPayload = {
      auth_user_id: authUserId,
      employee_code: employeeCode,
      employee_name: name,
      email,
      role,
      user_group: userGroup,
      role_title: roleTitle,
      work_center: workCenter,
      department,
      shift,
      allowed_stages: allowedStages,
      default_stage: defaultStage,
      phone,
      active: true,
    };

    let appUser = null;
    const { data: insertedUser, error: insertError } = await admin
      .from('app_users')
      .insert(fullPayload)
      .select()
      .maybeSingle();

    if (!insertError && insertedUser) {
      appUser = insertedUser;
    } else {
      // Fall back to the core columns guaranteed to exist in app_users
      const basePayload = {
        auth_user_id: authUserId,
        employee_code: employeeCode,
        employee_name: name,
        email,
        role,
        work_center: workCenter,
        department,
        phone,
        active: true,
      };
      const { data: fallbackUser, error: fallbackError } = await admin
        .from('app_users')
        .insert(basePayload)
        .select()
        .single();

      if (fallbackError) {
        return bad(fallbackError.message || 'Failed to save employee record in app_users', 500);
      }
      appUser = fallbackUser;
    }

    return NextResponse.json({ user: appUser }, { status: 201 });
  } catch (e) {
    return bad(e, 500);
  }
}

export async function PUT(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
  }

  const { admin, client } = auth;
  const updateClient = admin || client;

  try {
    const body = await request.json();
    const id = String(body.id ?? '');
    if (!id) return bad('User id is required');

    const { data: existing } = await updateClient
      .from('app_users')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (!existing) {
      return bad('User not found', 404);
    }

    const email = String(body.email ?? existing.email).trim().toLowerCase();
    const rawRole = String(body.role ?? existing.role);
    const role: 'Admin' | 'PPC' | 'Production' | 'QA' | 'Viewer' =
      rawRole.toLowerCase() === 'admin' ? 'Admin' :
      rawRole.toLowerCase() === 'ppc' || rawRole.toLowerCase() === 'manager' ? 'PPC' :
      rawRole.toLowerCase() === 'qa' || rawRole.toLowerCase() === 'qa_inspector' ? 'QA' :
      rawRole.toLowerCase() === 'viewer' || rawRole.toLowerCase() === 'auditor' ? 'Viewer' :
      'Production';

    const userGroup = String(body.user_group ?? (
      role === 'Admin' ? 'admin' : role === 'PPC' ? 'super_user' : 'user'
    ));
    const roleTitle = String(body.role_title ?? '');
    const workCenter = String(body.work_center ?? existing.work_center ?? 'ALL');
    const department = String(body.department ?? existing.department ?? '').trim() || null;
    const phone = String(body.phone ?? existing.phone ?? '').trim() || null;
    const shift = String(body.shift ?? '');
    const allowedStages = Array.isArray(body.allowed_stages) ? body.allowed_stages : [];
    const defaultStage = String(body.default_stage ?? '');

    const fullUpdate: Record<string, unknown> = {
      employee_code: String(body.employee_code ?? existing.employee_code ?? '').trim(),
      employee_name: String(body.employee_name ?? existing.employee_name ?? '').trim(),
      email,
      role,
      user_group: userGroup,
      role_title: roleTitle,
      shift,
      allowed_stages: allowedStages,
      default_stage: defaultStage,
      work_center: workCenter,
      department,
      phone,
      active: body.active !== false,
      updated_at: new Date().toISOString(),
    };

    const { error: fullUpdateError } = await updateClient
      .from('app_users')
      .update(fullUpdate)
      .eq('id', id);

    if (fullUpdateError) {
      // Fall back to base columns
      const baseUpdate: Record<string, unknown> = {
        employee_code: String(body.employee_code ?? existing.employee_code ?? '').trim(),
        employee_name: String(body.employee_name ?? existing.employee_name ?? '').trim(),
        email,
        role,
        work_center: workCenter,
        department,
        phone,
        active: body.active !== false,
        updated_at: new Date().toISOString(),
      };
      const { error: baseUpdateError } = await updateClient
        .from('app_users')
        .update(baseUpdate)
        .eq('id', id);

      if (baseUpdateError) {
        return bad(baseUpdateError.message || 'Failed to update user', 500);
      }
    }

    if (admin && existing.auth_user_id) {
      try {
        await admin.from('profiles').upsert({
          id: existing.auth_user_id,
          full_name: fullUpdate.employee_name as string,
          role,
        });
      } catch {
        // Silently continue
      }

      const newPassword = String(body.password ?? '');
      const updateAuthPayload: any = {
        email,
        user_metadata: {
          full_name: fullUpdate.employee_name,
          role,
          user_group: userGroup,
          work_center: workCenter,
        },
      };
      if (newPassword && newPassword.length >= 8) {
        updateAuthPayload.password = newPassword;
      }
      await admin.auth.admin.updateUserById(existing.auth_user_id, updateAuthPayload).catch(() => {});
    }

    const { data } = await updateClient.from('app_users').select('*').eq('id', id).single();
    if (data) return NextResponse.json({ user: data });
    return bad('Failed to update user', 500);
  } catch (e) {
    return bad(e, 500);
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
  }

  const { admin, client } = auth;
  const updateClient = admin || client;

  try {
    const body = await request.json();
    const id = String(body.id ?? '');
    const active = Boolean(body.active);

    if (!id) return bad('User id is required');

    const { data: existing } = await updateClient.from('app_users').select('auth_user_id').eq('id', id).single();
    if (!existing) {
      return bad('User not found', 404);
    }

    await updateClient.from('app_users').update({ active, updated_at: new Date().toISOString() }).eq('id', id);
    return NextResponse.json({ active });
  } catch (e) {
    return bad(e, 500);
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
  }

  const { admin, client } = auth;
  const updateClient = admin || client;

  try {
    const body = await request.json();
    const id = String(body.id ?? '');
    if (!id) return bad('User id is required');

    const { data: existing } = await updateClient.from('app_users').select('auth_user_id').eq('id', id).single();
    if (!existing) {
      return bad('User not found', 404);
    }

    // Deactivate user in app_users
    await updateClient.from('app_users').update({ active: false, updated_at: new Date().toISOString() }).eq('id', id);

    return NextResponse.json({ success: true, deactivated: true });
  } catch (e) {
    return bad(e, 500);
  }
}



