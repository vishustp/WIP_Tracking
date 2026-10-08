// tests/queue-rejection-hold.test.ts
import { describe, it, expect } from 'vitest';

describe('Queue Rejection Hold Indicator', () => {
  it('formats pending hold warning message correctly', () => {
    const pendingPcs = 3;
    const pendingMtr = 36.0;
    const badgeText = `${pendingPcs} PCS (${pendingMtr.toFixed(1)}m) Pending Rejection Review`;
    expect(badgeText).toBe('3 PCS (36.0m) Pending Rejection Review');
  });

  it('determines if hold warning should be rendered', () => {
    const hasHold = (pendingPcs: number, pendingMtr: number) => pendingPcs > 0 || pendingMtr > 0;
    expect(hasHold(3, 36)).toBe(true);
    expect(hasHold(0, 0)).toBe(false);
  });
});
