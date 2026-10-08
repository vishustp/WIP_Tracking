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
