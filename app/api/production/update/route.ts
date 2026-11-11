import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAuth, isAuthorizedForStation } from '@/lib/supabase/authGuard';
import { attachPcsToRemarks, extractBandSawCutsFromRemarks, extractPcsFromRemarks } from '@/lib/productionUtils';
import { invalidateQueueCache } from '@/lib/cache/queueCache';

export async function POST(req: NextRequest) {
  try {
    const authCheck = await requireAuth(req);
    if ('errorResponse' in authCheck && authCheck.errorResponse) {
      return authCheck.errorResponse;
    }

    const { isAdmin, appUser } = authCheck.auth;
    const isSuperUser =
      String(appUser?.user_group || '').toLowerCase() === 'super_user' ||
      String(appUser?.role || '').toLowerCase() === 'super_user' ||
      String(appUser?.role || '').toLowerCase() === 'manager';

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json({ error: 'Database service is temporarily unavailable.' }, { status: 500 });
    }

    const body = await req.json();
    const {
      id,
      process_date,
      input_qty,
      input_pcs,
      output_qty,
      output_pcs,
      rejection_qty,
      rejection_pcs,
      htc_ok,
      heat_lot_no,
      remarks,
    } = body;

    if (!id) {
      return NextResponse.json({ error: 'Production entry ID is required.' }, { status: 400 });
    }

    // 1. Fetch target log
    const { data: targetLog, error: fetchErr } = await admin
      .from('production_logs')
      .select('*, process_stages(stage_code)')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr) {
      return NextResponse.json({ error: `Failed to load entry: ${fetchErr.message}` }, { status: 500 });
    }

    if (!targetLog) {
      return NextResponse.json({ error: 'Production entry not found.' }, { status: 404 });
    }

    const stageCode = (targetLog.process_stages as any)?.stage_code || '';

    // 2. Permission check for non-admins / non-super-users
    if (!isAdmin && !isSuperUser) {
      if (!isAuthorizedForStation(authCheck.auth, stageCode)) {
        return NextResponse.json(
          { error: `Access Denied: You are not authorized to edit data from work center (${stageCode}).` },
          { status: 403 }
        );
      }

      // Check if downstream or later production exists for this work order
      const { data: laterLogs } = await admin
        .from('production_logs')
        .select('id')
        .eq('work_order_id', targetLog.work_order_id)
        .gt('created_at', targetLog.created_at)
        .limit(1);

      if (laterLogs && laterLogs.length > 0) {
        return NextResponse.json(
          { error: 'Only the latest production entry for this Work Order can be edited by regular operators. Contact an Administrator for override.' },
          { status: 400 }
        );
      }
    }

    // Validate output_qty and output_pcs cannot be <= 0
    if (output_qty !== undefined && Number(output_qty) <= 0) {
      return NextResponse.json(
        { error: 'Production output quantity must be greater than 0.00 m and 0.000 MT.' },
        { status: 400 }
      );
    }
    if (output_pcs !== undefined && Number(output_pcs) <= 0) {
      return NextResponse.json(
        { error: 'Production output pieces must be greater than 0 PCS.' },
        { status: 400 }
      );
    }
    if ((stageCode === 'BAND_SAW' || stageCode === 'IP_CUTTING') && remarks) {
      const { cuts } = extractBandSawCutsFromRemarks(remarks);
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

    if ((stageCode === 'BAND_SAW' || stageCode === 'IP_CUTTING') && output_qty !== undefined && output_pcs !== undefined) {
      const oMtr = Number(output_qty);
      const oPcs = Number(output_pcs);
      if (oPcs > 0 && (oMtr / oPcs) > 15.001) {
        return NextResponse.json(
          { error: `Maximum allowable pipe length at Band Saw is 15.00 MTR (received average ${(oMtr / oPcs).toFixed(2)} MTR).` },
          { status: 400 }
        );
      }
    }

    // Rule: Band Saw input quantity cannot be greater than HT Quantity (or preceding feeder balance) on update
    if (stageCode === 'BAND_SAW' || stageCode === 'IP_CUTTING') {
      const newMotherPcs = remarks ? (extractBandSawCutsFromRemarks(remarks).motherPcs || extractPcsFromRemarks(remarks).pcs) : null;
      const newInputMtr = input_qty !== undefined ? Number(input_qty) : null;

      const origMotherPcs = extractBandSawCutsFromRemarks(targetLog.remarks).motherPcs || extractPcsFromRemarks(targetLog.remarks).pcs || 0;
      const origInputMtr = Number(targetLog.input_qty || 0);

      // Load work order details
      const { data: woData } = await admin
        .from('work_orders')
        .select('id, work_order_no, route_code, process_route, l1, l2, avg_length')
        .eq('id', targetLog.work_order_id)
        .maybeSingle();

      if (woData) {
        const route = (woData.process_route || woData.route_code || 'CDS').toUpperCase();
        const isSsSteel = route.includes('SS') || route.includes('STAINLESS');
        const isCds = route.includes('CDS');
        const isAlloy = route.includes('ALLOY');
        const isIpCutting = stageCode === 'IP_CUTTING';
        const stationName = isIpCutting ? 'IP Cutting' : 'Band Saw';

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
        } else if (isAlloy) {
          feederStageCodes = ['HOLLOW_HEAT_TREATMENT'];
          feederLabel = 'Hollow Heat Treatment Qty';
        } else {
          feederStageCodes = ['HTC', 'ROLLING', 'HOT_ROLLING'];
          feederLabel = 'Rolling HTC OK';
        }

        const { data: stages } = await admin.from('process_stages').select('id, stage_code');
        const sMap = new Map<string, string>();
        (stages || []).forEach((s) => sMap.set(s.stage_code, s.id));

        const feederStageIds = feederStageCodes.map((sc) => sMap.get(sc)).filter(Boolean) as string[];
        const targetStageIds = [stageCode].map((sc) => sMap.get(sc)).filter(Boolean) as string[];

        const { data: woLogs } = await admin
          .from('production_logs')
          .select('id, stage_id, input_qty, output_qty, rejection_qty, htc_ok, remarks')
          .eq('work_order_id', targetLog.work_order_id);

        const feederLogs = (woLogs || []).filter((l) => feederStageIds.includes(l.stage_id));
        const otherBsLogs = (woLogs || []).filter((l) => targetStageIds.includes(l.stage_id) && l.id !== targetLog.id);

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

        // Query approved diversions for this work order at Band Saw / IP Cutting
        const { data: rawDivs } = await admin
          .from('diversion_plans')
          .select('source_wo_id, target_wo_id, diverted_qty, diverted_pcs, work_center, reason, status, ppc_approved_at')
          .or(`target_wo_id.eq.${targetLog.work_order_id},source_wo_id.eq.${targetLog.work_order_id}`);

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

        const approvedDivs = (rawDivs || []).filter(isApprovedDiv);
        const divInLogs = approvedDivs.filter(
          (d) => d.target_wo_id === targetLog.work_order_id && (parseDivStages(d).targetStage === 'BAND_SAW' || parseDivStages(d).targetStage === 'IP_CUTTING')
        );
        const divOutLogs = approvedDivs.filter(
          (d) => d.source_wo_id === targetLog.work_order_id && (parseDivStages(d).sourceStage === 'BAND_SAW' || parseDivStages(d).sourceStage === 'IP_CUTTING')
        );

        const divInMtr = divInLogs.reduce((sum, d) => sum + Number(d.diverted_qty || 0), 0);
        const divInPcs = divInLogs.reduce((sum, d) => {
          if (d.diverted_pcs != null && Number(d.diverted_pcs) > 0) return sum + Number(d.diverted_pcs);
          const pcsMatch = typeof d.reason === 'string' ? d.reason.match(/\[PCS:\s*([0-9]+)\]/i) : null;
          if (pcsMatch) return sum + Number(pcsMatch[1]);
          const dQty = Number(d.diverted_qty || 0);
          return sum + (avgLen > 0 ? Math.round(dQty / avgLen) : 0);
        }, 0);

        const divOutMtr = divOutLogs.reduce((sum, d) => sum + Number(d.diverted_qty || 0), 0);
        const divOutPcs = divOutLogs.reduce((sum, d) => {
          if (d.diverted_pcs != null && Number(d.diverted_pcs) > 0) return sum + Number(d.diverted_pcs);
          const pcsMatch = typeof d.reason === 'string' ? d.reason.match(/\[PCS:\s*([0-9]+)\]/i) : null;
          if (pcsMatch) return sum + Number(pcsMatch[1]);
          const dQty = Number(d.diverted_qty || 0);
          return sum + (avgLen > 0 ? Math.round(dQty / avgLen) : 0);
        }, 0);

        const totalFeederPcs = Math.max(0, feederPcs + divInPcs - divOutPcs);
        const totalFeederMtr = Math.max(0, Number((feederMtr + divInMtr - divOutMtr).toFixed(2)));

        if (divInPcs > 0 && feederPcs === 0) {
          feederLabel = 'Diverted Material In';
        } else if (divInPcs > 0 && feederPcs > 0) {
          feederLabel = `${feederLabel} / Diversion`;
        }

        const otherCutMotherPcs = otherBsLogs.reduce((sum, l) => {
          const { motherPcs } = extractBandSawCutsFromRemarks(l.remarks);
          if (motherPcs && motherPcs > 0) return sum + motherPcs;
          const p = extractPcsFromRemarks(l.remarks).pcs;
          if (p && p > 0) return sum + p;
          const inMtr = Number(l.input_qty || l.output_qty || 0);
          return sum + (avgLen > 0 ? Math.round(inMtr / avgLen) : 0);
        }, 0);

        const otherCutMtr = otherBsLogs.reduce((sum, l) => sum + Number(l.input_qty || l.output_qty || 0), 0);

        const maxAllowedPcs = Math.max(0, totalFeederPcs - otherCutMotherPcs);
        const maxAllowedMtr = Math.max(0, Number((totalFeederMtr - otherCutMtr).toFixed(2)));

        if (newMotherPcs !== null && newMotherPcs > maxAllowedPcs) {
          return NextResponse.json(
            { error: `${stationName} input quantity (${newMotherPcs} PCS) cannot be greater than available ${feederLabel} (${maxAllowedPcs} PCS).` },
            { status: 400 }
          );
        }

        if (newInputMtr !== null && newInputMtr > maxAllowedMtr + 0.5) {
          return NextResponse.json(
            { error: `${stationName} input length (${newInputMtr.toFixed(2)} MTR) cannot be greater than available ${feederLabel} (${maxAllowedMtr.toFixed(2)} MTR).` },
            { status: 400 }
          );
        }
      }
    }

    // 3. Prepare updated fields
    let updatedRemarks = remarks !== undefined ? (remarks?.trim() || null) : targetLog.remarks;

    // Ensure pieces are encoded into remarks if passed explicitly and not yet tagged
    if (output_pcs !== undefined || rejection_pcs !== undefined) {
      const hasCuts = updatedRemarks && updatedRemarks.includes('[CUTS:');
      const hasPcs = updatedRemarks && updatedRemarks.includes('[PCS:');
      if (!hasCuts && !hasPcs) {
        updatedRemarks = attachPcsToRemarks(
          updatedRemarks,
          output_pcs !== undefined && output_pcs !== null ? Number(output_pcs) : null,
          rejection_pcs !== undefined && rejection_pcs !== null ? Number(rejection_pcs) : null
        );
      }
    }

    const updatePayload: Record<string, any> = {
      process_date: process_date || targetLog.process_date,
      output_qty: output_qty !== undefined ? Number(output_qty) : targetLog.output_qty,
      input_qty: input_qty !== undefined
        ? Number(input_qty)
        : (stageCode === 'BAND_SAW' ? targetLog.input_qty : (output_qty !== undefined ? Number(output_qty) : targetLog.input_qty)),
      rejection_qty: rejection_qty !== undefined ? Number(rejection_qty) : targetLog.rejection_qty,
      heat_lot_no: heat_lot_no !== undefined ? (heat_lot_no?.trim() || null) : targetLog.heat_lot_no,
      remarks: updatedRemarks,
    };

    if (stageCode === 'ROLLING' && htc_ok !== undefined) {
      updatePayload.htc_ok = Number(htc_ok || 0);
    }

    const { data: updated, error: updateErr } = await admin
      .from('production_logs')
      .update(updatePayload)
      .eq('id', id)
      .select('id')
      .maybeSingle();

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    // Invalidate queue cache so the next request immediately sees updated WIP balances
    invalidateQueueCache();

    return NextResponse.json({
      success: true,
      message: 'Production entry updated successfully.',
      data: updated,
    });
  } catch (err: any) {
    console.error('Error in /api/production/update:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to update production entry.' },
      { status: 500 }
    );
  }
}
