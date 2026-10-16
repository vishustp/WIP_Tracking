import { describe, it, expect } from 'vitest';
import { STAGE_CODES, type StageCode } from '@/types';
import type { DailyPlanWorkCenter } from '@/types/dailyPlanning';

describe('StageCode and DailyPlanWorkCenter types', () => {
  it('supports HOT_ROLLING and HTC in STAGE_CODES', () => {
    expect(STAGE_CODES).toContain('HOT_ROLLING');
    expect(STAGE_CODES).toContain('HTC');
  });

  it('supports HOT_ROLLING and HTC stage codes', () => {
    const hotRollingStage: StageCode = 'HOT_ROLLING';
    const htcStage: StageCode = 'HTC';
    expect(hotRollingStage).toBe('HOT_ROLLING');
    expect(htcStage).toBe('HTC');
  });

  it('supports HOT_ROLLING and HTC daily plan work centers', () => {
    const hotRollingWc: DailyPlanWorkCenter = 'HOT_ROLLING';
    const htcWc: DailyPlanWorkCenter = 'HTC';
    expect(hotRollingWc).toBe('HOT_ROLLING');
    expect(htcWc).toBe('HTC');
  });
});
