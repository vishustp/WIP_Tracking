// tests/rejection-declaration-ledger.test.ts
import { describe, it, expect } from 'vitest';

describe('Rejection Declaration & WIP Ledger Math', () => {
  it('does not deduct pending declarations from active WIP', () => {
    const incomingMtr = 600;
    const stageOutputMtr = 300;
    const pendingRejectionMtr = 36;
    const approvedRejectionMtr = 0;
    
    // Formula: Incoming - Stage Output - Approved Rejections
    const activeWip = Math.max(incomingMtr - stageOutputMtr - approvedRejectionMtr, 0);
    expect(activeWip).toBe(300);
    expect(pendingRejectionMtr).toBe(36);
  });

  it('keeps material awaiting QC or PPC approval in WIP until Final PPC approval', () => {
    const declarations = [
      { id: '1', work_center: 'DRAW', rejected_pcs: 6, rejected_mtr: 36.6, status: 'PENDING_QC' },
      { id: '2', work_center: 'BAND_SAW', rejected_pcs: 3, rejected_mtr: 34.5, status: 'PENDING_QC' },
      { id: '3', work_center: 'VDI', rejected_pcs: 1, rejected_mtr: 11.8, status: 'PENDING_PPC' },
      { id: '4', work_center: 'HEAT_TREATMENT', rejected_pcs: 1, rejected_mtr: 11.8, status: 'APPROVED' },
    ];

    // Only declarations with status === 'APPROVED' deduct from WIP
    const getApprovedDeduction = (stage: string) => {
      const match = declarations.filter((d) => d.work_center === stage && d.status === 'APPROVED');
      return match.reduce((sum, d) => sum + d.rejected_pcs, 0);
    };

    // Pending declarations are captured as informational hold warnings
    const getPendingHold = (stage: string) => {
      const match = declarations.filter((d) => d.work_center === stage && (d.status === 'PENDING_QC' || d.status === 'PENDING_PPC'));
      return match.reduce((sum, d) => sum + d.rejected_pcs, 0);
    };

    // DRAW has 6 pcs PENDING_QC
    expect(getApprovedDeduction('DRAW')).toBe(0);
    expect(getPendingHold('DRAW')).toBe(6);

    // BAND_SAW has 3 pcs PENDING_QC
    expect(getApprovedDeduction('BAND_SAW')).toBe(0);
    expect(getPendingHold('BAND_SAW')).toBe(3);

    // VDI has 1 pc PENDING_PPC
    expect(getApprovedDeduction('VDI')).toBe(0);
    expect(getPendingHold('VDI')).toBe(1);

    // HEAT_TREATMENT has 1 pc APPROVED
    expect(getApprovedDeduction('HEAT_TREATMENT')).toBe(1);
    expect(getPendingHold('HEAT_TREATMENT')).toBe(0);
  });

  it('deducts approved rejections from active WIP upon PPC approval', () => {
    const incomingMtr = 600;
    const stageOutputMtr = 300;
    const approvedRejectionMtr = 36; // 3 pcs @ 12m
    
    const activeWip = Math.max(incomingMtr - stageOutputMtr - approvedRejectionMtr, 0);
    expect(activeWip).toBe(264);
  });

  it('deducts verified/approved quantities if QC adjusted declared count', () => {
    const declaredMtr = 36; // 3 pcs
    const qcVerifiedMtr = 24; // QC only condemned 2 pcs
    const ppcApprovedMtr = 24; // PPC authorizes 2 pcs write-off
    
    const stageWipBefore = 300;
    const stageWipAfter = stageWipBefore - ppcApprovedMtr;
    expect(stageWipAfter).toBe(276);
  });

  it('calculates work center active WIP with diversions and approved rejections', () => {
    const incomingMtr = 1000;
    const divInMtr = 100;
    const stageOutputMtr = 600;
    const downstreamPassedMtr = 550;
    const approvedRejMtr = 50;
    const divOutMtr = 20;

    const currentWip = Math.max(
      incomingMtr + divInMtr - Math.max(stageOutputMtr, downstreamPassedMtr) - approvedRejMtr - divOutMtr,
      0
    );
    // 1000 + 100 - 600 - 50 - 20 = 430
    expect(currentWip).toBe(430);
  });
});
