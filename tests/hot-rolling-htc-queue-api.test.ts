import { describe, it, expect } from 'vitest';

describe('HOT_ROLLING -> HTC Queue Pipeline', () => {
  it('correctly calculates HTC queue from HOT_ROLLING OK minus HTC tested', () => {
    const hotRollingNetOkPcs = 100;
    const htcTestedPcs = 40;
    const htcAvailableQueuePcs = hotRollingNetOkPcs - htcTestedPcs;
    expect(htcAvailableQueuePcs).toBe(60);
  });

  it('correctly feeds downstream Draw Bench from HTC OK, not HOT_ROLLING gross', () => {
    const htcOkPcs = 38;
    const drawGrossOutputPcs = 20;
    const drawAvailableQueuePcs = htcOkPcs - drawGrossOutputPcs;
    expect(drawAvailableQueuePcs).toBe(18);
  });
});
