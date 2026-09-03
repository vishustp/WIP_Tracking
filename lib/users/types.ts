export type UserGroup = 'admin' | 'super_user' | 'user';

export type WorkCenterCode =
  | 'ALL'
  | 'ROLLING'
  | 'HOLLOW_HEAT_TREATMENT'
  | 'DRAW'
  | 'HEAT_TREATMENT'
  | 'FINISHING'
  | 'QA'
  | 'AUDIT';

export type UserRole =
  | 'admin'
  | 'manager'
  | 'rolling_incharge'
  | 'draw_operator'
  | 'qa_inspector'
  | 'auditor';

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
  phone?: string;
  avatar_color?: string;
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
