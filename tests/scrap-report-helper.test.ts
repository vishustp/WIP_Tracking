import { describe, it, expect } from 'vitest';
import {
  extractScrapRecordsFromEntries,
  calculateScrapKpis,
  calculateStageScrapSummary,
  generateScrapReportCsv,
  filterScrapRecords,
  type ScrapRecord,
} from '../lib/reports/scrapReportHelper';
import { ProductionEntry } from '../types';

describe('Scrap Report Helper & Accounting Engine', () => {
  const mockWorkOrders = new Map<string, any>([
    [
      'WO-101',
      {
        id: 'wo-1',
        work_order_no: 'WO-101',
        customer_name: 'BHEL Trichy',
        grade: 'SA210 Gr C',
        size_od: 63.5,
        size_wt: 4.5,
      },
    ],
    [
      'WO-102',
      {
        id: 'wo-2',
        work_order_no: 'WO-102',
        customer_name: 'L&T Heavy Eng',
        grade: 'SA335 P11',
        size_od: 88.9,
        size_wt: 7.62,
      },
    ],
  ]);

  const mockEntries: ProductionEntry[] = [
    // 1. Stage Rejection at Cold Draw
    {
      id: 'entry-1',
      work_order_no: 'WO-101',
      customer_name: 'BHEL Trichy',
      route_code: 'CDS',
      stage_code: 'DRAW',
      process_date: '2026-09-25',
      od: 63.5,
      wl: 4.5,
      l1: 6.0,
      l2: 7.0,
      avg_length: 6.5,
      input_mtr: 500,
      input_pcs: 77,
      input_mt: 3.27,
      output_mtr: 460,
      output_pcs: 71,
      output_mt: 3.01,
      rejection_mtr: 40,
      rejection_pcs: 6,
      rejection_mt: 0.26,
      htc_ok_mtr: 460,
      heat_lot_no: 'H-901',
      remarks: 'Plug chatter and wall sink defects [REJ:Plug Chatter]',
      created_at: '2026-09-25T10:00:00Z',
      can_modify: true,
    },
    // 2. Band Saw Cutting with Scrap trims and < 3.0m remnant
    {
      id: 'entry-2',
      work_order_no: 'WO-101',
      customer_name: 'BHEL Trichy',
      route_code: 'CDS',
      stage_code: 'BAND_SAW',
      process_date: '2026-09-26',
      od: 63.5,
      wl: 4.5,
      l1: 6.0,
      l2: 6.0,
      avg_length: 6.0,
      input_mtr: 460,
      input_pcs: 71,
      input_mt: 3.01,
      output_mtr: 440,
      output_pcs: 73,
      output_mt: 2.88,
      rejection_mtr: 0,
      rejection_pcs: 0,
      rejection_mt: 0,
      htc_ok_mtr: 440,
      heat_lot_no: 'H-901',
      // Cut json with 15.0m scrap trimming, and a 2.5m remnant (<3.0m hard scrap floor Rule 5B), and 5.0m usable offcut (Rule 5C)
      remarks: '[CUTS:{"m_pcs":71,"yield":95.7,"offcut_m":5.0,"scrap_m":15.0,"scrap_mt":0.098,"scrap_pct":3.3,"items":[{"len":6.0,"pcs":73,"cat":"PRIME"},{"len":2.5,"pcs":1,"cat":"SCRAP_TRIM"},{"len":5.0,"pcs":1,"cat":"OFFCUT"}]}] [PCS:73]',
      created_at: '2026-09-26T11:00:00Z',
      can_modify: true,
    },
    // 3. Rolling Stage Rejection
    {
      id: 'entry-3',
      work_order_no: 'WO-102',
      customer_name: 'L&T Heavy Eng',
      route_code: 'ALLOY_CDS',
      stage_code: 'ROLLING',
      process_date: '2026-09-27',
      od: 88.9,
      wl: 7.62,
      l1: 9.0,
      l2: 10.0,
      avg_length: 9.5,
      input_mtr: 1000,
      input_pcs: 105,
      input_mt: 15.26,
      output_mtr: 950,
      output_pcs: 100,
      output_mt: 14.50,
      rejection_mtr: 50,
      rejection_pcs: 5,
      rejection_mt: 0.76,
      htc_ok_mtr: 950,
      heat_lot_no: 'L-774',
      remarks: 'Hot piercing wall eccentricity and roll fin [REJ:Eccentricity]',
      created_at: '2026-09-27T12:00:00Z',
      can_modify: true,
    },
    // 4. Good entry with zero scrap
    {
      id: 'entry-4',
      work_order_no: 'WO-101',
      customer_name: 'BHEL Trichy',
      route_code: 'CDS',
      stage_code: 'HEAT_TREATMENT',
      process_date: '2026-09-28',
      od: 63.5,
      wl: 4.5,
      l1: 6.0,
      l2: 6.0,
      avg_length: 6.0,
      input_mtr: 440,
      input_pcs: 73,
      input_mt: 2.88,
      output_mtr: 440,
      output_pcs: 73,
      output_mt: 2.88,
      rejection_mtr: 0,
      rejection_pcs: 0,
      rejection_mt: 0,
      htc_ok_mtr: 440,
      heat_lot_no: 'H-901',
      remarks: 'Normalizing cycle OK',
      created_at: '2026-09-28T09:00:00Z',
      can_modify: true,
    },
  ];

  it('extracts scrap records correctly from stage rejections and Band Saw cuts', () => {
    const scrapRecords = extractScrapRecordsFromEntries(mockEntries, mockWorkOrders);

    // Should extract 3 scrap records:
    // 1. Draw stage rejection (40m)
    // 2. Band saw cutting scrap (15m + 2.5m = 17.5m scrap, and records 5.0m usable offcut)
    // 3. Rolling stage rejection (50m)
    // Entry 4 has 0 scrap and should be excluded from scrap records list
    expect(scrapRecords.length).toBe(3);

    const drawScrap = scrapRecords.find((r) => r.stage_code === 'DRAW');
    expect(drawScrap).toBeDefined();
    expect(drawScrap?.scrap_mtr).toBe(40);
    expect(drawScrap?.scrap_pcs).toBe(6);
    expect(drawScrap?.scrap_type).toBe('STAGE_REJECTION');
    expect(drawScrap?.grade).toBe('SA210 Gr C');
    expect(drawScrap?.scrap_reason).toContain('Plug Chatter');

    const bandSawScrap = scrapRecords.find((r) => r.stage_code === 'BAND_SAW');
    expect(bandSawScrap).toBeDefined();
    expect(bandSawScrap?.scrap_mtr).toBeGreaterThan(0);
    expect(bandSawScrap?.scrap_type).toBe('BAND_SAW_CUTTING');
    expect(bandSawScrap?.usable_offcut_mtr).toBe(5.0);

    const rollScrap = scrapRecords.find((r) => r.stage_code === 'ROLLING');
    expect(rollScrap).toBeDefined();
    expect(rollScrap?.scrap_mtr).toBe(50);
    expect(rollScrap?.scrap_pcs).toBe(5);
    expect(rollScrap?.scrap_reason).toContain('Eccentricity');
  });

  it('computes accurate plant scrap KPIs across all records', () => {
    const records = extractScrapRecordsFromEntries(mockEntries, mockWorkOrders);
    const kpis = calculateScrapKpis(records);

    expect(kpis.total_records_count).toBe(3);
    expect(kpis.total_scrap_mtr).toBeGreaterThanOrEqual(105); // 40 + 15+ + 50
    expect(kpis.total_scrap_mt).toBeGreaterThan(0.9);
    expect(kpis.band_saw_scrap_mtr).toBeGreaterThan(0);
    expect(kpis.process_rejection_scrap_mtr).toBe(90); // 40 (Draw) + 50 (Rolling)
    expect(kpis.usable_offcuts_mtr).toBe(5.0);
    expect(kpis.overall_scrap_pct).toBeGreaterThan(0);
  });

  it('calculates stage scrap summary correctly', () => {
    const records = extractScrapRecordsFromEntries(mockEntries, mockWorkOrders);
    const stageSummaries = calculateStageScrapSummary(records);

    const drawSummary = stageSummaries.find((s) => s.stage_code === 'DRAW');
    expect(drawSummary).toBeDefined();
    expect(drawSummary?.total_scrap_mtr).toBe(40);

    const rollSummary = stageSummaries.find((s) => s.stage_code === 'ROLLING');
    expect(rollSummary).toBeDefined();
    expect(rollSummary?.total_scrap_mtr).toBe(50);
  });

  it('filters scrap records by stage, date, search, and scrap type', () => {
    const records = extractScrapRecordsFromEntries(mockEntries, mockWorkOrders);

    const bandSawOnly = filterScrapRecords(records, { stage: 'BAND_SAW' });
    expect(bandSawOnly.length).toBe(1);
    expect(bandSawOnly[0].stage_code).toBe('BAND_SAW');

    const rollingSearch = filterScrapRecords(records, { search: 'Eccentricity' });
    expect(rollingSearch.length).toBe(1);
    expect(rollingSearch[0].work_order_no).toBe('WO-102');

    const gradeFilter = filterScrapRecords(records, { grade: 'SA335 P11' });
    expect(gradeFilter.length).toBe(1);
    expect(gradeFilter[0].grade).toBe('SA335 P11');
  });

  it('generates valid CSV export with proper columns and values', () => {
    const records = extractScrapRecordsFromEntries(mockEntries, mockWorkOrders);
    const kpis = calculateScrapKpis(records);
    const csv = generateScrapReportCsv(records, kpis);

    expect(csv).toContain('Date,Work Center,Work Order No,Customer,Grade,OD (mm),WT (mm)');
    expect(csv).toContain('WO-101');
    expect(csv).toContain('WO-102');
    expect(csv).toContain('BHEL Trichy');
    expect(csv).toContain('SUMMARY / TOTALS');
  });
});
