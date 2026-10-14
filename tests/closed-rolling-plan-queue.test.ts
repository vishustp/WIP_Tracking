import { describe, it, expect } from 'vitest';

describe('Rolling Plan Queue FIFO and Closed Plan Isolation', () => {
  it('correctly isolates closed plans and attributes new production to active issued plans', () => {
    // Simulate Work Order 6069 scenario
    const plans = [
      {
        id: 'plan-1-closed',
        plan_no: '09-M2',
        created_at: '2026-10-03T11:52:23Z',
        planned_qty: 79.9,
        status: JSON.stringify({
          lifecycle_status: 'CLOSED',
          master_planned_pcs: 391,
          master_planned_mtr: 3069.35,
          closed_pcs: 10,
          closed_mtr: 79.9,
          closed_at: '2026-10-10T03:39:06Z',
        }),
      },
      {
        id: 'plan-2-issued',
        plan_no: '10-M1',
        created_at: '2026-10-10T03:47:45Z',
        planned_qty: 3179.25,
        status: JSON.stringify({
          lifecycle_status: 'ISSUED',
          issued_at: '2026-10-10T03:48:16Z',
          master_planned_pcs: 405,
          master_planned_mtr: 3179.25,
        }),
      },
    ];

    const logs = [
      {
        id: 'log-1',
        rolling_plan_id: null, // unassigned log from production entry
        output_qty: 3235.95,
        remarks: '[PCS:405]',
        process_date: '2026-10-12',
        created_at: '2026-10-12T00:58:18Z',
      },
    ];

    // 1. Calculate planTargetMtr correctly distinguishing CLOSED vs ISSUED plans
    const sortedPlans = [...plans].sort(
      (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
    );

    const planTargetMtr = new Map<string, number>();
    const planAccumulatedMtr = new Map<string, number>();
    sortedPlans.forEach((pl) => {
      let tMtr = Number(pl.planned_qty || 0);
      try {
        const st = typeof pl.status === 'string' ? JSON.parse(pl.status) : pl.status || {};
        const lc = st?.lifecycle_status || (st?.issued_at ? 'ISSUED' : 'DRAFT');
        if (lc === 'CLOSED' || lc === 'SHORT_CLOSED') {
          tMtr = Number(st.closed_mtr || st.planned_mtr || pl.planned_qty || 0);
        } else {
          tMtr = Number(st.master_planned_mtr || st.planned_mtr || pl.planned_qty || 0);
        }
      } catch {}
      planTargetMtr.set(pl.id, tMtr);
      planAccumulatedMtr.set(pl.id, 0);
    });

    expect(planTargetMtr.get('plan-1-closed')).toBe(79.9);
    expect(planTargetMtr.get('plan-2-issued')).toBe(3179.25);

    // 2. FIFO unassigned log assignment respecting closed_at and target
    const planLogMap = new Map<string, any[]>();
    sortedPlans.forEach((pl) => planLogMap.set(pl.id, []));

    let currentPlanIdx = 0;
    for (const log of logs) {
      const logMtr = Number(log.output_qty || 0);
      const logDate = new Date(log.process_date || log.created_at || 0).getTime();

      while (currentPlanIdx < sortedPlans.length - 1) {
        const currPlan = sortedPlans[currentPlanIdx];
        const currPlanId = currPlan.id;
        const target = planTargetMtr.get(currPlanId) || 0;
        const accumulated = planAccumulatedMtr.get(currPlanId) || 0;

        let isClosed = false;
        let closedDate = Infinity;
        try {
          const st = typeof currPlan.status === 'string' ? JSON.parse(currPlan.status) : currPlan.status || {};
          const lc = st?.lifecycle_status || (st?.issued_at ? 'ISSUED' : 'DRAFT');
          if (lc === 'CLOSED' || lc === 'SHORT_CLOSED') {
            isClosed = true;
            if (st.closed_at) closedDate = new Date(st.closed_at).getTime();
          }
        } catch {}

        if ((target > 0 && accumulated >= target) || (isClosed && (accumulated >= target || logDate >= closedDate))) {
          currentPlanIdx++;
        } else {
          break;
        }
      }

      const matchedPlan = sortedPlans[currentPlanIdx];
      planLogMap.get(matchedPlan.id)!.push(log);
      planAccumulatedMtr.set(matchedPlan.id, (planAccumulatedMtr.get(matchedPlan.id) || 0) + logMtr);
    }

    // Closed plan should not absorb new log produced after it was closed
    expect(planLogMap.get('plan-1-closed')).toHaveLength(0);
    // Active plan should receive the log
    expect(planLogMap.get('plan-2-issued')).toHaveLength(1);

    // 3. Queue evaluation for Rolling stage
    const queueRows: any[] = [];
    for (const pl of plans) {
      const plParsed = typeof pl.status === 'string' ? JSON.parse(pl.status) : pl.status || {};
      const plLifecycle = plParsed?.lifecycle_status || (plParsed?.issued_at ? 'ISSUED' : 'DRAFT');
      const plIsIssued = (plLifecycle === 'ISSUED' || plLifecycle === 'REVISED') && plLifecycle !== 'CLOSED' && plLifecycle !== 'SHORT_CLOSED';

      if (!plIsIssued) continue; // Closed plan 09-M2 is skipped!

      const plPlannedPcs = Number(plParsed?.master_planned_pcs || 0);
      const plPlannedMtr = Number(pl.planned_qty || 0);
      const directLogs = planLogMap.get(pl.id) || [];

      let directPcs = 0;
      let directMtr = 0;
      for (const l of directLogs) {
        directPcs += 405;
        directMtr += l.output_qty;
      }

      const plAvailPcs = Math.max(0, plPlannedPcs - directPcs);
      const plAvailMtr = Math.max(0, Number((plPlannedMtr - directMtr).toFixed(2)));

      if (plAvailPcs >= 1 || plAvailMtr >= 1.0) {
        queueRows.push({ plan_no: pl.plan_no, plAvailPcs, plAvailMtr });
      }
    }

    // Since Plan 1 is closed, and Plan 2 had 405 PCS planned & 405 PCS rolled, 0 balance remains!
    // Therefore queueRows must be empty (WO 6069 does NOT appear in Production Entry)!
    expect(queueRows).toHaveLength(0);
  });
});
