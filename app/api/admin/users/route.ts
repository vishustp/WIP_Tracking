import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { mockStore, DEFAULT_USERS, MockUserProfile, UserGroup, UserRole, WorkCenterCode } from '@/lib/supabase/mock-store';

async function getAuthenticatedAdmin(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const admin = createAdminClient();

  if (url && key && url.startsWith('http') && admin) {
    try {
      const response = NextResponse.next({ request });
      const supabase = createServerClient(url, key, {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (cookies) => cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
        },
      });

      const { data: { user }, error } = await supabase.auth.getUser();
      if (!error && user) {
        const { data: profile } = await admin
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();

        if (profile?.role === 'Admin') {
          return { user, admin };
        }
      }
    } catch {
      // Fall through to mock admin
    }
  }

  // Fallback / Demo Admin
  return { user: { id: 'mock-user-1', email: 'admin@seamlesswip.com' }, admin: null };
}

function bad(error: unknown, status = 400) {
  return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status });
}

export async function GET(request: NextRequest) {
  try {
    const { admin } = await getAuthenticatedAdmin(request);
    if (admin) {
      const { data, error } = await admin
        .from('app_users')
        .select('*')
        .order('employee_name', { ascending: true });
      if (!error && data) {
        return NextResponse.json({ users: data });
      }
    }

    // In-memory fallback
    const sourceUsers = mockStore.users.length ? mockStore.users : DEFAULT_USERS;
    const formatted = sourceUsers.map(u => ({
      id: u.id,
      auth_user_id: u.id,
      employee_code: u.employee_id,
      employee_name: u.name,
      email: u.email,
      role: u.group === 'admin' ? 'Admin' : u.group === 'super_user' ? 'PPC' : u.role === 'qa_inspector' ? 'QA' : u.role === 'auditor' ? 'Viewer' : 'Production',
      work_center: u.work_center || 'ALL',
      department: u.department || null,
      phone: u.phone || null,
      active: u.active,
      created_at: u.created_at,
    }));
    return NextResponse.json({ users: formatted });
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

    if (!email || !name || !employeeCode) return bad('Name, email and employee code are required');

    if (admin) {
      if (password && password.length >= 8) {
        const { data: created, error: authError } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: name },
        });
        if (!authError && created?.user) {
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
        }
      }
    }

    // In-memory fallback
    const roleMap: Record<string, { role: UserRole; group: UserGroup; title: string }> = {
      Admin: { role: 'admin', group: 'admin', title: 'PPC Administrator' },
      PPC: { role: 'manager', group: 'super_user', title: 'Plant Operations Head' },
      Production: { role: 'rolling_incharge', group: 'user', title: 'Production Operator' },
      QA: { role: 'qa_inspector', group: 'user', title: 'Quality & NDT Inspector' },
      Viewer: { role: 'auditor', group: 'user', title: 'Viewer' },
    };
    const mapped = roleMap[role] || roleMap.Viewer;
    const newId = `user-${Date.now()}`;
    const newMockUser: MockUserProfile = {
      id: newId,
      email,
      name,
      employee_id: employeeCode,
      group: mapped.group,
      role: mapped.role,
      role_title: mapped.title,
      department: department || '',
      shift: 'Shift A (06:00 - 14:00)',
      work_center: workCenter as WorkCenterCode,
      allowed_stages: workCenter === 'ALL' ? ['ROLLING', 'HOLLOW_HEAT_TREATMENT', 'DRAW', 'HEAT_TREATMENT', 'FINISHING'] : [workCenter],
      default_stage: workCenter === 'ALL' ? 'ROLLING' : workCenter,
      phone: phone || '',
      active: true,
      pin: password || '1234',
      created_at: new Date().toISOString(),
    };
    mockStore.users.push(newMockUser);
    mockStore.saveToStorage();

    const createdRecord = {
      id: newId,
      auth_user_id: newId,
      employee_code: employeeCode,
      employee_name: name,
      email,
      role,
      work_center: workCenter,
      department,
      phone,
      active: true,
      created_at: newMockUser.created_at,
    };
    return NextResponse.json({ user: createdRecord }, { status: 201 });
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

    if (admin) {
      const { data: existing } = await admin
        .from('app_users').select('auth_user_id,email').eq('id', id).single();
      if (existing) {
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
      }
    }

    // In-memory fallback
    const targetUser = mockStore.users.find(u => u.id === id || u.email.toLowerCase() === String(body.email || '').toLowerCase());
    if (targetUser) {
      if (body.employee_name) targetUser.name = String(body.employee_name).trim();
      if (body.email) targetUser.email = String(body.email).trim().toLowerCase();
      if (body.employee_code) targetUser.employee_id = String(body.employee_code).trim();
      if (body.department !== undefined) targetUser.department = String(body.department || '');
      if (body.phone !== undefined) targetUser.phone = String(body.phone || '');
      if (body.work_center) targetUser.work_center = String(body.work_center);
      if (body.password) targetUser.pin = String(body.password);
      if (body.active !== undefined) targetUser.active = Boolean(body.active);
      mockStore.saveToStorage();
    }

    return NextResponse.json({ user: body });
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

    if (admin) {
      const { data: existing } = await admin.from('app_users').select('auth_user_id').eq('id', id).single();
      if (existing) {
        await admin.from('app_users').update({ active }).eq('id', id);
        return NextResponse.json({ active });
      }
    }

    // In-memory fallback
    const target = mockStore.users.find(u => u.id === id);
    if (target) {
      target.active = active;
      mockStore.saveToStorage();
    }
    return NextResponse.json({ active });
  } catch (e) {
    return bad(e, 401);
  }
}

