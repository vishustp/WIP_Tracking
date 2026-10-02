import { describe, it, expect } from 'vitest';
import {
  calculateAgingSeverity,
  calculateDaysStuck,
  determineStageEffectiveActivityDate,
  computeAgingReportRows,
  computeAgingKpis,
  filterAgingRows,
  AGING_STAGES,
  type RawWipRow,
  type RawProductionLog,
  type RawQcInspection,
  type RawRollingPlan,
  type RawWorkOrder,
  type RawRouteStage,
} from '../lib/reports/agingReportHelper';

describe('WIP Aging & Bottlenecks Calculation Engine', () => {
  describe('calculateAgingSeverity', () => {
    it('categorizes dwell times <= 2 days as NORMAL', () => {
      expect(calculateAgingSeverity(0)).toBe('NORMAL');
      expect(calculateAgingSeverity(1)).toBe('NORMAL');
      expect(calculateAgingSeverity(2)).toBe('NORMAL');
    });

    it('categorizes dwell times 3 to 5 days as WARNING', () => {
      expect(calculateAgingSeverity(3)).toBe('WARNING');
      expect(calculateAgingSeverity(4)).toBe('WARNING');
      expect(calculateAgingSeverity(5)).toBe('WARNING');
    });

    it('categorizes dwell times > 5 days as CRITICAL', () => {
      expect(calculateAgingSeverity(6)).toBe('CRITICAL');
      expect(calculateAgingSeverity(14)).toBe('CRITICAL');
      expect(calculateAgingSeverity(45)).toBe('CRITICAL');
    });
  });

  describe('calculateDaysStuck', () => {
    it('calculates calendar difference accurately', () => {
      const asOf = new Date('2026-10-02T12:00:00Z');
      expect(calculateDaysStuck('2026-10-02', asOf)).toBe(0);
      expect(calculateDaysStuck('2026-10-01', asOf)).toBe(1);
      expect(calculateDaysStuck('2026-09-30', asOf)).toBe(2);
      expect(calculateDaysStuck('2026-09-27', asOf)).toBe(5);
      expect(calculateDaysStuck('2026-09-20', asOf)).toBe(12);
    });

    it('clamps future dates to 0 days stuck', () => {
      const asOf = new Date('2026-10-02T12:00:00Z');
      expect(calculateDaysStuck('2026-10-05', asOf)).toBe(0);
    });
  });

  describe('determineStageEffectiveActivityDate', () => {
    const routeStages: RawRouteStage[] = [
      { route_id: 'R1', stage_id: 'S_ROLL', sequence_no: 1, stage_code: 'ROLLING' },
      { route_id: 'R1', stage_id: 'S_DRAW', sequence_no: 2, stage_code: 'DRAW' },
      { route_id: 'R1', stage_id: 'S_HT', sequence_no: 3, stage_code: 'HEAT_TREATMENT' },
      { route_id: 'R1', stage_id: 'S_SAW', sequence_no: 4, stage_code: 'BAND_SAW' },
      { route_id: 'R1', stage_id: 'S_VDI', sequence_no: 5, stage_code: 'VDI' },
      { route_id: 'R1', stage_id: 'S_FIN', sequence_no: 6, stage_code: 'FINISHING' },
    ];

    it('uses upstream completion date when no production has happened at current stage yet', () => {
      // Material arrived at Band Saw from Heat Treatment on 2026-09-25.
      // Nothing has been cut at Band Saw yet.
      const prodLogs: RawProductionLog[] = [
        { work_order_id: 'WO1', stage_id: 'S_ROLL', process_date: '2026-09-20' },
        { work_order_id: 'WO1', stage_id: 'S_DRAW', process_date: '2026-09-22' },
        { work_order_id: 'WO1', stage_id: 'S_HT', process_date: '2026-09-25' },
      ];

      const effDate = determineStageEffectiveActivityDate({
        workOrderId: 'WO1',
        routeId: 'R1',
        currentStageId: 'S_SAW',
        currentStageCode: 'BAND_SAW',
        currentStageSeq: 4,
        routeStages,
        productionLogs: prodLogs,
        qcInspections: [],
        rollingPlanDate: '2026-09-18',
        workOrderCreatedDate: '2026-09-15',
      });

      expect(effDate).toBe('2026-09-25');
    });

    it('uses latest of current activity date and upstream inflow date when partial production occurred', () => {
      // Partial cutting happened on 2026-09-28, then additional HT batch arrived on 2026-09-30
      const prodLogs: RawProductionLog[] = [
        { work_order_id: 'WO1', stage_id: 'S_HT', process_date: '2026-09-30' },
        { work_order_id: 'WO1', stage_id: 'S_SAW', process_date: '2026-09-28' },
      ];

      const effDate = determineStageEffectiveActivityDate({
        workOrderId: 'WO1',
        routeId: 'R1',
        currentStageId: 'S_SAW',
        currentStageCode: 'BAND_SAW',
        currentStageSeq: 4,
        routeStages,
        productionLogs: prodLogs,
        qcInspections: [],
        rollingPlanDate: '2026-09-18',
        workOrderCreatedDate: '2026-09-15',
      });

      // The latest event affecting Band Saw WIP is 2026-09-30
      expect(effDate).toBe('2026-09-30');
    });

    it('properly reads inspection date from qc_inspections for VDI stage', () => {
      const qcInspections: RawQcInspection[] = [
        { work_order_id: 'WO1', inspection_date: '2026-09-29' },
      ];
      const prodLogs: RawProductionLog[] = [
        { work_order_id: 'WO1', stage_id: 'S_SAW', process_date: '2026-09-28' },
      ];

      const effDate = determineStageEffectiveActivityDate({
        workOrderId: 'WO1',
        routeId: 'R1',
        currentStageId: 'S_VDI',
        currentStageCode: 'VDI',
        currentStageSeq: 5,
        routeStages,
        productionLogs: prodLogs,
        qcInspections,
        rollingPlanDate: '2026-09-18',
        workOrderCreatedDate: '2026-09-15',
      });

      expect(effDate).toBe('2026-09-29');
    });

    it('falls back to rolling plan date if no production logs exist anywhere upstream', () => {
      const effDate = determineStageEffectiveActivityDate({
        workOrderId: 'WO2',
        routeId: 'R1',
        currentStageId: 'S_DRAW',
        currentStageCode: 'DRAW',
        currentStageSeq: 2,
        routeStages,
        productionLogs: [],
        qcInspections: [],
        rollingPlanDate: '2026-09-20',
        workOrderCreatedDate: '2026-09-15',
      });

      expect(effDate).toBe('2026-09-20');
    });

    it('falls back to work order creation date if no rolling plan date exists', () => {
      const effDate = determineStageEffectiveActivityDate({
        workOrderId: 'WO3',
        routeId: 'R1',
        currentStageId: 'S_DRAW',
        currentStageCode: 'DRAW',
        currentStageSeq: 2,
        routeStages,
        productionLogs: [],
        qcInspections: [],
        rollingPlanDate: null,
        workOrderCreatedDate: '2026-09-15T08:00:00Z',
      });

      expect(effDate).toBe('2026-09-15');
    });
  });

  describe('computeAgingReportRows', () => {
    const routeStages: RawRouteStage[] = [
      { route_id: 'R1', stage_id: 'S_ROLL', sequence_no: 1, stage_code: 'ROLLING' },
      { route_id: 'R1', stage_id: 'S_DRAW', sequence_no: 2, stage_code: 'DRAW' },
      { route_id: 'R1', stage_id: 'S_HT', sequence_no: 3, stage_code: 'HEAT_TREATMENT' },
      { route_id: 'R1', stage_id: 'S_SAW', sequence_no: 4, stage_code: 'BAND_SAW' },
      { route_id: 'R1', stage_id: 'S_VDI', sequence_no: 5, stage_code: 'VDI' },
      { route_id: 'R1', stage_id: 'S_FIN', sequence_no: 6, stage_code: 'FINISHING' },
    ];

    const workOrders: RawWorkOrder[] = [
      {
        id: 'WO_6430',
        work_order_no: '6430',
        customer_name: 'Tubes India',
        grade: 'ASTM A106 Gr B',
        size_od: 60.3,
        size_wt: 3.91,
        l1: 6.0,
        l2: 6.0,
        created_at: '2026-09-20T00:00:00Z',
      },
      {
        id: 'WO_6349',
        work_order_no: '6349',
        customer_name: 'Boiler Corp',
        grade: 'ASME SA210 Gr C',
        size_od: 63.5,
        size_wt: 5.2,
        l1: 6.0,
        l2: 6.0,
        created_at: '2026-09-10T00:00:00Z',
      },
      {
        id: 'WO_STUCK',
        work_order_no: '9999',
        customer_name: 'Stalled Refinery',
        grade: 'ASTM A335 P11',
        size_od: 88.9,
        size_wt: 7.62,
        l1: 6.0,
        l2: 6.0,
        created_at: '2026-08-01T00:00:00Z',
      },
    ];

    const rawWip: RawWipRow[] = [
      {
        work_order_id: 'WO_6430',
        work_order_no: '6430',
        customer_name: 'Tubes India',
        route_id: 'R1',
        route_code: 'CDS',
        route_name: 'Standard CDS',
        stage_id: 'S_VDI',
        stage_code: 'VDI',
        stage_name: 'Visual Dimension Inspection',
        sequence_no: 5,
        current_wip: 4486.1,
        current_wip_pcs: 748,
        current_wip_mt: 24.39,
        size_od: 60.3,
        size_wt: 3.91,
      },
      {
        work_order_id: 'WO_6349',
        work_order_no: '6349',
        customer_name: 'Boiler Corp',
        route_id: 'R1',
        route_code: 'CDS',
        route_name: 'Standard CDS',
        stage_id: 'S_SAW',
        stage_code: 'BAND_SAW',
        stage_name: 'Band Saw Cutting',
        sequence_no: 4,
        current_wip: 4060,
        current_wip_pcs: 676,
        current_wip_mt: 30.35,
        size_od: 63.5,
        size_wt: 5.2,
      },
      {
        work_order_id: 'WO_STUCK',
        work_order_no: '9999',
        customer_name: 'Stalled Refinery',
        route_id: 'R1',
        route_code: 'CDS',
        route_name: 'Standard CDS',
        stage_id: 'S_DRAW',
        stage_code: 'DRAW',
        stage_name: 'Cold Draw Bench',
        sequence_no: 2,
        current_wip: 1200,
        current_wip_pcs: 200,
        current_wip_mt: 18.3,
        size_od: 88.9,
        size_wt: 7.62,
      },
    ];

    const prodLogs: RawProductionLog[] = [
      // WO 6430 Band Saw cut on Oct 01
      { work_order_id: 'WO_6430', stage_id: 'S_SAW', process_date: '2026-10-01' },
      // WO 6349 HT heat-treated on Sep 28 (4 days before Oct 02)
      { work_order_id: 'WO_6349', stage_id: 'S_HT', process_date: '2026-09-28' },
      // WO 9999 rolled on Sep 20 (12 days before Oct 02)
      { work_order_id: 'WO_STUCK', stage_id: 'S_ROLL', process_date: '2026-09-20' },
    ];

    const qcInspections: RawQcInspection[] = [
      { work_order_id: 'WO_6430', inspection_date: '2026-09-30' },
    ];

    it('correctly maps size_od, size_wt, grade, and days_stuck', () => {
      const asOf = new Date('2026-10-02T12:00:00Z');
      const rows = computeAgingReportRows({
        wipRows: rawWip,
        workOrders,
        productionLogs: prodLogs,
        qcInspections,
        rollingPlans: [],
        routeStages,
        acknowledgements: [],
        asOfDate: asOf,
      });

      expect(rows).toHaveLength(3);

      // Highest days_stuck comes first
      const stuckRow = rows[0];
      expect(stuckRow.work_order_no).toBe('9999');
      expect(stuckRow.stage_code).toBe('DRAW');
      expect(stuckRow.grade).toBe('ASTM A335 P11');
      expect(stuckRow.od).toBe(88.9);
      expect(stuckRow.wt).toBe(7.62);
      expect(stuckRow.days_stuck).toBe(12);
      expect(stuckRow.severity).toBe('CRITICAL');

      const warnRow = rows[1];
      expect(warnRow.work_order_no).toBe('6349');
      expect(warnRow.stage_code).toBe('BAND_SAW');
      expect(warnRow.grade).toBe('ASME SA210 Gr C');
      expect(warnRow.od).toBe(63.5);
      expect(warnRow.wt).toBe(5.2);
      expect(warnRow.days_stuck).toBe(4);
      expect(warnRow.severity).toBe('WARNING');

      const normalRow = rows[2];
      expect(normalRow.work_order_no).toBe('6430');
      expect(normalRow.stage_code).toBe('VDI');
      expect(normalRow.grade).toBe('ASTM A106 Gr B');
      expect(normalRow.od).toBe(60.3);
      expect(normalRow.wt).toBe(3.91);
      expect(normalRow.days_stuck).toBe(1);
      expect(normalRow.severity).toBe('NORMAL');
    });

    it('correctly reports aging on Draw Bench when partial batch (10 pcs) was left behind while 90 pcs continued downstream', () => {
      // Scenario:
      // 100 rolled on Sep 28
      // Draw Bench drew 90 on Sep 28 (10 left behind on DB)
      // HT processed 90 on Sep 30 (0 left on HT)
      // Finishing finished 90 on Oct 01 (0 left on Finishing)
      // As of Oct 02 (4 days since DB last touched the 10 pcs):
      // Only Draw Bench has active WIP, and its dwell time is 4 days (>3 days => WARNING/Aged).
      const asOf = new Date('2026-10-02T12:00:00Z');
      const testWo: RawWorkOrder = {
        id: 'WO_SPLIT',
        work_order_no: '7777',
        customer_name: 'Boiler Client',
        grade: 'ASTM A106 Gr B',
        size_od: 60.3,
        size_wt: 3.91,
        created_at: '2026-09-25T00:00:00Z',
      };

      const testWip: RawWipRow[] = [
        {
          work_order_id: 'WO_SPLIT',
          work_order_no: '7777',
          route_id: 'R1',
          stage_id: 'S_DRAW',
          stage_code: 'DRAW',
          stage_name: 'Cold Draw Bench',
          sequence_no: 2,
          current_wip: 60, // 10 pieces left
          current_wip_pcs: 10,
          current_wip_mt: 0.33,
          size_od: 60.3,
          size_wt: 3.91,
        },
        // HT and Finishing have 0 WIP (fully processed the 90 pcs)
      ];

      const testLogs: RawProductionLog[] = [
        { work_order_id: 'WO_SPLIT', stage_id: 'S_ROLL', process_date: '2026-09-28' },
        { work_order_id: 'WO_SPLIT', stage_id: 'S_DRAW', process_date: '2026-09-28' },
        { work_order_id: 'WO_SPLIT', stage_id: 'S_HT', process_date: '2026-09-30' },
        { work_order_id: 'WO_SPLIT', stage_id: 'S_FIN', process_date: '2026-10-01' },
      ];

      const rows = computeAgingReportRows({
        wipRows: testWip,
        workOrders: [testWo],
        productionLogs: testLogs,
        qcInspections: [],
        rollingPlans: [],
        routeStages,
        asOfDate: asOf,
      });

      expect(rows).toHaveLength(1);
      const dbRow = rows[0];
      expect(dbRow.work_order_no).toBe('7777');
      expect(dbRow.stage_code).toBe('DRAW');
      expect(dbRow.current_wip_pcs).toBe(10);
      // Last activity at Draw Bench was Sep 28 (downstream HT/Finishing logs do NOT reset DB's stagnation clock)
      expect(dbRow.last_activity_date).toBe('2026-09-28');
      expect(dbRow.days_stuck).toBe(4);
      expect(dbRow.severity).toBe('WARNING');
    });

    it('respects active alert acknowledgements', () => {
      const asOf = new Date('2026-10-02T12:00:00Z');
      const rows = computeAgingReportRows({
        wipRows: rawWip,
        workOrders,
        productionLogs: prodLogs,
        qcInspections,
        rollingPlans: [],
        routeStages,
        acknowledgements: [
          {
            work_order_id: 'WO_STUCK',
            stage_code: 'DRAW',
            acknowledged_by: 'QC Manager',
            notes: 'Delayed due to die shortage',
            snooze_until: '2026-10-05',
          },
        ],
        asOfDate: asOf,
      });

      const stuckRow = rows.find(r => r.work_order_no === '9999');
      expect(stuckRow?.is_acknowledged).toBe(true);
      expect(stuckRow?.acknowledged_by).toBe('QC Manager');
      expect(stuckRow?.ack_notes).toBe('Delayed due to die shortage');
    });
  });

  describe('computeAgingKpis', () => {
    it('summarizes lots, meters, tonnage, dwell time, and identifies primary bottleneck', () => {
      const rows = [
        {
          work_order_id: '1',
          work_order_no: 'W1',
          customer_name: 'C1',
          grade: 'G1',
          od: 60.3,
          wt: 3.91,
          l1: 6,
          l2: 6,
          stage_code: 'DRAW',
          stage_name: 'Cold Draw Bench',
          current_wip: 1000,
          current_wip_pcs: 160,
          available_mt: 5.4,
          last_activity_date: '2026-09-20',
          days_stuck: 12,
          severity: 'CRITICAL' as const,
        },
        {
          work_order_id: '2',
          work_order_no: 'W2',
          customer_name: 'C2',
          grade: 'G2',
          od: 60.3,
          wt: 3.91,
          l1: 6,
          l2: 6,
          stage_code: 'DRAW',
          stage_name: 'Cold Draw Bench',
          current_wip: 800,
          current_wip_pcs: 130,
          available_mt: 4.3,
          last_activity_date: '2026-09-22',
          days_stuck: 10,
          severity: 'CRITICAL' as const,
        },
        {
          work_order_id: '3',
          work_order_no: 'W3',
          customer_name: 'C3',
          grade: 'G3',
          od: 38.1,
          wt: 3.5,
          l1: 6,
          l2: 6,
          stage_code: 'BAND_SAW',
          stage_name: 'Band Saw Cutting',
          current_wip: 500,
          current_wip_pcs: 80,
          available_mt: 1.5,
          last_activity_date: '2026-09-28',
          days_stuck: 4,
          severity: 'WARNING' as const,
        },
        {
          work_order_id: '4',
          work_order_no: 'W4',
          customer_name: 'C4',
          grade: 'G4',
          od: 38.1,
          wt: 3.5,
          l1: 6,
          l2: 6,
          stage_code: 'VDI',
          stage_name: 'Visual Dimension Inspection',
          current_wip: 200,
          current_wip_pcs: 30,
          available_mt: 0.6,
          last_activity_date: '2026-10-01',
          days_stuck: 1,
          severity: 'NORMAL' as const,
        },
      ];

      const kpis = computeAgingKpis(rows);
      expect(kpis.totalLots).toBe(4);
      expect(kpis.criticalLots).toBe(2);
      expect(kpis.warningLots).toBe(1);
      expect(kpis.normalLots).toBe(1);
      expect(kpis.criticalMtr).toBe(1800);
      expect(kpis.criticalMt).toBeCloseTo(9.7, 1);
      expect(kpis.totalWipMtr).toBe(2500);
      expect(kpis.totalWipMt).toBeCloseTo(11.8, 1);
      expect(kpis.avgDays).toBe((12 + 10 + 4 + 1) / 4);
      expect(kpis.topBottleneck).toContain('Cold Draw Bench (2 lots)');
    });
  });

  describe('filterAgingRows', () => {
    const rows = [
      {
        work_order_id: '1',
        work_order_no: '6430',
        customer_name: 'Tubes India',
        grade: 'ASTM A106 Gr B',
        od: 60.3,
        wt: 3.91,
        l1: 6,
        l2: 6,
        stage_code: 'VDI',
        stage_name: 'Visual Dimension Inspection',
        current_wip: 1000,
        current_wip_pcs: 160,
        available_mt: 5.4,
        last_activity_date: '2026-10-01',
        days_stuck: 1,
        severity: 'NORMAL' as const,
      },
      {
        work_order_id: '2',
        work_order_no: '6349',
        customer_name: 'Boiler Corp',
        grade: 'ASME SA210 Gr C',
        od: 63.5,
        wt: 5.2,
        l1: 6,
        l2: 6,
        stage_code: 'BAND_SAW',
        stage_name: 'Band Saw Cutting',
        current_wip: 800,
        current_wip_pcs: 130,
        available_mt: 4.3,
        last_activity_date: '2026-09-28',
        days_stuck: 4,
        severity: 'WARNING' as const,
      },
      {
        work_order_id: '3',
        work_order_no: '9999',
        customer_name: 'Power Plant',
        grade: 'P11',
        od: 88.9,
        wt: 7.62,
        l1: 6,
        l2: 6,
        stage_code: 'DRAW',
        stage_name: 'Cold Draw Bench',
        current_wip: 500,
        current_wip_pcs: 80,
        available_mt: 1.5,
        last_activity_date: '2026-09-20',
        days_stuck: 12,
        severity: 'CRITICAL' as const,
      },
    ];

    it('filters by stage_code including BAND_SAW and VDI', () => {
      expect(filterAgingRows(rows, { selectedStage: 'BAND_SAW' })).toHaveLength(1);
      expect(filterAgingRows(rows, { selectedStage: 'BAND_SAW' })[0].work_order_no).toBe('6349');

      expect(filterAgingRows(rows, { selectedStage: 'VDI' })).toHaveLength(1);
      expect(filterAgingRows(rows, { selectedStage: 'VDI' })[0].work_order_no).toBe('6430');
    });

    it('filters by severity tier', () => {
      expect(filterAgingRows(rows, { selectedSeverity: 'CRITICAL' })).toHaveLength(1);
      expect(filterAgingRows(rows, { selectedSeverity: 'WARNING' })).toHaveLength(1);
      expect(filterAgingRows(rows, { selectedSeverity: 'NORMAL' })).toHaveLength(1);
    });

    it('searches by size dimension string (e.g. 60.3 or 63.5x5.2)', () => {
      expect(filterAgingRows(rows, { search: '60.3' })).toHaveLength(1);
      expect(filterAgingRows(rows, { search: '63.5' })).toHaveLength(1);
    });

    it('includes BAND_SAW and VDI in AGING_STAGES list', () => {
      const stageCodes = AGING_STAGES.map(s => s.code);
      expect(stageCodes).toContain('BAND_SAW');
      expect(stageCodes).toContain('VDI');
      expect(stageCodes).toContain('DRAW');
      expect(stageCodes).toContain('HEAT_TREATMENT');
      expect(stageCodes).toContain('FINISHING');
    });
  });
});
