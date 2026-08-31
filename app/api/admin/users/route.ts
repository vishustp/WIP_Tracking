import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';

async function getAuthenticatedAdmin(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase environment is not configured');

  const response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies) => cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
    },
  });

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Unauthenticated');

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'Admin') throw new Error('Only Admin users can manage users');
  return { user, admin };
}

function bad(error: unknown, status = 400) {
  return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status });
}

export async function GET(request: NextRequest) {
  try {
    const { admin } = await getAuthenticatedAdmin(request);
    const { data, error } = await admin
      .from('app_users')
      .select('*')
      .order('employee_name', { ascending: true });
    if (error) return bad(error);
    return NextResponse.json({ users: data ?? [] });
  } catch (e) {
    return bad(e, 401);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { admin } = await getAuthenticatedAdmin(request);
    const body = await request.json();

    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    const name = String(body.employee_name ?? '').trim();
    const employeeCode = String(body.employee_code ?? '').trim();
    const role = String(body.role ?? 'Viewer') as 'Admin' | 'PPC' | 'Production' | 'QA' | 'Viewer';
    const workCenter = String(body.work_center ?? 'ALL');
    const department = String(body.department ?? '').trim() || null;
    const phone = String(body.phone ?? '').trim() || null;

    if (!email || !name || !employeeCode || !password) return bad('Name, email, employee code and password are required');
    if (password.length < 8) return bad('Password must be at least 8 characters');

    const { data: created, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: name },
    });
    if (authError || !created.user) return bad(authError ?? 'Unable to create Auth user');

    const authUserId = created.user.id;

    const { error: profileError } = await admin.from('profiles').upsert({
      id: authUserId,
      full_name: name,
      role,
    });
    if (profileError) {
      await admin.auth.admin.deleteUser(authUserId);
      return bad(profileError);
    }

    const { data: appUser, error: appError } = await admin.from('app_users').insert({
      auth_user_id: authUserId,
      employee_code: employeeCode,
      employee_name: name,
      email,
      role,
      work_center: workCenter,
      department,
      phone,
      active: true,
    }).select().single();

    if (appError) {
      await admin.auth.admin.deleteUser(authUserId);
      return bad(appError);
    }

    return NextResponse.json({ user: appUser }, { status: 201 });
  } catch (e) {
    return bad(e, 401);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { admin } = await getAuthenticatedAdmin(request);
    const body = await request.json();
    const id = String(body.id ?? '');
    if (!id) return bad('User id is required');

    const { data: existing, error: findError } = await admin
      .from('app_users').select('auth_user_id,email').eq('id', id).single();
    if (findError || !existing) return bad(findError ?? 'User not found', 404);

    const email = String(body.email ?? existing.email).trim().toLowerCase();
    const update: Record<string, unknown> = {
      employee_code: String(body.employee_code ?? '').trim(),
      employee_name: String(body.employee_name ?? '').trim(),
      email,
      role: body.role,
      work_center: String(body.work_center ?? 'ALL'),
      department: String(body.department ?? '').trim() || null,
      phone: String(body.phone ?? '').trim() || null,
      active: body.active !== false,
    };

    const { error: appError } = await admin.from('app_users').update(update).eq('id', id);
    if (appError) return bad(appError);

    const { error: profileError } = await admin.from('profiles').upsert({
      id: existing.auth_user_id,
      full_name: update.employee_name,
      role: update.role,
    });
    if (profileError) return bad(profileError);

    const newPassword = String(body.password ?? '');
    const authUpdate: { email?: string; password?: string; user_metadata?: Record<string,string> } = {
      email,
      user_metadata: { full_name: String(update.employee_name) },
    };
    if (newPassword) {
      if (newPassword.length < 8) return bad('Password must be at least 8 characters');
      authUpdate.password = newPassword;
    }
    const { error: authError } = await admin.auth.admin.updateUserById(existing.auth_user_id, authUpdate);
    if (authError) return bad(authError);

    const { data } = await admin.from('app_users').select('*').eq('id', id).single();
    return NextResponse.json({ user: data });
  } catch (e) {
    return bad(e, 401);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { admin } = await getAuthenticatedAdmin(request);
    const body = await request.json();
    const id = String(body.id ?? '');
    const active = Boolean(body.active);
    const { data: existing } = await admin.from('app_users').select('auth_user_id').eq('id', id).single();
    if (!existing) return bad('User not found', 404);

    const { error } = await admin.from('app_users').update({ active }).eq('id', id);
    if (error) return bad(error);
    return NextResponse.json({ active });
  } catch (e) {
    return bad(e, 401);
  }
}
