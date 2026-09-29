import { describe, it, expect } from 'vitest';
import {
  isRouteVisible,
  isRouteVisibleForGroup,
  isUserAuthorizedForStage,
  checkCanEdit,
  checkCanDelete,
  checkCanCreate,
  getDefaultPermissions,
  getFormAccess,
} from '../lib/permissions';
import type { AppUserProfile } from '../lib/users/types';

describe('Permissions & Form Visibility Suite', () => {
  const finishingUser: AppUserProfile = {
    id: 'user-finishing-1',
    auth_user_id: 'auth-finishing-1',
    email: 'finishing@rashmiseamless.com',
    name: 'Sayan Datta',
    employee_id: 'EMP-788',
    group: 'user',
    role: 'finishing_operator',
    role_title: 'Finishing & NDT Operator',
    department: 'Finishing & NDT Inspection',
    shift: 'Shift A',
    work_center: 'FINISHING',
    allowed_stages: ['FINISHING', 'BAND_SAW'],
    default_stage: 'FINISHING',
    permissions: {
      work_order: 'view',
      rolling_plan: 'view',
      diversion: 'edit',
      excel_import: 'none',
      production_finishing: 'edit',
      production_band_saw: 'edit',
      reports: 'view',
      admin_panel: 'none',
    },
    active: true,
    created_at: new Date().toISOString(),
  };

  const bandSawUser: AppUserProfile = {
    id: 'user-bandsaw-1',
    auth_user_id: 'auth-bandsaw-1',
    email: 'bandsaw@rashmiseamless.com',
    name: 'Band Saw Operator',
    employee_id: 'EMP-789',
    group: 'user',
    role: 'band_saw_operator',
    role_title: 'Band Saw Operator',
    department: 'Band Saw Station',
    shift: 'Shift A',
    work_center: 'BAND_SAW',
    allowed_stages: ['BAND_SAW', 'FINISHING'],
    default_stage: 'BAND_SAW',
    active: true,
    created_at: new Date().toISOString(),
  };

  describe('Requirement 1: Granular Route Visibility (isRouteVisible)', () => {
    it('makes /work-orders and /rolling-plans visible when permission is "view"', () => {
      expect(isRouteVisible(finishingUser, '/work-orders')).toBe(true);
      expect(isRouteVisible(finishingUser, '/rolling-plans')).toBe(true);
    });

    it('makes /diversions visible when permission is "edit"', () => {
      expect(isRouteVisible(finishingUser, '/diversions')).toBe(true);
    });

    it('hides /excel-import and /admin when permission is "none"', () => {
      expect(isRouteVisible(finishingUser, '/excel-import')).toBe(false);
      expect(isRouteVisible(finishingUser, '/admin')).toBe(false);
    });

    it('allows access to production and reports for finishing user', () => {
      expect(isRouteVisible(finishingUser, '/production')).toBe(true);
      expect(isRouteVisible(finishingUser, '/band-saw')).toBe(true);
      expect(isRouteVisible(finishingUser, '/reports/wip')).toBe(true);
      expect(isRouteVisible(finishingUser, '/reports/tracking')).toBe(true);
      expect(isRouteVisible(finishingUser, '/reports/process-sheet')).toBe(true);
      expect(isRouteVisible(finishingUser, '/reports/pending-orders')).toBe(true);
      expect(isRouteVisible(finishingUser, '/reports/rolling-plans')).toBe(true);
      expect(isRouteVisible(finishingUser, '/reports/scrap')).toBe(true);
      expect(isRouteVisible(finishingUser, '/order-priority')).toBe(true);
    });
  });

  describe('Requirement 2: Mutual Permissions for Band Saw and Finishing', () => {
    it('grants a Finishing operator authorization to work on both FINISHING and BAND_SAW', () => {
      expect(isUserAuthorizedForStage(finishingUser, 'FINISHING')).toBe(true);
      expect(isUserAuthorizedForStage(finishingUser, 'BAND_SAW')).toBe(true);
    });

    it('grants a Band Saw operator authorization to work on both BAND_SAW and FINISHING', () => {
      expect(isUserAuthorizedForStage(bandSawUser, 'BAND_SAW')).toBe(true);
      expect(isUserAuthorizedForStage(bandSawUser, 'FINISHING')).toBe(true);
    });

    it('denies a Finishing operator access to ROLLING or DRAW unless explicitly permitted', () => {
      expect(isUserAuthorizedForStage(finishingUser, 'ROLLING')).toBe(false);
      expect(isUserAuthorizedForStage(finishingUser, 'DRAW')).toBe(false);
    });

    it('allows a Finishing operator to edit both FINISHING and BAND_SAW entries', () => {
      const editFinishing = checkCanEdit(finishingUser, 'FINISHING');
      expect(editFinishing.allowed).toBe(true);

      const editBandSaw = checkCanEdit(finishingUser, 'BAND_SAW');
      expect(editBandSaw.allowed).toBe(true);
    });

    it('allows a Band Saw operator to edit both BAND_SAW and FINISHING entries', () => {
      const editBandSaw = checkCanEdit(bandSawUser, 'BAND_SAW');
      expect(editBandSaw.allowed).toBe(true);

      const editFinishing = checkCanEdit(bandSawUser, 'FINISHING');
      expect(editFinishing.allowed).toBe(true);
    });

    it('provides mutual edit access in getDefaultPermissions for BAND_SAW and FINISHING', () => {
      const finishingDefaults = getDefaultPermissions('user', 'FINISHING');
      expect(finishingDefaults.production_finishing).toBe('edit');
      expect(finishingDefaults.production_band_saw).toBe('edit');

      const bandSawDefaults = getDefaultPermissions('user', 'BAND_SAW');
      expect(bandSawDefaults.production_band_saw).toBe('edit');
      expect(bandSawDefaults.production_finishing).toBe('edit');
    });

    it('resolves FormAccessResult with mutual editing access for Band Saw', () => {
      const access = getFormAccess(finishingUser, 'production_entry', 'BAND_SAW');
      expect(access.isAllowed).toBe(true);
      expect(access.canEdit).toBe(true);
    });

    it('resolves FormAccessResult with full edit access for Diversion Plan form', () => {
      const access = getFormAccess(finishingUser, 'diversion');
      expect(access.isAllowed).toBe(true);
      expect(access.mode).toBe('full');
      expect(access.canSubmit).toBe(true);
      expect(access.canEdit).toBe(true);
    });
  });

  describe('Joint Furnace Work Centers Rule', () => {
    const furnaceUser: AppUserProfile = {
      id: 'user-furnace-1',
      auth_user_id: 'auth-furnace-1',
      email: 'furnace@rashmiseamless.com',
      name: 'Furnace Incharge',
      employee_id: 'EMP-790',
      group: 'user',
      role: 'rolling_incharge',
      role_title: 'Furnace Incharge',
      department: 'Heat Treatment',
      shift: 'Shift A',
      work_center: 'HEAT_TREATMENT',
      allowed_stages: ['HOLLOW_HEAT_TREATMENT', 'HEAT_TREATMENT'],
      default_stage: 'HEAT_TREATMENT',
      active: true,
      created_at: new Date().toISOString(),
    };

    it('grants mutual access between HOLLOW_HEAT_TREATMENT and HEAT_TREATMENT', () => {
      expect(isUserAuthorizedForStage(furnaceUser, 'HEAT_TREATMENT')).toBe(true);
      expect(isUserAuthorizedForStage(furnaceUser, 'HOLLOW_HEAT_TREATMENT')).toBe(true);
      expect(checkCanEdit(furnaceUser, 'HOLLOW_HEAT_TREATMENT').allowed).toBe(true);
    });
  });
});
