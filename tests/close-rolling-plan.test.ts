import { describe, it, expect } from 'vitest';
import { checkCanCloseRollingPlan } from '@/lib/permissions';
import { AppUserProfile } from '@/lib/users/types';

describe('Close Rolling Plan Authorization & Permission Logic', () => {
  it('allows Admin users to close rolling plans', () => {
    const adminUser = {
      id: 'admin-1',
      name: 'System Admin',
      email: 'admin@plant.com',
      role: 'admin',
      group: 'admin',
    } as unknown as AppUserProfile;
    expect(checkCanCloseRollingPlan(adminUser)).toBe(true);
  });

  it('allows Super User to close rolling plans', () => {
    const superUser = {
      id: 'su-1',
      name: 'Plant Manager',
      email: 'manager@plant.com',
      role: 'manager',
      group: 'super_user',
    } as unknown as AppUserProfile;
    expect(checkCanCloseRollingPlan(superUser)).toBe(true);
  });

  it('allows PPC users to close rolling plans', () => {
    const ppcUser1 = {
      id: 'ppc-1',
      name: 'PPC Planner',
      email: 'ppc@plant.com',
      role: 'ppc',
      group: 'user',
      work_center: 'PPC',
    } as unknown as AppUserProfile;
    expect(checkCanCloseRollingPlan(ppcUser1)).toBe(true);

    const ppcUserWithPerms = {
      id: 'ppc-2',
      name: 'PPC Officer',
      email: 'planner@plant.com',
      role: 'user',
      group: 'user',
      permissions: {
        rolling_plan: 'edit',
      },
    } as unknown as AppUserProfile;
    expect(checkCanCloseRollingPlan(ppcUserWithPerms)).toBe(true);
  });

  it('allows Hotmill operators to close rolling plans', () => {
    const hotmillUser1 = {
      id: 'hm-1',
      name: 'Hot Rolling Operator',
      email: 'hotroll@plant.com',
      role: 'user',
      group: 'user',
      work_center: 'HOT_ROLLING',
      default_stage: 'HOT_ROLLING',
      allowed_stages: ['HOT_ROLLING'],
    } as unknown as AppUserProfile;
    expect(checkCanCloseRollingPlan(hotmillUser1)).toBe(true);

    const hotmillUserWithCustomPerms = {
      id: 'hm-2',
      name: 'Hotmill Millwright',
      email: 'mill@plant.com',
      role: 'user',
      group: 'user',
      permissions: {
        production_hot_rolling: 'edit',
      },
    } as unknown as AppUserProfile;
    expect(checkCanCloseRollingPlan(hotmillUserWithCustomPerms)).toBe(true);
  });

  it('denies non-Hotmill operators without PPC/Admin authority', () => {
    const drawOperator = {
      id: 'draw-1',
      name: 'Draw Bench Operator',
      email: 'draw@plant.com',
      role: 'operator',
      group: 'user',
      work_center: 'DRAW',
      default_stage: 'DRAW',
      allowed_stages: ['DRAW'],
      permissions: {
        production_draw: 'edit',
        rolling_plan: 'view',
      },
    } as unknown as AppUserProfile;
    expect(checkCanCloseRollingPlan(drawOperator)).toBe(false);

    const auditorUser = {
      id: 'audit-1',
      name: 'Quality Auditor',
      email: 'auditor@plant.com',
      role: 'auditor',
      group: 'user',
      work_center: 'ALL',
      permissions: {
        rolling_plan: 'view',
        production_hot_rolling: 'view',
      },
    } as unknown as AppUserProfile;
    expect(checkCanCloseRollingPlan(auditorUser)).toBe(false);
  });
});
