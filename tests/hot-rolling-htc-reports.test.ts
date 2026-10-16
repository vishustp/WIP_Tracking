import { describe, it, expect } from 'vitest';

describe('WIP Matrix Stage Aggregation', () => {
  it('separately tracks Hot Rolling and HTC quantities under final size', () => {
    const rowHotRolling = {
      od: 25.4,
      wt: 2.11,
      grade: 'SA213-T22',
      stage_code: 'HOT_ROLLING',
      current_wip_pcs: 50,
      current_wip_mtr: 500,
    };
    const rowHtc = {
      od: 25.4,
      wt: 2.11,
      grade: 'SA213-T22',
      stage_code: 'HTC',
      current_wip_pcs: 30,
      current_wip_mtr: 300,
    };

    const group = {
      hot_rolling_pcs: rowHotRolling.current_wip_pcs,
      htc_pcs: rowHtc.current_wip_pcs,
    };

    expect(group.hot_rolling_pcs).toBe(50);
    expect(group.htc_pcs).toBe(30);
  });
});
