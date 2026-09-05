import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export interface ChildWoPayload {
  id: string;
  work_order_no: string;
  customer_name?: string | null;
  grade?: string | null;
  size_od?: number | null;
  size_wt?: number | null;
  l1?: number | null;
  l2?: number | null;
  planned_pcs: number;
  planned_mtr: number;
  planned_mt: number;
}

export interface CreateMultiWoRollingPlanPayload {
  master_work_order_id: string;
  master_planned_pcs: number;
  master_planned_mtr: number;
  master_planned_mt: number;
  child_work_orders: ChildWoPayload[];
  rolling_date: string;
  route_id: string;
  mh_od: number;
  mh_wt: number;
  mh_l1: number;
  mh_l2: number;
  pass_required: number;
  multiple: number;
}

export async function POST(req: NextRequest) {
  try {
    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: 'Database service is temporarily unavailable.' },
        { status: 500 }
      );
    }
    const body: CreateMultiWoRollingPlanPayload = await req.json();

    const {
      master_work_order_id,
      master_planned_pcs,
      master_planned_mtr,
      master_planned_mt,
      child_work_orders = [],
      rolling_date,
      route_id,
      mh_od,
      mh_wt,
      mh_l1,
      mh_l2,
      pass_required = 1,
      multiple = 1,
    } = body;

    if (!master_work_order_id || !route_id || !rolling_date) {
      return NextResponse.json(
        { error: 'Master work order, process route, and rolling date are required.' },
        { status: 400 }
      );
    }

    if (master_planned_mtr <= 0) {
      return NextResponse.json(
        { error: 'Master work order planned quantity must be greater than zero.' },
        { status: 400 }
      );
    }

    // 1. Fetch Master Work Order details
    const { data: masterWo, error: masterWoErr } = await admin
      .from('work_orders')
      .select('*')
      .eq('id', master_work_order_id)
      .single();

    if (masterWoErr || !masterWo) {
      return NextResponse.json(
        { error: 'Master work order not found.' },
        { status: 404 }
      );
    }

    // 2. Calculate Planned Quantities based on Mother Hollow OD, WT, and Average Length
    const effMhOd = (mh_od != null && !isNaN(Number(mh_od)) && Number(mh_od) > 0)
      ? Number(mh_od)
      : Number(masterWo.size_od || 0);
    const effMhWt = (mh_wt != null && !isNaN(Number(mh_wt)) && Number(mh_wt) > 0)
      ? Number(mh_wt)
      : Number(masterWo.size_wt || 0);
    const effMhL1 = (mh_l1 != null && !isNaN(Number(mh_l1)) && Number(mh_l1) > 0)
      ? Number(mh_l1)
      : Number(masterWo.l1 || 0);
    const effMhL2 = (mh_l2 != null && !isNaN(Number(mh_l2)) && Number(mh_l2) > 0)
      ? Number(mh_l2)
      : Number(masterWo.l2 || 0);

    const hollowAvg = (effMhL1 > 0 && effMhL2 > 0)
      ? (effMhL1 + effMhL2) / 2
      : (effMhL1 > 0 ? effMhL1 : (effMhL2 > 0 ? effMhL2 : 6.0));

    const calcHollowMtr = (pcs: number) => Number((pcs * hollowAvg).toFixed(2));
    const calcHollowMt = (mtr: number) => Number(
      (Math.max(effMhOd - effMhWt, 0) * Math.max(effMhWt, 0) * 0.0246615 * 0.001 * mtr).toFixed(3)
    );

    const calcMasterMtr = master_planned_pcs > 0 ? calcHollowMtr(master_planned_pcs) : Number(master_planned_mtr || 0);
    const calcMasterMt = calcHollowMt(calcMasterMtr);

    // Process child work orders with hollow dimensions
    const processedChildren = child_work_orders.map((c: any) => {
      const cPcs = Number(c.planned_pcs || 0);
      const cMtr = cPcs > 0 ? calcHollowMtr(cPcs) : Number(c.planned_mtr || 0);
      const cMt = calcHollowMt(cMtr);
      return { ...c, planned_pcs: cPcs, planned_mtr: cMtr, planned_mt: cMt };
    });

    const totalChildMtr = processedChildren.reduce((sum: number, c: any) => sum + Number(c.planned_mtr || 0), 0);
    const totalChildPcs = processedChildren.reduce((sum: number, c: any) => sum + Number(c.planned_pcs || 0), 0);
    const totalChildMt = processedChildren.reduce((sum: number, c: any) => sum + Number(c.planned_mt || 0), 0);

    const totalCampaignMtr = calcMasterMtr + totalChildMtr;
    const totalCampaignPcs = master_planned_pcs + totalChildPcs;
    const totalCampaignMt = calcMasterMt + totalChildMt;

    // 3. Create the Master Rolling Plan using RPC to ensure proper sequence & trigger handling
    const { data: planNoData, error: planRpcErr } = await admin.rpc(
      'create_rolling_plan',
      {
        p_work_order_id: master_work_order_id,
        p_planned_qty: calcMasterMtr,
        p_rolling_date: rolling_date,
        p_route_id: route_id,
        p_mh_od: effMhOd,
        p_mh_wt: effMhWt,
        p_mh_l1: effMhL1,
        p_mh_l2: effMhL2,
        p_pass_required: pass_required,
        p_multiple: multiple,
      }
    );

    if (planRpcErr) {
      return NextResponse.json(
        { error: `Failed to create master rolling plan: ${planRpcErr.message}` },
        { status: 400 }
      );
    }

    const planNo = String(planNoData);

    // Retrieve the master rolling plan row
    const { data: masterPlan, error: masterPlanFetchErr } = await admin
      .from('rolling_plans')
      .select('*')
      .eq('plan_no', planNo)
      .single();

    if (masterPlanFetchErr || !masterPlan) {
      return NextResponse.json(
        { error: 'Could not fetch created master rolling plan.' },
        { status: 500 }
      );
    }

    // 4. If child work orders exist, create rolling plans for each child order and link them
    const childPlanIds: string[] = [];
    const childMetadataList: Array<{
      work_order_id: string;
      work_order_no: string;
      customer_name: string | null;
      grade: string | null;
      size_od: number | null;
      size_wt: number | null;
      l1: number | null;
      l2: number | null;
      planned_pcs: number;
      planned_mtr: number;
      planned_mt: number;
      plan_id?: string;
    }> = [];

    for (const child of processedChildren) {
      const childPcs = Number(child.planned_pcs || 0);
      const childMtr = Number(child.planned_mtr || 0);
      const childMt = Number(child.planned_mt || 0);

      if (childMtr <= 0) continue;

      // Create a linked rolling plan row for the child order
      const childPlanNo = `${planNo}-C${childPlanIds.length + 1}`;

      const childStatusMetadata = JSON.stringify({
        type: 'MULTI_WO',
        is_child: true,
        master_plan_id: masterPlan.id,
        master_plan_no: planNo,
        master_wo_id: master_work_order_id,
        master_wo_no: masterWo.work_order_no,
        planned_pcs: childPcs,
        planned_mtr: childMtr,
        planned_mt: childMt,
      });

      const { data: childPlan, error: childPlanErr } = await admin
        .from('rolling_plans')
        .insert({
          plan_no: childPlanNo,
          work_order_id: child.id,
          planned_rolling_date: rolling_date,
          planned_qty: childMtr,
          process_route_id: route_id,
          multiple: multiple,
          status: childStatusMetadata,
          mh_od: effMhOd,
          mh_wt: effMhWt,
          mh_l1: effMhL1,
          mh_l2: effMhL2,
          pass_required: pass_required,
        })
        .select()
        .single();

      if (childPlanErr) {
        console.error('Error inserting child plan:', childPlanErr);
      } else if (childPlan) {
        childPlanIds.push(childPlan.id);

        // Update child work order status to 'Scheduled'
        await admin
          .from('work_orders')
          .update({ status: 'Scheduled' })
          .eq('id', child.id)
          .eq('status', 'Pending Plan');

        childMetadataList.push({
          work_order_id: child.id,
          work_order_no: child.work_order_no,
          customer_name: child.customer_name ?? null,
          grade: child.grade ?? null,
          size_od: child.size_od ?? null,
          size_wt: child.size_wt ?? null,
          l1: child.l1 ?? null,
          l2: child.l2 ?? null,
          planned_pcs: childPcs,
          planned_mtr: childMtr,
          planned_mt: childMt,
          plan_id: childPlan.id,
        });
      }
    }

    // 5. Update Master Plan status metadata with complete campaign info
    const masterStatusMetadata = JSON.stringify({
      type: 'MULTI_WO',
      is_master: true,
      master_plan_no: planNo,
      master_wo_id: master_work_order_id,
      master_wo_no: masterWo.work_order_no,
      master_customer: masterWo.customer_name,
      master_grade: masterWo.grade,
      master_od: masterWo.size_od,
      master_wt: masterWo.size_wt,
      master_planned_pcs,
      master_planned_mtr: calcMasterMtr,
      master_planned_mt: calcMasterMt,
      total_campaign_pcs: totalCampaignPcs,
      total_campaign_mtr: totalCampaignMtr,
      total_campaign_mt: totalCampaignMt,
      child_work_orders: childMetadataList,
    });

    await admin
      .from('rolling_plans')
      .update({ status: masterStatusMetadata })
      .eq('id', masterPlan.id);

    return NextResponse.json({
      success: true,
      plan_no: planNo,
      master_plan_id: masterPlan.id,
      child_plan_ids: childPlanIds,
      total_campaign_mtr: totalCampaignMtr,
      total_campaign_pcs: totalCampaignPcs,
      total_campaign_mt: totalCampaignMt,
      child_count: childMetadataList.length,
    });
  } catch (error: any) {
    console.error('Create multi-WO rolling plan error:', error);
    return NextResponse.json(
      { error: error?.message || 'Internal server error while creating rolling plan.' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: 'Database service is temporarily unavailable.' },
        { status: 500 }
      );
    }
    const { searchParams } = new URL(req.url);
    const planId = searchParams.get('id');
    const force = searchParams.get('force') === 'true';
    const clearLogs = searchParams.get('clear_logs') === 'true';

    if (!planId) {
      return NextResponse.json({ error: 'Plan ID is required.' }, { status: 400 });
    }

    // 1. Fetch the plan
    const { data: targetPlan, error: planErr } = await admin
      .from('rolling_plans')
      .select('*')
      .eq('id', planId)
      .single();

    if (planErr || !targetPlan) {
      return NextResponse.json({ error: 'Rolling plan not found.' }, { status: 404 });
    }

    let parsedStatus: any = {};
    try {
      parsedStatus = typeof targetPlan.status === 'string' ? JSON.parse(targetPlan.status) : targetPlan.status;
    } catch {}

    const isMaster = Boolean(parsedStatus?.is_master);
    const isChild = Boolean(parsedStatus?.is_child);

    // Collect all work order IDs and child plan IDs in the campaign (or single)
    const affectedWoIds = new Set<string>();
    const childPlanIds = new Set<string>();
    affectedWoIds.add(targetPlan.work_order_id);

    if (isMaster) {
      if (Array.isArray(parsedStatus.child_work_orders)) {
        for (const child of parsedStatus.child_work_orders) {
          if (child.work_order_id) affectedWoIds.add(child.work_order_id);
          if (child.plan_id) childPlanIds.add(child.plan_id);
        }
      }
      // Also query all rolling_plans with prefix matching targetPlan.plan_no-C%
      const { data: prefixPlans } = await admin
        .from('rolling_plans')
        .select('id, work_order_id')
        .ilike('plan_no', `${targetPlan.plan_no}-C%`);
      for (const p of prefixPlans || []) {
        childPlanIds.add(p.id);
        if (p.work_order_id) affectedWoIds.add(p.work_order_id);
      }
    }

    // Check if production has already been recorded
    const { data: logs } = await admin
      .from('production_logs')
      .select('id, work_order_id')
      .in('work_order_id', Array.from(affectedWoIds));

    const hasLogs = Boolean(logs && logs.length > 0);

    if (hasLogs && !force) {
      return NextResponse.json(
        {
          error:
            'Cannot delete plan: Production has already been logged for this work order. Use force delete with Admin override to proceed.',
          requiresForce: true,
          logsCount: logs?.length || 0,
        },
        { status: 400 }
      );
    }

    // Handle production logs if force or clearLogs
    if (hasLogs) {
      if (clearLogs) {
        // Delete logs for affected work orders
        await admin.from('production_logs').delete().in('work_order_id', Array.from(affectedWoIds));
      } else {
        // Unlink rolling_plan_id to prevent foreign key issues
        await admin
          .from('production_logs')
          .update({ rolling_plan_id: null })
          .in('work_order_id', Array.from(affectedWoIds));
      }
    }

    // If it's a Child Plan being deleted independently:
    if (isChild && parsedStatus.master_plan_id) {
      // 1. Delete this child plan
      await admin.from('rolling_plans').delete().eq('id', planId);

      // 2. Reset this child work order to 'Pending Plan'
      await admin
        .from('work_orders')
        .update({ status: 'Pending Plan' })
        .eq('id', targetPlan.work_order_id);

      // 3. Update master plan to remove this child and recalculate totals
      const { data: masterPlan } = await admin
        .from('rolling_plans')
        .select('*')
        .eq('id', parsedStatus.master_plan_id)
        .single();

      if (masterPlan) {
        let masterStatus: any = {};
        try {
          masterStatus = typeof masterPlan.status === 'string' ? JSON.parse(masterPlan.status) : masterPlan.status;
        } catch {}

        if (Array.isArray(masterStatus.child_work_orders)) {
          masterStatus.child_work_orders = masterStatus.child_work_orders.filter(
            (c: any) => c.work_order_id !== targetPlan.work_order_id && c.plan_id !== planId
          );

          // Recalculate campaign totals
          const masterPcs = Number(masterStatus.master_planned_pcs || 0);
          const masterMtr = Number(masterStatus.master_planned_mtr || 0);
          const masterMt = Number(masterStatus.master_planned_mt || 0);

          let childPcsSum = 0;
          let childMtrSum = 0;
          let childMtSum = 0;
          for (const c of masterStatus.child_work_orders) {
            childPcsSum += Number(c.planned_pcs || 0);
            childMtrSum += Number(c.planned_mtr || 0);
            childMtSum += Number(c.planned_mt || 0);
          }

          masterStatus.total_campaign_pcs = masterPcs + childPcsSum;
          masterStatus.total_campaign_mtr = Number((masterMtr + childMtrSum).toFixed(2));
          masterStatus.total_campaign_mt = Number((masterMt + childMtSum).toFixed(3));

          await admin
            .from('rolling_plans')
            .update({ status: JSON.stringify(masterStatus), updated_at: new Date().toISOString() })
            .eq('id', masterPlan.id);
        }
      }

      return NextResponse.json({
        success: true,
        message: `Child plan ${targetPlan.plan_no} deleted and campaign totals updated. Work order returned to Pending Plan.`,
      });
    }

    // If it's a Master Plan: delete all linked child plans and reset all child work orders
    if (isMaster) {
      if (childPlanIds.size > 0) {
        await admin.from('rolling_plans').delete().in('id', Array.from(childPlanIds));
      }

      // Reset all child work orders to 'Pending Plan'
      for (const woId of Array.from(affectedWoIds)) {
        if (woId !== targetPlan.work_order_id) {
          await admin
            .from('work_orders')
            .update({ status: 'Pending Plan' })
            .eq('id', woId);
        }
      }
    }

    // Delete the target plan (Master or Standalone)
    await admin.from('rolling_plans').delete().eq('id', planId);

    // Reset target work order to 'Pending Plan'
    await admin
      .from('work_orders')
      .update({ status: 'Pending Plan' })
      .eq('id', targetPlan.work_order_id);

    const message = isMaster
      ? `Master plan ${targetPlan.plan_no} and all ${childPlanIds.size} linked child plans deleted successfully. All ${affectedWoIds.size} work orders returned to 'Pending Plan'.`
      : `Rolling plan ${targetPlan.plan_no} deleted successfully. Work order returned to 'Pending Plan'.`;

    return NextResponse.json({ success: true, message });
  } catch (error: any) {
    console.error('Delete plan error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to delete rolling plan.' },
      { status: 500 }
    );
  }
}

export interface UpdateRollingPlanPayload {
  plan_id: string;
  planned_pcs: number;
  planned_rolling_date: string;
  route_id: string;
  multiple?: number;
  mh_od?: number;
  mh_wt?: number;
  mh_l1?: number;
  mh_l2?: number;
  pass_required?: number;
  force?: boolean;
  child_adjustments?: Array<{
    plan_id?: string;
    work_order_id: string;
    planned_pcs: number;
  }>;
}

export async function PUT(req: NextRequest) {
  try {
    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: 'Database service is temporarily unavailable.' },
        { status: 500 }
      );
    }

    const body: UpdateRollingPlanPayload = await req.json();
    const {
      plan_id,
      planned_pcs,
      planned_rolling_date,
      route_id,
      multiple = 1,
      mh_od,
      mh_wt,
      mh_l1,
      mh_l2,
      pass_required = 1,
      force = false,
      child_adjustments = [],
    } = body;

    if (!plan_id) {
      return NextResponse.json({ error: 'Plan ID is required.' }, { status: 400 });
    }

    if (!planned_pcs || planned_pcs <= 0) {
      return NextResponse.json(
        { error: 'Planned quantity (PCS) must be greater than zero.' },
        { status: 400 }
      );
    }

    if (!planned_rolling_date || !route_id) {
      return NextResponse.json(
        { error: 'Planned rolling date and route are required.' },
        { status: 400 }
      );
    }

    // 1. Fetch the target plan
    const { data: targetPlan, error: planErr } = await admin
      .from('rolling_plans')
      .select('*')
      .eq('id', plan_id)
      .single();

    if (planErr || !targetPlan) {
      return NextResponse.json({ error: 'Rolling plan not found.' }, { status: 404 });
    }

    // 2. Check if production has already been logged for this work order and route
    const { data: logs } = await admin
      .from('production_logs')
      .select('id')
      .eq('work_order_id', targetPlan.work_order_id)
      .eq('process_route_id', targetPlan.process_route_id)
      .limit(1);

    if (logs && logs.length > 0 && !force) {
      return NextResponse.json(
        {
          error:
            'Rolling Plan cannot be modified because production has already been recorded for this Work Order and route. Please confirm override to update specifications.',
          requiresForce: true,
        },
        { status: 400 }
      );
    }

    // 3. Fetch target work order to compute metrics
    const { data: targetWo } = await admin
      .from('work_orders')
      .select('*')
      .eq('id', targetPlan.work_order_id)
      .single();

    // Mother Hollow dimensions take priority for calculating planned MTR and MT
    const effMhOd = (mh_od != null && !isNaN(Number(mh_od)) && Number(mh_od) > 0)
      ? Number(mh_od)
      : Number(targetPlan.mh_od || targetWo?.size_od || 0);
    const effMhWt = (mh_wt != null && !isNaN(Number(mh_wt)) && Number(mh_wt) > 0)
      ? Number(mh_wt)
      : Number(targetPlan.mh_wt || targetWo?.size_wt || 0);
    const effMhL1 = (mh_l1 != null && !isNaN(Number(mh_l1)) && Number(mh_l1) > 0)
      ? Number(mh_l1)
      : Number(targetPlan.mh_l1 || targetWo?.l1 || 0);
    const effMhL2 = (mh_l2 != null && !isNaN(Number(mh_l2)) && Number(mh_l2) > 0)
      ? Number(mh_l2)
      : Number(targetPlan.mh_l2 || targetWo?.l2 || 0);

    const targetAvg = (effMhL1 > 0 && effMhL2 > 0)
      ? (effMhL1 + effMhL2) / 2
      : (effMhL1 > 0 ? effMhL1 : (effMhL2 > 0 ? effMhL2 : (Number(targetWo?.l1 || 0) && Number(targetWo?.l2 || 0) ? (Number(targetWo.l1) + Number(targetWo.l2)) / 2 : 6.0)));
    const targetMtr = Number((planned_pcs * targetAvg).toFixed(2));
    const targetMt = Number(
      (Math.max(effMhOd - effMhWt, 0) * Math.max(effMhWt, 0) * 0.0246615 * 0.001 * targetMtr).toFixed(3)
    );

    // 4. Parse status to determine if Master, Child, or Standalone
    let parsedStatus: any = {};
    try {
      parsedStatus =
        typeof targetPlan.status === 'string'
          ? JSON.parse(targetPlan.status)
          : targetPlan.status || {};
    } catch {}

    const isMaster = Boolean(parsedStatus.is_master || (parsedStatus.child_work_orders && parsedStatus.child_work_orders.length > 0));
    const isChild = Boolean(parsedStatus.is_child && parsedStatus.master_plan_id);

    // ==========================================
    // CASE 1: TARGET PLAN IS A MASTER PLAN
    // ==========================================
    if (isMaster) {
      const masterUpdateObj: any = {
        planned_qty: targetMtr,
        planned_rolling_date,
        process_route_id: route_id,
        multiple: Number(multiple) || 1,
        updated_at: new Date().toISOString(),
      };
      if (mh_od != null && !isNaN(Number(mh_od))) masterUpdateObj.mh_od = Number(mh_od);
      if (mh_wt != null && !isNaN(Number(mh_wt))) masterUpdateObj.mh_wt = Number(mh_wt);
      if (mh_l1 != null && !isNaN(Number(mh_l1))) masterUpdateObj.mh_l1 = Number(mh_l1);
      if (mh_l2 != null && !isNaN(Number(mh_l2))) masterUpdateObj.mh_l2 = Number(mh_l2);
      if (pass_required != null && !isNaN(Number(pass_required))) masterUpdateObj.pass_required = Number(pass_required);

      // Find all linked child plans by prefix or master_plan_id
      const { data: childPlans } = await admin
        .from('rolling_plans')
        .select('*')
        .ilike('plan_no', `${targetPlan.plan_no}-C%`);

      const updatedChildMetadata: any[] = [];
      const children = childPlans || [];

      for (const cp of children) {
        // Check if there is an explicit adjustment for this child order
        const childAdj = child_adjustments?.find(
          (a) => a.plan_id === cp.id || a.work_order_id === cp.work_order_id
        );

        // Fetch child work order
        const { data: childWo } = await admin
          .from('work_orders')
          .select('*')
          .eq('id', cp.work_order_id)
          .single();

        const cl1 = Number(childWo?.l1 || 0);
        const cl2 = Number(childWo?.l2 || 0);
        const childAvg = (effMhL1 > 0 && effMhL2 > 0)
          ? (effMhL1 + effMhL2) / 2
          : (effMhL1 > 0 ? effMhL1 : (effMhL2 > 0 ? effMhL2 : (cl1 > 0 && cl2 > 0 ? (cl1 + cl2) / 2 : 6.0)));

        let childPcs: number;
        if (childAdj && Number(childAdj.planned_pcs) > 0) {
          childPcs = Number(childAdj.planned_pcs);
        } else {
          let cpStatus: any = {};
          try {
            cpStatus = typeof cp.status === 'string' ? JSON.parse(cp.status) : cp.status || {};
          } catch {}
          childPcs = Number(cpStatus.planned_pcs) || Math.round(Number(cp.planned_qty || 0) / (childAvg || 1));
        }

        const childMtr = Number((childPcs * childAvg).toFixed(2));
        const childMt = Number(
          (Math.max(effMhOd - effMhWt, 0) * Math.max(effMhWt, 0) * 0.0246615 * 0.001 * childMtr).toFixed(3)
        );

        // Update child plan: synchronize rolling date, route, mother hollow specs, multiple, pass_required
        const childUpdateObj: any = {
          planned_qty: childMtr,
          planned_rolling_date, // synchronized with master
          process_route_id: route_id, // synchronized with master
          multiple: Number(multiple) || 1, // synchronized with master
          updated_at: new Date().toISOString(),
        };
        if (effMhOd > 0) childUpdateObj.mh_od = effMhOd;
        if (effMhWt > 0) childUpdateObj.mh_wt = effMhWt;
        if (effMhL1 > 0) childUpdateObj.mh_l1 = effMhL1;
        if (effMhL2 > 0) childUpdateObj.mh_l2 = effMhL2;
        if (pass_required != null && !isNaN(Number(pass_required))) childUpdateObj.pass_required = Number(pass_required);

        let cpStatus: any = {};
        try {
          cpStatus = typeof cp.status === 'string' ? JSON.parse(cp.status) : cp.status || {};
        } catch {}

        cpStatus.type = 'MULTI_WO';
        cpStatus.is_child = true;
        cpStatus.master_plan_id = targetPlan.id;
        cpStatus.master_plan_no = targetPlan.plan_no;
        cpStatus.master_wo_id = targetPlan.work_order_id;
        cpStatus.master_wo_no = targetWo?.work_order_no;
        cpStatus.planned_pcs = childPcs;
        cpStatus.planned_mtr = childMtr;
        cpStatus.planned_mt = childMt;
        childUpdateObj.status = JSON.stringify(cpStatus);

        await admin.from('rolling_plans').update(childUpdateObj).eq('id', cp.id);

        updatedChildMetadata.push({
          work_order_id: cp.work_order_id,
          work_order_no: childWo?.work_order_no || '',
          customer_name: childWo?.customer_name ?? null,
          grade: childWo?.grade ?? null,
          size_od: childWo?.size_od ?? null,
          size_wt: childWo?.size_wt ?? null,
          l1: childWo?.l1 ?? null,
          l2: childWo?.l2 ?? null,
          planned_pcs: childPcs,
          planned_mtr: childMtr,
          planned_mt: childMt,
          plan_id: cp.id,
        });
      }

      // Recalculate campaign totals
      const totalCampaignPcs = planned_pcs + updatedChildMetadata.reduce((sum, c) => sum + c.planned_pcs, 0);
      const totalCampaignMtr = Number(
        (targetMtr + updatedChildMetadata.reduce((sum, c) => sum + c.planned_mtr, 0)).toFixed(2)
      );
      const totalCampaignMt = Number(
        (targetMt + updatedChildMetadata.reduce((sum, c) => sum + c.planned_mt, 0)).toFixed(3)
      );

      parsedStatus.master_planned_pcs = planned_pcs;
      parsedStatus.master_planned_mtr = targetMtr;
      parsedStatus.master_planned_mt = targetMt;
      parsedStatus.total_campaign_pcs = totalCampaignPcs;
      parsedStatus.total_campaign_mtr = totalCampaignMtr;
      parsedStatus.total_campaign_mt = totalCampaignMt;
      parsedStatus.child_work_orders = updatedChildMetadata;

      masterUpdateObj.status = JSON.stringify(parsedStatus);
      await admin.from('rolling_plans').update(masterUpdateObj).eq('id', targetPlan.id);

      return NextResponse.json({
        success: true,
        message: `Master plan and ${updatedChildMetadata.length} linked child plan(s) updated successfully.`,
        plan_no: targetPlan.plan_no,
        total_campaign_mtr: totalCampaignMtr,
        total_campaign_pcs: totalCampaignPcs,
        total_campaign_mt: totalCampaignMt,
        child_count: updatedChildMetadata.length,
      });
    }

    // ==========================================
    // CASE 2: TARGET PLAN IS A CHILD PLAN
    // ==========================================
    if (isChild && parsedStatus.master_plan_id) {
      const childUpdateObj: any = {
        planned_qty: targetMtr,
        planned_rolling_date,
        process_route_id: route_id,
        multiple: Number(multiple) || 1,
        updated_at: new Date().toISOString(),
      };
      if (effMhOd > 0) childUpdateObj.mh_od = effMhOd;
      if (effMhWt > 0) childUpdateObj.mh_wt = effMhWt;
      if (effMhL1 > 0) childUpdateObj.mh_l1 = effMhL1;
      if (effMhL2 > 0) childUpdateObj.mh_l2 = effMhL2;
      if (pass_required != null && !isNaN(Number(pass_required))) childUpdateObj.pass_required = Number(pass_required);

      parsedStatus.planned_pcs = planned_pcs;
      parsedStatus.planned_mtr = targetMtr;
      parsedStatus.planned_mt = targetMt;
      childUpdateObj.status = JSON.stringify(parsedStatus);

      await admin.from('rolling_plans').update(childUpdateObj).eq('id', targetPlan.id);

      // Fetch master plan to update its child_work_orders array and recalculate totals
      const { data: masterPlan } = await admin
        .from('rolling_plans')
        .select('*')
        .eq('id', parsedStatus.master_plan_id)
        .single();

      if (masterPlan) {
        let masterStatus: any = {};
        try {
          masterStatus = typeof masterPlan.status === 'string' ? JSON.parse(masterPlan.status) : masterPlan.status || {};
        } catch {}

        if (Array.isArray(masterStatus.child_work_orders)) {
          masterStatus.child_work_orders = masterStatus.child_work_orders.map((c: any) => {
            if (c.plan_id === targetPlan.id || c.work_order_id === targetPlan.work_order_id) {
              return {
                ...c,
                planned_pcs,
                planned_mtr: targetMtr,
                planned_mt: targetMt,
              };
            }
            return c;
          });

          const masterPcs = Number(masterStatus.master_planned_pcs || 0);
          const masterMtr = Number(masterStatus.master_planned_mtr || masterPlan.planned_qty || 0);
          const masterMt = Number(masterStatus.master_planned_mt || 0);

          const childPcsSum = masterStatus.child_work_orders.reduce((sum: number, c: any) => sum + Number(c.planned_pcs || 0), 0);
          const childMtrSum = masterStatus.child_work_orders.reduce((sum: number, c: any) => sum + Number(c.planned_mtr || 0), 0);
          const childMtSum = masterStatus.child_work_orders.reduce((sum: number, c: any) => sum + Number(c.planned_mt || 0), 0);

          masterStatus.total_campaign_pcs = masterPcs + childPcsSum;
          masterStatus.total_campaign_mtr = Number((masterMtr + childMtrSum).toFixed(2));
          masterStatus.total_campaign_mt = Number((masterMt + childMtSum).toFixed(3));

          await admin
            .from('rolling_plans')
            .update({ status: JSON.stringify(masterStatus), updated_at: new Date().toISOString() })
            .eq('id', masterPlan.id);
        }
      }

      return NextResponse.json({
        success: true,
        message: 'Child rolling plan updated and parent campaign synchronized successfully.',
      });
    }

    // ==========================================
    // CASE 3: STANDALONE PLAN
    // ==========================================
    const standaloneUpdateObj: any = {
      planned_qty: targetMtr,
      planned_rolling_date,
      process_route_id: route_id,
      multiple: Number(multiple) || 1,
      updated_at: new Date().toISOString(),
    };
    if (effMhOd > 0) standaloneUpdateObj.mh_od = effMhOd;
    if (effMhWt > 0) standaloneUpdateObj.mh_wt = effMhWt;
    if (effMhL1 > 0) standaloneUpdateObj.mh_l1 = effMhL1;
    if (effMhL2 > 0) standaloneUpdateObj.mh_l2 = effMhL2;
    if (pass_required != null && !isNaN(Number(pass_required))) standaloneUpdateObj.pass_required = Number(pass_required);

    parsedStatus.planned_pcs = planned_pcs;
    parsedStatus.planned_mtr = targetMtr;
    parsedStatus.planned_mt = targetMt;
    standaloneUpdateObj.status = JSON.stringify(parsedStatus);

    await admin.from('rolling_plans').update(standaloneUpdateObj).eq('id', targetPlan.id);

    return NextResponse.json({
      success: true,
      message: 'Rolling plan updated successfully.',
    });
  } catch (error: any) {
    console.error('Update rolling plan error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to update rolling plan.' },
      { status: 500 }
    );
  }
}

