'use client';

import { useState, useEffect, useCallback } from 'react';
import { mockStore, MockUserProfile, UserRole, DEFAULT_USERS } from './supabase/mock-store';
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
  | 'view_audit_logs'
  | 'system_reset';

export interface RoleConfig {
  role: UserRole;
  title: string;
  department: string;
  badgeClass: string;
  description: string;
  canDeleteProductionEntry: boolean;
  canEditProductionEntry: boolean;
  canDeleteRollingPlan: boolean;
  canCreateRollingPlan: boolean;
  canEditRollingPlan: boolean;
  canCreateDiversion: boolean;
  canDeleteDiversion: boolean;
  canImportWorkOrders: boolean;
  canManageUsers: boolean;
  canAccessAdminPanel: boolean;
  canViewAuditLogs: boolean;
  canResetSystem: boolean;
  allowedStages: StageCode[];
  permissionsList: string[];
}

export const ROLE_CONFIGS: Record<UserRole, RoleConfig> = {
  admin: {
    role: 'admin',
    title: 'PPC Administrator',
    department: 'Production Planning & Control (PPC)',
    badgeClass: 'bg-blue-600 text-white border-blue-500',
    description: 'Master administrative authority over work orders, planning, production deletion, and system security.',
    canDeleteProductionEntry: true,
    canEditProductionEntry: true,
    canDeleteRollingPlan: true,
    canCreateRollingPlan: true,
    canEditRollingPlan: true,
    canCreateDiversion: true,
    canDeleteDiversion: true,
    canImportWorkOrders: true,
    canManageUsers: true,
    canAccessAdminPanel: true,
    canViewAuditLogs: true,
    canResetSystem: true,
    allowedStages: ['ROLLING', 'HOLLOW_HEAT_TREATMENT', 'DRAW', 'HEAT_TREATMENT', 'FINISHING'],
    permissionsList: [
      'Delete and void production logs across all stages',
      'Import and modify work orders',
      'Create, edit, and delete rolling plans and diversions',
      'Manage user accounts, roles, and security pins',
      'Full administrative control and audit trail inspection',
    ],
  },
  manager: {
    role: 'manager',
    title: 'Plant Operations Head',
    department: 'Plant Operations & Engineering',
    badgeClass: 'bg-purple-600 text-white border-purple-500',
    description: 'Executive plant oversight, rolling schedule approval, diversion authorization, and production deletion capability.',
    canDeleteProductionEntry: true,
    canEditProductionEntry: true,
    canDeleteRollingPlan: true,
    canCreateRollingPlan: true,
    canEditRollingPlan: true,
    canCreateDiversion: true,
    canDeleteDiversion: true,
    canImportWorkOrders: true,
    canManageUsers: false,
    canAccessAdminPanel: true,
    canViewAuditLogs: true,
    canResetSystem: false,
    allowedStages: ['ROLLING', 'HOLLOW_HEAT_TREATMENT', 'DRAW', 'HEAT_TREATMENT', 'FINISHING'],
    permissionsList: [
      'Authorized to delete/void erroneous production entries',
      'Approve and manage rolling plans and pipe diversions',
      'Full factory WIP and bottleneck oversight',
      'Audit log and yield compliance inspection',
    ],
  },
  rolling_incharge: {
    role: 'rolling_incharge',
    title: 'Rolling Mill In-charge',
    department: 'Hot Rolling & Piercing Mill',
    badgeClass: 'bg-amber-600 text-white border-amber-500',
    description: 'Hot piercing and rolling mill floor execution; HTC OK tracking. Restricted from deleting past records.',
    canDeleteProductionEntry: false,
    canEditProductionEntry: true,
    canDeleteRollingPlan: false,
    canCreateRollingPlan: false,
    canEditRollingPlan: false,
    canCreateDiversion: false,
    canDeleteDiversion: false,
    canImportWorkOrders: false,
    canManageUsers: false,
    canAccessAdminPanel: false,
    canViewAuditLogs: false,
    canResetSystem: false,
    allowedStages: ['ROLLING'],
    permissionsList: [
      'Log Hot Rolling production, scrap rejection & HTC OK output',
      'Edit unfinalized Rolling stage entries',
      'View active rolling plans and daily piercing targets',
      'Deletion restricted (Requires Admin or Manager approval)',
    ],
  },
  draw_operator: {
    role: 'draw_operator',
    title: 'Cold Draw Operator',
    department: 'Cold Draw Bench & Pilgering',
    badgeClass: 'bg-indigo-600 text-white border-indigo-500',
    description: 'Cold draw bench and pilgering operations logging. Restricted to Draw stage; no deletion rights.',
    canDeleteProductionEntry: false,
    canEditProductionEntry: true,
    canDeleteRollingPlan: false,
    canCreateRollingPlan: false,
    canEditRollingPlan: false,
    canCreateDiversion: false,
    canDeleteDiversion: false,
    canImportWorkOrders: false,
    canManageUsers: false,
    canAccessAdminPanel: false,
    canViewAuditLogs: false,
    canResetSystem: false,
    allowedStages: ['DRAW'],
    permissionsList: [
      'Enter Cold Draw bench production and pass yields',
      'Log draw scrap and tag mother hollow lots',
      'View Mother Hollow Available Queue for Cold Draw',
      'Deletion restricted (Requires Admin or Manager approval)',
    ],
  },
  qa_inspector: {
    role: 'qa_inspector',
    title: 'Quality & NDT Inspector',
    department: 'Quality Assurance & Metallurgical Lab',
    badgeClass: 'bg-emerald-600 text-white border-emerald-500',
    description: 'Metallurgical inspection, heat treatment clearance sign-off, and non-destructive testing verification.',
    canDeleteProductionEntry: false,
    canEditProductionEntry: true,
    canDeleteRollingPlan: false,
    canCreateRollingPlan: false,
    canEditRollingPlan: false,
    canCreateDiversion: false,
    canDeleteDiversion: false,
    canImportWorkOrders: false,
    canManageUsers: false,
    canAccessAdminPanel: false,
    canViewAuditLogs: false,
    canResetSystem: false,
    allowedStages: ['HOLLOW_HEAT_TREATMENT', 'HEAT_TREATMENT'],
    permissionsList: [
      'Log Heat Treatment & Hollow Heat Treatment clearance',
      'Inspect rejection heat lots & metallographic samples',
      'Sign off QA tags and HTC batch integrity',
      'Deletion restricted (Requires Admin or Manager approval)',
    ],
  },
  auditor: {
    role: 'auditor',
    title: 'Internal Auditor',
    department: 'Management & Audit Team',
    badgeClass: 'bg-slate-600 text-white border-slate-500',
    description: 'Independent compliance and quality verification. Purely read-only access to all production records and logs.',
    canDeleteProductionEntry: false,
    canEditProductionEntry: false,
    canDeleteRollingPlan: false,
    canCreateRollingPlan: false,
    canEditRollingPlan: false,
    canCreateDiversion: false,
    canDeleteDiversion: false,
    canImportWorkOrders: false,
    canManageUsers: false,
    canAccessAdminPanel: false,
    canViewAuditLogs: true,
    canResetSystem: false,
    allowedStages: [],
    permissionsList: [
      'Read-only inspection of work orders, WIP queues, and logs',
      'Export production reconciliation and yield audit reports',
      'Inspect complete system audit trail and user activities',
      'All modification & deletion actions strictly restricted',
    ],
  },
};

export function getRoleConfig(role?: string | null): RoleConfig {
  if (!role || !(role in ROLE_CONFIGS)) {
    return ROLE_CONFIGS.admin;
  }
  return ROLE_CONFIGS[role as UserRole];
}

export function checkRolePermission(role: string | null | undefined, action: PermissionAction, stageCode?: string): {
  allowed: boolean;
  reason?: string;
} {
  const config = getRoleConfig(role);

  switch (action) {
    case 'delete_production_entry':
      if (config.canDeleteProductionEntry) return { allowed: true };
      return {
        allowed: false,
        reason: `Deletion requires PPC Administrator or Plant Operations Head privileges. Current role: ${config.title}.`,
      };

    case 'edit_production_entry':
      if (config.role === 'auditor') {
        return { allowed: false, reason: 'Auditor role has read-only access.' };
      }
      if (config.canEditProductionEntry) {
        if (stageCode && !config.allowedStages.includes(stageCode as StageCode)) {
          return {
            allowed: false,
            reason: `${config.title} is only authorized to edit entries in: ${config.allowedStages.join(', ')}.`,
          };
        }
        return { allowed: true };
      }
      return { allowed: false, reason: 'Unauthorized to edit production entries.' };

    case 'create_production_entry':
      if (config.role === 'auditor') {
        return { allowed: false, reason: 'Auditor role has read-only access.' };
      }
      if (stageCode && !config.allowedStages.includes(stageCode as StageCode)) {
        return {
          allowed: false,
          reason: `${config.title} is assigned to ${config.allowedStages.join(', ')}. Please switch to your authorized stage.`,
        };
      }
      return { allowed: true };

    case 'delete_rolling_plan':
      if (config.canDeleteRollingPlan) return { allowed: true };
      return {
        allowed: false,
        reason: `Rolling plan deletion is restricted to Admin and Plant Manager. Current role: ${config.title}.`,
      };

    case 'create_rolling_plan':
    case 'edit_rolling_plan':
      if (config.canCreateRollingPlan) return { allowed: true };
      return {
        allowed: false,
        reason: `Rolling plan modification requires Admin or Plant Manager role. Current role: ${config.title}.`,
      };

    case 'create_diversion':
    case 'delete_diversion':
      if (config.canCreateDiversion) return { allowed: true };
      return {
        allowed: false,
        reason: `Pipe diversion operations require Admin or Plant Manager role. Current role: ${config.title}.`,
      };

    case 'import_work_orders':
      if (config.canImportWorkOrders) return { allowed: true };
      return {
        allowed: false,
        reason: `Work Order importing is restricted to PPC Administrator and Plant Head.`,
      };

    case 'manage_users':
      if (config.canManageUsers) return { allowed: true };
      return {
        allowed: false,
        reason: `User account management is strictly restricted to PPC Administrator.`,
      };

    case 'access_admin_panel':
      if (config.canAccessAdminPanel) return { allowed: true };
      return {
        allowed: false,
        reason: `Admin control panel access is restricted.`,
      };

    case 'view_audit_logs':
      if (config.canViewAuditLogs) return { allowed: true };
      return {
        allowed: false,
        reason: `Audit log view is restricted to Admin, Manager, and Auditor roles.`,
      };

    case 'system_reset':
      if (config.canResetSystem) return { allowed: true };
      return {
        allowed: false,
        reason: `System data reset is strictly restricted to PPC Administrator.`,
      };

    default:
      return { allowed: false, reason: 'Operation not permitted.' };
  }
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

  const roleConfig = getRoleConfig(user.role);

  const can = useCallback(
    (action: PermissionAction, stageCode?: string) => {
      return checkRolePermission(user.role, action, stageCode);
    },
    [user.role]
  );

  const isStageAllowed = useCallback(
    (stageCode: string): boolean => {
      if (user.role === 'admin' || user.role === 'manager') return true;
      return roleConfig.allowedStages.includes(stageCode as StageCode);
    },
    [user.role, roleConfig.allowedStages]
  );

  return {
    user,
    role: user.role,
    roleTitle: roleConfig.title,
    roleConfig,
    department: user.department || roleConfig.department,
    badgeClass: roleConfig.badgeClass,
    can,
    isStageAllowed,
    canDeleteEntry: roleConfig.canDeleteProductionEntry,
    canEditEntry: roleConfig.canEditProductionEntry,
    canDeletePlan: roleConfig.canDeleteRollingPlan,
    canCreatePlan: roleConfig.canCreateRollingPlan,
    canCreateDiversion: roleConfig.canCreateDiversion,
    canImportOrders: roleConfig.canImportWorkOrders,
    canManageUsers: roleConfig.canManageUsers,
    canAccessAdmin: roleConfig.canAccessAdminPanel,
    canViewAudit: roleConfig.canViewAuditLogs,
    isAuditor: user.role === 'auditor',
    refreshUser,
  };
}
