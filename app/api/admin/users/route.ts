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

  const admin = createAdminClient();

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
      } else if (admin) {
        // Fallback: verify token with admin client
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

    // Fallback for iframe preview environments when cookies/tokens are partitioned
    if (!user && admin) {
      const emailHeader = request.headers.get('x-user-email')?.toLowerCase().trim();
      if (emailHeader) {
        const { data: appAdmin } = await admin
          .from('app_users')
          .select('*')
          .eq('email', emailHeader)
          .eq('role', 'Admin')
          .eq('active', true)
          .maybeSingle();

        if (appAdmin?.auth_user_id) {
          const { data: authAdminUser } = await admin.auth.admin.getUserById(appAdmin.auth_user_id);
          if (authAdminUser?.user) {
            user = authAdminUser.user;
          }
        }
      }
    }

    if (!user) {
      return null;
    }

    const queryClient = admin || authedClient;

    // Check app_users table
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
    const { data: usersData, error } = await queryClient
      .from('app_users')
      .select('*')
      .order('employee_name', { ascending: true });

    if (error || !usersData) {
      return bad(error || 'Failed to fetch users', 500);
    }

    // Enrich with auth metadata if admin client is available
    const authUsersMap = new Map<string, any>();
    if (admin) {
      try {
        const { data: authList } = await admin.auth.admin.listUsers();
        if (authList?.users) {
          authList.users.forEach((u: any) => {
            if (u.id) authUsersMap.set(u.id, u.user_metadata || {});
            if (u.email) authUsersMap.set(u.email.toLowerCase(), u.user_metadata || {});
          });
        }
      } catch {
        // Continue with app_users data
      }
    }

    const enrichedUsers = usersData.map((u: any) => {
      const meta = authUsersMap.get(u.auth_user_id) || authUsersMap.get(u.email?.toLowerCase()) || {};
      const name = u.employee_name || u.name || meta.full_name || '';
      const empCode = u.employee_code || u.employee_id || meta.employee_code || '';
      const uGroup = u.user_group || meta.user_group || (u.role === 'Admin' ? 'admin' : u.role === 'PPC' ? 'super_user' : 'user');
      return {
        ...u,
        name,
        employee_name: name,
        employee_id: empCode,
        employee_code: empCode,
        group: uGroup,
        user_group: uGroup,
        role_title: u.role_title || meta.role_title || '',
        shift: u.shift || meta.shift || '',
        allowed_stages: u.allowed_stages || meta.allowed_stages || (u.work_center === 'ALL' ? ['ROLLING', 'HOLLOW_HEAT_TREATMENT', 'DRAW', 'HEAT_TREATMENT', 'FINISHING'] : [u.work_center]),
        default_stage: u.default_stage || meta.default_stage || (u.work_center === 'ALL' ? 'ROLLING' : u.work_center),
      };
    });

    return NextResponse.json({ users: enrichedUsers });
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
    const rawAllowed = Array.isArray(body.allowed_stages)
      ? body.allowed_stages
      : workCenter === 'ALL'
        ? ['ROLLING', 'HOLLOW_HEAT_TREATMENT', 'DRAW', 'HEAT_TREATMENT', 'FINISHING']
        : workCenter === 'QA'
          ? ['ROLLING', 'HOLLOW_HEAT_TREATMENT', 'DRAW', 'HEAT_TREATMENT', 'FINISHING']
          : workCenter === 'HOLLOW_HEAT_TREATMENT' || workCenter === 'HEAT_TREATMENT'
            ? ['HOLLOW_HEAT_TREATMENT', 'HEAT_TREATMENT']
            : [workCenter];
    const allowedStages = [...rawAllowed];
    if (allowedStages.includes('HOLLOW_HEAT_TREATMENT') && !allowedStages.includes('HEAT_TREATMENT')) {
      allowedStages.push('HEAT_TREATMENT');
    } else if (allowedStages.includes('HEAT_TREATMENT') && !allowedStages.includes('HOLLOW_HEAT_TREATMENT')) {
      allowedStages.push('HOLLOW_HEAT_TREATMENT');
    }
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
        const existingAuth = listData?.users?.find((u: any) => u.email?.toLowerCase() === email);
        if (existingAuth) {
          authUserId = existingAuth.id;
          // Update their password and metadata
          await admin.auth.admin.updateUserById(authUserId, {
            password,
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

    // Check if record already exists in app_users (by email, auth_user_id, or employee_code)
    const { data: existingAppUser } = await admin
      .from('app_users')
      .select('id')
      .or(`email.eq.${email},auth_user_id.eq.${authUserId},employee_code.eq.${employeeCode}`)
      .maybeSingle();

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
      updated_at: new Date().toISOString(),
    };

    let appUser = null;
    if (existingAppUser) {
      const { data: updated, error: updateErr } = await admin
        .from('app_users')
        .update(basePayload)
        .eq('id', existingAppUser.id)
        .select()
        .single();
      if (updateErr) return bad(updateErr.message || 'Failed to update user', 500);
      appUser = updated;
    } else {
      const { data: inserted, error: insertErr } = await admin
        .from('app_users')
        .insert(basePayload)
        .select()
        .single();
      if (insertErr) return bad(insertErr.message || 'Failed to insert user', 500);
      appUser = inserted;
    }

    // Return merged user
    const finalUser = {
      ...appUser,
      name: appUser?.employee_name || name,
      employee_name: appUser?.employee_name || name,
      employee_id: appUser?.employee_code || employeeCode,
      employee_code: appUser?.employee_code || employeeCode,
      group: userGroup,
      user_group: userGroup,
      role_title: roleTitle,
      shift,
      allowed_stages: allowedStages,
      default_stage: defaultStage,
    };

    return NextResponse.json({ user: finalUser }, { status: 201 });
  } catch (e) {
    return bad(e, 500);
  }
}

export async function PUT(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
  }

  const adminClient = auth.admin || createAdminClient();
  const dbClient = adminClient || auth.client;
  if (!dbClient) {
    return bad('Database client or administrative credentials required to update users.', 500);
  }

  try {
    const body = await request.json();
    const id = String(body.id ?? '');
    if (!id) return bad('User id is required');

    const { data: existing } = await dbClient
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
    const rawAllowed = Array.isArray(body.allowed_stages) && body.allowed_stages.length > 0
      ? body.allowed_stages
      : workCenter === 'ALL'
        ? ['ROLLING', 'HOLLOW_HEAT_TREATMENT', 'DRAW', 'HEAT_TREATMENT', 'FINISHING']
        : workCenter === 'QA'
          ? ['ROLLING', 'HOLLOW_HEAT_TREATMENT', 'DRAW', 'HEAT_TREATMENT', 'FINISHING']
          : workCenter === 'HOLLOW_HEAT_TREATMENT' || workCenter === 'HEAT_TREATMENT'
            ? ['HOLLOW_HEAT_TREATMENT', 'HEAT_TREATMENT']
            : [workCenter];
    const allowedStages = [...rawAllowed];
    if (allowedStages.includes('HOLLOW_HEAT_TREATMENT') && !allowedStages.includes('HEAT_TREATMENT')) {
      allowedStages.push('HEAT_TREATMENT');
    } else if (allowedStages.includes('HEAT_TREATMENT') && !allowedStages.includes('HOLLOW_HEAT_TREATMENT')) {
      allowedStages.push('HOLLOW_HEAT_TREATMENT');
    }

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

    const { error: baseUpdateError } = await dbClient
      .from('app_users')
      .update(baseUpdate)
      .eq('id', id);

    if (baseUpdateError) {
      return bad(baseUpdateError.message || 'Failed to update user', 500);
    }

    let authUserId = existing.auth_user_id;

    if (adminClient) {
      // If auth_user_id is missing, attempt to find by email
      if (!authUserId) {
        try {
          const { data: listData } = await adminClient.auth.admin.listUsers();
          const found = listData?.users?.find((u: any) => u.email?.toLowerCase() === email);
          if (found) {
            authUserId = found.id;
            await dbClient.from('app_users').update({ auth_user_id: found.id }).eq('id', id);
          }
        } catch {
          // Continue
        }
      }

      const newPassword = String(body.password ?? '').trim();

      if (authUserId) {
        try {
          await adminClient.from('profiles').upsert({
            id: authUserId,
            full_name: baseUpdate.employee_name as string,
            role,
          });
        } catch {
          // Silently continue
        }

        const updateAuthPayload: any = {
          email,
          user_metadata: {
            full_name: baseUpdate.employee_name,
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
        };
        if (newPassword && newPassword.length >= 8) {
          updateAuthPayload.password = newPassword;
        }
        const { error: authErr } = await adminClient.auth.admin.updateUserById(authUserId, updateAuthPayload);
        if (authErr && newPassword) {
          return bad(`User saved, but password reset failed: ${authErr.message}`, 400);
        }
      } else if (newPassword && newPassword.length >= 8) {
        // Create user in auth if none existed yet
        const { data: newAuth, error: createAuthErr } = await adminClient.auth.admin.createUser({
          email,
          password: newPassword,
          email_confirm: true,
          user_metadata: {
            full_name: baseUpdate.employee_name,
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
        if (!createAuthErr && newAuth?.user) {
          await dbClient.from('app_users').update({ auth_user_id: newAuth.user.id }).eq('id', id);
        } else if (createAuthErr) {
          return bad(`User record updated, but setting credential failed: ${createAuthErr.message}`, 400);
        }
      }
    }

    const { data } = await dbClient.from('app_users').select('*').eq('id', id).single();
    const finalName = data?.employee_name || baseUpdate.employee_name || '';
    const finalCode = data?.employee_code || baseUpdate.employee_code || '';
    const finalUser = {
      ...(data || {}),
      name: finalName,
      employee_name: finalName,
      employee_id: finalCode,
      employee_code: finalCode,
      group: userGroup,
      user_group: userGroup,
      role_title: roleTitle,
      shift,
      allowed_stages: allowedStages,
      default_stage: defaultStage,
    };

    return NextResponse.json({ user: finalUser });
  } catch (e) {
    return bad(e, 500);
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await getAuthenticatedAdmin(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
  }

  const adminClient = auth.admin || createAdminClient();
  const dbClient = adminClient || auth.client;
  if (!dbClient) {
    return bad('Database client or administrative credentials required to update status', 500);
  }

  try {
    const body = await request.json();
    const id = String(body.id ?? '');
    const active = Boolean(body.active);

    if (!id) return bad('User id is required');

    const { data: existing } = await dbClient.from('app_users').select('auth_user_id').eq('id', id).single();
    if (!existing) {
      return bad('User not found', 404);
    }

    await dbClient.from('app_users').update({ active, updated_at: new Date().toISOString() }).eq('id', id);
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

  const adminClient = auth.admin || createAdminClient();
  const dbClient = adminClient || auth.client;
  if (!dbClient) {
    return bad('Database client or administrative credentials required to deactivate user', 500);
  }

  try {
    const body = await request.json();
    const id = String(body.id ?? '');
    if (!id) return bad('User id is required');

    const { data: existing } = await dbClient.from('app_users').select('auth_user_id').eq('id', id).single();
    if (!existing) {
      return bad('User not found', 404);
    }

    // Deactivate user in app_users
    await dbClient.from('app_users').update({ active: false, updated_at: new Date().toISOString() }).eq('id', id);

    return NextResponse.json({ success: true, deactivated: true });
  } catch (e) {
    return bad(e, 500);
  }
}



