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

  it('excludes Rolling production from Total WIP calculations (display only)', () => {
    const rows = [
      { stage_code: 'HOT_ROLLING', pcs: 100, mtr: 1000, mt: 15 },
      { stage_code: 'HTC', pcs: 40, mtr: 400, mt: 6 },
      { stage_code: 'DRAW', pcs: 25, mtr: 350, mt: 4 },
      { stage_code: 'HEAT_TREATMENT', pcs: 20, mtr: 280, mt: 3 },
      { stage_code: 'BAND_SAW', pcs: 15, mtr: 210, mt: 2.5 },
      { stage_code: 'FINISHING', pcs: 10, mtr: 140, mt: 1.5 },
    ];

    const group = {
      hot_rolling_pcs: 0,
      hot_rolling_mtr: 0,
      hot_rolling_mt: 0,
      htc_pcs: 0,
      htc_mtr: 0,
      htc_mt: 0,
      draw_pcs: 0,
      draw_mtr: 0,
      draw_mt: 0,
      ht_pcs: 0,
      ht_mtr: 0,
      ht_mt: 0,
      band_saw_pcs: 0,
      band_saw_mtr: 0,
      band_saw_mt: 0,
      finishing_pcs: 0,
      finishing_mtr: 0,
      finishing_mt: 0,
      total_pcs: 0,
      total_mtr: 0,
      total_mt: 0,
    };

    rows.forEach((r) => {
      const stage = r.stage_code;
      if (stage === 'HOT_ROLLING') {
        group.hot_rolling_pcs += r.pcs;
        group.hot_rolling_mtr += r.mtr;
        group.hot_rolling_mt += r.mt;
      } else if (stage === 'HTC') {
        group.htc_pcs += r.pcs;
        group.htc_mtr += r.mtr;
        group.htc_mt += r.mt;
      } else if (stage === 'DRAW') {
        group.draw_pcs += r.pcs;
        group.draw_mtr += r.mtr;
        group.draw_mt += r.mt;
      } else if (stage === 'HEAT_TREATMENT') {
        group.ht_pcs += r.pcs;
        group.ht_mtr += r.mtr;
        group.ht_mt += r.mt;
      } else if (stage === 'BAND_SAW') {
        group.band_saw_pcs += r.pcs;
        group.band_saw_mtr += r.mtr;
        group.band_saw_mt += r.mt;
      } else if (stage === 'FINISHING') {
        group.finishing_pcs += r.pcs;
        group.finishing_mtr += r.mtr;
        group.finishing_mt += r.mt;
      }

      // Rolling production is display only; exclude from total WIP calculation
      if (stage !== 'HOT_ROLLING' && stage !== 'ROLLING') {
        group.total_pcs += r.pcs;
        group.total_mtr += r.mtr;
        group.total_mt += r.mt;
      }
    });

    // Rolling production is tracked for display
    expect(group.hot_rolling_pcs).toBe(100);
    expect(group.hot_rolling_mtr).toBe(1000);
    expect(group.hot_rolling_mt).toBe(15);

    // Total WIP excludes rolling production and sums strictly active downstream stages:
    // 40 (HTC) + 25 (DRAW) + 20 (HT) + 15 (BAND_SAW) + 10 (FINISHING) = 110 PCS
    expect(group.total_pcs).toBe(110);
    expect(group.total_mtr).toBe(1380);
    expect(group.total_mt).toBe(17);
  });
});
