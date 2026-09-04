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

    // 2. Calculate Total Campaign Quantities
    const totalChildMtr = child_work_orders.reduce((sum, c) => sum + Number(c.planned_mtr || 0), 0);
    const totalChildPcs = child_work_orders.reduce((sum, c) => sum + Number(c.planned_pcs || 0), 0);
    const totalChildMt = child_work_orders.reduce((sum, c) => sum + Number(c.planned_mt || 0), 0);

    const totalCampaignMtr = master_planned_mtr + totalChildMtr;
    const totalCampaignPcs = master_planned_pcs + totalChildPcs;
    const totalCampaignMt = master_planned_mt + totalChildMt;

    // 3. Create the Master Rolling Plan using RPC to ensure proper sequence & trigger handling
    const { data: planNoData, error: planRpcErr } = await admin.rpc(
      'create_rolling_plan',
      {
        p_work_order_id: master_work_order_id,
        p_planned_qty: master_planned_mtr,
        p_rolling_date: rolling_date,
        p_route_id: route_id,
        p_mh_od: mh_od,
        p_mh_wt: mh_wt,
        p_mh_l1: mh_l1,
        p_mh_l2: mh_l2,
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

    for (const child of child_work_orders) {
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
          mh_od: mh_od,
          mh_wt: mh_wt,
          mh_l1: mh_l1,
          mh_l2: mh_l2,
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
      master_planned_mtr,
      master_planned_mt,
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

    // Check if production has already been recorded
    const { data: logs, error: logsErr } = await admin
      .from('production_logs')
      .select('id')
      .eq('work_order_id', targetPlan.work_order_id)
      .limit(1);

    if (logs && logs.length > 0) {
      return NextResponse.json(
        { error: 'Cannot delete plan: Production has already been logged for this work order.' },
        { status: 400 }
      );
    }

    let parsedStatus: any = {};
    try {
      parsedStatus = JSON.parse(targetPlan.status);
    } catch {}

    // If it's a Master plan, find and delete all linked child plans as well
    if (parsedStatus.is_master && Array.isArray(parsedStatus.child_work_orders)) {
      for (const child of parsedStatus.child_work_orders) {
        if (child.plan_id) {
          await admin.from('rolling_plans').delete().eq('id', child.plan_id);
        } else {
          // Delete by work order ID and matching plan_no prefix
          await admin
            .from('rolling_plans')
            .delete()
            .eq('work_order_id', child.work_order_id)
            .ilike('plan_no', `${targetPlan.plan_no}-C%`);
        }

        // Check if child has other plans
        const { data: remainingPlans } = await admin
          .from('rolling_plans')
          .select('id')
          .eq('work_order_id', child.work_order_id);

        if (!remainingPlans || remainingPlans.length === 0) {
          await admin
            .from('work_orders')
            .update({ status: 'Pending Plan' })
            .eq('id', child.work_order_id);
        }
      }
    }

    // Delete the target plan
    await admin.from('rolling_plans').delete().eq('id', planId);

    // If no plans remain for target work order, reset to Pending Plan
    const { data: targetRemaining } = await admin
      .from('rolling_plans')
      .select('id')
      .eq('work_order_id', targetPlan.work_order_id);

    if (!targetRemaining || targetRemaining.length === 0) {
      await admin
        .from('work_orders')
        .update({ status: 'Pending Plan' })
        .eq('id', targetPlan.work_order_id);
    }

    return NextResponse.json({ success: true, message: 'Plan deleted successfully.' });
  } catch (error: any) {
    console.error('Delete plan error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to delete rolling plan.' },
      { status: 500 }
    );
  }
}
