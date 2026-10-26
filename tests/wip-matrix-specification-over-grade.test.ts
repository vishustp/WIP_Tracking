import { describe, it, expect } from 'vitest';
import { normalizeGrade } from '@/lib/productionUtils';

describe('WIP Matrix Specification vs RM Grade Resolution', () => {
  it('prioritizes customer specification over raw material billet grade in queue mapping', () => {
    const queueRowsFromApi = [
      {
        work_order_id: 'wo-div-target-1',
        work_order_no: 'WO-6401',
        customer_name: 'Industrial Piping Corp',
        specification: 'ASTM A106 Gr.B',
        grade: 'SAE 1026', // RM billet grade
        has_diversion: true,
        diversion_in_pcs: 50,
        diversion_in_mtr: 300,
        diversion_source_wo: 'WO-6300',
        stage_code: 'DRAW',
        od: 50.8,
        wt: 3.5,
        current_wip_pcs: 50,
        current_wip: 300,
      },
      {
        work_order_id: 'wo-standard-2',
        work_order_no: 'WO-6402',
        customer_name: 'Boiler Tech Ltd',
        specification: 'ASME SA210 Gr.A1',
        grade: '20#', // RM carbon steel grade
        has_diversion: false,
        stage_code: 'BAND_SAW',
        od: 60.3,
        wt: 4.0,
        current_wip_pcs: 25,
        current_wip: 150,
      },
      {
        work_order_id: 'wo-legacy-3',
        work_order_no: 'WO-6403',
        customer_name: 'Legacy Customer',
        specification: null, // Legacy order without explicit specification
        grade: 'SAE 1026',
        has_diversion: false,
        stage_code: 'FINISHING',
        od: 42.4,
        wt: 3.2,
        current_wip_pcs: 10,
        current_wip: 60,
      },
    ];

    const mapped = queueRowsFromApi.map((r) => {
      const rawSpec = String(r.specification || '').trim();
      const rawGrade = String(r.grade || '').trim();
      const resolved = normalizeGrade(rawSpec || rawGrade || 'Standard');
      return {
        ...r,
        grade: resolved,
        specification: r.specification || r.grade || null,
      };
    });

    expect(mapped[0].grade).toBe('ASTM A106 Gr B'); // NOT 'SAE 1026'
    expect(mapped[1].grade).toBe('ASME SA210 Gr A1'); // NOT '20#'
    expect(mapped[2].grade).toBe('SAE 1026'); // Clean fallback when specification is null
  });

  it('correctly builds gradeMap prioritizing specification in fallback database query mode', () => {
    const workOrders = [
      {
        id: 'wo-1',
        work_order_no: '6501',
        customer_name: 'Apex Boiler Works',
        grade: '20Mn2', // RM grade
        specification: 'ASTM A335 Gr.P11', // Customer pipe specification
      },
      {
        id: 'wo-2',
        work_order_no: '6502',
        customer_name: 'National Refineries',
        grade: 'SAE 1026',
        specification: 'ASTM A106 Gr.B',
      },
      {
        id: 'wo-3',
        work_order_no: '6503',
        customer_name: 'Commercial Downgrade',
        grade: 'SAE 1020',
        specification: null,
      },
    ];

    const gradeMap = new Map<string, string>();
    workOrders.forEach((w) => {
      const g = String(w.specification || w.grade || '').trim();
      if (g) {
        gradeMap.set(w.id, g);
        if (w.work_order_no) gradeMap.set(String(w.work_order_no).trim(), g);
      }
    });

    expect(gradeMap.get('wo-1')).toBe('ASTM A335 Gr.P11');
    expect(gradeMap.get('6501')).toBe('ASTM A335 Gr.P11');
    expect(gradeMap.get('wo-2')).toBe('ASTM A106 Gr.B');
    expect(gradeMap.get('6502')).toBe('ASTM A106 Gr.B');
    expect(gradeMap.get('wo-3')).toBe('SAE 1020');
  });

  it('aggregates diverted items into the customer specification matrix bucket rather than raw material grade bucket', () => {
    const items = [
      {
        work_order_id: 'wo-target-div',
        work_order_no: 'WO-DIV-101',
        specification: 'ASTM A106 Gr.B',
        grade: 'SAE 1026',
        od: 50.8,
        wt: 3.5,
        current_wip_pcs: 30,
        current_wip: 180,
      },
      {
        work_order_id: 'wo-regular',
        work_order_no: 'WO-REG-102',
        specification: 'ASTM A106 Gr.B',
        grade: 'SAE 1026',
        od: 50.8,
        wt: 3.5,
        current_wip_pcs: 70,
        current_wip: 420,
      },
    ];

    const matrixGroups = new Map<string, any>();
    items.forEach((r) => {
      const grade = normalizeGrade(r.specification || r.grade || 'Standard');
      const key = `${r.od}_${r.wt}_${grade}`;
      if (!matrixGroups.has(key)) {
        matrixGroups.set(key, {
          key,
          od: r.od,
          wt: r.wt,
          grade,
          total_pcs: 0,
          total_mtr: 0,
        });
      }
      const g = matrixGroups.get(key);
      g.total_pcs += r.current_wip_pcs;
      g.total_mtr += r.current_wip;
    });

    // Both the diversion item and regular item must pool under the specification key
    expect(matrixGroups.size).toBe(1);
    expect(matrixGroups.has('50.8_3.5_ASTM A106 Gr B')).toBe(true);
    expect(matrixGroups.has('50.8_3.5_SAE 1026')).toBe(false);

    const group = matrixGroups.get('50.8_3.5_ASTM A106 Gr B');
    expect(group.total_pcs).toBe(100);
    expect(group.total_mtr).toBe(600);
    expect(group.grade).toBe('ASTM A106 Gr B');
  });
});
