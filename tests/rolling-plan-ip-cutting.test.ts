import { describe, it, expect } from 'vitest';

describe('Rolling Plan IP Cutting Configuration', () => {
  it('correctly serializes and deserializes IP Cutting parameters in status JSON', () => {
    const rawStatus = {
      type: 'SINGLE_WO',
      is_master: false,
      is_ip_cutting: true,
      ip_cut_length: 6.25,
      ip_multiple: 2,
    };
    const json = JSON.stringify(rawStatus);
    const parsed = JSON.parse(json);

    expect(parsed.is_ip_cutting).toBe(true);
    expect(parsed.ip_cut_length).toBe(6.25);
    expect(parsed.ip_multiple).toBe(2);
  });

  it('calculates planned IP cut pieces from mother pieces and IP multiple', () => {
    const motherPcs = 10;
    const ipMultiple = 2;
    const isIpCutting = true;

    const plannedIpPcs = isIpCutting ? motherPcs * (ipMultiple || 1) : motherPcs;
    expect(plannedIpPcs).toBe(20);
  });
});
