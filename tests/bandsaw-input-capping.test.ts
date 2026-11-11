import { describe, it, expect } from 'vitest';
import { validateProductionEntry } from '@/lib/productionValidation';
import { computeFeederBalanceForWorkOrder } from '@/lib/feederValidation';
import { Row } from '@/types';

describe('Band Saw Input Quantity vs HT Quantity Capping', () => {
  it('rejects Band Saw entry when input mother pipes exceed available HT balance', () => {
    const row: any = {
      id: 'wo-1',
      work_order_no: 'WO-1001',
      stage_code: 'BAND_SAW',
      route_code: 'CDS',
      available_pcs: 10,
      balance_to_make_pcs: 10,
      l1: 6,
      l2: 6,
      avg_length: 6,
      od: 50,
      wl: 5,
      pcs: '15',
      mtr: '90',
      input_pcs: 15, // Mother pipes processed
      input_mtr: 90,
      output_pcs: 15,
      output_mtr: 90,
      remarks: '[CUTS:{"m_pcs":15,"yield":95,"items":[{"len":6,"pcs":15,"cat":"PRIME"}]}] [PCS:15]',
    };

    const errors = validateProductionEntry(row, 'BAND_SAW');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain('Band Saw input quantity (15 PCS) cannot be greater than available');
    expect(errors[0].message).toContain('10 PCS');
  });

  it('accepts Band Saw entry when input mother pipes <= available HT balance even with higher cut pieces', () => {
    // 5 mother pipes cut into 10 customer pieces (multiple = 2)
    const row: any = {
      id: 'wo-2',
      work_order_no: 'WO-1002',
      stage_code: 'BAND_SAW',
      route_code: 'CDS',
      available_pcs: 5,
      balance_to_make_pcs: 5,
      l1: 3,
      l2: 3,
      avg_length: 6,
      od: 50,
      wl: 5,
      multiple: 2,
      pcs: '10',
      mtr: '30',
      input_pcs: 5, // 5 mother pipes
      input_mtr: 30,
      output_pcs: 10, // 10 cut pieces (2 per pipe)
      output_mtr: 30,
      remarks: '[CUTS:{"m_pcs":5,"yield":100,"items":[{"len":3,"pcs":10,"cat":"PRIME"}]}] [PCS:10]',
    };

    const errors = validateProductionEntry(row, 'BAND_SAW');
    // Output pcs (10) > available mother pipes (5), but mother pipes (5) <= available (5), so this is valid!
    const bandSawFeederErrors = errors.filter((e) => e.message.includes('Band Saw input quantity'));
    expect(bandSawFeederErrors.length).toBe(0);
  });

  it('rejects Band Saw entry when available queue is 0', () => {
    const row: any = {
      id: 'wo-3',
      work_order_no: 'WO-1003',
      stage_code: 'BAND_SAW',
      route_code: 'CDS',
      available_pcs: 0,
      balance_to_make_pcs: 0,
      available_mtr: 0,
      balance_to_make_mtr: 0,
      l1: 6,
      l2: 6,
      avg_length: 6,
      od: 50,
      wl: 5,
      input_pcs: 5,
      input_mtr: 30,
      output_pcs: 5,
      output_mtr: 30,
      remarks: '[CUTS:{"m_pcs":5,"yield":95,"items":[{"len":6,"pcs":5,"cat":"PRIME"}]}] [PCS:5]',
    };

    const errors = validateProductionEntry(row, 'BAND_SAW');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.message.includes('No available feeder WIP for BAND_SAW'))).toBe(true);
  });

  it('computeFeederBalanceForWorkOrder calculates Band Saw available balance using mother pipes', () => {
    const stageMap = new Map<string, string>([
      ['HEAT_TREATMENT', 'stage-ht'],
      ['BAND_SAW', 'stage-bs'],
    ]);

    const logs = [
      // 100 HT mother pipes produced
      {
        work_order_id: 'wo-10',
        stage_id: 'stage-ht',
        output_qty: 600,
        remarks: '[PCS:100]',
      },
      // 40 mother pipes already cut into 80 pieces at Band Saw
      {
        work_order_id: 'wo-10',
        stage_id: 'stage-bs',
        input_qty: 240,
        output_qty: 240,
        remarks: '[CUTS:{"m_pcs":40,"items":[{"len":3,"pcs":80,"cat":"PRIME"}]}] [PCS:80]',
      },
    ];

    const balance = computeFeederBalanceForWorkOrder({
      workOrder: { id: 'wo-10', work_order_no: 'WO-10', l1: 6, l2: 6 },
      targetStage: 'BAND_SAW',
      routeCode: 'CDS',
      logs,
      stageCodeToId: stageMap,
    });

    // 100 HT pipes - 40 mother pipes cut = 60 mother pipes available
    expect(balance.availPcs).toBe(60);
    expect(balance.availMtr).toBe(360);
    expect(balance.feederStageCode).toBe('HEAT_TREATMENT');
  });
});
