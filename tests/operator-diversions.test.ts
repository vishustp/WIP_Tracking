import { describe, it, expect } from 'vitest';
import {
  getFormAccess,
  checkCanPerformAction,
  isRouteVisible,
  getDefaultPermissions,
} from '../lib/permissions';
import type { AppUserProfile } from '../lib/users/types';

describe('Operator Diversion Permissions Suite', () => {
  const drawOperator: AppUserProfile = {
    id: 'user-draw-1',
    auth_user_id: 'auth-draw-1',
    email: 'draw@rashmiseamless.com',
    name: 'Draw Bench Operator',
    employee_id: 'EMP-DRAW-01',
    group: 'user',
    role: 'draw_operator',
    role_title: 'Cold Draw Bench Operator',
    department: 'Cold Drawing',
    shift: 'Shift A',
    work_center: 'DRAW',
    allowed_stages: ['DRAW'],
    default_stage: 'DRAW',
    active: true,
    created_at: new Date().toISOString(),
  };

  const pilgerOperator: AppUserProfile = {
    id: 'user-pilger-1',
    auth_user_id: 'auth-pilger-1',
    email: 'pilger@rashmiseamless.com',
    name: 'Pilger Mill Operator',
    employee_id: 'EMP-PILGER-01',
    group: 'user',
    role: 'pilger_operator',
    role_title: 'Pilger Mill Operator',
    department: 'Pilgering',
    shift: 'Shift B',
    work_center: 'PILGER',
    allowed_stages: ['PILGER'],
    default_stage: 'PILGER',
    active: true,
    created_at: new Date().toISOString(),
  };

  const picklingOperator: AppUserProfile = {
    id: 'user-pickling-1',
    auth_user_id: 'auth-pickling-1',
    email: 'pickling@rashmiseamless.com',
    name: 'Pickling Operator',
    employee_id: 'EMP-PICKLE-01',
    group: 'user',
    role: 'qa_inspector',
    role_title: 'Pickling Tank Operator',
    department: 'Chemical Treatment',
    shift: 'Shift A',
    work_center: 'PICKLING',
    allowed_stages: ['PICKLING'],
    default_stage: 'PICKLING',
    active: true,
    created_at: new Date().toISOString(),
  };

  const auditorUser: AppUserProfile = {
    id: 'user-auditor-1',
    auth_user_id: 'auth-auditor-1',
    email: 'auditor@rashmiseamless.com',
    name: 'Internal Auditor',
    employee_id: 'EMP-AUDIT-01',
    group: 'user',
    role: 'auditor',
    role_title: 'Quality Auditor',
    department: 'Quality Assurance',
    shift: 'General',
    work_center: 'DRAW',
    allowed_stages: ['DRAW'],
    default_stage: 'DRAW',
    active: true,
    created_at: new Date().toISOString(),
  };

  describe('Default Permissions', () => {
    it('sets diversion permission to edit for DRAW work center', () => {
      const defaults = getDefaultPermissions('user', 'DRAW');
      expect(defaults.diversion).toBe('edit');
    });

    it('sets diversion permission to edit for PILGER work center', () => {
      const defaults = getDefaultPermissions('user', 'PILGER');
      expect(defaults.diversion).toBe('edit');
    });

    it('sets diversion permission to view for other work centers', () => {
      const defaults = getDefaultPermissions('user', 'PICKLING');
      expect(defaults.diversion).toBe('view');
    });
  });

  describe('Route Visibility (isRouteVisible)', () => {
    it('allows DRAW operators to see /diversions route', () => {
      expect(isRouteVisible(drawOperator, '/diversions')).toBe(true);
    });

    it('allows PILGER operators to see /diversions route', () => {
      expect(isRouteVisible(pilgerOperator, '/diversions')).toBe(true);
    });

    it('shows /diversions as view for PICKLING operator since default is view', () => {
      expect(isRouteVisible(picklingOperator, '/diversions')).toBe(true);
    });
  });

  describe('Form Access (getFormAccess for diversion)', () => {
    it('grants full editing and submission access to DRAW operator for same-work-center diversions', () => {
      const access = getFormAccess(drawOperator, 'diversion');
      expect(access.isAllowed).toBe(true);
      expect(access.mode).toBe('full');
      expect(access.canSubmit).toBe(true);
      expect(access.canEdit).toBe(true);
      expect(access.canDelete).toBe(false);
      expect(access.bannerTitle).toContain('Diversion Authorization Active');
      expect(access.bannerTitle).toContain('Cold Draw Bench');
      expect(access.bannerMessage).toContain('Cold Draw Bench');
    });

    it('grants full editing and submission access to PILGER operator for same-work-center diversions', () => {
      const access = getFormAccess(pilgerOperator, 'diversion');
      expect(access.isAllowed).toBe(true);
      expect(access.mode).toBe('full');
      expect(access.canSubmit).toBe(true);
      expect(access.canEdit).toBe(true);
      expect(access.canDelete).toBe(false);
      expect(access.bannerTitle).toContain('Diversion Authorization Active');
      expect(access.bannerTitle).toContain('Cold Pilger Mill');
      expect(access.bannerMessage).toContain('Cold Pilger Mill');
    });

    it('denies edit access to regular operators without custom permissions', () => {
      const access = getFormAccess(picklingOperator, 'diversion');
      expect(access.isAllowed).toBe(false);
      expect(access.mode).toBe('view_only');
      expect(access.canSubmit).toBe(false);
      expect(access.canEdit).toBe(false);
    });

    it('denies edit access to auditors even if assigned to DRAW', () => {
      const access = getFormAccess(auditorUser, 'diversion');
      expect(access.isAllowed).toBe(false);
      expect(access.mode).toBe('view_only');
      expect(access.canSubmit).toBe(false);
      expect(access.canEdit).toBe(false);
    });
  });

  describe('Action Execution (checkCanPerformAction create_diversion)', () => {
    it('allows DRAW operators to create diversions', () => {
      const result = checkCanPerformAction(drawOperator, 'create_diversion');
      expect(result.allowed).toBe(true);
    });

    it('allows PILGER operators to create diversions', () => {
      const result = checkCanPerformAction(pilgerOperator, 'create_diversion');
      expect(result.allowed).toBe(true);
    });

    it('disallows non-DRAW/PILGER operators without admin rights to create diversions', () => {
      const result = checkCanPerformAction(picklingOperator, 'create_diversion');
      expect(result.allowed).toBe(false);
    });

    it('respects custom permission override if admin explicitly set diversion to edit or view', () => {
      const customEditUser: AppUserProfile = {
        ...picklingOperator,
        permissions: { ...getDefaultPermissions('user', 'PICKLING'), diversion: 'edit' },
      };
      expect(checkCanPerformAction(customEditUser, 'create_diversion').allowed).toBe(true);

      const customViewDrawUser: AppUserProfile = {
        ...drawOperator,
        permissions: { ...getDefaultPermissions('user', 'DRAW'), diversion: 'view' },
      };
      expect(checkCanPerformAction(customViewDrawUser, 'create_diversion').allowed).toBe(false);
    });
  });
});
