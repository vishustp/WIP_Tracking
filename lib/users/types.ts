export type UserGroup = 'admin' | 'super_user' | 'user';

export type WorkCenterCode =
  | 'ALL'
  | 'ROLLING'
  | 'HOLLOW_HEAT_TREATMENT'
  | 'DRAW'
  | 'HEAT_TREATMENT'
  | 'VDI'
  | 'FINISHING'
  | 'QA'
  | 'AUDIT';

export type UserRole =
  | 'admin'
  | 'manager'
  | 'rolling_incharge'
  | 'draw_operator'
  | 'qa_inspector'
  | 'finishing_operator'
  | 'auditor';

export type AccessLevel = 'none' | 'view' | 'edit';

export interface FormPermissions {
  // Work Center Production Entry Stages
  production_rolling?: AccessLevel;
  production_hollow_ht?: AccessLevel;
  production_draw?: AccessLevel;
  production_ht?: AccessLevel;
  production_band_saw?: AccessLevel;
  production_vdi?: AccessLevel;
  production_finishing?: AccessLevel;

  // Planning & Management Modules
  work_order?: AccessLevel;
  rolling_plan?: AccessLevel;
  diversion?: AccessLevel;

  // Tools & Analytics
  excel_import?: AccessLevel;
  reports?: AccessLevel;
  admin_panel?: AccessLevel;
}

export interface AppUserProfile {
  id: string;
  auth_user_id?: string;
  email: string;
  name: string;
  employee_id: string;
  group: UserGroup;
  role: UserRole;
  role_title: string;
  department: string;
  shift: string;
  work_center: string;
  allowed_stages: string[];
  default_stage?: string;
  permissions?: FormPermissions;
  phone?: string;
  avatar_color?: string;
  pin?: string;
  active: boolean;
  created_at: string;
  last_login?: string;
}

export interface AppAuditLog {
  id: number | string;
  user_id?: string | null;
  user_email?: string;
  user_name?: string;
  action_type?: string;
  entity_type: string;
  entity_id?: string;
  details?: string;
  ip_address?: string;
  created_at: string;
}

export interface AppRoute {
  id: string;
  route_code: string;
  route_name: string;
  material_category: string;
  active: boolean;
  created_at: string;
}

export interface AppStage {
  id: string;
  stage_code: string;
  stage_name: string;
  active: boolean;
  created_at: string;
}
