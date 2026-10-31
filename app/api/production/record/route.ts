import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { attachPcsToRemarks, extractPcsFromRemarks, extractBandSawCutsFromRemarks } from '@/lib/productionUtils';
import { requireAuth } from '@/lib/supabase/authGuard';
import { invalidateQueueCache } from '@/lib/cache/queueCache';

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
      // Rule: Hollow bank is dedicated yard buffer inventory and not available for production entry
      if (
        item.work_order_id === '00000000-0000-0000-0000-00000000000b' ||
        String(item.work_order_no || '').trim().toUpperCase() === 'HB-BUFFER' ||
        String(item.work_order_no || '').trim().toUpperCase() === 'HOLLOW BANK' ||
        String(item.customer_name || '').trim().toUpperCase().includes('HOLLOW BANK')
      ) {
        return NextResponse.json(
          { error: 'Production entry is not permitted for Hollow bank yard buffer inventory.' },
          { status: 400 }
        );
      }

      const outMtr = Number(item.output_qty || 0);
      const outPcs = Number(item.output_pcs || 0);
      const htcMtr = Number(item.htc_ok || 0);
      const htcPcs = Number(item.htc_ok_pcs || 0);

      // Rule: Production output cannot be 0.00 m or 0 PCS
      if (outMtr <= 0 || outPcs <= 0) {
        return NextResponse.json(
          { error: `Production output must be greater than 0.00 m and 0 PCS (received ${outMtr} m, ${outPcs} PCS).` },
          { status: 400 }
        );
      }

      // Rule: Band Saw cuts cannot have length <= 0
      if ((item.stage_code === 'BAND_SAW' || item.stage_code === 'IP_CUTTING') && item.remarks) {
        const { cuts } = extractBandSawCutsFromRemarks(item.remarks);
        if (cuts && cuts.some((c: any) => Number(c.len || 0) <= 0 || Number(c.pcs || 0) <= 0)) {
          return NextResponse.json(
            { error: 'All Band Saw cut pieces must have a length greater than 0.00 m and piece count ≥ 1.' },
            { status: 400 }
          );
        }
        if (cuts && cuts.some((c: any) => Number(c.len || 0) > 15)) {
          return NextResponse.json(
            { error: 'Maximum allowable pipe length at Band Saw is 15.00 MTR.' },
            { status: 400 }
          );
        }
      }

      if ((item.stage_code === 'BAND_SAW' || item.stage_code === 'IP_CUTTING') && outPcs > 0 && (outMtr / outPcs) > 15.001) {
        return NextResponse.json(
          { error: `Maximum allowable pipe length at Band Saw is 15.00 MTR (received average ${(outMtr / outPcs).toFixed(2)} MTR).` },
          { status: 400 }
        );
      }

      // Rule: Rolling piece count requirement and plan balance capping
      if ((item.stage_code === 'HOT_ROLLING' || item.stage_code === 'ROLLING') && (outMtr > 0 || outPcs > 0)) {
        if (!outPcs || outPcs <= 0 || !Number.isFinite(outPcs)) {
          return NextResponse.json(
            { error: 'Rolling output recording strictly requires entering a valid piece count (Pieces ≥ 1).' },
            { status: 400 }
          );
        }
        // Legacy ROLLING strictly required HTC OK on the same row; HOT_ROLLING records hot rolled output directly
        if (item.stage_code === 'ROLLING' && htcMtr <= 0 && htcPcs <= 0) {
          return NextResponse.json(
            { error: 'Rolling output recording strictly requires entering HTC OK Quantity (Pieces or Meters ≥ 1).' },
            { status: 400 }
          );
        }

        // Rule: Rolling production cannot exceed Rolling Plan QTY (104% limit)
        let planQuery = admin.from('rolling_plans').select('id, planned_qty, status, created_at');
        if (item.rolling_plan_id) {
          planQuery = planQuery.eq('id', item.rolling_plan_id);
        } else if (item.work_order_id) {
          planQuery = planQuery.eq('work_order_id', item.work_order_id).order('created_at', { ascending: false });
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

          // Strictly query logs for this specific rolling plan to ensure limit is restricted by the new plan
          const hotRollingStageId = stageMap.get('HOT_ROLLING');
          const rollingStageId = stageMap.get('ROLLING');
          const rollStageIds = Array.from(new Set([hotRollingStageId, rollingStageId, item.stage_id].filter(Boolean)));

          let existingLogsQuery = admin
            .from('production_logs')
            .select('output_qty, rejection_qty, remarks, rolling_plan_id, created_at')
            .eq('work_order_id', item.work_order_id)
            .in('stage_id', rollStageIds);

          const targetPlanId = item.rolling_plan_id || matchedPlan.id;
          if (targetPlanId) {
            existingLogsQuery = existingLogsQuery.eq('rolling_plan_id', targetPlanId);
          }

          const { data: existingLogs } = await existingLogsQuery;

          let alreadyLoggedPcs = 0;
          for (const el of existingLogs || []) {
            const pInfo = extractPcsFromRemarks(el);
            if (pInfo?.pcs) {
              alreadyLoggedPcs += pInfo.pcs;
            }
          }

          let remainingPcs = Infinity;
          if (planTotalPcs > 0) {
            const maxPlanPcs = Math.round(planTotalPcs * 1.04);
            remainingPcs = Math.max(0, maxPlanPcs - alreadyLoggedPcs - batchAlreadyAdded);
          } else if (Number(matchedPlan.planned_qty || 0) > 0) {
            const avgLen = Number(st.mh_avg_length || st.avg_length || 6.0);
            const estPcs = avgLen > 0 ? Math.round(Number(matchedPlan.planned_qty) / avgLen) : 0;
            if (estPcs > 0) {
              const maxPlanPcs = Math.round(estPcs * 1.04);
              remainingPcs = Math.max(0, maxPlanPcs - alreadyLoggedPcs - batchAlreadyAdded);
            }
          }

          if (remainingPcs !== Infinity && outPcs > remainingPcs) {
            return NextResponse.json(
              { error: `Rolling production (${outPcs} PCS) exceeds remaining Rolling Plan Quantity (104% limit: ${remainingPcs} PCS).` },
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
        let stageId = stageMap.get(item.stage_code);
        if (!stageId && item.stage_code === 'HOT_ROLLING') {
          stageId = stageMap.get('HOT_ROLLING') || stageMap.get('ROLLING');
        }
        if (!stageId && item.stage_code === 'HTC') {
          stageId = stageMap.get('HTC') || stageMap.get('ROLLING');
        }
        if (!stageId && item.stage_code === 'IP_CUTTING') {
          stageId = stageMap.get('IP_CUTTING') || stageMap.get('BAND_SAW');
        }
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

        const basePayload: any = {
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
        };

        const enrichedPayload: any = {
          ...basePayload,
          ...(outputPcs !== null ? { output_pcs: outputPcs } : {}),
          ...(rejPcs !== null ? { rejection_pcs: rejPcs } : {}),
          ...(htcOkPcs !== null ? { htc_ok_pcs: htcOkPcs } : {}),
        };

        let insertErr: any = null;
        const resWithPcs = await admin.from('production_logs').insert(enrichedPayload);
        if (resWithPcs.error) {
          // If the column does not exist yet in DB (code 42703), fallback gracefully to basePayload
          if (resWithPcs.error.code === '42703') {
            const fallbackRes = await admin.from('production_logs').insert(basePayload);
            insertErr = fallbackRes.error;
          } else {
            insertErr = resWithPcs.error;
          }
        }

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
              .select('balance_qty_mtr, status')
              .eq('id', item.work_order_id)
              .single(),
          ]);

          const totalFinished = (finishingLogs ?? []).reduce(
            (sum, l) => sum + Number(l.output_qty || 0),
            0
          );

          // Decouple bundling entry from work order commercial auto-close:
          // Bundling logs the physical bundles and clears Finishing stage WIP,
          // but DOES NOT close the order commercially unless PPC Master Excel authorized completion.
          // If the order was already marked Completed by PPC Excel, keep it Completed; otherwise keep In Progress.
          const wasCompleted = String(woData?.status || '').toLowerCase() === 'completed';
          const newStatus = wasCompleted ? 'Completed' : 'In Progress';

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

    // Invalidate queue cache so the next request immediately sees updated WIP balances
    invalidateQueueCache();

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
