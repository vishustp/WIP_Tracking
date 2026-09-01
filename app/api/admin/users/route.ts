import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';

async function getAuthenticatedAdmin(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Only allow admin operations if BOTH Supabase and the service role key are configured.
  // This means the app is in "real" mode, not "demo/mock" mode.
  if (!url || !key || !serviceKey || !url.startsWith('http')) {
    return null; // No real credentials available at all
  }

  try {
    const response = NextResponse.next({ request });
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies) => cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
      },
    });

    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return null; // No authenticated user
    }

    // Create admin client and check the user's role
    const admin = createAdminClient();
    if (!admin) {
      return null; // Service role key not available
    }

    const { data: profile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'Admin') {
      return null; // User is authenticated but not an Admin
    }

    return admin; // User is authenticated AND is an Admin
  } catch {
    return null; // Any error means no valid admin
  }
}

function bad(error: unknown, status = 400) {
  return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status });
}

export async function GET(request: NextRequest) {
  const admin = await getAuthenticatedAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
  }

  try {
    const { data, error } = await admin
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
  const admin = await getAuthenticatedAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
  }

  try {
    const body = await request.json();

    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    const name = String(body.employee_name ?? '').trim();
    const employeeCode = String(body.employee_code ?? '').trim();
    const role = String(body.role ?? 'Viewer') as 'Admin' | 'PPC' | 'Production' | 'QA' | 'Viewer';
    const workCenter = String(body.work_center ?? 'ALL');
    const department = String(body.department ?? '').trim() || null;
    const phone = String(body.phone ?? '').trim() || null;

    if (!email || !name || !employeeCode) return bad('Name, email and employee code are required');
    if (!password || password.length < 8) return bad('Password must be at least 8 characters');

    const { data: created, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: name },
    });

    if (authError || !created?.user) {
      return bad(authError || 'Failed to create user', 500);
    }

    const authUserId = created.user.id;
    await admin.from('profiles').upsert({
      id: authUserId,
      full_name: name,
      role,
    });

    const { data: appUser } = await admin.from('app_users').insert({
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

    if (appUser) {
      return NextResponse.json({ user: appUser }, { status: 201 });
    }
    return bad('Failed to create app_users record', 500);
  } catch (e) {
    return bad(e, 500);
  }
}

export async function PUT(request: NextRequest) {
  const admin = await getAuthenticatedAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const id = String(body.id ?? '');
    if (!id) return bad('User id is required');

    const { data: existing } = await admin
      .from('app_users').select('auth_user_id,email').eq('id', id).single();
    if (!existing) {
      return bad('User not found', 404);
    }

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

    await admin.from('app_users').update(update).eq('id', id);
    await admin.from('profiles').upsert({
      id: existing.auth_user_id,
      full_name: update.employee_name,
      role: update.role,
    });

    const newPassword = String(body.password ?? '');
    if (newPassword && newPassword.length >= 8) {
      await admin.auth.admin.updateUserById(existing.auth_user_id, {
        email,
        password: newPassword,
        user_metadata: { full_name: String(update.employee_name) },
      });
    }

    const { data } = await admin.from('app_users').select('*').eq('id', id).single();
    if (data) return NextResponse.json({ user: data });
    return bad('Failed to update user', 500);
  } catch (e) {
    return bad(e, 500);
  }
}

export async function PATCH(request: NextRequest) {
  const admin = await getAuthenticatedAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const id = String(body.id ?? '');
    const active = Boolean(body.active);

    if (!id) return bad('User id is required');

    const { data: existing } = await admin.from('app_users').select('auth_user_id').eq('id', id).single();
    if (!existing) {
      return bad('User not found', 404);
    }

    await admin.from('app_users').update({ active }).eq('id', id);
    return NextResponse.json({ active });
  } catch (e) {
    return bad(e, 500);
  }
}


