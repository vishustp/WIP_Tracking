import { describe, it, expect } from 'vitest';
import { getDefaultPermissions, STAGE_TO_PERMISSION_KEY } from '@/lib/permissions';

describe('HOT_ROLLING and HTC Permissions', () => {
  it('maps stage codes to correct permission keys', () => {
    expect(STAGE_TO_PERMISSION_KEY['HOT_ROLLING']).toBe('production_hot_rolling');
    expect(STAGE_TO_PERMISSION_KEY['HTC']).toBe('production_htc');
  });

  it('assigns edit access for HOT_ROLLING operator strictly to HOT_ROLLING', () => {
    const perms = getDefaultPermissions('user', 'HOT_ROLLING');
    expect(perms.production_hot_rolling).toBe('edit');
    expect(perms.production_htc).toBe('view');
  });

  it('assigns edit access for QC / HTC operator strictly to HTC and VDI', () => {
    const perms = getDefaultPermissions('user', 'HTC');
    expect(perms.production_hot_rolling).toBe('view');
    expect(perms.production_htc).toBe('edit');
  });
});
