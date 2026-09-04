import { createClient } from '@/lib/supabase/client';
import type { AppUserProfile, UserGroup, UserRole } from './types';

const ALL_STAGES = ['ROLLING', 'HOLLOW_HEAT_TREATMENT', 'DRAW', 'HEAT_TREATMENT', 'FINISHING'];

const ROLE_MAP: Record<string, { role: UserRole; group: UserGroup; title: string }> = {
  Admin: { role: 'admin', group: 'admin', title: 'PPC Administrator' },
  PPC: { role: 'manager', group: 'super_user', title: 'Plant Operations Head' },
  Production: { role: 'rolling_incharge', group: 'user', title: 'Production Operator' },
  QA: { role: 'qa_inspector', group: 'user', title: 'Quality & NDT Inspector' },
  Viewer: { role: 'auditor', group: 'user', title: 'Viewer' },
};

export function mapAppUser(row: any): AppUserProfile {
  const mapped = ROLE_MAP[row?.role] || ROLE_MAP.Viewer;
  const wc = String(row?.work_center || 'ALL');
  const name = String(row?.employee_name || row?.name || row?.email || 'User');
  const empCode = String(row?.employee_code || row?.employee_id || '');
  return {
    id: String(row?.id || ''),
    auth_user_id: String(row?.auth_user_id || row?.id || ''),
    email: String(row?.email || ''),
    name,
    employee_id: empCode,
    group: (row?.user_group || row?.group || mapped.group) as UserGroup,
    role: (['admin','manager','rolling_incharge','draw_operator','qa_inspector','finishing_operator','auditor'].includes(String(row?.role))
      ? String(row.role)
      : mapped.role) as UserRole,
    role_title: String(row?.role_title || mapped.title),
    department: String(row?.department || ''),
    shift: String(row?.shift || ''),
    work_center: wc,
    allowed_stages: Array.isArray(row?.allowed_stages)
      ? row.allowed_stages
      : wc === 'ALL' ? ALL_STAGES : [wc],
    default_stage: row?.default_stage || (wc === 'ALL' ? 'ROLLING' : wc),
    phone: String(row?.phone || ''),
    avatar_color: String(row?.avatar_color || ''),
    active: row?.active !== false,
    created_at: String(row?.created_at || new Date().toISOString()),
    last_login: row?.last_login || undefined,
  };
}

export async function getCurrentAppUser(): Promise<AppUserProfile | null> {
  const supabase = createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return null;

  let { data, error } = await supabase
    .from('app_users')
    .select('*')
    .eq('auth_user_id', auth.user.id)
    .maybeSingle();

  // If not found by auth_user_id, attempt to match by email
  if (!data && auth.user.email) {
    const { data: byEmail } = await supabase
      .from('app_users')
      .select('*')
      .ilike('email', auth.user.email)
      .maybeSingle();

    if (byEmail) {
      data = byEmail;
      // Auto-link auth_user_id
      try {
        await supabase
          .from('app_users')
          .update({ auth_user_id: auth.user.id })
          .eq('id', byEmail.id);
      } catch {}
    }
  }

  // If still not present in app_users, construct an active session user from Supabase Auth metadata
  if (!data) {
    const meta = auth.user.user_metadata || {};
    const isAdmin = auth.user.email?.toLowerCase().includes('admin') || meta.role === 'Admin' || meta.user_group === 'admin';
    return mapAppUser({
      id: auth.user.id,
      auth_user_id: auth.user.id,
      email: auth.user.email,
      employee_name: meta.full_name || meta.name || auth.user.email?.split('@')[0] || 'User',
      role: isAdmin ? 'Admin' : (meta.role || 'Viewer'),
      user_group: isAdmin ? 'admin' : (meta.user_group || 'user'),
      work_center: meta.work_center || 'ALL',
      active: true,
    });
  }

  if (error || data.active === false) return null;
  return mapAppUser(data);
}

export async function getAppUsers(): Promise<AppUserProfile[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from('app_users').select('*').order('employee_name');
  if (error || !Array.isArray(data)) return [];
  return data.map(mapAppUser);
}
