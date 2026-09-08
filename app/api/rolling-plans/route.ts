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
  // Factory sheet fields
  catg?: string;
  finish_size?: string;
  final_len?: string;
  hollow_len?: string;
  htc_mtr?: number;
  alloc_tag?: string;
}

export interface MasterGroupPayload {
  master_work_order_id: string;
  master_planned_pcs: number;
  master_planned_mtr?: number;
  master_planned_mt?: number;
  child_work_orders?: ChildWoPayload[];

  // Mother hollow & pass overrides
  mh_od?: number | null;
  mh_wt?: number | null;
  mh_l1?: number | null;
  mh_l2?: number | null;
  pass_required?: number | null;

  // Factory parameters & Process Route
  route_id?: string | null;
  catg?: string; // e.g. 'CDS'
  spec?: string;
  grade?: string;
  ibr_status?: string; // 'IBR' | 'NIBR'
  rolling_mtr?: number;

  // Billet Dimensions
  rm_od?: number | null;
  rm_len_min?: number | null;
  rm_len_max?: number | null;
  weight_kg?: number | null;
  billet_wt_whf?: number | null;

  // Plan Qty
  plan_qty_nos?: number | null;
  plan_qty_mton?: number | null;

  // Piercer Mill
  pm_od?: number | null;
  pm_wt?: number | null;
  pm_kg_mtr?: number | null;
  pm_len?: number | null;

  // SM (Sizing Mill / Hot Hollow)
  wt_wbf?: number | null;
  cust_od?: number | null;
  cust_wt?: number | null;
  rolling_wt?: number | null;
  sm_kg_mtr?: number | null;
  sm_len?: number | null;

  // Thicken Ends
  fe_len?: number | null;
  fe_wg?: number | null;
  be_len?: number | null;
  be_wg?: number | null;
  effective_wg?: number | null;
  eff_len?: number | null;

  // Final Length Reqd
  req_len_er?: string | null;
  er_status?: string | null;
  req_len_min?: number | null;
  req_len_max?: number | null;

  // Multiple & Yield
  multiple_str?: string | null;
  multiple?: number | null;
  tol_od_min?: number | null;
  tol_od_max?: number | null;
  tol_wt_min?: number | null;
  tol_wt_max?: number | null;
  process_yield_pct?: number | null;
}

export interface CreateMultiWoRollingPlanPayload {
  master_groups?: MasterGroupPayload[];

  // Legacy single-master fields
  master_work_order_id?: string;
  master_planned_pcs?: number;
  master_planned_mtr?: number;
  master_planned_mt?: number;
  child_work_orders?: ChildWoPayload[];

  // Common metadata
  plan_no_override?: string;
  mill_name?: string;
  month_str?: string;
  prev_plan_no?: string;
  rolling_date: string;
  route_id: string;

  // Hollow specs
  mh_od?: number;
  mh_wt?: number;
  mh_l1?: number;
  mh_l2?: number;
  pass_required?: number;
  multiple?: number;
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
      rolling_date,
      route_id,
      mh_od = 47.0,
      mh_wt = 5.75,
      mh_l1 = 6.0,
      mh_l2 = 6.5,
      pass_required = 1,
      multiple = 1,
      plan_no_override,
      mill_name = 'Hot Mill-02',
      month_str,
      prev_plan_no,
    } = body;

    if (!route_id || !rolling_date) {
      return NextResponse.json(
        { error: 'Process route and rolling date are required.' },
        { status: 400 }
      );
    }

    // Determine Master Groups (multi-master or legacy single master)
    let masterGroups: MasterGroupPayload[] = [];
    if (Array.isArray(body.master_groups) && body.master_groups.length > 0) {
      masterGroups = body.master_groups;
    } else if (body.master_work_order_id) {
      masterGroups = [
        {
          master_work_order_id: body.master_work_order_id,
          master_planned_pcs: body.master_planned_pcs || 0,
          master_planned_mtr: body.master_planned_mtr || 0,
          master_planned_mt: body.master_planned_mt || 0,
          child_work_orders: body.child_work_orders || [],
          mh_od,
          mh_wt,
          mh_l1,
          mh_l2,
          pass_required,
          multiple,
        } as any,
      ];
    }

    if (masterGroups.length === 0) {
      return NextResponse.json(
        { error: 'Please include at least one Master Work Order group.' },
        { status: 400 }
      );
    }

    // Collect all involved Work Order IDs
    const allWoIds = new Set<string>();
    for (const g of masterGroups) {
      if (g.master_work_order_id) allWoIds.add(g.master_work_order_id);
      for (const c of g.child_work_orders || []) {
        if (c.id) allWoIds.add(c.id);
      }
    }

    const { data: woRows, error: woErr } = await admin
      .from('work_orders')
      .select('*')
      .in('id', Array.from(allWoIds));

    if (woErr || !woRows) {
      return NextResponse.json(
        { error: 'Failed to fetch Work Order details from database.' },
        { status: 500 }
      );
    }

    const woMap = new Map<string, any>();
    woRows.forEach((w) => woMap.set(w.id, w));

    // Determine Base Campaign Plan Number
    let basePlanNo = plan_no_override?.trim() || '';
    if (!basePlanNo) {
      const now = new Date();
      const yr = now.getFullYear();
      const mo = String(now.getMonth() + 1).padStart(2, '0');
      const da = String(now.getDate()).padStart(2, '0');
      const hr = String(now.getHours()).padStart(2, '0');
      const mi = String(now.getMinutes()).padStart(2, '0');
      const se = String(now.getSeconds()).padStart(2, '0');
      const ms = String(now.getMilliseconds()).padStart(3, '0');
      basePlanNo = `RP-${yr}${mo}${da}${hr}${mi}${se}${ms}`;
    }

    // Track all created plan IDs
    const allMasterPlanIds: string[] = [];
    const allChildPlanIds: string[] = [];
    let grandTotalPcs = 0;
    let grandTotalMtr = 0;
    let grandTotalMt = 0;
    let totalChildCount = 0;

    // Process each Master Group
    for (let gIdx = 0; gIdx < masterGroups.length; gIdx++) {
      const g = masterGroups[gIdx];
      const masterWo = woMap.get(g.master_work_order_id);
      if (!masterWo) {
        throw new Error(`Master Work Order ${g.master_work_order_id} not found.`);
      }

      // Hollow dimensions for this group
      const grpCustOd = Number(g.cust_od || g.mh_od || mh_od || masterWo.size_od || 0);
      const grpCustWt = Number(g.cust_wt || g.rolling_wt || g.mh_wt || mh_wt || masterWo.size_wt || 0);
      const rawSmLen = Number(g.sm_len || g.eff_len || g.mh_l1 || mh_l1 || 6.0);
      const grpSmLen = rawSmLen > 50 ? Number((rawSmLen / 1000).toFixed(2)) : rawSmLen;
      const grpAvgLen = grpSmLen > 0 ? grpSmLen : 6.0;

      const calcHollowMtr = (pcs: number) => Number((pcs * grpAvgLen).toFixed(2));
      const calcHollowMt = (mtr: number) =>
        Number((Math.max(grpCustOd - grpCustWt, 0) * Math.max(grpCustWt, 0) * 0.0246615 * 0.001 * mtr).toFixed(3));

      // Master calculations
      const mPcs = Number(g.master_planned_pcs || 0);
      const mMtr = mPcs > 0 ? calcHollowMtr(mPcs) : Number(g.master_planned_mtr || 0);
      const mMt = calcHollowMt(mMtr);

      // Child calculations
      const childList = g.child_work_orders || [];
      const processedChildren = childList.map((c) => {
        const cPcs = Number(c.planned_pcs || 0);
        const cMtr = cPcs > 0 ? calcHollowMtr(cPcs) : Number(c.planned_mtr || c.htc_mtr || 0);
        const cMt = calcHollowMt(cMtr);
        return {
          ...c,
          planned_pcs: cPcs,
          planned_mtr: cMtr,
          planned_mt: cMt,
        };
      });

      const gChildPcs = processedChildren.reduce((sum, c) => sum + c.planned_pcs, 0);
      const gChildMtr = processedChildren.reduce((sum, c) => sum + c.planned_mtr, 0);
      const gChildMt = processedChildren.reduce((sum, c) => sum + c.planned_mt, 0);

      const gTotalPcs = mPcs + gChildPcs;
      const gTotalMtr = Number((mMtr + gChildMtr).toFixed(2));
      const gTotalMt = Number((mMt + gChildMt).toFixed(3));

      grandTotalPcs += gTotalPcs;
      grandTotalMtr += gTotalMtr;
      grandTotalMt += gTotalMt;
      totalChildCount += processedChildren.length;

      // Plan number for this Master:
      // If 1 group: basePlanNo
      // If multiple groups: `${basePlanNo}-M${gIdx + 1}`
      const masterPlanNo = masterGroups.length === 1 ? basePlanNo : `${basePlanNo}-M${gIdx + 1}`;

      // Insert Master Rolling Plan
      const { data: createdMasterPlan, error: mPlanErr } = await admin
        .from('rolling_plans')
        .insert({
          plan_no: masterPlanNo,
          work_order_id: masterWo.id,
          planned_rolling_date: rolling_date,
          planned_qty: mMtr > 0 ? mMtr : gTotalMtr,
          process_route_id: g.route_id || route_id,
          multiple: Number(g.multiple || multiple || 1),
          mh_od: grpCustOd,
          mh_wt: grpCustWt,
          mh_l1: grpSmLen,
          mh_l2: grpSmLen,
          pass_required: Number(g.pass_required || pass_required || 1),
          status: 'Scheduled',
        })
        .select()
        .single();

      if (mPlanErr || !createdMasterPlan) {
        throw new Error(`Failed to create master rolling plan ${masterPlanNo}: ${mPlanErr?.message}`);
      }

      allMasterPlanIds.push(createdMasterPlan.id);

      // Update master WO status to Scheduled
      await admin
        .from('work_orders')
        .update({ status: 'Scheduled' })
        .eq('id', masterWo.id)
        .eq('status', 'Pending Plan');

      // Create Child Rolling Plans
      const childMetadataList: any[] = [];
      for (let cIdx = 0; cIdx < processedChildren.length; cIdx++) {
        const c = processedChildren[cIdx];
        const childWo = woMap.get(c.id);

        const childPlanNo =
          masterGroups.length === 1
            ? `${basePlanNo}-C${cIdx + 1}`
            : `${basePlanNo}-M${gIdx + 1}-C${cIdx + 1}`;

        const childStatusMetadata = JSON.stringify({
          type: 'MULTI_WO',
          is_child: true,
          lifecycle_status: 'DRAFT',
          revision_no: 0,
          campaign_plan_no: basePlanNo,
          master_plan_id: createdMasterPlan.id,
          master_plan_no: masterPlanNo,
          master_wo_id: masterWo.id,
          master_wo_no: masterWo.work_order_no,
          planned_pcs: c.planned_pcs,
          planned_mtr: c.planned_mtr,
          planned_mt: c.planned_mt,
          catg: c.catg || g.catg || 'CDS',
          finish_size: c.finish_size || `${childWo?.size_od || 0}x${childWo?.size_wt || 0}`,
          final_len: c.final_len || `${childWo?.l1 || 0}-${childWo?.l2 || 0}`,
          hollow_len: c.hollow_len || `${grpSmLen}-${grpSmLen}`,
          htc_mtr: c.planned_mtr,
          alloc_tag: c.alloc_tag || `${cIdx + 1}`,
        });

        const { data: createdChildPlan, error: cPlanErr } = await admin
          .from('rolling_plans')
          .insert({
            plan_no: childPlanNo,
            work_order_id: c.id,
            planned_rolling_date: rolling_date,
            planned_qty: c.planned_mtr,
            process_route_id: g.route_id || route_id,
            multiple: Number(g.multiple || multiple || 1),
            mh_od: grpCustOd,
            mh_wt: grpCustWt,
            mh_l1: grpSmLen,
            mh_l2: grpSmLen,
            pass_required: Number(g.pass_required || pass_required || 1),
            status: childStatusMetadata,
          })
          .select()
          .single();

        if (cPlanErr) {
          console.error(`Error inserting child plan ${childPlanNo}:`, cPlanErr);
        } else if (createdChildPlan) {
          allChildPlanIds.push(createdChildPlan.id);

          await admin
            .from('work_orders')
            .update({ status: 'Scheduled' })
            .eq('id', c.id)
            .eq('status', 'Pending Plan');

          childMetadataList.push({
            work_order_id: c.id,
            work_order_no: c.work_order_no,
            customer_name: c.customer_name ?? childWo?.customer_name ?? null,
            grade: c.grade ?? childWo?.grade ?? null,
            size_od: c.size_od ?? childWo?.size_od ?? null,
            size_wt: c.size_wt ?? childWo?.size_wt ?? null,
            l1: c.l1 ?? childWo?.l1 ?? null,
            l2: c.l2 ?? childWo?.l2 ?? null,
            planned_pcs: c.planned_pcs,
            planned_mtr: c.planned_mtr,
            planned_mt: c.planned_mt,
            plan_id: createdChildPlan.id,
            plan_no: childPlanNo,
            catg: c.catg || g.catg || 'CDS',
            finish_size: c.finish_size || `${childWo?.size_od || 0}x${childWo?.size_wt || 0}`,
            final_len: c.final_len || `${childWo?.l1 || 0}-${childWo?.l2 || 0}`,
            hollow_len: c.hollow_len || `${grpSmLen}-${grpSmLen}`,
            htc_mtr: c.planned_mtr,
            alloc_tag: c.alloc_tag || `${cIdx + 1}`,
          });
        }
      }

      const rawRmLenMin = Number(g.rm_len_min || (masterWo.l1 ? Number(masterWo.l1) / 3.5 : 1.89));
      const grpRmLenMin = rawRmLenMin > 20 ? Number((rawRmLenMin / 1000).toFixed(3)) : rawRmLenMin;

      const rawRmLenMax = Number(g.rm_len_max || (masterWo.l2 ? Number(masterWo.l2) / 3.5 : 1.895));
      const grpRmLenMax = rawRmLenMax > 20 ? Number((rawRmLenMax / 1000).toFixed(3)) : (rawRmLenMax || grpRmLenMin);

      const grpWeightKg = Number(g.weight_kg && Number(g.weight_kg) < 1000 ? g.weight_kg : ((((Number(g.rm_od || 63) ** 2) * 3.14 * 0.007856) / 4) * grpRmLenMin).toFixed(3));
      const grpBilletWtWhf = Number((grpWeightKg * 0.97).toFixed(3));

      const grpPmOd = Number(g.pm_od || (Number(g.rm_od) === 63 ? 66.0 : 66.0));
      const grpPmWt = Number(g.pm_wt || (grpCustWt > 0.25 ? Number((grpCustWt - 0.25).toFixed(2)) : 6.00));
      const grpPmKgMtr = Number(g.pm_kg_mtr || ((grpPmOd - grpPmWt) * grpPmWt * 0.02467).toFixed(3));
      const grpPmLen = Number(g.pm_len || (grpPmKgMtr > 0 ? (grpBilletWtWhf / grpPmKgMtr).toFixed(2) : 5.37));

      // Update Master Plan status metadata with complete factory details
      const masterStatusMetadata = JSON.stringify({
        type: 'MULTI_WO',
        is_master: true,
        lifecycle_status: 'DRAFT',
        revision_no: 0,
        campaign_plan_no: basePlanNo,
        master_plan_no: masterPlanNo,
        mill_name,
        month_str: month_str || 'Sep-26',
        prev_plan_no: prev_plan_no || '',
        catg: g.catg || 'CDS',
        spec: g.spec || masterWo.specification || '',
        grade: g.grade || masterWo.grade || '',
        ibr_status: g.ibr_status || 'IBR',
        rolling_mtr: gTotalMtr,
        billet: {
          rm_od: Number(g.rm_od || 63.0),
          rm_len_min: grpRmLenMin,
          rm_len_max: grpRmLenMax,
          weight_kg: grpWeightKg,
          billet_wt_whf: grpBilletWtWhf,
        },
        plan_qty: {
          nos: gTotalPcs,
          mton: Number(((grpWeightKg * gTotalPcs) / 1000).toFixed(2)),
        },
        piercer_mill: {
          pm_od: grpPmOd,
          pm_wt: grpPmWt,
          pm_kg_mtr: grpPmKgMtr,
          pm_len: grpPmLen,
        },
        sm: {
          wt_wbf: grpBilletWtWhf,
          cust_od: grpCustOd,
          cust_wt: grpCustWt,
          rolling_wt: Number(g.rolling_wt || grpCustWt),
          sm_kg_mtr: Number(g.sm_kg_mtr || 0),
          sm_len: grpSmLen,
        },
        thicken_ends: {
          fe_len: Number(g.fe_len || 0),
          fe_wg: Number(g.fe_wg || 0),
          be_len: Number(g.be_len || 0),
          be_wg: Number(g.be_wg || 0),
          effective_wg: Number(g.effective_wg || grpBilletWtWhf),
          eff_len: Number(g.eff_len || grpSmLen),
        },
        final_length: {
          er: g.req_len_er || g.er_status || 'EL',
          min: Number(g.req_len_min || masterWo.l1 || 7.55),
          max: Number(g.req_len_max || masterWo.l2 || 7.55),
        },
        // Direct root fields matching 35-column specification
        rm_od: Number(g.rm_od || 63.0),
        rm_len_min: grpRmLenMin,
        rm_len_max: grpRmLenMax,
        weight_kg: grpWeightKg,
        billet_wt_whf: grpBilletWtWhf,
        pm_od: grpPmOd,
        pm_wt: grpPmWt,
        pm_kg_mtr: grpPmKgMtr,
        pm_len: grpPmLen,
        wt_wbf: grpBilletWtWhf,
        cust_od: grpCustOd,
        cust_wt: grpCustWt,
        rolling_wt: Number(g.rolling_wt || grpCustWt),
        sm_kg_mtr: Number(g.sm_kg_mtr || 0),
        sm_len: grpSmLen,
        fe_len: Number(g.fe_len || 0),
        fe_wg: Number(g.fe_wg || 0),
        be_len: Number(g.be_len || 0),
        be_wg: Number(g.be_wg || 0),
        effective_wg: Number(g.effective_wg || 0),
        eff_len: Number(g.eff_len || grpSmLen),
        req_len_er: g.req_len_er || g.er_status || 'EL',
        req_len_min: Number(g.req_len_min || masterWo.l1 || 7.55),
        req_len_max: Number(g.req_len_max || masterWo.l2 || 7.55),
        multiple: Number(g.multiple || multiple || 1),
        multiple_str: g.multiple_str || (Number(g.multiple || multiple) === 2 ? '2-Multi' : '1'),
        tolerances: {
          od_min: Number(g.tol_od_min || (grpCustOd - 0.4)),
          od_max: Number(g.tol_od_max || (grpCustOd + 0.4)),
          wt_min: Number(g.tol_wt_min || (grpCustWt * 0.92)),
          wt_max: Number(g.tol_wt_max || (grpCustWt * 1.1)),
        },
        process_yield_pct: Number(g.process_yield_pct || 95.5),
        master_wo_id: masterWo.id,
        master_wo_no: masterWo.work_order_no,
        master_customer: masterWo.customer_name,
        master_grade: masterWo.grade,
        master_od: masterWo.size_od,
        master_wt: masterWo.size_wt,
        master_planned_pcs: mPcs,
        master_planned_mtr: mMtr,
        master_planned_mt: mMt,
        total_group_pcs: gTotalPcs,
        total_group_mtr: gTotalMtr,
        total_group_mt: gTotalMt,
        child_work_orders: childMetadataList,
        group_index: gIdx + 1,
        total_master_groups: masterGroups.length,
      });

      await admin
        .from('rolling_plans')
        .update({ status: masterStatusMetadata })
        .eq('id', createdMasterPlan.id);
    }

    return NextResponse.json({
      success: true,
      plan_no: basePlanNo,
      master_count: masterGroups.length,
      child_count: totalChildCount,
      total_campaign_pcs: grandTotalPcs,
      total_campaign_mtr: Number(grandTotalMtr.toFixed(2)),
      total_campaign_mt: Number(grandTotalMt.toFixed(3)),
      master_plan_ids: allMasterPlanIds,
      child_plan_ids: allChildPlanIds,
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
  multiple_str?: string;
  mh_od?: number;
  mh_wt?: number;
  mh_l1?: number;
  mh_l2?: number;
  pass_required?: number;
  force?: boolean;

  // Setup Specifications (35 Columns)
  catg?: string;
  spec?: string;
  grade?: string;
  ibr_status?: string;
  rm_od?: number;
  rm_len_min?: number;
  rm_len_max?: number;
  pm_od?: number;
  pm_wt?: number;
  cust_od?: number;
  cust_wt?: number;
  rolling_wt?: number;
  fe_len?: number;
  be_len?: number;
  req_len_er?: string;
  req_len_min?: number;
  req_len_max?: number;

  // Tolerances & Yield
  tol_od_min?: number;
  tol_od_max?: number;
  tol_wt_min?: number;
  tol_wt_max?: number;
  process_yield_pct?: number;

  // Lifecycle actions
  lifecycle_action?: 'ISSUE' | 'REVISE' | 'CLOSE_PARTIAL' | 'EDIT';
  revision_reason?: string;
  close_reason?: string;
  actual_pcs?: number;

  child_adjustments?: Array<{
    plan_id?: string;
    work_order_id: string;
    planned_pcs: number;
    catg?: string;
    finish_size?: string;
    final_len?: string;
    hollow_len?: string;
    htc_mtr?: number;
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
      multiple_str,
      mh_od,
      mh_wt,
      mh_l1,
      mh_l2,
      pass_required = 1,
      force = false,

      catg,
      spec,
      grade,
      ibr_status,
      rm_od,
      rm_len_min,
      rm_len_max,
      pm_od,
      pm_wt,
      cust_od,
      cust_wt,
      rolling_wt,
      fe_len,
      be_len,
      req_len_er,
      req_len_min,
      req_len_max,

      tol_od_min,
      tol_od_max,
      tol_wt_min,
      tol_wt_max,
      process_yield_pct,

      // Lifecycle actions
      lifecycle_action,
      revision_reason,
      close_reason,
      actual_pcs,

      child_adjustments = [],
    } = body;

    if (!plan_id) {
      return NextResponse.json({ error: 'Plan ID is required.' }, { status: 400 });
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

    // 2. Parse existing status
    let parsedStatus: any = {};
    try {
      parsedStatus =
        typeof targetPlan.status === 'string'
          ? JSON.parse(targetPlan.status)
          : targetPlan.status || {};
    } catch {}

    // =========================================================================
    // LIFECYCLE ACTION: ISSUE ROLLING PLAN
    // =========================================================================
    if (lifecycle_action === 'ISSUE') {
      const nowIso = new Date().toISOString();
      parsedStatus.lifecycle_status = 'ISSUED';
      parsedStatus.issued_at = nowIso;
      if (parsedStatus.revision_no == null) parsedStatus.revision_no = 0;

      await admin
        .from('rolling_plans')
        .update({
          status: JSON.stringify(parsedStatus),
          updated_at: nowIso,
        })
        .eq('id', targetPlan.id);

      // If master plan, also mark child plans as ISSUED
      if (parsedStatus.is_master) {
        const { data: childPlans } = await admin
          .from('rolling_plans')
          .select('id, status')
          .ilike('plan_no', `${targetPlan.plan_no}-C%`);

        for (const cp of childPlans || []) {
          let cpSt: any = {};
          try { cpSt = typeof cp.status === 'string' ? JSON.parse(cp.status) : cp.status || {}; } catch {}
          cpSt.lifecycle_status = 'ISSUED';
          cpSt.issued_at = nowIso;
          if (cpSt.revision_no == null) cpSt.revision_no = 0;
          await admin.from('rolling_plans').update({ status: JSON.stringify(cpSt), updated_at: nowIso }).eq('id', cp.id);
        }
      }

      return NextResponse.json({
        success: true,
        message: `Plan ${targetPlan.plan_no} has been officially issued to Hot Rolling.`,
        plan_no: targetPlan.plan_no,
        lifecycle_status: 'ISSUED',
      });
    }

    // =========================================================================
    // LIFECYCLE ACTION: CLOSE PLAN FOR PARTIAL QUANTITY (SHORT-CLOSE)
    // =========================================================================
    if (lifecycle_action === 'CLOSE_PARTIAL') {
      const nowIso = new Date().toISOString();
      const actPcs = Math.max(0, Number(actual_pcs || 0));
      const { data: targetWo } = await admin.from('work_orders').select('*').eq('id', targetPlan.work_order_id).single();

      const hl1Num = Number(targetPlan.mh_l1 || targetWo?.l1 || 6.0);
      const hl2Num = Number(targetPlan.mh_l2 || targetWo?.l2 || hl1Num);
      const avgLen = hl1Num > 0 && hl2Num > 0 ? (hl1Num + hl2Num) / 2 : hl1Num;

      const actMtr = Number((actPcs * avgLen).toFixed(2));
      const origMtr = Number(targetPlan.planned_qty || 0);
      const unrolledMtr = Math.max(0, Number((origMtr - actMtr).toFixed(2)));

      parsedStatus.lifecycle_status = 'CLOSED';
      parsedStatus.closed_at = nowIso;
      parsedStatus.closed_reason = close_reason || 'Closed for partial quantity';
      parsedStatus.closed_pcs = actPcs;
      parsedStatus.closed_mtr = actMtr;
      parsedStatus.unrolled_mtr_released = unrolledMtr;
      parsedStatus.planned_pcs = actPcs;
      parsedStatus.planned_mtr = actMtr;

      await admin
        .from('rolling_plans')
        .update({
          planned_qty: actMtr,
          status: JSON.stringify(parsedStatus),
          updated_at: nowIso,
        })
        .eq('id', targetPlan.id);

      // Release unrolled balance back to work order!
      if (targetWo && unrolledMtr > 0) {
        const curBal = Number(targetWo.balance_qty_mtr || 0);
        const newBal = Number((curBal + unrolledMtr).toFixed(2));
        await admin
          .from('work_orders')
          .update({
            balance_qty_mtr: newBal,
            status: newBal > 0 ? 'Pending Plan' : 'Scheduled',
            updated_at: nowIso,
          })
          .eq('id', targetPlan.work_order_id);
      }

      // If master plan, also close linked child plans
      if (parsedStatus.is_master) {
        const { data: childPlans } = await admin
          .from('rolling_plans')
          .select('id, status')
          .ilike('plan_no', `${targetPlan.plan_no}-C%`);

        for (const cp of childPlans || []) {
          let cpSt: any = {};
          try { cpSt = typeof cp.status === 'string' ? JSON.parse(cp.status) : cp.status || {}; } catch {}
          cpSt.lifecycle_status = 'CLOSED';
          cpSt.closed_at = nowIso;
          cpSt.closed_reason = close_reason || 'Closed with master campaign';
          await admin.from('rolling_plans').update({ status: JSON.stringify(cpSt), updated_at: nowIso }).eq('id', cp.id);
        }
      }

      return NextResponse.json({
        success: true,
        message: `Plan ${targetPlan.plan_no} closed for ${actPcs} PCS (${actMtr} M). ${unrolledMtr} M released back to Work Order.`,
        plan_no: targetPlan.plan_no,
        lifecycle_status: 'CLOSED',
        closed_pcs: actPcs,
        closed_mtr: actMtr,
        unrolled_mtr_released: unrolledMtr,
      });
    }

    // 3. For EDIT or REVISE, validate planned_pcs, planned_rolling_date, route_id
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

    // 4. Check if production has already been logged for this work order and route
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

    // 5. Fetch target work order to compute metrics
    const { data: targetWo } = await admin
      .from('work_orders')
      .select('*')
      .eq('id', targetPlan.work_order_id)
      .single();

    // 6. If REVISE, increment revision number and record history
    const isRevision = lifecycle_action === 'REVISE';
    let revisionNo = Number(parsedStatus.revision_no || 0);
    let revisionDate = parsedStatus.revision_date;
    if (isRevision) {
      revisionNo = revisionNo + 1;
      revisionDate = new Date().toISOString();
      parsedStatus.revision_history = parsedStatus.revision_history || [];
      parsedStatus.revision_history.push({
        revision_no: revisionNo,
        revision_date: revisionDate,
        revision_reason: revision_reason || 'Plan specifications revised',
      });
      parsedStatus.lifecycle_status = 'REVISED';
      parsedStatus.revision_no = revisionNo;
      parsedStatus.revision_date = revisionDate;
      parsedStatus.revision_reason = revision_reason || 'Plan specifications revised';
    } else if (!parsedStatus.lifecycle_status) {
      parsedStatus.lifecycle_status = 'DRAFT';
    }

    // Calculate effective normalized specifications
    const rawRmLenMin = rm_len_min != null ? Number(rm_len_min) : (parsedStatus.rm_len_min || parsedStatus.billet?.rm_len_min || 1.890);
    const effRmLenMin = rawRmLenMin > 20 ? Number((rawRmLenMin / 1000).toFixed(3)) : rawRmLenMin;

    const rawRmLenMax = rm_len_max != null ? Number(rm_len_max) : (parsedStatus.rm_len_max || parsedStatus.billet?.rm_len_max || effRmLenMin);
    const effRmLenMax = rawRmLenMax > 20 ? Number((rawRmLenMax / 1000).toFixed(3)) : rawRmLenMax;

    const effRmOd = rm_od != null ? Number(rm_od) : (parsedStatus.rm_od || parsedStatus.billet?.rm_od || 63.0);
    const effWeightKg = Number((((effRmOd * effRmOd * 3.14 * 0.007856) / 4) * effRmLenMin).toFixed(3));
    const effBilletWtWhf = Number((effWeightKg * 0.97).toFixed(3));

    const effCustOd = cust_od != null ? Number(cust_od) : (mh_od != null && Number(mh_od) > 0 ? Number(mh_od) : (parsedStatus.cust_od || Number(targetPlan.mh_od || targetWo?.size_od || 47.0)));
    const effCustWt = cust_wt != null ? Number(cust_wt) : (parsedStatus.cust_wt || Number(targetPlan.mh_wt || targetWo?.size_wt || 6.25));
    const effRollingWt = rolling_wt != null ? Number(rolling_wt) : (mh_wt != null && Number(mh_wt) > 0 ? Number(mh_wt) : (parsedStatus.rolling_wt || effCustWt));

    const effPmOd = pm_od != null ? Number(pm_od) : (parsedStatus.pm_od || 66.0);
    const effPmWt = pm_wt != null ? Number(pm_wt) : (parsedStatus.pm_wt || (effRollingWt > 0.25 ? Number((effRollingWt - 0.25).toFixed(2)) : 6.00));
    const effPmKgMtr = (effPmOd > effPmWt && effPmWt > 0) ? Number(((effPmOd - effPmWt) * effPmWt * 0.02467).toFixed(3)) : 8.88;
    const effPmLen = effPmKgMtr > 0 ? Number((effBilletWtWhf / effPmKgMtr).toFixed(2)) : 5.37;

    const effSmKgMtr = (effCustOd > effCustWt && effCustWt > 0) ? Number(((effCustOd - effCustWt) * effCustWt * 0.02467).toFixed(3)) : 6.28;
    const effWtWbf = effBilletWtWhf;
    const effSmLen = effSmKgMtr > 0 ? Number((effWtWbf / effSmKgMtr).toFixed(2)) : 7.67;

    const effFeLen = fe_len != null ? Number(fe_len) : (parsedStatus.fe_len || 0);
    const effBeLen = be_len != null ? Number(be_len) : (parsedStatus.be_len || 0);
    const effFeWg = Number((effSmKgMtr * effFeLen).toFixed(2));
    const effBeWg = Number((effSmKgMtr * effBeLen).toFixed(2));
    const effEffectiveWg = Number(Math.max(0, effWtWbf - effFeWg - effBeWg).toFixed(2));
    const effEffectiveLen = effSmKgMtr > 0 ? Number((effEffectiveWg / effSmKgMtr).toFixed(2)) : effSmLen;

    const effMinLen = req_len_min != null ? Number(req_len_min) : (mh_l1 != null && Number(mh_l1) > 0 ? Number(mh_l1) : (parsedStatus.req_len_min || Number(targetPlan.mh_l1 || 7.53)));
    const effMaxLen = req_len_max != null ? Number(req_len_max) : (mh_l2 != null && Number(mh_l2) > 0 ? Number(mh_l2) : (parsedStatus.req_len_max || effMinLen));
    const effErStatus = req_len_er || (effMinLen === effMaxLen ? 'EL' : 'RL');

    const effCatg = catg || parsedStatus.catg || 'CDS';
    const effSpec = spec || parsedStatus.spec || targetWo?.specification || 'ASME SA210 Gr.A1';
    const effGrade = grade || parsedStatus.grade || targetWo?.grade || 'SAE-1018';
    const effIbr = ibr_status || parsedStatus.ibr_status || 'IBR';

    const effTolOdMin = tol_od_min != null ? Number(tol_od_min) : (parsedStatus.tolerances?.od_min ?? (effCustOd - 0.4));
    const effTolOdMax = tol_od_max != null ? Number(tol_od_max) : (parsedStatus.tolerances?.od_max ?? (effCustOd + 0.4));
    const effTolWtMin = tol_wt_min != null ? Number(tol_wt_min) : (parsedStatus.tolerances?.wt_min ?? (effCustWt * 0.92));
    const effTolWtMax = tol_wt_max != null ? Number(tol_wt_max) : (parsedStatus.tolerances?.wt_max ?? (effCustWt * 1.1));
    const effYieldPct = process_yield_pct != null ? Number(process_yield_pct) : (parsedStatus.process_yield_pct ?? 95.22);

    const targetAvg = effMinLen > 0 ? effMinLen : 6.0;
    const targetMtr = Number((planned_pcs * targetAvg).toFixed(2));
    const targetMt = Number(
      (Math.max(effCustOd - effRollingWt, 0) * Math.max(effRollingWt, 0) * 0.0246615 * 0.001 * targetMtr).toFixed(3)
    );

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
        mh_od: effCustOd,
        mh_wt: effRollingWt,
        mh_l1: effMinLen,
        mh_l2: effMaxLen,
        pass_required: Number(pass_required) || 1,
        updated_at: new Date().toISOString(),
      };

      // Find all linked child plans by prefix or master_plan_id
      const { data: childPlans } = await admin
        .from('rolling_plans')
        .select('*')
        .ilike('plan_no', `${targetPlan.plan_no}-C%`);

      const updatedChildMetadata: any[] = [];
      const children = childPlans || [];

      for (let cIdx = 0; cIdx < children.length; cIdx++) {
        const cp = children[cIdx];
        const childAdj = child_adjustments?.find(
          (a) => a.plan_id === cp.id || a.work_order_id === cp.work_order_id
        );

        const { data: childWo } = await admin
          .from('work_orders')
          .select('*')
          .eq('id', cp.work_order_id)
          .single();

        let cpStatus: any = {};
        try {
          cpStatus = typeof cp.status === 'string' ? JSON.parse(cp.status) : cp.status || {};
        } catch {}

        const childAvg = effMinLen > 0 ? effMinLen : (Number(childWo?.l1 || 6.0));

        let childPcs: number;
        if (childAdj && Number(childAdj.planned_pcs) > 0) {
          childPcs = Number(childAdj.planned_pcs);
        } else {
          childPcs = Number(cpStatus.planned_pcs) || Math.round(Number(cp.planned_qty || 0) / (childAvg || 1));
        }

        const childMtr = Number((childPcs * childAvg).toFixed(2));
        const childMt = Number(
          (Math.max(effCustOd - effRollingWt, 0) * Math.max(effRollingWt, 0) * 0.0246615 * 0.001 * childMtr).toFixed(3)
        );

        const childUpdateObj: any = {
          planned_qty: childMtr,
          planned_rolling_date,
          process_route_id: route_id,
          multiple: Number(multiple) || 1,
          mh_od: effCustOd,
          mh_wt: effRollingWt,
          mh_l1: effMinLen,
          mh_l2: effMaxLen,
          pass_required: Number(pass_required) || 1,
          updated_at: new Date().toISOString(),
        };

        cpStatus.type = 'MULTI_WO';
        cpStatus.is_child = true;
        cpStatus.master_plan_id = targetPlan.id;
        cpStatus.master_plan_no = targetPlan.plan_no;
        cpStatus.master_wo_id = targetPlan.work_order_id;
        cpStatus.master_wo_no = targetWo?.work_order_no;
        cpStatus.planned_pcs = childPcs;
        cpStatus.planned_mtr = childMtr;
        cpStatus.planned_mt = childMt;
        cpStatus.catg = effCatg;
        cpStatus.hollow_len = `${effMinLen}-${effMaxLen}`;
        if (isRevision) {
          cpStatus.lifecycle_status = 'REVISED';
          cpStatus.revision_no = revisionNo;
          cpStatus.revision_date = revisionDate;
          cpStatus.revision_reason = parsedStatus.revision_reason;
        } else if (parsedStatus.lifecycle_status) {
          cpStatus.lifecycle_status = parsedStatus.lifecycle_status;
        }
        childUpdateObj.status = JSON.stringify(cpStatus);

        await admin.from('rolling_plans').update(childUpdateObj).eq('id', cp.id);

        const existingChildMeta = (parsedStatus.child_work_orders || []).find(
          (c: any) => c.work_order_id === cp.work_order_id || c.plan_id === cp.id
        );

        updatedChildMetadata.push({
          work_order_id: cp.work_order_id,
          work_order_no: childWo?.work_order_no || existingChildMeta?.work_order_no || '',
          customer_name: childWo?.customer_name ?? existingChildMeta?.customer_name ?? null,
          grade: childWo?.grade ?? existingChildMeta?.grade ?? null,
          size_od: childWo?.size_od ?? existingChildMeta?.size_od ?? null,
          size_wt: childWo?.size_wt ?? (existingChildMeta?.size_wt && existingChildMeta.size_wt !== 4.73 ? existingChildMeta.size_wt : null),
          l1: childWo?.l1 ?? existingChildMeta?.l1 ?? null,
          l2: childWo?.l2 ?? existingChildMeta?.l2 ?? null,
          planned_pcs: childPcs,
          planned_mtr: childMtr,
          planned_mt: childMt,
          plan_id: cp.id,
          catg: effCatg,
          finish_size: (childWo?.size_od && childWo?.size_wt)
            ? `${childWo.size_od}x${childWo.size_wt}`
            : (existingChildMeta?.finish_size && !existingChildMeta.finish_size.includes('4.73')
              ? existingChildMeta.finish_size
              : `${childWo?.size_od || targetWo?.size_od || 38.1}x${childWo?.size_wt || targetWo?.size_wt || 4.5}`),
          final_len: existingChildMeta?.final_len || `${childWo?.l1 || 0}-${childWo?.l2 || 0}`,
          hollow_len: `${effMinLen}-${effMaxLen}`,
          htc_mtr: childMtr,
          alloc_tag: existingChildMeta?.alloc_tag || `${cIdx + 1}`,
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

      parsedStatus.catg = effCatg;
      parsedStatus.spec = effSpec;
      parsedStatus.grade = effGrade;
      parsedStatus.ibr_status = effIbr;
      parsedStatus.rm_od = effRmOd;
      parsedStatus.rm_len_min = effRmLenMin;
      parsedStatus.rm_len_max = effRmLenMax;
      parsedStatus.weight_kg = effWeightKg;
      parsedStatus.billet_wt_whf = effBilletWtWhf;
      parsedStatus.pm_od = effPmOd;
      parsedStatus.pm_wt = effPmWt;
      parsedStatus.pm_kg_mtr = effPmKgMtr;
      parsedStatus.pm_len = effPmLen;
      parsedStatus.wt_wbf = effWtWbf;
      parsedStatus.cust_od = effCustOd;
      parsedStatus.cust_wt = effCustWt;
      parsedStatus.rolling_wt = effRollingWt;
      parsedStatus.sm_kg_mtr = effSmKgMtr;
      parsedStatus.sm_len = effSmLen;
      parsedStatus.fe_len = effFeLen;
      parsedStatus.fe_wg = effFeWg;
      parsedStatus.be_len = effBeLen;
      parsedStatus.be_wg = effBeWg;
      parsedStatus.effective_wg = effEffectiveWg;
      parsedStatus.eff_len = effEffectiveLen;
      parsedStatus.req_len_er = effErStatus;
      parsedStatus.req_len_min = effMinLen;
      parsedStatus.req_len_max = effMaxLen;
      parsedStatus.multiple = Number(multiple) || 1;
      parsedStatus.multiple_str = multiple_str || (Number(multiple) === 2 ? '2-Multi' : '1');
      parsedStatus.tolerances = {
        od_min: effTolOdMin,
        od_max: effTolOdMax,
        wt_min: effTolWtMin,
        wt_max: effTolWtMax,
      };
      parsedStatus.process_yield_pct = effYieldPct;

      parsedStatus.billet = {
        rm_od: effRmOd,
        rm_len_min: effRmLenMin,
        rm_len_max: effRmLenMax,
        weight_kg: effWeightKg,
        billet_wt_whf: effBilletWtWhf,
      };
      parsedStatus.piercer_mill = {
        pm_od: effPmOd,
        pm_wt: effPmWt,
        pm_kg_mtr: effPmKgMtr,
        pm_len: effPmLen,
      };
      parsedStatus.sm = {
        wt_wbf: effWtWbf,
        cust_od: effCustOd,
        cust_wt: effCustWt,
        rolling_wt: effRollingWt,
        sm_kg_mtr: effSmKgMtr,
        sm_len: effSmLen,
      };
      parsedStatus.thicken_ends = {
        fe_len: effFeLen,
        fe_wg: effFeWg,
        be_len: effBeLen,
        be_wg: effBeWg,
        effective_wg: effEffectiveWg,
        eff_len: effEffectiveLen,
      };
      parsedStatus.final_length = {
        er: effErStatus,
        min: effMinLen,
        max: effMaxLen,
      };
      parsedStatus.plan_qty = {
        nos: totalCampaignPcs,
        mton: Number(((effWeightKg * totalCampaignPcs) / 1000).toFixed(2)),
      };

      parsedStatus.master_planned_pcs = planned_pcs;
      parsedStatus.master_planned_mtr = targetMtr;
      parsedStatus.master_planned_mt = targetMt;
      parsedStatus.total_group_pcs = totalCampaignPcs;
      parsedStatus.total_group_mtr = totalCampaignMtr;
      parsedStatus.total_group_mt = totalCampaignMt;
      parsedStatus.total_campaign_pcs = totalCampaignPcs;
      parsedStatus.total_campaign_mtr = totalCampaignMtr;
      parsedStatus.total_campaign_mt = totalCampaignMt;
      parsedStatus.master_wt = targetWo?.size_wt ?? (parsedStatus.master_wt && parsedStatus.master_wt !== 4.73 ? parsedStatus.master_wt : 4.5);
      parsedStatus.master_od = targetWo?.size_od ?? (parsedStatus.master_od || 38.1);
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
        mh_od: effCustOd,
        mh_wt: effRollingWt,
        mh_l1: effMinLen,
        mh_l2: effMaxLen,
        pass_required: Number(pass_required) || 1,
        updated_at: new Date().toISOString(),
      };

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
                htc_mtr: targetMtr,
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
      mh_od: effCustOd,
      mh_wt: effRollingWt,
      mh_l1: effMinLen,
      mh_l2: effMaxLen,
      pass_required: Number(pass_required) || 1,
      updated_at: new Date().toISOString(),
    };

    parsedStatus.catg = effCatg;
    parsedStatus.spec = effSpec;
    parsedStatus.grade = effGrade;
    parsedStatus.ibr_status = effIbr;
    parsedStatus.rm_od = effRmOd;
    parsedStatus.rm_len_min = effRmLenMin;
    parsedStatus.rm_len_max = effRmLenMax;
    parsedStatus.weight_kg = effWeightKg;
    parsedStatus.billet_wt_whf = effBilletWtWhf;
    parsedStatus.pm_od = effPmOd;
    parsedStatus.pm_wt = effPmWt;
    parsedStatus.pm_kg_mtr = effPmKgMtr;
    parsedStatus.pm_len = effPmLen;
    parsedStatus.wt_wbf = effWtWbf;
    parsedStatus.cust_od = effCustOd;
    parsedStatus.cust_wt = effCustWt;
    parsedStatus.rolling_wt = effRollingWt;
    parsedStatus.sm_kg_mtr = effSmKgMtr;
    parsedStatus.sm_len = effSmLen;
    parsedStatus.fe_len = effFeLen;
    parsedStatus.fe_wg = effFeWg;
    parsedStatus.be_len = effBeLen;
    parsedStatus.be_wg = effBeWg;
    parsedStatus.effective_wg = effEffectiveWg;
    parsedStatus.eff_len = effEffectiveLen;
    parsedStatus.req_len_er = effErStatus;
    parsedStatus.req_len_min = effMinLen;
    parsedStatus.req_len_max = effMaxLen;
    parsedStatus.multiple = Number(multiple) || 1;
    parsedStatus.multiple_str = multiple_str || (Number(multiple) === 2 ? '2-Multi' : '1');
    parsedStatus.tolerances = {
      od_min: effTolOdMin,
      od_max: effTolOdMax,
      wt_min: effTolWtMin,
      wt_max: effTolWtMax,
    };
    parsedStatus.process_yield_pct = effYieldPct;

    parsedStatus.billet = {
      rm_od: effRmOd,
      rm_len_min: effRmLenMin,
      rm_len_max: effRmLenMax,
      weight_kg: effWeightKg,
      billet_wt_whf: effBilletWtWhf,
    };
    parsedStatus.piercer_mill = {
      pm_od: effPmOd,
      pm_wt: effPmWt,
      pm_kg_mtr: effPmKgMtr,
      pm_len: effPmLen,
    };
    parsedStatus.sm = {
      wt_wbf: effWtWbf,
      cust_od: effCustOd,
      cust_wt: effCustWt,
      rolling_wt: effRollingWt,
      sm_kg_mtr: effSmKgMtr,
      sm_len: effSmLen,
    };
    parsedStatus.thicken_ends = {
      fe_len: effFeLen,
      fe_wg: effFeWg,
      be_len: effBeLen,
      be_wg: effBeWg,
      effective_wg: effEffectiveWg,
      eff_len: effEffectiveLen,
    };
    parsedStatus.final_length = {
      er: effErStatus,
      min: effMinLen,
      max: effMaxLen,
    };
    parsedStatus.plan_qty = {
      nos: planned_pcs,
      mton: Number(((effWeightKg * planned_pcs) / 1000).toFixed(2)),
    };

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

