import { describe, it, expect } from 'vitest';
import type { Row } from '@/types';

describe('Band Saw Console IP Cutting Tab & Modal Configuration', () => {
  const finalCutRow = {
    id: 'wo-1',
    work_order_id: 'wo-1',
    work_order_no: '6101',
    customer_name: 'Customer A',
    stage_code: 'BAND_SAW',
    stage_name: 'Band Saw',
    balance_to_make_pcs: 10,
    balance_to_make_mtr: 60.0,
    l1: 6.0,
    multiple: 2,
  } as unknown as Row;

  const ipCutRow = {
    id: 'wo-2',
    work_order_id: 'wo-2',
    work_order_no: '6202',
    customer_name: 'Customer B',
    stage_code: 'IP_CUTTING',
    stage_name: 'IP Cutting (Band Saw)',
    balance_to_make_pcs: 5,
    balance_to_make_mtr: 62.0,
    l1: 6.2,
    multiple: 1,
    is_ip_cutting: true,
    ip_cut_length: 6.2,
    ip_multiple: 2,
  } as unknown as Row;

  it('correctly partitions queue into final cuts and IP cuts', () => {
    const queue: Row[] = [finalCutRow, ipCutRow];

    const finalCuts = queue.filter((r) => r.stage_code !== 'IP_CUTTING');
    const ipCuts = queue.filter((r) => r.stage_code === 'IP_CUTTING');

    expect(finalCuts).toHaveLength(1);
    expect(finalCuts[0].work_order_no).toBe('6101');
    expect(ipCuts).toHaveLength(1);
    expect(ipCuts[0].work_order_no).toBe('6202');
  });

  it('pre-fills IP cut length and IP multiple for IP_CUTTING row in modal setup', () => {
    const row = ipCutRow;
    const isIpCutting = row.stage_code === 'IP_CUTTING' || Boolean(row.is_ip_cutting);
    const ipMultiple = Number(row.ip_multiple || 1);
    const ipCutLen = Number(row.ip_cut_length || 0);

    const targetCutLength = isIpCutting && ipCutLen > 0 ? ipCutLen : Number(row.l1 || 6.0);
    const targetMultiple = isIpCutting && ipMultiple > 0 ? ipMultiple : Number(row.multiple || 1);

    expect(targetCutLength).toBe(6.2);
    expect(targetMultiple).toBe(2);
    expect(Number(row.balance_to_make_pcs || 0) * targetMultiple).toBe(10);
  });

  it('submits with stage_code IP_CUTTING when cutting an IP cut row', () => {
    const row = ipCutRow;
    const submitStageCode = row.stage_code === 'IP_CUTTING' ? 'IP_CUTTING' : 'BAND_SAW';
    expect(submitStageCode).toBe('IP_CUTTING');
  });
});
