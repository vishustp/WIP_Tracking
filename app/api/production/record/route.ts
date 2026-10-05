import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { attachPcsToRemarks, extractPcsFromRemarks } from '@/lib/productionUtils';
import { requireAuth } from '@/lib/supabase/authGuard';

export async function POST(req: NextRequest) {
  try {
    const authCheck = await requireAuth(req);
    if ('errorResponse' in authCheck && authCheck.errorResponse) {
      return authCheck.errorResponse;
    }
    const userId = authCheck.auth?.user?.id || null;

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json({ error: 'Database service is temporarily unavailable.' }, { status: 500 });
    }
    const body = await req.json();
    const { entries = [], p_process_date } = body;

    if (!Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json({ error: 'No production entries provided.' }, { status: 400 });
    }

    const processDate = p_process_date || new Date().toISOString().slice(0, 10);

    // Get all stages to resolve stage_id for each entry
    const { data: stages, error: stagesErr } = await admin
      .from('process_stages')
      .select('id, stage_code');

    if (stagesErr || !stages) {
      return NextResponse.json({ error: 'Failed to load process stages.' }, { status: 500 });
    }

    const stageMap = new Map<string, string>();
    stages.forEach((s) => stageMap.set(s.stage_code, s.id));

    // Load default process routes in case any entry has missing route_id
    const { data: routes } = await admin.from('process_routes').select('id, route_code');
    const defaultRouteId = routes?.find((r) => r.route_code === 'CDS')?.id || routes?.[0]?.id;

    // Sanitize entries to ensure valid UUIDs and required route_ids
    const sanitizedEntries = await Promise.all(
      entries.map(async (item: any) => {
        let routeId = item.route_id;
        if (!routeId) {
          const { data: rp } = await admin
            .from('rolling_plans')
            .select('process_route_id')
            .eq('work_order_id', item.work_order_id)
            .maybeSingle();
          routeId = rp?.process_route_id || defaultRouteId;
        }
        const normalizedPlanId = item.rolling_plan_id || item.plan_id || null;
        const finalRemarks = attachPcsToRemarks(
          item.remarks,
          Number(item.output_pcs || 0) || null,
          Number(item.rejection_pcs || 0) || null,
          item.input_l1 || null,
          item.input_l2 || null
        );
        return {
          ...item,
          rolling_plan_id: normalizedPlanId,
          route_id: routeId,
          remarks: finalRemarks || null,
          created_by: userId,
        };
      })
    );

    // Track batch cumulative pieces per plan/WO for batch-level capping
    const batchPcsByPlan = new Map<string, number>();

    // Validate server-side business rules
    for (const item of sanitizedEntries) {
      const outMtr = Number(item.output_qty || 0);
      const outPcs = Number(item.output_pcs || 0);
      const htcMtr = Number(item.htc_ok || 0);
      const htcPcs = Number(item.htc_ok_pcs || 0);

      // Rule: Rolling HTC OK strictly required
      if (item.stage_code === 'ROLLING' && (outMtr > 0 || outPcs > 0)) {
        if (!outPcs || outPcs <= 0 || !Number.isFinite(outPcs)) {
          return NextResponse.json(
            { error: 'Rolling output recording strictly requires entering a valid piece count (Pieces ≥ 1).' },
            { status: 400 }
          );
        }
        if (htcMtr <= 0 && htcPcs <= 0) {
          return NextResponse.json(
            { error: 'Rolling output recording strictly requires entering HTC OK Quantity (Pieces or Meters ≥ 1).' },
            { status: 400 }
          );
        }

        // Rule: Rolling production cannot exceed Rolling Plan QTY
        let planQuery = admin.from('rolling_plans').select('id, planned_qty, status');
        if (item.rolling_plan_id) {
          planQuery = planQuery.eq('id', item.rolling_plan_id);
        } else if (item.work_order_id) {
          planQuery = planQuery.eq('work_order_id', item.work_order_id);
        }
        const { data: matchedPlans } = await planQuery.limit(1);
        const matchedPlan = matchedPlans?.[0];
        if (matchedPlan) {
          const planKey = matchedPlan.id;
          const batchAlreadyAdded = batchPcsByPlan.get(planKey) || 0;

          let st: any = {};
          if (typeof matchedPlan.status === 'object' && matchedPlan.status !== null) {
            st = matchedPlan.status;
          } else if (typeof matchedPlan.status === 'string') {
            try {
              st = JSON.parse(matchedPlan.status);
            } catch {
              st = {};
            }
          }
          const planTotalPcs = Number(st.master_planned_pcs || st.planned_pcs || st.plan_qty?.nos || 0);

          let existingLogsQuery = admin
            .from('production_logs')
            .select('output_qty, rejection_qty, remarks, rolling_plan_id')
            .eq('work_order_id', item.work_order_id);

          const rollingStageId = stageMap.get('ROLLING') || item.stage_id;
          if (rollingStageId) {
            existingLogsQuery = existingLogsQuery.eq('stage_id', rollingStageId);
          }
          if (item.rolling_plan_id) {
            existingLogsQuery = existingLogsQuery.or(`rolling_plan_id.eq.${item.rolling_plan_id},rolling_plan_id.is.null`);
          }

          const { data: existingLogs } = await existingLogsQuery;

          let alreadyLoggedPcs = 0;
          for (const el of existingLogs || []) {
            const pInfo = extractPcsFromRemarks(el.remarks);
            if (pInfo?.pcs) {
              alreadyLoggedPcs += pInfo.pcs;
            }
          }

          let remainingPcs = Infinity;
          if (st.balance_to_make_pcs !== undefined && Number(st.balance_to_make_pcs) >= 0) {
            remainingPcs = Math.max(0, Number(st.balance_to_make_pcs) - batchAlreadyAdded);
          } else if (planTotalPcs > 0) {
            remainingPcs = Math.max(0, planTotalPcs - alreadyLoggedPcs - batchAlreadyAdded);
          }

          if (remainingPcs !== Infinity && outPcs > remainingPcs) {
            return NextResponse.json(
              { error: `Rolling production (${outPcs} PCS) exceeds remaining Rolling Plan Quantity (${remainingPcs} PCS).` },
              { status: 400 }
            );
          }

          batchPcsByPlan.set(planKey, batchAlreadyAdded + outPcs);
        }
      }
    }

    const resolvedUserId =
      body.operator_id ||
      body.created_by ||
      userId ||
      authCheck.auth?.appUser?.auth_user_id ||
      authCheck.auth?.appUser?.id ||
      null;

    // Try using record_production_batch first for standard execution
    const { error: rpcError } = await admin.rpc('record_production_batch', {
      entries: sanitizedEntries,
      p_process_date: processDate,
    });

    if (!rpcError) {
      // Ensure newly inserted logs have created_by set to the logged-in operator
      if (resolvedUserId) {
        const woIds = sanitizedEntries.map((e: any) => e.work_order_id);
        await admin
          .from('production_logs')
          .update({ created_by: resolvedUserId })
          .in('work_order_id', woIds)
          .is('created_by', null);
      }
      return NextResponse.json({ success: true, count: sanitizedEntries.length, method: 'rpc' });
    }

    console.warn('record_production_batch returned error, attempting safe fallback insertion:', rpcError.message);

    // Fallback: Process entries concurrently via admin client (essential for Child WO bundling at Finishing)
    let savedCount = 0;
    const errors: string[] = [];

    await Promise.all(
      sanitizedEntries.map(async (item: any) => {
        const stageId = stageMap.get(item.stage_code);
        if (!stageId) {
          errors.push(`Unknown stage code: ${item.stage_code}`);
          return;
        }

        const inputMtr = Number(item.input_qty || 0);
        const outputMtr = Number(item.output_qty || inputMtr);
        const rejMtr = Number(item.rejection_qty || 0);
        const htcOkMtr = Number(item.htc_ok || 0);
        const outputPcs = Number(item.output_pcs || 0) || null;
        const rejPcs = Number(item.rejection_pcs || 0) || null;
        const htcOkPcs = Number(item.htc_ok_pcs || 0) || null;

        const { error: insertErr } = await admin
          .from('production_logs')
          .insert({
            work_order_id: item.work_order_id,
            stage_id: stageId,
            process_route_id: item.route_id,
            rolling_plan_id: item.rolling_plan_id || null,
            process_date: processDate,
            input_qty: inputMtr,
            output_qty: outputMtr,
            rejection_qty: rejMtr,
            htc_ok: htcOkMtr,
            heat_lot_no: item.heat_lot_no || null,
            remarks: item.remarks || null,
            created_by: userId || null,
          });

        if (insertErr) {
          errors.push(`Error for WO ${item.work_order_id}: ${insertErr.message}`);
          return;
        }

        savedCount++;

        // Update work order status
        if (item.stage_code === 'FINISHING') {
          const [{ data: finishingLogs }, { data: woData }] = await Promise.all([
            admin
              .from('production_logs')
              .select('output_qty')
              .eq('work_order_id', item.work_order_id)
              .eq('stage_id', stageId),
            admin
              .from('work_orders')
              .select('balance_qty_mtr')
              .eq('id', item.work_order_id)
              .single(),
          ]);

          const totalFinished = (finishingLogs ?? []).reduce(
            (sum, l) => sum + Number(l.output_qty || 0),
            0
          );

          const targetMtr = Number(woData?.balance_qty_mtr || 0);
          const newStatus = targetMtr > 0 && totalFinished >= targetMtr ? 'Completed' : 'In Progress';

          await admin
            .from('work_orders')
            .update({ status: newStatus })
            .eq('id', item.work_order_id);
        } else {
          await admin
            .from('work_orders')
            .update({ status: 'In Progress' })
            .eq('id', item.work_order_id)
            .in('status', ['Pending Plan', 'Scheduled']);
        }
      })
    );

    if (savedCount === 0 && errors.length > 0) {
      return NextResponse.json({ error: errors.join('; ') }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      count: savedCount,
      warnings: errors.length > 0 ? errors : undefined,
      method: 'admin_direct',
    });
  } catch (error: any) {
    console.error('Production record API error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to record production entries.' },
      { status: 500 }
    );
  }
}
