import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { attachPcsToRemarks, extractPcsFromRemarks, extractBandSawCutsFromRemarks } from '@/lib/productionUtils';
import { requireAuth, isAuthorizedForStation } from '@/lib/supabase/authGuard';
import { invalidateQueueCache } from '@/lib/cache/queueCache';

// Cached detection of native piece columns on production_logs to gracefully fallback if migration 090 hasn't been run
let hasNativePcsColumns: boolean | null = null;

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

    // Verify station authorization for each entry
    for (const item of sanitizedEntries) {
      if (item.stage_code && !isAuthorizedForStation(authCheck.auth, item.stage_code)) {
        return NextResponse.json(
          { error: `Forbidden: You do not have recording permissions for work center '${item.stage_code}'.` },
          { status: 403 }
        );
      }
    }

    // Track batch cumulative pieces per plan/WO for batch-level capping
    const batchPcsByPlan = new Map<string, number>();
    const batchMotherPcsByWo = new Map<string, number>();
    const batchInputMtrByWo = new Map<string, number>();

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

      // Rule: Band Saw input quantity cannot be greater than HT Quantity (or preceding feeder balance)
      if (item.stage_code === 'BAND_SAW' || item.stage_code === 'IP_CUTTING') {
        const { motherPcs: parsedMotherPcs } = extractBandSawCutsFromRemarks(item.remarks);
        const motherPcsNum = parsedMotherPcs && parsedMotherPcs > 0
          ? parsedMotherPcs
          : (extractPcsFromRemarks(item.remarks).pcs || (outPcs > 0 ? outPcs : 0));
        const inputMtrNum = Number(item.input_qty || (outMtr > 0 ? outMtr : 0));

        // Load work order details to check route and dimensions
        const { data: woData } = await admin
          .from('work_orders')
          .select('id, work_order_no, route_code, process_route, l1, l2, avg_length')
          .eq('id', item.work_order_id)
          .maybeSingle();

        if (woData) {
          const route = (woData.process_route || woData.route_code || 'CDS').toUpperCase();
          const isSsSteel = route.includes('SS') || route.includes('STAINLESS');
          const isCds = route.includes('CDS');
          const isAlloy = route.includes('ALLOY');
          const isAlloyHfs = isAlloy && !isCds;
          const isIpCutting = item.stage_code === 'IP_CUTTING';
          const stationName = isIpCutting ? 'IP Cutting' : 'Band Saw';

          // Feeder stage determines available mother pipes:
          // IP_CUTTING -> Pre-draw cut: feeds from Rolling HTC OK (or Hollow HT for ALLOY)
          // BAND_SAW:
          //   CDS / SS_STEEL -> HEAT_TREATMENT
          //   ALLOY_HFS -> HOLLOW_HEAT_TREATMENT
          //   HFS -> HTC or ROLLING
          let feederStageCodes: string[] = [];
          let feederLabel = 'Heat Treatment (HT) Qty';
          if (isIpCutting) {
            if (isAlloy) {
              feederStageCodes = ['HOLLOW_HEAT_TREATMENT'];
              feederLabel = 'Hollow Heat Treatment Qty';
            } else {
              feederStageCodes = ['HTC', 'ROLLING', 'HOT_ROLLING'];
              feederLabel = 'Rolling HTC OK';
            }
          } else if (isSsSteel || isCds) {
            feederStageCodes = ['HEAT_TREATMENT'];
            feederLabel = 'Heat Treatment (HT) Qty';
          } else if (isAlloyHfs) {
            feederStageCodes = ['HOLLOW_HEAT_TREATMENT'];
            feederLabel = 'Hollow Heat Treatment Qty';
          } else {
            feederStageCodes = ['HTC', 'ROLLING', 'HOT_ROLLING'];
            feederLabel = 'Rolling HTC OK';
          }

          const feederStageIds = feederStageCodes.map((sc) => stageMap.get(sc)).filter(Boolean) as string[];
          const targetStageIds = [item.stage_code].map((sc) => stageMap.get(sc)).filter(Boolean) as string[];

          // Fetch feeder logs & existing stage logs for this work order
          const { data: woLogs } = await admin
            .from('production_logs')
            .select('stage_id, input_qty, output_qty, rejection_qty, htc_ok, remarks')
            .eq('work_order_id', item.work_order_id);

          const feederLogs = (woLogs || []).filter((l) => feederStageIds.includes(l.stage_id));
          const existingBsLogs = (woLogs || []).filter((l) => targetStageIds.includes(l.stage_id));

          // Compute feeder incoming pieces & meters
          const avgLen = Number(woData.l1 && woData.l2 ? (woData.l1 + woData.l2) / 2 : woData.l1 || woData.l2 || woData.avg_length || 6.0);

          let feederPcs = 0;
          let feederMtr = 0;
          if (feederStageCodes.includes('HTC') || feederStageCodes.includes('ROLLING')) {
            feederMtr = feederLogs.reduce((sum, l) => {
              const htc = Number(l.htc_ok || 0);
              return sum + (htc > 0 ? htc : Math.max(0, Number(l.output_qty || 0) - Number(l.rejection_qty || 0)));
            }, 0);
            feederPcs = feederLogs.reduce((sum, l) => {
              const p = extractPcsFromRemarks(l.remarks).pcs;
              const rp = extractPcsFromRemarks(l.remarks).rejPcs || 0;
              if (p !== null) return sum + Math.max(0, p - rp);
              const netMtr = Math.max(0, Number(l.output_qty || 0) - Number(l.rejection_qty || 0));
              return sum + (avgLen > 0 ? Math.round(netMtr / avgLen) : 0);
            }, 0);
          } else {
            feederMtr = feederLogs.reduce((sum, l) => sum + Math.max(0, Number(l.output_qty || 0) - Number(l.rejection_qty || 0)), 0);
            feederPcs = feederLogs.reduce((sum, l) => {
              const p = extractPcsFromRemarks(l.remarks).pcs;
              const rp = extractPcsFromRemarks(l.remarks).rejPcs || 0;
              if (p !== null && p > 0) return sum + Math.max(0, p - rp);
              const netMtr = Math.max(0, Number(l.output_qty || 0) - Number(l.rejection_qty || 0));
              return sum + (avgLen > 0 ? Math.round(netMtr / avgLen) : 0);
            }, 0);
          }

          // Also fetch approved diversions involving Band Saw for this work order
          const { data: woDivs } = await admin
            .from('diversion_plans')
            .select('source_wo_id, target_wo_id, diverted_qty, work_center, multiple, reason, status, ppc_approved_at')
            .or(`target_wo_id.eq.${item.work_order_id},source_wo_id.eq.${item.work_order_id}`);

          const parseDivStages = (d: any) => {
            const fromMatch = typeof d.reason === 'string' ? d.reason.match(/\[FROM_STAGE:\s*([A-Z_]+)\]/i) : null;
            const toMatch = typeof d.reason === 'string' ? d.reason.match(/\[TO_STAGE:\s*([A-Z_]+)\]/i) : null;
            const sourceStage = fromMatch ? fromMatch[1].toUpperCase() : (d.work_center || 'ROLLING');
            const targetStage = toMatch ? toMatch[1].toUpperCase() : (d.work_center || 'ROLLING');
            return { sourceStage, targetStage };
          };

          const isApprovedDiv = (d: any) => {
            if (d.status === 'APPROVED') return true;
            if (d.status === 'PENDING_PPC' || d.status === 'REJECTED_BY_PPC' || d.status === 'CANCELLED') return false;
            if (d.ppc_approved_at) return true;
            return true;
          };

          const approvedDivs = (woDivs || []).filter(isApprovedDiv);
          const divInLogs = approvedDivs.filter((d) => d.target_wo_id === item.work_order_id && (parseDivStages(d).targetStage === 'BAND_SAW' || parseDivStages(d).targetStage === 'IP_CUTTING'));
          const divOutLogs = approvedDivs.filter((d) => d.source_wo_id === item.work_order_id && (parseDivStages(d).sourceStage === 'BAND_SAW' || parseDivStages(d).sourceStage === 'IP_CUTTING'));

          const divInMtr = divInLogs.reduce((sum, d) => sum + Number(d.diverted_qty || 0), 0);
          const divInPcs = divInLogs.reduce((sum, d) => {
            const pcsMatch = typeof d.reason === 'string' ? d.reason.match(/\[PCS:\s*([0-9]+)\]/i) : null;
            if (pcsMatch) return sum + Number(pcsMatch[1]);
            const dQty = Number(d.diverted_qty || 0);
            return sum + (avgLen > 0 ? Math.round(dQty / avgLen) : 0);
          }, 0);

          const divOutMtr = divOutLogs.reduce((sum, d) => sum + Number(d.diverted_qty || 0), 0);
          const divOutPcs = divOutLogs.reduce((sum, d) => {
            const pcsMatch = typeof d.reason === 'string' ? d.reason.match(/\[PCS:\s*([0-9]+)\]/i) : null;
            if (pcsMatch) return sum + Number(pcsMatch[1]);
            const dQty = Number(d.diverted_qty || 0);
            return sum + (avgLen > 0 ? Math.round(dQty / avgLen) : 0);
          }, 0);

          const totalFeederPcs = Math.max(0, feederPcs + divInPcs - divOutPcs);
          const totalFeederMtr = Math.max(0, Number((feederMtr + divInMtr - divOutMtr).toFixed(2)));

          // Dynamic feeder label reflecting actual incoming source (HT, HTC, or Diversion)
          if (divInPcs > 0 && feederPcs === 0) {
            feederLabel = 'Diverted Material In';
          } else if (divInPcs > 0 && feederPcs > 0) {
            feederLabel = `${feederLabel} / Diversion`;
          }

          // Compute already processed Band Saw mother pipes & meters
          const alreadyCutMotherPcs = existingBsLogs.reduce((sum, l) => {
            const { motherPcs } = extractBandSawCutsFromRemarks(l.remarks);
            if (motherPcs && motherPcs > 0) return sum + motherPcs;
            const p = extractPcsFromRemarks(l.remarks).pcs;
            if (p && p > 0) return sum + p;
            const inMtr = Number(l.input_qty || l.output_qty || 0);
            return sum + (avgLen > 0 ? Math.round(inMtr / avgLen) : 0);
          }, 0);

          const alreadyCutMtr = existingBsLogs.reduce((sum, l) => sum + Number(l.input_qty || l.output_qty || 0), 0);

          const batchPcsAdded = batchMotherPcsByWo.get(item.work_order_id) || 0;
          const batchMtrAdded = batchInputMtrByWo.get(item.work_order_id) || 0;

          const availFeederPcs = Math.max(0, totalFeederPcs - alreadyCutMotherPcs - batchPcsAdded);
          const availFeederMtr = Math.max(0, Number((totalFeederMtr - alreadyCutMtr - batchMtrAdded).toFixed(2)));

          if (totalFeederPcs <= 0 && totalFeederMtr <= 0) {
            return NextResponse.json(
              { error: `No available ${feederLabel} in queue for ${stationName} cutting (Work Order ${woData.work_order_no}). Material must come from ${isIpCutting ? 'Rolling HTC OK or Diversion' : 'Heat Treatment (HT), Rolling HTC, or Diversion'}.` },
              { status: 400 }
            );
          }

          if (availFeederPcs > 0 && motherPcsNum > availFeederPcs) {
            return NextResponse.json(
              { error: `${stationName} input quantity (${motherPcsNum} PCS) cannot be greater than available ${feederLabel} (${availFeederPcs} PCS) for Work Order ${woData.work_order_no}.` },
              { status: 400 }
            );
          }

          if (availFeederMtr > 0 && inputMtrNum > availFeederMtr + 0.5) {
            return NextResponse.json(
              { error: `${stationName} input length (${inputMtrNum.toFixed(2)} MTR) cannot be greater than available ${feederLabel} (${availFeederMtr.toFixed(2)} MTR) for Work Order ${woData.work_order_no}.` },
              { status: 400 }
            );
          }

          batchMotherPcsByWo.set(item.work_order_id, batchPcsAdded + motherPcsNum);
          batchInputMtrByWo.set(item.work_order_id, batchMtrAdded + inputMtrNum);
        }
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
        const payloadToInsert = hasNativePcsColumns === false ? basePayload : enrichedPayload;
        const resWithPcs = await admin.from('production_logs').insert(payloadToInsert);

        if (resWithPcs.error) {
          // If the column does not exist yet in DB (Postgres 42703 or PostgREST schema cache PGRST204), fallback gracefully to basePayload
          const isMissingCol =
            resWithPcs.error.code === '42703' ||
            resWithPcs.error.code === 'PGRST204' ||
            resWithPcs.error.message?.includes('output_pcs') ||
            resWithPcs.error.message?.includes('schema cache');

          if (isMissingCol && payloadToInsert !== basePayload) {
            hasNativePcsColumns = false;
            const fallbackRes = await admin.from('production_logs').insert(basePayload);
            insertErr = fallbackRes.error;
          } else {
            insertErr = resWithPcs.error;
          }
        } else if (hasNativePcsColumns === null) {
          hasNativePcsColumns = true;
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
          // If production is being recorded at ANY upstream station (Rolling, HTC, Hollow HT, Draw, HT, Band Saw, VDI),
          // the order is actively in progress on the shop floor. Reopen it to 'In Progress' if it was
          // Pending Plan, Scheduled, or prematurely marked Completed.
          await admin
            .from('work_orders')
            .update({ status: 'In Progress', excel_completed: false })
            .eq('id', item.work_order_id)
            .in('status', ['Pending Plan', 'Scheduled', 'Completed']);
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
