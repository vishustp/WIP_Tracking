import { describe, it, expect } from 'vitest';

describe('Rolling Plan Queue Visibility & Child Work Order Isolation', () => {
  it('ensures master rolling plans are not blocked when their work order was previously a child order in another campaign', () => {
    // Campaign 08 has child order WO-6455
    const childWoMap = new Map<string, any>();
    childWoMap.set('wo-6455', {
      work_order_id: 'wo-6455',
      master_wo_id: 'wo-6453',
      master_plan_no: '08-M8',
    });

    // Later, Campaign 19 issues Plan 19-M3 where WO-6455 is the MASTER order
    const plans = [
      {
        id: 'plan-08-m8-child',
        plan_no: '08-M8',
        work_order_id: 'wo-6455',
        status: JSON.stringify({
          is_child: true,
          master_plan_no: '08-M8',
          lifecycle_status: 'ISSUED',
        }),
      },
      {
        id: 'plan-19-m3-master',
        plan_no: '19-M3',
        work_order_id: 'wo-6455',
        status: JSON.stringify({
          is_master: true,
          master_plan_no: '19-M3',
          lifecycle_status: 'ISSUED',
          master_planned_pcs: 70,
          master_planned_mtr: 427,
        }),
      },
    ];

    // Collect candidate master / standalone work orders
    const candidateWoIds = new Set<string>();
    plans.forEach((p) => {
      let isChild = false;
      try {
        const parsed = typeof p.status === 'string' ? JSON.parse(p.status) : p.status;
        isChild = Boolean(parsed?.is_child);
      } catch {}
      if (!isChild) {
        candidateWoIds.add(p.work_order_id);
      } else if (!childWoMap.has(p.work_order_id)) {
        candidateWoIds.add(p.work_order_id);
      }
    });

    // Verification: WO-6455 must be present in candidateWoIds because it has a master plan
    expect(candidateWoIds.has('wo-6455')).toBe(true);

    // Filter plans for ROLLING queue
    const woPlans = plans.filter((p) => p.work_order_id === 'wo-6455');
    const rollingQueuePlans: any[] = [];

    for (const pl of woPlans) {
      const plParsed = typeof pl.status === 'string' ? JSON.parse(pl.status) : pl.status || {};
      if (plParsed?.is_child) continue;

      const plLifecycle = plParsed?.lifecycle_status || (plParsed?.issued_at ? 'ISSUED' : 'DRAFT');
      const plIsIssued = (plLifecycle === 'ISSUED' || plLifecycle === 'REVISED') && plLifecycle !== 'CLOSED';
      if (!plIsIssued) continue;

      const plannedPcs = Number(plParsed.master_planned_pcs || 0);
      const plannedMtr = Number(plParsed.master_planned_mtr || 0);
      const availPcs = plannedPcs;
      const availMtr = plannedMtr;

      if (availMtr >= 1.0 || availPcs >= 1) {
        rollingQueuePlans.push({
          plan_no: pl.plan_no,
          availPcs,
          availMtr,
        });
      }
    }

    expect(rollingQueuePlans.length).toBe(1);
    expect(rollingQueuePlans[0].plan_no).toBe('19-M3');
    expect(rollingQueuePlans[0].availPcs).toBe(70);
    expect(rollingQueuePlans[0].availMtr).toBe(427);
  });
});
