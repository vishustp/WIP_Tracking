import { describe, it, expect } from 'vitest';
import type { StageCode, Row } from '@/types';
import { STAGE_CODES } from '@/types';

describe('IP Cutting Schema & Types', () => {
  it('recognizes IP_CUTTING as a valid StageCode and Row property', () => {
    expect(STAGE_CODES).toContain('IP_CUTTING');
    const stage: StageCode = 'IP_CUTTING';
    expect(stage).toBe('IP_CUTTING');

    const row: Partial<Row> = {
      is_ip_cutting: true,
      ip_cut_length: 6.25,
      ip_multiple: 2,
    };
    expect(row.is_ip_cutting).toBe(true);
    expect(row.ip_cut_length).toBe(6.25);
    expect(row.ip_multiple).toBe(2);
  });
});
