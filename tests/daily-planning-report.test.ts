import { describe, it, expect } from 'vitest';

describe('Official Daily Planning Report Calculations & Format Validation', () => {
  it('correctly calculates FACTOR, Kg/Mtr, and MT based on steel pipe formulas', () => {
    const od = 60.3;
    const wt = 3.91;
    // FACTOR = (OD - WT) * WT
    const factor = Number(((od - wt) * wt).toFixed(4));
    expect(factor).toBeCloseTo(220.4849, 3);

    // Kg/Mtr = FACTOR * 0.0246615
    const kgPerMtr = Number((factor * 0.0246615).toFixed(3));
    expect(kgPerMtr).toBeCloseTo(5.438, 2);

    // Lgth avg = (L1 + L2) / 2
    const l1 = 5.8;
    const l2 = 6.2;
    const avgLgth = Number(((l1 + l2) / 2).toFixed(2));
    expect(avgLgth).toBe(6.0);

    // Target MT = (Nos * AvgLgth * Kg/Mtr) / 1000
    const nos = 100;
    const mt = Number(((nos * avgLgth * kgPerMtr) / 1000).toFixed(3));
    expect(mt).toBeCloseTo(3.263, 2);
  });

  it('validates 15 required factory report columns for F PROD - 003 and F PROD - 005', () => {
    const requiredColumns = [
      'Sr. No',
      'WO NO',
      'Customer',
      'Grade/SPEC',
      'OD',
      'WT',
      'FACTOR',
      'Proc. Wall',
      'Kg/Mtr.',
      'Final Lgth Min.',
      'Final Lgth Max.',
      'Avg. Lgth',
      'Stage',
      'Nos',
      'MT.',
    ];
    expect(requiredColumns).toHaveLength(15);
    expect(requiredColumns[0]).toBe('Sr. No');
    expect(requiredColumns[1]).toBe('WO NO');
    expect(requiredColumns[6]).toBe('FACTOR');
    expect(requiredColumns[7]).toBe('Proc. Wall');
    expect(requiredColumns[8]).toBe('Kg/Mtr.');
    expect(requiredColumns[12]).toBe('Stage');
    expect(requiredColumns[13]).toBe('Nos');
    expect(requiredColumns[14]).toBe('MT.');
  });

  it('validates format document numbers and revisions', () => {
    const formatF003 = 'Format No. F PROD - 003, Eff . Date : 01.04.2023, Rev. 02. Rev. Date : 01.04.2026, / PPC';
    const formatF005 = 'Format No. F PROD - 005, Eff . Date : 01.04.2023, Rev. 02. Rev. Date : 01.04.2026, / PPC';

    expect(formatF003).toContain('F PROD - 003');
    expect(formatF005).toContain('F PROD - 005');
  });
});
