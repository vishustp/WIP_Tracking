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
  return {
    id: String(row?.id),
    auth_user_id: String(row?.auth_user_id || row?.id),
    email: String(row?.email || ''),
    name: String(row?.employee_name || row?.name || row?.email || ''),
    employee_id: String(row?.employee_code || row?.employee_id || ''),
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
    phone: row?.phone || '',
    avatar_color: row?.avatar_color || '',
    active: row?.active !== false,
    created_at: String(row?.created_at || new Date().toISOString()),
    last_login: row?.last_login || undefined,
  };
}

export async function getCurrentAppUser(): Promise<AppUserProfile | null> {
  const supabase = createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return null;

  const { data, error } = await supabase
    .from('app_users')
    .select('*')
    .eq('auth_user_id', auth.user.id)
    .maybeSingle();

  if (error || !data || data.active === false) return null;
  return mapAppUser(data);
}

export async function getAppUsers(): Promise<AppUserProfile[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from('app_users').select('*').order('employee_name');
  if (error || !Array.isArray(data)) return [];
  return data.map(mapAppUser);
}
