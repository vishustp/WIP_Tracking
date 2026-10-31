import { describe, it, expect } from 'vitest';
import { buildCampaignHierarchyMaps } from '@/lib/campaignWipUtils';

describe('Phase 3: Relational Campaign Hierarchy Normalization', () => {
  it('builds campaign hierarchy directly from relational campaign children rows', () => {
    const mockPlans = [
      {
        id: 'plan-master-1',
        work_order_id: 'wo-master-1',
        mh_od: 88.9,
        mh_wt: 6.0,
        mh_l1: 6.5,
        mh_l2: 6.5,
        status: 'SCHEDULED', // Pure status without JSON bloat!
      },
    ];

    const mockRelationalChildren = [
      {
        master_plan_id: 'plan-master-1',
        master_work_order_id: 'wo-master-1',
        child_work_order_id: 'wo-child-101',
        planned_pcs: 100,
        planned_mtr: 650.0,
        alloc_tag: '1',
      },
      {
        master_plan_id: 'plan-master-1',
        master_work_order_id: 'wo-master-1',
        child_work_order_id: 'wo-child-102',
        planned_pcs: 200,
        planned_mtr: 1300.0,
        alloc_tag: '2',
      },
    ];

    const hierarchy = buildCampaignHierarchyMaps(mockPlans, mockRelationalChildren);

    // Verifies child to master mapping
    expect(hierarchy.childToMasterMap.get('wo-child-101')).toBe('wo-master-1');
    expect(hierarchy.childToMasterMap.get('wo-child-102')).toBe('wo-master-1');

    // Verifies campaign members set
    const members = hierarchy.campaignMembersMap.get('wo-master-1');
    expect(members).toBeDefined();
    expect(members?.has('wo-master-1')).toBe(true);
    expect(members?.has('wo-child-101')).toBe(true);
    expect(members?.has('wo-child-102')).toBe(true);
    expect(members?.size).toBe(3);

    // Verifies MH specs
    const mh = hierarchy.mhMap.get('wo-master-1');
    expect(mh?.mh_od).toBe(88.9);
    expect(mh?.mh_wt).toBe(6.0);
    expect(mh?.mh_avg_length).toBe(6.5);
  });

  it('seamlessly falls back to parsing JSON status when relational children are absent', () => {
    const legacyPlans = [
      {
        id: 'plan-legacy-1',
        work_order_id: 'wo-legacy-master',
        status: JSON.stringify({
          is_master: true,
          mh_od: 73.0,
          mh_wt: 5.5,
          child_work_orders: [
            { id: 'wo-legacy-child-1', planned_pcs: 50 },
            { id: 'wo-legacy-child-2', planned_pcs: 75 },
          ],
        }),
      },
    ];

    const hierarchy = buildCampaignHierarchyMaps(legacyPlans);

    expect(hierarchy.childToMasterMap.get('wo-legacy-child-1')).toBe('wo-legacy-master');
    expect(hierarchy.childToMasterMap.get('wo-legacy-child-2')).toBe('wo-legacy-master');
    expect(hierarchy.campaignMembersMap.get('wo-legacy-master')?.size).toBe(3);
  });
});
