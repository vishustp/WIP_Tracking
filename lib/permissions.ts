'use client';

import { useState, useEffect, useCallback } from 'react';
import type { AppUserProfile, UserGroup, UserRole } from './users/types';
import { getCurrentAppUser } from './users/client';
import { createClient } from './supabase/client';
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
 * Only Admin Group can switch active profiles or modify user roles/accounts
 */
export function canSwitchProfile(user: AppUserProfile | null | undefined): boolean {
  return user?.group === 'admin';
}

/**
 * Only Admin Group can edit and save profile identity and security settings
 */
export function canEditProfile(user: AppUserProfile | null | undefined): boolean {
  return user?.group === 'admin';
}

/**
 * Checks if a specific sidebar/navigation route is visible for a user group
 */
export function isRouteVisibleForGroup(group: UserGroup, href: string): boolean {
  if (group === 'admin') {
    return true; // Admin has visibility to all routes & forms
  }

  if (group === 'super_user') {
    // Super User has visibility to all planning, production, and reporting forms, but not Admin Settings / Admin Panel
    return !['/admin', '/settings'].includes(href);
  }

  // User Group (Shop Floor Operator):
  // ONLY Production Entry, Standard Shop Floor Reports (Pending Orders, WIP, Production), Dashboard, and User Profile are visible.
  // PPC planning forms (Work Orders, Excel Import, Rolling Planning, Diversion Planning), PPC Reports (Rolling Plans, Diversions), and Admin/Settings are strictly RESTRICTED to PPC / Admin group.
  const allowedUserRoutes = [
    '/production',
    '/dashboard',
    '/profile',
    '/reports/pending-orders',
    '/reports/wip',
    '/reports/production',
  ];

  return allowedUserRoutes.some((allowed) => href === allowed || href.startsWith(allowed + '/'));
}

/**
 * Validates if the user is authorized to delete a production entry for a specific work center stage
 */
export function checkCanDelete(user: AppUserProfile | null | undefined, stageCode: string): {
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
export function checkCanEdit(user: AppUserProfile | null | undefined, stageCode: string): {
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
export function checkCanCreate(user: AppUserProfile | null | undefined, stageCode: string): {
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
export function checkCanManageUsers(user: AppUserProfile | null | undefined): {
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
export function checkCanModifySettings(user: AppUserProfile | null | undefined): {
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
export function checkCanManagePlans(user: AppUserProfile | null | undefined): {
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

/**
 * Form accessibility descriptors and checking for 3-tier user groups
 */
export interface FormAccessResult {
  formKey: string;
  formTitle: string;
  isAllowed: boolean;
  mode: 'full' | 'view_only';
  canSubmit: boolean;
  canEdit: boolean;
  canDelete: boolean;
  group: UserGroup;
  groupName: string;
  userWorkCenter: string;
  userWorkCenterLabel: string;
  authorizedGroups: string[];
  bannerTitle: string;
  bannerMessage: string;
  reason?: string;
}

export function getFormAccess(
  user: AppUserProfile | null | undefined,
  formKey: 'rolling_plan' | 'production_entry' | 'diversion' | 'work_order' | 'excel_import' | 'admin_panel' | 'settings',
  stageCode?: string
): FormAccessResult {
  const group: UserGroup = user?.group || (user?.role === 'admin' ? 'admin' : user?.role === 'manager' ? 'super_user' : 'user');
  const groupCfg = getGroupConfig(group);
  const wc = user?.work_center || (group === 'admin' || group === 'super_user' ? 'ALL' : user?.default_stage || 'ROLLING');
  const wcLabel = WORK_CENTER_LABELS[wc] || wc;
  const isAuditor = user?.role === 'auditor';

  // 1. Production Entry Form
  if (formKey === 'production_entry') {
    const targetStage = stageCode || 'ROLLING';
    const targetStageLabel = WORK_CENTER_LABELS[targetStage] || targetStage;
    const isStageAssigned =
      group === 'admin' ||
      group === 'super_user' ||
      user?.work_center === targetStage ||
      user?.allowed_stages?.includes(targetStage) ||
      user?.default_stage === targetStage;

    const isAllowed = isStageAssigned && !isAuditor;

    return {
      formKey,
      formTitle: `${targetStageLabel} Production Entry`,
      isAllowed,
      mode: isAllowed ? 'full' : 'view_only',
      canSubmit: isAllowed,
      canEdit: isAllowed,
      canDelete: isAllowed,
      group,
      groupName: groupCfg.name,
      userWorkCenter: wc,
      userWorkCenterLabel: wcLabel,
      authorizedGroups: ['Admin Group', 'Super User Group', `User Group (${targetStageLabel})`],
      bannerTitle: isAllowed ? 'Work Center Operator Access' : 'View-Only Accessibility Mode',
      bannerMessage: isAllowed
        ? `Authorized to record shift production, log rejections, and save batches for ${targetStageLabel}.`
        : isAuditor
        ? 'Auditor role is in read-only inspection mode across all production stages.'
        : `This stage form is accessible in View-Only mode. Your user profile is assigned to ${wcLabel}. Shift logging and edits for ${targetStageLabel} are restricted to its assigned operators or Admin/Super Users.`,
      reason: isAllowed ? undefined : `Restricted to ${targetStageLabel} operators or Admin/Super Users.`,
    };
  }

  // 2. Rolling Plan Form
  if (formKey === 'rolling_plan') {
    const isAllowed = (group === 'admin' || group === 'super_user') && !isAuditor;
    return {
      formKey,
      formTitle: 'Rolling Plan Planning & Allocation',
      isAllowed,
      mode: isAllowed ? 'full' : 'view_only',
      canSubmit: isAllowed,
      canEdit: isAllowed,
      canDelete: isAllowed,
      group,
      groupName: groupCfg.name,
      userWorkCenter: wc,
      userWorkCenterLabel: wcLabel,
      authorizedGroups: ['Admin Group', 'Super User Group'],
      bannerTitle: isAllowed ? 'Full Planning Authority' : 'View-Only Accessibility Mode',
      bannerMessage: isAllowed
        ? 'Full authority to create, edit, calculate, and issue hot rolling plans.'
        : `Rolling plan specifications, mother hollow calculations, and issued schedules are viewable in View-Only mode. Creating or modifying rolling plans requires Admin Group or Super User Group authorization.`,
      reason: isAllowed ? undefined : 'Rolling plan creation is restricted to Admin and Super User groups.',
    };
  }

  // 3. Diversion Planning Form
  if (formKey === 'diversion') {
    const isAllowed = (group === 'admin' || group === 'super_user') && !isAuditor;
    return {
      formKey,
      formTitle: 'Pipe Diversion Planning',
      isAllowed,
      mode: isAllowed ? 'full' : 'view_only',
      canSubmit: isAllowed,
      canEdit: isAllowed,
      canDelete: isAllowed,
      group,
      groupName: groupCfg.name,
      userWorkCenter: wc,
      userWorkCenterLabel: wcLabel,
      authorizedGroups: ['Admin Group', 'Super User Group'],
      bannerTitle: isAllowed ? 'Full Diversion Authority' : 'View-Only Accessibility Mode',
      bannerMessage: isAllowed
        ? 'Authorized to divert stock, reallocate work order inventory, and transfer work in progress.'
        : `Pipe diversion parameters and reallocation histories are accessible in View-Only mode. Reallocating pipe inventory between work orders requires Admin Group or Super User Group authorization.`,
      reason: isAllowed ? undefined : 'Diversion planning is restricted to Admin and Super User groups.',
    };
  }

  // 4. Work Order Form
  if (formKey === 'work_order') {
    const isAllowed = (group === 'admin' || group === 'super_user') && !isAuditor;
    return {
      formKey,
      formTitle: 'Work Order Management',
      isAllowed,
      mode: isAllowed ? 'full' : 'view_only',
      canSubmit: isAllowed,
      canEdit: isAllowed,
      canDelete: isAllowed,
      group,
      groupName: groupCfg.name,
      userWorkCenter: wc,
      userWorkCenterLabel: wcLabel,
      authorizedGroups: ['Admin Group', 'Super User Group'],
      bannerTitle: isAllowed ? 'Work Order Management' : 'View-Only Accessibility Mode',
      bannerMessage: isAllowed
        ? 'Authorized to create, edit, schedule, and track customer work orders.'
        : `Work orders and order specifications are viewable in View-Only mode. Manual creation or modifications of work orders require Admin Group or Super User Group authorization.`,
      reason: isAllowed ? undefined : 'Work order creation is restricted to Admin and Super User groups.',
    };
  }

  // 5. Excel Import Form
  if (formKey === 'excel_import') {
    const isAllowed = (group === 'admin' || group === 'super_user') && !isAuditor;
    return {
      formKey,
      formTitle: 'Excel Work Order Importer',
      isAllowed,
      mode: isAllowed ? 'full' : 'view_only',
      canSubmit: isAllowed,
      canEdit: isAllowed,
      canDelete: isAllowed,
      group,
      groupName: groupCfg.name,
      userWorkCenter: wc,
      userWorkCenterLabel: wcLabel,
      authorizedGroups: ['Admin Group', 'Super User Group'],
      bannerTitle: isAllowed ? 'Excel Importer' : 'View-Only Accessibility Mode',
      bannerMessage: isAllowed
        ? 'Authorized to parse spreadsheet work orders and commit batch data to the factory ledger.'
        : `Excel parsing and validation preview is accessible in View-Only mode. Committing imported batches to the live database requires Admin Group or Super User Group authorization.`,
      reason: isAllowed ? undefined : 'Committing Excel imports is restricted to Admin and Super User groups.',
    };
  }

  // 6. Admin Control Panel
  if (formKey === 'admin_panel') {
    const isAllowed = group === 'admin';
    return {
      formKey,
      formTitle: 'Admin Control Panel',
      isAllowed,
      mode: isAllowed ? 'full' : 'view_only',
      canSubmit: isAllowed,
      canEdit: isAllowed,
      canDelete: isAllowed,
      group,
      groupName: groupCfg.name,
      userWorkCenter: wc,
      userWorkCenterLabel: wcLabel,
      authorizedGroups: ['Admin Group'],
      bannerTitle: isAllowed ? 'Admin Master Control' : 'System Inspection View (Read-Only)',
      bannerMessage: isAllowed
        ? 'Master administrative access to manage users, process routes, guardrails, and system resets.'
        : `You are viewing the Admin Control Panel in Read-Only Inspection mode. Modifying user profiles, PIN credentials, guardrails, or database resets is restricted to Admin Group accounts.`,
      reason: isAllowed ? undefined : 'Modifications restricted to Admin Group.',
    };
  }

  // 7. Settings Form
  const isAllowed = group === 'admin';
  return {
    formKey,
    formTitle: 'System Settings',
    isAllowed,
    mode: isAllowed ? 'full' : 'view_only',
    canSubmit: isAllowed,
    canEdit: isAllowed,
    canDelete: isAllowed,
    group,
    groupName: groupCfg.name,
    userWorkCenter: wc,
    userWorkCenterLabel: wcLabel,
    authorizedGroups: ['Admin Group'],
    bannerTitle: isAllowed ? 'Settings Management' : 'View-Only Settings Inspection',
    bannerMessage: isAllowed
      ? 'Authorized to configure master process routes, stages, and parameters.'
      : 'Process routes and stage master definitions are viewable in read-only mode. Route modifications require Admin Group.',
    reason: isAllowed ? undefined : 'Restricted to Admin Group.',
  };
}

export function usePermissions() {
  const [user, setUser] = useState<AppUserProfile | null>(null);

  const refreshUser = useCallback(async () => {
    try {
      setUser(await getCurrentAppUser());
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    void refreshUser();
    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      void refreshUser();
    });
    return () => subscription.unsubscribe();
  }, [refreshUser]);

  const group = (user?.group || (user?.role === 'admin' ? 'admin' : user?.role === 'manager' ? 'super_user' : 'user')) as UserGroup;
  const groupConfig = getGroupConfig(group);
  const workCenter = user?.work_center || (group === 'admin' || group === 'super_user' ? 'ALL' : user?.default_stage || 'ROLLING');
  const workCenterLabel = WORK_CENTER_LABELS[workCenter] || workCenter;

  const canDeleteForStage = useCallback((stageCode: string) => checkCanDelete(user, stageCode), [user]);
  const canEditForStage = useCallback((stageCode: string) => checkCanEdit(user, stageCode), [user]);
  const canCreateForStage = useCallback((stageCode: string) => checkCanCreate(user, stageCode), [user]);

  const can = useCallback(
    (action: PermissionAction, stageCode?: string): { allowed: boolean; reason?: string } => {
      switch (action) {
        case 'delete_production_entry': return checkCanDelete(user, stageCode || user?.default_stage || 'ROLLING');
        case 'edit_production_entry': return checkCanEdit(user, stageCode || user?.default_stage || 'ROLLING');
        case 'create_production_entry': return checkCanCreate(user, stageCode || user?.default_stage || 'ROLLING');
        case 'manage_users': return checkCanManageUsers(user);
        case 'modify_settings':
        case 'system_reset': return checkCanModifySettings(user);
        case 'access_admin_panel':
          return group === 'admin' ? { allowed: true } : { allowed: false, reason: 'Admin panel is restricted to Admin Group' };
        case 'create_rolling_plan':
        case 'edit_rolling_plan':
        case 'delete_rolling_plan':
        case 'create_diversion':
        case 'delete_diversion':
        case 'import_work_orders': return checkCanManagePlans(user);
        case 'view_audit_logs': return { allowed: true };
        default: return { allowed: false, reason: 'Action not allowed' };
      }
    },
    [user, group]
  );

  const isStageAllowed = useCallback(
    (stageCode: string): boolean => {
      if (group === 'admin' || group === 'super_user') return true;
      return !!user && (workCenter === stageCode || user.allowed_stages?.includes(stageCode) || user.default_stage === stageCode);
    },
    [group, workCenter, user]
  );

  return {
    user,
    group,
    groupConfig,
    role: user?.role,
    roleTitle: user?.role_title,
    department: user?.department,
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
    canSwitchProfile: canSwitchProfile(user),
    canEditProfile: canEditProfile(user),
    isRouteVisible: (href: string) => isRouteVisibleForGroup(group, href),
    refreshUser,
  };
}
