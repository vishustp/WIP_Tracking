'use client';

import { useState, useEffect, useCallback } from 'react';
import { mockStore, MockUserProfile, UserGroup, UserRole, DEFAULT_USERS } from './supabase/mock-store';
import { StageCode } from '@/types';

export type PermissionAction =
  | 'delete_production_entry'
  | 'edit_production_entry'
  | 'create_production_entry'
  | 'delete_rolling_plan'
  | 'create_rolling_plan'
  | 'edit_rolling_plan'
  | 'create_diversion'
  | 'delete_diversion'
  | 'import_work_orders'
  | 'manage_users'
  | 'access_admin_panel'
  | 'modify_settings'
  | 'view_audit_logs'
  | 'system_reset';

export interface GroupConfig {
  group: UserGroup;
  name: string;
  badgeClass: string;
  iconColor: string;
  description: string;
  capabilities: string[];
}

export const GROUP_CONFIGS: Record<UserGroup, GroupConfig> = {
  admin: {
    group: 'admin',
    name: 'Admin Group',
    badgeClass: 'bg-blue-600 text-white border-blue-500',
    iconColor: 'text-blue-500',
    description: 'Master authority: Delete data from any work center, add/edit/remove users, and modify any system settings.',
    capabilities: [
      'Delete data across all work centers',
      'Add, edit, and remove user accounts & security PINs',
      'Modify system settings, guardrails, and process routes',
      'Create and manage rolling plans & pipe diversions',
      'Full audit trail and system maintenance',
    ],
  },
  super_user: {
    group: 'super_user',
    name: 'Super User Group',
    badgeClass: 'bg-purple-600 text-white border-purple-500',
    iconColor: 'text-purple-500',
    description: 'Global plant authority: Can delete and edit data from ANY work center across the factory floor.',
    capabilities: [
      'Delete and void production entries from ANY work center',
      'Edit unfinalized production logs in all work centers',
      'Create, edit, and delete rolling plans and pipe diversions',
      'Import and manage work orders',
      'View plant performance reports and audit logs',
    ],
  },
  user: {
    group: 'user',
    name: 'User Group',
    badgeClass: 'bg-amber-600 text-white border-amber-500',
    iconColor: 'text-amber-500',
    description: 'Work Center Operators: Can only create, edit, and delete data from their specifically assigned work center.',
    capabilities: [
      'Create production entries for assigned work center',
      'Edit production logs for assigned work center only',
      'Delete unfinalized entries in assigned work center only',
      'Cannot delete or edit data from other work centers',
      'No user management or system settings access',
    ],
  },
};

export const WORK_CENTER_LABELS: Record<string, string> = {
  ALL: 'All Work Centers (Global)',
  ROLLING: 'Hot Rolling & Piercing Mill',
  HOLLOW_HEAT_TREATMENT: 'Hollow Heat Treatment & Annealing',
  DRAW: 'Cold Draw Bench & Pilgering',
  HEAT_TREATMENT: 'Final Heat Treatment & QA Lab',
  FINISHING: 'Finishing, Straightening & Dispatch',
};

export function getGroupConfig(group?: UserGroup | string | null): GroupConfig {
  if (!group || !(group in GROUP_CONFIGS)) {
    return GROUP_CONFIGS.admin;
  }
  return GROUP_CONFIGS[group as UserGroup];
}

/**
 * Validates if the user is authorized to delete a production entry for a specific work center stage
 */
export function checkCanDelete(user: MockUserProfile | null | undefined, stageCode: string): {
  allowed: boolean;
  reason?: string;
} {
  if (!user) return { allowed: false, reason: 'Unauthenticated session' };

  if (user.group === 'admin') {
    return { allowed: true, reason: 'Admin Group has global deletion privileges across all work centers.' };
  }

  if (user.group === 'super_user') {
    return { allowed: true, reason: 'Super User Group can delete data from any work center.' };
  }

  if (user.group === 'user') {
    const isAssigned = user.work_center === stageCode || user.allowed_stages?.includes(stageCode) || user.default_stage === stageCode;
    if (isAssigned) {
      return { allowed: true, reason: `User Group operator authorized for ${WORK_CENTER_LABELS[stageCode] || stageCode}.` };
    }
    return {
      allowed: false,
      reason: `Access Denied: User group can only delete data from their assigned work center (${WORK_CENTER_LABELS[user.work_center] || user.work_center}). This record belongs to ${WORK_CENTER_LABELS[stageCode] || stageCode}.`,
    };
  }

  return { allowed: false, reason: 'Deletion unauthorized.' };
}

/**
 * Validates if the user is authorized to edit a production entry for a specific work center stage
 */
export function checkCanEdit(user: MockUserProfile | null | undefined, stageCode: string): {
  allowed: boolean;
  reason?: string;
} {
  if (!user) return { allowed: false, reason: 'Unauthenticated session' };

  if (user.group === 'admin' || user.group === 'super_user') {
    return { allowed: true };
  }

  if (user.group === 'user') {
    const isAssigned = user.work_center === stageCode || user.allowed_stages?.includes(stageCode) || user.default_stage === stageCode;
    if (isAssigned) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: `Access Denied: User group can only edit data from their assigned work center (${WORK_CENTER_LABELS[user.work_center] || user.work_center}). This entry is from ${WORK_CENTER_LABELS[stageCode] || stageCode}.`,
    };
  }

  return { allowed: false, reason: 'Editing unauthorized.' };
}

/**
 * Validates if the user is authorized to create/record a production entry for a specific work center stage
 */
export function checkCanCreate(user: MockUserProfile | null | undefined, stageCode: string): {
  allowed: boolean;
  reason?: string;
} {
  if (!user) return { allowed: false, reason: 'Unauthenticated session' };

  if (user.group === 'admin' || user.group === 'super_user') {
    return { allowed: true };
  }

  if (user.group === 'user') {
    const isAssigned = user.work_center === stageCode || user.allowed_stages?.includes(stageCode) || user.default_stage === stageCode;
    if (isAssigned) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: `User is assigned to ${WORK_CENTER_LABELS[user.work_center] || user.work_center}. Switch to your authorized work center to record production.`,
    };
  }

  return { allowed: false, reason: 'Recording unauthorized.' };
}

/**
 * Only Admin Group can add, edit, remove, or manage users
 */
export function checkCanManageUsers(user: MockUserProfile | null | undefined): {
  allowed: boolean;
  reason?: string;
} {
  if (user?.group === 'admin') {
    return { allowed: true };
  }
  return {
    allowed: false,
    reason: 'Access Denied: Only Admin Group accounts can add, edit, or remove users.',
  };
}

/**
 * Only Admin Group can modify system settings, guardrails, routes, and reset data
 */
export function checkCanModifySettings(user: MockUserProfile | null | undefined): {
  allowed: boolean;
  reason?: string;
} {
  if (user?.group === 'admin') {
    return { allowed: true };
  }
  return {
    allowed: false,
    reason: 'Access Denied: Only Admin Group can modify system settings and guardrails.',
  };
}

/**
 * Admin and Super User groups can create and manage rolling plans & pipe diversions
 */
export function checkCanManagePlans(user: MockUserProfile | null | undefined): {
  allowed: boolean;
  reason?: string;
} {
  if (user?.group === 'admin' || user?.group === 'super_user') {
    return { allowed: true };
  }
  return {
    allowed: false,
    reason: 'Rolling plans and diversions require Admin Group or Super User Group authorization.',
  };
}

export function usePermissions() {
  const [user, setUser] = useState<MockUserProfile>(() => {
    if (typeof window !== 'undefined') {
      mockStore.loadFromStorage();
    }
    return mockStore.getCurrentUser();
  });

  const refreshUser = useCallback(() => {
    mockStore.loadFromStorage();
    setUser(mockStore.getCurrentUser());
  }, []);

  useEffect(() => {
    refreshUser();

    const handleStorage = (e: StorageEvent) => {
      if (e.key?.startsWith('seamless_wip_')) {
        refreshUser();
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [refreshUser]);

  const group = user.group || (user.role === 'admin' ? 'admin' : user.role === 'manager' ? 'super_user' : 'user');
  const groupConfig = getGroupConfig(group);
  const workCenter = user.work_center || (group === 'admin' || group === 'super_user' ? 'ALL' : user.default_stage || 'ROLLING');
  const workCenterLabel = WORK_CENTER_LABELS[workCenter] || workCenter;

  const canDeleteForStage = useCallback(
    (stageCode: string) => checkCanDelete(user, stageCode),
    [user]
  );

  const canEditForStage = useCallback(
    (stageCode: string) => checkCanEdit(user, stageCode),
    [user]
  );

  const canCreateForStage = useCallback(
    (stageCode: string) => checkCanCreate(user, stageCode),
    [user]
  );

  const can = useCallback(
    (action: PermissionAction, stageCode?: string): { allowed: boolean; reason?: string } => {
      switch (action) {
        case 'delete_production_entry':
          return checkCanDelete(user, stageCode || user.default_stage || 'ROLLING');
        case 'edit_production_entry':
          return checkCanEdit(user, stageCode || user.default_stage || 'ROLLING');
        case 'create_production_entry':
          return checkCanCreate(user, stageCode || user.default_stage || 'ROLLING');
        case 'manage_users':
          return checkCanManageUsers(user);
        case 'modify_settings':
        case 'system_reset':
          return checkCanModifySettings(user);
        case 'access_admin_panel':
          return group === 'admin'
            ? { allowed: true }
            : { allowed: false, reason: 'Admin panel is restricted to Admin Group' };
        case 'create_rolling_plan':
        case 'edit_rolling_plan':
        case 'delete_rolling_plan':
        case 'create_diversion':
        case 'delete_diversion':
        case 'import_work_orders':
          return checkCanManagePlans(user);
        case 'view_audit_logs':
          return { allowed: true };
        default:
          return { allowed: false, reason: 'Action not allowed' };
      }
    },
    [user, group]
  );

  const isStageAllowed = useCallback(
    (stageCode: string): boolean => {
      if (group === 'admin' || group === 'super_user') return true;
      return workCenter === stageCode || user.allowed_stages?.includes(stageCode) || user.default_stage === stageCode;
    },
    [group, workCenter, user.allowed_stages, user.default_stage]
  );

  return {
    user,
    group,
    groupConfig,
    role: user.role,
    roleTitle: user.role_title,
    department: user.department,
    workCenter,
    workCenterLabel,
    isAdmin: group === 'admin',
    isSuperUser: group === 'super_user',
    isUserGroup: group === 'user',
    canDeleteForStage,
    canEditForStage,
    canCreateForStage,
    can,
    isStageAllowed,
    canDeleteGlobal: group === 'admin' || group === 'super_user',
    canManageUsers: group === 'admin',
    canModifySettings: group === 'admin',
    canManagePlans: group === 'admin' || group === 'super_user',
    refreshUser,
  };
}
